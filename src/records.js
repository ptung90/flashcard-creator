// ── Records ──────────────────────────────────────────────────────────
function renderRecordsPanel() {
  const panel = document.getElementById('records-panel');
  if (!panel) return;
  if (!state.schema) {
    panel.innerHTML = `
      <div style="padding:32px;text-align:center;color:#555;">
        <p>No schema configured for this project.</p>
        <button onclick="openSchemaEditor()">Setup Schema</button>
      </div>`;
    return;
  }

  const textFields       = state.schema.fields.filter(f => f.type !== 'image');
  const compoundTemplates = state.schema.cardTemplates.filter(t => t.templateType === 'compound');

  const packMenuItems = compoundTemplates.length
    ? compoundTemplates.map(t =>
        `<div style="padding:6px 12px;cursor:pointer;" onmouseenter="this.style.background='#f3f4f6'"
              onmouseleave="this.style.background=''" onclick="openPackDialog('${t.id}')">${esc(t.layout)}</div>`
      ).join('')
    : '<div style="padding:6px 12px;color:#999;">No compound templates</div>';

  const headerHtml = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <strong style="font-size:15px;">Records</strong>
      <button onclick="addRecord()">+ Add</button>
      <button onclick="generateAll()">Generate All</button>
      <div style="position:relative;display:inline-block;">
        <button onclick="togglePackMenu(event)">Pack ▾</button>
        <div id="pack-menu" style="display:none;position:absolute;top:100%;left:0;background:white;
             border:1px solid #ccc;border-radius:4px;z-index:100;min-width:130px;box-shadow:0 4px 8px rgba(0,0,0,.1);">
          ${packMenuItems}
        </div>
      </div>
      <button onclick="openSchemaEditor()">⚙ Schema</button>
    </div>`;

  const colHeaders = textFields.map(f =>
    `<th style="text-align:left;padding:4px 8px;font-weight:600;">${esc(f.label)}</th>`
  ).join('');

  const rows = state.records.map(rec => {
    const status = getRecordStatus(rec);
    const badge  = `<span style="padding:2px 6px;border-radius:10px;font-size:11px;
      background:${status === 'synced' ? '#d1fae5' : '#fef3c7'};
      color:${status === 'synced' ? '#065f46' : '#92400e'};">${status}</span>`;
    const cols = textFields.map(f => {
      const val = rec.fields[f.key] ?? '';
      return `<td style="padding:4px 8px;vertical-align:middle;max-width:200px;
                         overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${esc(val.length > 42 ? val.slice(0, 42) + '…' : val)}
      </td>`;
    }).join('');
    return `<tr class="record-row" onclick="openRecordDetail('${rec.id}')"
              style="cursor:pointer;border-bottom:1px solid #f3f4f6;" data-id="${rec.id}"
              onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background=''">
      ${cols}
      <td style="padding:4px 8px;">${badge}</td>
      <td style="padding:4px 8px;">
        <button onclick="event.stopPropagation();deleteRecord('${rec.id}')"
                style="font-size:11px;padding:2px 5px;">✕</button>
      </td>
    </tr>`;
  }).join('');

  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="border-bottom:2px solid #e5e7eb;">${colHeaders}
        <th style="padding:4px 8px;font-weight:600;">Status</th>
        <th style="width:32px;"></th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="99" style="padding:12px 8px;color:#999;font-style:italic;">No records yet</td></tr>'}</tbody>
    </table>`;

  panel.innerHTML = headerHtml + tableHtml +
    `<div id="record-detail" style="display:none;position:fixed;right:16px;top:56px;bottom:16px;
       width:340px;background:white;border:1px solid #ddd;border-radius:8px;
       box-shadow:0 4px 16px rgba(0,0,0,.12);overflow:auto;padding:16px;z-index:50;"></div>`;
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
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Close pack menu on outside click
document.addEventListener('click', () => {
  const m = document.getElementById('pack-menu');
  if (m) m.style.display = 'none';
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
      input = `<div style="margin:4px 0;">
        ${val ? `<img src="${val}" style="max-width:100%;max-height:80px;display:block;
                      margin-bottom:4px;border-radius:4px;object-fit:contain;">` : ''}
        <button onclick="_pickRecordImage('${record.id}','${f.key}')">Choose Image</button>
        ${val ? `<button onclick="_clearRecordImage('${record.id}','${f.key}')">✕ Clear</button>` : ''}
      </div>`;
    } else if (f.type === 'text-long') {
      input = `<textarea rows="3" style="width:100%;box-sizing:border-box;resize:vertical;font-size:13px;"
        onchange="_setRecordField('${record.id}','${f.key}',this.value)"
        >${esc(val)}</textarea>`;
    } else {
      input = `<input type="text" style="width:100%;box-sizing:border-box;font-size:13px;"
        value="${esc(val)}" onchange="_setRecordField('${record.id}','${f.key}',this.value)">`;
    }
    return `<div style="margin-bottom:10px;">
      <label style="display:block;font-size:11px;color:#666;margin-bottom:2px;font-weight:600;">
        ${esc(f.label)}
      </label>
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
    return `<div style="display:inline-block;margin-right:8px;vertical-align:top;margin-bottom:8px;">
      <div style="font-size:10px;color:#888;margin-bottom:2px;">${esc(t.size || '')} ${esc(t.layout)}</div>
      <div style="width:${tw}px;height:${th}px;overflow:hidden;position:relative;
                  border:1px solid #ddd;border-radius:2px;flex-shrink:0;">
        <div style="transform:scale(${scale.toFixed(3)});transform-origin:top left;
                    width:${px.w}px;height:${px.h}px;position:absolute;top:0;left:0;">
          ${buildCardHTML(tempCard, state.settings, false, px)}
        </div>
      </div>
    </div>`;
  }).join('');

  const previewSection = singleTemplates.length
    ? `<div style="margin-top:14px;border-top:1px solid #f0f0f0;padding-top:10px;">
        <div style="font-size:11px;color:#666;font-weight:600;margin-bottom:6px;">Preview</div>
        ${previews}
       </div>`
    : '';

  detail.style.display = 'block';
  detail.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <strong style="font-size:14px;">Edit Record</strong>
      <div style="display:flex;gap:6px;">
        <button onclick="generateRecord(state.records.find(r=>r.id==='${record.id}'));
                         renderRecordsPanel();openRecordDetail('${record.id}')">Generate</button>
        <button onclick="document.getElementById('record-detail').style.display='none'">✕</button>
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

// Stubs for later tasks
function generateAll()        { /* implemented in Task 9 */ }
function openPackDialog(id)   { /* implemented in Task 10 */ }

function openSchemaEditor() { /* implemented in Task 8 */ }
