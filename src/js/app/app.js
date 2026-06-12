import { marked } from 'marked'
import { setCurrentFileName, restoreWorkDir, _autoRestore,
         setDirty, showToast, applyLoadedData } from '../storage/storage.js'
import { applyI18n, getLang, t } from '../i18n.js'
import { renderEditor } from '../editor/editor.js'
import { renderPreview, initPanelResize, initPreviewPan } from '../preview.js'
import { renderRecordsPanel } from '../records/records.js'
import { insertImageUrl, pendingPasteSlot, setPendingPasteSlot } from '../modals.js'
import { initUndoKeys } from '../core/undo.js'
import { state, getActiveCard, uiState, LAYOUT_SLOTS } from '../core/state.js'
import { _compressImage, _hide } from '../core/utils.js'
import { bindSettings, applySettingsToUI, applyGoogleFonts, applyUIZoom } from './settings.js'
import { renderSidebar, refreshAllThumbs, initUploadDropZone,
         uploadedImages, clearThumbHashes } from './cards.js'
import { _fetchImageByKeyword, _buildAiPrompt } from '../api.js'

marked.use({
  extensions: [{
    name: "underline",
    level: "inline",
    start: (src) => src.indexOf("++"),
    tokenizer(src) {
      const match = src.match(/^\+\+([^+]+)\+\+/);
      if (match) return { type: "underline", raw: match[0], text: match[1] };
    },
    renderer: (token) => `<u>${token.text}</u>`,
  }],
});

// ── Dispatcher (State Management) ──────────────────────────────────
export function dispatch(action) {
  const skipDirty = ['ACTIVE_CARD_CHANGED', 'VIEW_MODE_CHANGED', 'INIT_LOAD', 'FULL_STATE_UPDATED'].includes(action);
  if (!skipDirty) {
    setDirty();
  }

  switch (action) {
    case 'INIT_LOAD':
      clearThumbHashes();  // new project — invalidate all cached hashes
      if (document.getElementById('records-panel')?.style.display === 'flex') renderRecordsPanel();
      // fall through
    case 'ACTIVE_CARD_CHANGED':
    case 'CARD_LIST_CHANGED':
    case 'FULL_STATE_UPDATED':
      renderSidebar();
      renderEditor();
      renderPreview();
      break;
    case 'CARD_MOVED':
    case 'VIEW_MODE_CHANGED':
      renderSidebar();
      break;
    case 'LAYOUT_CHANGED':
      renderEditor();
      renderPreview();
      refreshAllThumbs();
      break;
    case 'CARD_UI_CHANGED':
      renderEditor();
      renderPreview();
      break;
    case 'CARD_CONTENT_CHANGED':
      renderPreview();
      break;
    case 'CARD_TITLE_CHANGED':
      renderSidebar();
      renderPreview();
      break;
    case 'STATE_MUTATED':
      break;
  }
}

// ── JSON Export Modal ───────────────────────────────────────────────
export function openJsonModal() {
  const el = id => document.getElementById(id);
  const gKey = el('gemini-key'); if (gKey) gKey.value = localStorage.getItem('gemini-key') || '';
  const oKey = el('openai-key'); if (oKey) oKey.value = localStorage.getItem('openai-key') || '';
  const gModel = el('gemini-model'); if (gModel) gModel.value = localStorage.getItem('gemini-model') || '';
  el("json-modal").showModal();
}
export function closeJsonModal() {
  document.getElementById("json-modal").close();
}
export function openJsonEditor() {
  const snapshot = _fullSnapshot();
  snapshot.cards.forEach(card => {
    card.images = (card.images || []).map(img =>
      img?.url?.startsWith("data:") ? { ...img, url: "" } : img
    );
  });
  closeJsonModal();
  openJsonPreview(JSON.stringify(snapshot, null, 2));
}

function _fullSnapshot() {
  return JSON.parse(JSON.stringify({ project_name: state.projectName, project_icon: state.projectIcon, settings: state.settings, cards: state.cards }));
}

// ── Project Icon Emoji Picker ───────────────────────────────────────
const _EMOJI_CATS = [
  { label: "Mammals", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐵","🦍","🦧","🐘","🦒","🦓","🦏","🦛","🐃","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐈","🐇","🦝","🦨","🦡","🦦","🦥","🐿️","🦔","🦭","🐺","🐴","🦄"] },
  { label: "Birds", emojis: ["🐔","🐧","🦆","🦅","🦉","🦜","🦢","🦩","🕊️","🦃","🦤","🦚","🐦","🪿","🐓"] },
  { label: "Reptiles & Sea", emojis: ["🐸","🐢","🐍","🦎","🐊","🦖","🦕","🐠","🐟","🐡","🦈","🐬","🐳","🐋","🦭","🐙","🦑","🦐","🦞","🦀","🐚"] },
  { label: "Insects", emojis: ["🐝","🦋","🐛","🐌","🐞","🐜","🦗","🕷️","🦂","🪲","🪰","🦟","🦠"] },
  { label: "Nature", emojis: ["🌸","🌺","🌻","🌹","🌷","🌿","🍀","🍁","🍃","🌾","🌵","🌴","🌲","🌳","🌊","🌋","🏔️","🏝️","🌍","🌏"] },
  { label: "Science", emojis: ["🔬","🧪","🧬","🔭","🧲","💡","🔮","🗺️","📐","📏","📚","📖","🎓","🏛️","⚗️","📡","🧫","🔋","⚙️","🖥️"] },
  { label: "Food", emojis: ["🍎","🍊","🍋","🍇","🍓","🥑","🥕","🌽","🍄","🍕","🍔","🍜","🍣","🍵","☕","🧁","🍰","🎂","🥐","🍱"] },
  { label: "Objects", emojis: ["📱","💻","🖥️","📷","🎥","🎙️","🎧","📻","📺","🔦","🔑","🗝️","🔒","🗃️","🎒","💼","🧰","🛠️","⚒️","🧭"] },
  { label: "Arts", emojis: ["🎨","🖌️","🖍️","✏️","📝","🎭","🎬","🎤","🎵","🎶","🎷","🎸","🎹","🎺","🥁","🎪","🎠","🎡","🎢","🎟️"] },
  { label: "Sports", emojis: ["⚽","🏀","🏈","⚾","🎾","🏐","🥊","🥋","🎯","🎳","🎮","🎲","🃏","🎴","🧩","🏆","🥇","🎖️","🏅","🎗️"] },
  { label: "Places", emojis: ["🏠","🏡","🏢","🏥","🏦","🏨","🏫","🏭","🗼","🏰","🗽","🗿","🏯","⛩️","🕌","🛕","🏟️","🏕️","🌉","🌃"] },
  { label: "Symbols", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","⭐","🌟","💫","✨","🔥","💥","🎯","👑","🔱","⚜️","🌈","🎆"] },
];

let _emojiPickerBuilt = false;

function _buildEmojiPicker() {
  if (_emojiPickerBuilt) return;
  const picker = document.getElementById("emoji-picker");
  const grid = _EMOJI_CATS.map(cat =>
    `<div class="ep-cat-label">${cat.label}</div><div class="ep-grid">${
      cat.emojis.map(e => `<button class="ep-btn" data-emoji="${e}" onclick="selectProjectIcon(this.dataset.emoji)">${e}</button>`).join("")
    }</div>`
  ).join("");
  picker.innerHTML =
    `<input id="ep-custom-input" class="ep-custom-input" maxlength="8" placeholder="type or paste any emoji…"
      oninput="if(this.value.trim()){state.projectIcon=this.value.trim();document.getElementById('project-icon-btn').textContent=this.value.trim();setDirty();}"
    />${grid}`;
  _emojiPickerBuilt = true;
}

export function showRecordsPanel() {
  document.querySelector('.fc-editor').style.display  = 'none';
  document.querySelector('.fc-preview-panel').style.display = 'none';
  document.getElementById('records-panel').style.display = 'flex';
  document.getElementById('records-btn')?.classList.add('active');
  uiState.activeCardId = null;
  renderRecordsPanel();
}

export function showCardPanel() {
  document.querySelector('.fc-editor').style.display  = 'flex';
  document.querySelector('.fc-preview-panel').style.display = 'flex';
  document.getElementById('records-panel').style.display = 'none';
  document.getElementById('records-btn')?.classList.remove('active');
}

export function toggleMoreMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('toolbar-more-menu');
  const btn = document.getElementById('toolbar-more-btn');
  if (!menu) return;
  const open = menu.classList.toggle('open');
  btn.setAttribute('aria-pressed', open ? 'true' : 'false');
  if (open) setTimeout(() => document.addEventListener('click', closeMoreMenu, { once: true }), 0);
}

export function closeMoreMenu() {
  const menu = document.getElementById('toolbar-more-menu');
  const btn = document.getElementById('toolbar-more-btn');
  if (menu) menu.classList.remove('open');
  if (btn) btn.setAttribute('aria-pressed', 'false');
}

export function toggleSettingsBar() {
  const bar = document.querySelector('.fc-settings-bar');
  const btn = document.getElementById('setup-toggle-btn');
  if (!bar) return;
  const open = bar.classList.toggle('open');
  if (btn) btn.setAttribute('aria-pressed', open ? 'true' : 'false');
}

export function toggleEmojiPicker(event) {
  event.stopPropagation();
  _buildEmojiPicker();
  const picker = document.getElementById("emoji-picker");
  const isOpen = picker.style.display !== "none";
  picker.style.display = isOpen ? "none" : "block";
  if (!isOpen) {
    const inp = document.getElementById("ep-custom-input");
    if (inp) { inp.value = state.projectIcon || "🗂️"; inp.focus(); inp.select(); }
  }
}

export function selectProjectIcon(emoji) {
  state.projectIcon = emoji;
  document.getElementById("project-icon-btn").textContent = emoji;
  const inp = document.getElementById("ep-custom-input");
  if (inp) inp.value = emoji;
  _hide("emoji-picker");
  setDirty();
}

function _clipboardWrite(text, toastKey) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(t(toastKey));
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(t(toastKey));
  });
}

export function exportJsonFile() {
  const json = JSON.stringify(_fullSnapshot(), null, 2);
  const slug = state.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const name = `${slug}.json`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  closeJsonModal();
  showToast(t('toast.jsonExported'));
}

export function copyJsonFull() {
  _clipboardWrite(JSON.stringify(_fullSnapshot(), null, 2), 'toast.jsonCopiedFull');
  closeJsonModal();
}

export function copyJsonNoImg() {
  const snapshot = _fullSnapshot();
  snapshot.cards.forEach(card => {
    card.images = (card.images || []).map(img => {
      if (img?.url?.startsWith("data:"))
        return { ...img, url: "https://placehold.co/800x600/e5e7eb/9ca3af?text=Image" };
      return img;
    });
  });
  _clipboardWrite(JSON.stringify(snapshot, null, 2), 'toast.jsonCopied');
  closeJsonModal();
}

export function copyJsonForAI() {
  const subject = prompt("Generate project about:");
  if (!subject?.trim()) return;
  const snapshot = _fullSnapshot();
  snapshot.cards.forEach(card => {
    card.images = (card.images || []).map(img =>
      img?.url?.startsWith("data:") ? { ...img, url: "" } : img
    );
  });
  _clipboardWrite(_buildAiPrompt(subject.trim(), snapshot), 'toast.jsonCopied');
  closeJsonModal();
}

export function _syncJsonLineNums() {
  const ta = document.getElementById("json-preview-textarea");
  const ln = document.getElementById("json-line-numbers");
  if (!ta || !ln) return;
  const count = (ta.value.match(/\n/g) || []).length + 1;
  let s = "";
  for (let i = 1; i <= count; i++) s += `${i}\n`;
  ln.textContent = s;
  ln.scrollTop = ta.scrollTop;
}

export function openJsonPreview(text) {
  document.getElementById("json-preview-textarea").value = text;
  document.getElementById("json-preview-status").textContent = "";
  _syncJsonLineNums();
  document.getElementById("json-preview-modal").showModal();
}

export function closeJsonPreview() {
  document.getElementById("json-preview-modal").close();
}

function _jumpToJsonError(msg) {
  const ta = document.getElementById("json-preview-textarea");
  const m = msg.match(/line (\d+)/i);
  if (!m) return;
  const lineNum = parseInt(m[1]) - 1;
  const lines = ta.value.split("\n");
  let offset = 0;
  for (let i = 0; i < lineNum; i++) offset += lines[i].length + 1;
  const lineLen = (lines[lineNum] || "").length;
  ta.focus();
  ta.setSelectionRange(offset, offset + lineLen);
  ta.scrollTop = lineNum * 18 - ta.clientHeight / 2;
  _syncJsonLineNums();
}

export function validateJsonPreview() {
  const status = document.getElementById("json-preview-status");
  try {
    JSON.parse(document.getElementById("json-preview-textarea").value);
    status.textContent = "✓ Valid JSON";
    status.style.color = "#16a34a";
  } catch (e) {
    status.textContent = "✗ " + e.message;
    status.style.color = "#dc2626";
    _jumpToJsonError(e.message);
  }
}

export function applyJsonPreview() {
  const status = document.getElementById("json-preview-status");
  let data;
  try {
    data = JSON.parse(document.getElementById("json-preview-textarea").value);
  } catch (e) {
    status.textContent = "✗ " + e.message;
    status.style.color = "#dc2626";
    _jumpToJsonError(e.message);
    return;
  }
  closeJsonPreview();
  setCurrentFileName(null);
  applyLoadedData(data);
  showToast(t('toast.jsonLoaded'));
  _autoFetchImages();
  refreshAllThumbs();
}

async function _autoFetchImages() {
  const pending = [];
  for (const card of state.cards) {
    for (const img of card.images || []) {
      if (img.search_query && !img.url) pending.push(img);
    }
  }
  if (!pending.length) return;
  showToast(`🔍 Fetching ${pending.length} image${pending.length > 1 ? "s" : ""}…`);
  let filled = 0;
  await Promise.all(pending.map(async img => {
    try {
      const url = await _fetchImageByKeyword(img.search_query);
      if (url) { img.url = url; filled++; }
    } catch {}
  }));
  if (filled) {
    window.dispatch('CARD_UI_CHANGED');
    setDirty();
    showToast(`✓ ${filled} image${filled > 1 ? "s" : ""} fetched`);
  }
}

export async function pasteJsonLoad() {
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    showToast(t('toast.clipboardDenied'));
    return;
  }
  if (!text?.trim()) { showToast(t('toast.jsonInvalid')); return; }
  closeJsonModal();
  openJsonPreview(text.trim());
}

// ── Init ───────────────────────────────────────────────────────────
async function init() {
  // Seed localStorage from FC_ENV (env.js — local only, not committed)
  const _env = window.FC_ENV || {};
  if (_env.pexelsKey)   localStorage.setItem('pexels-key',   _env.pexelsKey);
  if (_env.unsplashKey) localStorage.setItem('unsplash-key', _env.unsplashKey);
  if (_env.pixabayKey)  localStorage.setItem('pixabay-key',  _env.pixabayKey);
  if (_env.openaiKey)   localStorage.setItem('openai-key',   _env.openaiKey);
  if (_env.geminiKey)   localStorage.setItem('gemini-key',   _env.geminiKey);

  const vEl = document.getElementById("app-version");
  if (vEl) vEl.textContent = "v" + (window.FC_VERSION || "?");
  await restoreWorkDir();
  await _autoRestore();
  bindSettings();
  applyGoogleFonts();
  applySettingsToUI();
  applyUIZoom();
  applyI18n();
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === getLang()));
  document.getElementById('view-grid-btn').classList.add('active');
  initPanelResize();
  initPreviewPan();
  dispatch('INIT_LOAD');
  initUploadDropZone();

  // Close emoji picker on outside click
  document.addEventListener("click", () => {
    const picker = document.getElementById("emoji-picker");
    if (picker) picker.style.display = "none";
  });

  // Paste image from clipboard — no permission prompt needed
  document.addEventListener("paste", (e) => {
    // Let text inputs handle their own paste unless a slot was explicitly targeted
    const inTextInput =
      e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";
    if (inTextInput && pendingPasteSlot === null) return;

    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find((it) => it.type.startsWith("image/"));
    if (!imgItem) return;
    const file = imgItem.getAsFile();
    if (!file) return;
    const card = getActiveCard();
    if (!card) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const compressed = await _compressImage(ev.target.result);
      if (pendingPasteSlot === null) {
        const slotCount = LAYOUT_SLOTS[card.layout] ?? 3;
        const usedSlots = new Set(card.images.map((i) => i.slot));
        uiState.imgModalSlot =
          Array.from({ length: slotCount }, (_, i) => i).find(
            (i) => !usedSlots.has(i),
          ) ?? 0;
      } else {
        uiState.imgModalSlot = pendingPasteSlot;
        setPendingPasteSlot(null);
        document
          .querySelectorAll(".image-slot-row")
          .forEach((r) => (r.style.outline = ""));
      }
      insertImageUrl(compressed);
      uploadedImages.push({ name: `pasted-${Date.now()}`, dataURL: compressed });
    };
    reader.readAsDataURL(file);
    e.preventDefault();
  });

  initUndoKeys();
}

init();

// Tint the filled half of range sliders for Chromium via --val CSS property
(function () {
  function tint(input) {
    if (!input || input.type !== "range" || input.classList.contains("mint-fill")) return;
    input.classList.add("mint-fill");
    const update = () => {
      const min = +input.min || 0, max = +input.max || 100;
      const v = ((+input.value - min) / (max - min)) * 100;
      input.style.setProperty("--val", v + "%");
    };
    input.addEventListener("input", update);
    update();
  }
  function tintAll() {
    document.querySelectorAll('input[type="range"]').forEach(tint);
  }
  document.addEventListener("DOMContentLoaded", tintAll);
  new MutationObserver(tintAll).observe(document.body, { childList: true, subtree: true });
})();
