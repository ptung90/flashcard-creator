import TurndownService from 'turndown'
import { Editor } from '@tiptap/core'
import { tiptapBaseConfig } from '../editor/editor.js'
import { state, uiState, getLocaleValue, getSchemaForRecord } from '../core/state.js'
import { esc, uid, getPaperPx, mdParseInline, _hashStr, mdParse, _compressImage } from '../core/utils.js'
import { FC_CONFIG } from '../core/config.js'
import { setDirty, showToast } from '../storage/storage.js'
import { getAiProvider, _callOpenAI, _callGemini } from '../api.js'
import { t } from '../i18n.js'
import { buildCardHTML } from '../render.js'
import { newCard } from '../app/cards.js'

// ── Module state ─────────────────────────────────────────────────────
let _imgClipboard = null;
let _sortField = null;
let _activeRecordImage = null; // { recordId, key } — set on click of image field
let _openRecordId = null;     // currently open record in detail panel
let _sortDir = 'asc';
let _selectedIds = new Set();
let _bilingualView = localStorage.getItem('fc_bilingual_view') === '1';

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

export function toggleBilingualView() {
  _bilingualView = !_bilingualView;
  localStorage.setItem('fc_bilingual_view', _bilingualView ? '1' : '0');
  renderRecordsPanel();
}

export function toggleSort(field) {
  if (_sortField === field) {
    _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _sortField = field;
    _sortDir = 'asc';
  }
  renderRecordsPanel();
}

export function toggleColMenu(schemaId, event) {
  event.stopPropagation();
  const menu = document.getElementById(`col-menu-${schemaId}`);
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  document.querySelectorAll('.col-menu-dropdown').forEach(m => { m.style.display = 'none'; });
  if (!isOpen) menu.style.display = 'flex';
}
export function toggleAiMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('ai-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}
export function toggleSchemaMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('schema-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}
export function toggleJsonMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('json-menu');
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
  if (!state.schemas.length) {
    panel.innerHTML = `
      <div class="records-empty">
        <p>${t('rec.noSchema')}</p>
        <button class="btn btn-sm btn-secondary" onclick="openSchemaEditor()">${t('rec.setupSchema')}</button>
        <button class="btn btn-sm btn-secondary" onclick="convertCardsToRecords()" style="margin-top:6px">↩ Convert cards to records</button>
      </div>`;
    return;
  }

  const canTranslate = state.locales.length > 1 && state.schemas.some(s => s.fields.some(f => f.multilingual !== false && f.type !== 'image'));
  const allCompoundTemplates = state.schemas.flatMap(s => s.cardTemplates.filter(t => t.templateType === 'compound'));


  const packMenuItems = [
    `<button class="records-pack-item" onclick="packAll();togglePackMenu(event)">${t('rec.packAll')}</button>`,
    `<button class="records-pack-item" onclick="generateAll();togglePackMenu(event)">${t('rec.generateAll')}</button>`,
    `<button class="records-pack-item" onclick="syncAllPacked();togglePackMenu(event)" title="${t('rec.syncAllTitle')}">${t('rec.syncAll')}</button>`,
    ...allCompoundTemplates.length ? [
      `<div class="records-pack-divider"></div>`,
      ...allCompoundTemplates.map(tmpl => `<button class="records-pack-item" onclick="openPackDialog('${tmpl.id}')">${esc(tmpl.layout)}</button>`),
    ] : [],
  ].join('');

  const selCount = _selectedIds.size;
  const selectionBtns = selCount ? `
    ${canTranslate ? `<button class="btn btn-sm btn-secondary" onclick="toggleTranslateMenu(event)">✦ Translate (${selCount})</button>` : ''}
    <button class="btn btn-sm btn-secondary" onclick="exportSelected()">⬇ Export (${selCount})</button>
    <button class="btn btn-sm btn-danger" onclick="deleteSelected()">🗑 Delete (${selCount})</button>
  ` : '';

  const localeGroup = state.locales.length > 1
    ? `<div class="locale-switcher">${state.locales.map(l =>
        `<button class="btn btn-sm locale-btn${state.activeLocale === l ? ' active' : ''}" data-locale="${l}" onclick="setActiveLocale('${l}')">${l.toUpperCase()}</button>`
      ).join('')}</div>`
    : '';

  const bilingualBtn = state.locales.length > 1
    ? `<button class="btn btn-sm btn-secondary${_bilingualView ? ' active' : ''}" onclick="toggleBilingualView()" title="Toggle bilingual columns">⊞ ${_bilingualView ? 'Bilingual' : state.activeLocale.toUpperCase()}</button>`
    : '';

  const aiMenuItems = [
    `<button class="records-pack-item" onclick="openAiChat('generate_records');toggleAiMenu(event)">✦ AI Chat</button>`,
    `<button class="records-pack-item" onclick="openGenerateRecordsDialog();toggleAiMenu(event)">✦ Generate records</button>`,
    `<button class="records-pack-item" onclick="copyRecordsForAI();toggleAiMenu(event)">✦ Copy for AI</button>`,
    ...(canTranslate ? [`<button class="records-pack-item" onclick="toggleAiMenu(event);appendTranslateOptions(null)">✦ Translate all</button>`] : []),
  ].join('');

  const schemaMenuItems = [
    `<button class="records-pack-item" onclick="openSchemaEditor();toggleSchemaMenu(event)">Schema</button>`,
    `<button class="records-pack-item" onclick="openSchemaEditor('__new__');toggleSchemaMenu(event)">+ New Schema</button>`,
    `<button class="records-pack-item" onclick="convertCardsToRecords();toggleSchemaMenu(event)">↩ Convert cards</button>`,
  ].join('');

  const jsonMenuItems = [
    `<button class="records-pack-item" onclick="exportRecordsJson();toggleJsonMenu(event)">Export JSON</button>`,
    `<div class="records-pack-divider"></div>`,
    `<button class="records-pack-item" onclick="importRecordsJsonClick();toggleJsonMenu(event)">Import JSON</button>`,
    `<button class="records-pack-item" onclick="pasteRecordsJson();toggleJsonMenu(event)">Paste JSON</button>`,
    `<button class="records-pack-item" onclick="pasteRecordsJson(true);toggleJsonMenu(event)">Append JSON</button>`,
  ].join('');

  const headerHtml = `
    <div class="records-header">
      <div class="records-header-start">
        <span class="records-header-title">${t('rec.title')}</span>
        ${selectionBtns}
      </div>
      <div class="records-header-end">
        ${localeGroup}${bilingualBtn}
        <div class="records-pack-wrap">
          <button class="btn btn-sm btn-secondary" onclick="togglePackMenu(event)">${t('rec.pack')}</button>
          <div id="pack-menu">${packMenuItems}</div>
        </div>
        <div class="records-pack-wrap">
          <button class="btn btn-sm btn-primary" onclick="toggleAiMenu(event)">✦ AI ▾</button>
          <div id="ai-menu" style="display:none">${aiMenuItems}</div>
        </div>
        <div class="records-pack-wrap">
          <button class="btn btn-sm btn-secondary" onclick="toggleSchemaMenu(event)">Schema ▾</button>
          <div id="schema-menu" style="display:none">${schemaMenuItems}</div>
        </div>
        <div class="records-pack-wrap">
          <button class="btn btn-sm btn-secondary" onclick="toggleJsonMenu(event)">JSON ▾</button>
          <div id="json-menu" style="display:none">${jsonMenuItems}</div>
        </div>
      </div>
      <input type="file" id="records-import-input" accept=".json" style="display:none" onchange="importRecordsJsonFile(this)">
    </div>`;

  const showStatus = !_hiddenRecCols.has('status');
  const showCards = !_hiddenRecCols.has('cards');

  const schemaSections = state.schemas.map(schema => {
    const schemaRecords = state.records.filter(r => r.schemaId === schema.id);
    const textFields = schema.fields.filter(f => f.type !== 'image');
    const visibleTextFields = textFields.filter(f => !_hiddenRecCols.has('field:' + f.key));
    const colMenuItems = [
      ...textFields.map(f => ({ key: 'field:' + f.key, label: f.label })),
      { key: 'status', label: t('rec.colStatus') },
      { key: 'cards', label: t('rec.colCards') },
    ].map(c => {
      const checked = !_hiddenRecCols.has(c.key) ? 'checked' : '';
      return `<label class="col-menu-item"><input type="checkbox" ${checked} onchange="toggleRecCol('${c.key}')"> ${esc(c.label)}</label>`;
    }).join('');

    const displayRecords = _sortField
      ? [...schemaRecords].sort((a, b) => {
          const av = (getLocaleValue(a.fields[_sortField], state.activeLocale) || '').toLowerCase();
          const bv = (getLocaleValue(b.fields[_sortField], state.activeLocale) || '').toLowerCase();
          return _sortDir === 'asc' ? av < bv ? -1 : av > bv ? 1 : 0 : bv < av ? -1 : bv > av ? 1 : 0;
        })
      : schemaRecords;

    const colHeaders = visibleTextFields.map(f => {
      const isMultilingual = f.multilingual !== false;
      if (isMultilingual && _bilingualView) {
        return state.locales.map(l => {
          const isSorted = _sortField === f.key;
          return `<th class="rec-th-sortable${isSorted ? ' rec-th-sorted' : ''}" onclick="toggleSort('${f.key}')">${esc(f.label)} <span class="rec-col-locale">${l.toUpperCase()}</span></th>`;
        }).join('');
      }
      const isSorted = _sortField === f.key;
      const arrow = isSorted ? (_sortDir === 'asc' ? ' ↑' : ' ↓') : '';
      return `<th class="rec-th-sortable${isSorted ? ' rec-th-sorted' : ''}" onclick="toggleSort('${f.key}')">${esc(f.label)}${arrow}</th>`;
    }).join('');

    const rows = displayRecords.map((rec, ri) => {
      const checked = _selectedIds.has(rec.id) ? 'checked' : '';
      const cols = visibleTextFields.map(f => {
        const val = rec.fields[f.key] ?? '';
        const isMultilingual = f.multilingual !== false && typeof val === 'object' && val !== null;
        if (isMultilingual && _bilingualView) {
          return state.locales.map(l => {
            const locVal = val[l] ?? '';
            const preview = locVal.length > 80 ? locVal.slice(0, 80) + '…' : locVal;
            return `<td><span class="record-col-text">${mdParseInline(preview)}</span></td>`;
          }).join('');
        }
        const display = isMultilingual ? (val[state.activeLocale] ?? '') : (typeof val === 'string' ? val : '');
        const preview = display.length > 120 ? display.slice(0, 120) + '…' : display;
        return `<td><span class="record-col-text">${mdParseInline(preview)}</span></td>`;
      }).join('');
      const statusTd = showStatus ? `<td><span class="rec-badge rec-badge--${getRecordStatus(rec)}">${getRecordStatus(rec)}</span></td>` : '';
      const cardsTd = showCards ? `<td class="rec-cards-cell">${_linkedCardChips(rec.id)}</td>` : '';
      return `<tr class="record-row${_selectedIds.has(rec.id) ? ' record-row--selected' : ''}" onclick="openRecordDetail('${rec.id}')" data-id="${rec.id}">
        <td class="rec-check-td" onclick="event.stopPropagation();toggleSelectRecord('${rec.id}')"><input type="checkbox" class="rec-checkbox" ${checked} onclick="event.stopPropagation();toggleSelectRecord('${rec.id}')"></td>
        <td class="rec-row-num">${ri + 1}</td>${cols}${statusTd}${cardsTd}
        <td><button class="btn btn-sm record-del-btn" onclick="event.stopPropagation();deleteRecord('${rec.id}')">✕</button></td>
      </tr>`;
    }).join('');

    const theadExtra = (showStatus ? `<th style="width:72px">${t('rec.colStatus')}</th>` : '') + (showCards ? `<th style="width:120px">${t('rec.colCards')}</th>` : '');

    return `
      <div class="schema-section">
        <div class="schema-section-header">
          <span class="schema-section-name">${esc(schema.name || schema.id)}</span>
          <span class="schema-record-count">${schemaRecords.length}</span>
          <div class="schema-section-header-end">
            <div class="records-pack-wrap">
              <button class="btn btn-sm btn-secondary" onclick="toggleColMenu('${esc(schema.id)}', event)">Columns ▾</button>
              <div id="col-menu-${esc(schema.id)}" class="col-menu-dropdown" style="display:none">${colMenuItems}</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="openSchemaEditor('${esc(schema.id)}')">Edit</button>
            <button class="btn btn-sm btn-secondary" onclick="addRecord('${esc(schema.id)}')">+ Add</button>
            <button class="btn btn-sm btn-danger" onclick="deleteSchema('${esc(schema.id)}')">Delete</button>
          </div>
        </div>
        <table class="records-table">
          <thead><tr>
            <th class="rec-check-th" style="width:28px"></th>
            <th style="width:28px">#</th>${colHeaders}${theadExtra}<th style="width:32px;"></th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="99" style="padding:12px 8px;color:var(--ink-400);font-style:italic;">${t('rec.noRecords')}</td></tr>`}</tbody>
        </table>
      </div>`;
  }).join('');

  panel.innerHTML = headerHtml + schemaSections + `<div id="record-detail" style="display:none"></div>`;
}

export function getRecordStatus(record) {
  if (!record.fieldsHash) return 'draft';
  if (_hashStr(JSON.stringify(record.fields)) !== record.fieldsHash) return 'draft';
  return 'synced';
}

export function addRecord(schemaId) {
  const schema = (schemaId ? state.schemas.find(s => s.id === schemaId) : null)
    || state.schemas.find(s => s.id === uiState.activeSchemaId)
    || state.schemas[0];
  if (!schema) return;
  const rec = { id: 'rec_' + uid(), schemaId: schema.id, fieldsHash: '', fields: {} };
  schema.fields.forEach(f => {
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
  state.schemas.forEach(schema => {
    schema.fields.forEach(f => {
      if (f.multilingual === false || f.type === 'image') return;
      state.records.filter(r => r.schemaId === schema.id).forEach(rec => {
        const val = rec.fields[f.key];
        if (typeof val === 'string') {
          const obj = {};
          state.locales.forEach(l => { obj[l] = val; });
          rec.fields[f.key] = obj;
        } else if (val && typeof val === 'object') {
          state.locales.forEach(l => { if (!(l in val)) val[l] = ''; });
        }
      });
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

export function deleteSchema(id) {
  const schema = state.schemas.find(s => s.id === id);
  if (!schema) return;
  const recCount = state.records.filter(r => r.schemaId === id).length;
  const msg = recCount > 0
    ? `Delete schema "${schema.name}" and its ${recCount} record(s)?`
    : `Delete schema "${schema.name}"?`;
  if (!confirm(msg)) return;
  state.schemas = state.schemas.filter(s => s.id !== id);
  state.records = state.records.filter(r => r.schemaId !== id);
  if (uiState.activeSchemaId === id) uiState.activeSchemaId = state.schemas[0]?.id ?? null;
  setDirty();
  renderRecordsPanel();
}

export function togglePackMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('pack-menu');
  if (menu) menu.classList.toggle('open');
}

export function setActiveSchema(id) {
  uiState.activeSchemaId = id;
  renderRecordsPanel();
}

export function toggleTranslateMenu(event) {
  event.stopPropagation();
  window.appendTranslateOptions?.(_selectedIds.size > 0 ? new Set(_selectedIds) : null);
}

export function _getSelectedSet() {
  return _selectedIds.size > 0 ? new Set(_selectedIds) : null;
}

// Close menus on outside click
document.addEventListener('click', () => {
  const pack = document.getElementById('pack-menu');
  if (pack) pack.classList.remove('open');
  ['ai-menu', 'schema-menu', 'json-menu'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
  });
  document.querySelectorAll('.col-menu-dropdown').forEach(m => { m.style.display = 'none'; });
});

export function openRecordDetail(id) {
  _openRecordId = id;
  _activeRecordImage = null;
  _destroyRecordTiptapInstances();
  const record = state.records.find(r => r.id === id);
  if (!record) return;
  const detail = document.getElementById('record-detail');
  if (!detail) return;

  const schema = getSchemaForRecord(record);
  if (!schema) return;
  const fields = schema.fields;
  const singleTemplates = schema.cardTemplates.filter(t => t.templateType === 'single');
  const cf = state.settings.contentFont || {};
  const contentFontStyle = cf.family ? `font-family:${cf.family};` : '';

  const fieldInputs = fields.map(f => {
    const val = record.fields[f.key] ?? '';
    const isMultilingual = f.multilingual !== false && f.type !== 'image';

    if (f.type === 'image') {
      const strVal = typeof val === 'string' ? val : '';
      const thumb = strVal
        ? `<div class="record-img-thumb" style="background-image:url('${esc(strVal)}')"></div>`
        : `<div class="record-img-thumb record-img-thumb--empty"><svg class="icon" style="width:18px;height:18px"><use href="#i-image"/></svg></div>`;
      const input = `<div class="record-field-img" tabindex="0" data-rid="${esc(record.id)}" data-rkey="${esc(f.key)}" onclick="_setActiveRecordImage('${record.id}','${f.key}')">
        ${thumb}
        <div class="image-slot-btns">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="_pasteToRecordImage('${record.id}','${f.key}')" title="${t('rec.img.paste')}"><svg class="icon" style="width:13px;height:13px"><use href="#i-clipboard"/></svg></button>
          ${strVal ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="_copyRecordImage('${record.id}','${f.key}')" title="${t('rec.img.copy')}"><svg class="icon" style="width:13px;height:13px"><use href="#i-copy"/></svg></button>` : ''}
          <button class="btn btn-secondary btn-sm btn-icon" onclick="_pickRecordImage('${record.id}','${f.key}')" title="${t('rec.img.choose')}"><svg class="icon" style="width:13px;height:13px"><use href="#i-search"/></svg></button>
          ${strVal ? `<button class="btn btn-danger btn-sm btn-icon" onclick="_clearRecordImage('${record.id}','${f.key}')" title="${t('rec.img.clear')}"><svg class="icon" style="width:13px;height:13px"><use href="#i-x"/></svg></button>` : ''}
        </div>
      </div>`;
      return `<div class="record-field-group">
        <label class="record-field-label">${esc(f.label)}</label>
        ${input}
      </div>`;
    }

    if (isMultilingual && typeof val === 'object' && val !== null) {
      const localeInputs = state.locales.map(l => {
        const locVal = val[l] ?? '';
        const longCls = f.type === 'text-long' ? ' rec-tiptap--long' : '';
        const inputEl = f.type === 'text-long'
          ? `<div class="section-tiptap-editor${longCls}" id="rec-tiptap-${f.key}-${l}" style="${contentFontStyle}"></div>`
          : `<input type="text" class="rec-field-input" value="${esc(locVal)}"
               oninput="_setRecordField('${record.id}','${f.key}',this.value,'${l}')">`;
        return `<div class="rec-bilingual-row">
          <span class="rec-locale-tag">${l.toUpperCase()}</span>
          ${inputEl}
        </div>`;
      }).join('');
      return `<div class="record-field-group">
        <label class="record-field-label">${esc(f.label)}</label>
        <div class="rec-bilingual-group">${localeInputs}</div>
      </div>`;
    }

    // Non-multilingual text field (plain string)
    const longCls = f.type === 'text-long' ? ' rec-tiptap--long' : '';
    const input = `<div class="section-tiptap-editor${longCls}" id="rec-tiptap-${f.key}" style="${contentFontStyle}"></div>`;
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
          ${state.locales.length > 1 && schema?.fields.some(f => f.multilingual !== false && f.type !== 'image')
            ? `<button class="btn btn-sm btn-secondary" onclick="appendTranslateOptions(new Set(['${record.id}']))" title="AI translate this record">✦ Translate</button>`
            : ''}
          <button class="btn btn-sm btn-primary" onclick="syncRecord('${record.id}')">${t('rec.sync')}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteRecord('${record.id}')" title="Delete record">🗑</button>
          <button class="btn btn-sm" onclick="document.getElementById('record-detail').style.display='none'">✕</button>
        </div>
      </div>
      ${recToolbar}
      <div class="editor-toolbar editor-toolbar-format editor-toolbar-ai" id="rec-ai-toolbar" style="padding:3px 8px;gap:4px;margin-bottom:4px;">
        <span style="font-size:11px;color:var(--c-text-3);padding-right:2px;white-space:nowrap">✦ AI</span>
        <div class="editor-toolbar-divider"></div>
        <button class="rec-ai-btn" onclick="rewriteRecordField('Expand with more detail. Keep same structure and Markdown format.', this)">Longer</button>
        <button class="rec-ai-btn" onclick="rewriteRecordField('Condense to key facts only. Keep Markdown format.', this)">Shorter</button>
        <button class="rec-ai-btn" onclick="rewriteRecordField('Simplify language for easy reading. Keep all key facts and Markdown format.', this)">Simpler</button>
        <button class="rec-ai-btn" onclick="rewriteRecordField('Rewrite as a first-person guessing game. Give 4-5 clues starting with I, end with *Who am I?*', this)">❓ Quiz</button>
        <button class="rec-ai-btn" onclick="_recAiCustom(this)">Custom…</button>
      </div>
    </div>
    <div class="record-detail-body">
      ${fieldInputs}
      ${previewSection}
    </div>
  `;
  _initRecordTiptapInstances(record);
}

export function _setRecordField(recordId, key, value, locale) {
  const record = state.records.find(r => r.id === recordId);
  if (!record) return;
  if (locale && typeof record.fields[key] === 'object' && record.fields[key] !== null) {
    record.fields[key][locale] = value;
  } else {
    record.fields[key] = value;
  }
  setDirty();
  // Re-render only for image fields (non-image fields use TipTap or inline oninput)
  if (!locale) openRecordDetail(recordId);
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
  if (url.startsWith('data:')) {
    fetch(url)
      .then(r => r.blob())
      .then(blob => navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]))
      .catch(() => {});
  }
  showToast(t('rec.toast.imageCopied'));
}

export function _setActiveRecordImage(recordId, key) {
  _activeRecordImage = { recordId, key };
}

// Document-level paste: catches Ctrl+V — mirrors card editor's pendingPasteSlot pattern
document.addEventListener('paste', (e) => {
  // Resolve target first — if button was clicked, _activeRecordImage is set
  const target = _activeRecordImage || _autoDetectImageTarget();
  if (!target) return;

  // Skip text inputs/TipTap ONLY when no explicit target (same as card editor pendingPasteSlot override)
  if (!_activeRecordImage) {
    const t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest?.('.ProseMirror')) return;
  }
  if (!target) return;

  const imgItem = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith('image/'));
  if (!imgItem) return;

  e.preventDefault();
  const file = imgItem.getAsFile();
  if (!file) return;

  const { recordId, key } = target;
  _clearRecordImgHighlight(recordId, key);
  _activeRecordImage = null;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const compressed = await _compressImage(ev.target.result);
    _setRecordField(recordId, key, compressed);
  };
  reader.readAsDataURL(file);
});

function _autoDetectImageTarget() {
  if (!_openRecordId) return null;
  const record = state.records.find(r => r.id === _openRecordId);
  if (!record) return null;
  const schema = getSchemaForRecord(record);
  if (!schema) return null;
  const imgFields = schema.fields.filter(f => f.type === 'image');
  if (imgFields.length !== 1) return null;
  return { recordId: record.id, key: imgFields[0].key };
}

function _highlightRecordImg(recordId, key) {
  const div = document.querySelector(`.record-field-img[data-rid="${CSS.escape(recordId)}"][data-rkey="${CSS.escape(key)}"]`);
  if (div) div.classList.add('record-field-img--pending');
}

function _clearRecordImgHighlight(recordId, key) {
  const div = document.querySelector(`.record-field-img[data-rid="${CSS.escape(recordId)}"][data-rkey="${CSS.escape(key)}"]`);
  if (div) div.classList.remove('record-field-img--pending');
}

export async function _pasteToRecordImage(recordId, key) {
  _setActiveRecordImage(recordId, key);
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
    if (_imgClipboard?.url) { _setRecordField(recordId, key, _imgClipboard.url); return; }
  } catch {
    if (_imgClipboard?.url) { _setRecordField(recordId, key, _imgClipboard.url); return; }
  }
  // Last resort: passive paste listener — Ctrl+V will be caught by document paste handler
  _highlightRecordImg(recordId, key);
  showToast('Press Ctrl+V to paste image');
  setTimeout(() => { _clearRecordImgHighlight(recordId, key); }, 10000);
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

export async function rewriteRecordField(instruction, btnEl) {
  const editor = _activeRecordEditor;
  if (!editor) { showToast('Click into a text field first'); return; }
  _ensureTurndown();
  const content = _turndownService.turndown(editor.getHTML());
  if (!content.trim()) return;
  const provider = getAiProvider();
  const key = localStorage.getItem(`${provider}-key`) || '';
  if (!key) { showToast(`No ${provider} key set`); return; }
  const origText = btnEl?.textContent;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '…'; }
  try {
    const messages = [
      { role: 'system', content: 'You are a flashcard content editor. Rewrite the given text per the instruction. Return JSON: { "text": "<rewritten Markdown>" }. Keep the same language. Preserve Markdown formatting (**, *, -, lists, etc.).' },
      { role: 'user', content: `Instruction: ${instruction}\n\nText:\n${content}` },
    ];
    const result = provider === 'gemini'
      ? await _callGemini(key, `${messages[0].content}\n\n${messages[1].content}`)
      : await _callOpenAI(key, messages);
    const newText = typeof result === 'object' ? (result.text || result.rewrite || '') : String(result || '');
    if (!newText.trim()) { showToast('No result from AI'); return; }
    editor.commands.setContent(mdParse(newText));
  } catch (e) {
    showToast('AI: ' + (e.message || e));
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = origText; }
  }
}

export function _recAiCustom(btnEl) {
  const instruction = prompt('AI rewrite instruction:');
  if (!instruction?.trim()) return;
  rewriteRecordField(instruction.trim(), btnEl);
}

function _destroyRecordTiptapInstances() {
  Object.values(_recordTiptapInstances).forEach(ed => { try { ed.destroy(); } catch (e) { } });
  _recordTiptapInstances = {};
}

function _initRecordTiptapInstances(record) {
  _ensureTurndown();
  const schema = getSchemaForRecord(record);
  const fields = schema?.fields || [];
  fields.filter(f => f.type !== 'image').forEach(f => {
    const isMultilingual = f.multilingual !== false && typeof record.fields[f.key] === 'object' && record.fields[f.key] !== null;
    if (isMultilingual) {
      state.locales.forEach(l => {
        const instanceKey = `${f.key}_${l}`;
        const el = document.getElementById(`rec-tiptap-${f.key}-${l}`);
        if (!el || _recordTiptapInstances[instanceKey]) return;
        const locVal = record.fields[f.key][l] ?? '';
        const editor = new Editor({
          element: el,
          ...(tiptapBaseConfig(t('rec.tiptapPh'))),
          content: mdParse(locVal),
        });
        editor.on('update', () => {
          if (!_turndownService) return;
          if (typeof record.fields[f.key] === 'object') {
            record.fields[f.key][l] = _turndownService.turndown(editor.getHTML());
          }
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
          document.getElementById('rec-editor-toolbar')?.classList.add('active');
          document.getElementById('rec-ai-toolbar')?.classList.add('active');
          _updateRecToolbarState();
        });
        editor.on('blur', () => {
          setTimeout(() => {
            const anyFocused = Object.values(_recordTiptapInstances).some(ed => ed.isFocused);
            const active = document.activeElement;
            if (anyFocused
              || document.getElementById('rec-editor-toolbar')?.contains(active)
              || document.getElementById('rec-ai-toolbar')?.contains(active)) return;
            _activeRecordEditor = null;
            document.getElementById('rec-editor-toolbar')?.classList.remove('active');
            document.getElementById('rec-ai-toolbar')?.classList.remove('active');
          }, 150);
        });
        editor.on('selectionUpdate', () => _updateRecToolbarState());
        editor.on('transaction', () => _updateRecToolbarState());
        _recordTiptapInstances[instanceKey] = editor;
      });
    } else {
      const el = document.getElementById(`rec-tiptap-${f.key}`);
      if (!el || _recordTiptapInstances[f.key]) return;
      const val = typeof record.fields[f.key] === 'string' ? record.fields[f.key] : '';
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
        document.getElementById('rec-editor-toolbar')?.classList.add('active');
        document.getElementById('rec-ai-toolbar')?.classList.add('active');
        _updateRecToolbarState();
      });
      editor.on('blur', () => {
        setTimeout(() => {
          const anyFocused = Object.values(_recordTiptapInstances).some(ed => ed.isFocused);
          const active = document.activeElement;
          if (anyFocused
            || document.getElementById('rec-editor-toolbar')?.contains(active)
            || document.getElementById('rec-ai-toolbar')?.contains(active)) return;
          _activeRecordEditor = null;
          document.getElementById('rec-editor-toolbar')?.classList.remove('active');
          document.getElementById('rec-ai-toolbar')?.classList.remove('active');
        }, 150);
      });
      editor.on('selectionUpdate', () => _updateRecToolbarState());
      editor.on('transaction', () => _updateRecToolbarState());
      _recordTiptapInstances[f.key] = editor;
    }
  });
}

function _refreshRecordPreviews(recordId) {
  const record = state.records.find(r => r.id === recordId);
  if (!record) return;
  const strip = document.querySelector('#record-detail .record-preview-strip');
  if (!strip) return;
  const schema = getSchemaForRecord(record);
  if (!schema) return;
  const fields = schema.fields;
  const singleTemplates = schema.cardTemplates.filter(t => t.templateType === 'single');
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
