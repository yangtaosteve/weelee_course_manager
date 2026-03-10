const openDirectoryButton = document.getElementById("open-directory");
const fileList = document.getElementById("file-list");
const status = document.getElementById("status");
const viewerTitle = document.getElementById("viewer-title");
const viewerPath = document.getElementById("viewer-path");
const saveButton = document.getElementById("save-file");
const viewerBody = document.getElementById("viewer-body");
const editorInput = document.getElementById("editor-input");
const previewBody = document.getElementById("preview-body");
const splitter = document.getElementById("splitter");

let markdownFiles = [];
let activeFilePath = "";

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let listType = null;

  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  }

  function flushCodeBlock() {
    if (!inCodeBlock) {
      return;
    }
    html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
    inCodeBlock = false;
    codeBuffer = [];
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeList();
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const blockquote = line.match(/^>\s?(.*)$/);
    if (blockquote) {
      closeList();
      html.push(`<blockquote>${renderInline(blockquote[1])}</blockquote>`);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.*)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  flushCodeBlock();

  return html.join("");
}

function renderEmpty(message) {
  previewBody.innerHTML = `<div class="empty">${message}</div>`;
}

function renderPreview(markdown) {
  previewBody.innerHTML = `<article class="markdown">${renderMarkdown(markdown)}</article>`;
}

function renderFileList() {
  fileList.innerHTML = "";

  if (!markdownFiles.length) {
    fileList.innerHTML = '<div class="file-list-empty">当前目录下没有 `.md` 文件</div>';
    return;
  }

  for (const file of markdownFiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-item";
    if (file.absolutePath === activeFilePath) {
      button.classList.add("active");
    }
    button.textContent = file.relativePath;
    button.addEventListener("click", () => openFile(file));
    fileList.appendChild(button);
  }
}

async function openFile(file) {
  activeFilePath = file.absolutePath;
  renderFileList();
  viewerTitle.textContent = file.name;
  viewerPath.textContent = file.relativePath;
  editorInput.value = "";
  saveButton.disabled = true;
  renderEmpty("正在读取文件...");

  try {
    const { content } = await window.electronApi.readMarkdownFile(file.absolutePath);
    editorInput.value = content;
    renderPreview(content);
    saveButton.disabled = false;
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
    renderEmpty("请重新选择一个包含 `.md` 文件的目录。");
  } catch (error) {
    status.textContent = `目录读取失败：${error.message || String(error)}`;
    editorInput.value = "";
    saveButton.disabled = true;
    renderEmpty("目录读取失败。");
  }
}

openDirectoryButton.addEventListener("click", chooseDirectory);

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

function setEditorHeightFromPointer(clientY) {
  const rect = viewerBody.getBoundingClientRect();
  const splitterHeight = 14;
  const minHeight = 180;
  const availableHeight = rect.height - splitterHeight;
  const rawHeight = clientY - rect.top;
  const clampedHeight = Math.min(
    Math.max(rawHeight, minHeight),
    availableHeight - minHeight
  );
  viewerBody.style.setProperty("--editor-height", `${clampedHeight}px`);
}

splitter.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  splitter.classList.add("dragging");
  splitter.setPointerCapture(event.pointerId);
  setEditorHeightFromPointer(event.clientY);
});

splitter.addEventListener("pointermove", (event) => {
  if (!splitter.classList.contains("dragging")) {
    return;
  }
  setEditorHeightFromPointer(event.clientY);
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
