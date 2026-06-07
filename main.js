const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const { startLanServer } = require('./lan-server');

let win = null;
let lan = null;            // LAN server handle (null until started)
let latestSnapshot = null; // {showId, name, project_data} — pushed by the renderer
let latestPins = [];       // [{pin_hash,role,track_ids,label}] — pushed by the renderer

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Cueflow',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  /* Grant the hardware permissions CueFlow needs: MIDI (MTC) and microphone/audio
     input (LTC is decoded from an audio interface via getUserMedia). Everything
     else is denied. Both the request- and check-handlers must allow 'media'/
     'audioCapture' or getUserMedia + enumerateDevices(with labels) fail silently. */
  const ALLOWED = ['midi', 'midiSysex', 'media', 'audioCapture'];
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED.indexOf(permission) !== -1);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ALLOWED.indexOf(permission) !== -1;
  });

  win.loadFile('index.html');
}

function statusObj() {
  return {
    running: !!lan,
    port: lan ? lan.port : null,
    ips: lan ? lan.ips : [],
    clients: lan ? lan.clientCount() : 0
  };
}

function pushStatus() {
  if (win && !win.isDestroyed()) win.webContents.send('lan:status', statusObj());
}

async function startLan() {
  if (lan) return;
  try {
    lan = await startLanServer({
      appFile: path.join(__dirname, 'index.html'),
      port: 8420,
      getSnapshot: () => latestSnapshot,
      getPins: () => latestPins,
      onClientMsg: (msg) => { if (win && !win.isDestroyed()) win.webContents.send('lan:client-msg', msg); },
      onClientsChange: () => pushStatus()
    });
    pushStatus();
    console.log('[CF] LAN server:', lan.ips.map(ip => 'http://' + ip + ':' + lan.port).join('  '));
  } catch (e) {
    console.error('[CF] LAN server failed to start:', e && e.message);
  }
}

/* IPC — renderer side is preload.js (window.cfLAN) */
ipcMain.handle('lan:get-status', () => statusObj());
ipcMain.on('lan:snapshot', (_e, snap) => {
  latestSnapshot = snap;
  /* Push the fresh project to already-joined viewers so LAN edits propagate. */
  if (lan && snap) lan.broadcast({ event: 'snapshot', payload: snap });
});
ipcMain.on('lan:pins', (_e, pins) => { latestPins = Array.isArray(pins) ? pins : []; });
ipcMain.on('lan:broadcast', (_e, msg) => { if (lan && msg) lan.broadcast(msg); });

/* ── Native local-media folder access (owner-only, desktop) ──────────────────
 * The renderer's media library is sourced from a folder the owner picks. These
 * handlers provide the desktop fallback to the browser File System Access API. */
const fs = require('fs');
const MEDIA_EXTS = ['.mp3', '.wav', '.m4a', '.mp4', '.mov', '.aac', '.flac', '.ogg', '.m4v', '.webm'];
function isMediaFile(name) {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return MEDIA_EXTS.indexOf(name.slice(dot).toLowerCase()) !== -1;
}
ipcMain.handle('media:pick-folder', async () => {
  const { dialog } = require('electron');
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose media folder',
    properties: ['openDirectory']
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return { canceled: true };
  const p = res.filePaths[0];
  return { path: p, name: path.basename(p) };
});
ipcMain.handle('media:scan-folder', async (_e, dir) => {
  try {
    const names = await fs.promises.readdir(dir);
    const files = [];
    for (const n of names) {
      if (!isMediaFile(n)) continue;
      try {
        const st = await fs.promises.stat(path.join(dir, n));
        if (st.isFile()) files.push({ name: n, size: st.size });
      } catch (_) { /* skip unreadable entry */ }
    }
    return { ok: true, files: files };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'scan failed', files: [] };
  }
});
ipcMain.handle('media:read-file', async (_e, { path: dir, name }) => {
  /* Guard against path traversal: only read a plain filename inside the folder. */
  if (!name || name.indexOf('/') !== -1 || name.indexOf('\\') !== -1 || name.indexOf('..') !== -1) {
    throw new Error('invalid filename');
  }
  const buf = await fs.promises.readFile(path.join(dir, name));
  /* Return a transferable ArrayBuffer slice (Buffer is a Node view over a pool). */
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

app.whenReady().then(() => {
  createWindow();
  startLan(); // always-on so viewers can connect the moment they need to
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
