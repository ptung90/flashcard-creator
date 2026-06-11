// ── Custom CSS Modal ───────────────────────────────────────────────
function openCssModal() {
  document.getElementById("custom-css-input").value =
    state.settings.customCss || "";
  document.getElementById("css-modal").showModal();
}
function closeCssModal() {
  document.getElementById("css-modal").close();
}
function applyCustomCss() {
  const css = document.getElementById("custom-css-input").value;
  state.settings.customCss = css;
  document.getElementById("fc-custom-css").textContent = css;
  dispatch('STATE_MUTATED');
  closeCssModal();
}
function resetCustomCss() {
  document.getElementById("custom-css-input").value = "";
}

// ── Settings Modal ─────────────────────────────────────────────────
function syncColorPicker(pickerId, hexId) {
  const hex = document.getElementById(hexId).value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    document.getElementById(pickerId).value = hex;
  }
}

function openSettingsModal() {
  const cfg = window.FC_CONFIG || {};
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = !!val;
    else el.value = val ?? "";
  };
  // App behaviour
  set("cfg-pasteBlock", cfg.pasteBlock);
  set("cfg-maxImgPx", cfg.maxImgPx ?? 1240);
  set("cfg-undoMax", cfg.undoMax ?? 50);
  // New card
  set("cfg-newCard-layout", (cfg.newCard || {}).layout || "2top-1bot");
  set("cfg-newCard-ihp", (cfg.newCard || {}).imageHeightPercent ?? 80);
  // Paper
  set("cfg-paperSize", cfg.paperSize || "A5");
  set("cfg-orientation", cfg.orientation || "portrait");
  set("cfg-margin", cfg.margin ?? 9);
  set("cfg-padding", cfg.padding ?? 2);
  // Border
  const b = cfg.border || {};
  set("cfg-border-width", b.width ?? 4);
  set("cfg-border-style", b.style || "solid");
  set("cfg-border-color", b.color || "#6B21A8");
  set("cfg-border-color-hex", b.color || "#6B21A8");
  set("cfg-border-radius", b.radius ?? 0);
  // Image
  const img = cfg.image || {};
  set("cfg-img-size", img.backgroundSize || "cover");
  set("cfg-img-pos", img.backgroundPosition || "center");
  // Title Font
  const tf = cfg.titleFont || {};
  set("cfg-font-family", tf.family || "sans-serif");
  set("cfg-font-size", tf.size ?? 14);
  set("cfg-font-color", tf.color || "#1a1a1a");
  set("cfg-font-color-hex", tf.color || "#1a1a1a");
  set("cfg-font-lh", tf.lineHeight ?? 1.0);
  // Content Font
  const cf = cfg.contentFont || {};
  set("cfg-cfont-family", cf.family || "sans-serif");
  set("cfg-cfont-size", cf.size ?? 12);
  set("cfg-cfont-color", cf.color || "#1a1a1a");
  set("cfg-cfont-color-hex", cf.color || "#1a1a1a");
  set("cfg-cfont-lh", cf.lineHeight ?? 1.1);

  const pexelsKeyEl = document.getElementById('pexels-key');
  if (pexelsKeyEl) pexelsKeyEl.value = localStorage.getItem('pexels-key') || '';
  document.getElementById("settings-modal").showModal();
  document.querySelectorAll('.cfg-section-chk').forEach(cb => toggleCfgSection(cb));
  listLibrary('styles').then(names => {
    const sel = document.getElementById('style-library-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— select —</option>' +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  });
}

function closeSettingsModal() {
  document.getElementById("settings-modal").close();
}

function toggleCfgSection(cb) {
  const section = cb.closest('.cfg-section');
  const disabled = !cb.checked;
  section.classList.toggle('cfg-section--disabled', disabled);
  section.querySelectorAll('input:not(.cfg-section-chk), select, textarea').forEach(el => {
    el.disabled = disabled;
  });
}

function _sectionEnabled(name) {
  const el = document.querySelector(`.cfg-section[data-section="${name}"] .cfg-section-chk`);
  return el ? el.checked : true;
}

function applyAndSaveSettings() {
  const get = (id) => document.getElementById(id)?.value ?? "";
  const chk = (id) => document.getElementById(id)?.checked ?? false;
  const on = _sectionEnabled;

  const patch = {};
  if (on("behaviour")) {
    patch.pasteBlock = chk("cfg-pasteBlock");
    patch.maxImgPx = parseInt(get("cfg-maxImgPx"), 10) || 1240;
    patch.undoMax = Math.max(1, Math.min(200, parseInt(get("cfg-undoMax"), 10) || 50));
  }
  if (on("newcard")) {
    patch.newCard = {
      ...((window.FC_CONFIG || {}).newCard || {}),
      layout: get("cfg-newCard-layout"),
      imageHeightPercent: parseInt(get("cfg-newCard-ihp"), 10) || 80,
    };
  }
  if (on("paper")) {
    patch.paperSize = get("cfg-paperSize");
    patch.orientation = get("cfg-orientation");
    patch.margin = parseFloat(get("cfg-margin")) || 0;
    patch.padding = parseFloat(get("cfg-padding")) || 0;
  }
  if (on("border")) {
    patch.border = {
      width: parseInt(get("cfg-border-width"), 10) || 0,
      style: get("cfg-border-style"),
      color: get("cfg-border-color"),
      radius: parseInt(get("cfg-border-radius"), 10) || 0,
    };
  }
  if (on("image")) {
    patch.image = {
      backgroundSize: get("cfg-img-size"),
      backgroundPosition: get("cfg-img-pos") || "center",
    };
  }
  if (on("tfont")) {
    patch.titleFont = {
      family: get("cfg-font-family") || "sans-serif",
      size: parseInt(get("cfg-font-size"), 10) || 14,
      color: get("cfg-font-color"),
      lineHeight: parseFloat(get("cfg-font-lh")) || 1.0,
    };
  }
  if (on("cfont")) {
    patch.contentFont = {
      family: get("cfg-cfont-family") || "sans-serif",
      size: parseInt(get("cfg-cfont-size"), 10) || 12,
      color: get("cfg-cfont-color"),
      lineHeight: parseFloat(get("cfg-cfont-lh")) || 1.1,
    };
  }

  // Merge into FC_CONFIG
  const cfg = window.FC_CONFIG || {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      cfg[k] = Object.assign({}, cfg[k] || {}, v);
    } else {
      cfg[k] = v;
    }
  }
  window.FC_CONFIG = cfg;

  // Persist to localStorage
  try {
    localStorage.setItem("fc_user_config", JSON.stringify(patch));
  } catch (e) {
    console.warn("localStorage write failed:", e);
  }

  // Optionally also write to work dir
  if (hasWorkDir()) {
    _writeToDir("user-config.json", JSON.stringify(patch, null, 2)).catch(
      (e) => console.warn("user-config.json write failed:", e),
    );
  }

  // Apply only enabled sections to current session
  if (on("paper")) {
    state.settings.paperSize = cfg.paperSize;
    state.settings.orientation = cfg.orientation;
    state.settings.margin = cfg.margin;
    state.settings.padding = cfg.padding;
  }
  if (on("border")) state.settings.border = { ...cfg.border };
  if (on("image")) state.settings.image = { ...cfg.image };
  if (on("tfont")) state.settings.titleFont = { ...cfg.titleFont };
  if (on("cfont")) state.settings.contentFont = { ...cfg.contentFont };
  if (on("behaviour")) MAX_IMG_PX = cfg.maxImgPx ?? 1240;
  applySettingsToUI();
  renderPreview();
  closeSettingsModal();
}

async function migrateImages(btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Running…";
  let count = 0;
  for (const card of state.cards) {
    for (const img of card.images) {
      if (img.url && img.url.startsWith("data:image/")) {
        img.url = await _compressImage(img.url);
        count++;
      }
    }
  }
  dispatch('STATE_MUTATED');
  btn.textContent = `Done (${count} image${count !== 1 ? "s" : ""})`;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 3000);
}

async function saveStyleToLibrary() {
  if (!hasWorkDir()) { alert('Set a work folder first.'); return; }
  const name = prompt('Save style as:');
  if (!name?.trim()) return;
  try {
    await saveToLibrary('styles', name.trim(), { fc_style_version: '1.0', settings: state.settings });
    const sel = document.getElementById('style-library-select');
    if (sel && !Array.from(sel.options).find(o => o.value === name.trim())) {
      sel.innerHTML += `<option value="${esc(name.trim())}">${esc(name.trim())}</option>`;
    }
    showToast(`Style "${name.trim()}" saved to library`);
  } catch (err) { alert('Save failed: ' + err.message); }
}

function _applyStyleData(data, name) {
  const src = data.fc_style_version ? data.settings : data;
  if (!src) throw new Error('Invalid style file');
  const defaultTF = { family: 'sans-serif', size: 14, color: '#1a1a1a', lineHeight: 1.0, textAlign: 'left' };
  const defaultCF = { family: 'sans-serif', size: 12, color: '#1a1a1a', lineHeight: 1.1, textAlign: 'left' };
  state.settings = { ...state.settings, ...src };
  state.settings.titleFont = { ...defaultTF, ...(src.titleFont || {}) };
  state.settings.contentFont = { ...defaultCF, ...(src.contentFont || {}) };
  if (!state.settings.googleFonts) state.settings.googleFonts = [];
  applyGoogleFonts(); applySettingsToUI();
  document.getElementById('fc-custom-css').textContent = state.settings.customCss || '';
  renderPreview(); setDirty();
  if (name) showToast(`Style "${name}" applied`);
}

async function applyStyleFromLibrary() {
  const sel = document.getElementById('style-library-select');
  const name = sel?.value;
  if (!name) return;
  try {
    const data = await loadFromLibrary('styles', name);
    _applyStyleData(data, name);
  } catch (err) { alert('Apply failed: ' + err.message); }
}

async function deleteStyleFromLibrary() {
  const sel = document.getElementById('style-library-select');
  const name = sel?.value;
  if (!name) return;
  if (!confirm(`Delete style "${name}" from library?`)) return;
  try {
    await deleteFromLibrary('styles', name);
    sel.remove(sel.selectedIndex);
    sel.value = '';
    showToast(`Style "${name}" deleted`);
  } catch (err) { alert('Delete failed: ' + err.message); }
}

function exportStyle() {
  const payload = JSON.stringify({ fc_style_version: "1.0", settings: state.settings }, null, 2);
  const slug = (state.projectName || "style").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "style";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  a.download = `${slug}.style.json`;
  a.click();
}

function importStyle(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = "";
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const src = data.fc_style_version ? data.settings : data;
      if (!src || typeof src !== "object") throw new Error("Invalid style file");
      const defaultTF = { family: "sans-serif", size: 14, color: "#1a1a1a", lineHeight: 1.0, textAlign: "left" };
      const defaultCF = { family: "sans-serif", size: 12, color: "#1a1a1a", lineHeight: 1.1, textAlign: "left" };
      state.settings = { ...state.settings, ...src };
      state.settings.titleFont = { ...defaultTF, ...(src.titleFont || {}) };
      state.settings.contentFont = { ...defaultCF, ...(src.contentFont || {}) };
      if (!state.settings.googleFonts) state.settings.googleFonts = [];
      applyGoogleFonts();
      applySettingsToUI();
      document.getElementById("fc-custom-css").textContent = state.settings.customCss || "";
      renderPreview();
      setDirty();
      showToast("Style imported");
    } catch (err) { alert("Cannot import style: " + err.message); }
  };
  reader.readAsText(file);
}

function resetUserConfig() {
  if (!confirm("Reset all settings to built-in defaults and reload?")) return;
  localStorage.removeItem("fc_user_config");
  if (workDirHandle) {
    workDirHandle
      .getFileHandle("user-config.json")
      .then((fh) => fh.remove?.())
      .catch(() => { });
  }
  location.reload();
}

// ── Image Search Modal ─────────────────────────────────────────────
function openImgModal(slot) {
  uiState.imgModalSlot = slot;
  document.getElementById("modal-slot-num").textContent = slot;
  document.getElementById("img-modal").showModal();
  document.getElementById("pixabay-key").value =
    localStorage.getItem("pixabay-key") || "";
  document.getElementById("unsplash-key").value =
    localStorage.getItem("unsplash-key") || "";
  document.getElementById("openai-key").value =
    localStorage.getItem("openai-key") || "";
  document.getElementById("gemini-key").value =
    localStorage.getItem("gemini-key") || "";
  const gModel = document.getElementById("gemini-model");
  if (gModel) gModel.value = localStorage.getItem("gemini-model") || "gemini-2.0-flash";
}
function closeImgModal() {
  document.getElementById("img-modal").close();
}

function switchTab(el) {
  uiState.activeTab = el.dataset.tab;
  document
    .querySelectorAll(".search-tab")
    .forEach((t) => t.classList.remove("active"));
  el.classList.add("active");
  ["wikimedia", "inaturalist", "pixabay", "upload", "url"].forEach(
    (t) => {
      document.getElementById("tab-" + t).style.display =
        t === uiState.activeTab ? "" : "none";
    },
  );
}

function insertImageUrl(url) {
  const card = getActiveCard();
  if (!card) return;
  pushUndo();
  const existing = card.images.find((i) => i.slot === uiState.imgModalSlot);
  if (existing) { existing.url = url; delete existing.attribution; }
  else card.images.push({ slot: uiState.imgModalSlot, url });
  closeImgModal();
  dispatch('CARD_UI_CHANGED');
}

function insertUnsplashImage(url, attribution) {
  const card = getActiveCard();
  if (!card) return;
  pushUndo();
  const existing = card.images.find((i) => i.slot === uiState.imgModalSlot);
  if (existing) { existing.url = url; existing.attribution = attribution; }
  else card.images.push({ slot: uiState.imgModalSlot, url, attribution });
  closeImgModal();
  dispatch('CARD_UI_CHANGED');
}

// URL tab
function previewUrlInput() {
  const url = document.getElementById("url-input").value.trim();
  const img = document.getElementById("url-preview-img");
  if (url) {
    img.src = url;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }
}

function insertUrl() {
  const url = document.getElementById("url-input").value.trim();
  if (!url) return;
  insertImageUrl(url);
  document.getElementById("url-input").value = "";
  _hide("url-preview-img");
}

// ── Copy / Paste image between slots ──────────────────────────────
let pendingPasteSlot = null;
let _imgClipboard = null;

function copySlot(slot) {
  const card = getActiveCard();
  if (!card) return;
  const img = card.images.find((i) => i.slot === slot);
  if (!img || !img.url) return;
  _imgClipboard = { ...img };
  showToast('Image copied');
}

function _pasteFromImgClipboard(slot) {
  const card = getActiveCard();
  if (!card || !_imgClipboard) return;
  pushUndo();
  const existing = card.images.find((i) => i.slot === slot);
  const newImg = { ..._imgClipboard, slot };
  if (existing) Object.assign(existing, newImg);
  else card.images.push(newImg);
  dispatch('CARD_UI_CHANGED');
}

async function pasteToSlot(slot) {
  uiState.imgModalSlot = slot;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith("image/"));
      if (imgType) {
        const blob = await item.getType(imgType);
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const compressed = await _compressImage(ev.target.result);
          insertImageUrl(compressed);
          uploadedImages.push({ name: `pasted-${Date.now()}`, dataURL: compressed });
        };
        reader.readAsDataURL(blob);
        return;
      }
    }
    // Clipboard readable but no image — use internal clipboard
    if (_imgClipboard) { _pasteFromImgClipboard(slot); return; }
  } catch {
    // Permission denied — use internal clipboard if available
    if (_imgClipboard) { _pasteFromImgClipboard(slot); return; }
  }
  // Last resort: passive paste listener
  pendingPasteSlot = slot;
  document.querySelectorAll(".image-slot-row").forEach((r, i) => {
    r.style.outline = i === slot ? "2px solid #5CB29D" : "";
  });
  setTimeout(() => {
    if (pendingPasteSlot === slot) {
      pendingPasteSlot = null;
      document
        .querySelectorAll(".image-slot-row")
        .forEach((r) => (r.style.outline = ""));
    }
  }, 10000);
}
