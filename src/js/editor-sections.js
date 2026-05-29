// ── Sections ───────────────────────────────────────────────────────
function mergeSections() {
  const card = getActiveCard();
  if (!card || card.sections.length < 2) return;
  pushUndo();
  const merged = card.sections
    .map(s => {
      const label = s.label?.trim();
      const content = s.content?.trim() || '';
      return label ? `**${label}**\n${content}` : content;
    })
    .filter(Boolean)
    .join('\n\n');
  card.sections = [{ id: uid(), label: '', content: merged }];
  dispatch('CARD_UI_CHANGED');
}

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
  const isPaired = ["2img-2txt", "8img-8txt", "6cell"].includes(card.layout);
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
        uiState.imgModalSlot = slot;
        insertImageUrl(compressed);
        if (!uploadedImages.some((u) => u.name === files[0].name))
          uploadedImages.push({ name: files[0].name, dataURL: compressed });
      };
      reader.readAsDataURL(files[0]);
    });
  });
}