#!/usr/bin/env node
// build.js — assembles src/ → index.html
// Usage: node build.js

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");

const template = fs.readFileSync(path.join(SRC, "template.html"), "utf8");
const config = fs.readFileSync(path.join(SRC, "config.js"), "utf8");
const utils = fs.existsSync(path.join(SRC, "utils.js")) ? fs.readFileSync(path.join(SRC, "utils.js"), "utf8") : "";
const state = fs.existsSync(path.join(SRC, "state.js")) ? fs.readFileSync(path.join(SRC, "state.js"), "utf8") : "";
const storage = fs.existsSync(path.join(SRC, "storage.js")) ? fs.readFileSync(path.join(SRC, "storage.js"), "utf8") : "";
const api = fs.existsSync(path.join(SRC, "api.js")) ? fs.readFileSync(path.join(SRC, "api.js"), "utf8") : "";
const i18n = fs.existsSync(path.join(SRC, "i18n.js")) ? fs.readFileSync(path.join(SRC, "i18n.js"), "utf8") : "";
const render = fs.existsSync(path.join(SRC, "render.js")) ? fs.readFileSync(path.join(SRC, "render.js"), "utf8") : "";
const editor = fs.existsSync(path.join(SRC, "editor.js")) ? fs.readFileSync(path.join(SRC, "editor.js"), "utf8") : "";
const preview = fs.existsSync(path.join(SRC, "preview.js")) ? fs.readFileSync(path.join(SRC, "preview.js"), "utf8") : "";
const modals = fs.existsSync(path.join(SRC, "modals.js")) ? fs.readFileSync(path.join(SRC, "modals.js"), "utf8") : "";
const undo = fs.existsSync(path.join(SRC, "undo.js")) ? fs.readFileSync(path.join(SRC, "undo.js"), "utf8") : "";
const js = fs.readFileSync(path.join(SRC, "app.js"), "utf8");

const CSS_DIR = path.join(SRC, "css");
let css = "";
if (fs.existsSync(CSS_DIR)) {
  const cssFiles = ["base.css", "sidebar.css", "editor.css", "preview.css", "modal.css"];
  css = cssFiles.filter(f => fs.existsSync(path.join(CSS_DIR, f)))
    .map(f => fs.readFileSync(path.join(CSS_DIR, f), "utf8"))
    .join("\n\n");
} else if (fs.existsSync(path.join(SRC, "style.css"))) {
  css = fs.readFileSync(path.join(SRC, "style.css"), "utf8");
}
const allJs = [state, utils, storage, api, i18n, render, editor, preview, modals, undo, js].filter(Boolean).join("\n\n");

const output = template
  .replace("    <!-- BUILD:CONFIG -->", `    <script>\n${config}\n    </script>`)
  .replace("    <!-- BUILD:CSS -->", `    <style>\n${css}\n    </style>`)
  .replace("    <!-- BUILD:JS -->", `    <script>\n${allJs}\n    </script>`);

fs.writeFileSync(path.join(ROOT, "index.html"), output, "utf8");

const DIST = path.join(ROOT, "FlashCardApp2");
const DIST_FILE = "FlashCard Creator.html";
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);
fs.copyFileSync(path.join(ROOT, "index.html"), path.join(DIST, DIST_FILE));

const lines = output.split("\n").length;
console.log(`✓ index.html rebuilt — ${lines} lines → FlashCardApp2/${DIST_FILE}`);
