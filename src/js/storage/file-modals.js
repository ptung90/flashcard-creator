import {
  workDirHandle, currentSubfolder, currentFileName,
  setCurrentFileName, setCurrentSubfolder,
  _setWorkDir, _getActiveDirHandle, _getDirFromPath,
  _buildDataObj, _timestampedFileName,
  _autoSaveToFile, _silentBackup,
  _computeReadOnly, _getEditFolders,
  setDirty, clearDirty, isDirty, showToast,
  _updateLabels,
  addToRecent, getRecentMeta, setRecentMeta, formatRelDate, idbGet, idbDel,
  applyLoadedData,
} from './storage.js';
import { state, uiState } from '../core/state.js';
import { esc } from '../core/utils.js';

// ── Modal-state variables ──────────────────────────────────────────
let _modalSubfolder = null;
let _modalAllPaths = [];
let _collapsedFolders = new Set();

function _pathDepth(path) { return path ? path.split('/').length : 0; }

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

export function toggleFolderCollapse(path) {
  if (_collapsedFolders.has(path)) _collapsedFolders.delete(path);
  else _collapsedFolders.add(path);
  _renderFolderTree();
}

export async function createSubfolder() {
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

export function closeLoadModal() {
  document.getElementById("load-modal").close();
}

export async function newProject() {
  if (isDirty()) {
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
  setCurrentFileName(null);
  const _editFolders = _getEditFolders().filter(f => f);
  setCurrentSubfolder(_editFolders.length ? _editFolders[0] : null);
  closeLoadModal();
  _computeReadOnly();
  dispatch('INIT_LOAD');
  clearDirty();
}

export async function loadFromRecent(id) {
  const data = await idbGet(id).catch(() => null);
  if (!data) return alert("Session data not found. It may have been cleared by the browser.");
  const meta = getRecentMeta().find(m => m.id === id);
  if (meta?.path) {
    const parts = meta.path.split('/');
    setCurrentFileName(parts[parts.length - 1]);
    setCurrentSubfolder(parts.length >= 2 ? parts.slice(0, -1).join('/') : null);
  }
  applyLoadedData(data);
  closeLoadModal();
}

export async function deleteRecentItem(id, btn) {
  const meta = getRecentMeta().filter((m) => m.id !== id);
  setRecentMeta(meta);
  await idbDel(id).catch(() => { });
  btn.closest(".recent-item").remove();
  if (!meta.length) document.getElementById("load-recent-list").innerHTML = '<div class="recent-empty">No recent files</div>';
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

export async function restoreBackup(backupName, btn) {
  if (!workDirHandle || !currentFileName) return;
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

export async function deleteBackup(backupName, btn) {
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
    showToast('Backup created');
    await openBackupModal();
  } catch (err) { alert('Backup failed: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Backup Now'; }
}

export function closeBackupModal() {
  document.getElementById('backup-modal')?.close();
}

// ── Save-as modal ──────────────────────────────────────────────────
export async function openSaveAsModal() {
  const folderSelect = document.getElementById("save-as-folder");
  const nameInput = document.getElementById("save-as-name");

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

export function closeSaveAsModal() {
  document.getElementById("save-as-modal").close();
}

export async function executeSaveAs() {
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

    setCurrentSubfolder(targetSubfolder);
    setCurrentFileName(name);
    const path = targetSubfolder ? `${targetSubfolder}/${name}` : name;
    localStorage.setItem("fc_last_file", path);
    addToRecent(name, dataObj, path).catch(() => { });
    _computeReadOnly();
    clearDirty();
    closeSaveAsModal();
  } catch (err) { alert("Save failed: " + err.message); }
}

// ── Folder file operations ─────────────────────────────────────────
export async function loadFromFolder(fileName, subfolder) {
  if (isDirty() && workDirHandle && currentFileName) {
    await _autoSaveToFile();
  }
  const sf = subfolder !== undefined ? subfolder : _modalSubfolder;
  try {
    const dir = await _getDirFromPath(sf);
    const fh = await dir.getFileHandle(fileName);
    const file = await fh.getFile();
    const data = JSON.parse(await file.text());
    await _silentBackup();
    setCurrentSubfolder(sf);
    setCurrentFileName(fileName);
    _updateLabels();
    applyLoadedData(data);
    const fullPath = sf ? `${sf}/${fileName}` : fileName;
    addToRecent(fileName, data, fullPath).catch(() => { });
    closeLoadModal();
  } catch (err) { alert("Không đọc được file: " + err.message); }
}

export async function deleteFromFolder(fileName, btn) {
  if (!confirm("Xóa " + fileName + "?")) return;
  try {
    const dir = await _getDirFromPath(_modalSubfolder);
    await dir.removeEntry(fileName);
    btn.closest(".recent-item").remove();
  } catch (err) { alert("Không xóa được: " + err.message); }
}

// ── Folder menus ───────────────────────────────────────────────────
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

export function showMoveMenu(fileName, btn) {
  _showFolderMenu("move-menu", fileName, "_execMove", btn);
}

export function closeMoveMenu() {
  document.getElementById("move-menu")?.remove();
}

export function showCloneMenu(fileName, btn) {
  _showFolderMenu("clone-menu", fileName, "_execClone", btn);
}

export function closeCloneMenu() {
  document.getElementById("clone-menu")?.remove();
}

export async function _execMove(fileName, destPath) {
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
      setCurrentSubfolder(destPath);
      localStorage.setItem("fc_last_file", destPath ? `${destPath}/${fileName}` : fileName);
      _computeReadOnly();
      _updateLabels();
    }
    await _renderFolderSection();
  } catch (err) { alert("Move failed: " + err.message); }
}

export async function _execClone(fileName, destPath) {
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

export async function openFilePicker() {
  if (window.showOpenFilePicker) {
    try {
      const opts = { types: [{ description: "JSON", accept: { "application/json": [".json"] } }] };
      if (workDirHandle) opts.startIn = workDirHandle;
      const [fh] = await window.showOpenFilePicker(opts);
      const file = await fh.getFile();
      const data = JSON.parse(await file.text());
      setCurrentFileName(file.name);
      _updateLabels();
      applyLoadedData(data);
      addToRecent(file.name, data).catch(() => { });
      return;
    } catch (err) { if (err.name === "AbortError") return; }
  }
  document.getElementById("load-file").click();
}
