/* CueFlow Electron preload — safe IPC bridge for the LAN fallback server.
 * Exposes window.cfLAN to the renderer (contextIsolation is ON, so the app
 * cannot require() electron directly). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cfLAN', {
  /* present only in the Electron build — the web app checks for this to know
     whether local-network fallback hosting is available. */
  available: true,

  /* renderer → main */
  getStatus: function () { return ipcRenderer.invoke('lan:get-status'); },
  setSnapshot: function (snap) { ipcRenderer.send('lan:snapshot', snap); },   // latest full project
  setPins: function (pins) { ipcRenderer.send('lan:pins', pins); },           // [{pin_hash,role,track_ids,label}]
  broadcast: function (event, payload) { ipcRenderer.send('lan:broadcast', { event: event, payload: payload }); },

  /* main → renderer */
  onStatus: function (cb) { ipcRenderer.on('lan:status', function (_e, s) { cb(s); }); },
  onClientMsg: function (cb) { ipcRenderer.on('lan:client-msg', function (_e, m) { cb(m); }); }
});

/* Native local-media bridge — owner-only media folder management on the desktop
 * app. Lets the renderer open a real OS folder dialog, scan it for media files,
 * and read a file's bytes. Used as the desktop fallback when the File System
 * Access API (window.showDirectoryPicker) isn't available. */
contextBridge.exposeInMainWorld('cfNativeFs', {
  available: true,
  /* → {canceled} | {path, name} */
  pickMediaFolder: function () { return ipcRenderer.invoke('media:pick-folder'); },
  /* (path) → {ok, files:[{name,size}]} | {ok:false, error} */
  scanMediaFolder: function (path) { return ipcRenderer.invoke('media:scan-folder', path); },
  /* (path, name) → ArrayBuffer (throws if not found) */
  readMediaFile: function (path, name) { return ipcRenderer.invoke('media:read-file', { path: path, name: name }); }
});

/* ── Local rolling backups ───────────────────────────────────────────────────
 * Every save also writes a plain .cueflow file under the app's userData folder,
 * pruned by age rather than by count. This is the copy that survives a bad sync,
 * a lost account or an offline week — none of which the cloud history covers. */
contextBridge.exposeInMainWorld('cfBackup', {
  available: true,
  /* ({showId, json, cues, songs}) → {ok, path} | {ok:false, error} */
  write:  function (a) { return ipcRenderer.invoke('backup:write', a); },
  /* (showId) → {ok, dir, backups:[{name, at, size, songs, cues}]} */
  list:   function (showId) { return ipcRenderer.invoke('backup:list', showId); },
  /* ({showId, name}) → string (the .cueflow JSON) */
  read:   function (a) { return ipcRenderer.invoke('backup:read', a); },
  /* (showId) → opens the folder in Finder, returns its path */
  reveal: function (showId) { return ipcRenderer.invoke('backup:reveal', showId); }
});
