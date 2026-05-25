// ── State ──────────────────────────────────────────────────────────
const LAYOUTS = [
  "2top-1bot",
  "1top-2bot",
  "1big-2small",
  "2x2",
  "1full",
  "1left-2right",
  "1left-3right",
  "1top-3bot",
  "1top-1bot",
  "fullimage",
  "fulltext",
  "2img-2txt",
  "3img-3txt",
  "img3-txt3",
  "txtgrid",
  // "2img-4txt",
  "8img-8txt",
];

const LAYOUT_SPLIT_DEFAULTS = {
  "2top-1bot": { row: 50, col: 50, inner: 50 },
  "1top-2bot": { row: 50, col: 50, inner: 50 },
  "1big-2small": { row: 50, col: 67, inner: 50 },
  "2x2": { row: 50, col: 50, inner: 50 },
  "1full": { row: 100, col: 100, inner: 50 },
  "fullimage": { row: 100, col: 100, inner: 50 },
  "fulltext": { row: 0, col: 50, inner: 50 },
  "1left-2right": { row: 50, col: 33, inner: 50 },
  "1left-3right": { row: 50, col: 33, inner: 50 },
  "1top-3bot": { row: 67, col: 50, inner: 50 },
  "1top-1bot": { row: 50, col: 50, inner: 50 },
  "2img-2txt": { row: 50, col: 50, inner: 50 },
  "3img-3txt": { row: 50, col: 33, inner: 33 },
  "img3-txt3": { row: 50, col: 50, inner: 50, rowBorders: false },
  "txtgrid": { row: 50, col: 33, inner: 33 },
  "2img-4txt": { row: 33, col: 50, inner: 50 },
  "8img-8txt": { row: 50, col: 50, inner: 50 },
};

const LAYOUT_SLOTS = {
  "2top-1bot": 3,
  "1top-2bot": 3,
  "1big-2small": 3,
  "2x2": 4,
  "1full": 1,
  "fullimage": 1,
  "fulltext": 0,
  "1left-2right": 3,
  "1left-3right": 4,
  "1top-3bot": 4,
  "1top-1bot": 2,
  "2img-2txt": 2,
  "3img-3txt": 3,
  "img3-txt3": 3,
  "txtgrid": 0,
  "2img-4txt": 2,
  "8img-8txt": 8,
};
const PAPER_MM = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
  Letter: { w: 216, h: 279 },
};

// ── Merge user config from localStorage into FC_CONFIG (sync, before state init) ──
(function () {
  try {
    const raw = localStorage.getItem("fc_user_config");
    if (!raw) return;
    const saved = JSON.parse(raw);
    const cfg = window.FC_CONFIG || {};
    // Deep merge one level for object values
    for (const [k, v] of Object.entries(saved)) {
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        cfg[k] = Object.assign({}, cfg[k] || {}, v);
      } else {
        cfg[k] = v;
      }
    }
    window.FC_CONFIG = cfg;
  } catch (e) {
    console.warn("fc_user_config parse error:", e);
  }
})();

const _cfg = window.FC_CONFIG || {};
let state = {
  settings: {
    paperSize: _cfg.paperSize ?? "A5",
    orientation: _cfg.orientation ?? "portrait",
    margin: _cfg.margin ?? 9,
    padding: _cfg.padding ?? 2,
    imgPadding: _cfg.imgPadding ?? 0,
    textVAlign: _cfg.textVAlign ?? "middle",
    googleFonts: [],
    border: { width: 4, style: "double", color: "#6B21A8", radius: 0, ...(_cfg.border || {}) },
    image: { backgroundSize: "cover", backgroundPosition: "center", ...(_cfg.image || {}) },
    titleFont: { family: "sans-serif", size: 14, weight: 700, color: "#1a1a1a", lineHeight: 1.0, ...(_cfg.titleFont || {}) },
    contentFont: { family: "sans-serif", size: 12, weight: 400, color: "#1a1a1a", lineHeight: 1.1, ...(_cfg.contentFont || {}) },
    customCss: _cfg.customCss ?? "",
  },
  cards: [],
  projectName: "Untitled",
  projectIcon: "🗂️",
  schema: null,
  records: [],
};

let activeCardId = null;
let imgModalSlot = 0;
let activeTab = "wikimedia";
let sidebarView = 'grid';
let previewZoom = 1.0;

let _thumbGenId = 0;
let _thumbRefreshTimer = null;
let _thumbDirtyVersion = 0;
let _thumbRenderedVersion = 0;
let _pendingThumbCardId = undefined; // undefined=idle, null=all, string=specific card

function getActiveCard() { return state.cards.find((c) => c.id === activeCardId); }
function getCardOrientation(card) { return card?.orientation || state.settings.orientation; }