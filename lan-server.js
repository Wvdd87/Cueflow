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
const path = require('path');
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
  const preferredPort = opts.port || 8420;
  let   getSnapshot = opts.getSnapshot || function () { return null; };
  let   getPins     = opts.getPins || function () { return []; }; // [{pin_hash,role,track_ids,label}]
  const onClientMsg = opts.onClientMsg || function () {};
  const onClientsChange = opts.onClientsChange || function () {};

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
    /* Everything else → the app itself (lets a fresh device cold-join with no internet). */
    fs.readFile(appFile, function (err, buf) {
      if (err) { res.writeHead(500); res.end('app file not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
  });

  function joinedCount() {
    let n = 0; wss.clients.forEach(function (c) { if (c._joined) n++; }); return n;
  }

  const wss = new WebSocketServer({ server });
  wss.on('connection', function (ws) {
    ws._joined = false;
    ws.on('message', function (data) {
      let msg; try { msg = JSON.parse(data.toString()); } catch (e) { return; }
      /* Join handshake — validate the PIN hash against the owner-pushed access list. */
      if (msg && msg.event === 'join') {
        const h = msg.payload && msg.payload.pinHash;
        const pin = (getPins() || []).find(function (p) { return p && p.pin_hash === h; });
        if (pin) {
          ws._joined = true;
          ws._role = pin.role;
          try { ws.send(JSON.stringify({ event: 'joined', payload: { role: pin.role, track_ids: pin.track_ids || null, label: pin.label || pin.role } })); } catch (e) {}
          const snap = getSnapshot();
          if (snap) { try { ws.send(JSON.stringify({ event: 'snapshot', payload: snap })); } catch (e) {} }
          onClientsChange(joinedCount());
        } else {
          try { ws.send(JSON.stringify({ event: 'join_error', payload: { reason: 'bad_pin' } })); } catch (e) {}
        }
        return;
      }
      /* All other messages require a validated session. */
      if (!ws._joined) return;
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
