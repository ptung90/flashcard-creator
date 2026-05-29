#!/usr/bin/env node
// build.js — assembles src/ → index.html
// Usage: node build.js

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = __dirname;
const HTML = path.join(ROOT, "src", "html");
const JS   = path.join(ROOT, "src", "js");
const CSS  = path.join(ROOT, "src", "css");

function readJs(name) {
  const p = path.join(JS, name);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

const template   = fs.readFileSync(path.join(HTML, "template.html"), "utf8");
const svgHtml    = fs.existsSync(path.join(HTML, "svg.html"))    ? fs.readFileSync(path.join(HTML, "svg.html"),    "utf8") : "";
const modalsHtml = fs.existsSync(path.join(HTML, "modals.html")) ? fs.readFileSync(path.join(HTML, "modals.html"), "utf8") : "";

const config  = readJs("config.js");
const state   = readJs("state.js");
const utils   = readJs("utils.js");
const storage = readJs("storage.js");
const api     = readJs("api.js");
const i18n    = readJs("i18n.js");
const render  = readJs("render.js");
const editor  = readJs("editor.js");
const preview = readJs("preview.js");
const modals  = readJs("modals.js");
const undo    = readJs("undo.js");
const records       = readJs("records.js");
const recordsPack   = readJs("records-pack.js");
const schemaEditor  = readJs("schema-editor.js");
const recordsAi     = readJs("records-ai.js");
const app           = readJs("app.js");

const cssFiles = ["base.css", "sidebar.css", "editor.css", "preview.css", "modal.css", "tomoe.css"];
const css = cssFiles
  .filter(f => fs.existsSync(path.join(CSS, f)))
  .map(f => fs.readFileSync(path.join(CSS, f), "utf8"))
  .join("\n\n");

const allJs = [state, utils, storage, api, i18n, render, editor, preview, modals, undo, records, recordsPack, schemaEditor, recordsAi, app]
  .filter(Boolean).join("\n\n");

const output = template
  .replace("    <!-- BUILD:CONFIG -->", `    <script>\n${config}\n    </script>`)
  .replace("    <!-- BUILD:CSS -->",    `    <style>\n${css}\n    </style>`)
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
