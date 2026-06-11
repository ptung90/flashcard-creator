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
      projectName: dataObj.project_name || name,
      projectIcon: dataObj.project_icon || "🗂️",
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

// ── Path helpers ───────────────────────────────────────────────────
async function _getDirFromPath(path) {
  if (!path) return workDirHandle;
  let dir = workDirHandle;
  for (const part of path.split('/')) dir = await dir.getDirectoryHandle(part);
  return dir;
}
function _pathDepth(path) { return path ? path.split('/').length : 0; }
function _pathLeaf(path) { return path ? path.split('/').pop() : (workDirHandle?.name || ''); }

// ── Load modal ─────────────────────────────────────────────────────
export async function openLoadModal() {
  _modalSubfolder = currentSubfolder;
  document.getElementById("load-modal").showModal();
  await _renderFolderSection();
  _renderRecentList();
}

async function _renderRecentList() {
  const meta = getRecentMeta();
  let dirty = false;
  for (const m of meta) {
    if (!m.projectName) {
      const data = await idbGet(m.id).catch(() => null);
      if (data) {
        m.projectName = data.project_name || m.name;
        m.projectIcon = data.project_icon || "🗂️";
        dirty = true;
      }
    }
  }
  if (dirty) setRecentMeta(meta);
  const list = document.getElementById("load-recent-list");
  list.innerHTML = meta.length ? meta.map((m) => `
    <div class="recent-item">
      <div class="recent-item-info">
        <div class="recent-item-name">${esc(m.projectIcon || "🗂️")} ${esc(m.projectName || m.name)}</div>
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
  if (!workDirHandle) { folderSection.style.display = "none"; return; }
  folderSection.style.display = "flex";
  try {
    const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") throw new Error("Permission denied — click Set Folder again");
    await Promise.all([_renderFolderTree(), _renderFolderFiles()]);
  } catch (err) {
    document.getElementById("load-folder-files").innerHTML = `<div class="recent-empty">${esc(err.message)}</div>`;
  }
}

async function _renderFolderTree() {
  const treeEl = document.getElementById("load-folder-tree");
  if (!treeEl) return;

  // Scan L1 and L2 folders (max 2 levels, skip hidden)
  const items = []; // { path, name, depth }
  for await (const [n1, h1] of workDirHandle.entries()) {
    if (h1.kind !== "directory" || n1.startsWith("_")) continue;
    items.push({ path: n1, name: n1, depth: 1 });
    for await (const [n2, h2] of h1.entries()) {
      if (h2.kind !== "directory" || n2.startsWith("_")) continue;
      items.push({ path: `${n1}/${n2}`, name: n2, depth: 2 });
    }
  }
  items.sort((a, b) => a.path.localeCompare(b.path));
  _modalAllPaths = items.map(t => t.path);

  // Build L1 → has-children map
  const l1HasChildren = {};
  for (const item of items) {
    if (item.depth === 2) l1HasChildren[item.path.split('/')[0]] = true;
  }

  const rootSel = _modalSubfolder === null ? " folder-tree-item--selected" : "";
  let html = `<div class='folder-tree-item folder-tree-root${rootSel}' onclick='browseSubfolder(null)'>
    <span class="folder-tree-toggle-spacer"></span><span>📁</span> ${esc(workDirHandle.name)}
  </div>`;
  for (const item of items) {
    if (item.depth === 2) {
      const l1 = item.path.split('/')[0];
      if (_collapsedFolders.has(l1)) continue;
    }
    const sel = _modalSubfolder === item.path ? " folder-tree-item--selected" : "";
    if (item.depth === 1) {
      const hasKids = !!l1HasChildren[item.path];
      const collapsed = _collapsedFolders.has(item.path);
      const toggle = hasKids
        ? `<button class='folder-tree-toggle' onclick='event.stopPropagation();toggleFolderCollapse(${JSON.stringify(item.path)})'><svg style='width:12px;height:12px'><use href='#${collapsed ? 'i-chevron-right' : 'i-chevron-down'}'/></svg></button>`
        : '<span class="folder-tree-toggle-spacer"></span>';
      html += `<div class='folder-tree-item${sel}' onclick='browseSubfolder(${JSON.stringify(item.path)})'>
        ${toggle}<span>📁</span> ${esc(item.name)}
      </div>`;
    } else {
      html += `<div class='folder-tree-item${sel}' style='padding-left:32px;' onclick='browseSubfolder(${JSON.stringify(item.path)})'>
        <span class="folder-tree-toggle-spacer"></span><span>📁</span> ${esc(item.name)}
      </div>`;
    }
  }
  treeEl.innerHTML = html;

  const newFolderBtn = document.getElementById("load-new-folder-btn");
  if (newFolderBtn) newFolderBtn.style.display = _pathDepth(_modalSubfolder) < 2 ? "" : "none";
}

async function _renderFolderFiles() {
  const filesEl = document.getElementById("load-folder-files");
  if (!filesEl) return;
  filesEl.innerHTML = '<div class="recent-empty">Loading…</div>';
  try {
    const dir = await _getDirFromPath(_modalSubfolder);
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
    filesEl.innerHTML = files.map(f => {
      const sn = JSON.stringify(f.name);
      const isActive = f.name === currentFileName && _modalSubfolder === currentSubfolder;
      return `<div class="recent-item${isActive ? " recent-item--active" : ""}">
        <div class="recent-item-info">
          <div class="recent-item-name">${esc(f.projectIcon)} ${esc(f.projectName)}</div>
          <div class="recent-item-meta">${esc(f.name)} · ${formatRelDate(f.lastModified)}</div>
        </div>
        <div class="recent-item-btns" style="position:relative">
          <div class="btn-group">
            <button class="btn btn-primary btn-sm btn-icon" onclick='loadFromFolder(${sn})' title="Open"><svg class="icon" style="width:13px;height:13px"><use href="#i-folder"/></svg></button>
            <button class="btn btn-secondary btn-sm btn-icon" onclick='showMoveMenu(${sn},this)' title="Move to"><svg class="icon" style="width:13px;height:13px"><use href="#i-arrow-lr"/></svg></button>
            <button class="btn btn-secondary btn-sm btn-icon" onclick='showCloneMenu(${sn},this)' title="Clone to"><svg class="icon" style="width:13px;height:13px"><use href="#i-clone"/></svg></button>
            <button class="btn btn-danger btn-sm btn-icon" onclick='deleteFromFolder(${sn},this)' title="Delete"><svg class="icon" style="width:13px;height:13px"><use href="#i-trash"/></svg></button>
          </div>
        </div>
      </div>`;
    }).join("") || '<div class="recent-empty">Empty</div>';
  } catch (err) {
    filesEl.innerHTML = `<div class="recent-empty">${esc(err.message)}</div>`;
  }
}

async function browseSubfolder(path) {
  _modalSubfolder = path;
  await _renderFolderTree();
  await _renderFolderFiles();
}

function toggleFolderCollapse(path) {
  if (_collapsedFolders.has(path)) _collapsedFolders.delete(path);
  else _collapsedFolders.add(path);
  _renderFolderTree();
}

async function createSubfolder() {
  if (_pathDepth(_modalSubfolder) >= 2) return;
  const name = prompt("Folder name:");
  if (!name) return;
  const clean = name.trim().replace(/[\\/:*?"<>|]/g, "");
  if (!clean) return;
  try {
    const parentDir = await _getDirFromPath(_modalSubfolder);
    await parentDir.getDirectoryHandle(clean, { create: true });
    const newPath = _modalSubfolder ? `${_modalSubfolder}/${clean}` : clean;
    await browseSubfolder(newPath);
  } catch (e) { alert("Cannot create folder: " + e.message); }
}
function closeLoadModal() {
  document.getElementById("load-modal").close();
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
  uiState.activeCardId = null;
  currentFileName = null;
  const _editFolders = _getEditFolders().filter(f => f);
  currentSubfolder = _editFolders.length ? _editFolders[0] : null;
  closeLoadModal();
  _computeReadOnly();
  dispatch('INIT_LOAD');
  clearDirty();
}
async function loadFromRecent(id) {
  const data = await idbGet(id).catch(() => null);
  if (!data) return alert("Session data not found. It may have been cleared by the browser.");
  const meta = getRecentMeta().find(m => m.id === id);
  if (meta?.path) {
    const parts = meta.path.split('/');
    currentFileName = parts[parts.length - 1];
    currentSubfolder = parts.length >= 2 ? parts.slice(0, -1).join('/') : null;
  }
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
export let currentSubfolder = null;  // null = root, "l1" or "l1/l2" path (max 2 levels)
export let currentFileName = null;
function hasWorkDir() { return !!workDirHandle; }
let _modalSubfolder = null;   // browsing state inside load modal
let _modalAllPaths = [];      // all folder paths (L1 and L2), used by move menu
let _collapsedFolders = new Set(); // L1 paths collapsed in folder tree
let dirty = false;
let readOnly = false;
let _autoSaveTimer = null;
let _lastAutoSaveAt = 0;
let _lastBackupAt = 0;
let _periodicBackupTimer = null;

function _getEditFolders() {
  try { return JSON.parse(localStorage.getItem('fc_edit_folders') || '[]'); } catch { return []; }
}
function _computeReadOnly() {
  const folders = _getEditFolders();
  if (!folders.length) { readOnly = false; return; }
  if (!currentFileName) { readOnly = false; return; }
  if (!currentSubfolder) {
    readOnly = !folders.includes('');
  } else {
    readOnly = !folders.some(f => f === currentSubfolder || currentSubfolder.startsWith(f + '/'));
  }
}

export function setDirty() {
  if (readOnly) return;
  dirty = true;
  _updateLabels();
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(_autoSaveToFile, 1500);
}
export function clearDirty() {
  dirty = false;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = null;
  _updateLabels();
}

let _toastTimer = null;
export function showToast(msg) {
  const el = document.getElementById("fc-toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

async function _autoSaveToFile() {
  if (readOnly || !workDirHandle || !state.cards.length) return;
  if (!currentFileName) currentFileName = _defaultFileName();
  // Snapshot before any await — currentFileName/currentSubfolder may change if user opens another file mid-save
  const _fname = currentFileName;
  const _sub = currentSubfolder;
  try {
    const dataObj = _buildDataObj();
    const json = JSON.stringify(dataObj, null, 2);
    const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") return;
    const dir = await _getDirFromPath(_sub);
    const fh = await dir.getFileHandle(_fname, { create: true });
    const w = await fh.createWritable();
    await w.write(json);
    await w.truncate(new TextEncoder().encode(json).byteLength);
    await w.close();
    const path = _sub ? `${_sub}/${_fname}` : _fname;
    localStorage.setItem("fc_last_file", path);
    _lastAutoSaveAt = Date.now();
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
  if (loadBtnLabel) loadBtnLabel.textContent = currentSubfolder ? _pathLeaf(currentSubfolder) : "Load";
  if (dot) dot.style.display = dirty ? "inline" : "none";
  const badge = document.getElementById("readonly-badge");
  if (badge) badge.style.display = readOnly ? "inline-flex" : "none";
  const saveBtn = document.getElementById("save-btn");
  if (saveBtn) saveBtn.disabled = readOnly;
}

async function _setWorkDir(handle) {
  workDirHandle = handle;
  await idbPut("_work_dir", handle).catch(() => { });
  _updateLabels();
  _startPeriodicBackup();
}

function _startPeriodicBackup() {
  clearInterval(_periodicBackupTimer);
  _periodicBackupTimer = setInterval(async () => {
    if (!workDirHandle || !currentFileName) return;
    if (_lastAutoSaveAt > _lastBackupAt) await _silentBackup();
  }, 5 * 60 * 1000);
}

export async function setWorkDir() {
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
  return await _getDirFromPath(currentSubfolder);
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

// ── Backup Modal ───────────────────────────────────────────────────
export async function openBackupModal() {
  const modal = document.getElementById('backup-modal');
  if (!modal) return;
  const titleEl = document.getElementById('backup-modal-title');
  const listEl = document.getElementById('backup-list');
  if (!workDirHandle || !currentFileName) {
    listEl.innerHTML = '<div class="backup-empty">No file open.</div>';
    titleEl.textContent = 'Backups';
    modal.showModal();
    return;
  }
  titleEl.textContent = 'Backups — ' + (currentSubfolder ? currentSubfolder + '/' : '') + currentFileName;
  listEl.innerHTML = '<div class="backup-empty">Loading…</div>';
  modal.showModal();
  try {
    const activeDir = await _getActiveDirHandle();
    let backupDir;
    try { backupDir = await activeDir.getDirectoryHandle('_backups'); }
    catch (_) { listEl.innerHTML = '<div class="backup-empty">No backups found.</div>'; return; }
    const base = currentFileName.replace(/\.json$/i, '') + '-';
    const items = [];
    for await (const [name] of backupDir.entries()) {
      if (name.startsWith(base) && name.endsWith('.json')) items.push(name);
    }
    items.sort().reverse();
    if (!items.length) { listEl.innerHTML = '<div class="backup-empty">No backups for this file.</div>'; return; }
    listEl.innerHTML = items.map(name => {
      const m = name.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})\.json$/);
      let label = name, rel = '';
      if (m) {
        const d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
        label = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}  ${m[4]}:${m[5]}`;
        const h = (Date.now() - d) / 3600000;
        rel = h < 1 ? Math.round(h*60) + 'm ago'
            : h < 24 ? Math.round(h) + 'h ago'
            : h < 48 ? 'Yesterday'
            : Math.floor(h/24) + 'd ago';
      }
      const sn = JSON.stringify(name);
      return `<div class="backup-item">
        <div class="backup-item-info">
          <span class="backup-item-date">${label}</span>
          <span class="backup-item-rel">${rel}</span>
        </div>
        <div class="backup-item-actions">
          <button class="btn btn-sm btn-secondary" onclick='restoreBackup(${sn},this)'>Restore</button>
          <button class="btn btn-sm btn-secondary backup-del-btn" onclick='deleteBackup(${sn},this)' title="Delete">×</button>
        </div>
      </div>`;
    }).join('');
  } catch (err) { listEl.innerHTML = `<div class="backup-empty">Error: ${err.message}</div>`; }
}

async function restoreBackup(backupName, btn) {
  if (!workDirHandle || !currentFileName) return;
  // Inline confirm: first click shows warning, second click executes
  if (btn.dataset.confirming !== 'yes') {
    btn.dataset.confirming = 'yes';
    btn.textContent = 'Sure?';
    btn.classList.add('btn-danger');
    setTimeout(() => { if (btn.dataset.confirming) { btn.dataset.confirming = ''; btn.textContent = 'Restore'; btn.classList.remove('btn-danger'); } }, 3000);
    return;
  }
  btn.dataset.confirming = '';
  try {
    btn.disabled = true;
    const activeDir = await _getActiveDirHandle();
    const backupDir = await activeDir.getDirectoryHandle('_backups');
    const fh = await backupDir.getFileHandle(backupName);
    const data = JSON.parse(await (await fh.getFile()).text());
    closeBackupModal();
    applyLoadedData(data);
    setDirty();
    showToast('Restored from backup — saving…');
  } catch (err) { alert('Restore failed: ' + err.message); btn.disabled = false; }
}

async function deleteBackup(backupName, btn) {
  if (!confirm(`Delete backup?\n"${backupName}"`)) return;
  try {
    const activeDir = await _getActiveDirHandle();
    const backupDir = await activeDir.getDirectoryHandle('_backups');
    await backupDir.removeEntry(backupName);
    btn.closest('.backup-item').remove();
    const listEl = document.getElementById('backup-list');
    if (!listEl.querySelector('.backup-item'))
      listEl.innerHTML = '<div class="backup-empty">No backups for this file.</div>';
  } catch (err) { alert('Delete failed: ' + err.message); }
}

export async function manualBackup(btn) {
  if (!workDirHandle || !currentFileName) { alert('No file open.'); return; }
  btn.disabled = true;
  btn.textContent = '…';
  try {
    await _silentBackup();
    _lastBackupAt = Date.now();
    showToast('Backup created');
    await openBackupModal();
  } catch (err) { alert('Backup failed: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Backup Now'; }
}

export function closeBackupModal() {
  document.getElementById('backup-modal')?.close();
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
  if (currentSubfolder?.split('/').includes('_backups')) return;
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
    _lastBackupAt = Date.now();
    // Prune: keep only the 15 most recent backups for this project
    const prefix = base + '-';
    const old = [];
    for await (const [name] of backupDir.entries()) {
      if (name.startsWith(prefix) && name.endsWith('.json')) old.push(name);
    }
    old.sort();
    for (const name of old.slice(0, -15)) await backupDir.removeEntry(name).catch(() => {});
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

export async function saveJSON() {
  if (readOnly) { showToast('⚠ Read-only — cannot save'); return; }
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

export async function saveJSONAs() {
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

  // populate folder options (L1 and L2, max 2 levels)
  const folderOpts = [`<option value="">${esc(workDirHandle.name)} (root)</option>`];
  try {
    const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
    if (perm === "granted") {
      const l1s = [];
      for await (const [n1, h1] of workDirHandle.entries()) {
        if (h1.kind === "directory" && !n1.startsWith("_")) l1s.push({ name: n1, handle: h1 });
      }
      l1s.sort((a, b) => a.name.localeCompare(b.name));
      for (const { name: n1, handle: h1 } of l1s) {
        folderOpts.push(`<option value="${esc(n1)}"${currentSubfolder === n1 ? " selected" : ""}>📁 ${esc(n1)}</option>`);
        for await (const [n2, h2] of h1.entries()) {
          if (h2.kind !== "directory" || n2.startsWith("_")) continue;
          const path = `${n1}/${n2}`;
          folderOpts.push(`<option value="${esc(path)}"${currentSubfolder === path ? " selected" : ""}>　📁 ${esc(n2)}</option>`);
        }
      }
    }
  } catch (_) {}
  folderSelect.innerHTML = folderOpts.join("");
  if (currentSubfolder) folderSelect.value = currentSubfolder;

  nameInput.value = _timestampedFileName();
  document.getElementById("save-as-modal").showModal();
  setTimeout(() => nameInput.select(), 50);
}

function closeSaveAsModal() {
  document.getElementById("save-as-modal").close();
}

async function executeSaveAs() {
  const folderSelect = document.getElementById("save-as-folder");
  const nameInput = document.getElementById("save-as-name");
  const raw = nameInput.value.trim();
  if (!raw) return;
  const name = raw.endsWith(".json") ? raw : raw + ".json";
  const targetSubfolder = folderSelect.value || null;

  try {
    const dir = await _getDirFromPath(targetSubfolder);
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
    _computeReadOnly();
    clearDirty();
    closeSaveAsModal();
  } catch (err) { alert("Save failed: " + err.message); }
}

async function loadFromFolder(fileName, subfolder) {
  // Flush any pending dirty save to the current file before switching
  if (dirty && workDirHandle && currentFileName) {
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer = null;
    await _autoSaveToFile();
  }
  const sf = subfolder !== undefined ? subfolder : _modalSubfolder;
  try {
    const dir = await _getDirFromPath(sf);
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
    const dir = await _getDirFromPath(_modalSubfolder);
    await dir.removeEntry(fileName);
    btn.closest(".recent-item").remove();
  } catch (err) { alert("Không xóa được: " + err.message); }
}

function _folderDestinations() {
  return [
    ...(_modalSubfolder ? [{ label: "📁 Root", value: null }] : []),
    ..._modalAllPaths.filter(p => p !== _modalSubfolder).map(p => ({
      label: `📁 ${p.split("/").map(s => s.length > 15 ? s.slice(0, 14) + "…" : s).join(" › ")}`,
      value: p
    })),
  ];
}

function _showFolderMenu(id, fileName, execFn, btn) {
  if (document.getElementById(id)) { closeMoveMenu(); closeCloneMenu(); return; }
  closeMoveMenu();
  closeCloneMenu();
  const destinations = _folderDestinations();
  if (!destinations.length) return;
  const menu = document.createElement("div");
  menu.id = id;
  menu.className = "move-menu";
  menu.innerHTML = destinations.map(d =>
    `<button class="move-menu-item" onclick='${execFn}(${JSON.stringify(fileName)},${JSON.stringify(d.value)})'>${esc(d.label)}</button>`
  ).join("");
  menu.addEventListener("click", e => e.stopPropagation());
  btn.after(menu);
  setTimeout(() => document.addEventListener("click", () => { closeMoveMenu(); closeCloneMenu(); }, { once: true }), 0);
}

function showMoveMenu(fileName, btn) {
  _showFolderMenu("move-menu", fileName, "_execMove", btn);
}

function closeMoveMenu() {
  document.getElementById("move-menu")?.remove();
}

function showCloneMenu(fileName, btn) {
  _showFolderMenu("clone-menu", fileName, "_execClone", btn);
}

function closeCloneMenu() {
  document.getElementById("clone-menu")?.remove();
}

async function _execMove(fileName, destPath) {
  closeMoveMenu();
  try {
    const srcDir = await _getDirFromPath(_modalSubfolder);
    const destDir = destPath ? await _getDirFromPath(destPath) : workDirHandle;
    const text = await (await (await srcDir.getFileHandle(fileName)).getFile()).text();
    const writable = await (await destDir.getFileHandle(fileName, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
    await srcDir.removeEntry(fileName);
    if (currentFileName === fileName && currentSubfolder === _modalSubfolder) {
      currentSubfolder = destPath;
      localStorage.setItem("fc_last_file", destPath ? `${destPath}/${fileName}` : fileName);
      _computeReadOnly();
      _updateLabels();
    }
    await _renderFolderSection();
  } catch (err) { alert("Move failed: " + err.message); }
}

async function _execClone(fileName, destPath) {
  closeCloneMenu();
  try {
    const srcDir = await _getDirFromPath(_modalSubfolder);
    const destDir = destPath ? await _getDirFromPath(destPath) : workDirHandle;
    const text = await (await (await srcDir.getFileHandle(fileName)).getFile()).text();
    const writable = await (await destDir.getFileHandle(fileName, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
    await _renderFolderSection();
  } catch (err) { alert("Clone failed: " + err.message); }
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

export async function restoreWorkDir() {
  try {
    const handle = await idbGet("_work_dir");
    if (!handle) return;
    workDirHandle = handle;
    _updateLabels();
    _startPeriodicBackup();
  } catch { }
}

export async function _autoRestore() {
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

export async function resumeLastProject() {
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

export function dismissRestoreBanner() {
  const banner = document.getElementById("fc-restore-banner");
  if (banner) banner.style.display = "none";
}

export function toggleSidebar() {
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
  uiState.activeCardId = state.cards.length ? state.cards[0].id : null;
  if (!state.settings.googleFonts) state.settings.googleFonts = [];
  applyGoogleFonts(); applySettingsToUI();
  document.getElementById("fc-custom-css").textContent = state.settings.customCss || "";
  _computeReadOnly();
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

export function setCurrentFileName(val) { currentFileName = val; }
export function setCurrentSubfolder(val) { currentSubfolder = val; }