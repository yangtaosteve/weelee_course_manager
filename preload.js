const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApi", {
  pickDirectory: () => ipcRenderer.invoke("pick-directory"),
  readMarkdownFile: (absolutePath) =>
    ipcRenderer.invoke("read-markdown-file", absolutePath),
  saveMarkdownFile: (absolutePath, content) =>
    ipcRenderer.invoke("save-markdown-file", absolutePath, content),
  swapMarkdownFileOrder: (rootPath, sourcePath, targetPath) =>
    ipcRenderer.invoke("swap-markdown-file-order", rootPath, sourcePath, targetPath),
  deleteMarkdownFile: (rootPath, absolutePath) =>
    ipcRenderer.invoke("delete-markdown-file", rootPath, absolutePath),
});
