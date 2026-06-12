import { state, uiState, getActiveCard, LAYOUTS, LAYOUT_SLOTS, LAYOUT_SPLIT_DEFAULTS, HIDE_TITLE_LAYOUTS } from '../core/state.js'
import { esc, uid, getPaperPx, _hashStr } from '../core/utils.js'
import { FC_CONFIG } from '../core/config.js'
import { setDirty, showToast } from '../storage/storage.js'
import { pushUndo } from '../core/undo.js'
import { t } from '../i18n.js'
import { newCard } from '../app/cards.js'
import { openRecordDetail, getRecordStatus } from './records.js'
import { closePackDialog } from './schema-editor.js'

// ── Record Generation ────────────────────────────────────────────────────────────

function _fieldVal(record, fieldId) {
  const f = state.schema.fields.find(x => x.id === fieldId);
  return f ? (record.fields[f.key] ?? '') : '';
}

export function generateRecord(record, { skipDispatch = false } = {}) {
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
    card.hideTitle = template.hideTitle ?? HIDE_TITLE_LAYOUTS.has(template.layout);
    card.hideSectionLabels = template.hideSectionLabels ?? false;
    card.orientation = 'portrait';
    card.paperSize = template.size || null;
    card.cssClass = template.cardClass || null;
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
  if (!skipDispatch) window.dispatch('CARD_LIST_CHANGED');
}

export function syncRecord(recordId) {
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
    card.cssClass = template.cardClass || null;
    card.hideTitle = template.hideTitle ?? false;
    card.hideSectionLabels = template.hideSectionLabels ?? false;
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
  window.dispatch('CARD_LIST_CHANGED');
  window.renderRecordsPanel();
  openRecordDetail(recordId);
  showToast(t('rec.toast.synced'));
}

export function generateAll() {
  if (!state.schema) return;
  let count = 0;
  for (const record of state.records) {
    if (getRecordStatus(record) === 'synced') continue;
    generateRecord(record, { skipDispatch: true });
    count++;
  }
  setDirty();
  window.dispatch('CARD_LIST_CHANGED');
  window.renderRecordsPanel();
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

export function openPackDialog(templateId) {
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
    checkboxes || `<em style="color:var(--ink-400);font-size:13px;">${t('rec.toast.noRecords')}</em>`;

  const menu = document.getElementById('pack-menu');
  if (menu) menu.classList.remove('open');

  document.getElementById('pack-dialog').showModal();
}

export function confirmPack() {
  const template = state.schema?.cardTemplates.find(t => t.id === _packTemplateId);
  if (!template) return;

  const checkedIds = [...document.querySelectorAll('#pack-dialog-records input[type=checkbox]:checked')]
    .map(cb => cb.value);
  const selectedRecords = state.records.filter(r => checkedIds.includes(r.id));

  packRecords(template, selectedRecords);
  _consolidateSameLayout(template.layout);
  window.dispatch('CARD_LIST_CHANGED');
  closePackDialog();

  const slots = LAYOUT_SLOTS[template.layout] ?? 0;
  const chunks = slots > 0 ? Math.ceil(selectedRecords.length / slots) : 1;
  const msg = t('rec.toast.packResult').replace('{r}', selectedRecords.length).replace('{n}', chunks).replace('{l}', template.layout);
  if (typeof showToast === 'function') showToast(msg);
  else {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:8px 16px;border-radius:6px;z-index:9999;font-size:13px;';
    document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
  }
}

export function packRecords(template, selectedRecords) {
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
      card.hideTitle = template.hideTitle ?? HIDE_TITLE_LAYOUTS.has(layout);
      card.hideSectionLabels = template.hideSectionLabels ?? false;
      state.cards.push(card);
    }

    card.templateId = template.id;
    card.packedRecordIds = recordIds;
    card.hideTitle = template.hideTitle ?? HIDE_TITLE_LAYOUTS.has(layout);
    card.hideSectionLabels = template.hideSectionLabels ?? false;
    card.cssClass = template.cardClass || null;
    if (template.cardConfig) Object.assign(card, template.cardConfig);

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

export function syncAllPacked() {
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
      if (template.cardConfig) Object.assign(card, template.cardConfig);
      records.forEach(r => { r.fieldsHash = _hashStr(JSON.stringify(r.fields)); });
      syncCount++;
    });

    // ── Detect new records not yet in any card (including consolidated templateId=null cards) ──
    const allPackedIdSet = new Set(state.cards.flatMap(c => c.packedRecordIds || []));
    const newRecords = state.records.filter(r => !allPackedIdSet.has(r.id));
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
  window.dispatch('CARD_LIST_CHANGED');
  window.renderRecordsPanel();

  const parts = [];
  if (syncCount) parts.push(t('rec.toast.syncedN').replace('{n}', syncCount).replace('{s}', syncCount !== 1 ? 's' : ''));
  if (newCardCount) parts.push(t('rec.toast.newCards').replace('{n}', newCardCount));
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
    card.title = ref.title || '';
    card.templateId = null; // mixed — won't be auto-synced
    card.packedRecordIds = chunk.map(cell => cell.recordId).filter(Boolean);
    card.sections = chunk.map(cell => ({ ...cell.section, id: uid() }));
    card.images = chunk
      .map((cell, slot) => cell.image ? { ...cell.image, slot } : null)
      .filter(Boolean);
    state.cards.push(card);
  }
}

export function packAll() {
  const templates = state.schema?.cardTemplates?.filter(t => t.templateType === 'compound') || [];
  if (!templates.length) { showToast(t('rec.toast.noTemplates')); return; }
  if (!state.records.length) { showToast(t('rec.toast.noRecords')); return; }
  // Clear all packed cards before re-packing from scratch
  state.cards = state.cards.filter(c => !c.packedRecordIds?.length);
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
  window.dispatch('CARD_LIST_CHANGED');
  window.renderRecordsPanel();
  showToast(t('rec.toast.packed').replace('{r}', state.records.length).replace('{n}', templates.length).replace('{s}', templates.length !== 1 ? 's' : ''));
}