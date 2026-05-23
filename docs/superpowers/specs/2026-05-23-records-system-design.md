# Records System Design

## Goal

Add a record-based content management layer to the flashcard app. A "record" holds structured source data (fields); card templates define how that data maps to flashcards. Records generate two kinds of cards:

1. **Single cards** — per-record, one card per template (e.g. one A5 overview card, one A6 name card)
2. **Compound cards** — multiple records packed into one compound layout card (e.g. `8img-8txt`) for space-efficient printing

## Architecture

Two new subsystems:

1. **Records module** (`src/records.js`) — schema editor UI, records table, detail editor, single generate logic, compound pack logic
2. State/storage extensions in existing files

Existing card system is unchanged. All generated cards (single and compound) are regular `state.cards` entries.

## Tech Stack

Vanilla JS + DOM APIs. No new dependencies.

---

## Data Model

### Paper sizes

`A6: { w: 105, h: 148 }` already exists in `PAPER_MM` in `state.js`. No changes needed.

### New state fields

```js
state.schema  = null  // null when project has no records feature
state.records = []    // empty array when feature is active but no records yet
```

### `state.schema` shape

Card templates come in two types, distinguished by `templateType`.

```js
{
  fields: [
    { id: "f1", key: "image", type: "image",     label: "Image" },
    { id: "f2", key: "name",  type: "text",      label: "Name" },
    { id: "f3", key: "def1",  type: "text-long", label: "Definition" },
    { id: "f4", key: "def2",  type: "text-long", label: "Cloze" },
  ],
  cardTemplates: [
    // ── Single templates (one card per record) ──────────────────
    {
      id: "t1",
      templateType: "single",
      size: "A5",
      layout: "1left-2right",
      mapping: {
        imageSlots: ["f1"],       // index → slot number
        sections:   ["f2", "f3"] // index → section number
      }
    },
    {
      id: "t2",
      templateType: "single",
      size: "A6",
      layout: "fullimage",
      mapping: { imageSlots: ["f1"], sections: [] }
    },
    {
      id: "t3",
      templateType: "single",
      size: "A6",
      layout: "fulltext",
      mapping: { imageSlots: [], sections: ["f2"] }
    },
    {
      id: "t4",
      templateType: "single",
      size: "A6",
      layout: "fulltext",
      mapping: { imageSlots: [], sections: ["f4"] }
    },
    // ── Compound templates (N records → 1 card) ─────────────────
    {
      id: "tc1",
      templateType: "compound",
      layout: "8img-8txt",   // any existing compound layout
      mapping: {
        imageSlot: "f1",  // which field → every img slot
        textSlot:  "f2"   // which field → every text slot
      }
      // size: not set — compound cards use global paper size
    },
    {
      id: "tc2",
      templateType: "compound",
      layout: "3img-3txt",
      mapping: { imageSlot: "f1", textSlot: "f4" }
    }
  ]
}
```

**Field types** (affect detail editor UI only, not generation):
- `image` → image picker
- `text` → single-line input
- `text-long` → textarea

### `state.records` entry shape

```js
{
  id: "rec_abc",
  fieldsHash: "abc123",  // djb2 hash of JSON.stringify(fields), set at last generate
  fields: {
    image: "data:image/...",
    name:  "parallel",
    def1:  "Two straight lines are called parallel when...",
    def2:  "Two ___ lines are called ___ when...",
  }
  // NO generatedCardIds — derived via state.cards.filter(c => c.recordId === id)
}
```

### Card fields added

Inside the existing `.map(c => ({ ...c, ... }))` spread in `applyLoadedData` in `storage.js`:

```js
recordId:    c.recordId    ?? null,  // set on single-generated cards
templateId:  c.templateId  ?? null,  // set on single-generated cards
paperSize:   c.paperSize   ?? null,  // set on single-generated cards
packedRecordIds: c.packedRecordIds ?? null,  // set on compound-packed cards (array of record ids)
```

---

## Serialization

`_buildDataObj()` spreads `state`, so `schema` and `records` serialize automatically.

`applyLoadedData` additions:

```js
state.schema  = data.schema  ?? null
state.records = (data.records ?? []).map(r => ({
  id:         r.id,
  fieldsHash: r.fieldsHash ?? '',
  fields:     r.fields ?? {}
}))
```

---

## Status Computation

Computed at read time, not stored:

```js
function getRecordStatus(record) {
  const cards = state.cards.filter(c => c.recordId === record.id)
  if (cards.length === 0) return 'draft'
  if (_hashStr(JSON.stringify(record.fields)) !== record.fieldsHash) return 'draft'
  return 'synced'
}
```

Status only tracks single-generated cards. Compound cards are independent — packing the same records again creates a new compound card (no sync concept for compound).

---

## UI Layout

### Toolbar

Records button always visible. No Print Sheet button.

```
[New Card] [↻ Thumbs] ... [Records] [More ▾]
```

Clicking Records when `state.schema === null` shows setup prompt with `[Setup Schema]` button.

### Tab switching

Clicking Records:
- Hides `.fc-editor` and `.fc-preview`
- Shows `#records-panel`
- Deactivates current card (`activeCardId` is a module-level `let` in `state.js` — use the existing deactivation path in `app.js`)
- `#records-panel` is a `<div>` sibling of `.fc-editor` in the layout container

Clicking any card in sidebar or New Card returns to card editing view.

### Records Panel (`#records-panel`)

**Header:**
```
Records    [+ Add]  [Generate All]  [Pack ▾]  [⚙ Schema]
```

**Table:** one row per record. Columns: one per non-image field (truncated ~40 chars) + Status badge (`synced` / `draft`).

**Detail panel** opens on row click (floats right, min-width 320px):
- One input per field (image picker / text input / textarea per field type)
- `[Generate]` button — generates/regenerates single cards for this record
- Preview strip: one thumbnail per single template, rendered via `buildCardHTML()` using template's `size` as `paperSize` and `state.settings` for everything else

**Generate All:** sync loop over all records, skip `synced`. Toast: "Generated N cards".

**Pack ▾ dropdown:** lists all compound templates from schema (by layout name). Clicking a compound template:
1. Opens a small dialog: "Select records to pack into `8img-8txt`"
2. Checkbox list of all records (pre-selects all)
3. Records are slotted in table order; excess records beyond layout capacity are ignored (e.g. `3img-3txt` only uses first 3 selected records); if fewer records than slots, remaining slots are empty
4. `[Pack]` — creates one new compound card and adds to `state.cards`
5. Toast: "Packed N records into [layout]"

Packed compound card title: auto-set to the layout name + timestamp (e.g. `8img-8txt · May 23`). User can rename it in the normal card editor.

### Schema Editor (Modal)

Two sections, opened via ⚙:

**Fields:** add/remove (no drag-reorder v1). Each: label, key (auto-slug), type dropdown.

**Card Templates:** add/remove. Each template has a `templateType` toggle (Single / Compound).

*Single template fields:*
- Size dropdown (A4 / A5 / A6 / Letter)
- Layout dropdown
- `imageSlots[]`: per slot, dropdown of image fields or "—"
- `sections[]`: per section, dropdown of text fields or "—"

*Compound template fields:*
- Layout dropdown (filtered to compound layouts: `2img-2txt`, `3img-3txt`, `8img-8txt`)
- Image slot field: dropdown of image fields
- Text slot field: dropdown of text fields

Save calls `setDirty()`. No live preview (v1).

---

## Generate Logic

### Single cards

```js
function generateRecord(record) {
  const singleTemplates = state.schema.cardTemplates.filter(t => t.templateType === 'single')
  for (const template of singleTemplates) {
    let card = state.cards.find(
      c => c.recordId === record.id && c.templateId === template.id
    )
    if (!card) {
      // addCard() in app.js builds card inline with FC_CONFIG.newCard defaults.
      // Extract a newCard() factory that returns bare defaults only (layout: "1full",
      // empty images[], empty sections[], no title) — generated cards must NOT inherit
      // the user's FC_CONFIG.newCard preferences (layout, default sections, etc.).
      // addCard() continues to apply FC_CONFIG.newCard on top of newCard() for user-created cards.
      card = newCard()
      card.recordId   = record.id
      card.templateId = template.id
      state.cards.push(card)
    }
    card.layout      = template.layout
    card.orientation = 'portrait'
    card.paperSize   = template.size
    card.images      = template.mapping.imageSlots
      .map((fieldId, slot) => ({ slot, url: fieldId ? record.fields[fieldId] ?? '' : '' }))
      .filter(img => img.url)
    card.sections    = template.mapping.sections
      .filter(Boolean)
      .map(fieldId => ({
        id:      uid(),
        label:   state.schema.fields.find(f => f.id === fieldId)?.label ?? '',
        content: record.fields[fieldId] ?? ''
      }))
  }
  record.fieldsHash = _hashStr(JSON.stringify(record.fields))
  setDirty()
}
```

**`card.paperSize`** — new optional field. When set, callers of `buildCardHTML()` must pass `getPaperPx(card.paperSize, card.orientation || s.orientation)` as `overridePx` instead of `null`. Migration default: `null`.

All existing `buildCardHTML` call sites must be updated with this conditional:
- `renderPreview()` in `preview.js`
- Thumbnail generator (`scheduleThumbRefresh` / `refreshAllThumbs`) in `app.js`
- Print path in `modals.js` (single-card print)
- PDF export path in `modals.js`

Pattern at each call site:
```js
const overridePx = card.paperSize ? getPaperPx(card.paperSize, card.orientation || s.orientation) : null
buildCardHTML(card, s, forPrint, overridePx)
```

### Compound cards

```js
function packRecords(template, selectedRecords) {
  const layout      = template.layout
  const slotCount   = LAYOUT_SLOTS[layout] ?? 0
  const records     = selectedRecords.slice(0, slotCount)  // cap to slot count

  const card        = newCard()
  card.layout       = layout
  card.orientation  = 'portrait'
  card.packedRecordIds = records.map(r => r.id)
  card.title        = layout + ' · ' + new Date().toLocaleDateString()

  card.images = records.map((rec, slot) => ({
    slot,
    url: template.mapping.imageSlot ? rec.fields[template.mapping.imageSlot] ?? '' : ''
  })).filter(img => img.url)

  card.sections = records.map((rec, i) => ({
    id:      uid(),
    label:   '',
    content: template.mapping.textSlot ? rec.fields[template.mapping.textSlot] ?? '' : ''
  }))

  // Pad sections to slotCount if fewer records than slots
  while (card.sections.length < slotCount) {
    card.sections.push({ id: uid(), label: '', content: '' })
  }

  state.cards.push(card)
  setDirty()
}
```

Compound cards do NOT set `recordId` or `templateId` (those are single-card fields). They set `packedRecordIds` for reference only — no sync or regenerate concept.

---

## Undo

Generate and pack operations do NOT call `pushUndo()`.

**Fix required in `undo.js`:** `_encodeState()` currently snapshots the full `state` object. Narrow it to exclude `schema` and `records` while preserving the image-pool interning:

```js
function _encodeState() {
  const snap = {
    cards:       JSON.parse(JSON.stringify(state.cards)),
    settings:    JSON.parse(JSON.stringify(state.settings)),
    projectName: state.projectName
  }
  for (const card of snap.cards) {
    for (const img of (card.images || [])) {
      if (img.url?.startsWith('data:')) { img._k = _internImg(img.url); delete img.url; }
    }
  }
  return JSON.stringify(snap)
}

function _decodeState(s) {
  const snap = _decodeSnap(s)  // existing pool-restore logic — unchanged
  state.cards       = snap.cards
  state.settings    = snap.settings
  state.projectName = snap.projectName
  // schema and records intentionally not restored by undo
}
```

---

## Delete Record

```
Prompt: "Delete generated cards for this record too?"
  Yes → remove all cards where c.recordId === record.id
  No  → clear recordId/templateId on those cards (orphan them)
state.records = state.records.filter(r => r.id !== record.id)
setDirty()
```

Compound cards (`packedRecordIds`) are NOT deleted when a record is deleted — they are standalone cards.

---

## Build System

Current concat order: `state, utils, storage, api, i18n, render, editor, preview, modals, undo, app`

Updated: insert `records` before `app`:
```
state, utils, storage, api, i18n, render, editor, preview, modals, undo, records, app
```

`records.js` depends on: `render.js` (`buildCardHTML`, `LAYOUT_SLOTS`), `state.js`, `storage.js` (`setDirty`), `utils.js` (`uid`, `_hashStr`).

---

## File Summary

| File | Change |
|------|--------|
| `src/records.js` | New — records panel, schema editor modal, generate + pack logic |
| `src/state.js` | Add `schema: null`, `records: []` to default state |
| `src/storage.js` | Add schema/records to `applyLoadedData`; add `recordId`, `templateId`, `paperSize`, `packedRecordIds` to card migration |
| `src/utils.js` | Add `_hashStr(s)` (djb2) |
| `src/undo.js` | Narrow `_encodeState`/`_decodeState` to exclude `schema` and `records` |
| `src/render.js` | Respect `card.paperSize` in `buildCardHTML()` via `overridePx` |
| `src/app.js` | Extract `newCard()` factory from `addCard()`; tab switching for Records panel |
| `src/template.html` | Add Records toolbar button; add `#records-panel` div |
| `build.js` | Add `records.js` to concat order before `app.js` |

---

## Out of Scope (v1)

- Print sheet drag-drop composer
- AI-assisted cloze generation
- CSV import for bulk record creation
- Multiple schema types per project
- Editing a generated card pushes changes back to record
- Drag-to-reorder fields in schema editor
- Undo/redo for generate, pack, schema, or record operations
- Regenerating compound cards (pack again to create a new one)
