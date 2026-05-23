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

// Stubs for later tasks
function openRecordDetail(id) { /* implemented in Task 7 */ }
function generateAll()        { /* implemented in Task 9 */ }
function openPackDialog(id)   { /* implemented in Task 10 */ }

function openSchemaEditor() { /* implemented in Task 8 */ }
