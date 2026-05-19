window.FC_VERSION = "2.2.1";

window.FC_CONFIG = {
  // ── Paper & Layout ────────────────────────────────────────────────
  paperSize: "A5", // A4 | A5 | A6 | Letter
  orientation: "portrait", // portrait | landscape
  margin: 9,      // mm — khoảng cách từ mép giấy đến viền card
  padding: 2,     // mm — text padding bên trong viền card
  imgPadding: 0,  // mm — padding quanh image slot

  // ── Border ────────────────────────────────────────────────────────
  border: {
    width: 4, // px
    style: "double", // none | solid | dashed | dotted | double
    color: "#3E9684", // hex
    radius: 0, // px
  },

  // ── Image ─────────────────────────────────────────────────────────
  image: {
    backgroundSize: "cover", // cover | contain
    backgroundPosition: "center", // center | top | bottom | left | right
  },

  // ── Title Font (global default for all cards) ────────────────────
  titleFont: {
    family: "sans-serif",
    size: 14, // px
    color: "#1a1a1a",
    lineHeight: 1.0,
    textAlign: "left", // left | center | right | justify
  },

  // ── Content Font (global default for all cards) ───────────────────
  // Section label renders at 0.78em, content at 0.75em of this size
  contentFont: {
    family: "sans-serif",
    size: 12, // px
    color: "#1a1a1a",
    lineHeight: 1.1,
    textAlign: "left", // left | center | right | justify
  },

  // ── New Card Defaults ─────────────────────────────────────────────
  newCard: {
    layout: "2top-1bot", // 2top-1bot | 1top-2bot | 1big-2small | 2x2 | 1full | 1left-2right | 1left-3right | 1top-3bot | 1top-1bot
    imageHeightPercent: 80, // 20–80
    defaultSections: [
      { label: "Feature", content: "" },
      { label: "Habitat", content: "" },
    ],
  },

  // ── Text vertical alignment ───────────────────────────────────────
  textVAlign: "middle", // top | middle | bottom

  // ── Paste block (false = hidden by default, click button to show) ──
  pasteBlock: false,

  // ── Max image size on paste/upload (px, longest edge) ────────────
  // A4 @ 150 DPI = 1240 | A4 @ 200 DPI = 1654 | A4 @ 300 DPI = 2480
  maxImgPx: 1240,

  // ── Undo / Redo ───────────────────────────────────────────────────
  undoMax: 50,          // max undo steps (1–200)

  // ── Custom CSS (inject vào mỗi session) ──────────────────────────
  customCss: "",
};
