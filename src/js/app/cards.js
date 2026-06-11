import html2canvas from 'html2canvas'

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

export function copyCardStyle(id) {
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

export function pasteCardStyle(id) {
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

export function openCardMenu(id, btn) {
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

export function closeCardMenu() {
  document.getElementById('card-more-menu')?.remove();
}

export function cloneCard(id) {
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

export function deleteCard(id) {
  pushUndo();
  state.cards = state.cards.filter((c) => c.id !== id);
  if (uiState.activeCardId === id) {
    uiState.activeCardId = state.cards.length
      ? state.cards[state.cards.length - 1].id
      : null;
  }
  dispatch('CARD_LIST_CHANGED');
}

export function moveCard(id, dir) {
  const i = state.cards.findIndex((c) => c.id === id);
  const j = i + dir;
  if (j < 0 || j >= state.cards.length) return;
  [state.cards[i], state.cards[j]] = [state.cards[j], state.cards[i]];
  dispatch('CARD_MOVED');
}

export function setActive(id) {
  showCardPanel();
  uiState.activeCardId = id;
  dispatch('ACTIVE_CARD_CHANGED');
}

export function setTwoUpRatio(id, value) {
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

export function initUploadDropZone() {
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
