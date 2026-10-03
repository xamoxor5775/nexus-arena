"use strict";
const { contextBridge, ipcRenderer } = require("electron");
// Expose named operations only; never expose ipcRenderer or filesystem access.
contextBridge.exposeInMainWorld("nexusDesktop", Object.freeze({
  toggleFullscreen: () => ipcRenderer.invoke("desktop:fullscreen"),
  quit: () => ipcRenderer.invoke("desktop:quit"),
  onPause: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("desktop:pause", listener);
    return () => ipcRenderer.removeListener("desktop:pause", listener);
  },
}));
