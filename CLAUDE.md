# FlashCard Creator — CLAUDE.md

## Project Overview

Single-file offline flashcard app (`index.html`). No server, no framework.
Vanilla JS + CSS, libraries loaded from CDN.

## Build System

**Edit source files in `src/`, then run `node build.js` to regenerate `index.html`.**

```
src/
├── template.html   — HTML shell + all body HTML
│                     Config slot: <!-- BUILD:CONFIG -->
│                     CSS slot:    <!-- BUILD:CSS -->
│                     JS slot:     <!-- BUILD:JS -->
├── config.js       — window.FC_VERSION + window.FC_CONFIG
├── style.css       — all CSS
└── app.js          — all JS
build.js            — assembles src/ → index.html, copies to FlashCardApp2/
watch.js            — watches src/ and auto-runs build.js (150ms debounce)
index.html          — GENERATED — do not edit directly
FlashCardApp2/
└── FlashCard Creator.html  — copy of index.html for distribution
```

**IMPORTANT:** Always edit `src/` files, never edit `index.html` directly. Run `node build.js` before sharing or testing. `watch.js` handles auto-rebuild during development.

### Build markers (in `src/template.html`)
- `<!-- BUILD:CONFIG -->` — replaced with `<script>src/config.js</script>` contents
- `<!-- BUILD:CSS -->` — replaced with `<style>src/style.css</style>` contents
- `<!-- BUILD:JS -->` — replaced with `<script>src/app.js</script>` contents

**IMPORTANT:** The CONFIG marker must not appear inside any HTML comment. Stray `<!--` above it will swallow the entire config block, making `FC_VERSION` undefined.

## Key Rules

- **No framework** — plain DOM APIs only.
- **Config** lives in `src/config.js` as `window.FC_CONFIG`. Never hardcode defaults in `app.js`; always read from config or state.
- **User settings** — saved to `localStorage` key `fc_user_config`, and optionally to `user-config.json` in the work folder.

## Architecture

```
src/template.html
├── <head>
│   ├── <!-- BUILD:CONFIG --> → config.js inlined
│   ├── CDN scripts: marked.js, html2canvas, jsPDF
│   └── <!-- BUILD:CSS --> → style.css inlined
└── <body>
    ├── .fc-toolbar — project name input, Settings, New Card, ↻ Thumbs, Save/Load buttons
    ├── .fc-sidebar — card list with reorder/clone/delete
    ├── .fc-editor — layout picker, image slots, title, sections, font controls
    ├── .fc-preview — live preview + zoom controls + Print/Export PDF header
    ├── Modals: image search, custom CSS, load/recent, settings
    └── <!-- BUILD:JS --> → app.js inlined
```

## Layouts

| ID | Slots | Notes |
|---|---|---|
| `2top-1bot` | 3 | 2 side-by-side top, 1 large bottom |
| `1top-2bot` | 3 | 1 large top, 2 side-by-side bottom |
| `1big-2small` | 3 | 1 large left, 2 small stacked right |
| `2x2` | 4 | 2×2 grid |
| `1full` | 1 | Single full image |
| `1left-2right` | 3 | 1 tall left, 2 stacked right |
| `1left-3right` | 4 | 1 narrow left, 3 stacked right |
| `1top-3bot` | 4 | 1 full-width top, 3 side-by-side bottom |
| `1top-1bot` | 2 | 1 top, 1 bottom |
| `fullimage` | 1 | Image only, inner padding wrapper |
| `fulltext` | 0 | Text only, no image area |
| `2img-2txt` | 2 | 2 images + 2 text cells in compound grid, draggable row split |
| `2img-4txt` | 2 | Disabled (commented out in LAYOUTS array) |
| `8img-8txt` | 8 | 8 img+text pairs; portrait 2×8, landscape 4×4 |

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
    paperSize, orientation, margin, padding,
    border: { width, style, color, radius },
    image: { backgroundSize, backgroundPosition },
    font: { family, size, color, lineHeight },
    titleFont: { size, color, lineHeight },
    contentFont: { size, color, lineHeight },
    customCss,
  },
  cards: [ {
    id, layout, imageHeightPercent, imageGridSplit, images, title, sections,
    orientation,   // null = inherit global; "portrait" | "landscape" = override
    hideTitle,     // bool — hides title in preview/print/PDF, keeps it for editor
    titleFont,     // null = inherit global titleFont; per-card override
    contentFont,   // null = inherit global contentFont; per-card override
  } ],
  projectName: "Untitled",
}
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

## Preview Zoom

- `let previewZoom = 1.0` — multiplier on fit scale (fit = panel width / card width).
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
setDirty()         // dirty=true, shows dot, schedules _autoSaveToFile in 1.5s
clearDirty()       // dirty=false, removes dot
_autoSaveToFile()  // writes to work folder, updates fc_last_file, calls clearDirty()
```

## Editor Behaviour by Layout

| Condition | Layouts |
|---|---|
| Image Area Height slider **hidden** | `fullimage`, `fulltext`, `2img-2txt`, `2img-4txt` |
| Row split display shown | `2img-2txt`, `2img-4txt` |
| Sections list 2-column | `2img-2txt`, `2img-4txt`, `8img-8txt` (`isCompoundTextLayout`) |
| Paired section rows (thumb + label + textarea, no add/paste btns) | `2img-2txt`, `8img-8txt` (`isImgPairedLayout`) |

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
- Backdrop-click auto-close is disabled for all modals (commented out in `init()`).
- `setWorkDir()` non-AbortError failures now show `alert()` so the user sees the error instead of silent console log.

## Session Notes (2026-05-10)

- Added `8img-8txt` layout: 8 image+text pairs, orientation-aware grid (see Layouts section).
- Editor for `2img-2txt` / `8img-8txt`: paired section rows show image thumbnail next to inputs (`isImgPairedLayout`). Label input restored after brief removal.
- "Add Section" and "Paste block" buttons hidden for `isImgPairedLayout`.
- `2img-4txt` disabled (commented out in `LAYOUTS`).
- `setLayout()` now calls `refreshAllThumbs()` after switching layout.
- Sidebar width reduced: 200px → 160px, min-width 160px → 120px.
- Preview zoom: `−`/`+`/reset controls added to preview header.
- Backdrop-click auto-close disabled for all modals.
- `setWorkDir()` improved error handling (alert on failure).
- `marked.use({ breaks: true })` — single newline → `<br>` in markdown content.
- Section label rendering conditional: empty/null label skips the `• label: ` span entirely (both `buildSectionsHtml` and `buildSectionCellHtml`).
- Per-card font override already implemented (stale "planned" note removed).
- Distribution folder renamed `FlashCardApp` → `FlashCardApp2`.
