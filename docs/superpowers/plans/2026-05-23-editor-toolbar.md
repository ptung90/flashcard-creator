# Editor Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-card font controls and raw-text section textareas with a unified toolbar (title/content font-size inputs + TipTap WYSIWYG formatting buttons) while keeping `card.sections[].content` stored as raw markdown.

**Architecture:** TipTap loads async via `<script type="module">` from esm.sh CDN. A `tiptap-ready` event triggers re-render after load. Each non-paired section gets its own TipTap instance. One shared toolbar above the sections list — opacity-dimmed when no section is focused, full when focused. Font-size inputs in the toolbar replace the full `cardFontControls()` UI; only `.size` is adjustable per-card now.

**Tech Stack:** TipTap 2 (`@tiptap/core`, `@tiptap/starter-kit` via esm.sh), turndown.js (UMD via unpkg), marked.js (already loaded)

---

## File Map

| File | What changes |
|------|-------------|
| `src/template.html` | Add CDN `<script>` tags for turndown + TipTap module |
| `src/editor.js` | Toolbar HTML in `renderEditor()`, remove `cardFontControls()` calls, replace section textarea with TipTap div, add lifecycle functions, toolbar handlers |
| `src/css/tomoe.css` | Toolbar styles, TipTap editor styles, idle/active states |

`build.js` — **no change**.

---

## Task 1: Add CDN scripts to template.html

**Files:**
- Modify: `src/template.html` lines 13–14

- [ ] **Step 1: Add turndown + TipTap script tags**

In `src/template.html`, after line 13 (`jspdf` script tag), insert:

```html
    <script src="https://unpkg.com/turndown/dist/turndown.js"></script>
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

- [ ] **Step 2: Build and verify**

```bash
node build.js
```

Open `index.html` in browser. Open DevTools console, wait ~2s, run:
```js
window.tiptapReady  // should be: true
window.TipTapEditor // should be: function
window._turndownService  // undefined for now (initialized later)
```

- [ ] **Step 3: Commit**

```bash
git add src/template.html
git commit -m "Load TipTap and turndown from CDN (Sonnet 4.6)"
```

---

## Task 2: Toolbar HTML + CSS (no TipTap yet — toolbar renders, buttons do nothing)

**Files:**
- Modify: `src/editor.js` — `renderEditor()` function (lines 88–209)
- Modify: `src/css/tomoe.css` — add toolbar styles

### 2a: Remove full cardFontControls() calls, replace with size-only inputs in toolbar

In `src/editor.js`, make these changes to `renderEditor()`:

- [ ] **Step 1: Remove titleFont controls (lines 152–154)**

Find:
```js
      <div style="margin-top:6px">
        ${cardFontControls("titleFont")}
      </div>
```
Replace with: *(empty string — title size moves to toolbar)*

- [ ] **Step 2: Replace contentFont controls + add toolbar (lines 171–173)**

Find:
```js
      <div style="margin-bottom:8px;margin-top:6px">
        ${cardFontControls("contentFont")}
      </div>
```

Replace with:

```js
      <div id="editor-toolbar" class="editor-toolbar${isImgPairedLayout ? ' editor-toolbar--hidden' : ''}">
        <div class="editor-toolbar-font">
          <label class="editor-toolbar-label">Title</label>
          <input type="number" class="editor-toolbar-size" min="6" max="72" step="1"
            value="${(card.titleFont || {}).size || ''}"
            placeholder="${state.settings.titleFont?.size || state.settings.font?.size || 16}"
            oninput="setCardFontProp('titleFont','size',this.value===''?null:+this.value)">
          <label class="editor-toolbar-label">Content</label>
          <input type="number" class="editor-toolbar-size" min="6" max="72" step="1"
            value="${(card.contentFont || {}).size || ''}"
            placeholder="${state.settings.contentFont?.size || state.settings.font?.size || 14}"
            oninput="setCardFontProp('contentFont','size',this.value===''?null:+this.value)">
        </div>
        <div class="editor-toolbar-divider"></div>
        <div class="editor-toolbar-format" id="editor-toolbar-format">
          <button class="editor-toolbar-btn" data-cmd="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
          <button class="editor-toolbar-btn" data-cmd="italic" title="Italic (Ctrl+I)"><em>I</em></button>
          <button class="editor-toolbar-btn" data-cmd="h1" title="Heading 1">H1</button>
          <button class="editor-toolbar-btn" data-cmd="h2" title="Heading 2">H2</button>
          <button class="editor-toolbar-btn" data-cmd="bulletList" title="Bullet list">•</button>
          <button class="editor-toolbar-btn" data-cmd="orderedList" title="Numbered list">1.</button>
        </div>
      </div>
```

### 2b: Add CSS to tomoe.css

- [ ] **Step 3: Add toolbar styles to `src/css/tomoe.css`**

Append to the end of `src/css/tomoe.css`:

```css
/* ── Editor toolbar ───────────────────────────────────────────── */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.editor-toolbar--hidden { display: none; }

.editor-toolbar-label {
  font-size: 10px;
  color: #6b7280;
  white-space: nowrap;
}
.editor-toolbar-size {
  width: 44px;
  font-size: 11px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 2px 4px;
  text-align: center;
}
.editor-toolbar-divider {
  width: 1px;
  height: 18px;
  background: #d1d5db;
  margin: 0 4px;
  flex-shrink: 0;
}
.editor-toolbar-format {
  display: flex;
  gap: 2px;
  opacity: 0.4;
  pointer-events: none;
  transition: opacity 0.15s;
}
.editor-toolbar-format.active {
  opacity: 1;
  pointer-events: auto;
}
.editor-toolbar-btn {
  padding: 2px 6px;
  min-width: 26px;
  height: 24px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
  transition: background 0.1s;
}
.editor-toolbar-btn:hover { background: #f3f4f6; }
.editor-toolbar-btn.active {
  background: #e0f2f1;
  border-color: #60b0a0;
  color: #1f7060;
}

/* ── TipTap editor (replaces textarea) ──────────────────────────── */
.section-tiptap-editor {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 8px;
  min-height: 80px;
  background: #fff;
  font-size: 13px;
  line-height: 1.5;
  cursor: text;
  outline: none;
}
.section-tiptap-editor:focus-within {
  border-color: #60b0a0;
  box-shadow: 0 0 0 2px rgba(96,176,160,0.15);
}
.section-tiptap-editor .ProseMirror {
  outline: none;
  min-height: 68px;
}
.section-tiptap-editor .ProseMirror p { margin: 0 0 4px; }
.section-tiptap-editor .ProseMirror ul,
.section-tiptap-editor .ProseMirror ol { padding-left: 18px; margin: 4px 0; }
.section-tiptap-editor .ProseMirror h1 { font-size: 1.2em; margin: 4px 0; }
.section-tiptap-editor .ProseMirror h2 { font-size: 1.05em; margin: 4px 0; }
.section-tiptap-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: #9ca3af;
  pointer-events: none;
  float: left;
  height: 0;
}
```

- [ ] **Step 4: Build and verify toolbar renders**

```bash
node build.js
```

Open `index.html`, select a card. Verify:
- Toolbar bar appears above sections list
- Title and Content size inputs show (with placeholder = global size)
- B/I/H1/H2/•/1. buttons visible but dimmed (opacity ~0.4)
- Toolbar hidden for `2img-2txt` and `8img-8txt` layouts

- [ ] **Step 5: Commit**

```bash
git add src/editor.js src/css/tomoe.css
git commit -m "Add editor toolbar with font-size inputs and formatting buttons (Sonnet 4.6)"
```

---

## Task 3: TipTap lifecycle — replace textarea with TipTap editors

**Files:**
- Modify: `src/editor.js`

### 3a: Add globals and turndown init

- [ ] **Step 1: Add module-level globals at the TOP of `src/editor.js` (before line 1)**

```js
let _tiptapInstances = {}; // sectionId → TipTap Editor instance
let _activeEditor = null;  // currently focused TipTap instance
let _turndownService = null;

function _ensureTurndown() {
  if (!_turndownService && window.TurndownService) {
    _turndownService = new window.TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  }
}
```

### 3b: Modify section rendering to use TipTap divs

- [ ] **Step 2: Replace regular section textarea (editor.js line 82)**

**Important:** There are TWO textarea elements in the sections map — one in the `isImgPairedLayout` branch (line 72, inside the `if (isImgPairedLayout)` block) and one in the normal branch (line 82, inside the `return` at the bottom of the map). **Only replace the normal branch textarea (line 82).** Leave the paired layout textarea (line 72) untouched.

Find the non-paired `return` block (starts ~line 76 — the one NOT inside `if (isImgPairedLayout)`):
```js
      return `
          <div class="section-row" id="section-${s.id}">
            <div class="section-row-header">
              ...
            </div>
            <textarea class="section-content-input" rows="${sectionRows}" placeholder="${t('editor.contentPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','content',this.value)">${esc(s.content)}</textarea>
          </div>`;
```

Replace only the `<textarea ...>` line with:
```js
            ${window.tiptapReady === true
              ? `<div class="section-tiptap-editor" id="tiptap-${s.id}" data-section-id="${s.id}"></div>`
              : `<textarea class="section-content-input" rows="${sectionRows}" placeholder="${t('editor.contentPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','content',this.value)">${esc(s.content)}</textarea>`
            }
```

### 3c: Destroy before re-render, init after re-render

- [ ] **Step 3: Add destroy call at the TOP of `renderEditor()`, immediately after the early-return guard block**

The guard block ends at line 12 (`content.style.display = ""`). Insert right after that line, before `const slotCount = ...` (line 14):

```js
  _destroyTipTapInstances();
```

- [ ] **Step 4: Add init call at the END of `renderEditor()` (after line 213 `attachSlotDragHandlers()`)**

```js
  if (window.tiptapReady === true) _initTipTapInstances(card);
```

### 3d: Implement destroy and init functions

- [ ] **Step 5: Add `_destroyTipTapInstances` and `_initTipTapInstances` functions to `src/editor.js`**

Add after the `renderEditor()` function (after line 214):

```js
function _destroyTipTapInstances() {
  Object.values(_tiptapInstances).forEach(ed => { try { ed.destroy(); } catch (e) {} });
  _tiptapInstances = {};
  _activeEditor = null;
}

function _initTipTapInstances(card) {
  _ensureTurndown();
  const isImgPairedLayout = ["2img-2txt", "3img-3txt", "8img-8txt"].includes(card.layout);
  if (isImgPairedLayout) return; // paired layouts keep plain textarea

  card.sections.forEach((s) => {
    const el = document.getElementById('tiptap-' + s.id);
    if (!el || _tiptapInstances[s.id]) return;

    const editor = new window.TipTapEditor({
      element: el,
      extensions: [window.TipTapStarterKit],
      content: mdParse(s.content || ''), // marked.parse() — already a global helper
      editorProps: {
        attributes: {
          'data-placeholder': t('editor.contentPh') || 'Write something...',
        },
      },
    });

    editor.on('update', () => {
      if (!_turndownService) return;
      s.content = _turndownService.turndown(editor.getHTML());
      setDirty();
    });

    editor.on('focus', () => {
      _activeEditor = editor;
      const fmt = document.getElementById('editor-toolbar-format');
      if (fmt) fmt.classList.add('active');
    });

    editor.on('blur', () => {
      pushUndo(); // capture app-level undo snapshot on each section blur
      // delay so toolbar click doesn't trigger blur→deactivate before click fires
      setTimeout(() => {
        const anyFocused = Object.values(_tiptapInstances).some(ed => ed.isFocused);
        if (!anyFocused) {
          _activeEditor = null;
          const fmt = document.getElementById('editor-toolbar-format');
          if (fmt) fmt.classList.remove('active');
        }
      }, 150);
    });

    editor.on('selectionUpdate', () => _updateToolbarState());
    editor.on('transaction', () => _updateToolbarState());

    // Paste from Word handler
    el.addEventListener('paste', (e) => {
      const html = e.clipboardData?.getData('text/html');
      if (!html || !html.includes('mso-')) return;
      e.preventDefault();
      editor.commands.insertContent(_cleanWordHtml(html));
    });

    _tiptapInstances[s.id] = editor;
  });
}
```

### 3e: Listen for tiptap-ready to re-render

- [ ] **Step 6: Add `tiptap-ready` listener in `src/editor.js`** (add after `_initTipTapInstances` function)

```js
document.addEventListener('tiptap-ready', () => {
  // If an editor is already visible, re-render to upgrade textareas → TipTap
  if (getActiveCard()) renderEditor();
});
```

- [ ] **Step 7: Build and verify**

```bash
node build.js
```

Open `index.html`, select a card (non-paired layout like `1full` or `fulltext`). Wait ~2s for TipTap to load. Verify:
- Section textareas replaced with TipTap contenteditable divs
- Can type in the section editors
- Content saved on typing (check DevTools — `state.cards[0].sections[0].content` should be markdown)
- Preview updates when typing
- Switching cards → previous TipTap instances destroyed, new ones created

- [ ] **Step 8: Commit**

```bash
git add src/editor.js
git commit -m "Replace section textareas with TipTap WYSIWYG editors (Sonnet 4.6)"
```

---

## Task 4: Wire toolbar formatting buttons + active state

**Files:**
- Modify: `src/editor.js`

- [ ] **Step 1: Add `_cleanWordHtml` and `_updateToolbarState` helpers to `src/editor.js`**

Add after `_initTipTapInstances`:

```js
function _cleanWordHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  // Remove Word-specific elements
  div.querySelectorAll('o\\:p, w\\:sdt, w\\:sdtContent').forEach(el => el.remove());
  // Strip all elements to just their text/children for span tags with mso styles
  div.querySelectorAll('[style]').forEach(el => {
    if (el.style.cssText.includes('mso-') || el.tagName === 'SPAN') {
      el.removeAttribute('style');
    }
  });
  div.querySelectorAll('[class]').forEach(el => {
    if (/^(Mso|mso)/i.test(el.className)) el.removeAttribute('class');
  });
  return div.innerHTML;
}

function _updateToolbarState() {
  if (!_activeEditor) return;
  const btns = document.querySelectorAll('.editor-toolbar-btn[data-cmd]');
  btns.forEach(btn => {
    const cmd = btn.dataset.cmd;
    let active = false;
    if (cmd === 'bold') active = _activeEditor.isActive('bold');
    else if (cmd === 'italic') active = _activeEditor.isActive('italic');
    else if (cmd === 'h1') active = _activeEditor.isActive('heading', { level: 1 });
    else if (cmd === 'h2') active = _activeEditor.isActive('heading', { level: 2 });
    else if (cmd === 'bulletList') active = _activeEditor.isActive('bulletList');
    else if (cmd === 'orderedList') active = _activeEditor.isActive('orderedList');
    btn.classList.toggle('active', active);
  });
}
```

- [ ] **Step 2: Add toolbar button click handler**

Add after `_updateToolbarState`:

```js
function editorToolbarCmd(cmd) {
  if (!_activeEditor) return;
  switch (cmd) {
    case 'bold':        _activeEditor.chain().focus().toggleBold().run(); break;
    case 'italic':      _activeEditor.chain().focus().toggleItalic().run(); break;
    case 'h1':          _activeEditor.chain().focus().toggleHeading({ level: 1 }).run(); break;
    case 'h2':          _activeEditor.chain().focus().toggleHeading({ level: 2 }).run(); break;
    case 'bulletList':  _activeEditor.chain().focus().toggleBulletList().run(); break;
    case 'orderedList': _activeEditor.chain().focus().toggleOrderedList().run(); break;
  }
  _updateToolbarState();
}
```

- [ ] **Step 3: Wire buttons in toolbar HTML (in `renderEditor()` — this is an UPDATE to the HTML written in Task 2 Step 2, not a new insertion)**

Go back to the toolbar HTML added in Task 2 Step 2. Replace the 6 button lines (which currently have no `onclick`) with:

```js
          <button class="editor-toolbar-btn" data-cmd="bold" onclick="editorToolbarCmd('bold')" title="Bold (Ctrl+B)"><strong>B</strong></button>
          <button class="editor-toolbar-btn" data-cmd="italic" onclick="editorToolbarCmd('italic')" title="Italic (Ctrl+I)"><em>I</em></button>
          <button class="editor-toolbar-btn" data-cmd="h1" onclick="editorToolbarCmd('h1')" title="Heading 1">H1</button>
          <button class="editor-toolbar-btn" data-cmd="h2" onclick="editorToolbarCmd('h2')" title="Heading 2">H2</button>
          <button class="editor-toolbar-btn" data-cmd="bulletList" onclick="editorToolbarCmd('bulletList')" title="Bullet list">•</button>
          <button class="editor-toolbar-btn" data-cmd="orderedList" onclick="editorToolbarCmd('orderedList')" title="Numbered list">1.</button>
```

- [ ] **Step 4: Build and verify**

```bash
node build.js
```

Open `index.html`, select a card, click into a section. Verify:
- Toolbar format buttons activate (full opacity) on section focus
- Toolbar dims on blur (click outside)
- Click **B** → selected text becomes bold; button highlights
- Click **I** → italic; button highlights
- Click **H1** → heading applied
- Click **•** → bullet list
- Cursor in bold text → B button is highlighted; cursor in plain text → B not highlighted

- [ ] **Step 5: Commit**

```bash
git add src/editor.js
git commit -m "Wire toolbar formatting buttons with active state (Sonnet 4.6)"
```

---

## Task 5: Final integration, paste test, and edge cases

**Files:**
- Modify: `src/editor.js`

- [ ] **Step 1: Verify paste from Word works**

Copy text from Word (with bold/italic), paste into a section. Verify:
- Bold/italic preserved
- No `mso-*` junk in preview
- `s.content` stores clean markdown (check DevTools)

- [ ] **Step 2: Verify card switch lifecycle**

Click card 1, type something → switch to card 2 → switch back to card 1. Verify:
- Content preserved on card 1
- No duplicate TipTap instances (check `Object.keys(_tiptapInstances)` in console)

- [ ] **Step 3: Verify paired layout fallback**

Select a card with `2img-2txt` or `8img-8txt` layout. Verify:
- Toolbar hidden
- Section rows still use plain `<textarea>` (not TipTap)
- Typing still saves correctly

- [ ] **Step 4: Verify font-size inputs**

In the toolbar, change Title size to `20`. Verify preview updates. Change back to empty → preview uses global size.

- [ ] **Step 5: Verify fallback (optional — simulate CDN failure)**

Open DevTools → Network tab → right-click on an `esm.sh` request → "Block request domain". Reload page. Verify plain textareas render and the toolbar formatting group is still dimmed/non-functional. Then unblock and reload to restore.

Note: setting `window.tiptapReady = false` in console before reload won't work — it gets wiped on reload.

- [ ] **Step 6: Build final**

```bash
node build.js
```

- [ ] **Step 7: Commit**

```bash
git add src/editor.js
git commit -m "Editor toolbar complete — TipTap WYSIWYG + font-size controls (Sonnet 4.6)"
```
