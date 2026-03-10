const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApi", {
  pickDirectory: () => ipcRenderer.invoke("pick-directory"),
  readMarkdownFile: (absolutePath) =>
    ipcRenderer.invoke("read-markdown-file", absolutePath),
  saveMarkdownFile: (absolutePath, content) =>
    ipcRenderer.invoke("save-markdown-file", absolutePath, content),
});
