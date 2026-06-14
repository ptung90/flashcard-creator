import { state, uiState, LAYOUT_SLOTS } from '../core/state.js'
import { uid, esc } from '../core/utils.js'
import { setDirty, showToast } from '../storage/storage.js'

const _PAIR_LAYOUTS = new Set(['2img-2txt', '8img-8txt']);
const _IMAGE_LAYOUTS = new Set(['fullimage', '1full']);

export function convertCardsToRecords() {
  openConvertDialog();
}

export function openConvertDialog() {
  const cards = state.cards;
  if (!cards.length) { showToast('No cards to convert'); return; }

  const groups = [
    {
      label: 'Standard layouts',
      cards: cards.filter(c => !_PAIR_LAYOUTS.has(c.layout) && !_IMAGE_LAYOUTS.has(c.layout)),
    },
    {
      label: 'Image + title (fullimage, 1full)',
      cards: cards.filter(c => _IMAGE_LAYOUTS.has(c.layout)),
    },
    {
      label: 'Image pair (2img-2txt, 8img-8txt)',
      cards: cards.filter(c => _PAIR_LAYOUTS.has(c.layout)),
    },
  ].filter(g => g.cards.length);

  const listHtml = groups.map(g => `
    <div class="convert-group">
      <div class="convert-group-label">${esc(g.label)}</div>
      ${g.cards.map(c => {
        const idx = cards.indexOf(c);
        const title = c.title || `Card #${idx + 1}`;
        return `<label class="convert-card-row">
          <input type="checkbox" class="convert-card-cb" value="${esc(c.id)}" checked onchange="_updateConvertCount()">
          <span class="convert-card-title">${esc(title)}</span>
          <span class="convert-card-layout">${esc(c.layout)}</span>
        </label>`;
      }).join('')}
    </div>
  `).join('');

  document.getElementById('convert-cards-list').innerHTML = listHtml;
  _updateConvertCount();

  const sel = document.getElementById('convert-locale-select');
  sel.innerHTML = state.locales.map(l => `<option value="${esc(l)}"${l === state.activeLocale ? ' selected' : ''}>${l.toUpperCase()}</option>`).join('');

  document.getElementById('convert-cards-dialog').showModal();
}

export function closeConvertDialog() {
  document.getElementById('convert-cards-dialog').close();
}

export function toggleConvertSelectAll(checked) {
  document.querySelectorAll('.convert-card-cb:not(:disabled)').forEach(cb => { cb.checked = checked; });
  _updateConvertCount();
}

export function _updateConvertCount() {
  const total = document.querySelectorAll('.convert-card-cb:not(:disabled)').length;
  const selected = document.querySelectorAll('.convert-card-cb:not(:disabled):checked').length;
  const el = document.getElementById('convert-selection-count');
  if (el) el.textContent = `${selected} / ${total} selected`;
  const selAll = document.getElementById('convert-select-all');
  if (selAll) {
    selAll.checked = selected === total && total > 0;
    selAll.indeterminate = selected > 0 && selected < total;
  }
}

export function executeConvert() {
  const checkedIds = new Set(
    [...document.querySelectorAll('.convert-card-cb:checked')].map(cb => cb.value)
  );
  const selectedCards = state.cards.filter(c => checkedIds.has(c.id));
  if (!selectedCards.length) { showToast('No cards selected'); return; }

  const locale = document.getElementById('convert-locale-select')?.value || state.activeLocale;
  closeConvertDialog();
  _doConvert(selectedCards, locale);
}

function _doConvert(cards, locale) {
  const newSchemas = [];
  const newRecords = [];

  const textCards = cards.filter(c => !_PAIR_LAYOUTS.has(c.layout) && !_IMAGE_LAYOUTS.has(c.layout));
  if (textCards.length) {
    const maxSections = Math.max(0, ...textCards.map(c => c.sections?.length || 0));
    const fields = [
      { id: `f${uid()}`, key: 'title', label: 'Title', type: 'text', multilingual: true },
    ];
    for (let i = 0; i < maxSections; i++) {
      fields.push(
        { id: `f${uid()}`, key: `s${i + 1}_label`,   label: `Section ${i + 1} Label`, type: 'text', multilingual: true },
        { id: `f${uid()}`, key: `s${i + 1}_content`, label: `Section ${i + 1}`,       type: 'text', multilingual: true },
      );
    }
    const textSchema = { id: `schema_${uid()}`, name: 'Text Card', fields, cardTemplates: [] };
    newSchemas.push(textSchema);

    textCards.forEach(card => {
      const rec = { id: `rec_${uid()}`, schemaId: textSchema.id, fieldsHash: '', fields: {} };
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

  const imageCards = cards.filter(c => _IMAGE_LAYOUTS.has(c.layout));
  if (imageCards.length) {
    const imgField   = { id: `f${uid()}`, key: 'image', label: 'Image', type: 'image', multilingual: false };
    const titleField = { id: `f${uid()}`, key: 'title', label: 'Title', type: 'text',  multilingual: true  };
    const imageSchema = { id: `schema_${uid()}`, name: 'Image Card', fields: [imgField, titleField], cardTemplates: [] };
    newSchemas.push(imageSchema);

    imageCards.forEach(card => {
      const rec = { id: `rec_${uid()}`, schemaId: imageSchema.id, fieldsHash: '', fields: {} };
      rec.fields.image = card.images?.find(img => img.slot === 0)?.url || '';
      const titleVal = {};
      state.locales.forEach(l => { titleVal[l] = ''; });
      titleVal[locale] = card.title || '';
      rec.fields.title = titleVal;
      newRecords.push(rec);
    });
  }

  const pairCards = cards.filter(c => _PAIR_LAYOUTS.has(c.layout));
  if (pairCards.length) {
    const imgField  = { id: `f${uid()}`, key: 'image', label: 'Image', type: 'image', multilingual: false };
    const textField = { id: `f${uid()}`, key: 'text',  label: 'Text',  type: 'text',  multilingual: true  };
    const pairSchema = { id: `schema_${uid()}`, name: 'Image Pair', fields: [imgField, textField], cardTemplates: [] };
    newSchemas.push(pairSchema);

    pairCards.forEach(card => {
      const slots = LAYOUT_SLOTS[card.layout] || 0;
      for (let i = 0; i < slots; i++) {
        const rec = { id: `rec_${uid()}`, schemaId: pairSchema.id, fieldsHash: '', fields: {} };
        rec.fields.image = card.images?.find(img => img.slot === i)?.url || '';
        const textVal = {};
        state.locales.forEach(l => { textVal[l] = ''; });
        textVal[locale] = card.sections?.[i]?.content || '';
        rec.fields.text = textVal;
        newRecords.push(rec);
      }
    });
  }

  if (!newSchemas.length) { showToast('No convertible cards found'); return; }

  state.schemas.push(...newSchemas);
  state.records.push(...newRecords);
  uiState.activeSchemaId = newSchemas[0].id;

  setDirty();
  window.showRecordsPanel?.();
  window.renderRecordsPanel?.();
  showToast(`Converted: ${newRecords.length} records from ${cards.length} cards`);
}
