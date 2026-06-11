import html2canvas from 'html2canvas'

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
      _thumbHashes = {};  // new project — invalidate all cached hashes
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
function applyUIZoom() {
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

function applyGoogleFonts() {
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
  // Auto-select the new font in both dropdowns and apply to state
  const value = `'${name}',sans-serif`;
  const titleSel = document.getElementById("set-font-family");
  const contentSel = document.getElementById("set-cfont-family");
  if (titleSel) { titleSel.value = value; state.settings.titleFont.family = value; }
  if (contentSel) { contentSel.value = value; state.settings.contentFont.family = value; }
  setDirty();
  renderPreview();
}

function removeGoogleFont(name) {
  state.settings.googleFonts = (state.settings.googleFonts || []).filter((f) => f.name !== name);
  _removeFontOption(name);
  renderGFontTags();
  setDirty();
}

// ── Settings sync ──────────────────────────────────────────────────
function bindSettings() {
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

function applySettingsToUI() {
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

// ── Card Management ────────────────────────────────────────────────
export function newCard() {
  return {
    id:                uid(),
    layout:            '1full',
    imageHeightPercent: 55,
    imageGridSplit:    { ...LAYOUT_SPLIT_DEFAULTS['1full'] },
    images:            [],
    title:             '',
    hideTitle:         false,
    hideSectionLabels: false,
    titleFont:         null,
    contentFont:       null,
    orientation:       null,
    customCss:         '',
    cssClass:          '',
    sections:          [],
    recordId:          null,
    templateId:        null,
    paperSize:         null,
    packedRecordIds:   null,
  };
}

export function addCard() {
  pushUndo();
  const nc     = (window.FC_CONFIG || {}).newCard || {};
  const layout = nc.layout || '2top-1bot';
  const card   = {
    ...newCard(),
    layout,
    imageGridSplit:     { ...LAYOUT_SPLIT_DEFAULTS[layout] },
    title:              t('card.new'),
    imageHeightPercent: nc.imageHeightPercent ?? 55,
    hideTitle:          HIDE_TITLE_LAYOUTS.has(layout),
    sections: (nc.defaultSections || [
      { label: 'Đặc điểm', content: '' },
      { label: 'Môi trường', content: '' },
    ]).map((s) => ({ id: uid(), ...s })),
  };
  state.cards.push(card);
  uiState.activeCardId = card.id;
  showCardPanel();
  dispatch('CARD_LIST_CHANGED');
}

let _cardStyleClipboard = null;

function copyCardStyle(id) {
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  _cardStyleClipboard = {
    layout:             card.layout,
    imageHeightPercent: card.imageHeightPercent,
    imageGridSplit:     JSON.parse(JSON.stringify(card.imageGridSplit || {})),
    hideTitle:          card.hideTitle,
    hideSectionLabels:  card.hideSectionLabels,
    titleFont:          card.titleFont ? { ...card.titleFont } : null,
    contentFont:        card.contentFont ? { ...card.contentFont } : null,
    orientation:        card.orientation,
    customCss:          card.customCss,
    bgColor:            card.bgColor ?? null,
  };
  showToast(t('misc.styleCopied'));
}

function pasteCardStyle(id) {
  if (!_cardStyleClipboard) return;
  const card = state.cards.find(c => c.id === id);
  if (!card || card.layout !== _cardStyleClipboard.layout) return;
  pushUndo();
  const style = (({ layout, ...rest }) => rest)(_cardStyleClipboard);
  Object.assign(card, JSON.parse(JSON.stringify(style)));
  setDirty();
  renderEditor();
  renderPreview();
  showToast(t('misc.stylePasted'));
}

function openCardMenu(id, btn) {
  closeCardMenu();
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  const canPaste = _cardStyleClipboard && _cardStyleClipboard.layout === card.layout;
  const menu = document.createElement('div');
  menu.id = 'card-more-menu';
  menu.className = 'card-more-menu';
  menu.innerHTML = `
    <button class="card-more-item" onclick="cloneCard('${id}');closeCardMenu()">
      <svg class="icon" style="width:13px;height:13px"><use href="#i-clone"/></svg>${t('misc.clone')}
    </button>
    <div class="card-more-sep"></div>
    <button class="card-more-item" onclick="copyCardStyle('${id}');closeCardMenu()">
      <svg class="icon" style="width:13px;height:13px"><use href="#i-copy"/></svg>${t('misc.copyStyle')}
    </button>
    <button class="card-more-item${canPaste ? '' : ' card-more-item--disabled'}" onclick="${canPaste ? `pasteCardStyle('${id}');closeCardMenu()` : ''}">
      <svg class="icon" style="width:13px;height:13px"><use href="#i-clipboard"/></svg>${t('misc.pasteStyle')}
    </button>
    <div class="card-more-sep"></div>
    <button class="card-more-item${card.twoUp ? ' card-more-item--active' : ''}" onclick="setTwoUpRatio('${id}',${card.twoUp ? "''" : 50});closeCardMenu()">
      <svg class="icon" style="width:13px;height:13px"><use href="#i-arrow-tb"/></svg>${t('misc.twoUp')}${card.twoUp ? ' ✓' : ''}
    </button>
    <div class="card-more-sep"></div>
    <button class="card-more-item card-more-item--danger" onclick="if(confirm(t('confirm.deleteCard'))){deleteCard('${id}');}closeCardMenu()">
      <svg class="icon" style="width:13px;height:13px"><use href="#i-trash"/></svg>${t('misc.delete')}
    </button>`;
  menu.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(menu);
  const rect = btn.getBoundingClientRect();
  const menuW = 160;
  const left = Math.min(rect.left, window.innerWidth - menuW - 8);
  menu.style.cssText = `position:fixed;left:${left}px;top:${rect.bottom + 4}px`;
  setTimeout(() => document.addEventListener('click', closeCardMenu, { once: true }), 0);
}

function closeCardMenu() {
  document.getElementById('card-more-menu')?.remove();
}

function cloneCard(id) {
  pushUndo();
  const src = state.cards.find((c) => c.id === id);
  if (!src) return;
  const clone = JSON.parse(JSON.stringify(src));
  clone.id = uid();
  clone.sections = clone.sections.map((s) => ({ ...s, id: uid() }));
  const idx = state.cards.findIndex((c) => c.id === id);
  state.cards.splice(idx + 1, 0, clone);
  uiState.activeCardId = clone.id;
  dispatch('CARD_LIST_CHANGED');
}

function deleteCard(id) {
  pushUndo();
  state.cards = state.cards.filter((c) => c.id !== id);
  if (uiState.activeCardId === id) {
    uiState.activeCardId = state.cards.length
      ? state.cards[state.cards.length - 1].id
      : null;
  }
  dispatch('CARD_LIST_CHANGED');
}

function moveCard(id, dir) {
  const i = state.cards.findIndex((c) => c.id === id);
  const j = i + dir;
  if (j < 0 || j >= state.cards.length) return;
  [state.cards[i], state.cards[j]] = [state.cards[j], state.cards[i]];
  dispatch('CARD_MOVED');
}

function setActive(id) {
  showCardPanel();
  uiState.activeCardId = id;
  dispatch('ACTIVE_CARD_CHANGED');
}

function setTwoUpRatio(id, value) {
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  const n = parseInt(value, 10);
  if (!value || isNaN(n)) {
    card.twoUp = false;
    card.twoUpRatio = undefined;
  } else {
    card.twoUp = true;
    card.twoUpRatio = Math.min(90, Math.max(10, n));
  }
  setDirty();
  renderSidebar();
}

// ── Sidebar ────────────────────────────────────────────────────────
export function setViewMode(mode) {
  uiState.sidebarView = mode;
  document.getElementById('view-list-btn').classList.toggle('active', mode === 'list');
  document.getElementById('view-grid-btn').classList.toggle('active', mode === 'grid');
  dispatch('VIEW_MODE_CHANGED');
}

export function renderSidebar() {
  document.getElementById("card-count").textContent = state.cards.length;
  if (uiState.sidebarView === 'grid') {
    _renderGridSidebar();
  } else {
    _renderListSidebar();
  }
}

function _renderListSidebar() {
  const list = document.getElementById("card-list");
  list.innerHTML = state.cards
    .map(
      (c, i) => `
    <div class="fc-card-item ${c.id === uiState.activeCardId ? "active" : ""}${c.twoUp ? ' card-item--twoUp' : ''}" draggable="true" onclick="setActive('${c.id}')" data-id="${c.id}" style="${c.twoUp ? `--twoUp-ratio:${c.twoUpRatio||50}%` : ''}">
      <span class="card-num">${i + 1}</span>
      <span class="card-title">${esc(c.title || t('card.untitled'))}</span>
      <span class="card-actions">
        <button class="icon-btn card-more-btn" title="More" onclick="event.stopPropagation();openCardMenu('${c.id}',this)"><svg class="icon" style="width:14px;height:14px"><use href="#i-more"/></svg></button>
      </span>
    </div>
  `,
    )
    .join("");
  _attachCardDrag('.fc-card-item');
}

function _renderGridSidebar() {
  const list = document.getElementById("card-list");
  const grid = list.querySelector('.fc-card-grid');
  const items = grid ? [...grid.querySelectorAll('.fc-card-thumb-item')] : [];
  const ids = items.map(el => el.dataset.id);
  const sameCards = ids.length === state.cards.length && state.cards.every((c, i) => c.id === ids[i]);

  if (sameCards) {
    // Lightweight update: only sync active class and titles
    items.forEach((el, i) => {
      el.classList.toggle('active', state.cards[i].id === uiState.activeCardId);
      el.classList.toggle('fc-card-thumb-item--landscape', getCardOrientation(state.cards[i]) === 'landscape');
      el.classList.toggle('fc-card-thumb-item--portrait', getCardOrientation(state.cards[i]) !== 'landscape');
      const titleEl = el.querySelector('.card-thumb-title');
      if (titleEl) titleEl.textContent = state.cards[i].title || t('card.untitled');
      const numEl = el.querySelector('.card-thumb-num');
      if (numEl) numEl.textContent = '#' + (i + 1);
      el.classList.toggle('fc-card-thumb-item--twoUp', !!state.cards[i].twoUp);
      el.style.setProperty('--twoUp-ratio', state.cards[i].twoUp ? (state.cards[i].twoUpRatio || 50) + '%' : '');
      const ratioRow = el.querySelector('.card-thumb-ratio');
      if (ratioRow) {
        ratioRow.classList.toggle('card-thumb-ratio--hidden', !state.cards[i].twoUp);
        const inp = ratioRow.querySelector('.card-2up-input');
        if (inp) inp.value = state.cards[i].twoUp ? (state.cards[i].twoUpRatio || 50) : '';
      }
    });
    if (_thumbRenderedVersion !== _thumbDirtyVersion) {
      _requestThumbGeneration(items);
    }
    return;
  }

  // Full rebuild needed (cards added/removed/reordered)
  const genId = ++_thumbGenId;
  list.innerHTML = '<div class="fc-card-grid">' + state.cards.map((c, i) => `
    <div class="fc-card-thumb-item ${c.id === uiState.activeCardId ? "active" : ""} ${getCardOrientation(c) === "landscape" ? "fc-card-thumb-item--landscape" : "fc-card-thumb-item--portrait"}${c.twoUp ? ' fc-card-thumb-item--twoUp' : ''}" style="${c.twoUp ? `--twoUp-ratio:${c.twoUpRatio||50}%` : ''}"
         draggable="true" onclick="setActive('${c.id}')" data-id="${c.id}">
      <div class="card-thumb-img thumb-loading"></div>
      <span class="card-thumb-num">#${i + 1}</span>
      <div class="card-thumb-title">${esc(c.title || t('card.untitled'))}</div>
      <div class="card-thumb-ratio${c.twoUp ? '' : ' card-thumb-ratio--hidden'}" onclick="event.stopPropagation()">
        <input class="card-2up-input card-2up-input--on" type="number" min="10" max="90" placeholder="50" title="Nhập % để ghép trang 2-up, xóa để tắt" value="${c.twoUp ? (c.twoUpRatio || 50) : ''}" onchange="event.stopPropagation();setTwoUpRatio('${c.id}',this.value)" oninput="event.stopPropagation()"><span class="card-thumb-ratio-pct">%</span>
      </div>
      <div class="card-thumb-actions">
        <button class="icon-btn card-more-btn" title="More" onclick="event.stopPropagation();openCardMenu('${c.id}',this)"><svg class="icon" style="width:14px;height:14px"><use href="#i-more"/></svg></button>
      </div>
    </div>
  `).join("") + '</div>';
  _generateThumbs(genId);
  _attachCardDrag('.fc-card-thumb-item');
}

function _attachCardDrag(selector) {
  let dragId = null;
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener('dragstart', e => {
      dragId = el.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => el.classList.add('card-dragging'), 0);
    });
    el.addEventListener('dragend', () => {
      dragId = null;
      document.querySelectorAll(selector).forEach(e =>
        e.classList.remove('card-dragging', 'card-drag-over'));
    });
    el.addEventListener('dragover', e => {
      if (!dragId || el.dataset.id === dragId) return;
      e.preventDefault();
      document.querySelectorAll(selector).forEach(e => e.classList.remove('card-drag-over'));
      el.classList.add('card-drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('card-drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragId || el.dataset.id === dragId) return;
      const fromIdx = state.cards.findIndex(c => c.id === dragId);
      const toIdx = state.cards.findIndex(c => c.id === el.dataset.id);
      if (fromIdx < 0 || toIdx < 0) return;
      pushUndo();
      const [card] = state.cards.splice(fromIdx, 1);
      state.cards.splice(toIdx, 0, card);
      dispatch('CARD_MOVED');
      setDirty();
    });
  });
}

function _requestThumbGeneration(items = null) {
  const els = items || [...document.querySelectorAll('.fc-card-thumb-item')];
  if (!els.length) return;
  const genId = ++_thumbGenId;
  els.forEach((el) => {
    const imgDiv = el.querySelector('.card-thumb-img');
    // Only show loading spinner for cards with no existing thumbnail
    if (imgDiv && !imgDiv.querySelector('img')) imgDiv.classList.add('thumb-loading');
  });
  _generateThumbs(genId, els);
}

function _cardThumbHash(card) {
  const s = state.settings;
  return _hashStr(JSON.stringify({
    layout: card.layout, title: card.title, sections: card.sections,
    images: (card.images || []).map(i => i?.url?.slice(0, 60)),
    imageHeightPercent: card.imageHeightPercent, imageGridSplit: card.imageGridSplit,
    orientation: card.orientation, hideTitle: card.hideTitle, paperSize: card.paperSize,
    titleFont: card.titleFont, contentFont: card.contentFont, cssClass: card.cssClass,
    // key global settings that affect visual
    border: s.border, padding: s.padding, margin: s.margin,
    titleFont_g: s.titleFont, contentFont_g: s.contentFont,
  }));
}

async function _generateThumbs(genId, targetItems = null) {
  const targetDirtyVersion = _thumbDirtyVersion;
  const offscreen = document.createElement('div');
  offscreen.style.cssText = 'position:fixed;top:-9999px;left:0;pointer-events:none;overflow:hidden;';
  document.body.appendChild(offscreen);

  const targetIds = targetItems ? new Set(targetItems.map(el => el.dataset.id)) : null;

  // Render active card first for better perceived performance
  const cards = [...state.cards].sort((a, b) =>
    a.id === uiState.activeCardId ? -1 : b.id === uiState.activeCardId ? 1 : 0
  );

  for (const card of cards) {
    if (genId !== _thumbGenId) break;
    if (targetIds && !targetIds.has(card.id)) continue;
    const item = document.querySelector(`.fc-card-thumb-item[data-id="${card.id}"]`);
    if (!item) continue;

    // Skip if content hasn't changed and thumbnail already exists
    const hash = _cardThumbHash(card);
    const imgDiv = item.querySelector('.card-thumb-img');
    if (_thumbHashes[card.id] === hash && imgDiv?.querySelector('img')) {
      imgDiv.classList.remove('thumb-loading');
      continue;
    }

    const orientation = getCardOrientation(card);
    const { w, h } = getPaperPx(state.settings.paperSize, orientation);
    offscreen.style.width = w + 'px';
    offscreen.style.height = h + 'px';

    const overridePx = card.paperSize ? getPaperPx(card.paperSize, orientation) : null;
    offscreen.innerHTML = buildCardHTML(card, state.settings, true, overridePx);
    await new Promise(r => setTimeout(r, 10));

    try {
      const canvas = await html2canvas(offscreen, {
        useCORS: true,
        allowTaint: false,
        scale: 0.18,
        backgroundColor: '#f0f0f2',
        logging: false,
        imageTimeout: 0,
      });
      if (imgDiv) {
        imgDiv.innerHTML = `<img src="${canvas.toDataURL('image/jpeg', 0.25)}">`;
        imgDiv.classList.remove('thumb-loading');
        _thumbHashes[card.id] = hash;
      }
    } catch (e) {
      if (imgDiv) {
        imgDiv.innerHTML = '<div class="thumb-loading">⚠</div>';
        imgDiv.classList.remove('thumb-loading');
      }
    }
  }
  if (genId === _thumbGenId && targetDirtyVersion === _thumbDirtyVersion) {
    _thumbRenderedVersion = targetDirtyVersion;
  }
  document.body.removeChild(offscreen);
}

export function refreshAllThumbs() {
  if (uiState.sidebarView !== 'grid') setViewMode('grid');
  const items = [...document.querySelectorAll('.fc-card-thumb-item')];
  if (items.length) _requestThumbGeneration(items);
}

export function scheduleThumbRefresh(cardId = null) {
  _thumbDirtyVersion += 1;
  // null = all cards; if different card scheduled, escalate to all
  if (cardId === null || (_pendingThumbCardId !== undefined && _pendingThumbCardId !== cardId)) {
    _pendingThumbCardId = null;
  } else {
    _pendingThumbCardId = cardId;
  }
  if (uiState.sidebarView !== 'grid') return;
  clearTimeout(_thumbRefreshTimer);
  _thumbRefreshTimer = setTimeout(() => {
    if (uiState.sidebarView !== 'grid') return;
    const allItems = [...document.querySelectorAll('.fc-card-thumb-item')];
    if (!allItems.length) { renderSidebar(); return; }
    const targetId = _pendingThumbCardId;
    _pendingThumbCardId = undefined;
    const items = targetId
      ? allItems.filter(el => el.dataset.id === targetId)
      : allItems;
    if (items.length) _requestThumbGeneration(items);
  }, 600);
}

// ── Upload (local files → base64) ─────────────────────────────────
let uploadedImages = []; // session cache: [{name, dataURL}]

function handleUploadFiles(files) {
  if (!files.length) return;
  const zone = document.getElementById("upload-drop-zone");
  const results = document.getElementById("results-upload");
  zone.style.display = "none";
  results.style.display = "";
  results.innerHTML = '<div class="search-status">Loading...</div>';

  const promises = Array.from(files).map(
    (f) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) =>
          resolve({ name: f.name, dataURL: await _compressImage(e.target.result) });
        reader.readAsDataURL(f);
      }),
  );

  Promise.all(promises).then((imgs) => {
    // merge into session cache (avoid duplicates by name)
    imgs.forEach((img) => {
      if (!uploadedImages.some((u) => u.name === img.name))
        uploadedImages.push(img);
    });
    renderUploadResults();
  });
}

function renderUploadResults() {
  const results = document.getElementById("results-upload");
  if (!uploadedImages.length) {
    results.innerHTML =
      '<div class="search-status">No images uploaded yet</div>';
    return;
  }
  results.innerHTML =
    uploadedImages
      .map(
        (img, i) =>
          `<div class="search-result-item" title="${esc(img.name)}" onclick="insertImageUrl('${esc(img.dataURL)}')">
      <img src="${img.dataURL}" loading="lazy">
    </div>`,
      )
      .join("") +
    `<div style="grid-column:1/-1;padding:6px 0">
    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('upload-drop-zone').style.display='';document.getElementById('results-upload').style.display='none'">+ Add more</button>
    <button class="btn btn-danger btn-sm" style="margin-left:6px" onclick="uploadedImages=[];document.getElementById('upload-drop-zone').style.display='';document.getElementById('results-upload').style.display='none'">Clear all</button>
  </div>`;
}

function initUploadDropZone() {
  const zone = document.getElementById("upload-drop-zone");
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () =>
    zone.classList.remove("drag-over"),
  );
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length) handleUploadFiles(files);
  });
}

// ── JSON Export Modal ───────────────────────────────────────────────
export function openJsonModal() {
  document.getElementById("json-modal").showModal();
}
export function closeJsonModal() {
  document.getElementById("json-modal").close();
}
function openJsonEditor() {
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

function showCardPanel() {
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

function closeMoreMenu() {
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

function selectProjectIcon(emoji) {
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

function exportJsonFile() {
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

function copyJsonFull() {
  _clipboardWrite(JSON.stringify(_fullSnapshot(), null, 2), 'toast.jsonCopiedFull');
  closeJsonModal();
}

function copyJsonNoImg() {
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

function copyJsonForAI() {
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

function _syncJsonLineNums() {
  const ta = document.getElementById("json-preview-textarea");
  const ln = document.getElementById("json-line-numbers");
  if (!ta || !ln) return;
  const count = (ta.value.match(/\n/g) || []).length + 1;
  let s = "";
  for (let i = 1; i <= count; i++) s += `${i}\n`;
  ln.textContent = s;
  ln.scrollTop = ta.scrollTop;
}

function openJsonPreview(text) {
  document.getElementById("json-preview-textarea").value = text;
  document.getElementById("json-preview-status").textContent = "";
  _syncJsonLineNums();
  document.getElementById("json-preview-modal").showModal();
}

function closeJsonPreview() {
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

function validateJsonPreview() {
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

function applyJsonPreview() {
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
  currentFileName = null;
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
    dispatch('CARD_UI_CHANGED');
    setDirty();
    showToast(`✓ ${filled} image${filled > 1 ? "s" : ""} fetched`);
  }
}

async function pasteJsonLoad() {
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
        pendingPasteSlot = null;
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
