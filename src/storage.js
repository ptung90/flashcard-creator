// ── IndexedDB helpers ──────────────────────────────────────────────
let _idb = null;
function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((res, rej) => {
    const req = indexedDB.open("fc_db", 1);
    req.onupgradeneeded = (e) =>
      e.target.result.createObjectStore("recents");
    req.onsuccess = (e) => {
      _idb = e.target.result;
      res(_idb);
    };
    req.onerror = () => rej(req.error);
  });
}
async function idbPut(key, val) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("recents", "readwrite");
    tx.objectStore("recents").put(val, key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("recents", "readonly");
    const req = tx.objectStore("recents").get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbDel(key) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("recents", "readwrite");
    tx.objectStore("recents").delete(key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

// ── Recent metadata (localStorage) ────────────────────────────────
function getRecentMeta() {
  try {
    return JSON.parse(localStorage.getItem("fc_recent") || "[]");
  } catch {
    return [];
  }
}
function setRecentMeta(list) {
  try {
    localStorage.setItem("fc_recent", JSON.stringify(list));
  } catch { }
}
async function addToRecent(name, dataObj) {
  const id = "r" + Date.now();
  const meta = getRecentMeta();
  const kept = meta.filter((m) => m.name !== name).slice(0, 4);
  const toDelete = meta
    .filter((m) => m.name !== name)
    .slice(4)
    .map((m) => m.id);
  setRecentMeta([
    {
      id,
      name,
      savedAt: new Date().toISOString(),
      cardCount: (dataObj.cards || []).length,
    },
    ...kept,
  ]);
  await idbPut(id, dataObj).catch(() => { });
  for (const old of toDelete) await idbDel(old).catch(() => { });
}
function formatRelDate(iso) {
  const d = new Date(iso),
    now = new Date(),
    h = (now - d) / 3600000;
  if (h < 0.02) return "Just now";
  if (h < 1) return Math.round(h * 60) + "m ago";
  if (h < 24) return Math.round(h) + "h ago";
  if (h < 48) return "Yesterday";
  return d.toLocaleDateString();
}

// ── Load modal ─────────────────────────────────────────────────────
async function openLoadModal() {
  const folderSection = document.getElementById("load-folder-section");
  const folderList = document.getElementById("load-folder-list");
  const folderNameEl = document.getElementById("load-folder-name");
  if (workDirHandle) {
    folderSection.style.display = "block";
    folderNameEl.textContent = workDirHandle.name;
    folderList.innerHTML = '<div class="recent-empty">Loading…</div>';
    try {
      const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") throw new Error("Permission denied — click Set Folder again");
      const files = [];
      for await (const [name, handle] of workDirHandle.entries()) {
        if (handle.kind === "file" && name.endsWith(".json") && name !== "user-config.json") {
          const file = await handle.getFile();
          let projectName = name;
          try {
            const data = JSON.parse(await file.text());
            projectName = data.project_name || name;
          } catch (_) { }
          files.push({ name, projectName, lastModified: file.lastModified });
        }
      }
      files.sort((a, b) => b.lastModified - a.lastModified);
      if (!files.length) {
        folderList.innerHTML = '<div class="recent-empty">No JSON files in folder</div>';
      } else {
        folderList.innerHTML = files.map((f) => {
          const sn = JSON.stringify(f.name);
          const isActive = f.name === currentFileName;
          return `
                  <div class="recent-item${isActive ? " recent-item--active" : ""}">
                    <div class="recent-item-info">
                      <div class="recent-item-name">${esc(f.projectName)}</div>
                      <div class="recent-item-meta">${esc(f.name)} · ${formatRelDate(f.lastModified)}</div>
                    </div>
                    <div class="recent-item-btns">
                      <button class="btn btn-primary btn-sm" onclick='loadFromFolder(${sn})'>Open</button>
                      <button class="btn btn-danger btn-sm" onclick='deleteFromFolder(${sn},this)'>✕</button>
                    </div>
                  </div>`;
        }).join("");
      }
    } catch (err) {
      folderList.innerHTML = `<div class="recent-empty">${esc(err.message)}</div>`;
    }
  } else {
    folderSection.style.display = "none";
  }

  const meta = getRecentMeta();
  const list = document.getElementById("load-recent-list");
  if (!meta.length) {
    list.innerHTML = '<div class="recent-empty">No recent files — browse a JSON file to get started</div>';
  } else {
    list.innerHTML = meta.map((m) => `
            <div class="recent-item">
              <div class="recent-item-info">
                <div class="recent-item-name">${esc(m.name)}</div>
                <div class="recent-item-meta">${m.cardCount} card${m.cardCount !== 1 ? "s" : ""} · ${formatRelDate(m.savedAt)}</div>
              </div>
              <div class="recent-item-btns">
                <button class="btn btn-primary btn-sm" onclick="loadFromRecent('${m.id}')">Open</button>
                <button class="btn btn-danger btn-sm" onclick="deleteRecentItem('${m.id}',this)">✕</button>
              </div>
            </div>`).join("");
  }
  document.getElementById("load-modal").style.display = "flex";
}
function closeLoadModal() {
  document.getElementById("load-modal").style.display = "none";
}
async function newProject() {
  if (dirty) {
    if (workDirHandle) {
      await _autoSaveToFile();
      if (!confirm("Start a new project? Current project has been saved.")) return;
    } else if (!confirm("Start a new project? Unsaved changes will be lost.")) return;
  }
  state.cards = [];
  state.projectName = "Untitled";
  activeCardId = null;
  currentFileName = null;
  clearDirty();
  closeLoadModal();
  renderSidebar(); renderEditor(); renderPreview();
}
async function loadFromRecent(id) {
  const data = await idbGet(id).catch(() => null);
  if (!data) return alert("Session data not found. It may have been cleared by the browser.");
  applyLoadedData(data);
  closeLoadModal();
}
async function deleteRecentItem(id, btn) {
  const meta = getRecentMeta().filter((m) => m.id !== id);
  setRecentMeta(meta);
  await idbDel(id).catch(() => { });
  btn.closest(".recent-item").remove();
  if (!meta.length) document.getElementById("load-recent-list").innerHTML = '<div class="recent-empty">No recent files</div>';
}

// ── Save / Load JSON ───────────────────────────────────────────────
let workDirHandle = null;
let currentFileName = null;
let dirty = false;
let _autoSaveTimer = null;

function setDirty() {
  dirty = true;
  _updateLabels();
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(_autoSaveToFile, 1500);
}
function clearDirty() {
  dirty = false;
  _updateLabels();
}

let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("fc-toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

async function _autoSaveToFile() {
  if (!workDirHandle || !state.cards.length) return;
  if (!currentFileName) currentFileName = _defaultFileName();
  try {
    const dataObj = _buildDataObj();
    await _writeToDir(currentFileName, JSON.stringify(dataObj, null, 2));
    localStorage.setItem("fc_last_file", currentFileName);
    clearDirty();
    showToast("✓ Saved");
  } catch (_) { }
}

function _updateLabels() {
  const dirLabel = document.getElementById("work-dir-label");
  const pnInput = document.getElementById("project-name-input");
  const dot = document.getElementById("dirty-dot");
  if (dirLabel) dirLabel.textContent = workDirHandle ? workDirHandle.name : "Set Folder";
  if (pnInput && pnInput !== document.activeElement) pnInput.value = state.projectName || "Untitled";
  const fileLabel = document.getElementById("current-file-label");
  if (fileLabel) fileLabel.textContent = currentFileName || "";
  if (dot) dot.style.display = dirty ? "inline" : "none";
}

async function _setWorkDir(handle) {
  workDirHandle = handle;
  await idbPut("_work_dir", handle).catch(() => { });
  _updateLabels();
}

async function setWorkDir() {
  if (!window.showDirectoryPicker) return alert("Browser không hỗ trợ Directory Picker.");
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await _setWorkDir(handle);
    closeLoadModal();
    await openLoadModal();
  } catch (err) {
    if (err.name === "AbortError") return;
    alert("Không thể mở folder: " + (err.message || err.name));
  }
}

async function _writeToDir(fileName, json) {
  const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") throw new Error("Permission denied");
  const fh = await workDirHandle.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(json);
  await w.close();
}

function _fallbackDownload(json, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = name;
  a.click();
}

function _buildDataObj() {
  return { version: "1.0", project_name: state.projectName, ...state };
}

function _defaultFileName() {
  const slug = (state.projectName || "untitled").toLowerCase().trim().replace(/[^a-z0-9À-ɏḀ-ỿ]+/g, "-").replace(/^-|-$/g, "") || "untitled";
  return `${slug}.json`;
}

function _timestampedFileName() {
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mmm = MONTHS[d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  const hhmm = String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
  const slug = (state.projectName || "untitled").toLowerCase().trim().replace(/[^a-z0-9À-ɏḀ-ỿ]+/g, "-").replace(/^-|-$/g, "") || "untitled";
  return `${slug}-${dd}${mmm}${yy}-${hhmm}.json`;
}

async function saveJSON() {
  const dataObj = _buildDataObj();
  const json = JSON.stringify(dataObj, null, 2);
  if (workDirHandle) {
    if (!currentFileName) currentFileName = _defaultFileName();
    try {
      await _writeToDir(currentFileName, json);
      localStorage.setItem("fc_last_file", currentFileName);
      addToRecent(currentFileName, dataObj).catch(() => { });
      clearDirty();
      return;
    } catch (err) { if (err.name === "AbortError") return; }
  }
  await saveJSONAs();
}

async function saveJSONAs() {
  const dataObj = _buildDataObj();
  const json = JSON.stringify(dataObj, null, 2);
  if (workDirHandle) {
    const raw = prompt("File name:", _timestampedFileName());
    if (!raw) return;
    const name = raw.endsWith(".json") ? raw : raw + ".json";
    if (name !== currentFileName) {
      let exists = false;
      try {
        await workDirHandle.getFileHandle(name, { create: false });
        exists = true;
      } catch (e) { if (e.name !== "NotFoundError") exists = true; }
      if (exists && !confirm(`"${name}" already exists. Overwrite?`)) return;
    }
    try {
      await _writeToDir(name, json);
      currentFileName = name;
      localStorage.setItem("fc_last_file", currentFileName);
      addToRecent(name, dataObj).catch(() => { });
      clearDirty();
      return;
    } catch (err) { if (err.name === "AbortError") return; }
  }
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: currentFileName || _defaultFileName(),
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const w = await handle.createWritable();
      await w.write(json);
      await w.close();
      currentFileName = handle.name;
      _updateLabels();
      addToRecent(handle.name, dataObj).catch(() => { });
      return;
    } catch (err) { if (err.name === "AbortError") return; }
  }
  _fallbackDownload(json, currentFileName || "flashcards.json");
  addToRecent(currentFileName || "flashcards.json", dataObj).catch(() => { });
}

async function loadFromFolder(fileName) {
  try {
    const fh = await workDirHandle.getFileHandle(fileName);
    const file = await fh.getFile();
    const data = JSON.parse(await file.text());
    currentFileName = fileName;
    _updateLabels();
    applyLoadedData(data);
    addToRecent(fileName, data).catch(() => { });
    closeLoadModal();
  } catch (err) { alert("Không đọc được file: " + err.message); }
}

async function deleteFromFolder(fileName, btn) {
  if (!confirm("Xóa " + fileName + "?")) return;
  try {
    await workDirHandle.removeEntry(fileName);
    btn.closest(".recent-item").remove();
  } catch (err) { alert("Không xóa được: " + err.message); }
}

async function openFilePicker() {
  if (window.showOpenFilePicker) {
    try {
      const opts = { types: [{ description: "JSON", accept: { "application/json": [".json"] } }] };
      if (workDirHandle) opts.startIn = workDirHandle;
      const [fh] = await window.showOpenFilePicker(opts);
      const file = await fh.getFile();
      const data = JSON.parse(await file.text());
      currentFileName = file.name;
      _updateLabels();
      applyLoadedData(data);
      addToRecent(file.name, data).catch(() => { });
      return;
    } catch (err) { if (err.name === "AbortError") return; }
  }
  document.getElementById("load-file").click();
}

async function restoreWorkDir() {
  try {
    const handle = await idbGet("_work_dir");
    if (!handle) return;
    workDirHandle = handle;
    _updateLabels();
  } catch { }
}

async function _autoRestore() {
  if (!workDirHandle) return;
  const lastFile = localStorage.getItem("fc_last_file");
  if (!lastFile) return;
  try {
    const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
    if (perm === "granted") {
      await _loadFileFromWorkDir(lastFile);
    } else {
      const banner = document.getElementById("fc-restore-banner");
      const label = document.getElementById("fc-restore-label");
      if (banner) {
        label.textContent = "Resume: " + lastFile;
        banner._pendingFile = lastFile;
        banner.style.display = "flex";
      }
    }
  } catch (_) { }
}

async function _loadFileFromWorkDir(fileName) {
  const fh = await workDirHandle.getFileHandle(fileName);
  const file = await fh.getFile();
  const data = JSON.parse(await file.text());
  currentFileName = fileName;
  applyLoadedData(data);
}

async function resumeLastProject() {
  const banner = document.getElementById("fc-restore-banner");
  const fileName = banner && banner._pendingFile;
  if (!fileName || !workDirHandle) return;
  try {
    const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") { alert("Permission denied."); return; }
    await _loadFileFromWorkDir(fileName);
    dismissRestoreBanner();
    renderSidebar(); renderEditor(); renderPreview();
  } catch (e) { alert("Could not load: " + e.message); }
}

function dismissRestoreBanner() {
  const banner = document.getElementById("fc-restore-banner");
  if (banner) banner.style.display = "none";
}

function toggleSidebar() {
  const sidebar = document.getElementById("fc-sidebar");
  const btn = document.getElementById("sidebar-toggle-btn");
  const collapsed = sidebar.classList.toggle("collapsed");
  btn.textContent = collapsed ? "▶" : "◀";
  renderPreview();
}

function applyLoadedData(data) {
  if (data.version && data.version !== "1.0") console.warn("Unknown JSON version:", data.version);
  state.projectName = data.project_name || "Untitled";
  if (data.settings) {
    state.settings = { ...state.settings, ...data.settings };
    const defaultTF = { family: "sans-serif", size: 14, color: "#1a1a1a", lineHeight: 1.0, textAlign: "left" };
    const defaultCF = { family: "sans-serif", size: 12, color: "#1a1a1a", lineHeight: 1.1, textAlign: "left" };
    const oldFont = data.settings.font || {};
    state.settings.titleFont = { ...defaultTF, ...oldFont, ...(data.settings.titleFont || {}) };
    state.settings.contentFont = { ...defaultCF, ...oldFont, ...(data.settings.contentFont || {}) };
    delete state.settings.font;
  }
  if (Array.isArray(data.cards)) {
    state.cards = data.cards.map((c) => {
      const layout = LAYOUTS.includes(c.layout) ? c.layout : "1full";
      return {
        ...c, layout, hideTitle: !!c.hideTitle, titleFont: c.titleFont ?? null, contentFont: c.contentFont ?? null,
        orientation: ["portrait", "landscape"].includes(c.orientation) ? c.orientation : null,
        imageGridSplit: c.imageGridSplit || { ...LAYOUT_SPLIT_DEFAULTS[layout] },
        sections: (c.sections || []).map((s) => ({ id: s.id || uid(), ...s })),
      };
    });
  }
  activeCardId = state.cards.length ? state.cards[0].id : null;
  if (!state.settings.googleFonts) state.settings.googleFonts = [];
  applyGoogleFonts(); applySettingsToUI();
  document.getElementById("fc-custom-css").textContent = state.settings.customCss || "";
  clearDirty(); renderSidebar(); renderEditor(); renderPreview();
}

function loadJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      currentFileName = file.name;
      _updateLabels(); applyLoadedData(data);
      addToRecent(file.name, data).catch(() => { });
    } catch (err) { alert("Invalid JSON file: " + err.message); }
  };
  reader.readAsText(file);
  event.target.value = "";
}