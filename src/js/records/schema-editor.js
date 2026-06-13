import { state, uiState, LAYOUTS, LAYOUT_SLOTS } from '../core/state.js'
import { esc, uid } from '../core/utils.js'
import { FC_CONFIG } from '../core/config.js'
import { setDirty, showToast, hasWorkDir, saveToLibrary, loadFromLibrary,
         deleteFromLibrary, listLibrary } from '../storage/storage.js'
import { t } from '../i18n.js'
import { _applyStyleData } from '../modals.js'

// ── Schema Editor ─────────────────────────────────────────────────────────────
let _editingSchema = null;
let _loadedSchemaName = null;

export async function saveSchemaToLibrary() {
  if (!hasWorkDir()) { alert(t('rec.schema.setFolderAlert')); return; }
  const name = prompt(t('rec.schema.savePrompt'), _loadedSchemaName || '');
  if (!name?.trim()) return;
  const schema = _editingSchema || state.schemas.find(s => s.id === uiState.activeSchemaId) || state.schemas[0];
  if (!schema) { alert(t('rec.schema.noSchemaAlert')); return; }
  try {
    await saveToLibrary('schemas', name.trim(), schema);
    const sel = document.getElementById('schema-library-select');
    if (sel && !Array.from(sel.options).find(o => o.value === name.trim())) {
      sel.innerHTML += `<option value="${esc(name.trim())}">${esc(name.trim())}</option>`;
    }
    showToast(t('rec.schema.savedToast').replace('{n}', name.trim()));
    if (confirm(t('rec.schema.saveStyleConfirm').replace('{n}', name.trim()))) {
      await saveToLibrary('styles', name.trim(), { fc_style_version: '1.0', settings: state.settings });
      showToast(t('rec.schema.styleSavedToast').replace('{n}', name.trim()));
    }
  } catch (err) { alert(t('rec.schema.saveFailAlert').replace('{e}', err.message)); }
}

export async function applySchemaFromLibrary() {
  const sel = document.getElementById('schema-library-select');
  const name = sel?.value;
  if (!name) return;
  try {
    const schema = await loadFromLibrary('schemas', name);
    if (!schema?.fields) throw new Error(t('rec.schema.invalidFile'));
    const hasRecords = state.records?.length > 0;
    let templatesOnly = false;
    if (hasRecords) {
      const choice = confirm(t('rec.schema.loadWithRecordsConfirm').replace('{n}', state.records.length));
      if (choice === null) return;
      templatesOnly = !choice;
    }
    if (templatesOnly) {
      _editingSchema.cardTemplates = schema.cardTemplates || [];
    } else {
      _editingSchema = schema;
      _loadedSchemaName = name;
    }
    _renderSchemaEditor();
    showToast(templatesOnly
      ? t('rec.schema.loadedTemplatesOnlyToast').replace('{n}', name)
      : t('rec.schema.loadedToast').replace('{n}', name));
    try {
      const styleData = await loadFromLibrary('styles', name);
      if (styleData && confirm(t('rec.schema.matchingStyleConfirm').replace('{n}', name))) {
        _applyStyleData(styleData, name);
      }
    } catch (_) {}
  } catch (err) { alert(t('rec.schema.loadFailAlert').replace('{e}', err.message)); }
}

export async function deleteSchemaFromLibrary() {
  const sel = document.getElementById('schema-library-select');
  const name = sel?.value;
  if (!name) return;
  if (!confirm(t('rec.schema.deleteConfirm').replace('{n}', name))) return;
  try {
    await deleteFromLibrary('schemas', name);
    sel.remove(sel.selectedIndex);
    sel.value = '';
    showToast(t('rec.schema.deletedToast').replace('{n}', name));
  } catch (err) { alert(t('rec.schema.deleteFailAlert').replace('{e}', err.message)); }
}

export function openSchemaEditor(schemaId) {
  const existing = schemaId
    ? state.schemas.find(s => s.id === schemaId)
    : (state.schemas.find(s => s.id === uiState.activeSchemaId) || state.schemas[0]);
  _editingSchema = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        id: 'schema_' + uid(),
        name: 'New Schema',
        fields: [{ id: `f${uid()}`, key: 'name', type: 'text', label: 'Name', multilingual: true }],
        cardTemplates: []
      };
  _loadedSchemaName = null;
  _renderSchemaEditor();
  document.getElementById('schema-editor-modal').showModal();
  listLibrary('schemas').then(names => {
    const sel = document.getElementById('schema-library-select');
    if (!sel) return;
    sel.innerHTML = `<option value="">${t('rec.schema.libraryPh')}</option>` +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  });
}

const _COMPOUND_LAYOUTS = ['2img-2txt', '3img-3txt', 'img3-txt3', '6cell', '8img-8txt', 'txtgrid'];
const _SINGLE_SIZES = ['A4', 'A5', 'A6', 'Letter'];

function _renderSchemaEditor() {
  const s = _editingSchema;
  const imgFields = s.fields.filter(f => f.type === 'image');
  const txtFields = s.fields.filter(f => f.type !== 'image');
  const singleLayouts = LAYOUTS.filter(l => !_COMPOUND_LAYOUTS.includes(l) && l !== 'txtgrid');

  const fieldsHtml = s.fields.map((f, i) => {
    const isImg = f.type === 'image';
    const mlChecked = (!isImg && f.multilingual !== false) ? 'checked' : '';
    const mlDisabled = isImg ? 'disabled title="Image fields are always shared"' : '';
    return `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
      <input type="text" placeholder="Label" value="${esc(f.label)}" style="flex:1;min-width:80px;"
        oninput="_schemaFieldChange(${i},'label',this.value)">
      <input type="text" class="schema-field-key" placeholder="key" value="${esc(f.key)}" style="width:90px;"
        oninput="_schemaFieldChange(${i},'key',this.value)">
      <select onchange="_schemaFieldChange(${i},'type',this.value)" style="width:90px;">
        ${['image', 'text', 'text-long'].map(t =>
    `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <label class="schema-ml-toggle" ${isImg ? 'style="opacity:0.4"' : ''}>
        <input type="checkbox" ${mlChecked} ${mlDisabled}
          onchange="_schemaFieldChange(${i},'multilingual',this.checked)">
        🌐
      </label>
      <button class="btn btn-sm" onclick="_removeSchemaField(${i})">✕</button>
    </div>`;
  }).join('');

  const _checkboxRow = (i, tmpl) =>
    `<div style="font-size:12px;display:flex;gap:14px;margin-bottom:8px;">
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" ${tmpl.hideTitle ? 'checked' : ''}
          onchange="_schemaTemplateChange(${i},'hideTitle',this.checked)">
        Hide title
      </label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" ${tmpl.hideSectionLabels ? 'checked' : ''}
          onchange="_schemaTemplateChange(${i},'hideSectionLabels',this.checked)">
        Hide section labels
      </label>
    </div>`;

  const templatesHtml = s.cardTemplates.map((tmpl, i) => {
    const isCompound = tmpl.templateType === 'compound';
    const typeToggle = `
      <select onchange="_schemaTemplateChange(${i},'templateType',this.value)" style="width:100px;">
        <option value="single"   ${!isCompound ? 'selected' : ''}>${t('rec.schema.single')}</option>
        <option value="compound" ${isCompound ? 'selected' : ''}>${t('rec.schema.compound')}</option>
      </select>`;

    if (isCompound) {
      const imgOpts = imgFields.map(f =>
        `<option value="${f.id}" ${tmpl.mapping.imageSlot === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
      const labelOpts = txtFields.map(f =>
        `<option value="${f.id}" ${tmpl.mapping.labelSlot === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
      const txtOpts = txtFields.map(f =>
        `<option value="${f.id}" ${tmpl.mapping.textSlot === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
      return `<div class="schema-template-card">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          ${typeToggle}
          <select onchange="_schemaTemplateChange(${i},'layout',this.value)">
            ${_COMPOUND_LAYOUTS.map(l =>
        `<option value="${l}" ${tmpl.layout === l ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <select onchange="_schemaTemplateChange(${i},'size',this.value)" style="width:60px;">
            ${_SINGLE_SIZES.map(sz =>
          `<option value="${sz}" ${(tmpl.size || 'A4') === sz ? 'selected' : ''}>${sz}</option>`).join('')}
          </select>
          <select onchange="_schemaTemplateChange(${i},'orientation',this.value)" style="width:86px;">
            <option value="portrait"  ${(tmpl.orientation || 'portrait') === 'portrait' ? 'selected' : ''}>${t('orient.portrait')}</option>
            <option value="landscape" ${(tmpl.orientation || 'portrait') === 'landscape' ? 'selected' : ''}>${t('orient.landscape')}</option>
          </select>
          <select onchange="_schemaTemplateChange(${i},'locale',this.value)" style="width:80px;" title="Content locale for this template">
            ${['active', ...state.locales].map(l =>
              `<option value="${l}" ${(tmpl.locale || 'active') === l ? 'selected' : ''}>${l === 'active' ? '← active' : l.toUpperCase()}</option>`
            ).join('')}
          </select>
          <button class="btn btn-sm" onclick="_removeSchemaTemplate(${i})">✕</button>
        </div>
        <div style="margin-bottom:8px;font-size:12px;display:flex;align-items:center;gap:6px;">
          <label style="white-space:nowrap;color:#6b7280;">CSS class:</label>
          <input type="text" placeholder="e.g. card-verb" value="${esc(tmpl.cardClass || '')}"
            style="flex:1;font-family:monospace;font-size:11px;"
            oninput="_schemaTemplateChange(${i},'cardClass',this.value)">
        </div>
        ${_checkboxRow(i, tmpl)}
        <div class="schema-template-slots">
          ${tmpl.layout === 'txtgrid' ? `
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <label>${t('rec.schema.titleField')}
                <select onchange="_schemaTemplateChange(${i},'labelSlot',this.value)">
                  <option value="">—</option>${txtFields.map(f =>
                    `<option value="${f.id}" ${tmpl.mapping.labelSlot === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
                </select>
              </label>
              <label>${t('rec.schema.contentField')}
                <select onchange="_schemaTemplateChange(${i},'textSlot',this.value)">
                  <option value="">—</option>${txtOpts}
                </select>
              </label>
            </div>
            <div class="schema-cardconfig-row">
              <div class="schema-cardconfig-item">
                <span>Cols</span>
                <input type="number" min="1" max="10" value="${esc(String(tmpl.cardConfig?.textCols ?? ''))}" placeholder="—" oninput="_schemaCardConfig(${i},'textCols',this.value)">
              </div>
              <div class="schema-cardconfig-item">
                <span>Rows</span>
                <input type="number" min="1" max="50" value="${esc(String(tmpl.cardConfig?.textRows ?? ''))}" placeholder="—" oninput="_schemaCardConfig(${i},'textRows',this.value)">
              </div>
              <div class="schema-cardconfig-item">
                <span>Cell h (px)</span>
                <input type="number" min="20" max="500" value="${esc(String(tmpl.cardConfig?.textCardHeight ?? ''))}" placeholder="—" oninput="_schemaCardConfig(${i},'textCardHeight',this.value)">
              </div>
              <div class="schema-cardconfig-item">
                <span>Img h (%)</span>
                <input type="number" min="10" max="90" value="${esc(String(tmpl.cardConfig?.imageHeightPercent ?? ''))}" placeholder="—" oninput="_schemaCardConfig(${i},'imageHeightPercent',this.value)">
              </div>
            </div>
          ` : `
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <label>${t('rec.schema.imageField')}
                <select onchange="_schemaTemplateChange(${i},'imageSlot',this.value)">
                  <option value="">—</option>${imgOpts}
                </select>
              </label>
              <label>${t('rec.schema.labelField')}
                <select onchange="_schemaTemplateChange(${i},'labelSlot',this.value)">
                  <option value="">—</option>${labelOpts}
                </select>
              </label>
              <label>${t('rec.schema.textField')}
                <select onchange="_schemaTemplateChange(${i},'textSlot',this.value)">
                  <option value="">—</option>${txtOpts}
                </select>
              </label>
            </div>
          `}
        </div>
      </div>`;
    } else {
      const numImgSlots = LAYOUT_SLOTS[tmpl.layout] ?? 1;
      const imgSlots = [...(tmpl.mapping.imageSlots || [])];
      while (imgSlots.length < numImgSlots) imgSlots.push('');
      const imgSlotSelects = imgSlots.map((fid, si) =>
        `<select onchange="_schemaSingleImageSlot(${i},${si},this.value)">
          <option value="">—</option>
          ${imgFields.map(f =>
          `<option value="${f.id}" ${fid === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
        </select>`).join(' ');
      const secSelects = (tmpl.mapping.sections || []).map((fid, si) =>
        `<select onchange="_schemaSingleSection(${i},${si},this.value)">
          <option value="">—</option>
          ${txtFields.map(f =>
          `<option value="${f.id}" ${fid === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
        </select>`).join(' ');
      return `<div class="schema-template-card">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          ${typeToggle}
          <select onchange="_schemaTemplateChange(${i},'layout',this.value)">
            ${singleLayouts.map(l =>
        `<option value="${l}" ${tmpl.layout === l ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <select onchange="_schemaTemplateChange(${i},'size',this.value)" style="width:60px;">
            ${_SINGLE_SIZES.map(sz =>
          `<option value="${sz}" ${(tmpl.size || 'A6') === sz ? 'selected' : ''}>${sz}</option>`).join('')}
          </select>
          <select onchange="_schemaTemplateChange(${i},'locale',this.value)" style="width:80px;" title="Content locale for this template">
            ${['active', ...state.locales].map(l =>
              `<option value="${l}" ${(tmpl.locale || 'active') === l ? 'selected' : ''}>${l === 'active' ? '← active' : l.toUpperCase()}</option>`
            ).join('')}
          </select>
          <button class="btn btn-sm" onclick="_removeSchemaTemplate(${i})">✕</button>
        </div>
        <div style="margin-bottom:8px;font-size:12px;display:flex;align-items:center;gap:6px;">
          <label style="white-space:nowrap;color:#6b7280;">CSS class:</label>
          <input type="text" placeholder="e.g. card-noun" value="${esc(tmpl.cardClass || '')}"
            style="flex:1;font-family:monospace;font-size:11px;"
            oninput="_schemaTemplateChange(${i},'cardClass',this.value)">
        </div>
        ${_checkboxRow(i, tmpl)}
        <div style="font-size:12px;">
          <div>${t('rec.schema.imageSlots')} ${imgSlotSelects}</div>
          <div style="margin-top:4px;">${t('rec.schema.sections')} ${secSelects}
            <button class="btn btn-sm" style="margin-left:4px;"
              onclick="_addSchemaSection(${i})">${t('rec.schema.addSection')}</button>
          </div>
        </div>
      </div>`;
    }
  }).join('');

  const schemaNameInput = `
    <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;">
      <label style="font-size:12px;font-weight:600;white-space:nowrap;">Schema name:</label>
      <input type="text" value="${esc(s.name || '')}" style="flex:1;"
        oninput="_schemaNameChange(this.value)">
    </div>`;

  document.getElementById('schema-editor-content').innerHTML = `${schemaNameInput}
    <div>
      <div class="dialog-section-title">${t('rec.schema.fieldsTitle')}</div>
      ${fieldsHtml}
      <button class="btn btn-sm btn-secondary" onclick="_addSchemaField()">${t('rec.schema.addField')}</button>
    </div>
    <div class="schema-lang-section" style="margin-top:12px;">
      <span class="schema-section-label">Languages:</span>
      ${state.locales.map(l => `<span class="schema-locale-tag">${l.toUpperCase()}</span>`).join('')}
      <input type="text" id="new-locale-input" placeholder="e.g. ja, fr" style="width:80px;"
        onkeydown="if(event.key==='Enter'){addLocale(this.value);this.value='';window.openSchemaEditor();}">
      <button class="btn btn-sm btn-secondary" onclick="addLocale(document.getElementById('new-locale-input').value);document.getElementById('new-locale-input').value='';window.openSchemaEditor()">+ Add</button>
    </div>
    <div style="margin-top:16px;">
      <div class="dialog-section-title">${t('rec.schema.templatesTitle')}</div>
      ${templatesHtml}
      <button class="btn btn-sm btn-secondary" onclick="_addSchemaTemplate()">${t('rec.schema.addTemplate')}</button>
    </div>`;
}

function _slugify(s) {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function _addSchemaField() {
  _editingSchema.fields.push({ id: 'f' + uid(), key: '', type: 'text', label: '', multilingual: true });
  _renderSchemaEditor();
}

export function _removeSchemaField(i) {
  _editingSchema.fields.splice(i, 1);
  _renderSchemaEditor();
}

export function _schemaNameChange(value) {
  if (_editingSchema) _editingSchema.name = value;
}

export function _schemaFieldChange(i, prop, value) {
  _editingSchema.fields[i][prop] = value;
  if (prop === 'label' && !_editingSchema.fields[i].key) {
    _editingSchema.fields[i].key = _slugify(value);
    const keyInputs = document.querySelectorAll('#schema-editor-content .schema-field-key');
    if (keyInputs[i]) keyInputs[i].value = _editingSchema.fields[i].key;
    return;
  }
  if (prop === 'type') _renderSchemaEditor();
}

export function _addSchemaTemplate() {
  _editingSchema.cardTemplates.push({
    id: 't' + uid(), templateType: 'single',
    size: 'A6', layout: 'fulltext',
    locale: 'active',
    mapping: { imageSlots: [], sections: [''] }
  });
  _renderSchemaEditor();
}

export function _removeSchemaTemplate(i) {
  _editingSchema.cardTemplates.splice(i, 1);
  _renderSchemaEditor();
}

export function _schemaTemplateChange(i, prop, value) {
  const t = _editingSchema.cardTemplates[i];
  if (prop === 'templateType') {
    t.templateType = value;
    if (value === 'compound') {
      t.layout = '8img-8txt';
      t.size = 'A4';
      t.orientation = 'portrait';
      t.mapping = { imageSlot: '', labelSlot: '', textSlot: '' };
    } else {
      t.layout = 'fulltext';
      t.size = 'A6';
      t.mapping = { imageSlots: [], sections: [''] };
    }
  } else if (['imageSlot', 'labelSlot', 'textSlot'].includes(prop)) {
    t.mapping[prop] = value;
  } else if (prop === 'layout') {
    t.layout = value;
  } else if (prop === 'size') {
    t.size = value;
  } else if (prop === 'orientation') {
    t.orientation = value;
  } else if (prop === 'hideTitle' || prop === 'hideSectionLabels') {
    t[prop] = value;
    return;
  } else if (prop === 'cardClass') {
    t.cardClass = value;
    return;
  } else if (prop === 'locale') {
    t.locale = value;
    return;
  }
  _renderSchemaEditor();
}

export function _schemaCardConfig(i, prop, value) {
  const tmpl = _editingSchema.cardTemplates[i];
  if (!tmpl) return;
  if (!tmpl.cardConfig) tmpl.cardConfig = {};
  const n = value === '' ? undefined : parseInt(value, 10);
  if (n == null || isNaN(n)) delete tmpl.cardConfig[prop];
  else tmpl.cardConfig[prop] = n;
}

export function _schemaSingleImageSlot(ti, si, value) {
  if (!_editingSchema.cardTemplates[ti]?.mapping) return;
  _editingSchema.cardTemplates[ti].mapping.imageSlots[si] = value;
}

export function _schemaSingleSection(ti, si, value) {
  if (!_editingSchema.cardTemplates[ti]?.mapping) return;
  _editingSchema.cardTemplates[ti].mapping.sections[si] = value;
}

export function _addSchemaSection(ti) {
  _editingSchema.cardTemplates[ti].mapping.sections.push('');
  _renderSchemaEditor();
}

export function closeSchemaEditor() {
  document.getElementById('schema-editor-modal').close();
}

export function closePackDialog() {
  document.getElementById('pack-dialog').close();
}

export function saveSchema() {
  const hasTextField = _editingSchema.fields.some(f => f.type !== 'image');
  if (!hasTextField) {
    alert('Schema must have at least one text field.');
    return;
  }
  if (!_editingSchema.id) _editingSchema.id = `schema_${uid()}`;

  const idx = state.schemas.findIndex(s => s.id === _editingSchema.id);
  if (idx >= 0) {
    state.schemas[idx] = _editingSchema;
  } else {
    state.schemas.push(_editingSchema);
  }
  uiState.activeSchemaId = _editingSchema.id;

  window._migrateRecordFields?.();
  if (!Array.isArray(state.records)) state.records = [];

  const allTemplates = _editingSchema.cardTemplates || [];
  const templateMap = Object.fromEntries(allTemplates.map(t => [t.id, t]));
  const singleTemplates = allTemplates.filter(t => t.templateType === 'single');

  state.cards.forEach(card => {
    if (!card.recordId && !card.packedRecordIds) return;
    const tmpl = templateMap[card.templateId] ||
      (singleTemplates.length === 1 ? singleTemplates[0] : null);
    if (!tmpl) return;
    card.hideTitle = tmpl.hideTitle ?? false;
    card.hideSectionLabels = tmpl.hideSectionLabels ?? false;
  });

  if (state.cards.some(c => c.recordId || c.packedRecordIds)) window.dispatch('CARD_LIST_CHANGED');
  setDirty();
  closeSchemaEditor();
  window.renderRecordsPanel?.();
}