# Bilingual Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class multilingual support so a single project can hold content in multiple languages, with AI translation and per-template locale control.

**Architecture:** `state.activeLocale` + `state.locales[]` drive all rendering. Multilingual record fields store `{ en: "...", vi: "..." }` objects; shared fields (images) stay plain strings. A `getLocaleValue(val, locale)` helper normalises both shapes everywhere. Cards get an optional `locales` object for backward-compat bilingual rendering.

**Tech Stack:** Vanilla JS ESM, Vite single-file build. No test framework — verification steps use the browser dev console and the running dev server (`npm run dev`).

---

## File Map

| File | Change |
|---|---|
| `src/js/core/state.js` | Add `activeLocale`, `locales` to state; add `getLocaleValue()`, `setActiveLocale()`, `addLocale()` |
| `src/js/storage/storage.js` | Load `activeLocale` + `locales` in `applyLoadedData()` |
| `src/js/records/records.js` | Multilingual `addRecord()`, bilingual detail editor, bilingual table view toggle |
| `src/js/records/schema-editor.js` | Multilingual toggle per field, locale dropdown per template, "+ Add language" button, migration call |
| `src/js/records/pack.js` | `_fieldVal()` resolves locale via `getLocaleValue()` |
| `src/js/records/ai.js` | `translateRecords()`, update import/export for multilingual values |
| `src/js/render.js` | `buildCardHTML()` uses `getLocaleValue()` for card title + sections |
| `index.html` | Add locale switcher in toolbar |
| `src/css/tomoe.css` | Locale switcher, bilingual input pair, split sub-columns |
| `src/js/main.js` | Export `setActiveLocale`, `addLocale`, `translateRecords` |

---

## Task 1: Core state + `getLocaleValue` helper

**Files:**
- Modify: `src/js/core/state.js`

- [ ] **Add `activeLocale` and `locales` to state, and the three helpers**

  In `src/js/core/state.js`, after the closing brace of `state = { ... }` (around line 115), add:

  ```js
  export const state = {
    // ... existing fields unchanged ...
    activeLocale: 'en',
    locales: ['en', 'vi'],
  };
  ```

  Then after the `getActiveCard` export at the bottom, add:

  ```js
  export function getLocaleValue(val, locale) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object' && !Array.isArray(val)) {
      return val[locale] ?? '';
    }
    return val; // plain string — backward compat
  }

  export function setActiveLocale(locale) {
    if (!state.locales.includes(locale)) return;
    state.activeLocale = locale;
    document.querySelectorAll('.locale-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.locale === locale);
    });
    window.renderRecordsPanel?.();
    window.renderPreview?.();
  }

  export function addLocale(code) {
    const clean = code.trim().toLowerCase();
    if (!clean || state.locales.includes(clean)) return;
    state.locales.push(clean);
    // migrate existing records: add empty value for new locale to multilingual fields
    if (state.schema) {
      state.schema.fields.filter(f => f.multilingual).forEach(f => {
        state.records.forEach(rec => {
          if (rec.fields[f.key] && typeof rec.fields[f.key] === 'object') {
            rec.fields[f.key][clean] = rec.fields[f.key][clean] ?? '';
          }
        });
      });
    }
    window.renderRecordsPanel?.();
  }
  ```

- [ ] **Verify in browser console**

  Run `npm run dev`, open browser, open console:
  ```js
  import { getLocaleValue } from '/src/js/core/state.js'
  // or just check via window after app loads:
  state.activeLocale   // → 'en'
  state.locales        // → ['en', 'vi']
  ```

- [ ] **Commit**
  ```bash
  git add src/js/core/state.js
  git commit -m "feat(bilingual): add activeLocale, locales, getLocaleValue, setActiveLocale, addLocale to state"
  ```

---

## Task 2: Export new functions + load from JSON

**Files:**
- Modify: `src/js/main.js`
- Modify: `src/js/storage/storage.js`

- [ ] **Export `setActiveLocale` and `addLocale` to window in `main.js`**

  In `src/js/main.js`, add to the import from `state.js`:
  ```js
  import { state, uiState, getActiveCard, getLocaleValue, setActiveLocale, addLocale } from './core/state.js'
  ```

  In the `Object.assign(window, { ... })` block, add:
  ```js
  setActiveLocale, addLocale,
  ```

- [ ] **Load `activeLocale` and `locales` in `applyLoadedData()`**

  In `src/js/storage/storage.js`, inside `applyLoadedData(data)` after `state.records = ...` (around line 475), add:
  ```js
  if (Array.isArray(data.locales) && data.locales.length) {
    state.locales = data.locales;
  } else {
    state.locales = ['en', 'vi']; // default for projects without locale data
  }
  state.activeLocale = data.activeLocale && state.locales.includes(data.activeLocale)
    ? data.activeLocale
    : state.locales[0];
  ```

  `_buildDataObj()` already spreads `...state`, so `activeLocale` and `locales` are saved automatically.

- [ ] **Verify**

  Open an existing project JSON in the app → console: `state.locales` → `['en','vi']`, `state.activeLocale` → `'en'`. Save the file, open it in a text editor → confirm `"activeLocale":"en"` and `"locales":["en","vi"]` appear in the JSON.

- [ ] **Commit**
  ```bash
  git add src/js/main.js src/js/storage/storage.js
  git commit -m "feat(bilingual): export locale helpers to window, persist locales in project JSON"
  ```

---

## Task 3: Locale switcher in toolbar

**Files:**
- Modify: `index.html`
- Modify: `src/css/tomoe.css`

- [ ] **Add locale switcher to toolbar in `index.html`**

  Find the `<!-- More menu -->` comment in the toolbar (around line 396). Insert the locale switcher just before it:

  ```html
  <!-- Locale switcher — only shown when project has locales -->
  <div id="locale-switcher" class="locale-switcher" style="display:none"></div>
  ```

  Note: `renderLocaleSwitch()` (Task below) will populate and show/hide this div.

- [ ] **Add `renderLocaleSwitch()` to `app.js`**

  In `src/js/app/app.js`, add this function (export it):

  ```js
  export function renderLocaleSwitch() {
    const el = document.getElementById('locale-switcher');
    if (!el) return;
    if (!state.locales || state.locales.length < 2) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    el.innerHTML = state.locales.map(l =>
      `<button class="btn btn-sm locale-btn${state.activeLocale === l ? ' active' : ''}"
        data-locale="${l}" onclick="setActiveLocale('${l}')">${l.toUpperCase()}</button>`
    ).join('');
  }
  ```

  Call `renderLocaleSwitch()` from:
  - `dispatch()` in `app.js` — add to `case 'INIT_LOAD':` and `case 'FULL_STATE_UPDATED':`
  - `setActiveLocale()` in `state.js` — already updates button classes, no full re-render needed

- [ ] **Export `renderLocaleSwitch` in `main.js`**

  Add import + window export for `renderLocaleSwitch`.

- [ ] **Add CSS to `src/css/tomoe.css`**

  ```css
  .locale-switcher { display: flex; gap: 2px; align-items: center; }
  .locale-btn { min-width: 32px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--ink-400); }
  .locale-btn.active { color: var(--c-brand); background: color-mix(in srgb, var(--c-brand) 10%, transparent); }
  ```

- [ ] **Verify**

  Open app with a project → toolbar shows `[EN] [VI]` buttons. Clicking VI → `state.activeLocale` is `'vi'`. VI button is highlighted.

- [ ] **Commit**
  ```bash
  git add index.html src/js/app/app.js src/js/main.js src/css/tomoe.css
  git commit -m "feat(bilingual): add locale switcher to toolbar"
  ```

---

## Task 4: Schema field multilingual toggle

**Files:**
- Modify: `src/js/records/schema-editor.js`

- [ ] **Set default `multilingual: true` for text fields**

  In `openSchemaEditor()` (line ~82), the default schema init is:
  ```js
  { fields: [{ id: `f${uid()}`, key: 'name', type: 'text', label: 'Name' }], cardTemplates: [] }
  ```
  Change to:
  ```js
  { fields: [{ id: `f${uid()}`, key: 'name', type: 'text', label: 'Name', multilingual: true }], cardTemplates: [] }
  ```

  In `_addSchemaField()`, when creating a new field, add `multilingual: type !== 'image'` to the new field object.

- [ ] **Add multilingual toggle to each field row in `_renderSchemaEditor()`**

  The `fieldsHtml` map (around line 103) currently renders:
  ```js
  <input type="text" placeholder="Label" ...>
  <input type="text" class="schema-field-key" ...>
  <select ...> (type)
  <button ...>✕</button>
  ```

  Add after the `<select>` and before the `<button>`:
  ```js
  const isImg = f.type === 'image';
  const mlChecked = (!isImg && f.multilingual !== false) ? 'checked' : '';
  const mlDisabled = isImg ? 'disabled title="Image fields are always shared"' : '';
  // in the template string:
  `<label class="schema-ml-toggle" ${isImg ? 'style="opacity:0.4"' : ''}>
    <input type="checkbox" ${mlChecked} ${mlDisabled}
      onchange="_schemaFieldChange(${i},'multilingual',this.checked)">
    🌐
  </label>`
  ```

- [ ] **Add CSS**

  In `src/css/tomoe.css`:
  ```css
  .schema-ml-toggle { display:flex; align-items:center; gap:3px; cursor:pointer; font-size:13px; user-select:none; }
  .schema-ml-toggle input { cursor:pointer; accent-color: var(--c-brand); }
  ```

- [ ] **Verify**

  Open schema editor → each text field has a 🌐 checkbox (checked by default). Image fields have it greyed/disabled. Unchecking and saving → `schema.fields[i].multilingual === false`.

- [ ] **Commit**
  ```bash
  git add src/js/records/schema-editor.js src/css/tomoe.css
  git commit -m "feat(bilingual): add multilingual toggle to schema field editor"
  ```

---

## Task 5: Schema template locale dropdown

**Files:**
- Modify: `src/js/records/schema-editor.js`

- [ ] **Add `locale: 'active'` default to new templates**

  In `_addSchemaSection()` (or wherever new templates are pushed), add `locale: 'active'` to the new template object.

- [ ] **Render locale dropdown in single-template cards**

  In `_renderSchemaEditor()`, inside the single-template rendering block, add a locale `<select>` after the orientation select:

  ```js
  const localeOpts = ['active', ...state.locales].map(l =>
    `<option value="${l}" ${(tmpl.locale || 'active') === l ? 'selected' : ''}>
      ${l === 'active' ? '← active' : l.toUpperCase()}
    </option>`
  ).join('');

  // In the template HTML:
  `<select onchange="_schemaTemplateChange(${i},'locale',this.value)" style="width:80px;" title="Content locale for this template">
    ${localeOpts}
  </select>`
  ```

  Add the same locale `<select>` block to the compound template rendering section (inside the `if (isCompound)` branch), placed after the orientation `<select>`.

- [ ] **Verify**

  Open schema editor → template card shows locale dropdown with `← active`, `EN`, `VI` options. Selecting EN → `template.locale === 'en'`.

- [ ] **Commit**
  ```bash
  git add src/js/records/schema-editor.js
  git commit -m "feat(bilingual): add locale dropdown to schema card templates"
  ```

---

## Task 6: Record field init + migration

**Files:**
- Modify: `src/js/records/records.js`
- Modify: `src/js/records/schema-editor.js`

- [ ] **Update `addRecord()` to init multilingual fields as objects**

  In `src/js/records/records.js`, `addRecord()` (line ~263):

  ```js
  export function addRecord() {
    if (!state.schema) return;
    const rec = { id: 'rec_' + uid(), fieldsHash: '', fields: {} };
    state.schema.fields.forEach(f => {
      if (f.multilingual !== false && f.type !== 'image') {
        const empty = {};
        state.locales.forEach(l => { empty[l] = ''; });
        rec.fields[f.key] = empty;
      } else {
        rec.fields[f.key] = '';
      }
    });
    state.records.push(rec);
    setDirty();
    renderRecordsPanel();
  }
  ```

- [ ] **Add `_migrateRecordFields()` to `records.js`**

  ```js
  export function _migrateRecordFields() {
    if (!state.schema) return;
    state.schema.fields.forEach(f => {
      if (f.multilingual === false || f.type === 'image') return;
      state.records.forEach(rec => {
        const val = rec.fields[f.key];
        if (typeof val === 'string') {
          // wrap plain string into locale object, use first locale as source
          const obj = {};
          state.locales.forEach(l => { obj[l] = ''; });
          obj[state.locales[0]] = val;
          rec.fields[f.key] = obj;
        } else if (val && typeof val === 'object') {
          // ensure all locales exist
          state.locales.forEach(l => { if (!(l in val)) val[l] = ''; });
        }
      });
    });
    if (state.records.length) setDirty();
  }
  ```

- [ ] **Call `_migrateRecordFields()` in `saveSchema()`**

  In `src/js/records/schema-editor.js`, at the end of `saveSchema()` (after `state.schema = _editingSchema`), add:
  ```js
  window._migrateRecordFields?.();
  ```

- [ ] **Export `_migrateRecordFields` in `main.js`**

  Add import and window export.

- [ ] **Verify**

  1. Create a schema with a text field `multilingual: true`. Add a record → `record.fields.name` is `{ en: '', vi: '' }`.
  2. Create an old-style record manually in console with `state.records.push({ id: 'test', fields: { name: 'Tiger' }, fieldsHash: '' })`. Open schema editor → save → `record.fields.name` becomes `{ en: 'Tiger', vi: '' }`.

- [ ] **Commit**
  ```bash
  git add src/js/records/records.js src/js/records/schema-editor.js src/js/main.js
  git commit -m "feat(bilingual): multilingual field init in addRecord, migration on schema save"
  ```

---

## Task 7: Record detail editor — bilingual inputs

**Files:**
- Modify: `src/js/records/records.js`
- Modify: `src/css/tomoe.css`

- [ ] **Update `openRecordDetail()` to render bilingual inputs**

  In `openRecordDetail()`, the `fieldInputs` section builds inputs per field. For multilingual fields, render a pair instead of a single input.

  Find the section that builds `fieldInputs` (around line 285–320) and update:

  ```js
  const fieldInputs = allFields.map(f => {
    const isImg = f.type === 'image';
    const isMultilingual = !isImg && f.multilingual !== false;
    const val = record.fields[f.key];

    if (isMultilingual && typeof val === 'object' && val !== null) {
      // Render one input per locale
      const localeInputs = state.locales.map(l => {
        const locVal = val[l] ?? '';
        const inputEl = f.type === 'text-long'
          ? `<div class="tiptap-wrap rec-tiptap-instance" data-key="${f.key}" data-locale="${l}" data-record="${record.id}"></div>`
          : `<input type="text" class="rec-field-input" value="${esc(locVal)}"
               oninput="_setRecordField('${record.id}','${f.key}',this.value,'${l}')">`;
        return `<div class="rec-bilingual-row">
          <span class="rec-locale-tag">${l.toUpperCase()}</span>
          ${inputEl}
        </div>`;
      }).join('');
      return `<div class="record-field-group">
        <label class="record-field-label">${esc(f.label)}</label>
        <div class="rec-bilingual-group">${localeInputs}</div>
      </div>`;
    }

    // Original single-input rendering (images, non-multilingual)
    // val is a plain string for non-multilingual fields
    const strVal = typeof val === 'string' ? val : '';
    if (isImg) {
      // image fields: keep existing image picker rendering unchanged
      return `<div class="record-field-group">
        <label class="record-field-label">${esc(f.label)}</label>
        ${/* existing image thumbnail + pick/clear buttons */''}
      </div>`;
    }
    return `<div class="record-field-group">
      <label class="record-field-label">${esc(f.label)}</label>
      <input type="text" class="rec-field-input" value="${esc(strVal)}"
        oninput="_setRecordField('${record.id}','${f.key}',this.value,null)">
    </div>`;
  });
  ```

- [ ] **Update `_setRecordField()` to accept locale param**

  ```js
  function _setRecordField(recordId, key, value, locale) {
    const record = state.records.find(r => r.id === recordId);
    if (!record) return;
    if (locale && typeof record.fields[key] === 'object') {
      record.fields[key][locale] = value;
    } else {
      record.fields[key] = value;
    }
    setDirty();
  }
  ```

  Note: remove the `openRecordDetail(recordId)` call that was previously re-rendering on every keystroke — it breaks tiptap editors. Only re-render on blur or explicit save if needed.

- [ ] **Add CSS**

  In `src/css/tomoe.css`:
  ```css
  .rec-bilingual-group { display: flex; flex-direction: column; gap: 4px; }
  .rec-bilingual-row { display: flex; align-items: flex-start; gap: 6px; }
  .rec-locale-tag { min-width: 24px; font-size: 10px; font-weight: 700; color: var(--ink-400);
    text-transform: uppercase; padding-top: 6px; letter-spacing: 0.06em; }
  ```

- [ ] **Verify**

  Open record detail for a record with multilingual fields → each field shows `EN [input] / VI [input]`. Typing in EN input updates `record.fields.name.en`. VI input updates `.vi`.

- [ ] **Commit**
  ```bash
  git add src/js/records/records.js src/css/tomoe.css
  git commit -m "feat(bilingual): bilingual inputs in record detail editor"
  ```

---

## Task 8: Records table bilingual view toggle

**Files:**
- Modify: `src/js/records/records.js`
- Modify: `src/css/tomoe.css`

- [ ] **Add `_bilingualView` module state**

  In `src/js/records/records.js`, near the top with other module state:
  ```js
  let _bilingualView = localStorage.getItem('fc_bilingual_view') === '1';
  ```

- [ ] **Add toggle function**

  ```js
  export function toggleBilingualView() {
    _bilingualView = !_bilingualView;
    localStorage.setItem('fc_bilingual_view', _bilingualView ? '1' : '0');
    renderRecordsPanel();
  }
  ```

- [ ] **Add toggle button to records header**

  In `headerHtml` inside `renderRecordsPanel()`, add after the existing buttons:
  ```js
  const bilingualBtn = state.locales.length > 1
    ? `<button class="btn btn-sm btn-secondary${_bilingualView ? ' active' : ''}" onclick="toggleBilingualView()" title="Toggle bilingual columns">⊞ ${_bilingualView ? 'Bilingual' : state.activeLocale.toUpperCase()}</button>`
    : '';
  ```

- [ ] **Update column headers for bilingual mode**

  In `renderRecordsPanel()`, replace the `colHeaders` build:

  ```js
  const colHeaders = visibleTextFields.map(f => {
    const isMultilingual = f.multilingual !== false;
    if (isMultilingual && _bilingualView) {
      const isSorted = _sortField === f.key;
      return state.locales.map(l =>
        `<th class="rec-th-sortable${_sortField === f.key + '_' + l ? ' rec-th-sorted' : ''}"
          onclick="toggleSort('${f.key}')">
          ${esc(f.label)} <span class="rec-col-locale">${l.toUpperCase()}</span>
        </th>`
      ).join('');
    }
    const isSorted = _sortField === f.key;
    const arrow = isSorted ? (_sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="rec-th-sortable${isSorted ? ' rec-th-sorted' : ''}" onclick="toggleSort('${f.key}')">${esc(f.label)}${arrow}</th>`;
  }).join('');
  ```

- [ ] **Update row rendering for bilingual mode**

  In the `rows` map, update the `cols` build:
  ```js
  const cols = visibleTextFields.map(f => {
    const val = rec.fields[f.key];
    const isMultilingual = f.multilingual !== false && typeof val === 'object' && val;
    if (isMultilingual && _bilingualView) {
      return state.locales.map(l => {
        const locVal = val[l] ?? '';
        const preview = locVal.length > 80 ? locVal.slice(0, 80) + '…' : locVal;
        return `<td><span class="record-col-text">${mdParseInline(preview)}</span></td>`;
      }).join('');
    }
    const display = isMultilingual ? (val[state.activeLocale] ?? '') : (val ?? '');
    const preview = display.length > 120 ? display.slice(0, 120) + '…' : display;
    return `<td><span class="record-col-text">${mdParseInline(preview)}</span></td>`;
  }).join('');
  ```

- [ ] **Add CSS**
  ```css
  .rec-col-locale { font-size: 9px; font-weight: 700; color: var(--c-brand); letter-spacing: 0.06em;
    vertical-align: super; margin-left: 2px; }
  ```

- [ ] **Export `toggleBilingualView` in `main.js`**

- [ ] **Verify**

  Records panel shows toggle button. Click → splits multilingual columns into EN | VI sub-columns. Click again → collapses to single (active locale).

- [ ] **Commit**
  ```bash
  git add src/js/records/records.js src/js/main.js src/css/tomoe.css
  git commit -m "feat(bilingual): records table bilingual view toggle"
  ```

---

## Task 9: Pack — template locale

**Files:**
- Modify: `src/js/records/pack.js`

- [ ] **Import `getLocaleValue` and `state`**

  `state` is already imported. Add `getLocaleValue` to the import from `state.js`:
  ```js
  import { state, uiState, getActiveCard, LAYOUTS, LAYOUT_SLOTS, LAYOUT_SPLIT_DEFAULTS, HIDE_TITLE_LAYOUTS, getLocaleValue } from '../core/state.js'
  ```

- [ ] **Update `_fieldVal()` to resolve locale**

  ```js
  function _fieldVal(record, fieldId, locale) {
    const f = state.schema.fields.find(x => x.id === fieldId);
    if (!f) return '';
    return getLocaleValue(record.fields[f.key] ?? '', locale);
  }
  ```

- [ ] **Resolve template locale in `generateRecord()`**

  In `generateRecord()`, before building `card.sections` and `card.images`, compute the resolved locale:
  ```js
  const resolvedLocale = (template.locale && template.locale !== 'active')
    ? template.locale
    : state.activeLocale;
  ```

  Then pass `resolvedLocale` to every `_fieldVal(record, fid, resolvedLocale)` call in that template's mapping section.

- [ ] **Do the same in `syncRecord()`** for compound templates — add `resolvedLocale` and pass to `_fieldVal`.

- [ ] **Verify**

  1. Create a schema with `name` multilingual, set record `name.en = 'Tiger'`, `name.vi = 'Con Hổ'`.
  2. Create two templates: one with locale `en`, one with locale `vi`.
  3. Pack the record → two cards appear, one with "Tiger", one with "Con Hổ".

- [ ] **Commit**
  ```bash
  git add src/js/records/pack.js
  git commit -m "feat(bilingual): pack resolves locale per template"
  ```

---

## Task 10: AI Translation

**Files:**
- Modify: `src/js/records/ai.js`
- Modify: `src/js/records/records.js`
- Modify: `src/js/main.js`

- [ ] **Add `translateRecords()` to `src/js/records/ai.js`**

  ```js
  export async function translateRecords(sourceLocale, targetLocale, ids = null, force = false) {
    if (!state.schema) return;
    const provider = getAiProvider();
    const key = localStorage.getItem(`${provider}-key`) || '';
    if (!key) { showToast(`No ${provider} key set. Add it in Settings → AI`); return; }

    const mlFields = state.schema.fields.filter(f => f.multilingual !== false && f.type !== 'image');
    if (!mlFields.length) { showToast('No multilingual fields in schema'); return; }

    const scope = ids
      ? state.records.filter(r => ids.has(r.id))
      : state.records;

    // Only include records that have source content + empty target (unless force)
    const toTranslate = scope.map(rec => {
      const fields = {};
      mlFields.forEach(f => {
        const val = rec.fields[f.key];
        if (!val || typeof val !== 'object') return;
        const src = val[sourceLocale]?.trim();
        const tgt = val[targetLocale]?.trim();
        if (src && (force || !tgt)) fields[f.key] = src;
      });
      return Object.keys(fields).length ? { id: rec.id, fields } : null;
    }).filter(Boolean);

    if (!toTranslate.length) { showToast('Nothing to translate'); return; }

    const systemPrompt = `You are a translation engine. Translate the given field values from ${sourceLocale.toUpperCase()} to ${targetLocale.toUpperCase()}.
Return ONLY a JSON array with the same structure — same ids, same field keys, values replaced with ${targetLocale.toUpperCase()} translations.
Preserve HTML/Markdown formatting. No explanation, no markdown fences.`;

    const userPrompt = JSON.stringify(toTranslate, null, 2);

    showToast(`Translating ${toTranslate.length} record(s)…`);

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      const result = provider === 'gemini'
        ? await _callGemini(key, systemPrompt + '\n\n' + userPrompt)
        : await _callOpenAI(key, messages);

      const arr = Array.isArray(result) ? result : null;
      if (!arr) { showToast('Invalid response from AI'); return; }

      arr.forEach(item => {
        const rec = state.records.find(r => r.id === item.id);
        if (!rec) return;
        Object.entries(item.fields).forEach(([key, translated]) => {
          if (rec.fields[key] && typeof rec.fields[key] === 'object') {
            rec.fields[key][targetLocale] = translated;
          }
        });
      });

      setDirty();
      window.renderRecordsPanel();
      showToast(`Translated ${arr.length} record(s) → ${targetLocale.toUpperCase()}`);
    } catch (e) {
      showToast('Translation error: ' + e.message);
    }
  }
  ```

- [ ] **Add Translate button to records header in `renderRecordsPanel()`**

  In `src/js/records/records.js`, in the `headerHtml` section, add after the AI button:

  ```js
  const translateBtn = state.locales.length > 1 && state.schema?.fields.some(f => f.multilingual !== false && f.type !== 'image')
    ? `<div class="records-pack-wrap">
        <button class="btn btn-sm btn-secondary" onclick="toggleTranslateMenu(event)" title="AI translate fields">✦ Translate</button>
        <div id="translate-menu" style="display:none">
          ${state.locales.flatMap(src =>
            state.locales.filter(tgt => tgt !== src).map(tgt =>
              `<button class="records-pack-item" onclick="translateRecords('${src}','${tgt}',${selCount ? 'new Set([' + [..._selectedIds].map(id => `'${id}'`).join(',') + '])' : 'null'},false);toggleTranslateMenu(event)">${src.toUpperCase()} → ${tgt.toUpperCase()}</button>
               <button class="records-pack-item records-pack-item--sub" onclick="translateRecords('${src}','${tgt}',${selCount ? 'new Set([' + [..._selectedIds].map(id => `'${id}'`).join(',') + '])' : 'null'},true);toggleTranslateMenu(event)" title="Overwrite existing translations">${src.toUpperCase()} → ${tgt.toUpperCase()} (force)</button>`
            )
          ).join('')}
        </div>
      </div>`
    : '';
  ```

- [ ] **Add `toggleTranslateMenu` to `records.js`**

  ```js
  export function toggleTranslateMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('translate-menu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
  }
  ```

- [ ] **Export in `main.js`**

  Import `translateRecords` from `records/ai.js` and `toggleTranslateMenu` from `records/records.js`. Add both to the `Object.assign(window, {...})` block.

- [ ] **Verify**

  1. Have a record with `name.en = 'Tiger'`, `name.vi = ''`.
  2. Click `✦ Translate` → `EN → VI`. Wait → `name.vi` filled with translation.
  3. Try with no key set → toast error shown.

- [ ] **Commit**
  ```bash
  git add src/js/records/ai.js src/js/records/records.js src/js/main.js
  git commit -m "feat(bilingual): AI translate records EN↔VI"
  ```

---

## Task 11: Add language flow

**Files:**
- Modify: `src/js/records/schema-editor.js`
- Modify: `src/js/main.js`

- [ ] **Add "+ Add language" button to schema editor footer**

  In `_renderSchemaEditor()`, at the bottom of the rendered HTML (after the fields section, before templates), add:

  ```js
  const currentLocales = state.locales.map(l => `<span class="schema-locale-tag">${l.toUpperCase()}</span>`).join('');
  const addLangSection = `
    <div class="schema-lang-section">
      <span class="schema-section-label">Languages: ${currentLocales}</span>
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="text" id="new-locale-input" placeholder="e.g. ja, fr" style="width:80px;"
          onkeydown="if(event.key==='Enter'){addLocale(this.value);this.value='';window.openSchemaEditor();}">
        <button class="btn btn-sm btn-secondary" onclick="addLocale(document.getElementById('new-locale-input').value);document.getElementById('new-locale-input').value='';window.openSchemaEditor()">+ Add</button>
      </div>
    </div>`;
  ```

- [ ] **Add CSS**

  ```css
  .schema-lang-section { display:flex; align-items:center; gap:10px; padding:8px 0; flex-wrap:wrap; }
  .schema-locale-tag { padding:2px 8px; background:var(--c-bg-2); border-radius:10px; font-size:11px; font-weight:600; }
  ```

- [ ] **Verify**

  Open schema editor → shows current languages `EN VI`. Type `ja` + Enter → `state.locales` becomes `['en','vi','ja']`. Toolbar switcher now shows `[EN] [VI] [JA]`. Existing multilingual record fields get a `ja: ''` key.

- [ ] **Commit**
  ```bash
  git add src/js/records/schema-editor.js src/css/tomoe.css
  git commit -m "feat(bilingual): add language from schema editor"
  ```

---

## Task 12: `buildCardHTML` backward compat + export/import

**Files:**
- Modify: `src/js/render.js`
- Modify: `src/js/records/ai.js`

- [ ] **Import `getLocaleValue` and `state` in `render.js`**

  `render.js` currently imports from `core/state.js`:
  ```js
  import { LAYOUT_SLOTS, LAYOUT_SPLIT_DEFAULTS, getCardOrientation } from './core/state.js'
  ```

  Add `getLocaleValue` and `state`:
  ```js
  import { LAYOUT_SLOTS, LAYOUT_SPLIT_DEFAULTS, getCardOrientation, getLocaleValue, state } from './core/state.js'
  ```

- [ ] **Use `getLocaleValue` in `buildCardHTML()`**

  Find where `card.title` and `section.content` / `section.label` are accessed in `buildCardHTML()`. Wrap with `getLocaleValue`:

  ```js
  // Replace:
  const titleText = card.title || '';
  // With:
  const titleText = getLocaleValue(card.title, state.activeLocale);

  // For sections, wherever section.content is rendered:
  const content = getLocaleValue(section.content, state.activeLocale);
  const label = getLocaleValue(section.label, state.activeLocale);
  ```

  If card has `card.locales`, resolve them first:
  ```js
  const localeData = card.locales?.[state.activeLocale];
  const resolvedTitle = localeData ? localeData.title : card.title;
  const resolvedSections = localeData ? localeData.sections : card.sections;
  ```

- [ ] **Verify existing cards render correctly**

  Open any existing project → cards render exactly as before (backward compat). Cards with plain string `title` continue to work. No visual regression.

- [ ] **Verify `exportRecordsJson` handles multilingual values**

  Current `exportRecordsJson` does `obj[f.key] = val`. For multilingual fields, `val` is `{ en, vi }` — this already outputs correctly. **No change needed.**

- [ ] **Update `_applyImportedRecords()` for multilingual merge**

  In `src/js/records/ai.js`, `_applyImportedRecords()` currently assigns `target.fields[f.key] = row[f.key]`. Update the text-field assignment to merge locale objects rather than overwrite:

  ```js
  allFields.filter(f => f.type !== 'image').forEach(f => {
    if (!(f.key in row)) return;
    const incoming = row[f.key];
    const existing = target.fields[f.key];
    if (incoming && typeof incoming === 'object' && existing && typeof existing === 'object') {
      // merge: only overwrite keys present in incoming
      Object.assign(existing, incoming);
    } else {
      target.fields[f.key] = incoming;
    }
  });
  ```

- [ ] **Verify round-trip**

  Export records JSON → open file, confirm `{ en, vi }` objects present. Import back → existing values merged, not overwritten.

- [ ] **Build and smoke-test**

  ```bash
  npm run build
  ```

  Open `dist/index.html` → create project → define bilingual schema → add record → switch locale → pack → verify cards show correct locale.

- [ ] **Commit**
  ```bash
  git add src/js/render.js src/js/records/ai.js
  git commit -m "feat(bilingual): buildCardHTML locale-aware, import merges multilingual values"
  ```

---

## Final: push branch

- [ ] **Push feature branch**
  ```bash
  git push -u origin feature/bilingual
  ```
