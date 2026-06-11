# FlashCard Creator — CLAUDE.md

## Project Overview

Single-file offline flashcard app (`index.html`). No server, no framework.
Vanilla JS + CSS, libraries loaded from CDN.

## Build System

**Dev:** `npm run dev` — Vite dev server with hot reload at http://localhost:5173

**Build:** `npm run build` — produces `dist/index.html` (single file, offline-ready), also copies to `FlashCardApp2/FlashCard Creator.html`

Source files live in `src/`. Edit there, Vite handles bundling.

```
src/
├── html/
│   ├── template.html  — not used by Vite build (kept for reference)
│   ├── svg.html       — SVG icon sprite (inlined in root index.html)
│   └── modals.html    — modals and dialogs (inlined in root index.html)
├── js/
│   ├── main.js        — Vite entry point: imports all CSS + JS modules, exposes window globals
│   ├── config.js      — FC_VERSION + FC_CONFIG
│   ├── state.js       — state shape, LAYOUTS, uiState, getActiveCard()
│   ├── utils.js       — uid, mdParse, esc, _show/_hide, _compressImage, _hashStr
│   ├── storage.js     — File System Access API, IndexedDB, autosave, backup, read-only
│   ├── api.js         — image search (Wikimedia, iNaturalist, Pixabay, Unsplash), AI generate
│   ├── i18n.js        — translation strings + t() helper
│   ├── render.js      — buildCardHTML, getGridTemplateStyle, buildHandles
│   ├── editor.js      — card editor UI, TipTap instances, section controls
│   ├── editor-controls.js — font/border/image controls
│   ├── editor-sections.js — section add/remove/reorder controls
│   ├── preview.js     — live preview rendering, PDF/print export
│   ├── modals.js      — image search modal logic, settings modal logic
│   ├── undo.js        — undo/redo stack
│   ├── records.js     — schema editor, records panel, pack/sync, AI export/import
│   ├── records-pack.js — pack/sync records into cards
│   ├── schema-editor.js — schema editor modal
│   ├── records-ai.js  — AI-assisted record generation
│   ├── ai-chat.js     — AI chat panel
│   └── app.js         — init, dispatch, sidebar, toolbar, event wiring
└── css/
    ├── lexend-embedded.css — Lexend font (base64, offline)
    ├── base.css       — reset, variables, typography
    ├── sidebar.css    — card list sidebar
    ├── editor.css     — editor panel
    ├── preview.css    — preview panel
    ├── modal.css      — shared modal styles
    └── tomoe.css      — records, schema, dialogs, misc feature styles
index.html          — Vite entry point (hand-authored HTML shell + app layout)
vite.config.js      — Vite config with vite-plugin-singlefile
scripts/postbuild.js — copies dist/index.html to FlashCardApp2/ after build
dist/               — GENERATED — do not edit directly (gitignored)
FlashCardApp2/
└── FlashCard Creator.html  — copy of dist/index.html for distribution
```

## Key Rules

- **No framework** — plain DOM APIs only.
- **Config** lives in `src/config.js` as `window.FC_CONFIG`. Never hardcode defaults in `app.js`; always read from config or state.
- **User settings** — saved to `localStorage` key `fc_user_config`, and optionally to `user-config.json` in the work folder.

## Architecture

```
src/html/template.html
├── <head>
│   ├── <!-- BUILD:CONFIG --> → js/config.js inlined
│   ├── CDN scripts: marked.js, html2canvas, jsPDF
│   └── <!-- BUILD:CSS --> → css/*.css concatenated
└── <body>
    ├── <!-- BUILD:SVG --> → html/svg.html (icon sprite)
    ├── .fc-app
    │   ├── .fc-settings-bar — global paper/font/border settings
    │   ├── .fc-toolbar — project name, card actions, view toggles
    │   └── .fc-main — 3-panel layout
    │       ├── .fc-sidebar — card list with reorder/clone/delete
    │       ├── .fc-editor — layout picker, image slots, title, sections
    │       └── .fc-preview-panel — live preview + zoom controls
    ├── <!-- BUILD:MODALS --> → html/modals.html
    │   ├── Backdrop modals: img-modal, css-modal, json-modal, json-preview-modal,
    │   │                    load-modal, save-as-modal, settings-modal
    │   └── Native dialogs: schema-editor-modal, pack-dialog, backup-modal, records-ai-modal
    └── <!-- BUILD:JS --> → js/*.js concatenated in order
```

## Layouts

| ID             | Slots | Notes                                                         |
| -------------- | ----- | ------------------------------------------------------------- |
| `2top-1bot`    | 3     | 2 side-by-side top, 1 large bottom                            |
| `1top-2bot`    | 3     | 1 large top, 2 side-by-side bottom                            |
| `1big-2small`  | 3     | 1 large left, 2 small stacked right                           |
| `2x2`          | 4     | 2×2 grid                                                      |
| `1full`        | 1     | Single full image                                             |
| `1left-2right` | 3     | 1 tall left, 2 stacked right                                  |
| `1left-3right` | 4     | 1 narrow left, 3 stacked right                                |
| `1top-3bot`    | 4     | 1 full-width top, 3 side-by-side bottom                       |
| `1top-1bot`    | 2     | 1 top, 1 bottom                                               |
| `fullimage`    | 1     | Image only, inner padding wrapper                             |
| `fulltext`     | 0     | Text only, no image area                                      |
| `2img-2txt`    | 2     | 2 images + 2 text cells in compound grid, draggable row split |
| `2img-4txt`    | 2     | Disabled (commented out in LAYOUTS array)                     |
| `8img-8txt`    | 8     | 8 img+text pairs; portrait 2×8, landscape 4×4                 |

**Compound layouts** (`2img-2txt`, `8img-8txt`): rendered by dedicated early-return branches in `buildCardHTML()`, not the normal image-area + text-area path. Each cell has its own border/padding. Inter-cell gap = `marginPx`.

**`8img-8txt` grid structure:**

- Portrait: 2 cols × 8 rows (`repeat(4, {imgFr}fr {txtFr}fr)`) — 4 pair-rows, item order: img0,img1,txt0,txt1,...
- Landscape: 4 cols × 4 rows (`repeat(2, {imgFr}fr {txtFr}fr)`) — 2 pair-rows, item order: img0-3,txt0-3,img4-7,txt4-7
- Image/text ratio controlled by `card.imageHeightPercent` via `fr` units (no drag handles)
- `setLayout("8img-8txt")` auto-pads `card.sections` to 8 entries

`getGridTemplateStyle(layout, sp)` — returns inline `grid-template-*` CSS overriding class defaults.  
`buildHandles(layout, sp)` — injects draggable resize handles into the grid.  
Use `grid-row: 1 / span N` (not `1 / -1`) for explicit row spanning.

## File / Storage

- **Work folder** (`workDirHandle`) — a `FileSystemDirectoryHandle` picked once via `showDirectoryPicker`, persisted in IndexedDB as `"_work_dir"`. All JSON reads/writes go through this — **no OS dialog**.
- **Auto-save** — file-system based, 1.5s debounce from any `setDirty()` call. Writes to `currentFileName` in the work folder. Filename auto-derived from `state.projectName` via `_defaultFileName()` (slug + `.json`). Stores `localStorage.fc_last_file` after each write.
- **Auto-restore** — `_autoRestore()` runs at init: reads `localStorage.fc_last_file` + `workDirHandle`, requests permission, loads the file. No prompt needed if permission already granted.
- **Save As** — `prompt()` for filename, writes to work folder.
- **Load modal** — lists `.json` files from work folder (filters out `user-config.json`). Shows filename + relative date as subtitle. Highlights current file. Footer has "📁 Set Folder" button (calls `setWorkDir()`). Folder section header has "Open folder" button (also `setWorkDir()`). Non-AbortError failures show an alert.
- **PDF export** — uses `pdf.save(...)` → browser download dialog. PDF filename: `slug-YYYYMMDD-HHmm.pdf`.
- **Paste block** — textarea for bulk-pasting text into sections. Controlled by `FC_CONFIG.pasteBlock`. Hidden for `isImgPairedLayout` layouts.
- **New Project** — `newProject()` resets state and closes modal.

## Init Sequence

```
init()
  restoreWorkDir()     ← restores FileSystemDirectoryHandle from IndexedDB
  _autoRestore()       ← loads last file from work folder if available
  bindSettings()       ← attaches input listeners to settings bar
  applySettingsToUI()  ← syncs DOM to state.settings
  renderSidebar()
  renderEditor()
  renderPreview()
```

(No `setupAutoSave` — autosave triggered by `setDirty()`, not a timer.)

## State Shape

```js
state = {
  settings: {
    paperSize,
    orientation,
    margin,
    padding,
    border: { width, style, color, radius },
    image: { backgroundSize, backgroundPosition },
    font: { family, size, color, lineHeight },
    titleFont: { size, color, lineHeight },
    contentFont: { size, color, lineHeight },
    customCss,
  },
  cards: [
    {
      id,
      layout,
      imageHeightPercent,
      imageGridSplit,
      images,
      title,
      sections,
      orientation, // null = inherit global; "portrait" | "landscape" = override
      hideTitle, // bool — hides title in preview/print/PDF, keeps it for editor
      titleFont, // null = inherit global titleFont; per-card override
      contentFont, // null = inherit global contentFont; per-card override
    },
  ],
  projectName: "Untitled",
};
```

**Saved JSON** also includes `project_name` at the top level (loaded into `state.projectName`).

## Font System (3 tiers, global + per-card)

1. **`state.settings.font`** — base: family, size, color, lineHeight
2. **`state.settings.titleFont`** — global override for card title (`null` fields inherit from `font`)
3. **`state.settings.contentFont`** — global override for sections (`null` fields inherit)
   - Section label renders at `0.78em` of contentFont effective size
   - Section content renders at `0.75em` of contentFont effective size

**Per-card override:** `card.titleFont` / `card.contentFont` — merged in `buildCardHTML()`:

```js
const titleF = { ...s.titleFont, ...(card.titleFont || {}) };
```

`fontControls(key)` renders size/color/lineHeight inputs with computed hint next to size.

## Thumbnail System

- **Auto-generation disabled** — `setDirty()` no longer triggers thumb refresh.
- **Manual refresh** — `↻ Thumbs` button in toolbar calls `refreshAllThumbs()`.
- `setLayout()` calls `refreshAllThumbs()` automatically after layout change.
- `scheduleThumbRefresh(cardId)` — still exists for targeted refresh; `_pendingThumbCardId` tracks specific vs all.
- Existing `<img>` thumbs are updated silently (no `thumb-loading` flash) if already rendered.

## UI State

All transient UI state lives in `uiState` object (defined in `state.js`):

```js
uiState = { activeCardId, imgModalSlot, activeTab, sidebarView, previewZoom }
```

Never use bare `activeCardId` etc. — always `uiState.activeCardId`.

## Preview Zoom

- `uiState.previewZoom = 1.0` — multiplier on fit scale (fit = panel width / card width).
- `changePreviewZoom(delta)` — steps of 0.25, clamped to 0.25–3.0. `delta=0` resets to 1.0.
- Buttons `−` / `[100%]` / `+` in preview header. Click the `%` label to reset.
- `#preview-zoom-label` is updated on each `renderPreview()` call.
- `.fc-preview` uses `overflow: auto` (both axes) for scrolling when zoomed in.

## Markdown

`marked.use({ breaks: true })` — single newline in section content renders as `<br>`.

## Image Compression

`_compressImage(dataURL, maxPx, quality)` — scales image so longest edge ≤ `maxPx`, converts to JPEG at `quality` (default 0.82).

`MAX_IMG_PX` — from `FC_CONFIG.maxImgPx` (default 1240). Configurable in Settings → Image Quality.

`migrateImages(btn)` — batch-compress all existing card images. Settings → Maintenance.

## Dirty / Autosave

```js
setDirty(); // dirty=true, shows dot, schedules _autoSaveToFile in 1.5s
clearDirty(); // dirty=false, removes dot
_autoSaveToFile(); // writes to work folder, updates fc_last_file, calls clearDirty()
```

## Editor Behaviour by Layout

| Condition                                                         | Layouts                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Image Area Height slider **hidden**                               | `fullimage`, `fulltext`, `2img-2txt`, `2img-4txt`              |
| Row split display shown                                           | `2img-2txt`, `2img-4txt`                                       |
| Sections list 2-column                                            | `2img-2txt`, `2img-4txt`, `8img-8txt` (`isCompoundTextLayout`) |
| Paired section rows (thumb + label + textarea, no add/paste btns) | `2img-2txt`, `8img-8txt` (`isImgPairedLayout`)                 |

**Paired section row** (`.section-row--paired`): 44×44px `.pair-thumb` (clickable → `openImgModal(slot)`) on left, label input + textarea on right. "Add Section" and "Paste block" buttons hidden.

## CSS Class Map

- `.fc-card[data-layout="…"]` — layout-specific targeting
- `.fc-image-area` — image grid container
- `.fc-image-slot`, `.fc-image-slot-0` … `.fc-image-slot-N`
- `.fc-text-area`, `.fc-title`, `.fc-sections`, `.fc-section`
- `.fc-section__label`, `.fc-section__content`
- `.fc-card--preview` / `.fc-card--print`
- `.fc-pair-title` — text cell in `8img-8txt` pairs
- `.section-row--paired` — flex-row section row with image thumb
- `.pair-thumb` — 44×44px clickable image thumbnail in paired editor rows
- `.fc-card-item { min-height: 34px }` — prevents height jump on hover
- `#project-name-input` — transparent editable text in toolbar
- `.recent-item--active` — highlights current file in load modal
- `#preview-zoom-label` — zoom percentage display in preview header

## Known Pitfalls

- Card action buttons use `display:none`/`display:flex` (not `visibility:hidden`). `min-height:34px` on `.fc-card-item` prevents jumping.
- `<!-- BUILD:CONFIG -->` must not be preceded by unclosed `<!--` — would swallow the entire config block.
- Compound layout (`2img-2txt`, `8img-8txt`) row track sizes use `fr` units so proportions are maintained without gap arithmetic.
- `2img-4txt` is commented out in the `LAYOUTS` array (disabled from picker) but all rendering/drag code remains intact.
- Backdrop-click auto-close is disabled for all modals — intentional, do not re-enable without testing scroll lock.
- Native `<dialog>` elements: use `showModal()` / `close()`, not `_show()`/`_hide()`. `window.confirm()` is blocked when a `<dialog>` is open — use inline two-click confirmation instead.
- `onclick` attributes in innerHTML strings: always use single-quote outer (`onclick='fn(...)'`) when the argument is a `JSON.stringify`-ed string — double quotes inside will break the HTML attribute.
- `_autoSaveToFile`: snapshot `currentFileName`/`currentSubfolder` into locals before any `await` — globals can change mid-save if user opens another file.

## Session Notes (2026-05-29) - Refactoring

- **src/ reorganized** into `html/`, `js/`, `css/` subfolders. Build markers added: `BUILD:SVG`, `BUILD:MODALS`.
- **uiState object**: `activeCardId`, `imgModalSlot`, `activeTab`, `sidebarView`, `previewZoom` moved from loose globals into `const uiState = {}` in `state.js`.
- **`_show(id)` / `_hide(id)` helpers** added to `utils.js`; replace `document.getElementById(id).style.display` patterns.
- **API helpers**: `_fetchJson(url)` (checks `r.ok`), `_searchImages()`, `_imgItem()` unify Wikimedia/iNaturalist/Pixabay/Unsplash search boilerplate.
- **Records AI flow**: `copyRecordsForAI()` dialog, `exportRecordsJson()`, `pasteRecordsJson()`, `appendRecordsJson()`, `importRecordsJsonFile()` — all in `records.js`.
- **Read-only folder mode**: `fc_edit_folders` localStorage key (CSV). `_computeReadOnly()` called after every file load/move/save-as/new-project.
- **Backup modal**: native `<dialog>`, restore uses two-click confirm pattern (avoids `window.confirm` inside dialog). Backup files stored in `_backups/` subfolder.
