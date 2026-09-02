/* CueFlow — local-network fallback server (Electron main-process side).
 *
 * Pure Node so it can be unit-tested without Electron. Provides:
 *   • HTTP: serves the app (cold-join), /snapshot (full project data), /health
 *   • WebSocket: realtime relay (tc / flag / proj_sync) owner → viewers
 *
 * When Supabase is unreachable, viewers point their browser at this server
 * (http://<owner-lan-ip>:<port>/?show=…&pin=…&lan=1) and sync over the LAN.
 */
const http = require('http');
const os   = require('os');
const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

/* All non-internal IPv4 addresses of this machine (the URLs to hand to viewers). */
function getLanIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const ni of (ifaces[name] || [])) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

/* Starts the server. Resolves with a handle:
 *   { port, ips, broadcast(msg), clientCount(), setSnapshotSource(fn), stop() }
 * opts:
 *   appFile         absolute path to index.html (served for cold-join)
 *   port            preferred port (auto-increments up to 10 on EADDRINUSE)
 *   getSnapshot     () => latest {showId,name,project_data} | null
 *   onClientMsg     (msg, ws) => void   — viewer → owner messages
 *   onClientsChange (count)   => void
 */
function startLanServer(opts) {
  opts = opts || {};
  const appFile     = opts.appFile || path.join(__dirname, 'index.html');
  const appDir      = path.dirname(appFile);
  const preferredPort = opts.port || 8420;
  let   getSnapshot = opts.getSnapshot || function () { return null; };
  let   getPins     = opts.getPins || function () { return []; }; // [{pin_hash,role,track_ids,label}]
  const onClientMsg = opts.onClientMsg || function () {};
  const onClientsChange = opts.onClientsChange || function () {};

  /* App file is ~1.25 MB — serving it raw from disk on every request is the main
     cold-join bottleneck (slow load, and slow enough to trip the viewer's WS join
     timeout on Safari). Cache it in memory + pre-gzip (≈4× smaller), keyed by mtime
     so a rebuilt/edited file refreshes without a restart. */
  let _appCache = null; // { mtimeMs, size, raw, gz, etag }
  function getAppAsset() {
    let st;
    try { st = fs.statSync(appFile); } catch (e) { return null; }
    if (_appCache && _appCache.mtimeMs === st.mtimeMs && _appCache.size === st.size) return _appCache;
    let raw;
    try { raw = fs.readFileSync(appFile); } catch (e) { return null; }
    let gz = null;
    try { gz = zlib.gzipSync(raw, { level: 6 }); } catch (e) {}
    const etag = '"' + st.size.toString(16) + '-' + Math.round(st.mtimeMs).toString(16) + '"';
    _appCache = { mtimeMs: st.mtimeMs, size: st.size, raw: raw, gz: gz, etag: etag };
    return _appCache;
  }

  const server = http.createServer(function (req, res) {
    const url = (req.url || '/').split('?')[0];
    res.setHeader('Access-Control-Allow-Origin', '*'); // viewer page may be a different origin

    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, clients: wss ? wss.clients.size : 0 }));
      return;
    }
    if (url === '/snapshot') {
      const snap = getSnapshot();
      if (snap) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(snap));
      } else {
        res.writeHead(204); res.end();
      }
      return;
    }
    if (url === '/qr') {
      /* QR for an arbitrary URL (the LAN join link), rendered offline as SVG. */
      const q = (req.url.split('?')[1] || '');
      const m = /(?:^|&)text=([^&]*)/.exec(q);
      const text = m ? decodeURIComponent(m[1]) : '';
      if (!text) { res.writeHead(400); res.end('missing text'); return; }
      QRCode.toString(text, { type: 'svg', margin: 1, width: 320 }, function (err, svg) {
        if (err) { res.writeHead(500); res.end('qr error'); return; }
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(svg);
      });
      return;
    }
    /* Static assets that ship beside index.html — the fonts and the icon. Without
       this they fall through to the catch-all below and come back as the app's HTML:
       LAN crew would download the whole page once per font file and still render in
       a system fallback face. Allow-listed extension + basename only, so nothing
       here can walk out of the app directory. */
    if (url.startsWith('/fonts/') || url === '/favicon.png') {
      const name = path.basename(url);
      const ext  = path.extname(name);
      const mime = { '.woff2': 'font/woff2', '.png': 'image/png' }[ext];
      const file = url === '/favicon.png'
        ? path.join(appDir, 'favicon.png')
        : path.join(appDir, 'fonts', name);
      let body = null;
      if (mime) { try { body = fs.readFileSync(file); } catch (e) {} }
      if (body) {
        res.writeHead(200, {
          'Content-Type': mime,
          /* Content-addressed by app version in practice; a font never changes
             under the same name, so let a returning device skip the fetch. */
          'Cache-Control': 'public, max-age=31536000, immutable'
        });
        res.end(body);
        return;
      }
      res.writeHead(404); res.end('not found');
      return;
    }

    /* Everything else → the app itself (lets a fresh device cold-join with no internet). */
    const asset = getAppAsset();
    if (!asset) { res.writeHead(500); res.end('app file not found'); return; }
    /* Revalidate cheaply so a reload doesn't re-download ~1.25 MB every time. */
    if ((req.headers['if-none-match'] || '') === asset.etag) {
      res.writeHead(304, { 'ETag': asset.etag, 'Cache-Control': 'no-cache' });
      res.end();
      return;
    }
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',          // revalidate (ETag) — fresh on app update, no refetch otherwise
      'ETag': asset.etag,
      'Vary': 'Accept-Encoding'
    };
    const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (acceptsGzip && asset.gz) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      res.end(asset.gz);
    } else {
      res.writeHead(200, headers);
      res.end(asset.raw);
    }
  });

  function joinedCount() {
    let n = 0; wss.clients.forEach(function (c) { if (c._joined) n++; }); return n;
  }

  /* PIN brute-force throttle for LAN joins (mirror of the cloud join_show rate limit).
     Per client IP: after 10 failed PINs within 15 min, further attempts are refused
     until the window elapses. In-memory (resets on restart) — fine for a LAN. */
  const JOIN_MAX = 10, JOIN_WINDOW_MS = 15 * 60 * 1000;
  const joinFails = new Map(); // ip -> { count, windowStart }
  function joinLocked(ip) {
    const f = joinFails.get(ip);
    if (!f) return 0;
    if ((Date.now() - f.windowStart) >= JOIN_WINDOW_MS) { joinFails.delete(ip); return 0; }
    return f.count >= JOIN_MAX ? Math.ceil((JOIN_WINDOW_MS - (Date.now() - f.windowStart)) / 1000) : 0;
  }
  function recordJoinFail(ip) {
    const f = joinFails.get(ip);
    if (!f || (Date.now() - f.windowStart) >= JOIN_WINDOW_MS) joinFails.set(ip, { count: 1, windowStart: Date.now() });
    else f.count += 1;
  }

  const wss = new WebSocketServer({ server });
  wss.on('connection', function (ws, req) {
    ws._joined = false;
    ws._ip = (req && req.socket && req.socket.remoteAddress) || 'unknown';
    ws.on('message', function (data) {
      let msg; try { msg = JSON.parse(data.toString()); } catch (e) { return; }
      /* Join handshake — validate against the owner-pushed access list. The viewer
         may send a precomputed pinHash, or the plaintext pin (LAN viewers load over
         http://<ip>, an insecure origin where crypto.subtle is unavailable, so they
         can't hash client-side) — in which case we hash it here with Node crypto.
         Algorithm must match the app's hashPin: sha256(pin) hex, first 16 chars. */
      if (msg && msg.event === 'join') {
        const retry = joinLocked(ws._ip);
        if (retry > 0) {
          try { ws.send(JSON.stringify({ event: 'join_error', payload: { reason: 'rate_limited', retry_after_s: retry } })); } catch (e) {}
          return;
        }
        let h = msg.payload && msg.payload.pinHash;
        if (!h && msg.payload && msg.payload.pin != null) {
          h = crypto.createHash('sha256').update(String(msg.payload.pin)).digest('hex').slice(0, 16);
        }
        const pin = (getPins() || []).find(function (p) { return p && p.pin_hash === h; });
        if (pin) {
          joinFails.delete(ws._ip); // success clears the counter
          ws._joined = true;
          ws._role = pin.role;
          try { ws.send(JSON.stringify({ event: 'joined', payload: { role: pin.role, track_ids: pin.track_ids || null, label: pin.label || pin.role } })); } catch (e) {}
          const snap = getSnapshot();
          if (snap) { try { ws.send(JSON.stringify({ event: 'snapshot', payload: snap })); } catch (e) {} }
          onClientsChange(joinedCount());
        } else {
          recordJoinFail(ws._ip);
          try { ws.send(JSON.stringify({ event: 'join_error', payload: { reason: 'bad_pin' } })); } catch (e) {}
        }
        return;
      }
      /* All other messages require a validated session. Stamp the PIN-validated
         role (authoritative — overrides anything the client put in the payload) so
         the owner can enforce per-role write permissions on inbound messages. */
      if (!ws._joined) return;
      msg._role = ws._role;
      onClientMsg(msg, ws);
    });
    ws.on('close', function () { onClientsChange(joinedCount()); });
    ws.on('error', function () {});
  });

  /* Relay owner → viewers. Only validated (joined) clients receive live data. */
  function broadcast(msg) {
    const s = JSON.stringify(msg);
    wss.clients.forEach(function (c) { if (c._joined && c.readyState === 1) { try { c.send(s); } catch (e) {} } });
  }

  function listen(p, attemptsLeft, cb) {
    function onErr(err) {
      server.removeListener('error', onErr);
      if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) listen(p + 1, attemptsLeft - 1, cb);
      else cb(err);
    }
    server.on('error', onErr);
    server.listen(p, function () { server.removeListener('error', onErr); cb(null, p); });
  }

  return new Promise(function (resolve, reject) {
    listen(preferredPort, 10, function (err, boundPort) {
      if (err) return reject(err);
      resolve({
        port: boundPort,
        ips: getLanIPs(),
        broadcast: broadcast,
        clientCount: function () { return joinedCount(); },
        setSnapshotSource: function (fn) { getSnapshot = fn; },
        setPinsSource: function (fn) { getPins = fn; },
        stop: function () {
          return new Promise(function (r) {
            try { wss.close(); } catch (e) {}
            server.close(function () { r(); });
          });
        }
      });
    });
  });
}

module.exports = { startLanServer: startLanServer, getLanIPs: getLanIPs };
