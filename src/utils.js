// ── Helpers ────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getPaperPx(paperSize, orientation) {
  const PPI = 96;
  const MM_PER_IN = 25.4;
  let { w, h } = PAPER_MM[paperSize] || PAPER_MM.A4;
  if (orientation === "landscape") {
    [w, h] = [h, w];
  }
  return { w: Math.round((w / MM_PER_IN) * PPI), h: Math.round((h / MM_PER_IN) * PPI) };
}

function getPaperMm(paperSize, orientation) {
  let { w, h } = PAPER_MM[paperSize] || PAPER_MM.A4;
  if (orientation === "landscape") {
    [w, h] = [h, w];
  }
  return { w, h };
}

function mmToPx(mm) {
  return Math.round((mm / 25.4) * 96);
}

function mdParse(text) {
  return marked.parse((text || "").replace(/^ +/gm, (m) => " ".repeat(m.length)));
}

function mdParseInline(text) {
  return marked.parseInline(text || "");
}

function esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Image compression ─────────────────────────────────────────────
let MAX_IMG_PX = (window.FC_CONFIG || {}).maxImgPx ?? 1240;

function _compressImage(dataURL, maxPx = MAX_IMG_PX, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

function _hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h >>>= 0;
  }
  return h.toString(36);
}