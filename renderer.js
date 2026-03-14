const openDirectoryButton = document.getElementById("open-directory");
const fileList = document.getElementById("file-list");
const fileFilter = document.getElementById("file-filter");
const directoryPathLabel = document.getElementById("directory-path");
const status = document.getElementById("status");
const viewerTitle = document.getElementById("viewer-title");
const viewerPath = document.getElementById("viewer-path");
const saveButton = document.getElementById("save-file");
const deleteButton = document.getElementById("delete-file");
const viewerBody = document.getElementById("viewer-body");
const editorInput = document.getElementById("editor-input");
const previewBody = document.getElementById("preview-body");
const splitter = document.getElementById("splitter");

let markdownFiles = [];
let activeFilePath = "";
let currentDirectoryPath = "";
let draggingFilePath = "";

function isOrderEditingEnabled() {
  return (
    fileFilter.value === "writer" ||
    fileFilter.value === "typesetter_markdown" ||
    fileFilter.value === "splitter"
  );
}

function getFilteredFiles() {
  if (fileFilter.value === "typesetter_markdown") {
    return markdownFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".typesetter_markdown.typesetter.md")
    );
  }

  if (fileFilter.value === "splitter") {
    return markdownFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".splitter.typesetter.md")
    );
  }

  if (fileFilter.value === "writer") {
    return markdownFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".write.writer.md")
    );
  }

  return markdownFiles;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEmpty(message) {
  previewBody.innerHTML = `<div class="empty">${message}</div>`;
}

function renderPreview(markdown) {
  const html = window.marked ? window.marked.parse(markdown) : escapeHtml(markdown);
  previewBody.innerHTML = `<article class="markdown">${html}</article>`;
}

function renderFileList() {
  fileList.innerHTML = "";
  const filteredFiles = getFilteredFiles();

  if (!markdownFiles.length) {
    fileList.innerHTML = '<div class="file-list-empty">当前目录下没有 `.md` 文件</div>';
    return;
  }

  if (!filteredFiles.length) {
    fileList.innerHTML = '<div class="file-list-empty">当前筛选条件下没有匹配的 `.md` 文件</div>';
    return;
  }

  for (const file of filteredFiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-item";
    button.draggable = isOrderEditingEnabled();
    button.dataset.path = file.absolutePath;
    if (file.absolutePath === activeFilePath) {
      button.classList.add("active");
    }
    button.textContent = file.relativePath;
    button.addEventListener("click", () => openFile(file));
    if (isOrderEditingEnabled()) {
      button.addEventListener("dragstart", (event) => {
        draggingFilePath = file.absolutePath;
        button.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", file.absolutePath);
      });
      button.addEventListener("dragend", () => {
        draggingFilePath = "";
        button.classList.remove("dragging");
        clearDropTargets();
      });
      button.addEventListener("dragover", (event) => {
        if (!draggingFilePath || draggingFilePath === file.absolutePath) {
          return;
        }
        event.preventDefault();
        clearDropTargets();
        button.classList.add("drop-target");
        event.dataTransfer.dropEffect = "move";
      });
      button.addEventListener("dragleave", () => {
        button.classList.remove("drop-target");
      });
      button.addEventListener("drop", async (event) => {
        event.preventDefault();
        clearDropTargets();
        button.classList.remove("dragging");
        const sourcePath = draggingFilePath || event.dataTransfer.getData("text/plain");
        draggingFilePath = "";
        if (!sourcePath || sourcePath === file.absolutePath) {
          return;
        }
        await swapFileOrder(sourcePath, file.absolutePath);
      });
    }
    fileList.appendChild(button);
  }
}

function clearDropTargets() {
  for (const item of fileList.querySelectorAll(".drop-target, .dragging")) {
    item.classList.remove("drop-target", "dragging");
  }
}

function syncVisibleFileAfterFilter() {
  const filteredFiles = getFilteredFiles();

  if (!filteredFiles.length) {
    activeFilePath = "";
    viewerTitle.textContent = "未找到匹配文件";
    viewerPath.textContent = "请调整左侧筛选条件";
    editorInput.value = "";
    saveButton.disabled = true;
    deleteButton.disabled = true;
    renderEmpty("当前筛选条件下没有可预览的 Markdown 文件。");
    renderFileList();
    return;
  }

  const currentFileStillVisible = filteredFiles.some(
    (file) => file.absolutePath === activeFilePath
  );

  if (currentFileStillVisible) {
    renderFileList();
    return;
  }

  void openFile(filteredFiles[0]);
}

async function openFile(file) {
  activeFilePath = file.absolutePath;
  renderFileList();
  viewerTitle.textContent = file.name;
  viewerPath.textContent = file.relativePath;
  editorInput.value = "";
  saveButton.disabled = true;
  deleteButton.disabled = true;
  renderEmpty("正在读取文件...");

  try {
    const { content } = await window.electronApi.readMarkdownFile(file.absolutePath);
    editorInput.value = content;
    renderPreview(content);
    saveButton.disabled = false;
    deleteButton.disabled = false;
  } catch (error) {
    renderEmpty(`读取失败：${escapeHtml(error.message || String(error))}`);
  }
}

async function chooseDirectory() {
  status.textContent = "正在选择目录...";

  try {
    const result = await window.electronApi.pickDirectory();
    if (result.canceled) {
      status.textContent = "已取消目录选择";
      return;
    }

    markdownFiles = result.files;
    currentDirectoryPath = result.directoryPath;
    directoryPathLabel.textContent = `当前目录：${result.directoryPath}`;
    activeFilePath = "";
    status.textContent = `${result.directoryPath}，共找到 ${markdownFiles.length} 个 Markdown 文件`;
    renderFileList();

    if (markdownFiles.length) {
      await openFile(markdownFiles[0]);
      return;
    }

    viewerTitle.textContent = "未找到 Markdown 文件";
    viewerPath.textContent = result.directoryPath;
    editorInput.value = "";
    saveButton.disabled = true;
    deleteButton.disabled = true;
    renderEmpty("请重新选择一个包含 `.md` 文件的目录。");
  } catch (error) {
    status.textContent = `目录读取失败：${error.message || String(error)}`;
    directoryPathLabel.textContent = "当前目录：未选择";
    editorInput.value = "";
    saveButton.disabled = true;
    deleteButton.disabled = true;
    renderEmpty("目录读取失败。");
  }
}

function applyRenamedPaths(renamedFiles) {
  if (!renamedFiles.length) {
    return;
  }

  const pathMap = new Map(renamedFiles.map((item) => [item.oldPath, item.newPath]));
  const nextActivePath = pathMap.get(activeFilePath);

  if (nextActivePath) {
    activeFilePath = nextActivePath;
    const activeFile = markdownFiles.find((file) => file.absolutePath === activeFilePath);
    if (activeFile) {
      viewerTitle.textContent = activeFile.name;
      viewerPath.textContent = activeFile.relativePath;
    }
  }
}

async function swapFileOrder(sourcePath, targetPath) {
  if (!currentDirectoryPath) {
    status.textContent = "请先选择目录";
    return;
  }

  status.textContent = "正在交换文件顺序...";

  try {
    const result = await window.electronApi.swapMarkdownFileOrder(
      currentDirectoryPath,
      sourcePath,
      targetPath
    );
    markdownFiles = result.files;
    applyRenamedPaths(result.renamedFiles || []);
    renderFileList();
    status.textContent = "已更新文件顺序";
  } catch (error) {
    status.textContent = `交换失败：${error.message || String(error)}`;
  }
}

function resetViewerToEmpty(message, pathMessage = "请选择左侧 Markdown 文件") {
  activeFilePath = "";
  viewerTitle.textContent = "未打开文件";
  viewerPath.textContent = pathMessage;
  editorInput.value = "";
  saveButton.disabled = true;
  deleteButton.disabled = true;
  renderEmpty(message);
}

async function deleteCurrentFile() {
  if (!currentDirectoryPath || !activeFilePath) {
    status.textContent = "当前没有可删除的文件";
    return;
  }

  const currentFile = markdownFiles.find((file) => file.absolutePath === activeFilePath);
  const previousFilteredFiles = getFilteredFiles();
  const previousIndex = previousFilteredFiles.findIndex(
    (file) => file.absolutePath === activeFilePath
  );
  if (!currentFile) {
    status.textContent = "当前文件不存在";
    return;
  }

  const confirmed = window.confirm(`确认删除 ${currentFile.name} 吗？`);
  if (!confirmed) {
    return;
  }

  saveButton.disabled = true;
  deleteButton.disabled = true;
  status.textContent = "正在删除文件...";

  try {
    const deletedPath = activeFilePath;
    const result = await window.electronApi.deleteMarkdownFile(
      currentDirectoryPath,
      deletedPath
    );
    markdownFiles = result.files;

    const filteredFiles = getFilteredFiles();
    const nextFile =
      filteredFiles[
        Math.min(previousIndex, Math.max(filteredFiles.length - 1, 0))
      ] || null;

    if (nextFile) {
      await openFile(nextFile);
    } else if (markdownFiles.length) {
      resetViewerToEmpty("当前筛选条件下没有可预览的 Markdown 文件。", "请调整左侧筛选条件");
      renderFileList();
    } else {
      resetViewerToEmpty("请重新选择一个包含 `.md` 文件的目录。", currentDirectoryPath);
      renderFileList();
    }

    status.textContent = "已删除文件并重排编号";
  } catch (error) {
    status.textContent = `删除失败：${error.message || String(error)}`;
    deleteButton.disabled = false;
    if (activeFilePath) {
      saveButton.disabled = false;
    }
  }
}

openDirectoryButton.addEventListener("click", chooseDirectory);

fileFilter.addEventListener("change", () => {
  clearDropTargets();
  draggingFilePath = "";
  syncVisibleFileAfterFilter();
});

editorInput.addEventListener("input", (event) => {
  renderPreview(event.target.value);
});

saveButton.addEventListener("click", async () => {
  if (!activeFilePath) {
    status.textContent = "当前没有可保存的文件";
    return;
  }

  saveButton.disabled = true;
  status.textContent = "正在保存...";

  try {
    await window.electronApi.saveMarkdownFile(activeFilePath, editorInput.value);
    status.textContent = `已保存：${viewerPath.textContent}`;
  } catch (error) {
    status.textContent = `保存失败：${error.message || String(error)}`;
  } finally {
    saveButton.disabled = false;
  }
});

deleteButton.addEventListener("click", () => {
  void deleteCurrentFile();
});

function setEditorSizeFromPointer(clientX, clientY) {
  const rect = viewerBody.getBoundingClientRect();
  const splitterHeight = 14;
  const isMobileLayout = window.matchMedia("(max-width: 900px)").matches;

  if (isMobileLayout) {
    const minHeight = 180;
    const availableHeight = rect.height - splitterHeight;
    const rawHeight = clientY - rect.top;
    const clampedHeight = Math.min(
      Math.max(rawHeight, minHeight),
      availableHeight - minHeight
    );
    viewerBody.style.setProperty("--editor-size", `${clampedHeight}px`);
    return;
  }

  const minWidth = 280;
  const availableWidth = rect.width - splitterHeight;
  const rawWidth = clientX - rect.left;
  const clampedWidth = Math.min(
    Math.max(rawWidth, minWidth),
    availableWidth - minWidth
  );
  viewerBody.style.setProperty("--editor-size", `${clampedWidth}px`);
}

splitter.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  splitter.classList.add("dragging");
  splitter.setPointerCapture(event.pointerId);
  setEditorSizeFromPointer(event.clientX, event.clientY);
});

splitter.addEventListener("pointermove", (event) => {
  if (!splitter.classList.contains("dragging")) {
    return;
  }
  setEditorSizeFromPointer(event.clientX, event.clientY);
});

function stopSplitterDrag(event) {
  if (!splitter.classList.contains("dragging")) {
    return;
  }
  splitter.classList.remove("dragging");
  if (event?.pointerId !== undefined && splitter.hasPointerCapture(event.pointerId)) {
    splitter.releasePointerCapture(event.pointerId);
  }
}

splitter.addEventListener("pointerup", stopSplitterDrag);
splitter.addEventListener("pointercancel", stopSplitterDrag);
