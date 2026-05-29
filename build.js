#!/usr/bin/env node
// build.js — assembles src/ → index.html
// Usage: node build.js

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT   = __dirname;
const HTML   = path.join(ROOT, "src", "html");
const JS     = path.join(ROOT, "src", "js");
const CSS    = path.join(ROOT, "src", "css");
const VENDOR = path.join(ROOT, "src", "vendor");

function readJs(name) {
  const p = path.join(JS, name);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

// ── Vendor libs (inlined for offline use) ─────────────────────────
function readVendor(name) {
  const p = path.join(VENDOR, name);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}
const vendorJs = ["marked.min.js", "turndown.min.js"]
  .map(f => readVendor(f))
  .filter(Boolean)
  .join("\n");
const vendorBlock = vendorJs ? `    <script>\n${vendorJs}\n    </script>` : "";

// ── HTML fragments ─────────────────────────────────────────────────
const template   = fs.readFileSync(path.join(HTML, "template.html"), "utf8");
const svgHtml    = fs.existsSync(path.join(HTML, "svg.html"))    ? fs.readFileSync(path.join(HTML, "svg.html"),    "utf8") : "";
const modalsHtml = fs.existsSync(path.join(HTML, "modals.html")) ? fs.readFileSync(path.join(HTML, "modals.html"), "utf8") : "";

// ── JS load order ──────────────────────────────────────────────────
// Each file may only call functions defined in files loaded BEFORE it.
//
// LAYER 0 — pure config, no dependencies
const config  = readJs("config.js");    // window.FC_CONFIG, FC_VERSION — no deps

// LAYER 1 — data + pure helpers, no DOM
const state   = readJs("state.js");     // LAYOUTS, PAPER_MM, HIDE_TITLE_LAYOUTS, uiState, state{}
const utils   = readJs("utils.js");     // uid, esc, _show/_hide, mdParse, _compressImage  ← state

// LAYER 2 — services (no rendering)
const storage = readJs("storage.js");   // File System API, IDB, autosave, backup           ← state, utils
const api     = readJs("api.js");       // image search (Wikimedia, iNat, Pixabay, Unsplash) ← utils
const i18n    = readJs("i18n.js");      // t() translation helper                            ← (standalone)

// LAYER 3 — rendering / card building
const render  = readJs("render.js");    // buildCardHTML, getGridTemplateStyle, buildHandles  ← state, utils

// LAYER 4 — editor (depends on render + state)
const editor          = readJs("editor.js");          // TipTap instances, renderEditor()    ← state, utils, render
const editorControls  = readJs("editor-controls.js"); // layout picker, card font/img props  ← state, utils, editor
const editorSections  = readJs("editor-sections.js"); // sections, paste block, drag & drop  ← state, utils, editor

// LAYER 5 — preview + modals (depends on render + storage)
const preview = readJs("preview.js");   // live preview, PDF/print export                    ← state, utils, render, storage
const modals  = readJs("modals.js");    // img-search modal, settings modal, style library   ← state, utils, storage, api

// LAYER 6 — undo (depends on state + dispatch from app, called at runtime only)
const undo    = readJs("undo.js");      // undo/redo stack                                   ← state

// LAYER 7 — records system
const records       = readJs("records.js");       // records panel UI, record detail          ← state, utils, storage, i18n
const recordsPack   = readJs("records-pack.js");  // generate, sync, pack, consolidate        ← state, utils, records
const schemaEditor  = readJs("schema-editor.js"); // schema editor modal, library             ← state, utils, storage, i18n, records
const recordsAi     = readJs("records-ai.js");    // export/import/AI copy for records        ← state, utils, storage, records

// LAYER 8 — app shell (wires everything together, must load last)
const app     = readJs("app.js");       // init, dispatch, sidebar, toolbar, event wiring    ← all layers

// ── CSS load order ─────────────────────────────────────────────────
// Embedded fonts first, then base.css (variables + reset), tomoe.css last (feature overrides)
const embeddedFonts = ["lexend-embedded.css"]
  .map(f => { const p = path.join(VENDOR, f); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; })
  .filter(Boolean)
  .join("\n\n");

const cssFiles = ["base.css", "sidebar.css", "editor.css", "preview.css", "modal.css", "tomoe.css"];
const css = [embeddedFonts, ...cssFiles
  .filter(f => fs.existsSync(path.join(CSS, f)))
  .map(f => fs.readFileSync(path.join(CSS, f), "utf8"))
].filter(Boolean).join("\n\n");

// ── Assemble ───────────────────────────────────────────────────────
const allJs = [
  state, utils,
  storage, api, i18n,
  render,
  editor, editorControls, editorSections,
  preview, modals,
  undo,
  records, recordsPack, schemaEditor, recordsAi,
  app,
].filter(Boolean).join("\n\n");

const output = template
  .replace("    <!-- BUILD:CONFIG -->", `    <script>\n${config}\n    </script>`)
  .replace("    <!-- BUILD:CSS -->",    `    <style>\n${css}\n    </style>`)
  .replace("    <!-- BUILD:VENDOR -->", vendorBlock)
  .replace("    <!-- BUILD:SVG -->",    svgHtml)
  .replace("    <!-- BUILD:MODALS -->", modalsHtml)
  .replace("    <!-- BUILD:JS -->",     `    <script>\n${allJs}\n    </script>`);

function writeAtomic(dest, content) {
  const tmp = path.join(os.tmpdir(), path.basename(dest) + ".tmp");
  fs.writeFileSync(tmp, content, "utf8");
  try {
    fs.renameSync(tmp, dest);
  } catch {
    fs.copyFileSync(tmp, dest);
    fs.unlinkSync(tmp);
  }
}

writeAtomic(path.join(ROOT, "index.html"), output);

const DIST = path.join(ROOT, "FlashCardApp2");
const DIST_FILE = "FlashCard Creator.html";
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);
writeAtomic(path.join(DIST, DIST_FILE), output);

const lines = output.split("\n").length;
console.log(`✓ index.html rebuilt — ${lines} lines → FlashCardApp2/${DIST_FILE}`);
