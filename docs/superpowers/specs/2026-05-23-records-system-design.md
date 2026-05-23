# Records System Design

## Goal

Add a record-based content management layer to the flashcard app. A "record" holds structured source data (fields); card templates define how that data maps to flashcards. Records generate cards automatically, and a Print Sheet composer lets users arrange cards on virtual A4 pages before printing.

## Architecture

Three new subsystems added to the existing app, each isolated:

1. **Records module** (`src/records.js`) — schema editor UI, records table, detail editor, generate logic
2. **Print Sheet module** (`src/printsheet.js`) — virtual A4 canvas composer + print
3. State/storage extensions in existing files

Existing card system is unchanged. Generated cards are regular `state.cards` entries with two extra fields: `recordId` and `templateId`.

## Tech Stack

Vanilla JS + DOM APIs (same as rest of app). Drag-and-drop via HTML5 Drag API. No new dependencies.

---

## Data Model

### Paper sizes

`A6: { w: 105, h: 148 }` already exists in `PAPER_MM` in `state.js`. `FC_CONFIG.paperSizes` already supports `"A6"` as a valid value. No changes needed to paper size config.

### New state fields

Added to `state` alongside `state.cards`:

```js
state.schema = null  // null when project has no records feature
state.records = []   // empty array when feature is active but no records yet
```

`state.schema` shape:

```js
{
  fields: [
    { id: "f1", key: "image", type: "image",     label: "Image" },
    { id: "f2", key: "name",  type: "text",      label: "Name" },
    { id: "f3", key: "def1",  type: "text-long", label: "Definition" },
    { id: "f4", key: "def2",  type: "text-long", label: "Definition (cloze)" },
  ],
  cardTemplates: [
    {
      id: "t1",
      size: "A5",            // FC_CONFIG-compatible paper size key
      layout: "1left-2right",
      mapping: {
        imageSlots: ["f1"],  // array — index maps to slot 0, 1, 2...
        sections: ["f2", "f3"]  // array — index maps to section 0, 1, 2...
      }
    },
    {
      id: "t2",
      size: "A6",
      layout: "fullimage",
      mapping: { imageSlots: ["f1"], sections: [] }
    },
    {
      id: "t3",
      size: "A6",
      layout: "fulltext",
      mapping: { imageSlots: [], sections: ["f2"] }
    },
    {
      id: "t4",
      size: "A6",
      layout: "fulltext",
      mapping: { imageSlots: [], sections: ["f4"] }
    },
  ]
}
```

**Field types:**
- `image` — renders as image picker in detail editor
- `text` — single-line input
- `text-long` — textarea

Types only affect the detail editor UI. Card generation treats them identically.

`state.records` entry shape:

```js
{
  id: "rec_abc",
  fieldsHash: "abc123",   // SHA-1 of JSON.stringify(fields) at last generate
  fields: {
    image: "data:image/...",
    name:  "parallel",
    def1:  "Two straight lines are called parallel when...",
    def2:  "Two ___ lines are called ___ when...",
  }
  // NO generatedCardIds — derived via state.cards.filter(c => c.recordId === id)
}
```

**`fieldsHash`** is a simple hash of `JSON.stringify(record.fields)` stored at generate time. Status = `synced` when current hash matches stored hash; `draft` otherwise. Hash function: `_hashStr(s)` in `utils.js` (add a simple djb2 implementation).

**Card fields added** — inside the existing `.map(c => ({ ...c, ... }))` spread in `applyLoadedData` in `storage.js`:

```js
recordId:   c.recordId   ?? null,
templateId: c.templateId ?? null,
paperSize:  c.paperSize  ?? null,
```

---

## Serialization

`_buildDataObj()` in `storage.js` already spreads `state`, so `schema` and `records` serialize automatically. Files without these fields load as `null`/`[]` via the migration defaults above.

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

Computed at read time — not stored:

```js
function getRecordStatus(record) {
  const cards = state.cards.filter(c => c.recordId === record.id)
  if (cards.length === 0) return 'draft'
  if (_hashStr(JSON.stringify(record.fields)) !== record.fieldsHash) return 'draft'
  return 'synced'
}
```

No `error` status — if a generated card was manually deleted, that card simply won't appear. Status is `synced` as long as the hash matches and at least one generated card exists.

---

## UI Layout

### Toolbar

Records button always visible. Print Sheet button hidden when `state.schema === null`.

```
[New Card] [↻ Thumbs] ... [Records] [Print Sheet*] [More ▾]
(* hidden when schema is null)
```

Clicking Records when `state.schema === null` shows a setup prompt: "This project has no record schema yet. Set one up?" with a [Setup Schema] button that opens the Schema Editor modal.

### Tab switching

Clicking Records or Print Sheet:
- Hides `.fc-editor` and `.fc-preview`
- Shows the corresponding new panel (`#records-panel` or `#printsheet-panel`)
- Deactivates the current active card: call `setActiveCard(null)` (or the equivalent — `activeCardId` is a module-level `let` in `state.js`, not a property on `state`; use whatever the existing deactivation path is in `app.js`)
- Both panels are `<div>` siblings of `.fc-editor` inside the existing layout container

Clicking any card in the sidebar or New Card returns to card editing view (re-shows editor/preview, hides panels).

### Records Panel (`#records-panel`)

Full-width, replaces editor+preview area.

**Header:** `Records  [+ Add]  [Generate All]  [⚙ Schema]`

**Table:** one row per record, columns = non-image fields (text truncated to ~40 chars) + Status badge.

**Detail panel** opens on row click, floats on the right (min-width 320px). Contains:
- One input per field (image picker / text input / textarea based on field type)
- `[Generate]` button — generates/regenerates cards for this record only
- Preview strip: small thumbnails, one per card template, rendered with `buildCardHTML()` using template's `size` as `paperSize` and `state.settings` for everything else

**Generate All:** generates all records sequentially (sync loop). Skips records with `status === 'synced'`. Shows a brief toast on completion: "Generated N cards".

### Schema Editor (Modal)

Opened via ⚙ button. Two sections:

**Fields section:** add/remove fields (no drag-reorder in v1 — order is set by add order). Each field has: key (slug, auto-derived from label), label text, type dropdown.

**Card Templates section:** add/remove templates. Each template has:
- Size dropdown (A4 / A5 / A6 / Letter)
- Layout dropdown (same options as card layout picker)
- `imageSlots[]` mapping: per slot index, a dropdown of image-type fields (or "—" for empty)
- `sections[]` mapping: per section index (determined by layout's slot count), a dropdown of text fields (or "—" for empty)

Save closes modal and calls `setDirty()`. No live preview in schema editor (v1).

### Print Sheet Panel (`#printsheet-panel`)

**Layout:** left sidebar (200px) + main canvas area.

**Sidebar:** lists all generated cards grouped by record. Each card shown as a small labeled chip: `rec1 · A5`, `rec1 · A6`, etc. Ungenerated records shown as disabled. Drag chips to canvas.

**Canvas:** one or more A4 sheet(s). Each sheet is a fixed-size div (A4 proportions, scaled to fit screen). Cards snap to a 5mm grid on drop (no free-floating, no overlap — cards placed on grid cells, later drops on occupied cells push to nearest free cell). Cards render at their physical A-size scaled to screen.

**Buttons:** `[Auto-fill]` — places all unplaced cards using a greedy fit (A5 takes top-left half, A6 fills remaining quarters). `[Clear]` — removes all cards from all sheets. `[+ Sheet]` — adds a new blank A4 sheet. `[Print Sheet]` — renders via `html2canvas` + `jsPDF`, one A4 page per sheet, portrait orientation.

Sheet orientation: portrait A4 only (v1). Landscape and custom sheet sizes are out of scope.

---

## Generate Logic

```js
function generateRecord(record) {
  for (const template of state.schema.cardTemplates) {
    let card = state.cards.find(
      c => c.recordId === record.id && c.templateId === template.id
    )
    if (!card) {
      // Inline card construction (addCard() in app.js builds inline — extract into
      // a newCard() factory as part of this task, then call it here)
      card = newCard()
      card.recordId   = record.id
      card.templateId = template.id
      state.cards.push(card)
    }
    // Apply template mapping
    card.layout = template.layout
    card.orientation = 'portrait'  // all generated cards are portrait
    // paperSize override stored on card for render
    card.paperSize = template.size
    // Images
    card.images = template.mapping.imageSlots
      .map((fieldId, slot) => ({ slot, url: fieldId ? record.fields[fieldId] ?? '' : '' }))
      .filter(img => img.url)
    // Sections
    card.sections = template.mapping.sections
      .filter(fieldId => fieldId)
      .map((fieldId, i) => ({
        id: uid(),
        label: state.schema.fields.find(f => f.id === fieldId)?.label ?? '',
        content: record.fields[fieldId] ?? ''
      }))
  }
  record.fieldsHash = _hashStr(JSON.stringify(record.fields))
  setDirty()
}
```

**`card.paperSize`** — new optional field on card. When set, `buildCardHTML()` uses it instead of `state.settings.paperSize`. Migration default: `null` (falls back to global setting).

**Undo:** generate operations do NOT push to undo stack. `generateRecord` calls `setDirty()` directly without `pushUndo()`.

`pushUndo()` in `undo.js` calls `_encodeState()` which does `JSON.parse(JSON.stringify(state))` — a full snapshot of the entire `state` object. Since `state.schema` and `state.records` will be on `state`, they would be captured in every undo snapshot, potentially making snapshots large (especially with base64 images in record fields).

**Fix required in `undo.js`:** modify `_encodeState()` to snapshot only `cards`, `settings`, and `projectName` — preserving the existing image-pool interning (`_internImg`) logic. The current code snapshots the entire `state` object; the fix narrows what is snapshotted while keeping the pool optimization intact:

```js
// Keep existing _internImg and image pool logic unchanged.
// Only change: build snap from specific fields rather than full state spread.
function _encodeState() {
  const snap = {
    cards: JSON.parse(JSON.stringify(state.cards)),
    settings: JSON.parse(JSON.stringify(state.settings)),
    projectName: state.projectName
  }
  // existing image interning pass (unchanged)
  for (const card of snap.cards) {
    for (const img of (card.images || [])) {
      if (img.url?.startsWith('data:')) { img._k = _internImg(img.url); delete img.url; }
    }
  }
  return JSON.stringify(snap)
}

function _decodeState(s) {
  const snap = _decodeSnap(s)   // existing pool-restore logic — unchanged
  state.cards = snap.cards
  state.settings = snap.settings
  state.projectName = snap.projectName
  // schema and records intentionally not restored by undo
}
```

**Delete record:**
```
Prompt: "Delete generated cards for this record too?"
  Yes → state.cards = state.cards.filter(c => c.recordId !== record.id)
  No  → state.cards.forEach(c => { if (c.recordId === id) { c.recordId = null; c.templateId = null } })
state.records = state.records.filter(r => r.id !== record.id)
setDirty()
```

---

## Build System

Current concat order in `build.js` (from the actual file):
```
state, utils, storage, api, i18n, render, editor, preview, modals, undo, app
```

Updated order — insert `records` and `printsheet` after `modals` and `undo`, before `app`:
```
state, utils, storage, api, i18n, render, editor, preview, modals, undo, records, printsheet, app
```

`records.js` depends on: `render.js` (buildCardHTML), `state.js`, `storage.js` (setDirty), `utils.js` (uid, _hashStr).
`printsheet.js` depends on: `render.js`, `state.js`, `storage.js`.

---

## File Summary

| File | Change |
|------|--------|
| `src/records.js` | New — records panel, schema editor modal, generate logic |
| `src/printsheet.js` | New — print sheet panel, drag-drop, auto-fill, print |
| `src/state.js` | Add `schema: null`, `records: []` to default state |
| `src/storage.js` | Add schema/records to `applyLoadedData`; add `card.recordId`/`templateId` migration |
| `src/utils.js` | Add `_hashStr(s)` (djb2) |
| `src/undo.js` | Modify `_encodeState`/`_decodeState` to exclude `schema` and `records` |
| `src/render.js` | Respect `card.paperSize` override in `buildCardHTML()` |
| `src/app.js` | Extract `newCard()` factory from `addCard()`; add tab switching logic |
| `src/template.html` | Add Records + Print Sheet toolbar buttons; add `#records-panel`, `#printsheet-panel` divs |
| `src/app.js` | (see above) |
| `build.js` | Add records.js + printsheet.js to concat order |

---

## Out of Scope (v1)

- AI-assisted cloze generation
- CSV import for bulk record creation
- Multiple schema types per project
- Editing a generated card pushes changes back to record
- Drag-to-reorder fields in schema editor
- Print sheet landscape orientation or non-A4 sheet size
- Undo/redo for generate, schema, or record operations
