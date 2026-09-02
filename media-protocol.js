/* cfmedia:// — streams the owner's local media folder to the renderer.
 *
 * The renderer used to get media as an ArrayBuffer over IPC and wrap it in a
 * Blob. That puts the whole file in the JS heap (a 400 MB video costs 400 MB of
 * heap, times every sequence in the project). Serving it over a scheme instead
 * lets Chromium demux straight off disk and seek with byte ranges, so a video
 * source costs effectively nothing.
 *
 * Only folders the owner has actually picked are served, so the scheme can't be
 * turned into an arbitrary-file read.
 */
const fs = require('fs');
const path = require('path');
const { ReadableStream } = require('stream/web');

const MEDIA_EXTS = ['.mp3', '.wav', '.m4a', '.mp4', '.mov', '.aac', '.flac', '.ogg', '.m4v', '.webm'];
const MEDIA_MIME = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v', '.webm': 'video/webm'
};

/* Finder-invisible files must never reach the media library: dotfiles, and the
   AppleDouble sidecars (`._clip.mov`) that macOS leaves on non-HFS volumes —
   those carry a real media extension but are a few KB of metadata. */
function isMediaFile(name) {
  if (!name || name.charAt(0) === '.') return false;
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return MEDIA_EXTS.indexOf(name.slice(dot).toLowerCase()) !== -1;
}

const mediaDirs = new Set();
function addMediaDir(dir) { if (dir) mediaDirs.add(dir); }
function mediaUrl(dir, name) { return 'cfmedia://local/' + encodeURIComponent(path.join(dir, name)); }

/* Privileges must be declared before app ready. */
function registerScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'cfmedia',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true }
  }]);
}

/* Serve a byte range of a file as a web stream.
 *
 * This was Readable.toWeb(), which crashed the main process. Its end-of-stream
 * callback calls controller.close() unconditionally, and close() on an already
 * closed controller throws ERR_INVALID_STATE. So when a fetch was aborted in the
 * same tick that the read finished normally — cancel closes the controller, then
 * the file stream's 'close' fires with no error — the throw surfaced as an
 * uncaught exception and Electron put up "A JavaScript error occurred in the main
 * process". Connecting a media folder loads every sequence at once, which is
 * precisely the pattern that produces those raced aborts.
 *
 * Hand-rolled, the rule is simply: once the controller is finished, never touch
 * it again. `done` is that latch, and it is set before every terminal call. */
function fileStream(full, start, end) {
  const rs = fs.createReadStream(full, { start: start, end: end });
  let done = false;
  return new ReadableStream({
    start(controller) {
      rs.on('data', (chunk) => {
        if (done) return;
        try { controller.enqueue(chunk); }
        catch (_) { done = true; rs.destroy(); return; }   /* consumer went away */
        /* Backpressure: stop reading until the consumer drains the queue,
           so a 4 GB video never lands in memory. */
        if (controller.desiredSize !== null && controller.desiredSize <= 0) rs.pause();
      });
      rs.on('end', () => { if (done) return; done = true; try { controller.close(); } catch (_) {} });
      rs.on('error', (err) => { if (done) return; done = true; try { controller.error(err); } catch (_) {} });
      rs.pause();
    },
    pull() { rs.resume(); },
    cancel() { done = true; rs.destroy(); }
  });
}

/* Must be called after app ready. */
function registerMediaProtocol(protocol) {
  protocol.handle('cfmedia', async (req) => {
    let full;
    try {
      full = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
    } catch (_) {
      return new Response('bad request', { status: 400 });
    }
    if (!mediaDirs.has(path.dirname(full)) || !isMediaFile(path.basename(full))) {
      return new Response('forbidden', { status: 403 });
    }
    let st;
    try { st = await fs.promises.stat(full); } catch (_) { return new Response('not found', { status: 404 }); }
    if (!st.isFile()) return new Response('not found', { status: 404 });

    const type = MEDIA_MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    const body = (start, end) => fileStream(full, start, end);

    /* A zero-byte file — a stalled copy, an iCloud placeholder, a file still being
       written — would ask for bytes 0..-1 and throw ERR_OUT_OF_RANGE inside
       createReadStream. There is nothing to stream, so answer with an empty body
       rather than a failed request. */
    if (st.size === 0) {
      return new Response(null, {
        status: 200,
        headers: { 'Content-Type': type, 'Content-Length': '0', 'Accept-Ranges': 'bytes' }
      });
    }

    /* <video> scrubbing issues range requests — without 206s, seeking is dead. */
    const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get('range') || '').trim());
    if (m && (m[1] || m[2])) {
      let start, end;
      if (m[1]) {
        start = parseInt(m[1], 10);
        end = m[2] ? Math.min(parseInt(m[2], 10), st.size - 1) : st.size - 1;
      } else {
        start = Math.max(0, st.size - parseInt(m[2], 10)); // suffix range: last N bytes
        end = st.size - 1;
      }
      if (start >= st.size || start > end) {
        return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + st.size } });
      }
      return new Response(body(start, end), {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size,
          'Accept-Ranges': 'bytes'
        }
      });
    }
    return new Response(body(0, st.size - 1), {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Length': String(st.size), 'Accept-Ranges': 'bytes' }
    });
  });
}

module.exports = { registerScheme, registerMediaProtocol, addMediaDir, mediaUrl, isMediaFile };
