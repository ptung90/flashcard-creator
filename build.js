#!/usr/bin/env node
// build.js — assembles src/ → index.html
// Usage: node build.js

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");

const template = fs.readFileSync(path.join(SRC, "template.html"), "utf8");
const config = fs.readFileSync(path.join(SRC, "config.js"), "utf8");
const css = fs.readFileSync(path.join(SRC, "style.css"), "utf8");
const js = fs.readFileSync(path.join(SRC, "app.js"), "utf8");

const output = template
  .replace("    <!-- BUILD:CONFIG -->", `    <script>\n${config}\n    </script>`)
  .replace("    <!-- BUILD:CSS -->", `    <style>\n${css}\n    </style>`)
  .replace("    <!-- BUILD:JS -->", `    <script>\n${js}\n    </script>`);

fs.writeFileSync(path.join(ROOT, "index.html"), output, "utf8");

const DIST = path.join(ROOT, "FlashCardApp2");
const DIST_FILE = "FlashCard Creator.html";
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);
fs.copyFileSync(path.join(ROOT, "index.html"), path.join(DIST, DIST_FILE));

const lines = output.split("\n").length;
console.log(`✓ index.html rebuilt — ${lines} lines → FlashCardApp2/${DIST_FILE}`);
