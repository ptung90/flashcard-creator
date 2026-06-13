import { state, uiState, LAYOUT_SLOTS } from '../core/state.js'
import { uid } from '../core/utils.js'
import { setDirty, showToast } from '../storage/storage.js'

// Layouts where each image+text slot = 1 record
const _PAIR_LAYOUTS = new Set(['2img-2txt', '8img-8txt']);
// Layouts with no translatable text
const _SKIP_LAYOUTS = new Set(['fullimage']);

export function convertCardsToRecords() {
  const cards = state.cards;
  if (!cards.length) { showToast('No cards to convert'); return; }

  if (state.records.length > 0) {
    if (!confirm(`This will replace ${state.records.length} existing record(s). Continue?`)) return;
  }

  const locale = state.activeLocale;
  const newSchemas = [];
  const newRecords = [];

  // ── Text Card schema (fulltext, standard layouts) ──
  const textCards = cards.filter(c => !_PAIR_LAYOUTS.has(c.layout) && !_SKIP_LAYOUTS.has(c.layout));
  if (textCards.length) {
    const maxSections = Math.max(0, ...textCards.map(c => c.sections?.length || 0));
    const fields = [
      { id: `f${uid()}`, key: 'title', label: 'Title', type: 'text', multilingual: true }
    ];
    for (let i = 0; i < maxSections; i++) {
      fields.push({ id: `f${uid()}`, key: `s${i + 1}_label`,   label: `Section ${i + 1} Label`, type: 'text', multilingual: true });
      fields.push({ id: `f${uid()}`, key: `s${i + 1}_content`, label: `Section ${i + 1}`,       type: 'text', multilingual: true });
    }
    const textSchema = { id: 'schema_' + uid(), name: 'Text Card', fields, cardTemplates: [] };
    newSchemas.push(textSchema);

    textCards.forEach(card => {
      const rec = { id: 'rec_' + uid(), schemaId: textSchema.id, fieldsHash: '', fields: {} };
      fields.forEach(f => {
        const empty = {};
        state.locales.forEach(l => { empty[l] = ''; });
        rec.fields[f.key] = empty;
      });
      rec.fields.title[locale] = card.title || '';
      (card.sections || []).forEach((s, i) => {
        rec.fields[`s${i + 1}_label`][locale]   = s.label   || '';
        rec.fields[`s${i + 1}_content`][locale] = s.content || '';
      });
      newRecords.push(rec);
    });
  }

  // ── Image Pair schema (2img-2txt, 8img-8txt) ──
  const pairCards = cards.filter(c => _PAIR_LAYOUTS.has(c.layout));
  if (pairCards.length) {
    const imgField  = { id: `f${uid()}`, key: 'image', label: 'Image', type: 'image', multilingual: false };
    const textField = { id: `f${uid()}`, key: 'text',  label: 'Text',  type: 'text',  multilingual: true  };
    const pairSchema = { id: 'schema_' + uid(), name: 'Image Pair', fields: [imgField, textField], cardTemplates: [] };
    newSchemas.push(pairSchema);

    pairCards.forEach(card => {
      const slots = LAYOUT_SLOTS[card.layout] || 0;
      for (let i = 0; i < slots; i++) {
        const rec = { id: 'rec_' + uid(), schemaId: pairSchema.id, fieldsHash: '', fields: {} };
        rec.fields.image = card.images?.find(img => img.slot === i)?.url || '';
        const textVal = {};
        state.locales.forEach(l => { textVal[l] = ''; });
        textVal[locale] = card.sections?.[i]?.content || '';
        rec.fields.text = textVal;
        newRecords.push(rec);
      }
    });
  }

  if (!newSchemas.length) { showToast('No convertible cards found (skipped fullimage)'); return; }

  state.schemas = newSchemas;
  state.records = newRecords;
  uiState.activeSchemaId = newSchemas[0].id;

  setDirty();
  window.showRecordsPanel?.();
  window.renderRecordsPanel?.();
  showToast(`Converted: ${newRecords.length} records from ${cards.length} cards`);
}
