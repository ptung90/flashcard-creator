// ── Records ──────────────────────────────────────────────────────────
let _hiddenRecCols = new Set(JSON.parse(localStorage.getItem('fc_hidden_rec_cols') || '[]'));

function _saveHiddenRecCols() {
  localStorage.setItem('fc_hidden_rec_cols', JSON.stringify([..._hiddenRecCols]));
}

function toggleRecCol(key) {
  if (_hiddenRecCols.has(key)) _hiddenRecCols.delete(key);
  else _hiddenRecCols.add(key);
  _saveHiddenRecCols();
  renderRecordsPanel();
}

function toggleColMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('col-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}
function _linkedCardChips(recordId) {
  const chips = [];
  state.cards.forEach((c, i) => {
    const isSingle = c.recordId === recordId;
    const isCompound = !isSingle && c.packedRecordIds?.includes(recordId);
    if (!isSingle && !isCompound) return;
    const cls = isCompound ? 'rec-card-chip rec-card-chip--compound' : 'rec-card-chip';
    chips.push(`<span class="${cls}" onclick="event.stopPropagation();setActive('${c.id}')" title="${esc(c.title || 'Card ' + (i + 1))}">#${i + 1}</span>`);
  });
  return chips.join('');
}

function renderRecordsPanel() {
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

  const headerHtml = `
    <div class="records-header">
      <span class="records-header-title">${t('rec.title')}</span>
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
    </div>`;

  const visibleTextFields = textFields.filter(f => !_hiddenRecCols.has('field:' + f.key));
  const showStatus = !_hiddenRecCols.has('status');
  const showCards = !_hiddenRecCols.has('cards');

  const colHeaders = visibleTextFields.map(f => `<th>${esc(f.label)}</th>`).join('');

  const rows = state.records.map((rec, ri) => {
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
    return `<tr class="record-row" onclick="openRecordDetail('${rec.id}')" data-id="${rec.id}">
      <td class="rec-row-num">${ri + 1}</td>${cols}${statusTd}${cardsTd}
      <td><button class="btn btn-sm record-del-btn" onclick="event.stopPropagation();deleteRecord('${rec.id}')">✕</button></td>
    </tr>`;
  }).join('');

  const theadExtra = (showStatus ? `<th style="width:72px">${t('rec.colStatus')}</th>` : '') + (showCards ? `<th style="width:120px">${t('rec.colCards')}</th>` : '');
  const tableHtml = `
    <table class="records-table">
      <thead><tr><th style="width:28px">#</th>${colHeaders}${theadExtra}<th style="width:32px;"></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="99" style="padding:12px 8px;color:var(--ink-400);font-style:italic;">${t('rec.noRecords')}</td></tr>`}</tbody>
    </table>`;

  panel.innerHTML = headerHtml + tableHtml + `<div id="record-detail" style="display:none"></div>`;
}

function getRecordStatus(record) {
  if (!record.fieldsHash) return 'draft';
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
  const yes = confirm(t('rec.confirmDelete'));
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
          <button class="btn btn-secondary btn-sm btn-icon" onclick="_pasteToRecordImage('${record.id}','${f.key}')" title="Paste from clipboard"><svg class="icon" style="width:13px;height:13px"><use href="#i-clipboard"/></svg></button>
          ${val ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="_copyRecordImage('${record.id}','${f.key}')" title="Copy image"><svg class="icon" style="width:13px;height:13px"><use href="#i-copy"/></svg></button>` : ''}
          <button class="btn btn-secondary btn-sm btn-icon" onclick="_pickRecordImage('${record.id}','${f.key}')" title="Choose file"><svg class="icon" style="width:13px;height:13px"><use href="#i-search"/></svg></button>
          ${val ? `<button class="btn btn-danger btn-sm btn-icon" onclick="_clearRecordImage('${record.id}','${f.key}')" title="Clear"><svg class="icon" style="width:13px;height:13px"><use href="#i-x"/></svg></button>` : ''}
        </div>
      </div>`;
    } else {
      const longCls = f.type === 'text-long' ? ' rec-tiptap--long' : '';
      input = window.tiptapReady === true
        ? `<div class="section-tiptap-editor${longCls}" id="rec-tiptap-${f.key}" style="${contentFontStyle}"></div>`
        : `<textarea rows="${f.type === 'text-long' ? 4 : 1}" style="${contentFontStyle}"
            onchange="_setRecordField('${record.id}','${f.key}',this.value)"
            >${esc(val)}</textarea>`;
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
        <div class="record-field-label" style="margin-bottom:6px;">Preview</div>
        ${previews}
       </div>`
    : '';

  const recToolbar = window.tiptapReady === true ? `
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
        <button class="editor-toolbar-btn" data-cmd="clearFormat" onclick="_recToolbarCmd('clearFormat')" title="Clear formatting"><svg class="icon" style="width:13px;height:13px"><use href="#i-clear-format"/></svg></button>
      </div>
    </div>` : '';

  const linkedChips = _linkedCardChips(record.id);

  detail.style.display = 'block';
  detail.innerHTML = `
    <div class="record-detail-sticky">
      <div class="record-detail-header">
        <div class="record-detail-title-area">
          <span class="record-detail-title">Edit Record</span>
          ${linkedChips ? `<div class="record-detail-chips">${linkedChips}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-sm btn-primary" onclick="syncRecord('${record.id}')">${t('rec.sync')}</button>
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
  if (window.tiptapReady === true) _initRecordTiptapInstances(record);
}

function _setRecordField(recordId, key, value) {
  const record = state.records.find(r => r.id === recordId);
  if (!record) return;
  record.fields[key] = value;
  setDirty();
  openRecordDetail(recordId);
}

function _pickRecordImage(recordId, key) {
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

function _clearRecordImage(recordId, key) {
  _setRecordField(recordId, key, '');
}

function _copyRecordImage(recordId, key) {
  const record = state.records.find(r => r.id === recordId);
  if (!record) return;
  const url = record.fields[key];
  if (!url) return;
  _imgClipboard = { url, slot: 0 };
  showToast(t('rec.toast.imageCopied'));
}

async function _pasteToRecordImage(recordId, key) {
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

function _pasteRecordImage(recordId, key, e) {
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

function _recToolbarCmd(cmd) {
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
    const editor = new window.TipTapEditor({
      element: el,
      ...(window._tiptapBaseConfig('Content...')),
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
      card.recordId = record.id;
      card.templateId = template.id;
      state.cards.push(card);
    }
    card.layout = template.layout;
    card.orientation = 'portrait';
    card.paperSize = template.size || null;
    card.images = (template.mapping.imageSlots || [])
      .map((fid, slot) => ({ slot, url: fid ? _fieldVal(record, fid) : '' }))
      .filter(img => img.url);
    card.sections = (template.mapping.sections || [])
      .filter(Boolean)
      .map(fid => {
        const f = state.schema.fields.find(x => x.id === fid);
        return { id: uid(), label: f?.label ?? '', content: _fieldVal(record, fid) };
      });
  }
  record.fieldsHash = _hashStr(JSON.stringify(record.fields));
  if (!skipDispatch) dispatch('CARD_LIST_CHANGED');
}

function syncRecord(recordId) {
  const record = state.records.find(r => r.id === recordId);
  if (!record || !state.schema) return;

  // Generate / update single-template cards
  generateRecord(record, { skipDispatch: true });

  // Update compound packed cards that contain this record
  const compoundTemplates = state.schema.cardTemplates.filter(tmpl => tmpl.templateType === 'compound');
  state.cards.forEach(card => {
    if (!card.packedRecordIds?.includes(recordId)) return;
    const template = compoundTemplates.find(t => t.id === card.templateId);
    if (!template) return;
    const isTxtGrid = template.layout === 'txtgrid';
    const fixedSlots = LAYOUT_SLOTS[template.layout] ?? 0;
    const records = card.packedRecordIds.map(id => state.records.find(r => r.id === id)).filter(Boolean);
    if (!records.length) return;
    const slotCount = isTxtGrid ? records.length : fixedSlots;
    if (!isTxtGrid) {
      card.images = records.map((rec, slot) => ({
        slot, url: template.mapping.imageSlot ? _fieldVal(rec, template.mapping.imageSlot) : ''
      })).filter(img => img.url);
    }
    card.sections = records.map(rec => ({
      id: uid(),
      label: template.mapping.labelSlot ? _fieldVal(rec, template.mapping.labelSlot) : '',
      content: template.mapping.textSlot ? _fieldVal(rec, template.mapping.textSlot) : ''
    }));
    while (card.sections.length < slotCount) card.sections.push({ id: uid(), label: '', content: '' });
  });

  setDirty();
  dispatch('CARD_LIST_CHANGED');
  renderRecordsPanel();
  openRecordDetail(recordId);
  showToast(t('rec.toast.synced'));
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
  const msg = t('rec.toast.generated').replace('{n}', count).replace('{s}', count !== 1 ? 's' : '');
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
  const template = state.schema?.cardTemplates.find(t => t.id === templateId);
  if (!template) return;

  document.getElementById('pack-dialog-layout').textContent = template.layout;

  const textFields = state.schema.fields.filter(f => f.type !== 'image');
  const checkboxes = state.records.map(r => {
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
  _consolidateSameLayout(template.layout);
  dispatch('CARD_LIST_CHANGED');
  closePackDialog();

  const slots = LAYOUT_SLOTS[template.layout] ?? 0;
  const chunks = slots > 0 ? Math.ceil(selectedRecords.length / slots) : 1;
  const msg = `Packed ${selectedRecords.length} record${selectedRecords.length !== 1 ? 's' : ''} into ${chunks} card${chunks !== 1 ? 's' : ''} (${template.layout})`;
  if (typeof showToast === 'function') showToast(msg);
  else {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:8px 16px;border-radius:6px;z-index:9999;font-size:13px;';
    document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
  }
}

function packRecords(template, selectedRecords) {
  const layout = template.layout;
  const isTxtGrid = layout === 'txtgrid';
  const fixedSlots = LAYOUT_SLOTS[layout] ?? 0;
  if (fixedSlots === 0 && !isTxtGrid) return;

  // Split into chunks; txtgrid = one chunk with all records
  const chunks = isTxtGrid
    ? [selectedRecords]
    : Array.from({ length: Math.ceil(selectedRecords.length / fixedSlots) }, (_, i) =>
      selectedRecords.slice(i * fixedSlots, (i + 1) * fixedSlots)
    );

  const newChunkIds = chunks.map(ch => ch.map(r => r.id));

  // Remove stale packed cards for this template no longer in new chunks
  state.cards = state.cards.filter(c => {
    if (c.templateId !== template.id || !c.packedRecordIds?.length) return true;
    return newChunkIds.some(ids =>
      ids.length === c.packedRecordIds.length &&
      ids.every((id, i) => id === c.packedRecordIds[i])
    );
  });

  chunks.forEach(records => {
    const slotCount = isTxtGrid ? records.length : fixedSlots;
    const recordIds = records.map(r => r.id);

    const existing = state.cards.find(c =>
      c.templateId === template.id &&
      c.packedRecordIds?.length === recordIds.length &&
      c.packedRecordIds.every((id, i) => id === recordIds[i])
    );

    let card;
    if (existing) {
      card = existing;
    } else {
      card = newCard();
      card.layout = layout;
      card.orientation = template.orientation || 'portrait';
      card.paperSize = template.size || null;
      card.imageGridSplit = { ...(LAYOUT_SPLIT_DEFAULTS[layout] || LAYOUT_SPLIT_DEFAULTS['1full']) };
      card.title = `${layout} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      state.cards.push(card);
    }

    card.templateId = template.id;
    card.packedRecordIds = recordIds;

    if (!isTxtGrid) {
      card.images = records.map((rec, slot) => ({
        slot,
        url: template.mapping.imageSlot ? _fieldVal(rec, template.mapping.imageSlot) : ''
      })).filter(img => img.url);
    }

    card.sections = records.map(rec => ({
      id: uid(),
      label: template.mapping.labelSlot ? _fieldVal(rec, template.mapping.labelSlot) : '',
      content: template.mapping.textSlot ? _fieldVal(rec, template.mapping.textSlot) : ''
    }));

    while (card.sections.length < slotCount) {
      card.sections.push({ id: uid(), label: '', content: '' });
    }
  });

  setDirty();
}

function syncAllPacked() {
  const templates = state.schema?.cardTemplates?.filter(t => t.templateType === 'compound') || [];

  // Group packed cards by templateId (in state.cards order)
  const packedByTemplate = {};
  state.cards.forEach(c => {
    if (c.templateId && c.packedRecordIds?.length)
      (packedByTemplate[c.templateId] = packedByTemplate[c.templateId] || []).push(c);
  });

  if (!Object.keys(packedByTemplate).length) { showToast(t('rec.toast.noPackedCards')); return; }

  let syncCount = 0;
  let newCardCount = 0;

  templates.forEach(template => {
    const packedCards = packedByTemplate[template.id];
    if (!packedCards?.length) return;

    const isTxtGrid = template.layout === 'txtgrid';
    const fixedSlots = LAYOUT_SLOTS[template.layout] ?? 0;

    // ── Content-sync existing packed cards ──────────────────────────
    packedCards.forEach(card => {
      const records = card.packedRecordIds.map(id => state.records.find(r => r.id === id)).filter(Boolean);
      if (!records.length) return;
      const slotCount = isTxtGrid ? records.length : fixedSlots;
      if (!isTxtGrid) {
        card.images = records.map((rec, slot) => ({
          slot, url: template.mapping.imageSlot ? _fieldVal(rec, template.mapping.imageSlot) : ''
        })).filter(img => img.url);
      }
      card.sections = records.map(rec => ({
        id: uid(),
        label: template.mapping.labelSlot ? _fieldVal(rec, template.mapping.labelSlot) : '',
        content: template.mapping.textSlot ? _fieldVal(rec, template.mapping.textSlot) : ''
      }));
      while (card.sections.length < slotCount) card.sections.push({ id: uid(), label: '', content: '' });
      records.forEach(r => { r.fieldsHash = _hashStr(JSON.stringify(r.fields)); });
      syncCount++;
    });

    // ── Detect new records not yet in any chunk ──────────────────────
    const packedIdSet = new Set(packedCards.flatMap(c => c.packedRecordIds));
    const newRecords = state.records.filter(r => !packedIdSet.has(r.id));
    if (!newRecords.length) return;

    if (isTxtGrid) {
      // txtgrid = one chunk: append new records to the single card
      const card = packedCards[packedCards.length - 1];
      const allRecords = [
        ...card.packedRecordIds.map(id => state.records.find(r => r.id === id)).filter(Boolean),
        ...newRecords
      ];
      card.packedRecordIds = allRecords.map(r => r.id);
      card.sections = allRecords.map(rec => ({
        id: uid(),
        label: template.mapping.labelSlot ? _fieldVal(rec, template.mapping.labelSlot) : '',
        content: template.mapping.textSlot ? _fieldVal(rec, template.mapping.textSlot) : ''
      }));
      newRecords.forEach(r => { r.fieldsHash = _hashStr(JSON.stringify(r.fields)); });
      return;
    }

    let remaining = [...newRecords];

    // Fill empty slots in the last card first
    const lastCard = packedCards[packedCards.length - 1];
    const lastCardCount = lastCard.packedRecordIds.length;
    if (lastCardCount < fixedSlots) {
      const fill = remaining.splice(0, fixedSlots - lastCardCount);
      const allRecords = [
        ...lastCard.packedRecordIds.map(id => state.records.find(r => r.id === id)).filter(Boolean),
        ...fill
      ];
      lastCard.packedRecordIds = allRecords.map(r => r.id);
      lastCard.images = allRecords.map((rec, slot) => ({
        slot, url: template.mapping.imageSlot ? _fieldVal(rec, template.mapping.imageSlot) : ''
      })).filter(img => img.url);
      lastCard.sections = allRecords.map(rec => ({
        id: uid(),
        label: template.mapping.labelSlot ? _fieldVal(rec, template.mapping.labelSlot) : '',
        content: template.mapping.textSlot ? _fieldVal(rec, template.mapping.textSlot) : ''
      }));
      while (lastCard.sections.length < fixedSlots) lastCard.sections.push({ id: uid(), label: '', content: '' });
      fill.forEach(r => { r.fieldsHash = _hashStr(JSON.stringify(r.fields)); });
    }

    // Create new cards for any remaining records, cloning style from last packed card
    const styleRef = packedCards[packedCards.length - 1];
    while (remaining.length) {
      const chunk = remaining.splice(0, fixedSlots);
      const card = newCard();
      card.layout = styleRef.layout;
      card.orientation = styleRef.orientation;
      card.paperSize = styleRef.paperSize;
      card.imageGridSplit = styleRef.imageGridSplit ? { ...styleRef.imageGridSplit } : { ...(LAYOUT_SPLIT_DEFAULTS[template.layout] || LAYOUT_SPLIT_DEFAULTS['1full']) };
      card.imageHeightPercent = styleRef.imageHeightPercent;
      card.hideTitle = styleRef.hideTitle;
      card.titleFont = styleRef.titleFont ? { ...styleRef.titleFont } : null;
      card.contentFont = styleRef.contentFont ? { ...styleRef.contentFont } : null;
      card.title = styleRef.title || `${template.layout} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      card.templateId = template.id;
      card.packedRecordIds = chunk.map(r => r.id);
      card.images = chunk.map((rec, slot) => ({
        slot, url: template.mapping.imageSlot ? _fieldVal(rec, template.mapping.imageSlot) : ''
      })).filter(img => img.url);
      card.sections = chunk.map(rec => ({
        id: uid(),
        label: template.mapping.labelSlot ? _fieldVal(rec, template.mapping.labelSlot) : '',
        content: template.mapping.textSlot ? _fieldVal(rec, template.mapping.textSlot) : ''
      }));
      while (card.sections.length < fixedSlots) card.sections.push({ id: uid(), label: '', content: '' });
      chunk.forEach(r => { r.fieldsHash = _hashStr(JSON.stringify(r.fields)); });
      state.cards.push(card);
      newCardCount++;
    }
  });

  setDirty();
  dispatch('CARD_LIST_CHANGED');
  renderRecordsPanel();

  const parts = [];
  if (syncCount) parts.push(t('rec.toast.syncedN').replace('{n}', syncCount).replace('{s}', syncCount !== 1 ? 's' : ''));
  if (newCardCount) parts.push(`${newCardCount} new card${newCardCount !== 1 ? 's' : ''} created`);
  showToast(parts.length ? parts.join(' · ') : t('rec.toast.noPackedCards'));
}

function _consolidateSameLayout(layout) {
  const fixedSlots = LAYOUT_SLOTS[layout];
  if (!fixedSlots) return;

  // packRecords pads sections to fixedSlots, so use packedRecordIds.length
  // to detect "partial" cards (fewer actual records than slots)
  const partial = state.cards.filter(c =>
    c.layout === layout &&
    c.packedRecordIds?.length > 0 &&
    c.packedRecordIds.length < fixedSlots
  );
  if (partial.length <= 1) return;

  // Collect only real cells (ignore padded empty sections)
  const cells = [];
  partial.forEach(card => {
    const realCount = card.packedRecordIds.length;
    card.sections.slice(0, realCount).forEach((sec, i) => {
      const img = card.images?.find(im => im.slot === i);
      cells.push({ section: sec, image: img ? { ...img } : null, recordId: card.packedRecordIds[i] });
    });
  });

  // Remove the partial cards
  const partialIds = new Set(partial.map(c => c.id));
  state.cards = state.cards.filter(c => !partialIds.has(c.id));

  // Re-chunk into full cards, using first partial card as style reference
  const ref = partial[0];
  for (let i = 0; i < cells.length; i += fixedSlots) {
    const chunk = cells.slice(i, i + fixedSlots);
    const card = newCard();
    card.layout = layout;
    card.orientation = ref.orientation;
    card.paperSize = ref.paperSize || null;
    card.imageGridSplit = ref.imageGridSplit ? { ...ref.imageGridSplit } : { ...(LAYOUT_SPLIT_DEFAULTS[layout] || {}) };
    card.imageHeightPercent = ref.imageHeightPercent;
    card.hideTitle = ref.hideTitle ?? true;
    card.templateId = null; // mixed — won't be auto-synced
    card.packedRecordIds = chunk.map(cell => cell.recordId).filter(Boolean);
    card.sections = chunk.map(cell => ({ ...cell.section, id: uid() }));
    card.images = chunk
      .map((cell, slot) => cell.image ? { ...cell.image, slot } : null)
      .filter(Boolean);
    state.cards.push(card);
  }
}

function packAll() {
  const templates = state.schema?.cardTemplates?.filter(t => t.templateType === 'compound') || [];
  if (!templates.length) { showToast(t('rec.toast.noTemplates')); return; }
  if (!state.records.length) { showToast(t('rec.toast.noRecords')); return; }
  let cardCount = 0;
  templates.forEach(template => {
    const before = state.cards.length;
    packRecords(template, state.records);
    cardCount += state.cards.length - before + 1;
  });
  // Merge partial cards of the same layout to reduce wasted slots
  const layouts = new Set(templates.map(t => t.layout));
  layouts.forEach(l => _consolidateSameLayout(l));
  state.records.forEach(r => { r.fieldsHash = _hashStr(JSON.stringify(r.fields)); });
  setDirty();
  dispatch('CARD_LIST_CHANGED');
  renderRecordsPanel();
  showToast(t('rec.toast.packed').replace('{r}', state.records.length).replace('{n}', templates.length).replace('{s}', templates.length !== 1 ? 's' : ''));
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

const _COMPOUND_LAYOUTS = ['2img-2txt', '3img-3txt', 'img3-txt3', '6cell', '8img-8txt', 'txtgrid'];
const _SINGLE_SIZES = ['A4', 'A5', 'A6', 'Letter'];

function _renderSchemaEditor() {
  const s = _editingSchema;
  const imgFields = s.fields.filter(f => f.type === 'image');
  const txtFields = s.fields.filter(f => f.type !== 'image');
  const singleLayouts = LAYOUTS.filter(l => !_COMPOUND_LAYOUTS.includes(l) && l !== 'txtgrid');

  const fieldsHtml = s.fields.map((f, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
      <input type="text" placeholder="Label" value="${esc(f.label)}" style="flex:1;min-width:80px;"
        oninput="_schemaFieldChange(${i},'label',this.value)">
      <input type="text" class="schema-field-key" placeholder="key" value="${esc(f.key)}" style="width:90px;"
        oninput="_schemaFieldChange(${i},'key',this.value)">
      <select onchange="_schemaFieldChange(${i},'type',this.value)" style="width:90px;">
        ${['image', 'text', 'text-long'].map(t =>
    `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <button class="btn btn-sm" onclick="_removeSchemaField(${i})">✕</button>
    </div>`).join('');

  const templatesHtml = s.cardTemplates.map((tmpl, i) => {
    const isCompound = tmpl.templateType === 'compound';
    const typeToggle = `
      <select onchange="_schemaTemplateChange(${i},'templateType',this.value)" style="width:100px;">
        <option value="single"   ${!isCompound ? 'selected' : ''}>Single</option>
        <option value="compound" ${isCompound ? 'selected' : ''}>Compound</option>
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
            <option value="portrait"  ${(tmpl.orientation || 'portrait') === 'portrait' ? 'selected' : ''}>Portrait</option>
            <option value="landscape" ${(tmpl.orientation || 'portrait') === 'landscape' ? 'selected' : ''}>Landscape</option>
          </select>
          <button class="btn btn-sm" onclick="_removeSchemaTemplate(${i})">✕</button>
        </div>
        <div style="display:flex;gap:12px;font-size:12px;flex-wrap:wrap;">
          ${tmpl.layout === 'txtgrid' ? `
          <label>Field:
            <select onchange="_schemaTemplateChange(${i},'textSlot',this.value)">
              <option value="">—</option>${txtOpts}
            </select>
          </label>` : `
          <label>Image field:
            <select onchange="_schemaTemplateChange(${i},'imageSlot',this.value)">
              <option value="">—</option>${imgOpts}
            </select>
          </label>
          <label>Label field:
            <select onchange="_schemaTemplateChange(${i},'labelSlot',this.value)">
              <option value="">—</option>${labelOpts}
            </select>
          </label>
          <label>Text field:
            <select onchange="_schemaTemplateChange(${i},'textSlot',this.value)">
              <option value="">—</option>${txtOpts}
            </select>
          </label>`}
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
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
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
    const keyInputs = document.querySelectorAll('#schema-editor-content .schema-field-key');
    if (keyInputs[i]) keyInputs[i].value = _editingSchema.fields[i].key;
    return;
  }
  if (prop === 'type') _renderSchemaEditor();
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

function closeSchemaEditor() {
  document.getElementById('schema-editor-modal').close();
}

function closePackDialog() {
  document.getElementById('pack-dialog').close();
}

function saveSchema() {
  state.schema = _editingSchema;
  if (!Array.isArray(state.records)) state.records = [];
  setDirty();
  closeSchemaEditor();
  renderRecordsPanel();
}
