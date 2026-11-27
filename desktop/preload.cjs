const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("fluxDesktop", {
  listSources: () => ipcRenderer.invoke("flux:list-sources"),
  selectSource: (id) => ipcRenderer.invoke("flux:select-source", id),
  nowPlaying: () => ipcRenderer.invoke("flux:now-playing"),
  stopReading: () => ipcRenderer.send("flux:stop-reading"),
});
