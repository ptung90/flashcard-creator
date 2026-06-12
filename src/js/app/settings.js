import { _syncBdSwatch } from '../editor/controls.js'
import { _getEditFolders, setDirty } from '../storage/storage.js'
import { renderPreview } from '../preview.js'
import { state, uiState, getActiveCard } from '../core/state.js'
import { esc, getPaperPx } from '../core/utils.js'
import { pushUndo } from '../core/undo.js'

// ── Preview & UI Zoom ─────────────────────────────────────────────
export function changePreviewZoom(delta) {
  if (delta === 0) {
    uiState.previewZoom = 1.0; // reset to fit
  } else {
    const card = getActiveCard();
    const { w } = card
      ? getPaperPx(state.settings.paperSize, card.orientation || state.settings.orientation)
      : { w: 559 };
    const panelW = (document.getElementById("fc-preview-panel")?.clientWidth || 350) - 32;
    const currentPhysical = (panelW / w) * uiState.previewZoom;
    const newPhysical = Math.round(Math.max(0.1, Math.min(3.0, currentPhysical + delta)) * 100) / 100;
    uiState.previewZoom = newPhysical / (panelW / w);
  }
  renderPreview();
}

export function setPhysicalZoom() {
  const card = getActiveCard();
  if (!card) return;
  const { w } = getPaperPx(state.settings.paperSize, card.orientation || state.settings.orientation);
  const panelW = (document.getElementById("fc-preview-panel")?.clientWidth || 350) - 32;
  uiState.previewZoom = w / panelW;
  renderPreview();
}

let uiZoom = parseFloat(localStorage.getItem("fc_ui_zoom") || "1");
export function applyUIZoom() {
  uiZoom = Math.round(Math.max(0.7, Math.min(1.5, uiZoom)) * 10) / 10;
  const app = document.querySelector(".fc-app");
  app.style.zoom = uiZoom;
  app.style.height = `calc(${(100 / uiZoom).toFixed(4)}vh)`;
  const lbl = document.getElementById("ui-zoom-label");
  if (lbl) lbl.textContent = Math.round(uiZoom * 100) + "%";
  localStorage.setItem("fc_ui_zoom", uiZoom);
  renderPreview();
}
export function changeUIZoom(delta) {
  uiZoom = delta === 0 ? 1.0 : uiZoom + delta;
  applyUIZoom();
}

// ── Google / Custom Fonts ─────────────────────────────────────────
function _injectGoogleFontLink(name) {
  const id = "gf-" + name.replace(/\s+/g, "-").toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(name) + ":wght@400;700&display=swap";
  document.head.appendChild(link);
}

function _addFontOption(name) {
  const value = "'" + name + "',sans-serif";
  ["set-font-family", "set-cfont-family"].forEach((selId) => {
    const sel = document.getElementById(selId);
    if (!sel || [...sel.options].some((o) => o.value === value)) return;
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

function _removeFontOption(name) {
  const value = "'" + name + "',sans-serif";
  ["set-font-family", "set-cfont-family"].forEach((selId) => {
    const sel = document.getElementById(selId);
    const opt = sel && [...sel.options].find((o) => o.value === value);
    if (opt) opt.remove();
  });
}

export function applyGoogleFonts() {
  (state.settings.googleFonts || []).forEach((f) => {
    if (f.src === "google") _injectGoogleFontLink(f.name);
    _addFontOption(f.name);
  });
  renderGFontTags();
}

function renderGFontTags() {
  const container = document.getElementById("gfont-tags");
  if (!container) return;
  container.innerHTML = (state.settings.googleFonts || []).map((f) =>
    '<span class="gfont-tag">' +
    esc(f.name) +
    '<span class="gfont-tag-src">' + (f.src === "google" ? "G" : "C") + "</span>" +
    '<button onclick="removeGoogleFont(\'' + esc(f.name) + '\')" title="Remove">\xd7</button>' +
    "</span>"
  ).join("");
}

export function addGoogleFont(src) {
  const input = document.getElementById("gfont-input");
  const name = (input.value || "").trim().replace(/['"]/g, "");
  if (!name) return;
  const fonts = state.settings.googleFonts || [];
  if (fonts.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    input.value = "";
    return;
  }
  if (src === "google") _injectGoogleFontLink(name);
  _addFontOption(name);
  fonts.push({ name, src });
  state.settings.googleFonts = fonts;
  input.value = "";
  renderGFontTags();
  setDirty();
}

export function removeGoogleFont(name) {
  state.settings.googleFonts = (state.settings.googleFonts || []).filter((f) => f.name !== name);
  _removeFontOption(name);
  renderGFontTags();
  setDirty();
}

// ── Settings sync ──────────────────────────────────────────────────
export function bindSettings() {
  const ids = {
    "set-paper": (v) => (state.settings.paperSize = v),
    "set-margin": (v) => (state.settings.margin = +v),
    "set-padding": (v) => (state.settings.padding = +v),
    "set-bw": (v) => (state.settings.border.width = +v),
    "set-bs": (v) => (state.settings.border.style = v),
    "set-bc": (v) => { state.settings.border.color = v; _syncBdSwatch(); },
    "set-br": (v) => (state.settings.border.radius = +v),
    "set-imgsize": (v) => (state.settings.image.backgroundSize = v),
    "set-imgpos": (v) => (state.settings.image.backgroundPosition = v),
    "set-cfont-family": (v) => (state.settings.contentFont.family = v),
    "set-cfont-size": (v) => (state.settings.contentFont.size = +v),
    "set-cfont-color": (v) => (state.settings.contentFont.color = v),
    "set-cfont-lh": (v) => (state.settings.contentFont.lineHeight = +v),
    "set-cfont-fw": (v) => (state.settings.contentFont.weight = +v),
    "set-font-family": (v) => (state.settings.titleFont.family = v),
    "set-font-size": (v) => (state.settings.titleFont.size = +v),
    "set-font-color": (v) => (state.settings.titleFont.color = v),
    "set-font-lh": (v) => (state.settings.titleFont.lineHeight = +v),
    "set-font-fw": (v) => (state.settings.titleFont.weight = +v),
    "set-img-padding": (v) => (state.settings.imgPadding = +v),
  };
  for (const [id, fn] of Object.entries(ids)) {
    const el = document.getElementById(id);
    el.addEventListener("focus", () => pushUndo());
    el.addEventListener("input", (e) => {
      fn(e.target.value);
      setDirty();
      renderPreview();
    });
  }
}

export function setGlobalOrient(val) {
  state.settings.orientation = val;
  applySettingsToUI();
  setDirty();
  renderPreview();
}

export function applySettingsToUI() {
  const s = state.settings;
  document.getElementById("set-paper").value = s.paperSize;
  document.querySelectorAll("#set-orient-group .orient-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.val === s.orientation)
  );
  document.getElementById("set-margin").value = s.margin;
  document.getElementById("set-padding").value = s.padding;
  document.getElementById("set-bw").value = s.border.width;
  document.getElementById("set-bs").value = s.border.style;
  document.getElementById("set-bc").value = s.border.color;
  document.getElementById("set-br").value = s.border.radius;
  document.getElementById("set-imgsize").value = s.image.backgroundSize;
  document.getElementById("set-imgpos").value =
    s.image.backgroundPosition;
  const cf = s.contentFont || {};
  document.getElementById("set-cfont-family").value = cf.family || "sans-serif";
  document.getElementById("set-cfont-size").value = cf.size || 12;
  document.getElementById("set-cfont-color").value = cf.color || "#1a1a1a";
  document.getElementById("set-cfont-lh").value = cf.lineHeight || 1.1;
  document.getElementById("set-cfont-fw").value = cf.weight || 400;
  const tf = s.titleFont || {};
  document.getElementById("set-font-family").value = tf.family || "sans-serif";
  document.getElementById("set-font-size").value = tf.size || 14;
  document.getElementById("set-font-color").value = tf.color || "#1a1a1a";
  document.getElementById("set-font-lh").value = tf.lineHeight || 1.0;
  document.getElementById("set-font-fw").value = tf.weight || 400;
  const tfa = tf.textAlign || "left";
  document.querySelectorAll('.align-btn[data-key="titleFont"]').forEach((b) => b.classList.toggle("active", b.dataset.align === tfa));
  const cfa = (s.contentFont || {}).textAlign || "left";
  document.querySelectorAll('.align-btn[data-key="contentFont"]').forEach((b) => b.classList.toggle("active", b.dataset.align === cfa));
  document.getElementById("set-img-padding").value = s.imgPadding ?? 0;
  const va = s.textVAlign || "middle";
  document.querySelectorAll(".valign-btn").forEach((b) => b.classList.toggle("active", b.dataset.valign === va));
  document.getElementById("fc-custom-css").textContent =
    s.customCss || "";
  renderGFontTags();
  _syncBdSwatch();
  const efInput = document.getElementById('set-edit-folders');
  if (efInput) efInput.value = _getEditFolders().join(', ');
}
