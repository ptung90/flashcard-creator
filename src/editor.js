// ── Editor ─────────────────────────────────────────────────────────

let _tiptapInstances = {}; // sectionId → TipTap Editor instance
let _activeEditor = null;  // currently focused TipTap instance
let _turndownService = null;

function _ensureTurndown() {
  if (!_turndownService && window.TurndownService) {
    _turndownService = new window.TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  }
}

function _cleanWordHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('o\\:p, w\\:sdt, w\\:sdtContent').forEach(el => el.remove());
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
    if (cmd === 'bold')        active = _activeEditor.isActive('bold');
    else if (cmd === 'italic') active = _activeEditor.isActive('italic');
    else if (cmd === 'h1')     active = _activeEditor.isActive('heading', { level: 1 });
    else if (cmd === 'h2')     active = _activeEditor.isActive('heading', { level: 2 });
    else if (cmd === 'bulletList')   active = _activeEditor.isActive('bulletList');
    else if (cmd === 'orderedList')  active = _activeEditor.isActive('orderedList');
    btn.classList.toggle('active', active);
  });
}

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

function renderEditor() {
  const card = getActiveCard();
  const empty = document.getElementById("editor-empty");
  const content = document.getElementById("editor-content");
  if (!card) {
    empty.style.display = "";
    content.style.display = "none";
    return;
  }
  empty.style.display = "none";
  content.style.display = "";
  _destroyTipTapInstances();

  const slotCount = LAYOUT_SLOTS[card.layout] ?? 3;
  const slotRow = (i, hidden) => {
    const img = card.images.find((im) => im.slot === i);
    const url = img ? img.url : "";
    const hasOverride = img != null && img.size != null;
    const sizeOpts = [["cover", "Cover"], ["contain", "Contain"], ["100% auto", "Fit width"], ["auto 100%", "Fit height"]];
    const overrideHtml = url && !hidden ? `<div class="img-override-row">
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap">
          <input type="checkbox" ${hasOverride ? "checked" : ""} onchange="toggleImgOverride(${i},this.checked)">${t('editor.custom')}</label>
        ${hasOverride ? `<select class="img-override-select" onchange="updateImgProp(${i},'size',this.value)">${sizeOpts.map(([v, l]) => `<option value="${v}"${img.size === v ? " selected" : ""}>${l}</option>`).join("")
        }</select>` : ""}
        ${hasOverride && img.size !== "cover" ? `<input type="color" value="${img.color || "#e5e7e4"}" onchange="updateImgProp(${i},'color',this.value)" title="${t('editor.bgColor')}" style="width:26px;height:22px;padding:0;border:1px solid #d1d5d2;border-radius:3px;cursor:pointer">` : ""}
      </div>` : "";
    return `
      <div class="image-slot-row${hidden ? " slot-hidden" : ""}" draggable="true" data-slot="${i}">
        <div class="image-slot-drag-handle" title="${t('editor.dragHandle')}">⠿</div>
        <div class="image-slot-thumb">
          ${url ? `<img src="${esc(url)}" onerror="this.style.display='none'">` : ""}
        </div>
        <div class="image-slot-info">
          <div class="image-slot-url">${url ? esc(url) : t('editor.noImage')}</div>
          ${hidden ? `<div style="font-size:10px;color:#9aa19e;margin-top:2px">${t('editor.hiddenSlot').replace('{n}', i)}</div>` : ""}
        </div>
        <div class="image-slot-btns">
          ${!hidden ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="openImgModal(${i})" title="${t('editor.search')}"><svg class="icon" style="width:14px;height:14px"><use href="#i-search"/></svg></button>` : ""}
          ${url && !hidden ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="copySlot(${i})" title="Copy image"><svg class="icon" style="width:14px;height:14px"><use href="#i-copy"/></svg></button>` : ""}
          ${!hidden ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="pasteToSlot(${i})" title="Paste image from clipboard (Ctrl+V)"><svg class="icon" style="width:14px;height:14px"><use href="#i-clipboard"/></svg></button>` : ""}
          ${url ? `<button class="btn btn-danger btn-sm btn-icon" onclick="clearSlot(${i})" title="Clear"><svg class="icon" style="width:14px;height:14px"><use href="#i-x"/></svg></button>` : ""}
        </div>
        ${overrideHtml}
      </div>`;
  };
  const activeSlots = Array.from({ length: slotCount }, (_, i) => slotRow(i, false)).join("");
  const hiddenImgs = card.images.filter((im) => im.slot >= slotCount);
  const hiddenSlots = hiddenImgs.map((im) => slotRow(im.slot, true)).join("");
  const slots = activeSlots + hiddenSlots;
  const isCompoundTextLayout = ["2img-2txt", "2img-4txt", "3img-3txt", "txtgrid", "8img-8txt"].includes(card.layout);
  const isImgPairedLayout = ["2img-2txt", "3img-3txt", "8img-8txt"].includes(card.layout);
  const sectionRows = card.layout === "fulltext" ? 6 : 4;

  const sections = card.sections
    .map((s, si) => {
      if (isImgPairedLayout) {
        const img = card.images.find((im) => im.slot === si);
        const thumb = img && img.url
          ? `<div style="width:100%;height:100%;background-image:url('${esc(img.url)}');background-size:cover;background-position:center;"></div>`
          : `<span style="font-size:16px">📷</span>`;

        const minSections = LAYOUT_SLOTS[card.layout] || 0;
        const disableDelete = card.sections.length <= minSections;
        return `
            <div class="section-row section-row--paired" id="section-${s.id}">
              <div class="pair-thumb" onclick="openImgModal(${si})" title="${t('editor.clickImg')}">${thumb}</div>
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
                <div class="section-row-header">
                  <input class="section-label-input" value="${esc(s.label)}" placeholder="${t('editor.labelPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','label',this.value)" style="${card.hideSectionLabels ? 'background:#f1f2ef;color:#9aa19e' : ''}">
                  <button class="icon-btn section-more-btn" onclick="event.stopPropagation();openSectionMenu('${s.id}',this)" title="More"><svg class="icon" style="width:14px;height:14px"><use href="#i-more"/></svg></button>
                </div>
                <textarea class="section-content-input" rows="4" placeholder="${t('editor.pairedPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','content',this.value)">${esc(s.content)}</textarea>
              </div>
            </div>`;
      }
      return `
          <div class="section-row" id="section-${s.id}">
            <div class="section-row-header">
              <input class="section-label-input" value="${esc(s.label)}" placeholder="${t('editor.labelPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','label',this.value)" style="${card.hideSectionLabels ? 'background:#f1f2ef;color:#9aa19e' : ''}">
              <button class="icon-btn section-more-btn" onclick="event.stopPropagation();openSectionMenu('${s.id}',this)" title="More"><svg class="icon" style="width:14px;height:14px"><use href="#i-more"/></svg></button>
            </div>
            ${window.tiptapReady === true
              ? `<div class="section-tiptap-editor" id="tiptap-${s.id}" data-section-id="${s.id}"></div>`
              : `<textarea class="section-content-input" rows="${sectionRows}" placeholder="${t('editor.contentPh')}" onfocus="pushUndo()" oninput="updateSection('${s.id}','content',this.value)">${esc(s.content)}</textarea>`
            }
          </div>`;
    })
    .join("");

  const _ltab = LAYOUTS.indexOf(card.layout) >= 9 ? 1 : 0;
  content.innerHTML = `
    <div class="editor-section">
      <h3>${t('editor.layout')}</h3>
      <div class="layout-tabs">
        <button class="layout-tab ${_ltab === 0 ? 'active' : ''}" onclick="switchLayoutTab(0,this)">Basic</button>
        <button class="layout-tab ${_ltab === 1 ? 'active' : ''}" onclick="switchLayoutTab(1,this)">Special</button>
      </div>
      <div id="layout-tab-0" class="layout-grid" style="${_ltab !== 0 ? 'display:none' : ''}">${LAYOUTS.slice(0, 9).map((l) => layoutIcon(l, l === card.layout)).join("")}</div>
      <div id="layout-tab-1" class="layout-grid" style="${_ltab !== 1 ? 'display:none' : ''}">${LAYOUTS.slice(9).map((l) => layoutIcon(l, l === card.layout)).join("")}</div>
    </div>

    <div class="editor-section">
      <h3>${t('editor.orientation')}</h3>
      ${cardOrientationControls()}
    </div>

    ${card.layout === 'txtgrid' ? `
    <div class="editor-section">
      <h3>Grid</h3>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="font-size:11px;color:#6b7672">Cols</label>
        <input type="number" min="1" max="10" value="${card.textCols ?? 3}"
          style="width:58px;${FIS}" oninput="setTextCols(+this.value)" onchange="renderEditor()">
        <label style="font-size:11px;color:#6b7672">Rows</label>
        <input type="number" min="1" max="10" value="${card.textRows ?? 1}"
          style="width:58px;${FIS}" oninput="setTextRows(+this.value)" onchange="renderEditor()">
        <label style="font-size:11px;color:#6b7672">Height</label>
        <input type="number" min="20" max="500" value="${card.textCardHeight ?? ''}" placeholder="auto"
          style="width:72px;${FIS}"
          oninput="updateCardProp('textCardHeight',this.value===''?null:+this.value)">
        <span style="font-size:11px;color:#9aa19e">px</span>
      </div>
    </div>` : ''}

    ${card.layout !== 'fullimage' &&
      card.layout !== 'fulltext' &&
      card.layout !== '2img-4txt' &&
      card.layout !== 'txtgrid' ? `
    <div class="editor-section">
      <h3>${t('editor.imgHeight')}</h3>
      <div class="height-slider-row">
        <input type="range" min="20" max="90" value="${card.imageHeightPercent}"
          oninput="updateCardProp('imageHeightPercent',+this.value);this.nextElementSibling.textContent=this.value+'%'">
        <span class="height-val">${card.imageHeightPercent}%</span>
      </div>
    </div>` : ''}

    ${card.layout !== 'txtgrid' ? `
    <div class="editor-section">
      <h3>${t('editor.images')} (${slotCount} ${t('editor.slots')})</h3>
      <div class="image-slots">${slots}</div>
    </div>` : ''}

    <div class="editor-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <h3 style="margin:0">${t('editor.title')}</h3>
        <label style="font-size:12px;color:#1f2a28;display:flex;align-items:center;gap:6px">
          <input type="checkbox" ${card.hideTitle ? "checked" : ""} onchange="updateCardProp('hideTitle',this.checked)">
          ${t('editor.hideTitle')}
        </label>
      </div>
      <input class="title-input" type="text" value="${esc(card.title)}" placeholder="${t('editor.titlePh')}"
        onfocus="pushUndo()" oninput="updateCardProp('title',this.value)"
        style="${card.hideTitle ? 'background:#f1f2ef;color:#9aa19e' : ''}">
    </div>

    <div class="editor-section">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:0">
        <h3 style="margin:0">${t('editor.sections')}</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <label style="font-size:12px;color:#1f2a28;display:flex;align-items:center;gap:6px">
            <input type="checkbox" ${card.hideSectionLabels ? "checked" : ""} onchange="updateCardProp('hideSectionLabels',this.checked)">
            ${t('editor.hideLabels')}
          </label>
          <label style="font-size:12px;color:#1f2a28;display:flex;align-items:center;gap:6px">
            <input type="checkbox" ${card.listIndent ? "checked" : ""} onchange="updateCardProp('listIndent',this.checked)">
            ${t('editor.listIndent')}
          </label>
        </div>
      </div>
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
          <button class="editor-toolbar-btn" data-cmd="bold" onclick="editorToolbarCmd('bold')" title="Bold (Ctrl+B)"><strong>B</strong></button>
          <button class="editor-toolbar-btn" data-cmd="italic" onclick="editorToolbarCmd('italic')" title="Italic (Ctrl+I)"><em>I</em></button>
          <button class="editor-toolbar-btn" data-cmd="h1" onclick="editorToolbarCmd('h1')" title="Heading 1">H1</button>
          <button class="editor-toolbar-btn" data-cmd="h2" onclick="editorToolbarCmd('h2')" title="Heading 2">H2</button>
          <button class="editor-toolbar-btn" data-cmd="bulletList" onclick="editorToolbarCmd('bulletList')" title="Bullet list">•</button>
          <button class="editor-toolbar-btn" data-cmd="orderedList" onclick="editorToolbarCmd('orderedList')" title="Numbered list">1.</button>
        </div>
      </div>
      <div class="sections-list${isCompoundTextLayout && card.layout !== 'txtgrid' ? ' sections-list--2col' : ''}"
        ${card.layout === 'txtgrid' ? `style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:8px;align-items:start"` : ''}
        id="sections-list">
        ${sections || `<div style="color:#555;font-size:12px;padding:8px 0">${t('editor.noSections')}</div>`}
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap">
        ${!isImgPairedLayout ? `<button class="btn btn-secondary btn-sm" onclick="addSection()"><svg class="icon" style="width:14px;height:14px"><use href="#i-plus"/></svg><span>${t('editor.addSection')}</span></button>` : ''}
        ${!isImgPairedLayout ? `<button class="btn btn-secondary btn-sm" onclick="togglePasteBlock()"><svg class="icon" style="width:14px;height:14px"><use href="#i-clipboard"/></svg><span>${t('editor.pasteBlock')}</span></button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="toggleCardCssEditor()" id="card-css-btn"><svg class="icon" style="width:14px;height:14px"><use href="#i-braces"/></svg><span>${t('editor.css')}</span>${card.customCss ? '<span class="card-css-on">●</span>' : ''}</button>
        <button class="btn btn-secondary btn-sm" onclick="toggleDataArea()">${t('editor.data')}</button>
      </div>
      <div id="card-css-area" style="display:${card.customCss ? '' : 'none'};margin-top:8px">
        <div style="font-size:10px;color:#9aa19e;margin-bottom:4px">${t('editor.cssHint')}</div>
        <textarea id="card-css-input" class="section-content-input" rows="5"
          placeholder=".fc-title { font-size: 20px; color: #3e9684; }&#10;.fc-section__content { line-height: 1.8; }"
          oninput="updateCardCss(this.value)">${esc(card.customCss || '')}</textarea>
      </div>
      <div id="paste-block-area" style="display:none;margin-top:8px">
        <textarea id="paste-block-input" class="section-content-input" rows="6"
          placeholder="${t('editor.pasteBlockPh').replace(/\n/g, '&#10;')}"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-primary btn-sm" onclick="parsePasteBlock('replace')">${t('editor.replaceSection')}</button>
          <button class="btn btn-secondary btn-sm" onclick="parsePasteBlock('append')">${t('editor.append')}</button>
          <button class="btn btn-danger btn-sm" onclick="togglePasteBlock()">${t('editor.cancel')}</button>
        </div>
      </div>
      <div id="data-area" style="display:none;margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <label style="font-size:11px;color:#6b7672;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${t('editor.cardData')}</label>
          <div id="data-area-btns" style="display:flex;gap:4px;">
            <button class="btn btn-secondary btn-sm" onclick="editCardData()">${t('editor.edit')}</button>
          </div>
        </div>
        <textarea id="data-area-content" class="section-content-input" style="margin-top:6px;white-space:nowrap;overflow-x:auto;" wrap="off" rows="15" readonly></textarea>
      </div>
    </div>`;
  attachSlotDragHandlers();
  if (window.tiptapReady === true) _initTipTapInstances(card);
  // apply initial paste-block visibility from config
  const pba = document.getElementById("paste-block-area");
  if (pba) pba.style.display = (window.FC_CONFIG || {}).pasteBlock ? "" : "none";
}

function _destroyTipTapInstances() {
  Object.values(_tiptapInstances).forEach(ed => { try { ed.destroy(); } catch (e) {} });
  _tiptapInstances = {};
  _activeEditor = null;
}

function _initTipTapInstances(card) {
  _ensureTurndown();
  const isImgPairedLayout = ["2img-2txt", "3img-3txt", "8img-8txt"].includes(card.layout);
  if (isImgPairedLayout) return;

  card.sections.forEach((s) => {
    const el = document.getElementById('tiptap-' + s.id);
    if (!el || _tiptapInstances[s.id]) return;

    const editor = new window.TipTapEditor({
      element: el,
      extensions: [window.TipTapStarterKit],
      content: mdParse(s.content || ''),
      editorProps: {
        attributes: {
          'data-placeholder': t('editor.contentPh') || 'Write something...',
        },
      },
    });

    editor.on('update', () => {
      if (!_turndownService) {
        console.warn('[TipTap] turndown not ready — content change dropped');
        return;
      }
      s.content = _turndownService.turndown(editor.getHTML());
      dispatch('CARD_CONTENT_CHANGED');
    });

    editor.on('focus', () => {
      _activeEditor = editor;
      const fmt = document.getElementById('editor-toolbar-format');
      if (fmt) fmt.classList.add('active');
    });

    editor.on('blur', () => {
      pushUndo();
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

    el.addEventListener('paste', (e) => {
      const html = e.clipboardData?.getData('text/html');
      if (!html || !html.includes('mso-')) return;
      e.preventDefault();
      editor.commands.insertContent(_cleanWordHtml(html));
    });

    _tiptapInstances[s.id] = editor;
  });
}

document.addEventListener('tiptap-ready', () => {
  if (getActiveCard()) renderEditor();
});

function layoutIcon(layout, selected) {
  const icons = {
    "2top-1bot": `
          <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,

    "1top-2bot": `
          <div class="lo-row" style="flex:1">
      <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,

    "1big-2small": `
          <div class="lo-row" style="flex:2">
        <div class="lo-block" style="flex:2"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:2px">
          <div class="lo-block" style="flex:1"></div>
          <div class="lo-block" style="flex:1"></div>
        </div>
          </div>
          <div class="lo-text"></div>
  `,

    "2x2": `
          <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,

    "1full": `
          <div class="lo-row" style="flex:2">
            <div class="lo-block"></div>
          </div>
          <div class="lo-text"></div>
  `,

    "1left-2right": `
          <div class="lo-row" style="flex:2">
        <div class="lo-block" style="flex:1"></div>
        <div style="flex:2;display:flex;flex-direction:column;gap:2px">
          <div class="lo-block" style="flex:1"></div>
          <div class="lo-block" style="flex:1"></div>
        </div>
          </div>
          <div class="lo-text"></div>
  `,

    "1left-3right": `
          <div class="lo-row" style="flex:2">
        <div class="lo-block" style="flex:1"></div>
        <div style="flex:2;display:flex;flex-direction:column;gap:2px">
          <div class="lo-block" style="flex:1"></div>
          <div class="lo-block" style="flex:1"></div>
          <div class="lo-block" style="flex:1"></div>
        </div>
          </div>
          <div class="lo-text"></div>
  `,

    "1top-3bot": `
          <div class="lo-row" style="flex:2">
      <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
        <div class="lo-block"></div>
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,

    // thêm mới
    "1top-1bot": `
          <div class="lo-row" style="flex:1">
      <div class="lo-block"></div>
          </div>
      <div class="lo-row" style="flex:1">
        <div class="lo-block"></div>
      </div>
      <div class="lo-text"></div>
  `,
    "fullimage": `
          <div class="lo-row" style="flex:2">
      <div class="lo-block"></div>
          </div>
    `,

    "fulltext": `
          <div class="lo-text" style="flex:1;height:100%"></div>
      `,

    "2img-2txt": `
          <div class="lo-row" style="flex:2">
            <div class="lo-block"></div>
            <div class="lo-block"></div>
          </div>

          <div class="lo-row" style="flex:1;align-items:stretch">
            <div class="lo-text" style="height:auto"></div>
            <div class="lo-text" style="height:auto"></div>
          </div>
  `,

    "3img-3txt": `
          <div class="lo-row" style="flex:2">
            <div class="lo-block"></div>
            <div class="lo-block"></div>
            <div class="lo-block"></div>
          </div>
          <div class="lo-row" style="flex:1;align-items:stretch">
            <div class="lo-text" style="height:auto"></div>
            <div class="lo-text" style="height:auto"></div>
            <div class="lo-text" style="height:auto"></div>
          </div>
        `,

    "txtgrid": `
          <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:2px">
            <div class="lo-text"></div><div class="lo-text"></div><div class="lo-text"></div>
            <div class="lo-text"></div><div class="lo-text"></div><div class="lo-text"></div>
          </div>
        `,

    "2img-4txt": `
          <div class="lo-row" style="flex:1">
            <div class="lo-block"></div>
            <div class="lo-block"></div>
          </div>

          <div class="lo-row" style="flex:1">
            <div class="lo-text"></div>
            <div class="lo-text"></div>
          </div>

          <div class="lo-row" style="flex:1">
            <div class="lo-text"></div>
            <div class="lo-text"></div>
          </div>
  `,

    "8img-8txt": (() => {
      const pair = '<div style="display:flex;flex-direction:column;gap:1px"><div class="lo-block" style="flex:2"></div><div class="lo-text"></div></div>';
      return '<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:2px">' + pair.repeat(8) + '</div>';
    })(),
  };

  return `
        <div class="layout-opt ${selected ? "selected" : ""}" title="${layout}" onclick="setLayout('${layout}')">
          ${icons[layout]}
        </div>`;
}

function switchLayoutTab(idx, btn) {
  btn.parentElement.querySelectorAll('.layout-tab').forEach((b, i) => b.classList.toggle('active', i === idx));
  document.getElementById('layout-tab-0').style.display = idx === 0 ? '' : 'none';
  document.getElementById('layout-tab-1').style.display = idx === 1 ? '' : 'none';
}

function setLayout(layout) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.layout = layout;
  card.imageGridSplit = { ...LAYOUT_SPLIT_DEFAULTS[layout] };
  if (layout === "8img-8txt") {
    while (card.sections.length < 8) card.sections.push({ id: uid(), label: "", content: "" });
  } else if (layout === "3img-3txt") {
    while (card.sections.length < 3) card.sections.push({ id: uid(), label: "Section", content: "" });
  } else if (layout === "txtgrid") {
    if (!card.textCols) card.textCols = 3;
    if (!card.textRows) card.textRows = 1;
    const target = card.textRows * card.textCols;
    while (card.sections.length < target) card.sections.push({ id: uid(), label: "", content: "" });
  }
  setDirty();
  renderEditor();
  renderPreview();
  refreshAllThumbs();
  dispatch('LAYOUT_CHANGED');
}

function setTextRows(n) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.textRows = Math.max(1, n || 1);
  const target = card.textRows * (card.textCols || 3);
  while (card.sections.length < target) card.sections.push({ id: uid(), label: "", content: "" });
  setDirty();
  renderPreview();
}

function setTextCols(n) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.textCols = Math.max(1, n || 1);
  const target = (card.textRows || 1) * card.textCols;
  while (card.sections.length < target) card.sections.push({ id: uid(), label: "", content: "" });
  setDirty();
  renderPreview();
}

const FIS =
  "background:#fff;border:1px solid #d1d5d2;color:#1f2a28;border-radius:4px;padding:3px 5px;font-size:12px";

function cardOrientationControls() {
  const card = getActiveCard();
  if (!card) return "";
  const useCustom = !!card.orientation;
  const effective = card.orientation || state.settings.orientation;
  const btnCls = (val) => {
    const active = effective === val;
    return `btn btn-secondary btn-sm orient-btn${active ? " active" : ""}${useCustom ? "" : " disabled"}`;
  };
  return `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#374151;cursor:pointer">
        <input type="checkbox" ${useCustom ? "checked" : ""} onchange="toggleCardOrientation(this.checked)">
        ${t('editor.override')}
      </label>
      <div class="btn-group">
        <button class="${btnCls('portrait')}" onclick="setCardOrientation('portrait')">${t('orient.portrait')}</button>
        <button class="${btnCls('landscape')}" onclick="setCardOrientation('landscape')">${t('orient.landscape')}</button>
      </div>
      ${useCustom ? "" : `<span style="font-size:11px;color:#9aa19e">${t('editor.fromGlobal')}</span>`}
    </div>`;
}

const _FL = `font-size:11px;color:#6b7672`;

// Per-card font override controls (empty = inherit global)
function cardFontControls(key) {
  const card = getActiveCard();
  if (!card) return "";
  const override = card[key] || {};
  const global = state.settings[key] || {};
  const sizeVal = override.size ?? "";
  const lhVal = override.lineHeight ?? "";
  const hasColor = "color" in override;
  const weightOpts = [['0', '–'], ['300', 'Light'], ['400', 'Normal'], ['500', 'Medium'], ['600', 'SemiBold'], ['700', 'Bold'], ['900', 'Black']]
    .map(([v, l]) => `<option value="${v}" ${(!override.weight && v === '0') || override.weight == v ? 'selected' : ''}>${l}</option>`).join('');
  const alignBtns = [['left', '#i-align-left'], ['center', '#i-align-center'], ['right', '#i-align-right'], ['justify', '#i-align-justify']]
    .map(([a, ic]) => `<button class="align-btn${override.textAlign === a ? ' active' : ''}" onclick="setCardFontAlign('${key}','${a}')" title="${a}"><svg class="icon" style="width:13px;height:13px"><use href="${ic}"/></svg></button>`).join('');
  const _bg = (hasVal) => hasVal ? 'background:#fff;border-color:#60b0a0' : 'background:#f1f2ef';
  return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%">
    <label style="${_FL}">Size</label>
    <input type="number" min="8" max="72" value="${sizeVal}" placeholder="${global.size}"
      style="width:56px;${FIS};${_bg(sizeVal !== '')}" oninput="setCardFontProp('${key}','size',this.value===''?null:+this.value);this.style.background=this.value===''?'#f1f2ef':'#fff';this.style.borderColor=this.value===''?'#d1d5d2':'#60b0a0'">
    <span style="${_FL}">px</span>
    <label style="${_FL};display:flex;align-items:center;gap:4px">
      <input type="checkbox" ${hasColor ? 'checked' : ''} onchange="toggleCardFontColor('${key}',this.checked)"> Color
    </label>
    ${hasColor ? `<input type="color" value="${override.color || global.color}" style="width:28px;height:24px;border:none;border-radius:3px;cursor:pointer;padding:0" oninput="setCardFontProp('${key}','color',this.value)">` : ''}
    <label style="${_FL}">LH</label>
    <input type="number" min="1" max="3" step="0.1" value="${lhVal}" placeholder="${global.lineHeight}"
      style="width:56px;${FIS};${_bg(lhVal !== '')}" oninput="setCardFontProp('${key}','lineHeight',this.value===''?null:+this.value);this.style.background=this.value===''?'#f1f2ef':'#fff';this.style.borderColor=this.value===''?'#d1d5d2':'#60b0a0'">
    <label style="${_FL}">W</label>
    <select style="${FIS};width:auto;${_bg(!!override.weight)}" onchange="setCardFontProp('${key}','weight',this.value==='0'?null:+this.value);this.style.background=this.value==='0'?'#f1f2ef':'#fff';this.style.borderColor=this.value==='0'?'#d1d5d2':'#60b0a0'">${weightOpts}</select>
    <div class="align-btn-group">
      <button class="align-btn${'textAlign' in override ? '' : ' active'}" onclick="setCardFontAlign('${key}',null)" title="inherit">–</button>
      ${alignBtns}
    </div>
  </div>`;
}

function setCardFontAlign(key, val) {
  setCardFontProp(key, 'textAlign', val);
  const group = event?.target?.closest?.('.align-btn-group');
  if (group) {
    group.querySelectorAll('.align-btn').forEach(b =>
      b.classList.toggle('active', b.title === (val || 'inherit'))
    );
  }
}

function setCardFontProp(key, prop, val) {
  const card = getActiveCard();
  if (!card) return;
  if (val === null || val === undefined) {
    if (card[key]) {
      delete card[key][prop];
      if (!Object.keys(card[key]).length) card[key] = null;
    }
  } else {
    if (!card[key]) card[key] = {};
    card[key][prop] = val;
  }
  setDirty();
  renderPreview();
  dispatch('CARD_CONTENT_CHANGED');
}

function toggleCardFontColor(key, enabled) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  if (enabled) {
    if (!card[key]) card[key] = {};
    card[key].color = state.settings[key]?.color || "#1a1a1a";
  } else {
    if (card[key]) {
      delete card[key].color;
      if (!Object.keys(card[key]).length) card[key] = null;
    }
  }
  setDirty();
  renderPreview();
  renderEditor();
  dispatch('CARD_UI_CHANGED');
}

function toggleCardOrientation(enabled) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.orientation = enabled ? (card.orientation || state.settings.orientation) : null;
  setDirty();
  renderEditor();
  renderPreview();
  dispatch('CARD_UI_CHANGED');
}

function setCardOrientation(val) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.orientation = ["portrait", "landscape"].includes(val) ? val : null;
  setDirty();
  renderEditor();
  renderPreview();
  dispatch('CARD_UI_CHANGED');
}

function updateCardProp(prop, val) {
  const card = getActiveCard();
  if (!card) return;
  card[prop] = val;
  setDirty();
  if (prop === "title") renderSidebar();
  if (prop === "hideTitle" || prop === "hideSectionLabels") renderEditor();
  renderPreview();
  dispatch(prop === "title" ? "CARD_TITLE_CHANGED" : "CARD_CONTENT_CHANGED");
}


function toggleFontPanel() {
  const panel = document.getElementById("font-settings-panel");
  const btn = document.getElementById("btn-font-toggle");
  const open = panel.classList.toggle("open");
  btn.classList.toggle("open", open);
}

function _syncBdSwatch() {
  const swatch = document.getElementById("bd-swatch");
  const color = document.getElementById("set-bc")?.value;
  if (swatch && color) swatch.style.background = color;
}

function toggleBorderPanel() {
  const panel = document.getElementById("border-settings-panel");
  const btn = document.getElementById("btn-border-toggle");
  const open = panel.classList.toggle("open");
  btn.classList.toggle("open", open);
  const arrow = document.getElementById("bd-arrow");
  if (arrow) arrow.textContent = open ? "▴" : "▾";
}

function toggleImgPanel() {
  const panel = document.getElementById("img-settings-panel");
  const btn = document.getElementById("btn-img-toggle");
  const open = panel.classList.toggle("open");
  btn.classList.toggle("open", open);
}

function toggleImgOverride(slot, enabled) {
  const card = getActiveCard();
  if (!card) return;
  const img = card.images.find((im) => im.slot === slot);
  if (!img) return;
  if (enabled) {
    if (img.size == null) img.size = "cover";
  } else {
    img.size = null;
    img.color = null;
  }
  dispatch('CARD_UI_CHANGED');
}

function updateImgProp(slot, key, value) {
  const card = getActiveCard();
  if (!card) return;
  const img = card.images.find((im) => im.slot === slot);
  if (!img) return;
  img[key] = value;
  dispatch('CARD_UI_CHANGED');
}

function clearSlot(slot) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.images = card.images.filter((i) => i.slot !== slot);
  dispatch('CARD_UI_CHANGED');
}

// ── Sections ───────────────────────────────────────────────────────
function addSection() {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.sections.push({ id: uid(), label: "Section", content: "" });
  dispatch('CARD_UI_CHANGED');
}

function deleteSection(id) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  card.sections = card.sections.filter((s) => s.id !== id);
  dispatch('CARD_UI_CHANGED');
}

function moveSection(id, dir) {
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  const i = card.sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= card.sections.length) return;
  [card.sections[i], card.sections[j]] = [
    card.sections[j],
    card.sections[i],
  ];
  dispatch('CARD_UI_CHANGED');
}

function openSectionMenu(id, btn) {
  closeSectionMenu();
  const card = getActiveCard();
  const s = card?.sections?.find(sec => sec.id === id);
  const canPaste = !!_sectionClipboard;
  const canPasteWithImg = !!(_sectionClipboard?.image);
  const minSections = LAYOUT_SLOTS[card.layout] || 0;
  const canDelete = card.sections.length > minSections;
  const isPaired = card.layout === "2img-2txt" || card.layout === "8img-8txt";
  const menu = document.createElement('div');
  menu.id = 'section-menu';
  menu.className = 'section-menu';
  menu.innerHTML = `
    <button class="section-menu-item" onclick="moveSection('${id}',-1);closeSectionMenu()"><svg class="icon" style="width:13px;height:13px"><use href="#i-arrow-up"/></svg> Move up</button>
    <button class="section-menu-item" onclick="moveSection('${id}',1);closeSectionMenu()"><svg class="icon" style="width:13px;height:13px"><use href="#i-arrow-down"/></svg> Move down</button>
    <div class="section-menu-sep"></div>
    <button class="section-menu-item" onclick="copySection('${id}');closeSectionMenu()"><svg class="icon" style="width:13px;height:13px"><use href="#i-copy"/></svg> Copy${isPaired ? ' text only' : ''}</button>
    ${isPaired ? `<button class="section-menu-item" onclick="copySectionWithImage('${id}');closeSectionMenu()"><svg class="icon" style="width:13px;height:13px"><use href="#i-copy"/></svg> Copy with image</button>` : ''}
    <button class="section-menu-item${canPaste ? '' : ' disabled'}" onclick="pasteSection('${id}');closeSectionMenu()"><svg class="icon" style="width:13px;height:13px"><use href="#i-clipboard"/></svg> Paste${isPaired ? ' text only' : ''}</button>
    ${isPaired ? `<button class="section-menu-item${canPasteWithImg ? '' : ' disabled'}" onclick="pasteSectionWithImage('${id}');closeSectionMenu()"><svg class="icon" style="width:13px;height:13px"><use href="#i-clipboard"/></svg> Paste with image</button>` : ''}
    <div class="section-menu-sep"></div>
    <button class="section-menu-item" onclick="setSectionClass('${id}');closeSectionMenu()"><svg class="icon" style="width:13px;height:13px"><use href="#i-tag"/></svg> Class${s?.customClass ? `: <em style="color:#3e9684;font-size:10px;font-style:normal">${esc(s.customClass)}</em>` : ''}</button>
    <div class="section-menu-sep"></div>
    <button class="section-menu-item section-menu-item--danger${canDelete ? '' : ' disabled'}" onclick="deleteSection('${id}');closeSectionMenu()"><svg class="icon" style="width:13px;height:13px"><use href="#i-trash"/></svg> Delete</button>
  `;
  menu.addEventListener('click', e => e.stopPropagation());
  btn.after(menu);
  setTimeout(() => document.addEventListener('click', closeSectionMenu, { once: true }), 0);
}

function closeSectionMenu() {
  document.getElementById('section-menu')?.remove();
}

function setSectionClass(id) {
  const card = getActiveCard();
  if (!card) return;
  const s = card.sections.find(sec => sec.id === id);
  if (!s) return;
  const cls = prompt('CSS class(es) for this section:', s.customClass || '');
  if (cls === null) return;
  s.customClass = cls.trim();
  setDirty();
  renderPreview();
  dispatch('CARD_CONTENT_CHANGED');
}

let _sectionClipboard = null;

function copySection(id) {
  const card = getActiveCard();
  if (!card) return;
  const s = card.sections.find((s) => s.id === id);
  if (!s) return;
  _sectionClipboard = { label: s.label, content: s.content };
  showToast('Section copied');
}

function pasteSection(id) {
  if (!_sectionClipboard) return;
  if (!confirm('Overwrite this section?')) return;
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  const s = card.sections.find((s) => s.id === id);
  if (!s) return;
  s.label = _sectionClipboard.label;
  s.content = _sectionClipboard.content;
  dispatch('CARD_UI_CHANGED');
}

function copySectionWithImage(id) {
  const card = getActiveCard();
  if (!card) return;
  const si = card.sections.findIndex(s => s.id === id);
  const s = card.sections[si];
  if (!s) return;
  const img = card.images.find(im => im.slot === si);
  _sectionClipboard = { label: s.label, content: s.content, image: img ? { ...img } : null };
  showToast('Pair copied');
}

function pasteSectionWithImage(id) {
  if (!_sectionClipboard?.image) return;
  if (!confirm('Overwrite this section and image?')) return;
  pushUndo();
  const card = getActiveCard();
  if (!card) return;
  const si = card.sections.findIndex(s => s.id === id);
  const s = card.sections[si];
  if (!s) return;
  s.label = _sectionClipboard.label;
  s.content = _sectionClipboard.content;
  const newImg = { ..._sectionClipboard.image, slot: si };
  const existing = card.images.find(im => im.slot === si);
  if (existing) Object.assign(existing, newImg);
  else card.images.push(newImg);
  dispatch('CARD_UI_CHANGED');
}

function updateSection(id, field, val) {
  const card = getActiveCard();
  if (!card) return;
  const s = card.sections.find((s) => s.id === id);
  if (!s) return;
  s[field] = val;
  dispatch('CARD_CONTENT_CHANGED');
}


function setFontAlign(key, val) {
  state.settings[key].textAlign = val;
  document.querySelectorAll('.align-btn[data-key="' + key + '"]').forEach((b) => {
    b.classList.toggle("active", b.dataset.align === val);
  });
  dispatch('CARD_CONTENT_CHANGED');
}

function setTextVAlign(val) {
  state.settings.textVAlign = val;
  document.querySelectorAll(".valign-btn").forEach((b) => b.classList.toggle("active", b.dataset.valign === val));
  dispatch('CARD_CONTENT_CHANGED');
}

// ── Per-card custom CSS ────────────────────────────────────────────
function toggleCardCssEditor() {
  const area = document.getElementById("card-css-area");
  if (!area) return;
  const open = area.style.display === "none";
  area.style.display = open ? "" : "none";
  if (open) document.getElementById("card-css-input")?.focus();
}

function updateCardCss(css) {
  const card = getActiveCard();
  if (!card) return;
  card.customCss = css;
  const btn = document.getElementById("card-css-btn");
  if (btn) {
    const dot = btn.querySelector('.card-css-on');
    if (css && !dot) btn.insertAdjacentHTML('beforeend', '<span class="card-css-on">●</span>');
    else if (!css && dot) dot.remove();
  }
  dispatch('CARD_CONTENT_CHANGED');
}

// ── Paste block parser ────────────────────────────────────────────
function togglePasteBlock() {
  const area = document.getElementById("paste-block-area");
  if (!area) return;
  area.style.display = area.style.display === "none" ? "" : "none";
  if (area.style.display !== "none")
    document.getElementById("paste-block-input").focus();
}

function parsePasteBlock(mode) {
  const card = getActiveCard();
  if (!card) return;
  const raw = document.getElementById("paste-block-input").value;
  const parsed = [];

  for (const line of raw.split("\n")) {
    const clean = line.replace(/^[\s•\-*]+/, "").trim();
    if (!clean || /^_{2,}$/.test(clean)) continue;
    const colonIdx = clean.indexOf(":");
    const hasLabel = colonIdx > 0 && colonIdx < 40;
    parsed.push({
      id: uid(),
      label: hasLabel ? clean.slice(0, colonIdx).trim() : "",
      content: hasLabel ? clean.slice(colonIdx + 1).trim() : clean,
    });
  }

  if (!parsed.length) return;
  if (mode === "replace") card.sections = parsed;
  else card.sections = [...card.sections, ...parsed];

  dispatch('CARD_UI_CHANGED');
}

function toggleDataArea() {
  const area = document.getElementById("data-area");
  if (!area) return;
  const open = area.style.display === "none";
  area.style.display = open ? "" : "none";
  if (open) {
    cancelCardData(); // Dùng hàm cancel để load dữ liệu + reset UI
  }
}

function editCardData() {
  const ta = document.getElementById("data-area-content");
  const btns = document.getElementById("data-area-btns");
  if (!ta || !btns) return;
  ta.removeAttribute("readonly");
  ta.style.outline = "1px solid #3e9684";
  ta.style.background = "#fff";
  btns.innerHTML = `
    <button class="btn btn-danger btn-sm" onclick="cancelCardData()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="saveCardData()">Apply</button>
  `;
}

function cancelCardData() {
  const ta = document.getElementById("data-area-content");
  const btns = document.getElementById("data-area-btns");
  if (!ta || !btns) return;
  ta.setAttribute("readonly", "true");
  ta.style.outline = "";
  ta.style.background = "";
  const card = getActiveCard();
  ta.value = JSON.stringify(card || {}, null, 2);
  btns.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="editCardData()">Edit</button>';
}

function saveCardData() {
  const ta = document.getElementById("data-area-content");
  const card = getActiveCard();
  if (!ta || !card) return;
  try {
    const parsed = JSON.parse(ta.value);
    const originalId = card.id; // Chống mất/trùng ID
    const idx = state.cards.findIndex(c => c.id === originalId);
    if (idx !== -1) state.cards[idx] = { ...card, ...parsed, id: originalId };
    dispatch('FULL_STATE_UPDATED');
  } catch (e) {
    alert("Invalid JSON:\n" + e.message);
    ta.style.outline = "2px solid #ef4444"; // Báo lỗi viền đỏ
  }
}

// ── Drag & Drop onto image slot rows ──────────────────────────────
function initSlotDragDrop() {
  // delegated — re-init after editor re-renders
}

function swapSlots(a, b) {
  const card = getActiveCard();
  if (!card || a === b) return;
  const aImg = card.images.find((im) => im.slot === a);
  const bImg = card.images.find((im) => im.slot === b);
  if (aImg) aImg.slot = b;
  if (bImg) bImg.slot = a;
  dispatch('CARD_UI_CHANGED');
}

function attachSlotDragHandlers() {
  document.querySelectorAll(".image-slot-row").forEach((row) => {
    const slot = Number.parseInt(row.dataset.slot, 10);

    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/x-slot", slot);
      e.dataTransfer.effectAllowed = "move";
      setTimeout(() => row.classList.add("dragging"), 0);
    });
    row.addEventListener("dragend", () =>
      row.classList.remove("dragging"),
    );

    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes("text/x-slot")) {
        row.classList.add("drag-over-slot");
      } else {
        row.classList.add("drag-over");
      }
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
      row.classList.remove("drag-over-slot");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      row.classList.remove("drag-over-slot");
      if (e.dataTransfer.types.includes("text/x-slot")) {
        swapSlots(
          Number.parseInt(e.dataTransfer.getData("text/x-slot"), 10),
          slot,
        );
        return;
      }
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!files.length) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const compressed = await _compressImage(ev.target.result);
        imgModalSlot = slot;
        insertImageUrl(compressed);
        if (!uploadedImages.some((u) => u.name === files[0].name))
          uploadedImages.push({ name: files[0].name, dataURL: compressed });
      };
      reader.readAsDataURL(files[0]);
    });
  });
}
