import { state, uiState, LAYOUTS, LAYOUT_SPLIT_DEFAULTS } from '../core/state.js'
import { uid } from '../core/utils.js'

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
export async function idbPut(key, val) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("recents", "readwrite");
    tx.objectStore("recents").put(val, key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
export async function idbGet(key) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("recents", "readonly");
    const req = tx.objectStore("recents").get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
export async function idbDel(key) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("recents", "readwrite");
    tx.objectStore("recents").delete(key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

// ── Recent metadata (localStorage) ────────────────────────────────
export function getRecentMeta() {
  try {
    return JSON.parse(localStorage.getItem("fc_recent") || "[]");
  } catch {
    return [];
  }
}
export function setRecentMeta(list) {
  try {
    localStorage.setItem("fc_recent", JSON.stringify(list));
  } catch { }
}
export async function addToRecent(name, dataObj, path) {
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
export function formatRelDate(iso) {
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
export async function _getDirFromPath(path) {
  if (!path) return workDirHandle;
  let dir = workDirHandle;
  for (const part of path.split('/')) dir = await dir.getDirectoryHandle(part);
  return dir;
}
function _pathLeaf(path) { return path ? path.split('/').pop() : (workDirHandle?.name || ''); }

// ── Save / Load JSON ───────────────────────────────────────────────
export let workDirHandle = null;
export let currentSubfolder = null;  // null = root, "l1" or "l1/l2" path (max 2 levels)
export let currentFileName = null;
export function hasWorkDir() { return !!workDirHandle; }
let dirty = false;
let readOnly = false;
let _autoSaveTimer = null;
let _lastAutoSaveAt = 0;
let _lastBackupAt = 0;
let _periodicBackupTimer = null;

export function _getEditFolders() {
  try { return JSON.parse(localStorage.getItem('fc_edit_folders') || '[]'); } catch { return []; }
}
export function _computeReadOnly() {
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
export function isDirty() { return dirty; }

let _toastTimer = null;
export function showToast(msg) {
  const el = document.getElementById("fc-toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

export async function _autoSaveToFile() {
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

export function _updateLabels() {
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

export async function _setWorkDir(handle) {
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

export async function _getActiveDirHandle() {
  return await _getDirFromPath(currentSubfolder);
}

export async function _writeToDir(fileName, json) {
  const perm = await workDirHandle.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") throw new Error("Permission denied");
  const dir = await _getActiveDirHandle();
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(json);
  await w.truncate(new TextEncoder().encode(json).byteLength);
  await w.close();
}

export function _fallbackDownload(json, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = name;
  a.click();
}

export function _buildDataObj() {
  return { version: "1.0", project_name: state.projectName, project_icon: state.projectIcon, ...state };
}

// ── Library (shared styles & schemas) ──────────────────────────────
async function _getLibraryDir(type) {
  const lib = await workDirHandle.getDirectoryHandle('_library', { create: true });
  return await lib.getDirectoryHandle(type, { create: true });
}

export async function listLibrary(type) {
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

export async function saveToLibrary(type, name, data) {
  const dir = await _getLibraryDir(type);
  const json = JSON.stringify(data, null, 2);
  const fh = await dir.getFileHandle(`${name}.json`, { create: true });
  const w = await fh.createWritable();
  await w.write(json);
  await w.truncate(new TextEncoder().encode(json).byteLength);
  await w.close();
}

export async function loadFromLibrary(type, name) {
  const dir = await _getLibraryDir(type);
  const fh = await dir.getFileHandle(`${name}.json`);
  return JSON.parse(await (await fh.getFile()).text());
}

export async function deleteFromLibrary(type, name) {
  const dir = await _getLibraryDir(type);
  await dir.removeEntry(`${name}.json`);
}

export async function _silentBackup() {
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

export function _defaultFileName() {
  const slug = (state.projectName || "untitled").toLowerCase().trim().replace(/[^a-z0-9À-ɏḀ-ỿ]+/g, "-").replace(/^-|-$/g, "") || "untitled";
  return `${slug}.json`;
}

export function _timestampedFileName() {
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
    await window.openSaveAsModal();
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
    window.dispatch('INIT_LOAD');
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
  window.renderPreview();
}

export function applyLoadedData(data) {
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
  window.applyGoogleFonts(); window.applySettingsToUI();
  document.getElementById("fc-custom-css").textContent = state.settings.customCss || "";
  _computeReadOnly();
  window.dispatch('INIT_LOAD');
  clearDirty();
}

export function loadJSON(event) {
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
