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
          <input type="checkbox" ${hasOverride ? "checked" : ""} onchange="toggleImgOverride(${i},this.checked)">${t('editor.custom')}</label>
        ${hasOverride ? `<select class="img-override-select" onchange="updateImgProp(${i},'size',this.value)">${sizeOpts.map(([v, l]) => `<option value="${v}"${img.size === v ? " selected" : ""}>${l}</option>`).join("")
        }</select>` : ""}
        ${hasOverride && img.size !== "cover" ? `<input type="color" value="${img.color || "#e5e7eb"}" onchange="updateImgProp(${i},'color',this.value)" title="${t('editor.bgColor')}" style="width:26px;height:22px;padding:0;border:1px solid #d1d5db;border-radius:3px;cursor:pointer">` : ""}
      </div>` : "";
    return `
      <div class="image-slot-row${hidden ? " slot-hidden" : ""}" draggable="true" data-slot="${i}">
        <div class="image-slot-drag-handle" title="${t('editor.dragHandle')}">⠿</div>
        <div class="image-slot-thumb">
          ${url ? `<img src="${esc(url)}" onerror="this.style.display='none'">` : ""}
        </div>
        <div class="image-slot-info">
          <div class="image-slot-url">${url ? esc(url) : t('editor.noImage')}</div>
          ${hidden ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px">${t('editor.hiddenSlot').replace('{n}', i)}</div>` : ""}
        </div>
        <div class="image-slot-btns">
          ${!hidden ? `<button class="btn btn-secondary btn-sm" onclick="openImgModal(${i})">🔍</button>` : ""}
          ${url && !hidden ? `<button class="btn btn-secondary btn-sm" onclick="copySlot(${i})" title="Copy image">⎘</button>` : ""}
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
  const sectionRows = card.layout === "fulltext" ? 6 : 4;

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
              <div class="pair-thumb" onclick="openImgModal(${si})" title="${t('editor.clickImg')}">${thumb}</div>
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
                <div class="section-row-header">
                  <input class="section-label-input" value="${esc(s.label)}" placeholder="${t('editor.labelPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','label',this.value)">
                  <button class="icon-btn" onclick="event.stopPropagation();openSectionMenu('${s.id}',this)" title="More">⋮</button>
                </div>
                <textarea class="section-content-input" rows="4" placeholder="${t('editor.pairedPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','content',this.value)">${esc(s.content)}</textarea>
              </div>
            </div>`;
      }
      return `
          <div class="section-row" id="section-${s.id}">
            <div class="section-row-header">
              <input class="section-label-input" value="${esc(s.label)}" placeholder="${t('editor.labelPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','label',this.value)">
              <button class="icon-btn" onclick="event.stopPropagation();openSectionMenu('${s.id}',this)" title="More">⋮</button>
            </div>
            <textarea class="section-content-input" rows="${sectionRows}" placeholder="${t('editor.contentPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','content',this.value)">${esc(s.content)}</textarea>
          </div>`;
    })
    .join("");

  content.innerHTML = `
    <div class="editor-section">
      <h3>${t('editor.layout')}</h3>
      <div class="layout-grid">${LAYOUTS.map((l) => layoutIcon(l, l === card.layout)).join("")}</div>
    </div>

    <div class="editor-section">
      <h3>${t('editor.orientation')}</h3>
      ${cardOrientationControls()}
    </div>

    ${card.layout !== 'fullimage' &&
      card.layout !== 'fulltext' &&
      card.layout !== '2img-4txt' ? `
    <div class="editor-section">
      <h3>${t('editor.imgHeight')}</h3>
      <div class="height-slider-row">
        <input type="range" min="20" max="90" value="${card.imageHeightPercent}"
          oninput="updateCardProp('imageHeightPercent',+this.value);this.nextElementSibling.textContent=this.value+'%'">
        <span class="height-val">${card.imageHeightPercent}%</span>
      </div>
    </div>` : ''}

    <div class="editor-section">
      <h3>${t('editor.images')} (${slotCount} ${t('editor.slots')})</h3>
      <div class="image-slots">${slots}</div>
    </div>

    <div class="editor-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <h3 style="margin:0">${t('editor.title')}</h3>
        <label style="font-size:12px;color:#1f2937;display:flex;align-items:center;gap:6px">
          <input type="checkbox" ${card.hideTitle ? "checked" : ""} onchange="updateCardProp('hideTitle',this.checked)">
          ${t('editor.hideTitle')}
        </label>
      </div>
      <input class="title-input" type="text" value="${esc(card.title)}" placeholder="${t('editor.titlePh')}"
        onfocus="pushUndo()" oninput="updateCardProp('title',this.value)">
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px">
        ${cardFontControls("titleFont")}
      </div>
    </div>

    <div class="editor-section">
      <h3>${t('editor.sections')}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px">
        ${cardFontControls("contentFont")}
      </div>
      <div class="sections-list ${isCompoundTextLayout ? "sections-list--2col" : ""}" id="sections-list">
        ${sections || `<div style="color:#555;font-size:12px;padding:8px 0">${t('editor.noSections')}</div>`}
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap">
        ${!isImgPairedLayout ? `<button class="btn btn-secondary btn-sm" onclick="addSection()">${t('editor.addSection')}</button>` : ''}
        ${!isImgPairedLayout ? `<button class="btn btn-secondary btn-sm" onclick="togglePasteBlock()">${t('editor.pasteBlock')}</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="toggleCardCssEditor()" id="card-css-btn">${card.customCss ? '💅✓' : '💅'} ${t('editor.css')}</button>
        <button class="btn btn-secondary btn-sm" onclick="toggleDataArea()">${t('editor.data')}</button>
      </div>
      <div id="card-css-area" style="display:${card.customCss ? '' : 'none'};margin-top:8px">
        <div style="font-size:10px;color:#9ca3af;margin-bottom:4px">${t('editor.cssHint')}</div>
        <textarea id="card-css-input" class="section-content-input" rows="5"
          placeholder=".fc-title { font-size: 20px; color: #6b21a8; }&#10;.fc-section__content { line-height: 1.8; }"
          oninput="updateCardCss(this.value)">${esc(card.customCss || '')}</textarea>
      </div>
      <div id="paste-block-area" style="display:none;margin-top:8px">
        <textarea id="paste-block-input" class="section-content-input" rows="6"
          placeholder="${t('editor.pasteBlockPh').replace(/\n/g, '&#10;')}"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-primary btn-sm" onclick="parsePasteBlock('replace')">${t('editor.replaceSection')}</button>
          <button class="btn btn-secondary btn-sm" onclick="parsePasteBlock('append')">${t('editor.append')}</button>
          <button class="btn btn-danger btn-sm" onclick="togglePasteBlock()">${t('editor.cancel')}</button>
        </div>
      </div>
      <div id="data-area" style="display:none;margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <label style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${t('editor.cardData')}</label>
          <div id="data-area-btns" style="display:flex;gap:4px;">
            <button class="btn btn-secondary btn-sm" onclick="editCardData()">${t('editor.edit')}</button>
          </div>
        </div>
        <textarea id="data-area-content" class="section-content-input" style="margin-top:6px;white-space:nowrap;overflow-x:auto;" wrap="off" rows="15" readonly></textarea>
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

    "3img-3txt": `
          <div class="lo-row" style="flex:2">
            <div class="lo-block"></div>
            <div class="lo-block"></div>
            <div class="lo-block"></div>
          </div>
          <div class="lo-row" style="flex:1;align-items:stretch">
            <div class="lo-text" style="height:auto"></div>
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
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.layout = layout;
  card.imageGridSplit = { ...LAYOUT_SPLIT_DEFAULTS[layout] };
  if (layout === "8img-8txt") {
    while (card.sections.length < 8) card.sections.push({ id: uid(), label: "", content: "" });
  } else if (layout === "3img-3txt") {
    while (card.sections.length < 3) card.sections.push({ id: uid(), label: "Section", content: "" });
  }
  setDirty();
  renderEditor();
  renderPreview();
  refreshAllThumbs();
  dispatch('LAYOUT_CHANGED');
}

const FIS =
  "background:#fff;border:1px solid #d1d5db;color:#1a1a2e;border-radius:4px;padding:3px 5px;font-size:12px";

function cardOrientationControls() {
  const card = getActiveCard();
  if (!card) return "";
  const useCustom = !!card.orientation;
  const effective = card.orientation || state.settings.orientation;
  const btnCls = (val) => {
    const active = effective === val;
    return `btn btn-secondary btn-sm orient-btn${active ? " active" : ""}${useCustom ? "" : " disabled"}`;
  };
  return `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#374151;cursor:pointer">
        <input type="checkbox" ${useCustom ? "checked" : ""} onchange="toggleCardOrientation(this.checked)">
        ${t('editor.override')}
      </label>
      <div class="btn-group">
        <button class="${btnCls('portrait')}" onclick="setCardOrientation('portrait')">${t('orient.portrait')}</button>
        <button class="${btnCls('landscape')}" onclick="setCardOrientation('landscape')">${t('orient.landscape')}</button>
      </div>
      ${useCustom ? "" : `<span style="font-size:11px;color:#9ca3af">${t('editor.fromGlobal')}</span>`}
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
  dispatch('CARD_CONTENT_CHANGED');
}

function toggleCardFontColor(key, enabled) {
  pushUndo();
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
  dispatch('CARD_UI_CHANGED');
}

function toggleCardOrientation(enabled) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.orientation = enabled ? (card.orientation || state.settings.orientation) : null;
  setDirty();
  renderEditor();
  renderPreview();
  dispatch('CARD_UI_CHANGED');
}

function setCardOrientation(val) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.orientation = ["portrait", "landscape"].includes(val) ? val : null;
  setDirty();
  renderEditor();
  renderPreview();
  dispatch('CARD_UI_CHANGED');
}

function updateCardProp(prop, val) {
  const card = getActiveCard();
  if (!card) return;
  card[prop] = val;
  setDirty();
  if (prop === "title") renderSidebar();
  renderPreview();
  dispatch(prop === "title" ? "CARD_TITLE_CHANGED" : "CARD_CONTENT_CHANGED");
}


function toggleFontPanel() {
  const panel = document.getElementById("font-settings-panel");
  const btn = document.getElementById("btn-font-toggle");
  const open = panel.classList.toggle("open");
  btn.classList.toggle("open", open);
  btn.textContent = open ? "Aa ▴" : "Aa ▾";
}

function _syncBdSwatch() {
  const swatch = document.getElementById("bd-swatch");
  const color = document.getElementById("set-bc")?.value;
  if (swatch && color) swatch.style.background = color;
}

function toggleBorderPanel() {
  const panel = document.getElementById("border-settings-panel");
  const btn = document.getElementById("btn-border-toggle");
  const open = panel.classList.toggle("open");
  btn.classList.toggle("open", open);
  const arrow = document.getElementById("bd-arrow");
  if (arrow) arrow.textContent = open ? "▴" : "▾";
}

function toggleImgPanel() {
  const panel = document.getElementById("img-settings-panel");
  const btn = document.getElementById("btn-img-toggle");
  const open = panel.classList.toggle("open");
  btn.classList.toggle("open", open);
  btn.textContent = open ? "Img ▴" : "Img ▾";
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
  dispatch('CARD_UI_CHANGED');
}

function updateImgProp(slot, key, value) {
  const card = getActiveCard();
  if (!card) return;
  const img = card.images.find((im) => im.slot === slot);
  if (!img) return;
  img[key] = value;
  dispatch('CARD_UI_CHANGED');
}

function clearSlot(slot) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.images = card.images.filter((i) => i.slot !== slot);
  dispatch('CARD_UI_CHANGED');
}

// ── Sections ───────────────────────────────────────────────────────
function addSection() {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.sections.push({ id: uid(), label: "Section", content: "" });
  dispatch('CARD_UI_CHANGED');
}

function deleteSection(id) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.sections = card.sections.filter((s) => s.id !== id);
  dispatch('CARD_UI_CHANGED');
}

function moveSection(id, dir) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  const i = card.sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= card.sections.length) return;
  [card.sections[i], card.sections[j]] = [
    card.sections[j],
    card.sections[i],
  ];
  dispatch('CARD_UI_CHANGED');
}

function openSectionMenu(id, btn) {
  closeSectionMenu();
  const card = getActiveCard();
  const canPaste = !!_sectionClipboard;
  const canPasteWithImg = !!(_sectionClipboard?.image);
  const minSections = LAYOUT_SLOTS[card.layout] || 0;
  const canDelete = card.sections.length > minSections;
  const isPaired = card.layout === "2img-2txt" || card.layout === "8img-8txt";
  const menu = document.createElement('div');
  menu.id = 'section-menu';
  menu.className = 'section-menu';
  menu.innerHTML = `
    <button class="section-menu-item" onclick="moveSection('${id}',-1);closeSectionMenu()"><span class="smi">↑</span> Move up</button>
    <button class="section-menu-item" onclick="moveSection('${id}',1);closeSectionMenu()"><span class="smi">↓</span> Move down</button>
    <div class="section-menu-sep"></div>
    <button class="section-menu-item" onclick="copySection('${id}');closeSectionMenu()"><span class="smi">⎘</span> Copy${isPaired ? ' text only' : ''}</button>
    ${isPaired ? `<button class="section-menu-item" onclick="copySectionWithImage('${id}');closeSectionMenu()"><span class="smi">⎘</span> Copy with image</button>` : ''}
    <button class="section-menu-item${canPaste ? '' : ' disabled'}" onclick="pasteSection('${id}');closeSectionMenu()"><span class="smi">📋</span> Paste${isPaired ? ' text only' : ''}</button>
    ${isPaired ? `<button class="section-menu-item${canPasteWithImg ? '' : ' disabled'}" onclick="pasteSectionWithImage('${id}');closeSectionMenu()"><span class="smi">📋</span> Paste with image</button>` : ''}
    <div class="section-menu-sep"></div>
    <button class="section-menu-item section-menu-item--danger${canDelete ? '' : ' disabled'}" onclick="deleteSection('${id}');closeSectionMenu()"><span class="smi">🗑</span> Delete</button>
  `;
  menu.addEventListener('click', e => e.stopPropagation());
  btn.after(menu);
  setTimeout(() => document.addEventListener('click', closeSectionMenu, { once: true }), 0);
}

function closeSectionMenu() {
  document.getElementById('section-menu')?.remove();
}

let _sectionClipboard = null;

function copySection(id) {
  const card = getActiveCard();
  if (!card) return;
  const s = card.sections.find((s) => s.id === id);
  if (!s) return;
  _sectionClipboard = { label: s.label, content: s.content };
  showToast('Section copied');
}

function pasteSection(id) {
  if (!_sectionClipboard) return;
  if (!confirm('Overwrite this section?')) return;
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  const s = card.sections.find((s) => s.id === id);
  if (!s) return;
  s.label = _sectionClipboard.label;
  s.content = _sectionClipboard.content;
  dispatch('CARD_UI_CHANGED');
}

function copySectionWithImage(id) {
  const card = getActiveCard();
  if (!card) return;
  const si = card.sections.findIndex(s => s.id === id);
  const s = card.sections[si];
  if (!s) return;
  const img = card.images.find(im => im.slot === si);
  _sectionClipboard = { label: s.label, content: s.content, image: img ? { ...img } : null };
  showToast('Pair copied');
}

function pasteSectionWithImage(id) {
  if (!_sectionClipboard?.image) return;
  if (!confirm('Overwrite this section and image?')) return;
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  const si = card.sections.findIndex(s => s.id === id);
  const s = card.sections[si];
  if (!s) return;
  s.label = _sectionClipboard.label;
  s.content = _sectionClipboard.content;
  const newImg = { ..._sectionClipboard.image, slot: si };
  const existing = card.images.find(im => im.slot === si);
  if (existing) Object.assign(existing, newImg);
  else card.images.push(newImg);
  dispatch('CARD_UI_CHANGED');
}

function updateSection(id, field, val) {
  const card = getActiveCard();
  if (!card) return;
  const s = card.sections.find((s) => s.id === id);
  if (!s) return;
  s[field] = val;
  dispatch('CARD_CONTENT_CHANGED');
}


function setFontAlign(key, val) {
  state.settings[key].textAlign = val;
  document.querySelectorAll('.align-btn[data-key="' + key + '"]').forEach((b) => {
    b.classList.toggle("active", b.dataset.align === val);
  });
  dispatch('CARD_CONTENT_CHANGED');
}

function setTextVAlign(val) {
  state.settings.textVAlign = val;
  document.querySelectorAll(".valign-btn").forEach((b) => b.classList.toggle("active", b.dataset.valign === val));
  dispatch('CARD_CONTENT_CHANGED');
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
  dispatch('CARD_CONTENT_CHANGED');
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
    const hasLabel = colonIdx > 0 && colonIdx < 40;
    parsed.push({
      id: uid(),
      label: hasLabel ? clean.slice(0, colonIdx).trim() : "",
      content: hasLabel ? clean.slice(colonIdx + 1).trim() : clean,
    });
  }

  if (!parsed.length) return;
  if (mode === "replace") card.sections = parsed;
  else card.sections = [...card.sections, ...parsed];

  dispatch('CARD_UI_CHANGED');
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
    dispatch('FULL_STATE_UPDATED');
  } catch (e) {
    alert("Invalid JSON:\n" + e.message);
    ta.style.outline = "2px solid #ef4444"; // Báo lỗi viền đỏ
  }
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
  dispatch('CARD_UI_CHANGED');
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
