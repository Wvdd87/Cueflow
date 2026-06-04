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
