
marked.use({
  breaks: true,
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
function dispatch(action) {
  const skipDirty = ['ACTIVE_CARD_CHANGED', 'VIEW_MODE_CHANGED', 'INIT_LOAD'].includes(action);
  if (!skipDirty) {
    setDirty();
  }

  switch (action) {
    case 'INIT_LOAD':
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
function changePreviewZoom(delta) {
  previewZoom = delta === 0 ? 1.0 : Math.round(Math.max(0.25, Math.min(3.0, previewZoom + delta)) * 100) / 100;
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
function changeUIZoom(delta) {
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

function addGoogleFont(src) {
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
    "set-orient": (v) => (state.settings.orientation = v),
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
    "set-font-family": (v) => (state.settings.titleFont.family = v),
    "set-font-size": (v) => (state.settings.titleFont.size = +v),
    "set-font-color": (v) => (state.settings.titleFont.color = v),
    "set-font-lh": (v) => (state.settings.titleFont.lineHeight = +v),
    "set-img-padding": (v) => (state.settings.imgPadding = +v),
  };
  for (const [id, fn] of Object.entries(ids)) {
    document.getElementById(id).addEventListener("input", (e) => {
      fn(e.target.value);
      setDirty();
      renderPreview();
    });
  }
}

function applySettingsToUI() {
  const s = state.settings;
  document.getElementById("set-paper").value = s.paperSize;
  document.getElementById("set-orient").value = s.orientation;
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
  const tf = s.titleFont || {};
  document.getElementById("set-font-family").value = tf.family || "sans-serif";
  document.getElementById("set-font-size").value = tf.size || 14;
  document.getElementById("set-font-color").value = tf.color || "#1a1a1a";
  document.getElementById("set-font-lh").value = tf.lineHeight || 1.0;
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
}

// ── Card Management ────────────────────────────────────────────────
function addCard() {
  const nc = (window.FC_CONFIG || {}).newCard || {};
  const layout = nc.layout || "2top-1bot";
  const card = {
    id: uid(),
    layout,
    imageHeightPercent: nc.imageHeightPercent ?? 55,
    imageGridSplit: { ...LAYOUT_SPLIT_DEFAULTS[layout] },
    images: [],
    title: "New Card",
    hideTitle: false,
    titleFont: null,
    contentFont: null,
    orientation: null,
    customCss: "",
    sections: (
      nc.defaultSections || [
        { label: "Đặc điểm", content: "" },
        { label: "Môi trường", content: "" },
      ]
    ).map((s) => ({ id: uid(), ...s })),
  };
  state.cards.push(card);
  activeCardId = card.id;
  dispatch('CARD_LIST_CHANGED');
}

function cloneCard(id) {
  const src = state.cards.find((c) => c.id === id);
  if (!src) return;
  const clone = JSON.parse(JSON.stringify(src));
  clone.id = uid();
  clone.sections = clone.sections.map((s) => ({ ...s, id: uid() }));
  const idx = state.cards.findIndex((c) => c.id === id);
  state.cards.splice(idx + 1, 0, clone);
  activeCardId = clone.id;
  dispatch('CARD_LIST_CHANGED');
}

function deleteCard(id) {
  state.cards = state.cards.filter((c) => c.id !== id);
  if (activeCardId === id) {
    activeCardId = state.cards.length
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
  activeCardId = id;
  dispatch('ACTIVE_CARD_CHANGED');
}

// ── Sidebar ────────────────────────────────────────────────────────
function setViewMode(mode) {
  sidebarView = mode;
  document.getElementById('view-list-btn').classList.toggle('active', mode === 'list');
  document.getElementById('view-grid-btn').classList.toggle('active', mode === 'grid');
  dispatch('VIEW_MODE_CHANGED');
}

function renderSidebar() {
  document.getElementById("card-count").textContent = state.cards.length;
  if (sidebarView === 'grid') {
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
    <div class="fc-card-item ${c.id === activeCardId ? "active" : ""}" onclick="setActive('${c.id}')">
      <span class="card-num">${i + 1}</span>
      <span class="card-title">${esc(c.title || "Untitled")}</span>
      <span class="card-actions">
        <button class="icon-btn" title="Move up" onclick="event.stopPropagation();moveCard('${c.id}',-1)">↑</button>
        <button class="icon-btn" title="Move down" onclick="event.stopPropagation();moveCard('${c.id}',1)">↓</button>
        <button class="icon-btn" title="Clone" onclick="event.stopPropagation();cloneCard('${c.id}')">⧉</button>
        <button class="icon-btn" title="Delete" onclick="event.stopPropagation();if(confirm('Delete this card?'))deleteCard('${c.id}')">🗑</button>
      </span>
    </div>
  `,
    )
    .join("");
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
      el.classList.toggle('active', state.cards[i].id === activeCardId);
      el.classList.toggle('fc-card-thumb-item--landscape', getCardOrientation(state.cards[i]) === 'landscape');
      el.classList.toggle('fc-card-thumb-item--portrait', getCardOrientation(state.cards[i]) !== 'landscape');
      const t = el.querySelector('.card-thumb-title');
      if (t) t.textContent = state.cards[i].title || 'Untitled';
    });
    if (_thumbRenderedVersion !== _thumbDirtyVersion) {
      _requestThumbGeneration(items);
    }
    return;
  }

  // Full rebuild needed (cards added/removed/reordered)
  const genId = ++_thumbGenId;
  list.innerHTML = '<div class="fc-card-grid">' + state.cards.map((c) => `
    <div class="fc-card-thumb-item ${c.id === activeCardId ? "active" : ""} ${getCardOrientation(c) === "landscape" ? "fc-card-thumb-item--landscape" : "fc-card-thumb-item--portrait"}"
         onclick="setActive('${c.id}')" data-id="${c.id}">
      <div class="card-thumb-img thumb-loading"></div>
      <div class="card-thumb-title">${esc(c.title || "Untitled")}</div>
      <div class="card-thumb-actions">
        <button class="icon-btn" title="Clone" onclick="event.stopPropagation();cloneCard('${c.id}')">⧉</button>
        <button class="icon-btn" title="Delete" onclick="event.stopPropagation();if(confirm('Delete this card?'))deleteCard('${c.id}')">🗑</button>
      </div>
    </div>
  `).join("") + '</div>';
  _generateThumbs(genId);
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

async function _generateThumbs(genId, targetItems = null) {
  const targetDirtyVersion = _thumbDirtyVersion;
  const offscreen = document.createElement('div');
  offscreen.style.cssText = 'position:fixed;top:-9999px;left:0;pointer-events:none;overflow:hidden;';
  document.body.appendChild(offscreen);

  const targetIds = targetItems ? new Set(targetItems.map(el => el.dataset.id)) : null;

  for (const card of [...state.cards]) {
    if (genId !== _thumbGenId) break;
    if (targetIds && !targetIds.has(card.id)) continue;
    const item = document.querySelector(`.fc-card-thumb-item[data-id="${card.id}"]`);
    if (!item) continue;
    const orientation = getCardOrientation(card);
    const { w, h } = getPaperPx(state.settings.paperSize, orientation);
    offscreen.style.width = w + 'px';
    offscreen.style.height = h + 'px';

    offscreen.innerHTML = buildCardHTML(card, state.settings, true);
    await new Promise(r => setTimeout(r, 30));

    try {
      const canvas = await html2canvas(offscreen, {
        useCORS: true,
        allowTaint: false,
        scale: 0.28,
        backgroundColor: '#f0f0f2',
        logging: false,
      });
      const imgDiv = item.querySelector('.card-thumb-img');
      if (imgDiv) {
        imgDiv.innerHTML = `<img src="${canvas.toDataURL('image/jpeg', 0.5)}">`;
        imgDiv.classList.remove('thumb-loading');
      }
    } catch (e) {
      const imgDiv = item.querySelector('.card-thumb-img');
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

function refreshAllThumbs() {
  if (sidebarView !== 'grid') return;
  const items = [...document.querySelectorAll('.fc-card-thumb-item')];
  if (items.length) _requestThumbGeneration(items);
}

function scheduleThumbRefresh(cardId = null) {
  _thumbDirtyVersion += 1;
  // null = all cards; if different card scheduled, escalate to all
  if (cardId === null || (_pendingThumbCardId !== undefined && _pendingThumbCardId !== cardId)) {
    _pendingThumbCardId = null;
  } else {
    _pendingThumbCardId = cardId;
  }
  if (sidebarView !== 'grid') return;
  clearTimeout(_thumbRefreshTimer);
  _thumbRefreshTimer = setTimeout(() => {
    if (sidebarView !== 'grid') return;
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

// ── Init ───────────────────────────────────────────────────────────
async function init() {
  const vEl = document.getElementById("app-version");
  if (vEl) vEl.textContent = "v" + (window.FC_VERSION || "?");
  await restoreWorkDir();
  await _autoRestore();
  bindSettings();
  applyGoogleFonts();
  applySettingsToUI();
  applyUIZoom();
  document.getElementById('view-grid-btn').classList.add('active');
  initPanelResize();
  initPreviewPan();
  dispatch('INIT_LOAD');
  initUploadDropZone();

  // Close modals on backdrop click — disabled
  // document.getElementById("img-modal").addEventListener("click", (e) => {
  //   if (e.target === e.currentTarget) closeImgModal();
  // });
  // document.getElementById("css-modal").addEventListener("click", (e) => {
  //   if (e.target === e.currentTarget) closeCssModal();
  // });
  // document.getElementById("load-modal").addEventListener("click", (e) => {
  //   if (e.target === e.currentTarget) closeLoadModal();
  // });
  // document.getElementById("settings-modal").addEventListener("click", (e) => {
  //   if (e.target === e.currentTarget) closeSettingsModal();
  // });


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
        imgModalSlot =
          Array.from({ length: slotCount }, (_, i) => i).find(
            (i) => !usedSlots.has(i),
          ) ?? 0;
      } else {
        imgModalSlot = pendingPasteSlot;
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
}

init();
