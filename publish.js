#!/usr/bin/env node
// publish.js — bump patch version, build, copy to FlashCardApp/app/
// Usage: node publish.js

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const CONFIG_FILE = path.join(SRC, "config.js");

// ── 1. Bump patch version in src/config.js ────────────────────────────
const configSrc = fs.readFileSync(CONFIG_FILE, "utf8");
const versionMatch = configSrc.match(/window\.FC_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!versionMatch) {
  console.error("✗ Could not find FC_VERSION in src/config.js");
  process.exit(1);
}
const [, major, minor, patch] = versionMatch;
const newPatch = parseInt(patch, 10) + 1;
const oldVersion = `${major}.${minor}.${patch}`;
const newVersion = `${major}.${minor}.${newPatch}`;
const updatedConfig = configSrc.replace(
  `window.FC_VERSION = "${oldVersion}"`,
  `window.FC_VERSION = "${newVersion}"`
);
fs.writeFileSync(CONFIG_FILE, updatedConfig, "utf8");
console.log(`✓ Version ${oldVersion} → ${newVersion}`);

// ── 2. Build ──────────────────────────────────────────────────────────
const template = fs.readFileSync(path.join(SRC, "template.html"), "utf8");
const config   = fs.readFileSync(CONFIG_FILE, "utf8");

function readIfExists(file) {
  const p = path.join(SRC, file);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

const state   = readIfExists("state.js");
const utils   = readIfExists("utils.js");
const storage = readIfExists("storage.js");
const api     = readIfExists("api.js");
const i18n    = readIfExists("i18n.js");
const render  = readIfExists("render.js");
const editor  = readIfExists("editor.js");
const preview = readIfExists("preview.js");
const modals  = readIfExists("modals.js");
const undo    = readIfExists("undo.js");
const records = readIfExists("records.js");
const js      = fs.readFileSync(path.join(SRC, "app.js"), "utf8");

const CSS_DIR = path.join(SRC, "css");
let css = "";
if (fs.existsSync(CSS_DIR)) {
  const cssFiles = ["base.css", "sidebar.css", "editor.css", "preview.css", "modal.css", "tomoe.css"];
  css = cssFiles.filter(f => fs.existsSync(path.join(CSS_DIR, f)))
    .map(f => fs.readFileSync(path.join(CSS_DIR, f), "utf8"))
    .join("\n\n");
} else if (fs.existsSync(path.join(SRC, "style.css"))) {
  css = fs.readFileSync(path.join(SRC, "style.css"), "utf8");
}

const allJs = [state, utils, storage, api, i18n, render, editor, preview, modals, undo, records, js]
  .filter(Boolean).join("\n\n");

const output = template
  .replace("    <!-- BUILD:CONFIG -->", `    <script>\n${config}\n    </script>`)
  .replace("    <!-- BUILD:CSS -->",    `    <style>\n${css}\n    </style>`)
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

// ── 3. Write outputs ──────────────────────────────────────────────────
const lines = output.split("\n").length;

writeAtomic(path.join(ROOT, "index.html"), output);
console.log(`✓ index.html rebuilt — ${lines} lines`);

const DIST2 = path.join(ROOT, "FlashCardApp2");
const DIST_FILE = "FlashCard Creator.html";
if (!fs.existsSync(DIST2)) fs.mkdirSync(DIST2);
writeAtomic(path.join(DIST2, DIST_FILE), output);
console.log(`✓ FlashCardApp2/${DIST_FILE}`);

const DIST_PUB = path.join(ROOT, "FlashCardApp", "app");
if (!fs.existsSync(DIST_PUB)) fs.mkdirSync(DIST_PUB, { recursive: true });
writeAtomic(path.join(DIST_PUB, DIST_FILE), output);
console.log(`✓ FlashCardApp/app/${DIST_FILE}`);

console.log(`\n🚀 Published v${newVersion}`);
