# Bilingual / Multilingual Support — Design Spec

**Date:** 2026-06-12
**Branch:** feature/bilingual
**Status:** Approved

---

## Overview

Add first-class multilingual support to FlashCard Creator so that a single project can hold content in multiple languages (e.g. English + Vietnamese). Images are shared across languages. Users can switch the active locale at any time. AI translation fills missing locale content automatically.

Applies to both **records** and **cards**.

---

## Data Model

### State

```js
state = {
  activeLocale: 'en',     // currently displayed locale
  locales: ['en', 'vi'],  // ordered list; extensible — add any ISO code
  ...
}
```

`state.locales` drives all locale-related UI dynamically. Nothing hardcodes `'en'`/`'vi'`.

Both `activeLocale` and `locales` are persisted in the project JSON file (alongside `cards`, `records`, etc.) so each project can have its own language configuration.

### Schema field

```js
{
  key: 'name',
  type: 'text',
  label: 'Name',
  multilingual: true    // NEW: true = { en, vi, ... } object; false = plain string (shared)
}
```

- `image` type: always `multilingual: false` (shared). Toggle disabled in schema editor.
- Default for new fields: `multilingual: true` for text/text-long, `false` for image.

### Record fields

```js
record.fields = {
  name:  { en: 'Tiger', vi: 'Con Hổ' },  // multilingual field
  image: 'tiger keyword'                   // shared field — plain string
}
```

### Card (optional locales — backward compat)

```js
card = {
  images: [...],          // always shared
  title: 'Tiger',         // fallback if locales not present
  sections: [...],        // fallback
  locales: {              // NEW: optional
    en: { title: 'Tiger', sections: [...] },
    vi: { title: 'Con Hổ', sections: [...] }
  }
}
```

### Schema template

```js
template = {
  layout: '1full',
  locale: 'en',    // NEW: 'en' | 'vi' | <any locale> | 'active'
  mapping: { ... }
}
```

`'active'` = use `state.activeLocale` at pack time (backward compat default).

### `getLocaleValue(val, locale)` helper

```js
// val is string → return val (backward compat)
// val is { en, vi, ... } → return val[locale] ?? ''
// No auto-fallback to 'en' — empty string signals "not translated yet"
```

Used everywhere record/card content is rendered.

---

## UI Components

### Locale switcher

Location: toolbar, next to project name.

```
[EN] [VI]  ← rendered dynamically from state.locales
```

Switching `activeLocale` immediately re-renders records panel + card preview.

### Schema editor — field row

```
[Label input] [key input] [type ▾] [🌐 toggle] [✕]
```

`🌐` = multilingual toggle. Disabled for image fields.

### Records table

Two view modes, toggled by a button in the records header (persisted to localStorage):

- **Bilingual view** `[⊞]`: multilingual fields split into 2 sub-columns (EN | VI)
- **Single view** `[EN]`: show only `activeLocale` column per field

Table header example in bilingual view:
```
# │ Name EN │ Name VI │ Desc EN │ Desc VI │ Image │ Status │ Cards │
```

### Record detail editor

Multilingual fields render 2 inputs stacked:
```
Name
  EN  [Tiger        ]
  VI  [Con Hổ       ]
```

Shared fields render single input as before.

### Schema template — locale dropdown

Rendered dynamically from `['active', ...state.locales]`:
```
[Layout ▾] [Size ▾] [Orientation ▾] [Locale: EN ▾] [✕]
```

### Add language

Location: Schema editor footer.

Button **"+ Add language"** → text input for ISO code (e.g. `ja`, `fr`) → calls `addLocale(code)`:
1. Push code to `state.locales`
2. Call `_migrateAddLocale(code)`: add `fields[key][code] = ''` to all records for all multilingual fields
3. Re-render

---

## AI Translation

### Trigger

Button **"✦ Translate ▾"** in records header. Dropdown: `EN → VI`, `VI → EN`, or any pair from `state.locales`. Only enabled when schema has at least one `multilingual: true` field.

### Scope

- If records are selected: translate only selected records.
- If no selection: translate all records.

### Default behavior

Only fills **empty** target locale values. Does not overwrite existing translations.

### Force retranslate

Shift+click on Translate button (or submenu option) → overwrites all target locale values regardless.

### AI request shape

```json
{
  "translate": "en→vi",
  "records": [
    { "id": "r1", "fields": { "name": "Tiger", "desc": "Large cat..." } }
  ]
}
```

### AI response shape

```json
[
  { "id": "r1", "fields": { "name": "Con Hổ", "desc": "Loài mèo lớn..." } }
]
```

Merge: `record.fields[key].vi = response[key]` for each multilingual field.

After merge: `setDirty()` + `renderRecordsPanel()`.

---

## Backward Compatibility

| Scenario | Behavior |
|---|---|
| Existing records with plain string fields | `getLocaleValue()` returns string as-is |
| Schema field `multilingual` not set | Treat as `false` (shared) |
| Card without `locales` | `buildCardHTML()` falls back to `card.title` / `card.sections` |
| Template without `locale` | Defaults to `'active'` |
| `getLocaleValue(val, 'ja')` where `ja` not in `val` | Returns `''` — no fallback to `en` |

### Migration on multilingual toggle

When user sets a field `multilingual: true` in schema editor and saves:
- `_migrateRecordFields()` runs on all existing records
- Wraps plain string: `fields.name = { en: currentValue, vi: '' }`
- Runs for every locale in `state.locales`

---

## Out of Scope (this phase)

- Cards bilingual editor UI (Phase 2 — cards get `locales` object populated via AI or manual)
- Convert existing cards → records
- Per-card "Enable bilingual" toggle in card editor
- Backend proxy / translation caching

---

## Implementation Phases

| Phase | Scope |
|---|---|
| 1 | State + schema field flag + `getLocaleValue` helper |
| 2 | Records storage + detail editor (multilingual inputs) |
| 3 | Records table bilingual/single view toggle |
| 4 | Pack: template locale field |
| 5 | AI translation |
| 6 | Add language flow |
| 7 | Cards bilingual (locales object + buildCardHTML) |
