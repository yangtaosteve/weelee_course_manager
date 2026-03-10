const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

async function collectMarkdownFiles(dirPath, rootPath = dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(absolutePath, rootPath)));
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") {
      continue;
    }

    files.push({
      name: entry.name,
      absolutePath,
      relativePath: path.relative(rootPath, absolutePath) || entry.name,
    });
  }

  return files.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, "zh-CN")
  );
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("pick-directory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }

  const directoryPath = result.filePaths[0];
  const files = await collectMarkdownFiles(directoryPath);

  return {
    canceled: false,
    directoryPath,
    files,
  };
});

ipcMain.handle("read-markdown-file", async (_event, absolutePath) => {
  const content = await fs.readFile(absolutePath, "utf8");
  return { content };
});

ipcMain.handle("save-markdown-file", async (_event, absolutePath, content) => {
  await fs.writeFile(absolutePath, content, "utf8");
  return { success: true };
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
