const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("fluxDesktop", {
  nowPlaying: () => ipcRenderer.invoke("flux:now-playing"),
  stopReading: () => ipcRenderer.send("flux:stop-reading"),
});
