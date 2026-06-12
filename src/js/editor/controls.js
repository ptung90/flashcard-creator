import { state, uiState, getActiveCard, LAYOUTS, LAYOUT_SLOTS, LAYOUT_SPLIT_DEFAULTS, HIDE_TITLE_LAYOUTS } from '../core/state.js'
import { uid, esc, getPaperPx } from '../core/utils.js'
import { FC_CONFIG } from '../core/config.js'
import { setDirty } from '../storage/storage.js'
import { pushUndo } from '../core/undo.js'
import { t } from '../i18n.js'

export function layoutIcon(layout, selected) {
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

    "img3-txt3": `
          <div class="lo-row" style="flex:1">
            <div style="flex:1;display:flex;flex-direction:column;gap:2px">
              <div class="lo-block" style="flex:1"></div>
              <div class="lo-block" style="flex:1"></div>
              <div class="lo-block" style="flex:1"></div>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;gap:2px">
              <div class="lo-text" style="flex:1;height:auto"></div>
              <div class="lo-text" style="flex:1;height:auto"></div>
              <div class="lo-text" style="flex:1;height:auto"></div>
            </div>
          </div>
        `,

    "txtgrid": `
          <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:2px">
            <div class="lo-text"></div><div class="lo-text"></div><div class="lo-text"></div>
            <div class="lo-text"></div><div class="lo-text"></div><div class="lo-text"></div>
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

    "6cell": (() => {
      const cell = '<div style="display:flex;flex-direction:column;gap:1px"><div class="lo-block" style="flex:2"></div><div style="height:3px;background:#d4e2de;border-radius:1px"></div><div class="lo-text"></div></div>';
      return '<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:2px">' + cell.repeat(6) + '</div>';
    })(),

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

export function switchLayoutTab(idx, btn) {
  btn.parentElement.querySelectorAll('.layout-tab').forEach((b, i) => b.classList.toggle('active', i === idx));
  document.getElementById('layout-tab-0').style.display = idx === 0 ? '' : 'none';
  document.getElementById('layout-tab-1').style.display = idx === 1 ? '' : 'none';
}

export function setLayout(layout) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.layout = layout;
  card.imageGridSplit = { ...LAYOUT_SPLIT_DEFAULTS[layout] };
  if (HIDE_TITLE_LAYOUTS.has(layout)) card.hideTitle = true;
  if (layout === "8img-8txt") {
    while (card.sections.length < 8) card.sections.push({ id: uid(), label: "", content: "" });
  } else if (layout === "3img-3txt" || layout === "img3-txt3") {
    while (card.sections.length < 3) card.sections.push({ id: uid(), label: "Section", content: "" });
  } else if (layout === "6cell") {
    while (card.sections.length < 6) card.sections.push({ id: uid(), label: "", content: "" });
  } else if (layout === "txtgrid") {
    if (!card.textCols) card.textCols = 3;
    if (!card.textRows) card.textRows = 1;
    const target = card.textRows * card.textCols;
    while (card.sections.length < target) card.sections.push({ id: uid(), label: "", content: "" });
  }
  setDirty();
  window.renderEditor();
  window.renderPreview();
  window.refreshAllThumbs();
  window.dispatch('LAYOUT_CHANGED');
}

export function setTextRows(n) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.textRows = Math.max(1, n || 1);
  const target = card.textRows * (card.textCols || 3);
  while (card.sections.length < target) card.sections.push({ id: uid(), label: "", content: "" });
  setDirty();
  window.renderPreview();
}

export function setTextCols(n) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.textCols = Math.max(1, n || 1);
  const target = (card.textRows || 1) * card.textCols;
  while (card.sections.length < target) card.sections.push({ id: uid(), label: "", content: "" });
  setDirty();
  window.renderPreview();
}

export const FIS =
  "background:#fff;border:1px solid #d1d5d2;color:#1f2a28;border-radius:4px;padding:3px 5px;font-size:12px";

export function cardOrientationControls() {
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
      ${useCustom ? "" : `<span style="font-size:11px;color:#9aa19e">${t('editor.fromGlobal')}</span>`}
    </div>`;
}

const _FL = `font-size:11px;color:#6b7672`;

// Per-card font override controls (empty = inherit global)
export function cardFontControls(key) {
  const card = getActiveCard();
  if (!card) return "";
  const override = card[key] || {};
  const global = state.settings[key] || {};
  const sizeVal = override.size ?? "";
  const lhVal = override.lineHeight ?? "";
  const hasColor = "color" in override;
  const weightOpts = [['0', '–'], ['300', 'Light'], ['400', 'Normal'], ['500', 'Medium'], ['600', 'SemiBold'], ['700', 'Bold'], ['900', 'Black']]
    .map(([v, l]) => `<option value="${v}" ${(!override.weight && v === '0') || override.weight == v ? 'selected' : ''}>${l}</option>`).join('');
  const alignBtns = [['left', '#i-align-left'], ['center', '#i-align-center'], ['right', '#i-align-right'], ['justify', '#i-align-justify']]
    .map(([a, ic]) => `<button class="align-btn${override.textAlign === a ? ' active' : ''}" onclick="setCardFontAlign('${key}','${a}')" title="${a}"><svg class="icon" style="width:13px;height:13px"><use href="${ic}"/></svg></button>`).join('');
  const _bg = (hasVal) => hasVal ? 'background:#fff;border-color:#60b0a0' : 'background:#f1f2ef';
  return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%">
    <label style="${_FL}">Size</label>
    <input type="number" min="8" max="72" value="${sizeVal}" placeholder="${global.size}"
      style="width:56px;${FIS};${_bg(sizeVal !== '')}" oninput="setCardFontProp('${key}','size',this.value===''?null:+this.value);this.style.background=this.value===''?'#f1f2ef':'#fff';this.style.borderColor=this.value===''?'#d1d5d2':'#60b0a0'">
    <span style="${_FL}">px</span>
    <label style="${_FL};display:flex;align-items:center;gap:4px">
      <input type="checkbox" ${hasColor ? 'checked' : ''} onchange="toggleCardFontColor('${key}',this.checked)"> Color
    </label>
    ${hasColor ? `<input type="color" value="${override.color || global.color}" style="width:28px;height:24px;border:none;border-radius:3px;cursor:pointer;padding:0" oninput="setCardFontProp('${key}','color',this.value)">` : ''}
    <label style="${_FL}">LH</label>
    <input type="number" min="1" max="3" step="0.1" value="${lhVal}" placeholder="${global.lineHeight}"
      style="width:56px;${FIS};${_bg(lhVal !== '')}" oninput="setCardFontProp('${key}','lineHeight',this.value===''?null:+this.value);this.style.background=this.value===''?'#f1f2ef':'#fff';this.style.borderColor=this.value===''?'#d1d5d2':'#60b0a0'">
    <label style="${_FL}">W</label>
    <select style="${FIS};width:auto;${_bg(!!override.weight)}" onchange="setCardFontProp('${key}','weight',this.value==='0'?null:+this.value);this.style.background=this.value==='0'?'#f1f2ef':'#fff';this.style.borderColor=this.value==='0'?'#d1d5d2':'#60b0a0'">${weightOpts}</select>
    <div class="align-btn-group">
      <button class="align-btn${'textAlign' in override ? '' : ' active'}" onclick="setCardFontAlign('${key}',null)" title="inherit">–</button>
      ${alignBtns}
    </div>
  </div>`;
}

export function setCardFontAlign(key, val) {
  setCardFontProp(key, 'textAlign', val);
  const group = event?.target?.closest?.('.align-btn-group');
  if (group) {
    group.querySelectorAll('.align-btn').forEach(b =>
      b.classList.toggle('active', b.title === (val || 'inherit'))
    );
  }
}

export function setCardFontProp(key, prop, val) {
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
  window.renderPreview();
  window.dispatch('CARD_CONTENT_CHANGED');
}

export function toggleCardFontColor(key, enabled) {
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
  window.renderPreview();
  window.renderEditor();
  window.dispatch('CARD_UI_CHANGED');
}

export function toggleCardOrientation(enabled) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.orientation = enabled ? (card.orientation || state.settings.orientation) : null;
  setDirty();
  window.renderEditor();
  window.renderPreview();
  window.dispatch('CARD_UI_CHANGED');
}

export function setCardOrientation(val) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.orientation = ["portrait", "landscape"].includes(val) ? val : null;
  setDirty();
  window.renderEditor();
  window.renderPreview();
  window.dispatch('CARD_UI_CHANGED');
}

export function updateCardProp(prop, val) {
  const card = getActiveCard();
  if (!card) return;
  card[prop] = val;
  setDirty();
  if (prop === "title") window.renderSidebar();
  if (prop === "hideTitle" || prop === "hideSectionLabels") window.renderEditor();
  window.renderPreview();
  window.dispatch(prop === "title" ? "CARD_TITLE_CHANGED" : "CARD_CONTENT_CHANGED");
}

export function updateGridSplitProp(key, val) {
  const card = getActiveCard();
  if (!card) return;
  if (!card.imageGridSplit) card.imageGridSplit = {};
  card.imageGridSplit[key] = val;
  setDirty();
  window.renderPreview();
  window.dispatch("CARD_CONTENT_CHANGED");
}


export function _syncBdSwatch() {
  const swatch = document.getElementById("bd-swatch");
  const color = document.getElementById("set-bc")?.value;
  if (swatch && color) swatch.style.background = color;
}

export function setSlotSize(slot, val) {
  const card = getActiveCard();
  if (!card) return;
  const img = card.images.find((im) => im.slot === slot);
  if (!img) return;
  if (img.size === val) { img.size = null; img.color = null; }
  else img.size = val;
  setDirty();
  window.dispatch('CARD_UI_CHANGED');
}

export function toggleImgOverride(slot, enabled) {
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
  window.dispatch('CARD_UI_CHANGED');
}

export function updateImgProp(slot, key, value) {
  const card = getActiveCard();
  if (!card) return;
  const img = card.images.find((im) => im.slot === slot);
  if (!img) return;
  img[key] = value;
  window.dispatch('CARD_UI_CHANGED');
}

export function clearSlot(slot) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.images = card.images.filter((i) => i.slot !== slot);
  window.dispatch('CARD_UI_CHANGED');
}
