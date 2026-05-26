// Waits for fonts + 1 rAF before html2canvas to prevent missing-font spacing artifacts
async function _waitForRender() {
  await document.fonts.ready;
  await new Promise(r => requestAnimationFrame(r));
}

// html2canvas wrapper: normalizes letter-spacing/word-spacing in the clone
// to prevent browser-specific spacing divergence
function _capture(el) {
  return html2canvas(el, {
    useCORS: true,
    allowTaint: false,
    scale: 2,
    backgroundColor: "#ffffff",
    onclone(_, clonedEl) {
      clonedEl.querySelectorAll("*").forEach(node => {
        const s = node.style;
        if (s) {
          s.letterSpacing = "0px";
          s.wordSpacing   = "0px";
        }
      });
    },
  });
}

// ── Preview ────────────────────────────────────────────────────────
function renderPreview() {
  const wrap = document.getElementById("preview-card-wrap");
  const card = getActiveCard();
  if (!card) {
    wrap.innerHTML =
      '<div style="color:#555;padding:20px;text-align:center">No card selected</div>';
    return;
  }
  const { w, h } = getPaperPx(
    card.paperSize || state.settings.paperSize,
    card.orientation || state.settings.orientation,
  );
  const panelW = document.getElementById("fc-preview-panel").clientWidth - 32;
  const scale = (panelW / w) * previewZoom;
  const zl = document.getElementById("preview-zoom-label");
  if (zl) zl.textContent = `${Math.round(scale * 100)}%`;
  const scaledW = Math.round(w * scale);
  const scaledH = Math.round(h * scale);
  wrap.style.cssText = "width:100%;min-width:" + scaledW + "px;display:flex;justify-content:center;";
  // White paper background; card sits inside with margin applied via its own style
  wrap.innerHTML =
    '<div class="preview-paper" style="width:' +
    scaledW +
    "px;height:" +
    scaledH +
    'px;background:white;position:relative;flex-shrink:0;overflow:hidden;">' +
    '<div style="transform:scale(' +
    scale +
    ");transform-origin:top left;width:" +
    w +
    "px;height:" +
    h +
    'px;position:absolute;top:0;left:0;">' +
    buildCardHTML(card, state.settings, false,
      card.paperSize ? getPaperPx(card.paperSize, card.orientation || state.settings.orientation) : null) +
    "</div></div>";
  attachPreviewDragHandlers(card);
}

function attachPreviewDragHandlers(card) {
  const layout = card.layout;
  const compoundGapPx = mmToPx(state.settings.margin);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  document.querySelectorAll(".fc-grid-handle").forEach((handle) => {
    const type = handle.dataset.handle;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pushUndo();
      handle.classList.add("dragging");
      const imgArea = handle.closest(".fc-image-area");
      const rect = imgArea.getBoundingClientRect();
      const sp = card.imageGridSplit;

      const onMove = (ev) => {
        const xPct = clamp(
          Math.round(((ev.clientX - rect.left) / rect.width) * 100),
          15, 85,
        );
        const yPct = clamp(
          Math.round(((ev.clientY - rect.top) / rect.height) * 100),
          15, 85,
        );
        if (type === "row") {
          sp.row = yPct;
          if (layout === "2img-2txt" || layout === "2img-4txt") {
            if (layout === "2img-2txt" || layout === "2img-4txt" || layout === "3img-3txt") {
              const tracks = getCompoundGridTracks(layout, sp, compoundGapPx);
              if (tracks) {
                imgArea.style.gridTemplateColumns = tracks.columns;
                imgArea.style.gridTemplateRows = tracks.rows;
              }
              if (layout === "2img-4txt") {
                const mid = ((100 - sp.row) * sp.inner) / 100;
                const innerTop = sp.row + mid;
                const ir = imgArea.querySelector('[data-handle="inner-row"]');
                if (ir) ir.style.top = innerTop + "%";
              }
              handle.style.top = sp.row + "%";
            } else {
              imgArea.style.gridTemplateRows =
                sp.row + "% " + (100 - sp.row) + "%";
              handle.style.top = sp.row + "%";
            }
          } else {
            imgArea.style.gridTemplateRows = sp.row + "% " + (100 - sp.row) + "%";
            handle.style.top = sp.row + "%";
          }
          // sync inner-col handle position (2top-1bot / 1top-2bot)
          const ic = imgArea.querySelector('[data-handle="inner-col"]');
          if (ic) {
            if (layout === "2top-1bot") {
              ic.style.height = sp.row + "%";
            } else {
              ic.style.top = sp.row + "%";
              ic.style.height = (100 - sp.row) + "%";
            }
          }
        } else if (type === "col") {
          sp.col = xPct;
          imgArea.style.gridTemplateColumns = sp.col + "% " + (100 - sp.col) + "%";
          handle.style.left = sp.col + "%";
          const ir = imgArea.querySelector('[data-handle="inner-row"]');
          if (ir) ir.style.left = sp.col + "%";
        } else if (type === "inner-col") {
          sp.inner = xPct;
          imgArea.style.gridTemplateColumns = sp.inner + "% " + (100 - sp.inner) + "%";
          handle.style.left = sp.inner + "%";
        } else if (type === "inner-row") {
          if (layout === "2img-4txt") {
            const relPct = clamp(
              Math.round(((yPct - sp.row) / (100 - sp.row)) * 100),
              15, 85,
            );
            const mid = ((100 - sp.row) * relPct) / 100;
            sp.inner = relPct;
            const tracks = getCompoundGridTracks(layout, sp, compoundGapPx);
            if (tracks) {
              imgArea.style.gridTemplateColumns = tracks.columns;
              imgArea.style.gridTemplateRows = tracks.rows;
            }
            handle.style.top = sp.row + mid + "%";
          } else {
            sp.inner = yPct;
            imgArea.style.gridTemplateRows = sp.inner + "% " + (100 - sp.inner) + "%";
            handle.style.top = sp.inner + "%";
          }
        }
      };

      const onUp = () => {
        handle.classList.remove("dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setDirty();
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

// ── Print ──────────────────────────────────────────────────────────
function printAll() {
  const wrap = document.getElementById("preview-card-wrap");
  const orig = wrap.innerHTML;
  const styleEl = mountPrintPageStyle();
  wrap.innerHTML = state.cards
    .map((c) => {
      const orientation = getCardOrientation(c);
      const overridePx  = c.paperSize ? getPaperPx(c.paperSize, orientation) : null;
      return (
        '<div class="fc-print-sheet fc-print-sheet--' +
        orientation +
        '">' +
        buildCardHTML(c, state.settings, true, overridePx) +
        "</div>"
      );
    })
    .join("");
  window.print();
  wrap.innerHTML = orig;
  styleEl.remove();
  renderPreview();
}

function printOne() {
  const card = getActiveCard();
  if (!card) return;
  const wrap = document.getElementById("preview-card-wrap");
  const orig = wrap.innerHTML;
  const styleEl = mountPrintPageStyle();
  const overridePx = card.paperSize ? getPaperPx(card.paperSize, getCardOrientation(card)) : null;
  wrap.innerHTML =
    '<div class="fc-print-sheet fc-print-sheet--' +
    getCardOrientation(card) +
    '">' +
    buildCardHTML(card, state.settings, true, overridePx) +
    "</div>";
  window.print();
  wrap.innerHTML = orig;
  styleEl.remove();
  renderPreview();
}

function mountPrintPageStyle() {
  const existing = document.getElementById("fc-print-page-style");
  if (existing) existing.remove();
  const portrait = getPaperMm(state.settings.paperSize, "portrait");
  const landscape = getPaperMm(state.settings.paperSize, "landscape");
  const styleEl = document.createElement("style");
  styleEl.id = "fc-print-page-style";
  styleEl.textContent = `
    @media print {
      @page fc-portrait {
        size: ${portrait.w}mm ${portrait.h}mm;
        margin: 0;
      }
      @page fc-landscape {
        size: ${landscape.w}mm ${landscape.h}mm;
        margin: 0;
      }
      .fc-print-sheet--portrait {
        page: fc-portrait;
      }
      .fc-print-sheet--landscape {
        page: fc-landscape;
      }
      .fc-print-sheet {
        break-after: page;
        page-break-after: always;
      }
      .fc-print-sheet:last-child {
        break-after: auto;
        page-break-after: auto;
      }
    }
  `;
  document.head.appendChild(styleEl);
  return styleEl;
}

function _pdfName(label) {
  const dt = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}-${pad(dt.getHours())}${pad(dt.getMinutes())}`;
  const slug = (label || "untitled").trim()
    .replace(/[đĐ]/g, (c) => c === "đ" ? "d" : "D")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
  return `${slug}-${ts}.pdf`;
}

async function exportOnePDF() {
  const card = getActiveCard();
  if (!card) return alert("No card selected.");
  const { jsPDF } = window.jspdf;
  const s = state.settings;
  const orientation = getCardOrientation(card);
  const { w: pw, h: ph } = getPaperMm(card.paperSize || s.paperSize, orientation);
  const pdf = new jsPDF({
    orientation: orientation === "landscape" ? "l" : "p",
    unit: "mm",
    format: [pw, ph],
  });
  const wrap = document.getElementById("preview-card-wrap");
  const origHTML = wrap.innerHTML;
  const origStyle = wrap.style.cssText;
  wrap.style.cssText = "width:auto;min-width:0;display:block;";
  wrap.innerHTML = buildCaptureHTML(card, s);
  const el = wrap.firstElementChild;
  await _waitForRender();
  const canvas = await _capture(el);
  pdf.addImage(
    canvas.toDataURL("image/jpeg", 0.92),
    "JPEG",
    0,
    0,
    pw,
    ph,
  );
  pdf.save(_pdfName(card.title || state.projectName));
  wrap.innerHTML = origHTML;
  wrap.style.cssText = origStyle;
  renderPreview();
}

// ── PDF Export ────────────────────────────────────────────────────
async function exportPDF() {
  if (!state.cards.length) return alert("No cards to export.");
  const { jsPDF } = window.jspdf;
  const s = state.settings;
  const firstOrientation = getCardOrientation(state.cards[0]);
  const firstPage = getPaperMm(s.paperSize, firstOrientation);

  const pdf = new jsPDF({
    orientation: firstOrientation === "landscape" ? "l" : "p",
    unit: "mm",
    format: [firstPage.w, firstPage.h],
  });

  const wrap = document.getElementById("preview-card-wrap");
  const origHTML = wrap.innerHTML;
  const origStyle = wrap.style.cssText;
  wrap.style.cssText = "width:auto;min-width:0;display:block;";

  for (let i = 0; i < state.cards.length; i++) {
    const card = state.cards[i];
    const orientation = getCardOrientation(card);
    const { w: pw, h: ph } = getPaperMm(card.paperSize || s.paperSize, orientation);
    wrap.innerHTML = buildCaptureHTML(card, s);
    const el = wrap.firstElementChild;
    await _waitForRender();
    const canvas = await _capture(el);
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0)
      pdf.addPage([pw, ph], orientation === "landscape" ? "l" : "p");
    pdf.addImage(imgData, "JPEG", 0, 0, pw, ph);
  }

  pdf.save(_pdfName(state.projectName));
  wrap.innerHTML = origHTML;
  wrap.style.cssText = origStyle;
  renderPreview();
}

// ── Panel resize ──────────────────────────────────────────────────
function initPanelResize() {
  document.querySelectorAll('.fc-panel-divider').forEach(divider => {
    divider.addEventListener('mousedown', e => {
      e.preventDefault();
      const panelId = divider.dataset.panel;
      const panel = document.getElementById(panelId);
      if (!panel) return;
      const startX = e.clientX;
      const startW = panel.offsetWidth;
      divider.classList.add('dragging');

      const onMove = ev => {
        const dx = ev.clientX - startX;
        // sidebar: drag right = wider; preview divider: drag right = narrower
        const newW = panelId === 'fc-preview-panel'
          ? Math.max(280, Math.min(800, startW - dx))
          : Math.max(120, Math.min(500, startW + dx));
        panel.style.width = newW + 'px';
        panel.style.minWidth = newW + 'px';
        if (panelId === 'fc-preview-panel') renderPreview();
      };

      const onUp = () => {
        divider.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ── Preview pan (click-drag to scroll) ────────────────────────────
function initPreviewPan() {
  const el = document.getElementById("fc-preview");
  let panning = false, startX, startY, scrollX, scrollY;

  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".fc-grid-handle")) return;
    panning = true;
    startX = e.clientX;
    startY = e.clientY;
    scrollX = el.scrollLeft;
    scrollY = el.scrollTop;
    el.classList.add("panning");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!panning) return;
    el.scrollLeft = scrollX - (e.clientX - startX);
    el.scrollTop = scrollY - (e.clientY - startY);
  });

  document.addEventListener("mouseup", () => {
    if (!panning) return;
    panning = false;
    el.classList.remove("panning");
  });
}
