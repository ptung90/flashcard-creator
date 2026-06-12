import TurndownService from 'turndown'
import { Editor } from '@tiptap/core'
import { tiptapBaseConfig } from '../editor/editor.js'
import { state, uiState } from '../core/state.js'
import { esc, uid, getPaperPx, mdParseInline, _hashStr, mdParse, _compressImage } from '../core/utils.js'
import { FC_CONFIG } from '../core/config.js'
import { setDirty, showToast } from '../storage/storage.js'
import { t } from '../i18n.js'
import { buildCardHTML } from '../render.js'
import { newCard } from '../app/cards.js'

// ── Module state ─────────────────────────────────────────────────────
let _imgClipboard = null;
let _sortField = null;
let _sortDir = 'asc';
let _selectedIds = new Set();

// ── TurndownService (local instance for record editor) ─────────────────
let _turndownService = null;

function _ensureTurndown() {
  if (!_turndownService) {
    _turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
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

// ── Records ──────────────────────────────────────────────────────────
let _hiddenRecCols = new Set(JSON.parse(localStorage.getItem('fc_hidden_rec_cols') || '[]'));

function _saveHiddenRecCols() {
  localStorage.setItem('fc_hidden_rec_cols', JSON.stringify([..._hiddenRecCols]));
}

export function toggleRecCol(key) {
  if (_hiddenRecCols.has(key)) _hiddenRecCols.delete(key);
  else _hiddenRecCols.add(key);
  _saveHiddenRecCols();
  renderRecordsPanel();
}

export function toggleSelectRecord(id) {
  if (_selectedIds.has(id)) _selectedIds.delete(id);
  else _selectedIds.add(id);
  renderRecordsPanel();
}

export function toggleSelectAll() {
  const allIds = state.records.map(r => r.id);
  const allSelected = allIds.every(id => _selectedIds.has(id));
  if (allSelected) _selectedIds.clear();
  else allIds.forEach(id => _selectedIds.add(id));
  renderRecordsPanel();
}

export function deleteSelected() {
  if (!_selectedIds.size) return;
  const ids = [..._selectedIds];
  state.cards = state.cards.filter(c => !ids.includes(c.recordId));
  state.records = state.records.filter(r => !_selectedIds.has(r.id));
  _selectedIds.clear();
  setDirty();
  window.dispatch('CARD_LIST_CHANGED');
  renderRecordsPanel();
}

export function exportSelected() {
  if (!_selectedIds.size) return;
  window.exportRecordsJson(_selectedIds);
}

export function toggleSort(field) {
  if (_sortField === field) {
    _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _sortField = field;
    _sortDir = 'asc';
  }
  state.records.sort((a, b) => {
    const av = (a.fields[_sortField] || '').toLowerCase();
    const bv = (b.fields[_sortField] || '').toLowerCase();
    return _sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  setDirty();
  renderRecordsPanel();
}

export function toggleColMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('col-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}
export function toggleRecordsMoreMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('records-more-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}
function _linkedCardChips(recordId) {
  const chips = [];
  state.cards.forEach((c, i) => {
    const isSingle = c.recordId === recordId;
    const isCompound = !isSingle && c.packedRecordIds?.includes(recordId);
    if (!isSingle && !isCompound) return;
    const cls = isCompound ? 'rec-card-chip rec-card-chip--compound' : 'rec-card-chip';
    chips.push(`<span class="${cls}" onclick="event.stopPropagation();setActive('${c.id}')" title="${esc(c.title || 'Thẻ ' + (i + 1))}">#${i + 1}</span>`);
  });
  return chips.join('');
}

export function renderRecordsPanel() {
  const panel = document.getElementById('records-panel');
  if (!panel) return;
  if (!state.schema) {
    panel.innerHTML = `
      <div class="records-empty">
        <p>${t('rec.noSchema')}</p>
        <button class="btn btn-sm btn-secondary" onclick="openSchemaEditor()">${t('rec.setupSchema')}</button>
      </div>`;
    return;
  }

  const textFields = state.schema.fields.filter(f => f.type !== 'image');
  const compoundTemplates = state.schema.cardTemplates.filter(tmpl => tmpl.templateType === 'compound');

  const packMenuItems = compoundTemplates.length
    ? compoundTemplates.map(tmpl =>
      `<button class="records-pack-item" onclick="openPackDialog('${tmpl.id}')">${esc(tmpl.layout)}</button>`
    ).join('')
    : `<div class="records-pack-item" style="color:var(--ink-400);cursor:default;">${t('rec.noCompoundTemplates')}</div>`;

  const colMenuItems = [
    ...textFields.map(f => ({ key: 'field:' + f.key, label: f.label })),
    { key: 'status', label: t('rec.colStatus') },
    { key: 'cards', label: t('rec.colCards') },
  ].map(c => {
    const checked = !_hiddenRecCols.has(c.key) ? 'checked' : '';
    return `<label class="col-menu-item"><input type="checkbox" ${checked} onchange="toggleRecCol('${c.key}')"> ${esc(c.label)}</label>`;
  }).join('');

  const selCount = _selectedIds.size;
  const selectionBtns = selCount ? `
    <button class="btn btn-sm btn-secondary" onclick="exportSelected()">⬇ Export (${selCount})</button>
    <button class="btn btn-sm btn-danger" onclick="deleteSelected()">🗑 Delete (${selCount})</button>
  ` : '';

  const headerHtml = `
    <div class="records-header">
      <span class="records-header-title">${t('rec.title')}</span>
      ${selectionBtns}
      <button class="btn btn-sm btn-secondary" onclick="addRecord()">${t('rec.add')}</button>
      <button class="btn btn-sm btn-secondary" onclick="generateAll()">${t('rec.generateAll')}</button>
      <button class="btn btn-sm btn-secondary" onclick="syncAllPacked()" title="${t('rec.syncAllTitle')}">${t('rec.syncAll')}</button>
      <button class="btn btn-sm btn-secondary" onclick="packAll()" title="${t('rec.packAllTitle')}">${t('rec.packAll')}</button>
      <div class="records-pack-wrap">
        <button class="btn btn-sm btn-secondary" onclick="togglePackMenu(event)">${t('rec.pack')}</button>
        <div id="pack-menu">${packMenuItems}</div>
      </div>
      <div class="records-pack-wrap">
        <button class="btn btn-sm btn-secondary" onclick="toggleColMenu(event)">${t('rec.columns')}</button>
        <div id="col-menu" style="display:none">${colMenuItems}</div>
      </div>
      <button class="btn btn-sm btn-secondary" onclick="openSchemaEditor()">${t('rec.schema')}</button>
      <button class="btn btn-sm btn-primary" onclick="openAiChat('generate_records')" title="Generate new records with AI">✦ AI</button>
      <div class="records-pack-wrap">
        <button class="btn btn-sm btn-secondary" onclick="toggleRecordsMoreMenu(event)" title="More options">•••</button>
        <div id="records-more-menu" style="display:none">
          <button class="records-pack-item" onclick="exportRecordsJson();toggleRecordsMoreMenu(event)">Export JSON</button>
          <button class="records-pack-item" onclick="copyRecordsForAI();toggleRecordsMoreMenu(event)">✦ Copy for AI</button>
          <button class="records-pack-item" onclick="importRecordsJsonClick();toggleRecordsMoreMenu(event)">Import JSON</button>
          <button class="records-pack-item" onclick="pasteRecordsJson();toggleRecordsMoreMenu(event)">Paste JSON (update)</button>
          <button class="records-pack-item" onclick="pasteRecordsJson(true);toggleRecordsMoreMenu(event)">Append JSON</button>
        </div>
      </div>
      <input type="file" id="records-import-input" accept=".json" style="display:none" onchange="importRecordsJsonFile(this)">
    </div>`;

  const visibleTextFields = textFields.filter(f => !_hiddenRecCols.has('field:' + f.key));
  const showStatus = !_hiddenRecCols.has('status');
  const showCards = !_hiddenRecCols.has('cards');

  const colHeaders = visibleTextFields.map(f => {
    const isSorted = _sortField === f.key;
    const arrow = isSorted ? (_sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="rec-th-sortable${isSorted ? ' rec-th-sorted' : ''}" onclick="toggleSort('${f.key}')">${esc(f.label)}${arrow}</th>`;
  }).join('');

  const displayRecords = _sortField
    ? state.records.slice().sort((a, b) => {
        const av = (a.fields[_sortField] || '').toLowerCase();
        const bv = (b.fields[_sortField] || '').toLowerCase();
        return _sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      })
    : state.records;

  const allIds = displayRecords.map(r => r.id);
  const allSelected = allIds.length > 0 && allIds.every(id => _selectedIds.has(id));
  const someSelected = !allSelected && allIds.some(id => _selectedIds.has(id));

  const rows = displayRecords.map((rec, ri) => {
    const checked = _selectedIds.has(rec.id) ? 'checked' : '';
    const cols = visibleTextFields.map(f => {
      const val = rec.fields[f.key] ?? '';
      const preview = val.length > 120 ? val.slice(0, 120) + '…' : val;
      return `<td><span class="record-col-text">${mdParseInline(preview)}</span></td>`;
    }).join('');
    const statusTd = showStatus
      ? `<td><span class="rec-badge rec-badge--${getRecordStatus(rec)}">${getRecordStatus(rec)}</span></td>`
      : '';
    const cardsTd = showCards
      ? `<td class="rec-cards-cell">${_linkedCardChips(rec.id)}</td>`
      : '';
    return `<tr class="record-row${_selectedIds.has(rec.id) ? ' record-row--selected' : ''}" onclick="openRecordDetail('${rec.id}')" data-id="${rec.id}">
      <td class="rec-check-td" onclick="event.stopPropagation();toggleSelectRecord('${rec.id}')"><input type="checkbox" class="rec-checkbox" ${checked} onclick="event.stopPropagation();toggleSelectRecord('${rec.id}')"></td>
      <td class="rec-row-num">${ri + 1}</td>${cols}${statusTd}${cardsTd}
      <td><button class="btn btn-sm record-del-btn" onclick="event.stopPropagation();deleteRecord('${rec.id}')">✕</button></td>
    </tr>`;
  }).join('');

  const indetermAttr = someSelected ? 'data-indeterminate="1"' : '';
  const theadExtra = (showStatus ? `<th style="width:72px">${t('rec.colStatus')}</th>` : '') + (showCards ? `<th style="width:120px">${t('rec.colCards')}</th>` : '');
  const tableHtml = `
    <table class="records-table">
      <thead><tr>
        <th class="rec-check-th"><input type="checkbox" class="rec-checkbox" ${allSelected ? 'checked' : ''} ${indetermAttr} onclick="toggleSelectAll()"></th>
        <th style="width:28px">#</th>${colHeaders}${theadExtra}<th style="width:32px;"></th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="99" style="padding:12px 8px;color:var(--ink-400);font-style:italic;">${t('rec.noRecords')}</td></tr>`}</tbody>
    </table>`;

  panel.innerHTML = headerHtml + tableHtml + `<div id="record-detail" style="display:none"></div>`;
  const selectAllCb = panel.querySelector('.rec-check-th .rec-checkbox');
  if (selectAllCb && someSelected) selectAllCb.indeterminate = true;
}

export function getRecordStatus(record) {
  if (!record.fieldsHash) return 'draft';
  if (_hashStr(JSON.stringify(record.fields)) !== record.fieldsHash) return 'draft';
  return 'synced';
}

export function addRecord() {
  if (!state.schema) return;
  const rec = { id: 'rec_' + uid(), fieldsHash: '', fields: {} };
  state.schema.fields.forEach(f => {
    if (f.multilingual !== false && f.type !== 'image') {
      const empty = {};
      state.locales.forEach(l => { empty[l] = ''; });
      rec.fields[f.key] = empty;
    } else {
      rec.fields[f.key] = '';
    }
  });
  state.records.push(rec);
  setDirty();
  renderRecordsPanel();
  openRecordDetail(rec.id);
}

export function _migrateRecordFields() {
  if (!state.schema) return;
  state.schema.fields.forEach(f => {
    if (f.multilingual === false || f.type === 'image') return;
    state.records.forEach(rec => {
      const val = rec.fields[f.key];
      if (typeof val === 'string') {
        const obj = {};
        state.locales.forEach(l => { obj[l] = ''; });
        obj[state.locales[0]] = val;
        rec.fields[f.key] = obj;
      } else if (val && typeof val === 'object') {
        state.locales.forEach(l => { if (!(l in val)) val[l] = ''; });
      }
    });
  });
  if (state.records.length) setDirty();
}

export function deleteRecord(id) {
  const yes = confirm(t('rec.confirmDelete'));
  if (yes) {
    state.cards = state.cards.filter(c => c.recordId !== id);
    window.dispatch('CARD_LIST_CHANGED');
  } else {
    state.cards.filter(c => c.recordId === id).forEach(c => {
      c.recordId = null; c.templateId = null;
    });
    window.dispatch('CARD_LIST_CHANGED');
  }
  state.records = state.records.filter(r => r.id !== id);
  setDirty();
  renderRecordsPanel();
}

export function togglePackMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('pack-menu');
  if (menu) menu.classList.toggle('open');
}

// Close pack menu on outside click
document.addEventListener('click', () => {
  const m = document.getElementById('pack-menu');
  if (m) m.classList.remove('open');
});

export function openRecordDetail(id) {
  _destroyRecordTiptapInstances();
  const record = state.records.find(r => r.id === id);
  if (!record) return;
  const detail = document.getElementById('record-detail');
  if (!detail) return;

  const fields = state.schema.fields;
  const singleTemplates = state.schema.cardTemplates.filter(t => t.templateType === 'single');
  const cf = state.settings.contentFont || {};
  const contentFontStyle = cf.family ? `font-family:${cf.family};` : '';

  const fieldInputs = fields.map(f => {
    const val = record.fields[f.key] ?? '';
    let input;
    if (f.type === 'image') {
      const thumb = val
        ? `<div class="record-img-thumb" style="background-image:url('${esc(val)}')"></div>`
        : `<div class="record-img-thumb record-img-thumb--empty"><svg class="icon" style="width:18px;height:18px"><use href="#i-image"/></svg></div>`;
      input = `<div class="record-field-img" onpaste="_pasteRecordImage('${record.id}','${f.key}',event)">
        ${thumb}
        <div class="image-slot-btns">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="_pasteToRecordImage('${record.id}','${f.key}')" title="${t('rec.img.paste')}"><svg class="icon" style="width:13px;height:13px"><use href="#i-clipboard"/></svg></button>
          ${val ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="_copyRecordImage('${record.id}','${f.key}')" title="${t('rec.img.copy')}"><svg class="icon" style="width:13px;height:13px"><use href="#i-copy"/></svg></button>` : ''}
          <button class="btn btn-secondary btn-sm btn-icon" onclick="_pickRecordImage('${record.id}','${f.key}')" title="${t('rec.img.choose')}"><svg class="icon" style="width:13px;height:13px"><use href="#i-search"/></svg></button>
          ${val ? `<button class="btn btn-danger btn-sm btn-icon" onclick="_clearRecordImage('${record.id}','${f.key}')" title="${t('rec.img.clear')}"><svg class="icon" style="width:13px;height:13px"><use href="#i-x"/></svg></button>` : ''}
        </div>
      </div>`;
    } else {
      const longCls = f.type === 'text-long' ? ' rec-tiptap--long' : '';
      input = `<div class="section-tiptap-editor${longCls}" id="rec-tiptap-${f.key}" style="${contentFontStyle}"></div>`;
    }
    return `<div class="record-field-group">
      <label class="record-field-label">${esc(f.label)}</label>
      ${input}
    </div>`;
  }).join('');

  const previews = singleTemplates.map(t => {
    const px = getPaperPx(t.size || 'A6', 'portrait');
    const scale = 130 / px.w;
    const tw = Math.round(px.w * scale);
    const th = Math.round(px.h * scale);
    const tempCard = {
      ...newCard(),
      layout: t.layout,
      paperSize: t.size,
      images: (t.mapping.imageSlots || []).map((fid, slot) => {
        const fld = fields.find(x => x.id === fid);
        return { slot, url: fld ? (record.fields[fld.key] ?? '') : '' };
      }).filter(img => img.url),
      sections: (t.mapping.sections || []).filter(Boolean).map(fid => {
        const fld = fields.find(x => x.id === fid);
        return { id: uid(), label: fld?.label ?? '', content: fld ? (record.fields[fld.key] ?? '') : '' };
      })
    };
    return `<div class="record-preview-thumb">
      <div class="record-preview-thumb-label">${esc(t.size || '')} ${esc(t.layout)}</div>
      <div style="width:${tw}px;height:${th}px;overflow:hidden;position:relative;border:1px solid var(--line);border-radius:2px;flex-shrink:0;">
        <div style="transform:scale(${scale.toFixed(3)});transform-origin:top left;width:${px.w}px;height:${px.h}px;position:absolute;top:0;left:0;">
          ${buildCardHTML(tempCard, state.settings, false, px)}
        </div>
      </div>
    </div>`;
  }).join('');

  const previewSection = singleTemplates.length
    ? `<div class="record-preview-strip">
        <div class="record-field-label" style="margin-bottom:6px;">${t('rec.preview')}</div>
        ${previews}
       </div>`
    : '';

  const recToolbar = `
    <div class="editor-toolbar editor-toolbar-format" id="rec-editor-toolbar" style="padding:4px 0;margin-bottom:8px;">
      <div class="editor-toolbar-group">
        <button class="editor-toolbar-btn" data-cmd="bold"        onclick="_recToolbarCmd('bold')"       ><strong>B</strong></button>
        <button class="editor-toolbar-btn" data-cmd="italic"      onclick="_recToolbarCmd('italic')"     ><em>I</em></button>
        <button class="editor-toolbar-btn" data-cmd="underline"   onclick="_recToolbarCmd('underline')"  ><u>U</u></button>
        <button class="editor-toolbar-btn" data-cmd="h1"          onclick="_recToolbarCmd('h1')"         >H1</button>
        <button class="editor-toolbar-btn" data-cmd="h2"          onclick="_recToolbarCmd('h2')"         >H2</button>
        <button class="editor-toolbar-btn" data-cmd="bulletList"  onclick="_recToolbarCmd('bulletList')" >•</button>
        <button class="editor-toolbar-btn" data-cmd="orderedList" onclick="_recToolbarCmd('orderedList')">1.</button>
      </div>
      <div class="editor-toolbar-divider"></div>
      <div class="editor-toolbar-group">
        <button class="editor-toolbar-btn" data-cmd="alignClear"  onclick="_recToolbarCmd('alignClear')" >–</button>
        <button class="editor-toolbar-btn" data-cmd="alignLeft"   onclick="_recToolbarCmd('alignLeft')"  ><svg class="icon" style="width:13px;height:13px"><use href="#i-align-left"/></svg></button>
        <button class="editor-toolbar-btn" data-cmd="alignCenter" onclick="_recToolbarCmd('alignCenter')"><svg class="icon" style="width:13px;height:13px"><use href="#i-align-center"/></svg></button>
        <button class="editor-toolbar-btn" data-cmd="alignRight"  onclick="_recToolbarCmd('alignRight')" ><svg class="icon" style="width:13px;height:13px"><use href="#i-align-right"/></svg></button>
      </div>
      <div class="editor-toolbar-divider"></div>
      <div class="editor-toolbar-group">
        <button class="editor-toolbar-btn" data-cmd="clearFormat" onclick="_recToolbarCmd('clearFormat')" title="${t('rec.toolbar.clearFormat')}"><svg class="icon" style="width:13px;height:13px"><use href="#i-clear-format"/></svg></button>
      </div>
    </div>`;

  const linkedChips = _linkedCardChips(record.id);

  detail.style.display = 'block';
  detail.innerHTML = `
    <div class="record-detail-sticky">
      <div class="record-detail-header">
        <div class="record-detail-title-area">
          <span class="record-detail-title">${t('rec.editRecord')}</span>
          ${linkedChips ? `<div class="record-detail-chips">${linkedChips}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-sm btn-primary" onclick="syncRecord('${record.id}')">${t('rec.sync')}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteRecord('${record.id}')" title="Delete record">🗑</button>
          <button class="btn btn-sm" onclick="document.getElementById('record-detail').style.display='none'">✕</button>
        </div>
      </div>
      ${recToolbar}
    </div>
    <div class="record-detail-body">
      ${fieldInputs}
      ${previewSection}
    </div>
  `;
  _initRecordTiptapInstances(record);
}

function _setRecordField(recordId, key, value) {
  const record = state.records.find(r => r.id === recordId);
  if (!record) return;
  record.fields[key] = value;
  setDirty();
  openRecordDetail(recordId);
}

export function _pickRecordImage(recordId, key) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const compressed = await _compressImage(ev.target.result);
      _setRecordField(recordId, key, compressed);
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

export function _clearRecordImage(recordId, key) {
  _setRecordField(recordId, key, '');
}

export function _copyRecordImage(recordId, key) {
  const record = state.records.find(r => r.id === recordId);
  if (!record) return;
  const url = record.fields[key];
  if (!url) return;
  _imgClipboard = { url, slot: 0 };
  showToast(t('rec.toast.imageCopied'));
}

export async function _pasteToRecordImage(recordId, key) {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find(t => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const compressed = await _compressImage(ev.target.result);
          _setRecordField(recordId, key, compressed);
        };
        reader.readAsDataURL(blob);
        return;
      }
    }
    if (_imgClipboard?.url) _setRecordField(recordId, key, _imgClipboard.url);
  } catch {
    if (_imgClipboard?.url) _setRecordField(recordId, key, _imgClipboard.url);
  }
}

export function _pasteRecordImage(recordId, key, e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (!item.type.startsWith('image/')) continue;
    e.preventDefault();
    const file = item.getAsFile();
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const compressed = await _compressImage(ev.target.result);
      _setRecordField(recordId, key, compressed);
    };
    reader.readAsDataURL(file);
    return;
  }
}

let _recordTiptapInstances = {};
let _activeRecordEditor = null;

export function _recToolbarCmd(cmd) {
  if (!_activeRecordEditor) return;
  try {
    switch (cmd) {
      case 'bold': _activeRecordEditor.chain().focus().toggleBold().run(); break;
      case 'italic': _activeRecordEditor.chain().focus().toggleItalic().run(); break;
      case 'underline': _activeRecordEditor.chain().focus().toggleUnderline().run(); break;
      case 'h1': _activeRecordEditor.chain().focus().toggleHeading({ level: 1 }).run(); break;
      case 'h2': _activeRecordEditor.chain().focus().toggleHeading({ level: 2 }).run(); break;
      case 'bulletList': _activeRecordEditor.chain().focus().toggleBulletList().run(); break;
      case 'orderedList': _activeRecordEditor.chain().focus().toggleOrderedList().run(); break;
      case 'alignLeft': _activeRecordEditor.chain().focus().setTextAlign('left').run(); break;
      case 'alignCenter': _activeRecordEditor.chain().focus().setTextAlign('center').run(); break;
      case 'alignRight': _activeRecordEditor.chain().focus().setTextAlign('right').run(); break;
      case 'alignClear': _activeRecordEditor.chain().focus().unsetTextAlign().run(); break;
      case 'clearFormat': _activeRecordEditor.chain().focus().unsetAllMarks().clearNodes().run(); break;
    }
  } catch (e) { console.warn('[_recToolbarCmd]', e); }
  _updateRecToolbarState();
}

function _updateRecToolbarState() {
  const toolbar = document.getElementById('rec-editor-toolbar');
  if (!toolbar || !_activeRecordEditor) return;
  toolbar.querySelectorAll('.editor-toolbar-btn[data-cmd]').forEach(btn => {
    const cmd = btn.dataset.cmd;
    let active = false;
    const ed = _activeRecordEditor;
    if (cmd === 'bold') active = ed.isActive('bold');
    else if (cmd === 'italic') active = ed.isActive('italic');
    else if (cmd === 'underline') active = ed.isActive('underline');
    else if (cmd === 'h1') active = ed.isActive('heading', { level: 1 });
    else if (cmd === 'h2') active = ed.isActive('heading', { level: 2 });
    else if (cmd === 'bulletList') active = ed.isActive('bulletList');
    else if (cmd === 'orderedList') active = ed.isActive('orderedList');
    else if (cmd === 'alignLeft') active = ed.isActive({ textAlign: 'left' });
    else if (cmd === 'alignCenter') active = ed.isActive({ textAlign: 'center' });
    else if (cmd === 'alignRight') active = ed.isActive({ textAlign: 'right' });
    btn.classList.toggle('active', active);
  });
}

function _destroyRecordTiptapInstances() {
  Object.values(_recordTiptapInstances).forEach(ed => { try { ed.destroy(); } catch (e) { } });
  _recordTiptapInstances = {};
}

function _initRecordTiptapInstances(record) {
  _ensureTurndown();
  const fields = state.schema?.fields || [];
  fields.filter(f => f.type !== 'image').forEach(f => {
    const el = document.getElementById('rec-tiptap-' + f.key);
    if (!el || _recordTiptapInstances[f.key]) return;
    const val = record.fields[f.key] ?? '';
    const editor = new Editor({
      element: el,
      ...(tiptapBaseConfig(t('rec.tiptapPh'))),
      content: mdParse(val),
    });
    editor.on('update', () => {
      if (!_turndownService) return;
      record.fields[f.key] = _turndownService.turndown(editor.getHTML());
      setDirty();
      _refreshRecordPreviews(record.id);
      const row = document.querySelector(`.record-row[data-id="${record.id}"]`);
      if (row) {
        const badge = row.querySelector('.rec-badge');
        if (badge) {
          const s = getRecordStatus(record);
          badge.className = `rec-badge rec-badge--${s}`;
          badge.textContent = s;
        }
      }
    });
    editor.on('focus', () => {
      _activeRecordEditor = editor;
      const tb = document.getElementById('rec-editor-toolbar');
      if (tb) tb.classList.add('active');
      _updateRecToolbarState();
    });
    editor.on('blur', () => {
      setTimeout(() => {
        const anyFocused = Object.values(_recordTiptapInstances).some(ed => ed.isFocused);
        const tbFocus = document.getElementById('rec-editor-toolbar')?.contains(document.activeElement);
        if (anyFocused || tbFocus) return;
        _activeRecordEditor = null;
        const tb = document.getElementById('rec-editor-toolbar');
        if (tb) tb.classList.remove('active');
      }, 150);
    });
    editor.on('selectionUpdate', () => _updateRecToolbarState());
    editor.on('transaction', () => _updateRecToolbarState());
    _recordTiptapInstances[f.key] = editor;
  });
}

function _refreshRecordPreviews(recordId) {
  const record = state.records.find(r => r.id === recordId);
  if (!record) return;
  const strip = document.querySelector('#record-detail .record-preview-strip');
  if (!strip) return;
  const fields = state.schema.fields;
  const singleTemplates = state.schema.cardTemplates.filter(t => t.templateType === 'single');
  strip.innerHTML = `<div class="record-field-label" style="margin-bottom:6px;">${t('rec.preview')}</div>${singleTemplates.map(t => {
    const px = getPaperPx(t.size || 'A6', 'portrait');
    const scale = 130 / px.w;
    const tw = Math.round(px.w * scale);
    const th = Math.round(px.h * scale);
    const tempCard = {
      ...newCard(), layout: t.layout, paperSize: t.size,
      images: (t.mapping.imageSlots || []).map((fid, slot) => {
        const fld = fields.find(x => x.id === fid);
        return { slot, url: fld ? (record.fields[fld.key] ?? '') : '' };
      }).filter(img => img.url),
      sections: (t.mapping.sections || []).filter(Boolean).map(fid => {
        const fld = fields.find(x => x.id === fid);
        return { id: uid(), label: fld?.label ?? '', content: fld ? (record.fields[fld.key] ?? '') : '' };
      })
    };
    return `<div class="record-preview-thumb">
        <div class="record-preview-thumb-label">${esc(t.size || '')} ${esc(t.layout)}</div>
        <div style="width:${tw}px;height:${th}px;overflow:hidden;position:relative;border:1px solid var(--line);border-radius:2px;flex-shrink:0;">
          <div style="transform:scale(${scale.toFixed(3)});transform-origin:top left;width:${px.w}px;height:${px.h}px;position:absolute;top:0;left:0;">
            ${buildCardHTML(tempCard, state.settings, false, px)}
          </div>
        </div>
      </div>`;
  }).join('')}`;
}
