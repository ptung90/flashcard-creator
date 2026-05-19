// ── Custom CSS Modal ───────────────────────────────────────────────
function openCssModal() {
  document.getElementById("custom-css-input").value =
    state.settings.customCss || "";
  document.getElementById("css-modal").style.display = "flex";
}
function closeCssModal() {
  document.getElementById("css-modal").style.display = "none";
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

  document.getElementById("settings-modal").style.display = "flex";
}

function closeSettingsModal() {
  document.getElementById("settings-modal").style.display = "none";
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
  if (workDirHandle) {
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
  imgModalSlot = slot;
  document.getElementById("modal-slot-num").textContent = slot;
  document.getElementById("img-modal").style.display = "flex";
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
  document.getElementById("img-modal").style.display = "none";
}

function switchTab(el) {
  activeTab = el.dataset.tab;
  document
    .querySelectorAll(".search-tab")
    .forEach((t) => t.classList.remove("active"));
  el.classList.add("active");
  ["wikimedia", "inaturalist", "pixabay", "upload", "url"].forEach(
    (t) => {
      document.getElementById("tab-" + t).style.display =
        t === activeTab ? "" : "none";
    },
  );
}

function insertImageUrl(url) {
  const card = getActiveCard();
  if (!card) return;
  pushUndo();
  const existing = card.images.find((i) => i.slot === imgModalSlot);
  if (existing) { existing.url = url; delete existing.attribution; }
  else card.images.push({ slot: imgModalSlot, url });
  closeImgModal();
  dispatch('CARD_UI_CHANGED');
}

function insertUnsplashImage(url, attribution) {
  const card = getActiveCard();
  if (!card) return;
  pushUndo();
  const existing = card.images.find((i) => i.slot === imgModalSlot);
  if (existing) { existing.url = url; existing.attribution = attribution; }
  else card.images.push({ slot: imgModalSlot, url, attribution });
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
  document.getElementById("url-preview-img").style.display = "none";
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
  imgModalSlot = slot;
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
