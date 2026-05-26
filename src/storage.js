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
async function addToRecent(name, dataObj, path) {
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
      path: path || name,
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
  _modalSubfolder = currentSubfolder;
  document.getElementById("load-modal").style.display = "flex";
  await _renderFolderSection();
  _renderRecentList();
}

function _renderRecentList() {
  const meta = getRecentMeta();
  const list = document.getElementById("load-recent-list");
  list.innerHTML = meta.length ? meta.map((m) => `
    <div class="recent-item">
      <div class="recent-item-info">
        <div class="recent-item-name">${esc(m.name)}</div>
        <div class="recent-item-meta">${m.path && m.path !== m.name ? `<span class="recent-path">${esc(m.path)}</span> · ` : ""}${m.cardCount} card${m.cardCount !== 1 ? "s" : ""} · ${formatRelDate(m.savedAt)}</div>
      </div>
      <div class="recent-item-btns">
        <button class="btn btn-primary btn-sm" onclick="loadFromRecent('${m.id}')">Open</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteRecentItem('${m.id}',this)"><svg class="icon" style="width:13px;height:13px"><use href="#i-trash"/></svg></button>
      </div>
    </div>`).join("")
    : '<div class="recent-empty">No recent files — browse a JSON file to get started</div>';
}

async function _renderFolderSection() {
  const folderSection = document.getElementById("load-folder-section");
  const folderList = document.getElementById("load-folder-list");
  const breadcrumb = document.getElementById("load-folder-breadcrumb");
  const newFolderBtn = document.getElementById("load-new-folder-btn");

  if (!workDirHandle) { folderSection.style.display = "none"; return; }
  folderSection.style.display = "block";

  if (_modalSubfolder) {
    breadcrumb.innerHTML = `<span class="breadcrumb-back" onclick="browseSubfolder(null)">📁 ${esc(workDirHandle.name)}</span><span class="breadcrumb-sep">›</span><span class="breadcrumb-cur">📁 ${esc(_modalSubfolder)}</span>`;
    newFolderBtn.style.display = "none";
  } else {
    breadcrumb.innerHTML = `<span class="breadcrumb-cur">📁 ${esc(workDirHandle.name)}</span>`;
    newFolderBtn.style.display = "";
  }

  folderList.innerHTML = '<div class="recent-empty">Loading…</div>';
  try {
    const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") throw new Error("Permission denied — click Set Folder again");

    if (_modalSubfolder) {
      // ── Subfolder detail view ─────────────────────────────────────
      const dir = await workDirHandle.getDirectoryHandle(_modalSubfolder);
      const files = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === "file" && name.endsWith(".json") && name !== "user-config.json") {
          const file = await handle.getFile();
          let projectName = name, projectIcon = "🗂️";
          try { const d = JSON.parse(await file.text()); projectName = d.project_name || name; projectIcon = d.project_icon || "🗂️"; } catch (_) {}
          files.push({ name, projectName, projectIcon, lastModified: file.lastModified });
        }
      }
      files.sort((a, b) => b.lastModified - a.lastModified);
      folderList.innerHTML = files.map(f => {
        const sn = JSON.stringify(f.name);
        const isActive = f.name === currentFileName && _modalSubfolder === currentSubfolder;
        return `<div class="recent-item${isActive ? " recent-item--active" : ""}">
          <div class="recent-item-info">
            <div class="recent-item-name">${esc(f.projectIcon)} ${esc(f.projectName)}</div>
            <div class="recent-item-meta">${esc(f.name)} · ${formatRelDate(f.lastModified)}</div>
          </div>
          <div class="recent-item-btns" style="position:relative">
            <button class="btn btn-primary btn-sm" onclick='loadFromFolder(${sn})'>Open</button>
            <button class="btn btn-secondary btn-sm" onclick='showMoveMenu(${sn},this)' title="Move to folder">⇄</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick='deleteFromFolder(${sn},this)'><svg class="icon" style="width:13px;height:13px"><use href="#i-trash"/></svg></button>
          </div>
        </div>`;
      }).join("") || '<div class="recent-empty">Empty folder</div>';

    } else {
      // ── Root view: all subfolders expanded inline ─────────────────
      const subfolders = [], rootFiles = [];
      for await (const [name, handle] of workDirHandle.entries()) {
        if (handle.kind === "directory" && name !== "_backups" && name !== "_library") subfolders.push({ name, handle });
        else if (handle.kind === "file" && name.endsWith(".json") && name !== "user-config.json") {
          const file = await handle.getFile();
          let projectName = name, projectIcon = "🗂️";
          try { const d = JSON.parse(await file.text()); projectName = d.project_name || name; projectIcon = d.project_icon || "🗂️"; } catch (_) {}
          rootFiles.push({ name, projectName, projectIcon, lastModified: file.lastModified });
        }
      }
      const pinnedFolder = localStorage.getItem("fc_pinned_folder");
      subfolders.sort((a, b) => {
        if (a.name === pinnedFolder) return -1;
        if (b.name === pinnedFolder) return 1;
        return a.name.localeCompare(b.name);
      });
      rootFiles.sort((a, b) => b.lastModified - a.lastModified);
      _modalFolders = subfolders.map(s => s.name);

      let html = "";
      for (const sf of subfolders) {
        const sfFiles = [];
        for await (const [name, handle] of sf.handle.entries()) {
          if (handle.kind === "file" && name.endsWith(".json") && name !== "user-config.json") {
            const file = await handle.getFile();
            let projectName = name, projectIcon = "🗂️";
            try { const d = JSON.parse(await file.text()); projectName = d.project_name || name; projectIcon = d.project_icon || "🗂️"; } catch (_) {}
            sfFiles.push({ name, projectName, projectIcon, lastModified: file.lastModified });
          }
        }
        if (!sfFiles.length) continue;
        sfFiles.sort((a, b) => b.lastModified - a.lastModified);
        const isPinned = sf.name === pinnedFolder;
        const sfJson = JSON.stringify(sf.name);
        html += `<div class="folder-group-header${isPinned ? " folder-group-header--pinned" : ""}" onclick='browseSubfolder(${sfJson})'>
          <span class="folder-icon">📁</span>
          <span class="folder-group-name">${esc(sf.name)}</span>
          <button class="folder-pin-btn${isPinned ? " folder-pin-btn--active" : ""}" onclick='event.stopPropagation();togglePinFolder(${sfJson})' title="${isPinned ? "Unpin" : "Pin this folder"}">📌</button>
          <span class="folder-item-arrow">›</span>
        </div>`;
        html += sfFiles.map(f => {
          const isActive = f.name === currentFileName && sf.name === currentSubfolder;
          return `<div class="recent-item folder-group-file${isActive ? " recent-item--active" : ""}">
            <div class="recent-item-info">
              <div class="recent-item-name">${esc(f.projectIcon)} ${esc(f.projectName)}</div>
              <div class="recent-item-meta">${formatRelDate(f.lastModified)}</div>
            </div>
            <div class="recent-item-btns">
              <button class="btn btn-primary btn-sm" onclick='loadFromFolder(${JSON.stringify(f.name)},${JSON.stringify(sf.name)})'>Open</button>
            </div>
          </div>`;
        }).join("");
      }

      // root-level files
      if (rootFiles.length) {
        if (html) html += '<div class="folder-divider"></div>';
        html += rootFiles.map(f => {
          const sn = JSON.stringify(f.name);
          const isActive = f.name === currentFileName && !currentSubfolder;
          return `<div class="recent-item${isActive ? " recent-item--active" : ""}">
            <div class="recent-item-info">
              <div class="recent-item-name">${esc(f.projectIcon)} ${esc(f.projectName)}</div>
              <div class="recent-item-meta">${esc(f.name)} · ${formatRelDate(f.lastModified)}</div>
            </div>
            <div class="recent-item-btns" style="position:relative">
              <button class="btn btn-primary btn-sm" onclick='loadFromFolder(${sn})'>Open</button>
              <button class="btn btn-secondary btn-sm" onclick='showMoveMenu(${sn},this)' title="Move to folder">⇄</button>
              <button class="btn btn-danger btn-sm btn-icon" onclick='deleteFromFolder(${sn},this)'><svg class="icon" style="width:13px;height:13px"><use href="#i-trash"/></svg></button>
            </div>
          </div>`;
        }).join("");
      }

      folderList.innerHTML = html || '<div class="recent-empty">Empty folder</div>';
    }
  } catch (err) {
    folderList.innerHTML = `<div class="recent-empty">${esc(err.message)}</div>`;
  }
}

async function browseSubfolder(name) {
  _modalSubfolder = name;
  await _renderFolderSection();
}

function togglePinFolder(name) {
  const current = localStorage.getItem("fc_pinned_folder");
  if (current === name) localStorage.removeItem("fc_pinned_folder");
  else localStorage.setItem("fc_pinned_folder", name);
  _renderFolderSection();
}

async function createSubfolder() {
  const name = prompt("Folder name:");
  if (!name) return;
  const clean = name.trim().replace(/[\\/:*?"<>|]/g, "");
  if (!clean) return;
  try {
    await workDirHandle.getDirectoryHandle(clean, { create: true });
    await browseSubfolder(clean);
  } catch (e) { alert("Cannot create folder: " + e.message); }
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
  state.cards   = [];
  state.schema  = null;
  state.records = [];
  state.projectName = "Untitled";
  activeCardId = null;
  currentFileName = null;
  currentSubfolder = null;
  closeLoadModal();
  dispatch('INIT_LOAD');
  clearDirty();
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
let currentSubfolder = null;  // null = root, string = subfolder name
let currentFileName = null;
let _modalSubfolder = null;   // browsing state inside load modal
let _modalFolders = [];       // all subfolders, used by move menu
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
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = null;
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
    const path = currentSubfolder ? `${currentSubfolder}/${currentFileName}` : currentFileName;
    localStorage.setItem("fc_last_file", path);
    clearDirty();
    showToast("✓ Saved");
  } catch (_) { }
}

function _updateLabels() {
  const pnInput = document.getElementById("project-name-input");
  const dot = document.getElementById("dirty-dot");
  if (pnInput && pnInput !== document.activeElement) pnInput.value = state.projectName || "Untitled";
  const iconBtn = document.getElementById("project-icon-btn");
  if (iconBtn) iconBtn.textContent = state.projectIcon || "🗂️";
  const loadBtnLabel = document.getElementById("load-btn-label");
  if (loadBtnLabel) loadBtnLabel.textContent = currentSubfolder || "Load";
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

async function _getActiveDirHandle() {
  if (!currentSubfolder) return workDirHandle;
  return await workDirHandle.getDirectoryHandle(currentSubfolder);
}

async function _writeToDir(fileName, json) {
  const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") throw new Error("Permission denied");
  const dir = await _getActiveDirHandle();
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(json);
  await w.truncate(new TextEncoder().encode(json).byteLength);
  await w.close();
}

function _fallbackDownload(json, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = name;
  a.click();
}

function _buildDataObj() {
  return { version: "1.0", project_name: state.projectName, project_icon: state.projectIcon, ...state };
}

// ── Library (shared styles & schemas) ──────────────────────────────
async function _getLibraryDir(type) {
  const lib = await workDirHandle.getDirectoryHandle('_library', { create: true });
  return await lib.getDirectoryHandle(type, { create: true });
}

async function listLibrary(type) {
  if (!workDirHandle) return [];
  try {
    const dir = await _getLibraryDir(type);
    const names = [];
    for await (const [name] of dir.entries()) {
      if (name.endsWith('.json')) names.push(name.replace(/\.json$/i, ''));
    }
    return names.sort();
  } catch (_) { return []; }
}

async function saveToLibrary(type, name, data) {
  const dir = await _getLibraryDir(type);
  const json = JSON.stringify(data, null, 2);
  const fh = await dir.getFileHandle(`${name}.json`, { create: true });
  const w = await fh.createWritable();
  await w.write(json);
  await w.truncate(new TextEncoder().encode(json).byteLength);
  await w.close();
}

async function loadFromLibrary(type, name) {
  const dir = await _getLibraryDir(type);
  const fh = await dir.getFileHandle(`${name}.json`);
  return JSON.parse(await (await fh.getFile()).text());
}

async function deleteFromLibrary(type, name) {
  const dir = await _getLibraryDir(type);
  await dir.removeEntry(`${name}.json`);
}

async function _silentBackup() {
  if (!workDirHandle || !currentFileName) return;
  // Skip if current file is itself a backup (name ends with -YYYY-MM-DD_HHmm.json)
  if (/\-\d{4}-\d{2}-\d{2}_\d{4}\.json$/i.test(currentFileName)) return;
  if (currentSubfolder === '_backups') return;
  try {
    const activeDir = await _getActiveDirHandle();
    const backupDir = await activeDir.getDirectoryHandle('_backups', { create: true });
    const d = new Date();
    const ts = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + '_' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
    const base = currentFileName.replace(/\.json$/i, '');
    const fh = await backupDir.getFileHandle(`${base}-${ts}.json`, { create: true });
    const json = JSON.stringify(_buildDataObj(), null, 2);
    const w = await fh.createWritable();
    await w.write(json);
    await w.truncate(new TextEncoder().encode(json).byteLength);
    await w.close();
    // Prune: keep only the 10 most recent backups for this project
    const prefix = base + '-';
    const old = [];
    for await (const [name] of backupDir.entries()) {
      if (name.startsWith(prefix) && name.endsWith('.json')) old.push(name);
    }
    old.sort();
    for (const name of old.slice(0, -10)) await backupDir.removeEntry(name).catch(() => {});
  } catch (_) { }
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
  if (workDirHandle) {
    await openSaveAsModal();
    return;
  }
  const dataObj = _buildDataObj();
  const json = JSON.stringify(dataObj, null, 2);
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

async function openSaveAsModal() {
  const folderSelect = document.getElementById("save-as-folder");
  const nameInput = document.getElementById("save-as-name");

  // populate folder options
  const subfolders = [];
  try {
    const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
    if (perm === "granted") {
      for await (const [name, handle] of workDirHandle.entries()) {
        if (handle.kind === "directory") subfolders.push(name);
      }
      subfolders.sort((a, b) => a.localeCompare(b));
    }
  } catch (_) {}

  folderSelect.innerHTML = `<option value="">${workDirHandle.name} (root)</option>`
    + subfolders.map(f => `<option value="${esc(f)}"${f === currentSubfolder ? " selected" : ""}>${esc(f)}</option>`).join("");
  if (currentSubfolder) folderSelect.value = currentSubfolder;

  nameInput.value = _timestampedFileName();
  document.getElementById("save-as-modal").style.display = "flex";
  setTimeout(() => nameInput.select(), 50);
}

function closeSaveAsModal() {
  document.getElementById("save-as-modal").style.display = "none";
}

async function executeSaveAs() {
  const folderSelect = document.getElementById("save-as-folder");
  const nameInput = document.getElementById("save-as-name");
  const raw = nameInput.value.trim();
  if (!raw) return;
  const name = raw.endsWith(".json") ? raw : raw + ".json";
  const targetSubfolder = folderSelect.value || null;

  try {
    const dir = targetSubfolder
      ? await workDirHandle.getDirectoryHandle(targetSubfolder)
      : workDirHandle;
    let exists = false;
    try { await dir.getFileHandle(name, { create: false }); exists = true; }
    catch (e) { if (e.name !== "NotFoundError") exists = true; }
    if (exists && !confirm(`"${name}" already exists. Overwrite?`)) return;

    const dataObj = _buildDataObj();
    const json = JSON.stringify(dataObj, null, 2);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(json);
    await w.close();

    currentSubfolder = targetSubfolder;
    currentFileName = name;
    const path = targetSubfolder ? `${targetSubfolder}/${name}` : name;
    localStorage.setItem("fc_last_file", path);
    addToRecent(name, dataObj, path).catch(() => { });
    clearDirty();
    closeSaveAsModal();
  } catch (err) { alert("Save failed: " + err.message); }
}

async function loadFromFolder(fileName, subfolder) {
  const sf = subfolder !== undefined ? subfolder : _modalSubfolder;
  try {
    const dir = sf ? await workDirHandle.getDirectoryHandle(sf) : workDirHandle;
    const fh = await dir.getFileHandle(fileName);
    const file = await fh.getFile();
    const data = JSON.parse(await file.text());
    await _silentBackup();
    currentSubfolder = sf;
    currentFileName = fileName;
    _updateLabels();
    applyLoadedData(data);
    const fullPath = sf ? `${sf}/${fileName}` : fileName;
    addToRecent(fileName, data, fullPath).catch(() => { });
    closeLoadModal();
  } catch (err) { alert("Không đọc được file: " + err.message); }
}

async function deleteFromFolder(fileName, btn) {
  if (!confirm("Xóa " + fileName + "?")) return;
  try {
    const dir = _modalSubfolder
      ? await workDirHandle.getDirectoryHandle(_modalSubfolder)
      : workDirHandle;
    await dir.removeEntry(fileName);
    btn.closest(".recent-item").remove();
  } catch (err) { alert("Không xóa được: " + err.message); }
}

function showMoveMenu(fileName, btn) {
  closeMoveMenu();
  const destinations = [
    ...(_modalSubfolder ? [{ label: "📁 Root", value: null }] : []),
    ..._modalFolders.filter(f => f !== _modalSubfolder).map(f => ({ label: `📁 ${f}`, value: f })),
  ];
  if (!destinations.length) return;
  const menu = document.createElement("div");
  menu.id = "move-menu";
  menu.className = "move-menu";
  menu.innerHTML = destinations.map(d =>
    `<button class="move-menu-item" onclick='_execMove(${JSON.stringify(fileName)},${JSON.stringify(d.value)})'>${esc(d.label)}</button>`
  ).join("");
  menu.addEventListener("click", e => e.stopPropagation());
  btn.after(menu);
  setTimeout(() => document.addEventListener("click", closeMoveMenu, { once: true }), 0);
}

function closeMoveMenu() {
  document.getElementById("move-menu")?.remove();
}

async function _execMove(fileName, destSubfolder) {
  closeMoveMenu();
  try {
    const srcDir = _modalSubfolder
      ? await workDirHandle.getDirectoryHandle(_modalSubfolder)
      : workDirHandle;
    const destDir = destSubfolder
      ? await workDirHandle.getDirectoryHandle(destSubfolder, { create: true })
      : workDirHandle;
    const text = await (await (await srcDir.getFileHandle(fileName)).getFile()).text();
    const writable = await (await destDir.getFileHandle(fileName, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
    await srcDir.removeEntry(fileName);
    if (currentFileName === fileName && currentSubfolder === _modalSubfolder) {
      currentSubfolder = destSubfolder;
      const newPath = destSubfolder ? `${destSubfolder}/${fileName}` : fileName;
      localStorage.setItem("fc_last_file", newPath);
    }
    await _renderFolderSection();
  } catch (err) { alert("Move failed: " + err.message); }
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

async function _loadFileFromWorkDir(path) {
  const parts = path.split("/");
  let dir = workDirHandle;
  let fileName = path;
  if (parts.length === 2) {
    dir = await workDirHandle.getDirectoryHandle(parts[0]);
    fileName = parts[1];
    currentSubfolder = parts[0];
  } else {
    currentSubfolder = null;
  }
  const fh = await dir.getFileHandle(fileName);
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
    dispatch('INIT_LOAD');
  } catch (e) { alert("Could not load: " + e.message); }
}

function dismissRestoreBanner() {
  const banner = document.getElementById("fc-restore-banner");
  if (banner) banner.style.display = "none";
}

function toggleSidebar() {
  const sidebar = document.getElementById("fc-sidebar");
  const btn = document.getElementById("sidebar-toggle-btn");
  if (!sidebar || !btn) return;
  const collapsed = sidebar.classList.toggle("collapsed");
  btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
  btn.title = collapsed ? "Show sidebar" : "Hide sidebar";
  renderPreview();
}

function applyLoadedData(data) {
  if (data.version && data.version !== "1.0") console.warn("Unknown JSON version:", data.version);
  state.projectName = data.project_name || "Untitled";
  state.projectIcon = data.project_icon || "🗂️";
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
        ...c, layout, hideTitle: !!c.hideTitle, hideSectionLabels: !!c.hideSectionLabels, titleFont: c.titleFont ?? null, contentFont: c.contentFont ?? null,
        orientation: ["portrait", "landscape"].includes(c.orientation) ? c.orientation : null,
        imageGridSplit: c.imageGridSplit || { ...LAYOUT_SPLIT_DEFAULTS[layout] },
        sections: (c.sections || []).map((s) => ({ id: s.id || uid(), ...s })),
        recordId:        c.recordId        ?? null,
        templateId:      c.templateId      ?? null,
        paperSize:       c.paperSize       ?? null,
        packedRecordIds: c.packedRecordIds ?? null,
        cssClass:        c.cssClass        ?? '',
      };
    });
  }
  state.schema  = data.schema  ?? null;
  state.records = (Array.isArray(data.records) ? data.records : []).map(r => ({
    id:         r.id ?? ('rec_' + uid()),
    fieldsHash: r.fieldsHash ?? '',
    fields:     r.fields ?? {}
  }));
  activeCardId = state.cards.length ? state.cards[0].id : null;
  if (!state.settings.googleFonts) state.settings.googleFonts = [];
  applyGoogleFonts(); applySettingsToUI();
  document.getElementById("fc-custom-css").textContent = state.settings.customCss || "";
  dispatch('INIT_LOAD');
  clearDirty();
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