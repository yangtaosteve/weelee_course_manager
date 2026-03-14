const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

function extractLeadingNumber(filename) {
  const match = path.basename(filename).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function getMarkdownVariant(filename) {
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith(".typesetter_markdown.typesetter.md")) {
    return "typesetter_markdown";
  }
  if (lowerName.endsWith(".splitter.typesetter.md")) {
    return "splitter";
  }
  if (lowerName.endsWith(".write.writer.md")) {
    return "writer";
  }
  if (lowerName.endsWith(".md")) {
    return "md";
  }
  return "";
}

function getBrickConfig(variant) {
  if (variant === "writer") {
    return {
      jsonName: "brick_draft.json",
      arrayKey: "drafts",
    };
  }

  if (variant === "typesetter_markdown") {
    return {
      jsonName: "brick_typesetter.json",
      arrayKey: "post_drafts",
    };
  }

  return null;
}

function stripLeadingNumber(filename) {
  return filename.replace(/^\d+/, "");
}

function compareMarkdownFiles(a, b) {
  const aDir = path.dirname(a.relativePath);
  const bDir = path.dirname(b.relativePath);

  if (aDir !== bDir) {
    return aDir.localeCompare(bDir, "zh-CN");
  }

  const aNumber = extractLeadingNumber(a.name);
  const bNumber = extractLeadingNumber(b.name);

  if (aNumber !== null && bNumber !== null && aNumber !== bNumber) {
    return aNumber - bNumber;
  }

  if (aNumber !== null && bNumber === null) {
    return -1;
  }

  if (aNumber === null && bNumber !== null) {
    return 1;
  }

  return a.name.localeCompare(b.name, "zh-CN", { numeric: true });
}

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

  return files.sort(compareMarkdownFiles);
}

function getVariantFilesInDirectory(files, dirPath, variant) {
  return files
    .filter((file) => path.dirname(file.absolutePath) === dirPath)
    .filter((file) => getMarkdownVariant(file.name) === variant)
    .sort(compareMarkdownFiles);
}

async function syncBrickJsonForVariant(dirPath, variant, filesInVariant) {
  const config = getBrickConfig(variant);
  if (!config) {
    return;
  }

  const jsonPath = path.join(dirPath, config.jsonName);
  let raw;
  try {
    raw = await fs.readFile(jsonPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const data = JSON.parse(raw);
  const entries = Array.isArray(data[config.arrayKey]) ? data[config.arrayKey] : [];
  const byExactName = new Map();
  const bySuffix = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry.content_markdown !== "string") {
      continue;
    }

    byExactName.set(entry.content_markdown, entry);

    const suffix = stripLeadingNumber(entry.content_markdown);
    if (!bySuffix.has(suffix)) {
      bySuffix.set(suffix, []);
    }
    bySuffix.get(suffix).push(entry);
  }

  const usedEntries = new Set();
  const nextEntries = filesInVariant.map((file, index) => {
    let entry = byExactName.get(file.name);

    if (!entry || usedEntries.has(entry)) {
      const suffix = stripLeadingNumber(file.name);
      const candidates = bySuffix.get(suffix) || [];
      entry = candidates.find((candidate) => !usedEntries.has(candidate)) || null;
    }

    usedEntries.add(entry);

    return {
      ...(entry || {}),
      content_markdown: file.name,
      index,
    };
  });

  data[config.arrayKey] = nextEntries;
  await fs.writeFile(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function buildRenamedPath(absolutePath, nextPrefix) {
  const dirname = path.dirname(absolutePath);
  const basename = path.basename(absolutePath);
  const match = basename.match(/^(\d+)(.*)$/);

  if (!match) {
    throw new Error(`文件缺少数字前缀: ${basename}`);
  }

  return path.join(dirname, `${nextPrefix}${match[2]}`);
}

async function swapMarkdownFileOrder(rootPath, sourcePath, targetPath) {
  if (sourcePath === targetPath) {
    return {
      files: await collectMarkdownFiles(rootPath),
      renamedFiles: [],
    };
  }

  const sourceName = path.basename(sourcePath);
  const targetName = path.basename(targetPath);
  const sourceMatch = sourceName.match(/^(\d+)(.*)$/);
  const targetMatch = targetName.match(/^(\d+)(.*)$/);
  const sourceVariant = getMarkdownVariant(sourceName);
  const targetVariant = getMarkdownVariant(targetName);
  const sourceDir = path.dirname(sourcePath);
  const targetDir = path.dirname(targetPath);

  if (!sourceMatch || !targetMatch) {
    throw new Error("只能交换带数字前缀的 Markdown 文件");
  }

  if (!sourceVariant || !targetVariant || sourceVariant !== targetVariant) {
    throw new Error("只能在同类型的 writer/typesetter 文件之间交换顺序");
  }

  if (sourceDir !== targetDir) {
    throw new Error("只能在同一目录内交换顺序");
  }

  const nextSourcePath = buildRenamedPath(sourcePath, targetMatch[1]);
  const nextTargetPath = buildRenamedPath(targetPath, sourceMatch[1]);
  const tempPath = path.join(
    path.dirname(sourcePath),
    `.__swap__${Date.now()}_${Math.random().toString(36).slice(2)}.md`
  );

  await fs.rename(sourcePath, tempPath);
  await fs.rename(targetPath, nextTargetPath);
  await fs.rename(tempPath, nextSourcePath);

  const files = await collectMarkdownFiles(rootPath);
  await syncBrickJsonForVariant(
    sourceDir,
    sourceVariant,
    getVariantFilesInDirectory(files, sourceDir, sourceVariant)
  );

  return {
    files,
    renamedFiles: [
      { oldPath: sourcePath, newPath: nextSourcePath },
      { oldPath: targetPath, newPath: nextTargetPath },
    ],
  };
}

async function deleteMarkdownFile(rootPath, absolutePath) {
  const deletedName = path.basename(absolutePath);
  const deletedNumber = extractLeadingNumber(deletedName);

  if (deletedNumber === null) {
    throw new Error("只能删除带数字前缀的 Markdown 文件");
  }

  const deletedDir = path.dirname(absolutePath);
  const deletedVariant = getMarkdownVariant(deletedName);

  if (
    deletedVariant !== "writer" &&
    deletedVariant !== "typesetter_markdown"
  ) {
    throw new Error("当前只支持删除 writer/typesetter 文件并自动重排");
  }

  await fs.unlink(absolutePath);

  const allFiles = await collectMarkdownFiles(rootPath);
  const siblingFiles = getVariantFilesInDirectory(
    allFiles,
    deletedDir,
    deletedVariant
  ).filter((file) => {
      const number = extractLeadingNumber(file.name);
      return number !== null && number > deletedNumber;
    });

  const renamedFiles = [];
  for (const file of siblingFiles) {
    const oldPath = file.absolutePath;
    const nextNumber = extractLeadingNumber(file.name) - 1;
    const newPath = buildRenamedPath(oldPath, String(nextNumber));
    await fs.rename(oldPath, newPath);
    renamedFiles.push({ oldPath, newPath });
  }

  const files = await collectMarkdownFiles(rootPath);
  await syncBrickJsonForVariant(
    deletedDir,
    deletedVariant,
    getVariantFilesInDirectory(files, deletedDir, deletedVariant)
  );

  return {
    files,
    deletedPath: absolutePath,
    renamedFiles,
  };
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

ipcMain.handle(
  "swap-markdown-file-order",
  async (_event, rootPath, sourcePath, targetPath) =>
    await swapMarkdownFileOrder(rootPath, sourcePath, targetPath)
);

ipcMain.handle(
  "delete-markdown-file",
  async (_event, rootPath, absolutePath) =>
    await deleteMarkdownFile(rootPath, absolutePath)
);

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
