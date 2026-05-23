# Editor Toolbar Improvements — Design Spec

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify card font-size controls and TipTap WYSIWYG markdown editing into a single shared toolbar in the editor panel.

**Architecture:** One toolbar bar at the top of the editor content area — 2 font-size inputs (title/content) on the left, TipTap inline formatting buttons on the right. Each section has its own TipTap editor instance; the toolbar is shared and dispatches to whichever instance is currently focused.

**Tech Stack:** TipTap (ESM via esm.sh CDN), turndown.js (CDN script tag), marked.js (already present)

---

## Scope

### In scope
- Shared editor toolbar with per-card title/content font-size overrides
- TipTap WYSIWYG editor replacing `<textarea>` for section content
- Toolbar: B, I, H1, H2, bullet list, numbered list
- Toolbar idle state (mờ) when no section focused; active state when focused
- Toolbar button active state reflecting cursor position (e.g. B highlights when cursor is in bold text)
- Paste from Word: intercept paste event, strip `mso-*` styles, keep semantic tags
- Fallback to plain `<textarea>` if TipTap CDN fails to load

### Out of scope
- Font family, color, weight, alignment overrides per card (global settings only)
- Floating/bubble toolbar on text selection
- Table, image-in-text, code block support
- Per-section font controls
- TipTap for `isImgPairedLayout` rows (`2img-2txt`, `8img-8txt`) — these keep plain textarea

---

## Data Model

No changes to `state` shape. Existing fields used:
- `card.titleFont.size` — per-card title font size override (null = inherit global)
- `card.contentFont.size` — per-card content font size override (null = inherit global)
- `card.sections[].content` — raw markdown string (unchanged)

---

## UI: Shared Toolbar

```
┌─────────────────────────────────────────────────────────────┐
│ Title [14↕]  Content [12↕]  │  B  I  H1  H2  •  1.        │
└─────────────────────────────────────────────────────────────┘
```

- Lives at top of `.fc-editor` content area, above sections
- **Idle state:** `opacity: 0.45`, `pointer-events: none` on formatting buttons only — when no TipTap section is focused
- **Active state:** full opacity, pointer-events enabled — when any section is focused
- Font-size inputs are **always active** (not affected by idle/active state) — they apply card-level, not cursor-level
- Formatting buttons (B/I/H1/H2/•/1.) reflect cursor state: button appears pressed when cursor is inside matching mark/node

---

## TipTap Integration

### CDN Loading

Add to `src/template.html` `<head>`, **after** all existing `<script>` tags:

```html
<!-- turndown (plain script, no module needed) -->
<script src="https://unpkg.com/turndown/dist/turndown.js"></script>

<!-- TipTap (ESM module — sets globals when loaded) -->
<script type="module">
  try {
    const { Editor } = await import('https://esm.sh/@tiptap/core@2')
    const { default: StarterKit } = await import('https://esm.sh/@tiptap/starter-kit@2')
    window.TipTapEditor = Editor
    window.TipTapStarterKit = StarterKit
    window.tiptapReady = true
  } catch (e) {
    window.tiptapReady = false
  }
  document.dispatchEvent(new Event('tiptap-ready'))
</script>
```

The `tiptap-ready` event always fires — either with `tiptapReady = true` (success) or `false` (CDN error). The app listens for this event before initializing editors.

### Init Strategy

TipTap init runs **only from `renderEditor()`**, which is the single entry point for rebuilding editor DOM.

**On every `renderEditor()` call:**
1. Destroy all existing instances in `_tiptapInstances` map (`editor.destroy()` for each)
2. Clear `_tiptapInstances = {}`
3. Render section DOM (with `<div class="section-tiptap-editor">` instead of `<textarea>`)
4. If `window.tiptapReady === true`: init TipTap for each non-paired section
5. If `window.tiptapReady === false` or undefined: render plain `<textarea>` fallback

For `8img-8txt` layout (8 sections): init TipTap lazily on first `focus` event to avoid 8 simultaneous inits on render.

### Per-section init
```js
const editor = new window.TipTapEditor({
  element: divEl,
  extensions: [window.TipTapStarterKit],
  content: mdParse(s.content), // marked.parse() — reuse existing helper
})
_tiptapInstances[sectionIndex] = editor
```

### onChange handler
```js
editor.on('update', () => {
  s.content = window._turndownService.turndown(editor.getHTML())
  setDirty()
})
```

`window._turndownService` is a single shared `new TurndownService()` instance created once at app init.

### Focus tracking
```js
editor.on('focus', () => { _activeEditor = editor; _activateToolbar() })
editor.on('blur',  () => { if (!_anyEditorFocused()) _deactivateToolbar() })
```

### Fallback (no toolbar shown)
If `tiptapReady === false`: render `<textarea class="section-content-input">` as before. Toolbar formatting buttons are hidden; font-size inputs still shown.

---

## Font-size Controls

- Two `<input type="number" min="6" max="72" step="1">` in toolbar left group
- Write pattern (partial object — only `.size` is written, other fields remain untouched):
  ```js
  card.titleFont = card.titleFont || {}
  card.titleFont.size = value  // other fields (color, weight, etc.) preserved
  ```
  Same pattern for `card.contentFont.size`.
- On change: `setDirty()` + `renderPreview()`
- Placeholder shows computed effective size (global fallback) when no override set

---

## Paste from Word

Intercept `paste` on each TipTap editor element:
```js
element.addEventListener('paste', (e) => {
  const html = e.clipboardData.getData('text/html')
  if (!html) return // let TipTap handle plain text natively
  e.preventDefault()
  const clean = cleanWordHtml(html) // strip mso-*, o:p, keep b/i/em/strong/ul/ol/li/h1-h6
  editor.commands.insertContent(clean)
})
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/template.html` | Add turndown CDN `<script>`, add TipTap CDN `<script type="module">`, add toolbar HTML |
| `src/editor.js` | TipTap init/destroy lifecycle, toolbar logic, font-size inputs, paste handler, `_turndownService` init |
| `src/css/tomoe.css` or `editor.css` | Toolbar styles, idle/active states, TipTap editor styles |
| `build.js` | No change |

---

## Edge Cases

- **Card switch / every `renderEditor()` call:** destroy all instances first, then reinit. This covers card switch, layout change, settings change — all go through `renderEditor()`.
- **`isImgPairedLayout` (`2img-2txt`, `8img-8txt`):** skip TipTap entirely, keep plain textarea. TipTap toolbar formatting buttons hidden for these layouts.
- **`8img-8txt`:** init TipTap lazily on first focus to avoid 8 simultaneous inits on render.
- **Undo:** TipTap internal undo handles Ctrl+Z within a session. App-level `pushUndo()` called on section blur to capture snapshot in app undo stack.
- **TipTap CDN slow (succeeds after `tiptap-ready` event):** not possible — the module block always dispatches `tiptap-ready` at the end (success or failure). No mixed state.
