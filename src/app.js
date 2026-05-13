
marked.use({ breaks: true });

function changePreviewZoom(delta) {
  previewZoom = delta === 0 ? 1.0 : Math.round(Math.max(0.25, Math.min(3.0, previewZoom + delta)) * 100) / 100;
  renderPreview();
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
    "set-bc": (v) => (state.settings.border.color = v),
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
  setActive(card.id);
  setDirty();
  renderSidebar();
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
  setDirty();
  renderSidebar();
  renderEditor();
  renderPreview();
}

function deleteCard(id) {
  state.cards = state.cards.filter((c) => c.id !== id);
  if (activeCardId === id) {
    activeCardId = state.cards.length
      ? state.cards[state.cards.length - 1].id
      : null;
  }
  setDirty();
  renderSidebar();
  renderEditor();
  renderPreview();
}

function moveCard(id, dir) {
  const i = state.cards.findIndex((c) => c.id === id);
  const j = i + dir;
  if (j < 0 || j >= state.cards.length) return;
  [state.cards[i], state.cards[j]] = [state.cards[j], state.cards[i]];
  setDirty();
  renderSidebar();
}

function setActive(id) {
  activeCardId = id;
  renderSidebar();
  renderEditor();
  renderPreview();
}

// ── Sidebar ────────────────────────────────────────────────────────
function setViewMode(mode) {
  sidebarView = mode;
  document.getElementById('view-list-btn').classList.toggle('active', mode === 'list');
  document.getElementById('view-grid-btn').classList.toggle('active', mode === 'grid');
  renderSidebar();
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

// ── Editor ─────────────────────────────────────────────────────────
function renderEditor() {
  const card = getActiveCard();
  const empty = document.getElementById("editor-empty");
  const content = document.getElementById("editor-content");
  if (!card) {
    empty.style.display = "";
    content.style.display = "none";
    return;
  }
  empty.style.display = "none";
  content.style.display = "";

  const slotCount = LAYOUT_SLOTS[card.layout] ?? 3;
  const slotRow = (i, hidden) => {
    const img = card.images.find((im) => im.slot === i);
    const url = img ? img.url : "";
    const hasOverride = img != null && img.size != null;
    const sizeOpts = [["cover", "Cover"], ["contain", "Contain"], ["100% auto", "Fit width"], ["auto 100%", "Fit height"]];
    const overrideHtml = url && !hidden ? `<div class="img-override-row">
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap">
          <input type="checkbox" ${hasOverride ? "checked" : ""} onchange="toggleImgOverride(${i},this.checked)">Custom</label>
        ${hasOverride ? `<select class="img-override-select" onchange="updateImgProp(${i},'size',this.value)">${sizeOpts.map(([v, l]) => `<option value="${v}"${img.size === v ? " selected" : ""}>${l}</option>`).join("")
        }</select>` : ""}
        ${hasOverride && img.size !== "cover" ? `<input type="color" value="${img.color || "#e5e7eb"}" onchange="updateImgProp(${i},'color',this.value)" title="Background color" style="width:26px;height:22px;padding:0;border:1px solid #d1d5db;border-radius:3px;cursor:pointer">` : ""}
      </div>` : "";
    return `
      <div class="image-slot-row${hidden ? " slot-hidden" : ""}" draggable="true" data-slot="${i}">
        <div class="image-slot-drag-handle" title="Drag to reorder">⠿</div>
        <div class="image-slot-thumb">
          ${url ? `<img src="${esc(url)}" onerror="this.style.display='none'">` : ""}
        </div>
        <div class="image-slot-info">
          <div class="image-slot-url">${url ? esc(url) : "No image"}</div>
          ${hidden ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px">slot ${i} — hidden in this layout</div>` : ""}
        </div>
        <div class="image-slot-btns">
          ${!hidden ? `<button class="btn btn-secondary btn-sm" onclick="openImgModal(${i})">🔍</button>` : ""}
          ${!hidden ? `<button class="btn btn-secondary btn-sm" onclick="pasteToSlot(${i})" title="Paste image from clipboard (Ctrl+V)">📋</button>` : ""}
          ${url ? `<button class="btn btn-danger btn-sm" onclick="clearSlot(${i})">✕</button>` : ""}
        </div>
        ${overrideHtml}
      </div>`;
  };
  const activeSlots = Array.from({ length: slotCount }, (_, i) => slotRow(i, false)).join("");
  const hiddenImgs = card.images.filter((im) => im.slot >= slotCount);
  const hiddenSlots = hiddenImgs.map((im) => slotRow(im.slot, true)).join("");
  const slots = activeSlots + hiddenSlots;
  const isCompoundTextLayout =
    card.layout === "2img-2txt" || card.layout === "2img-4txt" || card.layout === "8img-8txt";
  const isImgPairedLayout =
    card.layout === "2img-2txt" || card.layout === "8img-8txt";
  const sectionRows = card.layout === "fulltext" ? 10 : 4;

  const sections = card.sections
    .map((s, si) => {
      if (isImgPairedLayout) {
        const img = card.images.find((im) => im.slot === si);
        const thumb = img && img.url
          ? `<div style="width:100%;height:100%;background-image:url('${esc(img.url)}');background-size:cover;background-position:center;"></div>`
          : `<span style="font-size:16px">📷</span>`;

        const minSections = LAYOUT_SLOTS[card.layout] || 0;
        const disableDelete = card.sections.length <= minSections;
        return `
            <div class="section-row section-row--paired" id="section-${s.id}">
              <div class="pair-thumb" onclick="openImgModal(${si})" title="Click to change image">${thumb}</div>
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
                <div style="display:flex;align-items:center;gap:6px">
                  <input class="section-label-input" value="${esc(s.label)}" placeholder="Label" oninput="updateSection('${s.id}','label',this.value)">
                  <button class="icon-btn" onclick="deleteSection('${s.id}')" title="Delete section" ${disableDelete ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>🗑</button>
                </div>
                <textarea class="section-content-input" rows="4" placeholder="Text label..." oninput="updateSection('${s.id}','content',this.value)">${esc(s.content)}</textarea>
              </div>
            </div>`;
      }
      return `
          <div class="section-row" id="section-${s.id}">
            <div class="section-row-header">
              <input class="section-label-input" value="${esc(s.label)}" placeholder="Label" oninput="updateSection('${s.id}','label',this.value)">
              <button class="icon-btn" onclick="moveSection('${s.id}',-1)">↑</button>
              <button class="icon-btn" onclick="moveSection('${s.id}',1)">↓</button>
              <button class="icon-btn" onclick="deleteSection('${s.id}')">🗑</button>
            </div>
            <textarea class="section-content-input" rows="${sectionRows}" placeholder="Markdown content..." oninput="updateSection('${s.id}','content',this.value)">${esc(s.content)}</textarea>
          </div>`;
    })
    .join("");

  content.innerHTML = `
        <div class="editor-section">
      <h3>Layout</h3>
      <div class="layout-grid">${LAYOUTS.map((l) => layoutIcon(l, l === card.layout)).join("")}</div>
        </div>

    <div class="editor-section">
      <h3>Orientation</h3>
      ${cardOrientationControls()}
    </div>

    ${card.layout !== 'fullimage' &&
      card.layout !== 'fulltext' &&
      card.layout !== '2img-4txt' ? `
    <div class="editor-section">
      <h3>Image Area Height</h3>
      <div class="height-slider-row">
        <input type="range" min="20" max="90" value="${card.imageHeightPercent}"
          oninput="updateCardProp('imageHeightPercent',+this.value);this.nextElementSibling.textContent=this.value+'%'">
        <span class="height-val">${card.imageHeightPercent}%</span>
      </div>
    </div>` : ''
    }

    ${card.layout === '2img-4txt' ? (() => {
      const sp = card.imageGridSplit;
      const r = sp.row;
      const row2 = card.layout === '2img-4txt' ? Math.round((100 - r) * sp.inner / 100) : 100 - r;
      const row3 = card.layout === '2img-4txt' ? Math.round((100 - r) * (100 - sp.inner) / 100) : null;
      const label = row3 !== null ? `${r}% / ${row2}% / ${row3}%` : `${r}% / ${row2}%`;
      return `
    <div class="editor-section">
      <h3>Row split</h3>
      <span style="font-size:12px;color:#6b7280;font-family:monospace">${label}</span>
    </div>`;
    })() : ''
    }

    <div class="editor-section">
      <h3>Images (${slotCount} slots)</h3>
      <div class="image-slots">${slots}</div>
    </div>

    <div class="editor-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <h3 style="margin:0">Title</h3>
        <label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:6px">
          <input type="checkbox" ${card.hideTitle ? "checked" : ""} onchange="updateCardProp('hideTitle',this.checked)">
          Hide in card
        </label>
      </div>
      <input class="title-input" type="text" value="${esc(card.title)}" placeholder="Card title..."
        oninput="updateCardProp('title',this.value)">
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px">
        ${cardFontControls("titleFont")}
      </div>
    </div>

    <div class="editor-section">
      <h3>Sections</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px">
        ${cardFontControls("contentFont")}
      </div>
      <div class="sections-list ${isCompoundTextLayout ? "sections-list--2col" : ""}" id="sections-list">
        ${sections || '<div style="color:#555;font-size:12px;padding:8px 0">No sections — add one below</div>'}
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap">
        ${!isImgPairedLayout ? `<button class="btn btn-secondary btn-sm" onclick="addSection()">+ Add Section</button>` : ''}
        ${!isImgPairedLayout ? `<button class="btn btn-secondary btn-sm" onclick="togglePasteBlock()">📋 Paste block</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="toggleCardCssEditor()" id="card-css-btn">${card.customCss ? '💅✓' : '💅'} CSS</button>
             <button class="btn btn-secondary btn-sm" onclick="toggleDataArea()">🐞 Data</button>
      </div>
      <div id="card-css-area" style="display:${card.customCss ? '' : 'none'};margin-top:8px">
        <div style="font-size:10px;color:#9ca3af;margin-bottom:4px">Scoped to this card — use .fc-title, .fc-section__content, etc.</div>
        <textarea id="card-css-input" class="section-content-input" rows="5"
          placeholder=".fc-title { font-size: 20px; color: #6b21a8; }&#10;.fc-section__content { line-height: 1.8; }"
          oninput="updateCardCss(this.value)">${esc(card.customCss || '')}</textarea>
      </div>
      <div id="paste-block-area" style="display:none;margin-top:8px">
        <textarea id="paste-block-input" class="section-content-input" rows="6"
          placeholder="• Đặc điểm: Dạng tai, màu nâu sẫm...&#10;• Môi trường: Mọc trên thân cây gỗ mục...&#10;• Ghi chú: Thường dùng trong canh, nem."></textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-primary btn-sm" onclick="parsePasteBlock('replace')">Replace sections</button>
          <button class="btn btn-secondary btn-sm" onclick="parsePasteBlock('append')">Append</button>
          <button class="btn btn-danger btn-sm" onclick="togglePasteBlock()">Cancel</button>
        </div>
      </div>
          <div id="data-area" style="display:none;margin-top:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label style="font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Current Card Data</label>
              <div id="data-area-btns" style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" onclick="editCardData()">Edit</button>
              </div>
            </div>
            <textarea id="data-area-content" class="section-content-input" style="margin-top:6px; white-space:nowrap; overflow-x:auto;" wrap="off" rows="15" readonly></textarea>
          </div>
        </div>`;
  attachSlotDragHandlers();
  // apply initial paste-block visibility from config
  const pba = document.getElementById("paste-block-area");
  if (pba) pba.style.display = (window.FC_CONFIG || {}).pasteBlock ? "" : "none";
}

function layoutIcon(layout, selected) {
  const icons = {
    "2top-1bot": `
          <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,

    "1top-2bot": `
          <div class="lo-row" style="flex:1">
      <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,

    "1big-2small": `
          <div class="lo-row" style="flex:2">
        <div class="lo-block" style="flex:2"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:2px">
          <div class="lo-block" style="flex:1"></div>
          <div class="lo-block" style="flex:1"></div>
        </div>
          </div>
          <div class="lo-text"></div>
  `,

    "2x2": `
          <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,

    "1full": `
          <div class="lo-row" style="flex:2">
            <div class="lo-block"></div>
          </div>
          <div class="lo-text"></div>
  `,

    "1left-2right": `
          <div class="lo-row" style="flex:2">
        <div class="lo-block" style="flex:1"></div>
        <div style="flex:2;display:flex;flex-direction:column;gap:2px">
          <div class="lo-block" style="flex:1"></div>
          <div class="lo-block" style="flex:1"></div>
        </div>
          </div>
          <div class="lo-text"></div>
  `,

    "1left-3right": `
          <div class="lo-row" style="flex:2">
        <div class="lo-block" style="flex:1"></div>
        <div style="flex:2;display:flex;flex-direction:column;gap:2px">
          <div class="lo-block" style="flex:1"></div>
          <div class="lo-block" style="flex:1"></div>
          <div class="lo-block" style="flex:1"></div>
        </div>
          </div>
          <div class="lo-text"></div>
  `,

    "1top-3bot": `
          <div class="lo-row" style="flex:2">
      <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,

    // thêm mới
    "1top-1bot": `
          <div class="lo-row" style="flex:1">
      <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,
    "fullimage": `
          <div class="lo-row" style="flex:2">
      <div class="lo-block"></div>
          </div>
    `,

    "fulltext": `
          <div class="lo-text" style="flex:1;height:100%"></div>
      `,

    "2img-2txt": `
          <div class="lo-row" style="flex:2">
            <div class="lo-block"></div>
            <div class="lo-block"></div>
          </div>

          <div class="lo-row" style="flex:1;align-items:stretch">
            <div class="lo-text" style="height:auto"></div>
            <div class="lo-text" style="height:auto"></div>
          </div>
  `,

    "2img-4txt": `
          <div class="lo-row" style="flex:1">
            <div class="lo-block"></div>
            <div class="lo-block"></div>
          </div>

          <div class="lo-row" style="flex:1">
            <div class="lo-text"></div>
            <div class="lo-text"></div>
          </div>

          <div class="lo-row" style="flex:1">
            <div class="lo-text"></div>
            <div class="lo-text"></div>
          </div>
  `,

    "8img-8txt": (() => {
      const pair = '<div style="display:flex;flex-direction:column;gap:1px"><div class="lo-block" style="flex:2"></div><div class="lo-text"></div></div>';
      return '<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:2px">' + pair.repeat(8) + '</div>';
    })(),
  };

  return `
        <div class="layout-opt ${selected ? "selected" : ""}" title="${layout}" onclick="setLayout('${layout}')">
          ${icons[layout]}
        </div>`;
}

function setLayout(layout) {
  const card = getActiveCard();
  if (!card) return;
  card.layout = layout;
  card.imageGridSplit = { ...LAYOUT_SPLIT_DEFAULTS[layout] };
  if (layout === "8img-8txt") {
    while (card.sections.length < 8) card.sections.push({ label: "", content: "" });
  }
  setDirty();
  renderEditor();
  renderPreview();
  refreshAllThumbs();
}

const FIS =
  "background:#fff;border:1px solid #d1d5db;color:#1a1a2e;border-radius:4px;padding:3px 5px;font-size:12px";

function cardOrientationControls() {
  const card = getActiveCard();
  if (!card) return "";
  const useCustom = !!card.orientation;
  const effective = card.orientation || state.settings.orientation;
  return `
    <div style = "display:flex;flex-wrap:wrap;gap:8px;align-items:center" >
      <label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:6px">
        <input type="checkbox" ${useCustom ? "checked" : ""} onchange="toggleCardOrientation(this.checked)">
        Use custom orientation
      </label>

        <label style="font-size:11px;color:#6b7280">Card</label>
        <select style="${FIS};min-width:110px" onchange="setCardOrientation(this.value)" ${useCustom ? "" : "disabled"}>
          <option value="portrait" ${effective === "portrait" ? "selected" : ""}>Portrait</option>
          <option value="landscape" ${effective === "landscape" ? "selected" : ""}>Landscape</option>
        </select>
      <span style="font-size:11px;color:#6b7280">${useCustom ? "Card override active" : "Inherited from global"}</span>
    </div>`;
}

// Per-card font override controls (empty = inherit global)
function cardFontControls(key) {
  const card = getActiveCard();
  if (!card) return "";
  const override = card[key] || {};
  const global = state.settings[key] || {};
  const effective = { ...global, ...override };
  const sizeVal = override.size ?? "";
  const lhVal = override.lineHeight ?? "";
  const hasColor = "color" in override;
  const computed = key === "contentFont"
    ? `→ label: ${Math.round(effective.size * 0.78)} px · content: ${Math.round(effective.size * 0.75)} px`
    : `→ ${effective.size} px`;
  return `<label style = "font-size:11px;color:#6b7280" > Size</label >
    <input type="number" min="8" max="28" value="${sizeVal}" placeholder="${global.size}"
      style="width:64px;${FIS}" oninput="setCardFontProp('${key}','size',this.value===''?null:+this.value)">
      <label style="font-size:11px;color:#6b7280">px</label>
      <span style="font-size:10px;color:#9ca3af">${computed}</span>
      <label style="font-size:11px;color:#6b7280;display:flex;align-items:center;gap:3px">
        <input type="checkbox" ${hasColor ? "checked" : ""} onchange="toggleCardFontColor('${key}',this.checked)"> Color
      </label>
      ${hasColor ? `<input type="color" value="${override.color || global.color}" style="width:30px;height:26px;border:none;border-radius:3px;cursor:pointer;padding:0" oninput="setCardFontProp('${key}','color',this.value)">` : ""}
      <label style="font-size:11px;color:#6b7280">LH</label>
      <input type="number" min="1" max="3" step="0.1" value="${lhVal}" placeholder="${global.lineHeight}"
        style="width:64px;${FIS}" oninput="setCardFontProp('${key}','lineHeight',this.value===''?null:+this.value)">`;
}

function setCardFontProp(key, prop, val) {
  const card = getActiveCard();
  if (!card) return;
  if (val === null || val === undefined) {
    if (card[key]) {
      delete card[key][prop];
      if (!Object.keys(card[key]).length) card[key] = null;
    }
  } else {
    if (!card[key]) card[key] = {};
    card[key][prop] = val;
  }
  setDirty();
  renderPreview();
}

function toggleCardFontColor(key, enabled) {
  const card = getActiveCard();
  if (!card) return;
  if (enabled) {
    if (!card[key]) card[key] = {};
    card[key].color = state.settings[key]?.color || "#1a1a1a";
  } else {
    if (card[key]) {
      delete card[key].color;
      if (!Object.keys(card[key]).length) card[key] = null;
    }
  }
  setDirty();
  renderPreview();
  renderEditor();
}

function toggleCardOrientation(enabled) {
  const card = getActiveCard();
  if (!card) return;
  card.orientation = enabled ? (card.orientation || state.settings.orientation) : null;
  setDirty();
  renderEditor();
  renderPreview();
}

function setCardOrientation(val) {
  const card = getActiveCard();
  if (!card) return;
  card.orientation = ["portrait", "landscape"].includes(val) ? val : null;
  setDirty();
  renderEditor();
  renderPreview();
}

function updateCardProp(prop, val) {
  const card = getActiveCard();
  if (!card) return;
  card[prop] = val;
  setDirty();
  if (prop === "title") renderSidebar();
  renderPreview();
}


function toggleFontPanel() {
  const panel = document.getElementById("font-settings-panel");
  const btn = document.getElementById("btn-font-toggle");
  const open = panel.classList.toggle("open");
  btn.classList.toggle("open", open);
  btn.textContent = open ? "Aa ▴" : "Aa ▾";
}

function toggleImgOverride(slot, enabled) {
  const card = getActiveCard();
  if (!card) return;
  const img = card.images.find((im) => im.slot === slot);
  if (!img) return;
  if (enabled) {
    if (img.size == null) img.size = "cover";
  } else {
    img.size = null;
    img.color = null;
  }
  setDirty();
  renderEditor();
  renderPreview();
}

function updateImgProp(slot, key, value) {
  const card = getActiveCard();
  if (!card) return;
  const img = card.images.find((im) => im.slot === slot);
  if (!img) return;
  img[key] = value;
  setDirty();
  renderEditor();
  renderPreview();
}

function clearSlot(slot) {
  const card = getActiveCard();
  if (!card) return;
  card.images = card.images.filter((i) => i.slot !== slot);
  setDirty();
  renderEditor();
  renderPreview();
}

// ── Sections ───────────────────────────────────────────────────────
function addSection() {
  const card = getActiveCard();
  if (!card) return;
  card.sections.push({ id: uid(), label: "Section", content: "" });
  setDirty();
  renderEditor();
  renderPreview();
}

function deleteSection(id) {
  const card = getActiveCard();
  if (!card) return;
  card.sections = card.sections.filter((s) => s.id !== id);
  setDirty();
  renderEditor();
  renderPreview();
}

function moveSection(id, dir) {
  const card = getActiveCard();
  if (!card) return;
  const i = card.sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= card.sections.length) return;
  [card.sections[i], card.sections[j]] = [
    card.sections[j],
    card.sections[i],
  ];
  setDirty();
  renderEditor();
  renderPreview();
}

function updateSection(id, field, val) {
  const card = getActiveCard();
  if (!card) return;
  const s = card.sections.find((s) => s.id === id);
  if (!s) return;
  s[field] = val;
  setDirty();
  renderPreview();
}


function setFontAlign(key, val) {
  state.settings[key].textAlign = val;
  document.querySelectorAll('.align-btn[data-key="' + key + '"]').forEach((b) => {
    b.classList.toggle("active", b.dataset.align === val);
  });
  setDirty();
  renderPreview();
}

// const TEXT_VALIGN_MAP = {top: "flex-start", middle: "center", bottom: "flex-end" };

function setTextVAlign(val) {
  state.settings.textVAlign = val;
  document.querySelectorAll(".valign-btn").forEach((b) => b.classList.toggle("active", b.dataset.valign === val));
  setDirty();
  renderPreview();
}

// ── Preview ────────────────────────────────────────────────────────
function renderPreview() {
  const wrap = document.getElementById("preview-card-wrap");
  const card = getActiveCard();
  if (!card) {
    wrap.innerHTML =
      '<div style="color:#555;padding:20px;text-align:center">No card selected</div>';
    return;
  }
  const { w, h } = getPaperPx(
    state.settings.paperSize,
    card.orientation || state.settings.orientation,
  );
  const panelW = document.getElementById("fc-preview-panel").clientWidth - 32;
  const scale = (panelW / w) * previewZoom;
  const zl = document.getElementById("preview-zoom-label");
  if (zl) zl.textContent = Math.round(previewZoom * 100) + "%";
  const scaledW = Math.round(w * scale);
  const scaledH = Math.round(h * scale);
  wrap.style.cssText = "width:100%;min-width:" + scaledW + "px;display:flex;justify-content:center;";
  // White paper background; card sits inside with margin applied via its own style
  wrap.innerHTML =
    '<div style="width:' +
    scaledW +
    "px;height:" +
    scaledH +
    'px;background:white;position:relative;flex-shrink:0;overflow:hidden;">' +
    '<div style="transform:scale(' +
    scale +
    ");transform-origin:top left;width:" +
    w +
    "px;height:" +
    h +
    'px;position:absolute;top:0;left:0;">' +
    buildCardHTML(card, state.settings, false) +
    "</div></div>";
  attachPreviewDragHandlers(card);
}

function attachPreviewDragHandlers(card) {
  const layout = card.layout;
  const compoundGapPx = mmToPx(state.settings.margin);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  document.querySelectorAll(".fc-grid-handle").forEach((handle) => {
    const type = handle.dataset.handle;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      handle.classList.add("dragging");
      const imgArea = handle.closest(".fc-image-area");
      const rect = imgArea.getBoundingClientRect();
      const sp = card.imageGridSplit;

      const onMove = (ev) => {
        const xPct = clamp(
          Math.round(((ev.clientX - rect.left) / rect.width) * 100),
          15, 85,
        );
        const yPct = clamp(
          Math.round(((ev.clientY - rect.top) / rect.height) * 100),
          15, 85,
        );
        if (type === "row") {
          sp.row = yPct;
          if (layout === "2img-2txt" || layout === "2img-4txt") {
            const tracks = getCompoundGridTracks(layout, sp, compoundGapPx);
            if (tracks) {
              imgArea.style.gridTemplateColumns = tracks.columns;
              imgArea.style.gridTemplateRows = tracks.rows;
            }
            if (layout === "2img-4txt") {
              const mid = ((100 - sp.row) * sp.inner) / 100;
              const innerTop = sp.row + mid;
              const ir = imgArea.querySelector('[data-handle="inner-row"]');
              if (ir) ir.style.top = innerTop + "%";
            }
            handle.style.top = sp.row + "%";
          } else {
            imgArea.style.gridTemplateRows =
              sp.row + "% " + (100 - sp.row) + "%";
            handle.style.top = sp.row + "%";
          }
          // sync inner-col handle position (layout-specific)
          const ic = imgArea.querySelector('[data-handle="inner-col"]');
          if (ic) {
            if (layout === "2top-1bot") {
              // inner-col lives in top area
              ic.style.height = sp.row + "%";
            } else {
              // inner-col lives in bottom area (1top-2bot)
              ic.style.top = sp.row + "%";
              ic.style.height = (100 - sp.row) + "%";
            }
          }
        } else if (type === "col") {
          sp.col = xPct;
          imgArea.style.gridTemplateColumns = sp.col + "% " + (100 - sp.col) + "%";
          handle.style.left = sp.col + "%";
          const ir = imgArea.querySelector('[data-handle="inner-row"]');
          if (ir) ir.style.left = sp.col + "%";
        } else if (type === "inner-col") {
          sp.inner = xPct;
          imgArea.style.gridTemplateColumns = sp.inner + "% " + (100 - sp.inner) + "%";
          handle.style.left = sp.inner + "%";
        } else if (type === "inner-row") {
          if (layout === "2img-4txt") {
            const relPct = clamp(
              Math.round(((yPct - sp.row) / (100 - sp.row)) * 100),
              15, 85,
            );
            const mid = ((100 - sp.row) * relPct) / 100;
            sp.inner = relPct;
            const tracks = getCompoundGridTracks(layout, sp, compoundGapPx);
            if (tracks) {
              imgArea.style.gridTemplateColumns = tracks.columns;
              imgArea.style.gridTemplateRows = tracks.rows;
            }
            handle.style.top = sp.row + mid + "%";
          } else {
            sp.inner = yPct;
            imgArea.style.gridTemplateRows = sp.inner + "% " + (100 - sp.inner) + "%";
            handle.style.top = sp.inner + "%";
          }
        }
      };

      const onUp = () => {
        handle.classList.remove("dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setDirty();
        renderEditor();
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

// ── Print ──────────────────────────────────────────────────────────
function printAll() {
  const wrap = document.getElementById("preview-card-wrap");
  const orig = wrap.innerHTML;
  const styleEl = mountPrintPageStyle();
  wrap.innerHTML = state.cards
    .map((c) => {
      const orientation = getCardOrientation(c);
      return (
        '<div class="fc-print-sheet fc-print-sheet--' +
        orientation +
        '">' +
        buildCardHTML(c, state.settings, true) +
        "</div>"
      );
    })
    .join("");
  window.print();
  wrap.innerHTML = orig;
  styleEl.remove();
  renderPreview();
}

function printOne() {
  const card = getActiveCard();
  if (!card) return;
  const wrap = document.getElementById("preview-card-wrap");
  const orig = wrap.innerHTML;
  const styleEl = mountPrintPageStyle();
  wrap.innerHTML =
    '<div class="fc-print-sheet fc-print-sheet--' +
    getCardOrientation(card) +
    '">' +
    buildCardHTML(card, state.settings, true) +
    "</div>";
  window.print();
  wrap.innerHTML = orig;
  styleEl.remove();
  renderPreview();
}

function mountPrintPageStyle() {
  const existing = document.getElementById("fc-print-page-style");
  if (existing) existing.remove();
  const portrait = getPaperMm(state.settings.paperSize, "portrait");
  const landscape = getPaperMm(state.settings.paperSize, "landscape");
  const styleEl = document.createElement("style");
  styleEl.id = "fc-print-page-style";
  styleEl.textContent = `
    @media print {
      @page fc-portrait {
        size: ${portrait.w}mm ${portrait.h}mm;
        margin: 0;
      }
      @page fc-landscape {
        size: ${landscape.w}mm ${landscape.h}mm;
        margin: 0;
      }
      .fc-print-sheet--portrait {
        page: fc-portrait;
      }
      .fc-print-sheet--landscape {
        page: fc-landscape;
      }
      .fc-print-sheet {
        break-after: page;
        page-break-after: always;
      }
      .fc-print-sheet:last-child {
        break-after: auto;
        page-break-after: auto;
      }
    }
  `;
  document.head.appendChild(styleEl);
  return styleEl;
}

function _pdfName(label) {
  const dt = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}-${pad(dt.getHours())}${pad(dt.getMinutes())}`;
  const slug = (label || "untitled").trim()
    .replace(/[đĐ]/g, (c) => c === "đ" ? "d" : "D")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
  return `${slug}-${ts}.pdf`;
}

async function exportOnePDF() {
  const card = getActiveCard();
  if (!card) return alert("No card selected.");
  const { jsPDF } = window.jspdf;
  const s = state.settings;
  const orientation = getCardOrientation(card);
  const { w: pw, h: ph } = getPaperMm(s.paperSize, orientation);
  const pdf = new jsPDF({
    orientation: orientation === "landscape" ? "l" : "p",
    unit: "mm",
    format: [pw, ph],
  });
  const wrap = document.getElementById("preview-card-wrap");
  const origHTML = wrap.innerHTML;
  const origStyle = wrap.style.cssText;
  wrap.style.cssText = "width:auto;min-width:0;display:block;";
  wrap.innerHTML = buildCaptureHTML(card, s);
  const el = wrap.firstElementChild;
  await new Promise((r) => setTimeout(r, 80));
  const canvas = await html2canvas(el, {
    useCORS: true,
    allowTaint: false,
    scale: 2,
    backgroundColor: "#ffffff",
  });
  pdf.addImage(
    canvas.toDataURL("image/jpeg", 0.92),
    "JPEG",
    0,
    0,
    pw,
    ph,
  );
  pdf.save(_pdfName(card.title || state.projectName));
  wrap.innerHTML = origHTML;
  wrap.style.cssText = origStyle;
  renderPreview();
}

// ── PDF Export ────────────────────────────────────────────────────
async function exportPDF() {
  if (!state.cards.length) return alert("No cards to export.");
  const { jsPDF } = window.jspdf;
  const s = state.settings;
  const firstOrientation = getCardOrientation(state.cards[0]);
  const firstPage = getPaperMm(s.paperSize, firstOrientation);

  const pdf = new jsPDF({
    orientation: firstOrientation === "landscape" ? "l" : "p",
    unit: "mm",
    format: [firstPage.w, firstPage.h],
  });

  const wrap = document.getElementById("preview-card-wrap");
  const origHTML = wrap.innerHTML;
  const origStyle = wrap.style.cssText;
  wrap.style.cssText = "width:auto;min-width:0;display:block;";

  for (let i = 0; i < state.cards.length; i++) {
    const card = state.cards[i];
    const orientation = getCardOrientation(card);
    const { w: pw, h: ph } = getPaperMm(s.paperSize, orientation);
    wrap.innerHTML = buildCaptureHTML(card, s);
    const el = wrap.firstElementChild;

    await new Promise((r) => setTimeout(r, 80));
    const canvas = await html2canvas(el, {
      useCORS: true,
      allowTaint: false,
      scale: 2,
      backgroundColor: "#ffffff",
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0)
      pdf.addPage([pw, ph], orientation === "landscape" ? "l" : "p");
    pdf.addImage(imgData, "JPEG", 0, 0, pw, ph);
  }

  pdf.save(_pdfName(state.projectName));
  wrap.innerHTML = origHTML;
  wrap.style.cssText = origStyle;
  renderPreview();
}

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
  setDirty();
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

function applyAndSaveSettings() {
  const get = (id) => document.getElementById(id)?.value ?? "";
  const chk = (id) => document.getElementById(id)?.checked ?? false;

  const patch = {
    pasteBlock: chk("cfg-pasteBlock"),
    maxImgPx: parseInt(get("cfg-maxImgPx"), 10) || 1240,
    newCard: {
      ...((window.FC_CONFIG || {}).newCard || {}),
      layout: get("cfg-newCard-layout"),
      imageHeightPercent: parseInt(get("cfg-newCard-ihp"), 10) || 80,
    },
    paperSize: get("cfg-paperSize"),
    orientation: get("cfg-orientation"),
    margin: parseFloat(get("cfg-margin")) || 0,
    padding: parseFloat(get("cfg-padding")) || 0,
    border: {
      width: parseInt(get("cfg-border-width"), 10) || 0,
      style: get("cfg-border-style"),
      color: get("cfg-border-color"),
      radius: parseInt(get("cfg-border-radius"), 10) || 0,
    },
    image: {
      backgroundSize: get("cfg-img-size"),
      backgroundPosition: get("cfg-img-pos") || "center",
    },
    titleFont: {
      family: get("cfg-font-family") || "sans-serif",
      size: parseInt(get("cfg-font-size"), 10) || 14,
      color: get("cfg-font-color"),
      lineHeight: parseFloat(get("cfg-font-lh")) || 1.0,
    },
    contentFont: {
      family: get("cfg-cfont-family") || "sans-serif",
      size: parseInt(get("cfg-cfont-size"), 10) || 12,
      color: get("cfg-cfont-color"),
      lineHeight: parseFloat(get("cfg-cfont-lh")) || 1.1,
    },
  };

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

  // Apply paper/spacing settings to current session
  state.settings.paperSize = cfg.paperSize;
  state.settings.orientation = cfg.orientation;
  state.settings.margin = cfg.margin;
  state.settings.padding = cfg.padding;
  state.settings.border = { ...cfg.border };
  state.settings.image = { ...cfg.image };
  state.settings.titleFont = { ...cfg.titleFont };
  state.settings.contentFont = { ...cfg.contentFont };
  MAX_IMG_PX = cfg.maxImgPx ?? 1240;
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
  setDirty();
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
  // load saved pixabay key
  document.getElementById("pixabay-key").value =
    localStorage.getItem("pixabay-key") || "";
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
  const existing = card.images.find((i) => i.slot === imgModalSlot);
  if (existing) existing.url = url;
  else card.images.push({ slot: imgModalSlot, url });
  setDirty();
  closeImgModal();
  renderEditor();
  renderPreview();
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

// ── Paste image to specific slot ──────────────────────────────────
let pendingPasteSlot = null;

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
  } catch {
    // Permission denied or no image — fall back to passive paste listener
    pendingPasteSlot = slot;
    document.querySelectorAll(".image-slot-row").forEach((r, i) => {
      r.style.outline = i === slot ? "2px solid #a855f7" : "";
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
}

// ── Per-card custom CSS ────────────────────────────────────────────
function toggleCardCssEditor() {
  const area = document.getElementById("card-css-area");
  if (!area) return;
  const open = area.style.display === "none";
  area.style.display = open ? "" : "none";
  if (open) document.getElementById("card-css-input")?.focus();
}

function updateCardCss(css) {
  const card = getActiveCard();
  if (!card) return;
  card.customCss = css;
  const btn = document.getElementById("card-css-btn");
  if (btn) btn.textContent = (css ? '💅✓' : '💅') + ' CSS';
  setDirty();
  renderPreview();
}

// ── Paste block parser ────────────────────────────────────────────
function togglePasteBlock() {
  const area = document.getElementById("paste-block-area");
  if (!area) return;
  area.style.display = area.style.display === "none" ? "" : "none";
  if (area.style.display !== "none")
    document.getElementById("paste-block-input").focus();
}

function parsePasteBlock(mode) {
  const card = getActiveCard();
  if (!card) return;
  const raw = document.getElementById("paste-block-input").value;
  const parsed = [];

  for (const line of raw.split("\n")) {
    const clean = line.replace(/^[\s•\-*]+/, "").trim();
    if (!clean || /^_{2,}$/.test(clean)) continue;
    const colonIdx = clean.indexOf(":");
    if (colonIdx > 0 && colonIdx < 40) {
      parsed.push({
        id: uid(),
        label: clean.slice(0, colonIdx).trim(),
        content: clean.slice(colonIdx + 1).trim(),
      });
    } else if (parsed.length) {
      // continuation line — append to last section
      parsed[parsed.length - 1].content += "\n" + clean;
    }
  }

  if (!parsed.length) return;
  if (mode === "replace") card.sections = parsed;
  else card.sections = [...card.sections, ...parsed];

  renderEditor();
  renderPreview();
}

function toggleDataArea() {
  const area = document.getElementById("data-area");
  if (!area) return;
  const open = area.style.display === "none";
  area.style.display = open ? "" : "none";
  if (open) {
    cancelCardData(); // Dùng hàm cancel để load dữ liệu + reset UI
  }
}

function editCardData() {
  const ta = document.getElementById("data-area-content");
  const btns = document.getElementById("data-area-btns");
  if (!ta || !btns) return;
  ta.removeAttribute("readonly");
  ta.style.outline = "1px solid #6b21a8";
  ta.style.background = "#fff";
  btns.innerHTML = `
    <button class="btn btn-danger btn-sm" onclick="cancelCardData()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="saveCardData()">Apply</button>
  `;
}

function cancelCardData() {
  const ta = document.getElementById("data-area-content");
  const btns = document.getElementById("data-area-btns");
  if (!ta || !btns) return;
  ta.setAttribute("readonly", "true");
  ta.style.outline = "";
  ta.style.background = "";
  const card = getActiveCard();
  ta.value = JSON.stringify(card || {}, null, 2);
  btns.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="editCardData()">Edit</button>';
}

function saveCardData() {
  const ta = document.getElementById("data-area-content");
  const card = getActiveCard();
  if (!ta || !card) return;
  try {
    const parsed = JSON.parse(ta.value);
    const originalId = card.id; // Chống mất/trùng ID
    const idx = state.cards.findIndex(c => c.id === originalId);
    if (idx !== -1) state.cards[idx] = { ...card, ...parsed, id: originalId };
    setDirty();
    renderSidebar();
    renderEditor();
    renderPreview();
  } catch (e) {
    alert("Invalid JSON:\n" + e.message);
    ta.style.outline = "2px solid #ef4444"; // Báo lỗi viền đỏ
  }
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

// ── Drag & Drop onto image slot rows ──────────────────────────────
function initSlotDragDrop() {
  // delegated — re-init after editor re-renders
}

function swapSlots(a, b) {
  const card = getActiveCard();
  if (!card || a === b) return;
  const aImg = card.images.find((im) => im.slot === a);
  const bImg = card.images.find((im) => im.slot === b);
  if (aImg) aImg.slot = b;
  if (bImg) bImg.slot = a;
  renderEditor();
  renderPreview();
}

function attachSlotDragHandlers() {
  document.querySelectorAll(".image-slot-row").forEach((row) => {
    const slot = Number.parseInt(row.dataset.slot, 10);

    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/x-slot", slot);
      e.dataTransfer.effectAllowed = "move";
      setTimeout(() => row.classList.add("dragging"), 0);
    });
    row.addEventListener("dragend", () =>
      row.classList.remove("dragging"),
    );

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes("text/x-slot")) {
        row.classList.add("drag-over-slot");
      } else {
        row.classList.add("drag-over");
      }
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
      row.classList.remove("drag-over-slot");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      row.classList.remove("drag-over-slot");
      if (e.dataTransfer.types.includes("text/x-slot")) {
        swapSlots(
          Number.parseInt(e.dataTransfer.getData("text/x-slot"), 10),
          slot,
        );
        return;
      }
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!files.length) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const compressed = await _compressImage(ev.target.result);
        imgModalSlot = slot;
        insertImageUrl(compressed);
        if (!uploadedImages.some((u) => u.name === files[0].name))
          uploadedImages.push({ name: files[0].name, dataURL: compressed });
      };
      reader.readAsDataURL(files[0]);
    });
  });
}


// ── Panel resize ──────────────────────────────────────────────────
function initPanelResize() {
  document.querySelectorAll('.fc-panel-divider').forEach(divider => {
    divider.addEventListener('mousedown', e => {
      e.preventDefault();
      const panelId = divider.dataset.panel;
      const panel = document.getElementById(panelId);
      if (!panel) return;
      const startX = e.clientX;
      const startW = panel.offsetWidth;
      divider.classList.add('dragging');

      const onMove = ev => {
        const dx = ev.clientX - startX;
        // sidebar: drag right = wider; preview divider: drag right = narrower
        const newW = panelId === 'fc-preview-panel'
          ? Math.max(280, Math.min(800, startW - dx))
          : Math.max(120, Math.min(500, startW + dx));
        panel.style.width = newW + 'px';
        panel.style.minWidth = newW + 'px';
        if (panelId === 'fc-preview-panel') renderPreview();
      };

      const onUp = () => {
        divider.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ── Preview pan (click-drag to scroll) ────────────────────────────
function initPreviewPan() {
  const el = document.getElementById("fc-preview");
  let panning = false, startX, startY, scrollX, scrollY;

  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".fc-grid-handle")) return;
    panning = true;
    startX = e.clientX;
    startY = e.clientY;
    scrollX = el.scrollLeft;
    scrollY = el.scrollTop;
    el.classList.add("panning");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!panning) return;
    el.scrollLeft = scrollX - (e.clientX - startX);
    el.scrollTop = scrollY - (e.clientY - startY);
  });

  document.addEventListener("mouseup", () => {
    if (!panning) return;
    panning = false;
    el.classList.remove("panning");
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
  document.getElementById('view-grid-btn').classList.add('active');
  initPanelResize();
  initPreviewPan();
  renderSidebar();
  renderEditor();
  renderPreview();
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
