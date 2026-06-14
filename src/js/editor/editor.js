import TurndownService from 'turndown'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { state, uiState, getActiveCard, LAYOUTS, LAYOUT_SLOTS } from '../core/state.js'
import { layoutIcon, cardOrientationControls, FIS } from './controls.js'
import { attachSlotDragHandlers } from './sections.js'
import { esc, mdParse, renderSectionContent } from '../core/utils.js'
import { FC_CONFIG } from '../core/config.js'
import { setDirty } from '../storage/storage.js'
import { pushUndo } from '../core/undo.js'
import { t } from '../i18n.js'

// ── Editor ─────────────────────────────────────────────────────────

let _tiptapInstances = {}; // sectionId → TipTap Editor instance
let _activeEditor = null;  // currently focused TipTap instance
let _activeSectionId = null;
let _turndownService = null;

function _ensureTurndown() {
  if (!_turndownService) {
    _turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
    // Force tight list items — strip blank lines so nested lists render correctly
    _turndownService.addRule('tightListItem', {
      filter: 'li',
      replacement: (content, node, options) => {
        const parent = node.parentNode;
        let prefix;
        if (parent.nodeName === 'OL') {
          const start = parent.getAttribute('start');
          const index = Array.prototype.indexOf.call(parent.children, node);
          prefix = (start ? Number(start) + index : index + 1) + '. ';
        } else {
          prefix = options.bulletListMarker + ' ';
        }
        // Keep at most one blank line (for nested list separation), indent continuation
        const indent = ' '.repeat(prefix.length);
        const body = content.trim().replace(/\n{3,}/g, '\n\n').replace(/\n/g, '\n' + indent);
        return prefix + body + '\n';
      },
    });
    _turndownService.addRule('alignedParagraph', {
      filter: (node) => node.nodeName === 'P' && node.style && node.style.textAlign,
      replacement: (content, node) => {
        return '\n\n<p style="text-align:' + node.style.textAlign + '">' + content + '</p>\n\n';
      },
    });
  }
}

function _cleanWordHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('o\\:p, w\\:sdt, w\\:sdtContent').forEach(el => el.remove());
  div.querySelectorAll('[style]').forEach(el => {
    if (el.style.cssText.includes('mso-') || el.tagName === 'SPAN') {
      el.removeAttribute('style');
    }
  });
  div.querySelectorAll('[class]').forEach(el => {
    if (/^(Mso|mso)/i.test(el.className)) el.removeAttribute('class');
  });
  return div.innerHTML;
}

function _updateToolbarState() {
  if (!_activeEditor) return;
  const fmt = document.getElementById('editor-toolbar-format');
  const btns = fmt ? fmt.querySelectorAll('.editor-toolbar-btn[data-cmd]') : [];
  btns.forEach(btn => {
    const cmd = btn.dataset.cmd;
    let active = false;
    if (cmd === 'bold') active = _activeEditor.isActive('bold');
    else if (cmd === 'italic') active = _activeEditor.isActive('italic');
    else if (cmd === 'h1') active = _activeEditor.isActive('heading', { level: 1 });
    else if (cmd === 'h2') active = _activeEditor.isActive('heading', { level: 2 });
    else if (cmd === 'underline') active = _activeEditor.isActive('underline');
    else if (cmd === 'bulletList') active = _activeEditor.isActive('bulletList');
    else if (cmd === 'orderedList') active = _activeEditor.isActive('orderedList');
    else if (cmd === 'alignLeft' || cmd === 'alignCenter' || cmd === 'alignRight' || cmd === 'alignClear') {
      const card = getActiveCard();
      const s = _activeSectionId ? card?.sections.find(s => s.id === _activeSectionId) : null;
      if (cmd === 'alignClear') { active = !s?.textAlign; }
      else { const align = s?.textAlign || ''; active = !!align && cmd === 'align' + align.charAt(0).toUpperCase() + align.slice(1); }
    }
    btn.classList.toggle('active', active);
  });
}

export function editorToolbarCmd(cmd) {
  if (!_activeEditor) return;
  try {
    switch (cmd) {
      case 'bold': _activeEditor.chain().focus().toggleBold().run(); break;
      case 'italic': _activeEditor.chain().focus().toggleItalic().run(); break;
      case 'underline': _activeEditor.chain().focus().toggleUnderline().run(); break;
      case 'h1': _activeEditor.chain().focus().toggleHeading({ level: 1 }).run(); break;
      case 'h2': _activeEditor.chain().focus().toggleHeading({ level: 2 }).run(); break;
      case 'bulletList': _activeEditor.chain().focus().toggleBulletList().run(); break;
      case 'orderedList': _activeEditor.chain().focus().toggleOrderedList().run(); break;
      case 'alignLeft': _activeEditor.chain().focus().setTextAlign('left').run(); setActiveSectionFontProp('textAlign', 'left'); break;
      case 'alignCenter': _activeEditor.chain().focus().setTextAlign('center').run(); setActiveSectionFontProp('textAlign', 'center'); break;
      case 'alignRight': _activeEditor.chain().focus().setTextAlign('right').run(); setActiveSectionFontProp('textAlign', 'right'); break;
      case 'alignClear': _activeEditor.chain().focus().unsetTextAlign().run(); setActiveSectionFontProp('textAlign', null); break;
      case 'clearFormat': _activeEditor.chain().focus().unsetAllMarks().clearNodes().run(); break;
    }
  } catch (e) {
    console.warn('[editorToolbarCmd] editor no longer valid', e);
  }
  _updateToolbarState();
}

export function setActiveSectionFontProp(prop, val) {
  if (!_activeSectionId) return;
  const card = getActiveCard();
  if (!card) return;
  const s = card.sections.find(s => s.id === _activeSectionId);
  if (!s) return;
  s[prop] = val;
  window.dispatch('CARD_CONTENT_CHANGED');
}

function _onSectionLabelFocus(sectionId) {
  _activeSectionId = sectionId;
  _syncToolbarSectionInputs();
}

function _syncToolbarSectionInputs() {
  const labelInput = document.getElementById('toolbar-section-label-size');
  const contentInput = document.getElementById('toolbar-section-content-size');
  if (!labelInput || !contentInput) return;
  const card = getActiveCard();
  const s = _activeSectionId ? card?.sections.find(s => s.id === _activeSectionId) : null;
  labelInput.value = s?.labelSize || '';
  contentInput.value = s?.fontSize || '';
}

export function renderEditor() {
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
  _destroyTipTapInstances();

  const s = state.settings;
  const titleF = { ...s.titleFont, ...(card.titleFont || {}) };
  const contentF = { ...s.contentFont, ...(card.contentFont || {}) };
  const titleFontStyle = titleF.family ? `font-family:${titleF.family};` : '';
  const contentFontStyle = contentF.family ? `font-family:${contentF.family};` : '';

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
        ${hasOverride && img.size !== "cover" ? `<input type="color" value="${img.color || "#e5e7e4"}" onchange="updateImgProp(${i},'color',this.value)" title="${t('editor.bgColor')}" style="width:26px;height:22px;padding:0;border:1px solid #d1d5d2;border-radius:3px;cursor:pointer">` : ""}
      </div>` : "";
    return `
      <div class="image-slot-row${hidden ? " slot-hidden" : ""}" draggable="true" data-slot="${i}">
        <div class="image-slot-drag-handle" title="${t('editor.dragHandle')}">⠿</div>
        <div class="image-slot-thumb">
          ${url ? `<img src="${esc(url)}" onerror="this.style.display='none'">` : ""}
        </div>
        <div class="image-slot-info">
          <div class="image-slot-url">${url ? esc(url) : t('editor.noImage')}</div>
          ${hidden ? `<div style="font-size:10px;color:#9aa19e;margin-top:2px">${t('editor.hiddenSlot').replace('{n}', i)}</div>` : ""}
        </div>
        <div class="image-slot-btns">
          ${!hidden ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="openImgModal(${i})" title="${t('editor.search')}"><svg class="icon" style="width:14px;height:14px"><use href="#i-search"/></svg></button>` : ""}
          ${url && !hidden ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="copySlot(${i})" title="Copy image"><svg class="icon" style="width:14px;height:14px"><use href="#i-copy"/></svg></button>` : ""}
          ${!hidden ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="pasteToSlot(${i})" title="Paste image from clipboard (Ctrl+V)"><svg class="icon" style="width:14px;height:14px"><use href="#i-clipboard"/></svg></button>` : ""}
          ${url ? `<button class="btn btn-danger btn-sm btn-icon" onclick="clearSlot(${i})" title="Clear"><svg class="icon" style="width:14px;height:14px"><use href="#i-x"/></svg></button>` : ""}
        </div>
        ${overrideHtml}
      </div>`;
  };
  const activeSlots = Array.from({ length: slotCount }, (_, i) => slotRow(i, false)).join("");
  const hiddenImgs = card.images.filter((im) => im.slot >= slotCount);
  const hiddenSlots = hiddenImgs.map((im) => slotRow(im.slot, true)).join("");
  const slots = activeSlots + hiddenSlots;
  const isImgPairedLayout = ["2img-2txt", "3img-3txt", "8img-8txt", "img3-txt3", "6cell"].includes(card.layout);
  const sectionRows = card.layout === "fulltext" ? 6 : 4;

  const sections = card.sections
    .map((s, si) => {
      if (isImgPairedLayout) {
        const img = card.images.find((im) => im.slot === si);
        const url = img?.url || '';
        const curSize = img?.size ?? null;
        const sizeBtns = [
          ['cover', 'Fill', 'i-img-fill'],
          ['contain', 'Contain', 'i-img-fit'],
          ['100% auto', 'Fit width', 'i-arrow-lr'],
          ['auto 100%', 'Fit height', 'i-arrow-tb'],
        ];
        const pairOverride = url ? `<div class="pair-size-group">
          ${sizeBtns.map(([v, label, icon]) => `<button class="btn btn-secondary btn-sm btn-icon${curSize === v ? ' active' : ''}" onclick="setSlotSize(${si},'${v}')" title="${label}"><svg class="icon" style="width:12px;height:12px"><use href="#${icon}"/></svg></button>`).join('')}
          ${curSize && curSize !== 'cover' ? `<input type="color" value="${img.color || '#e5e7e4'}" onchange="updateImgProp(${si},'color',this.value)" title="${t('editor.bgColor')}" class="pair-size-color">` : ''}
        </div>` : '';
        const thumb = url
          ? `<div style="width:100%;height:100%;background-image:url('${esc(url)}');background-size:${img?.size || 'cover'};background-position:center;"></div>`
          : `<span style="font-size:16px">📷</span>`;
        const thumbBtns = `
          <div class="pair-thumb-btns">
            <button class="btn btn-secondary btn-sm btn-icon" onclick="openImgModal(${si})" title="${t('editor.search')}"><svg class="icon" style="width:12px;height:12px"><use href="#i-search"/></svg></button>
            ${url ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="copySlot(${si})" title="Copy"><svg class="icon" style="width:12px;height:12px"><use href="#i-copy"/></svg></button>` : ''}
            <button class="btn btn-secondary btn-sm btn-icon" onclick="pasteToSlot(${si})" title="Paste"><svg class="icon" style="width:12px;height:12px"><use href="#i-clipboard"/></svg></button>
            ${url ? `<button class="btn btn-danger btn-sm btn-icon" onclick="clearSlot(${si})" title="Clear"><svg class="icon" style="width:12px;height:12px"><use href="#i-x"/></svg></button>` : ''}
          </div>`;

        const minSections = LAYOUT_SLOTS[card.layout] || 0;
        const disableDelete = card.sections.length <= minSections;
        return `
            <div class="section-row section-row--paired" id="section-${s.id}">
              <div class="pair-thumb-col">
                <div class="pair-thumb" onclick="openImgModal(${si})" title="${t('editor.clickImg')}">${thumb}</div>
                ${thumbBtns}
                ${pairOverride}
              </div>
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
                <div class="section-row-header">
                  <div class="section-label-input section-tiptap-editor section-label-tiptap" id="tiptap-label-${s.id}"${card.hideSectionLabels ? ' data-hidden-label="1"' : ''}></div>
                      <button class="icon-btn section-more-btn" onclick="event.stopPropagation();openSectionMenu('${s.id}',this)" title="More"><svg class="icon" style="width:14px;height:14px"><use href="#i-more"/></svg></button>
                </div>
                <div class="section-tiptap-editor" id="tiptap-${s.id}" data-section-id="${s.id}" style="${contentFontStyle}"></div>
              </div>
            </div>`;
      }
      return `
          <div class="section-row" id="section-${s.id}">
            <div class="section-row-header">
              <div class="section-label-input section-tiptap-editor section-label-tiptap" id="tiptap-label-${s.id}"${card.hideSectionLabels ? ' data-hidden-label="1"' : ''}></div>
              <button class="icon-btn section-more-btn" onclick="event.stopPropagation();openSectionMenu('${s.id}',this)" title="More"><svg class="icon" style="width:14px;height:14px"><use href="#i-more"/></svg></button>
            </div>
            <div class="section-tiptap-editor" id="tiptap-${s.id}" data-section-id="${s.id}" style="${contentFontStyle}"></div>
          </div>`;
    })
    .join("");

  const _ltab = LAYOUTS.indexOf(card.layout) >= 9 ? 1 : 0;
  content.innerHTML = `
    <div class="editor-section">
      <div style="display:flex;align-items:flex-end;margin:14px 0 8px">
        <h3 style="margin:0">${t('editor.layout')}</h3>
        <div class="layout-tabs">
          <button class="layout-tab ${_ltab === 0 ? 'active' : ''}" onclick="switchLayoutTab(0,this)">Basic</button>
          <button class="layout-tab ${_ltab === 1 ? 'active' : ''}" onclick="switchLayoutTab(1,this)">Special</button>
        </div>
      </div>
      <div id="layout-tab-0" class="layout-grid" style="${_ltab !== 0 ? 'display:none' : ''}">${LAYOUTS.slice(0, 9).map((l) => layoutIcon(l, l === card.layout)).join("")}</div>
      <div id="layout-tab-1" class="layout-grid" style="${_ltab !== 1 ? 'display:none' : ''}">${LAYOUTS.slice(9).map((l) => layoutIcon(l, l === card.layout)).join("")}</div>
    </div>

    <div class="editor-section">
      <h3>${t('editor.orientation')}</h3>
      ${cardOrientationControls()}
    </div>

    ${card.layout === 'txtgrid' ? `
    <div class="editor-section">
      <h3>Grid</h3>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="font-size:11px;color:#6b7672">Cols</label>
        <input type="number" min="1" max="10" value="${card.textCols ?? 3}"
          style="width:58px;${FIS}" oninput="setTextCols(+this.value)" onchange="renderEditor()">
        <label style="font-size:11px;color:#6b7672">Rows</label>
        <input type="number" min="1" max="10" value="${card.textRows ?? 1}"
          style="width:58px;${FIS}" oninput="setTextRows(+this.value)" onchange="renderEditor()">
        <label style="font-size:11px;color:#6b7672">Height</label>
        <input type="number" min="20" max="500" value="${card.textCardHeight ?? ''}" placeholder="auto"
          style="width:72px;${FIS}"
          oninput="updateCardProp('textCardHeight',this.value===''?null:+this.value)">
        <span style="font-size:11px;color:#9aa19e">px</span>
      </div>
    </div>` : ''}

    ${!['fullimage', 'fulltext', '2img-4txt', 'txtgrid', 'img3-txt3'].includes(card.layout) ? `
    <div class="editor-section">
      <h3>${t('editor.imgHeight')}</h3>
      <div class="height-slider-row">
        <input type="range" min="20" max="90" value="${card.imageHeightPercent}"
          oninput="updateCardProp('imageHeightPercent',+this.value);this.nextElementSibling.textContent=this.value+'%'">
        <span class="height-val">${card.imageHeightPercent}%</span>
      </div>
    </div>` : ''}

    ${card.layout === 'img3-txt3' ? `
    <div class="editor-section">
      <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" ${card.imageGridSplit?.rowBorders ? 'checked' : ''}
          onchange="updateGridSplitProp('rowBorders', this.checked)">
        Row borders
      </label>
    </div>` : ''}

    ${card.layout !== 'txtgrid' && !isImgPairedLayout ? `
    <div class="editor-section">
      <h3>${t('editor.images')} (${slotCount} ${t('editor.slots')})</h3>
      <div class="image-slots">${slots}</div>
    </div>` : ''}

    <div class="editor-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <h3 style="margin:0">${t('editor.title')}</h3>
        <label style="font-size:12px;color:#1f2a28;display:flex;align-items:center;gap:6px">
          <input type="checkbox" ${card.hideTitle ? "checked" : ""} onchange="updateCardProp('hideTitle',this.checked)">
          ${t('editor.hideTitle')}
        </label>
      </div>
      <input class="title-input" type="text" value="${esc(card.title)}" placeholder="${t('editor.titlePh')}"
        onfocus="pushUndo()" oninput="updateCardProp('title',this.value)"
        style="${titleFontStyle}${card.hideTitle ? 'background:#f1f2ef;color:#9aa19e' : ''}">
    </div>

    <div class="editor-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:0">
        <h3 style="margin:0">${t('editor.sections')}</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <label style="font-size:12px;color:#1f2a28;display:flex;align-items:center;gap:6px">
            <input type="checkbox" ${card.hideSectionLabels ? "checked" : ""} onchange="updateCardProp('hideSectionLabels',this.checked)">
            ${t('editor.hideLabels')}
          </label>
          ${card.layout === 'fulltext' ? `
          <label style="font-size:12px;color:#1f2a28;display:flex;align-items:center;gap:6px">
            <input type="checkbox" ${card.inlineSections ? "checked" : ""} onchange="updateCardProp('inlineSections',this.checked)">
            Inline
          </label>` : ''}
        </div>
      </div>
      <div id="editor-toolbar" class="editor-toolbar">
        ${card.layout !== 'txtgrid' ? `
        <div class="editor-toolbar-group">
          <label class="editor-toolbar-label">${t('toolbar.labelSizeAll')}</label>
          <input type="number" id="toolbar-card-label-size" class="editor-toolbar-size" min="6" max="72" step="1" placeholder="–" value="${card.labelSize ?? ''}" oninput="updateCardProp('labelSize',this.value===''?null:+this.value)">
          <label class="editor-toolbar-label">${t('toolbar.contentSizeAll')}</label>
          <input type="number" id="toolbar-card-content-size" class="editor-toolbar-size" min="6" max="72" step="1" placeholder="–" value="${card.contentSize ?? ''}" oninput="updateCardProp('contentSize',this.value===''?null:+this.value)">
        </div>
        <div class="editor-toolbar-divider"></div>
        ` : ''}
        ${card.layout !== 'txtgrid' ? `
        <div class="editor-toolbar-group">
          <label class="editor-toolbar-label">${t('toolbar.labelSize')}</label>
          <input type="number" id="toolbar-section-label-size" class="editor-toolbar-size" min="6" max="72" step="1" placeholder="–" oninput="setActiveSectionFontProp('labelSize',this.value===''?null:+this.value)">
          <label class="editor-toolbar-label">${t('toolbar.contentSize')}</label>
          <input type="number" id="toolbar-section-content-size" class="editor-toolbar-size" min="6" max="72" step="1" placeholder="–" oninput="setActiveSectionFontProp('fontSize',this.value===''?null:+this.value)">
        </div>
        <div class="editor-toolbar-divider"></div>
        ` : ''}
        <div class="editor-toolbar-format" id="editor-toolbar-format">
          ${card.layout === 'txtgrid' ? `
          <div class="editor-toolbar-group">
            <label class="editor-toolbar-label">${t('toolbar.gridFontSize')}</label>
            <input type="number" id="toolbar-grid-font-size" class="editor-toolbar-size" min="6" max="72" step="1" placeholder="–" value="${card.gridFontSize ?? ''}" oninput="updateCardProp('gridFontSize',this.value===''?null:+this.value)">
          </div>
          <div class="editor-toolbar-divider"></div>
          ` : ''}
          <div class="editor-toolbar-group">
            <button class="editor-toolbar-btn" data-cmd="bold" onclick="editorToolbarCmd('bold')" title="Bold (Ctrl+B)"><strong>B</strong></button>
            <button class="editor-toolbar-btn" data-cmd="italic" onclick="editorToolbarCmd('italic')" title="Italic (Ctrl+I)"><em>I</em></button>
            <button class="editor-toolbar-btn" data-cmd="underline" onclick="editorToolbarCmd('underline')" title="Underline (Ctrl+U)"><u>U</u></button>
            <button class="editor-toolbar-btn" data-cmd="h1" onclick="editorToolbarCmd('h1')" title="Heading 1">H1</button>
            <button class="editor-toolbar-btn" data-cmd="h2" onclick="editorToolbarCmd('h2')" title="Heading 2">H2</button>
            <button class="editor-toolbar-btn" data-cmd="bulletList" onclick="editorToolbarCmd('bulletList')" title="Bullet list">•</button>
            <button class="editor-toolbar-btn" data-cmd="orderedList" onclick="editorToolbarCmd('orderedList')" title="Numbered list">1.</button>
          </div>
          <div class="editor-toolbar-divider"></div>
          <div class="editor-toolbar-group">
            <button class="editor-toolbar-btn" data-cmd="alignClear" onclick="editorToolbarCmd('alignClear')" title="Clear align">–</button>
            <button class="editor-toolbar-btn" data-cmd="alignLeft" onclick="editorToolbarCmd('alignLeft')" title="Align left"><svg class="icon" style="width:13px;height:13px"><use href="#i-align-left"/></svg></button>
            <button class="editor-toolbar-btn" data-cmd="alignCenter" onclick="editorToolbarCmd('alignCenter')" title="Align center"><svg class="icon" style="width:13px;height:13px"><use href="#i-align-center"/></svg></button>
            <button class="editor-toolbar-btn" data-cmd="alignRight" onclick="editorToolbarCmd('alignRight')" title="Align right"><svg class="icon" style="width:13px;height:13px"><use href="#i-align-right"/></svg></button>
          </div>
          <div class="editor-toolbar-divider"></div>
          <div class="editor-toolbar-group">
            <button class="editor-toolbar-btn" data-cmd="clearFormat" onclick="editorToolbarCmd('clearFormat')" title="Clear formatting"><svg class="icon" style="width:13px;height:13px"><use href="#i-clear-format"/></svg></button>
          </div>
        </div>
      </div>
      <div class="sections-list"
        ${card.layout === 'txtgrid' ? `style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;align-items:start"` : ''}
        id="sections-list">
        ${sections || `<div style="color:#555;font-size:12px;padding:8px 0">${t('editor.noSections')}</div>`}
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap">
        ${!isImgPairedLayout ? `<button class="btn btn-secondary btn-sm" onclick="addSection()"><svg class="icon" style="width:14px;height:14px"><use href="#i-plus"/></svg><span>${t('editor.addSection')}</span></button>` : ''}
        ${!isImgPairedLayout ? `<button class="btn btn-secondary btn-sm" onclick="togglePasteBlock()"><svg class="icon" style="width:14px;height:14px"><use href="#i-clipboard"/></svg><span>${t('editor.pasteBlock')}</span></button>` : ''}
        ${!isImgPairedLayout && card.sections.length >= 2 ? `<button class="btn btn-secondary btn-sm" onclick="mergeSections()" title="Merge all sections into one"><svg class="icon" style="width:14px;height:14px"><use href="#i-arrow-tb"/></svg><span>Merge</span></button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="toggleCardCssEditor()" id="card-css-btn"><svg class="icon" style="width:14px;height:14px"><use href="#i-braces"/></svg><span>${t('editor.css')}</span>${card.customCss ? '<span class="card-css-on">●</span>' : ''}</button>
        <button class="btn btn-secondary btn-sm" onclick="toggleDataArea()">${t('editor.data')}</button>
      </div>
      <div id="card-css-area" style="display:${card.customCss ? '' : 'none'};margin-top:8px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <label style="font-size:11px;color:#9aa19e;white-space:nowrap;flex-shrink:0">Class:</label>
          <input type="text" class="card-class-input" placeholder="vd: bird-card"
            value="${esc(card.cssClass || '')}"
            oninput="updateCardProp('cssClass', this.value)">
        </div>
        <div style="font-size:10px;color:#9aa19e;margin-bottom:4px">${t('editor.cssHint')}</div>
        <textarea id="card-css-input" class="section-content-input" rows="5"
          placeholder=".fc-title { font-size: 20px; color: #3e9684; }&#10;.fc-section__content { line-height: 1.8; }"
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
          <label style="font-size:11px;color:#6b7672;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${t('editor.cardData')}</label>
          <div id="data-area-btns" style="display:flex;gap:4px;">
            <button class="btn btn-secondary btn-sm" onclick="editCardData()">${t('editor.edit')}</button>
          </div>
        </div>
        <textarea id="data-area-content" class="section-content-input" style="margin-top:6px;white-space:nowrap;overflow-x:auto;" wrap="off" rows="15" readonly></textarea>
      </div>
    </div>`;
  attachSlotDragHandlers();
  _initTipTapInstances(card);
  // apply initial paste-block visibility from config
  const pba = document.getElementById("paste-block-area");
  if (pba) pba.style.display = (window.FC_CONFIG || {}).pasteBlock ? "" : "none";
}

function _destroyTipTapInstances() {
  Object.values(_tiptapInstances).forEach(ed => { try { ed.destroy(); } catch (e) { } });
  _tiptapInstances = {};
  _activeEditor = null;
}

// Shared Tiptap config used by both card editor and record editor
export function tiptapBaseConfig(placeholder) {
  let _editorRef = null;
  return {
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
    ].filter(Boolean),
    onCreate({ editor }) { _editorRef = editor; },
    onDestroy() { _editorRef = null; },
    editorProps: {
      attributes: { 'data-placeholder': placeholder || '' },
      handleKeyDown(view, event) {
        if (event.key === 'Tab') {
          event.preventDefault();
          if (_editorRef) {
            if (event.shiftKey) {
              if (_editorRef.commands.liftListItem('listItem')) return true;
            } else {
              if (_editorRef.commands.sinkListItem('listItem')) return true;
            }
          }
          view.dispatch(view.state.tr.insertText('    '));
          return true;
        }
        return false;
      },
    },
  };
}

// Single-line config for label editors: Enter blurs, Tab moves to content
function _tiptapLabelConfig(placeholder) {
  const base = tiptapBaseConfig(placeholder);
  const origKeyDown = base.editorProps.handleKeyDown;
  return {
    ...base,
    editorProps: {
      ...base.editorProps,
      handleKeyDown(view, event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          view.dom.blur();
          return true;
        }
        return origKeyDown(view, event);
      },
    },
  };
}

// If content is already HTML (from new format), use as-is; otherwise convert markdown
function _contentToHtml(content) {
  if (!content) return '';
  const t = content.trimStart();
  if (t.startsWith('<')) return content;   // already HTML
  return renderSectionContent(content);  // legacy markdown → HTML (breaks:false preserves nested lists)
}

function _initTipTapInstances(card) {
  _ensureTurndown();

  card.sections.forEach((s) => {
    const el = document.getElementById('tiptap-' + s.id);
    if (!el || _tiptapInstances[s.id]) return;

    const editor = new Editor({
      element: el,
      ...(tiptapBaseConfig(t('editor.contentPh') || 'Write something...')),
      content: _contentToHtml(s.content),
    });

    editor.on('update', () => {
      s.content = editor.getHTML();
      window.dispatch('CARD_CONTENT_CHANGED');
    });

    editor.on('focus', () => {
      _activeEditor = editor;
      _activeSectionId = s.id;
      const fmt = document.getElementById('editor-toolbar-format');
      if (fmt) fmt.classList.add('active');
      _syncToolbarSectionInputs();
    });

    editor.on('blur', () => {
      pushUndo();
      setTimeout(() => {
        const anyFocused = Object.values(_tiptapInstances).some(ed => ed.isFocused);
        const toolbarHasFocus = document.getElementById('editor-toolbar')?.contains(document.activeElement);
        const labelInputFocused = document.activeElement?.classList.contains('section-label-input');
        if (anyFocused || toolbarHasFocus || labelInputFocused) return;
        _activeEditor = null;
        _activeSectionId = null;
        const fmt = document.getElementById('editor-toolbar-format');
        if (fmt) fmt.classList.remove('active');
        _syncToolbarSectionInputs();
      }, 150);
    });

    editor.on('selectionUpdate', () => _updateToolbarState());
    editor.on('transaction', () => _updateToolbarState());

    el.addEventListener('paste', (e) => {
      const html = e.clipboardData?.getData('text/html');
      if (!html || !html.includes('mso-')) return;
      e.preventDefault();
      editor.commands.insertContent(_cleanWordHtml(html));
    });

    _tiptapInstances[s.id] = editor;

    // Label editor (single-line)
    const labelEl = document.getElementById('tiptap-label-' + s.id);
    if (labelEl && !_tiptapInstances['label:' + s.id]) {
      const labelEditor = new Editor({
        element: labelEl,
        ...(_tiptapLabelConfig(t('editor.labelPh') || 'Label')),
        content: mdParse(s.label || ''),
      });
      labelEditor.on('update', () => {
        if (!_turndownService) return;
        s.label = _turndownService.turndown(labelEditor.getHTML());
        window.dispatch('CARD_CONTENT_CHANGED');
      });
      labelEditor.on('focus', () => {
        pushUndo();
        _activeEditor = labelEditor;
        _activeSectionId = s.id;
        const fmt = document.getElementById('editor-toolbar-format');
        if (fmt) fmt.classList.add('active');
        _syncToolbarSectionInputs();
      });
      labelEditor.on('blur', () => {
        setTimeout(() => {
          const anyFocused = Object.values(_tiptapInstances).some(ed => ed.isFocused);
          const toolbarHasFocus = document.getElementById('editor-toolbar')?.contains(document.activeElement);
          if (anyFocused || toolbarHasFocus) return;
          _activeEditor = null;
          _activeSectionId = null;
          const fmt = document.getElementById('editor-toolbar-format');
          if (fmt) fmt.classList.remove('active');
          _syncToolbarSectionInputs();
        }, 150);
      });
      labelEditor.on('selectionUpdate', () => _updateToolbarState());
      labelEditor.on('transaction', () => _updateToolbarState());
      _tiptapInstances['label:' + s.id] = labelEditor;
    }
  });
}

