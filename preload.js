// IONITY preload script.
// Runs in an isolated context with limited Node access (sandbox: true).
// We expose only a tiny, read-only surface to the renderer via contextBridge.

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("ionity", {
  versions: {
    chrome: process.versions.chrome,
    node: process.versions.node,
    electron: process.versions.electron,
  },
  platform: process.platform,
});
