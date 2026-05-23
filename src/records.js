// ── Records ──────────────────────────────────────────────────────────
function renderRecordsPanel() {
  const panel = document.getElementById('records-panel');
  if (!panel) return;
  if (!state.schema) {
    panel.innerHTML = `
      <div class="records-empty">
        <p>No schema configured for this project.</p>
        <button class="btn btn-sm btn-secondary" onclick="openSchemaEditor()">Setup Schema</button>
      </div>`;
    return;
  }

  const textFields       = state.schema.fields.filter(f => f.type !== 'image');
  const compoundTemplates = state.schema.cardTemplates.filter(t => t.templateType === 'compound');

  const packMenuItems = compoundTemplates.length
    ? compoundTemplates.map(t =>
        `<button class="records-pack-item" onclick="openPackDialog('${t.id}')">${esc(t.layout)}</button>`
      ).join('')
    : '<div class="records-pack-item" style="color:var(--ink-400);cursor:default;">No compound templates</div>';

  const headerHtml = `
    <div class="records-header">
      <span class="records-header-title">Records</span>
      <button class="btn btn-sm btn-secondary" onclick="addRecord()">+ Add</button>
      <button class="btn btn-sm btn-secondary" onclick="generateAll()">Generate All</button>
      <div class="records-pack-wrap">
        <button class="btn btn-sm btn-secondary" onclick="togglePackMenu(event)">Pack ▾</button>
        <div id="pack-menu">${packMenuItems}</div>
      </div>
      <button class="btn btn-sm btn-secondary" onclick="openSchemaEditor()">⚙ Schema</button>
    </div>`;

  const colHeaders = textFields.map(f =>
    `<th>${esc(f.label)}</th>`
  ).join('');

  const rows = state.records.map(rec => {
    const status = getRecordStatus(rec);
    const badge  = `<span class="rec-badge rec-badge--${status}">${status}</span>`;
    const cols = textFields.map(f => {
      const val = rec.fields[f.key] ?? '';
      return `<td><span class="record-col-text">${esc(val.length > 42 ? val.slice(0, 42) + '…' : val)}</span></td>`;
    }).join('');
    return `<tr class="record-row" onclick="openRecordDetail('${rec.id}')" data-id="${rec.id}">
      ${cols}
      <td>${badge}</td>
      <td>
        <button class="btn btn-sm record-del-btn" onclick="event.stopPropagation();deleteRecord('${rec.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');

  const tableHtml = `
    <table class="records-table">
      <thead><tr>${colHeaders}
        <th>Status</th>
        <th style="width:32px;"></th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="99" style="padding:12px 8px;color:var(--ink-400);font-style:italic;">No records yet</td></tr>'}</tbody>
    </table>`;

  panel.innerHTML = headerHtml + tableHtml + `<div id="record-detail"></div>`;
}

function getRecordStatus(record) {
  const cards = state.cards.filter(c => c.recordId === record.id);
  if (cards.length === 0) return 'draft';
  if (_hashStr(JSON.stringify(record.fields)) !== record.fieldsHash) return 'draft';
  return 'synced';
}

function addRecord() {
  if (!state.schema) return;
  const rec = { id: 'rec_' + uid(), fieldsHash: '', fields: {} };
  state.schema.fields.forEach(f => { rec.fields[f.key] = ''; });
  state.records.push(rec);
  setDirty();
  renderRecordsPanel();
  openRecordDetail(rec.id);
}

function deleteRecord(id) {
  const yes = confirm('Delete generated cards for this record too?');
  if (yes) {
    state.cards = state.cards.filter(c => c.recordId !== id);
    dispatch('CARD_LIST_CHANGED');
  } else {
    state.cards.filter(c => c.recordId === id).forEach(c => {
      c.recordId = null; c.templateId = null;
    });
    dispatch('CARD_LIST_CHANGED');
  }
  state.records = state.records.filter(r => r.id !== id);
  setDirty();
  renderRecordsPanel();
}

function togglePackMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('pack-menu');
  if (menu) menu.classList.toggle('open');
}

// Close pack menu on outside click
document.addEventListener('click', () => {
  const m = document.getElementById('pack-menu');
  if (m) m.classList.remove('open');
});

function openRecordDetail(id) {
  const record = state.records.find(r => r.id === id);
  if (!record) return;
  const detail = document.getElementById('record-detail');
  if (!detail) return;

  const fields          = state.schema.fields;
  const singleTemplates = state.schema.cardTemplates.filter(t => t.templateType === 'single');

  const fieldInputs = fields.map(f => {
    const val = record.fields[f.key] ?? '';
    let input;
    if (f.type === 'image') {
      input = `<div class="record-field-img">
        ${val ? `<img src="${val}" class="record-field-img-preview">` : ''}
        <button class="btn btn-sm btn-secondary" onclick="_pickRecordImage('${record.id}','${f.key}')">Choose Image</button>
        ${val ? `<button class="btn btn-sm" onclick="_clearRecordImage('${record.id}','${f.key}')">✕ Clear</button>` : ''}
      </div>`;
    } else if (f.type === 'text-long') {
      input = `<textarea rows="3" onchange="_setRecordField('${record.id}','${f.key}',this.value)"
        >${esc(val)}</textarea>`;
    } else {
      input = `<input type="text" value="${esc(val)}" onchange="_setRecordField('${record.id}','${f.key}',this.value)">`;
    }
    return `<div class="record-field-group">
      <label class="record-field-label">${esc(f.label)}</label>
      ${input}
    </div>`;
  }).join('');

  const previews = singleTemplates.map(t => {
    const px      = getPaperPx(t.size || 'A6', 'portrait');
    const scale   = 130 / px.w;
    const tw      = Math.round(px.w * scale);
    const th      = Math.round(px.h * scale);
    const tempCard = {
      ...newCard(),
      layout:    t.layout,
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
        <div class="record-field-label" style="margin-bottom:6px;">Preview</div>
        ${previews}
       </div>`
    : '';

  detail.style.display = 'block';
  detail.innerHTML = `
    <div class="record-detail-header">
      <span class="record-detail-title">Edit Record</span>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-primary" onclick="generateRecord(state.records.find(r=>r.id==='${record.id}'));
                         renderRecordsPanel();openRecordDetail('${record.id}')">Generate</button>
        <button class="btn btn-sm" onclick="document.getElementById('record-detail').style.display='none'">✕</button>
      </div>
    </div>
    ${fieldInputs}
    ${previewSection}
  `;
}

function _setRecordField(recordId, key, value) {
  const record = state.records.find(r => r.id === recordId);
  if (!record) return;
  record.fields[key] = value;
  setDirty();
  openRecordDetail(recordId);  // refresh preview strip
}

function _pickRecordImage(recordId, key) {
  const input = document.createElement('input');
  input.type   = 'file';
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

function _clearRecordImage(recordId, key) {
  _setRecordField(recordId, key, '');
}

// ── Record Generation ────────────────────────────────────────────────────────────

function _fieldVal(record, fieldId) {
  const f = state.schema.fields.find(x => x.id === fieldId);
  return f ? (record.fields[f.key] ?? '') : '';
}

function generateRecord(record, { skipDispatch = false } = {}) {
  if (!state.schema) return;
  const singleTemplates = state.schema.cardTemplates.filter(t => t.templateType === 'single');
  for (const template of singleTemplates) {
    let card = state.cards.find(c => c.recordId === record.id && c.templateId === template.id);
    if (!card) {
      card = newCard();
      card.recordId   = record.id;
      card.templateId = template.id;
      state.cards.push(card);
    }
    card.layout      = template.layout;
    card.orientation = 'portrait';
    card.paperSize   = template.size || null;
    card.images      = (template.mapping.imageSlots || [])
      .map((fid, slot) => ({ slot, url: fid ? _fieldVal(record, fid) : '' }))
      .filter(img => img.url);
    card.sections    = (template.mapping.sections || [])
      .filter(Boolean)
      .map(fid => {
        const f = state.schema.fields.find(x => x.id === fid);
        return { id: uid(), label: f?.label ?? '', content: _fieldVal(record, fid) };
      });
  }
  record.fieldsHash = _hashStr(JSON.stringify(record.fields));
  if (!skipDispatch) dispatch('CARD_LIST_CHANGED');
}

function generateAll() {
  if (!state.schema) return;
  let count = 0;
  for (const record of state.records) {
    if (getRecordStatus(record) === 'synced') continue;
    generateRecord(record, { skipDispatch: true });
    count++;
  }
  setDirty();
  dispatch('CARD_LIST_CHANGED');
  renderRecordsPanel();
  const msg = 'Generated ' + count + ' card' + (count !== 1 ? 's' : '');
  if (typeof showToast === 'function') showToast(msg);
  else {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:8px 16px;border-radius:6px;z-index:9999;font-size:13px;';
    document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
  }
}

let _packTemplateId = null;

function openPackDialog(templateId) {
  _packTemplateId = templateId;
  const template  = state.schema?.cardTemplates.find(t => t.id === templateId);
  if (!template) return;

  document.getElementById('pack-dialog-layout').textContent = template.layout;

  const textFields  = state.schema.fields.filter(f => f.type !== 'image');
  const checkboxes  = state.records.map(r => {
    const label = textFields.slice(0, 2).map(f => r.fields[f.key] || '').filter(Boolean).join(' — ') || r.id;
    return `<label>
      <input type="checkbox" checked value="${r.id}">
      <span>${esc(label)}</span>
    </label>`;
  }).join('');

  document.getElementById('pack-dialog-records').innerHTML =
    checkboxes || '<em style="color:var(--ink-400);font-size:13px;">No records to pack</em>';

  const menu = document.getElementById('pack-menu');
  if (menu) menu.classList.remove('open');

  document.getElementById('pack-dialog').showModal();
}

function confirmPack() {
  const template = state.schema?.cardTemplates.find(t => t.id === _packTemplateId);
  if (!template) return;

  const checkedIds = [...document.querySelectorAll('#pack-dialog-records input[type=checkbox]:checked')]
    .map(cb => cb.value);
  const selectedRecords = state.records.filter(r => checkedIds.includes(r.id));

  packRecords(template, selectedRecords);
  dispatch('CARD_LIST_CHANGED');
  document.getElementById('pack-dialog').close();

  const used = Math.min(selectedRecords.length, LAYOUT_SLOTS[template.layout] ?? 0);
  const msg  = 'Packed ' + used + ' record' + (used !== 1 ? 's' : '') + ' into ' + template.layout;
  if (typeof showToast === 'function') showToast(msg);
  else {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:8px 16px;border-radius:6px;z-index:9999;font-size:13px;';
    document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
  }
}

function packRecords(template, selectedRecords) {
  const layout    = template.layout;
  const slotCount = LAYOUT_SLOTS[layout] ?? 0;
  if (slotCount === 0) return;
  const records   = selectedRecords.slice(0, slotCount);

  const card           = newCard();
  card.layout          = layout;
  card.orientation     = 'portrait';
  card.imageGridSplit  = { ...(LAYOUT_SPLIT_DEFAULTS[layout] || LAYOUT_SPLIT_DEFAULTS['1full']) };
  card.packedRecordIds = records.map(r => r.id);
  card.title           = layout + ' · ' + new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' });

  card.images = records.map((rec, slot) => ({
    slot,
    url: template.mapping.imageSlot ? _fieldVal(rec, template.mapping.imageSlot) : ''
  })).filter(img => img.url);

  card.sections = records.map(rec => ({
    id:      uid(),
    label:   '',
    content: template.mapping.textSlot ? _fieldVal(rec, template.mapping.textSlot) : ''
  }));

  while (card.sections.length < slotCount) {
    card.sections.push({ id: uid(), label: '', content: '' });
  }

  state.cards.push(card);
  setDirty();
}

// ── Schema Editor ─────────────────────────────────────────────────────────────
let _editingSchema = null;

function openSchemaEditor() {
  _editingSchema = state.schema
    ? JSON.parse(JSON.stringify(state.schema))
    : { fields: [], cardTemplates: [] };
  _renderSchemaEditor();
  document.getElementById('schema-editor-modal').showModal();
}

const _COMPOUND_LAYOUTS = ['2img-2txt', '3img-3txt', '8img-8txt'];
const _SINGLE_SIZES     = ['A4', 'A5', 'A6', 'Letter'];

function _renderSchemaEditor() {
  const s           = _editingSchema;
  const imgFields   = s.fields.filter(f => f.type === 'image');
  const txtFields   = s.fields.filter(f => f.type !== 'image');
  const singleLayouts = LAYOUTS.filter(l => !_COMPOUND_LAYOUTS.includes(l) && l !== 'txtgrid');

  const fieldsHtml = s.fields.map((f, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
      <input type="text" placeholder="Label" value="${esc(f.label)}" style="flex:1;min-width:80px;"
        oninput="_schemaFieldChange(${i},'label',this.value)">
      <input type="text" placeholder="key" value="${esc(f.key)}" style="width:90px;"
        oninput="_schemaFieldChange(${i},'key',this.value)">
      <select onchange="_schemaFieldChange(${i},'type',this.value)" style="width:90px;">
        ${['image','text','text-long'].map(t =>
          `<option value="${t}" ${f.type===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <button class="btn btn-sm" onclick="_removeSchemaField(${i})">✕</button>
    </div>`).join('');

  const templatesHtml = s.cardTemplates.map((t, i) => {
    const isCompound = t.templateType === 'compound';
    const typeToggle = `
      <select onchange="_schemaTemplateChange(${i},'templateType',this.value)" style="width:80px;">
        <option value="single"   ${!isCompound?'selected':''}>Single</option>
        <option value="compound" ${isCompound?'selected':''}>Compound</option>
      </select>`;

    if (isCompound) {
      const imgOpts = imgFields.map(f =>
        `<option value="${f.id}" ${t.mapping.imageSlot===f.id?'selected':''}>${esc(f.label)}</option>`).join('');
      const txtOpts = txtFields.map(f =>
        `<option value="${f.id}" ${t.mapping.textSlot===f.id?'selected':''}>${esc(f.label)}</option>`).join('');
      return `<div class="schema-template-card">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          ${typeToggle}
          <select onchange="_schemaTemplateChange(${i},'layout',this.value)">
            ${_COMPOUND_LAYOUTS.map(l =>
              `<option value="${l}" ${t.layout===l?'selected':''}>${l}</option>`).join('')}
          </select>
          <button class="btn btn-sm" onclick="_removeSchemaTemplate(${i})">✕</button>
        </div>
        <div style="display:flex;gap:12px;font-size:12px;flex-wrap:wrap;">
          <label>Image field:
            <select onchange="_schemaTemplateChange(${i},'imageSlot',this.value)">
              <option value="">—</option>${imgOpts}
            </select>
          </label>
          <label>Text field:
            <select onchange="_schemaTemplateChange(${i},'textSlot',this.value)">
              <option value="">—</option>${txtOpts}
            </select>
          </label>
        </div>
      </div>`;
    } else {
      const numImgSlots = LAYOUT_SLOTS[t.layout] ?? 1;
      const imgSlots = [...(t.mapping.imageSlots || [])];
      while (imgSlots.length < numImgSlots) imgSlots.push('');
      const imgSlotSelects = imgSlots.map((fid, si) =>
        `<select onchange="_schemaSingleImageSlot(${i},${si},this.value)">
          <option value="">—</option>
          ${imgFields.map(f =>
            `<option value="${f.id}" ${fid===f.id?'selected':''}>${esc(f.label)}</option>`).join('')}
        </select>`).join(' ');
      const secSelects = (t.mapping.sections || []).map((fid, si) =>
        `<select onchange="_schemaSingleSection(${i},${si},this.value)">
          <option value="">—</option>
          ${txtFields.map(f =>
            `<option value="${f.id}" ${fid===f.id?'selected':''}>${esc(f.label)}</option>`).join('')}
        </select>`).join(' ');
      return `<div class="schema-template-card">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          ${typeToggle}
          <select onchange="_schemaTemplateChange(${i},'layout',this.value)">
            ${singleLayouts.map(l =>
              `<option value="${l}" ${t.layout===l?'selected':''}>${l}</option>`).join('')}
          </select>
          <select onchange="_schemaTemplateChange(${i},'size',this.value)" style="width:60px;">
            ${_SINGLE_SIZES.map(sz =>
              `<option value="${sz}" ${(t.size||'A6')===sz?'selected':''}>${sz}</option>`).join('')}
          </select>
          <button class="btn btn-sm" onclick="_removeSchemaTemplate(${i})">✕</button>
        </div>
        <div style="font-size:12px;">
          <div>Image slots: ${imgSlotSelects}</div>
          <div style="margin-top:4px;">Sections: ${secSelects}
            <button class="btn btn-sm" style="margin-left:4px;"
              onclick="_addSchemaSection(${i})">+ section</button>
          </div>
        </div>
      </div>`;
    }
  }).join('');

  document.getElementById('schema-editor-content').innerHTML = `
    <div>
      <div class="dialog-section-title">Fields</div>
      ${fieldsHtml}
      <button class="btn btn-sm btn-secondary" onclick="_addSchemaField()">+ Add Field</button>
    </div>
    <div style="margin-top:16px;">
      <div class="dialog-section-title">Card Templates</div>
      ${templatesHtml}
      <button class="btn btn-sm btn-secondary" onclick="_addSchemaTemplate()">+ Add Template</button>
    </div>`;
}

function _slugify(s) {
  return s.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
}

function _addSchemaField() {
  _editingSchema.fields.push({ id: 'f' + uid(), key: '', type: 'text', label: '' });
  _renderSchemaEditor();
}

function _removeSchemaField(i) {
  _editingSchema.fields.splice(i, 1);
  _renderSchemaEditor();
}

function _schemaFieldChange(i, prop, value) {
  _editingSchema.fields[i][prop] = value;
  if (prop === 'label' && !_editingSchema.fields[i].key) {
    _editingSchema.fields[i].key = _slugify(value);
  }
  if (prop !== 'key') _renderSchemaEditor();
}

function _addSchemaTemplate() {
  _editingSchema.cardTemplates.push({
    id: 't' + uid(), templateType: 'single',
    size: 'A6', layout: 'fulltext',
    mapping: { imageSlots: [], sections: [''] }
  });
  _renderSchemaEditor();
}

function _removeSchemaTemplate(i) {
  _editingSchema.cardTemplates.splice(i, 1);
  _renderSchemaEditor();
}

function _schemaTemplateChange(i, prop, value) {
  const t = _editingSchema.cardTemplates[i];
  if (prop === 'templateType') {
    t.templateType = value;
    if (value === 'compound') {
      t.layout  = '8img-8txt';
      t.mapping = { imageSlot: '', textSlot: '' };
      delete t.size;
    } else {
      t.layout  = 'fulltext';
      t.size    = 'A6';
      t.mapping = { imageSlots: [], sections: [''] };
    }
  } else if (prop === 'imageSlot' || prop === 'textSlot') {
    t.mapping[prop] = value;
  } else if (prop === 'layout') {
    t.layout = value;
  } else if (prop === 'size') {
    t.size = value;
  }
  _renderSchemaEditor();
}

function _schemaSingleImageSlot(ti, si, value) {
  if (!_editingSchema.cardTemplates[ti]?.mapping) return;
  _editingSchema.cardTemplates[ti].mapping.imageSlots[si] = value;
}

function _schemaSingleSection(ti, si, value) {
  if (!_editingSchema.cardTemplates[ti]?.mapping) return;
  _editingSchema.cardTemplates[ti].mapping.sections[si] = value;
}

function _addSchemaSection(ti) {
  _editingSchema.cardTemplates[ti].mapping.sections.push('');
  _renderSchemaEditor();
}

function saveSchema() {
  state.schema = _editingSchema;
  if (!Array.isArray(state.records)) state.records = [];
  setDirty();
  document.getElementById('schema-editor-modal').close();
  renderRecordsPanel();
}
