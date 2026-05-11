#!/usr/bin/env node
// watch.js — auto-rebuild on src/ changes
// Usage: node watch.js

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SRC = path.join(__dirname, "src");

function build() {
  try {
    const out = execSync("node build.js", { cwd: __dirname }).toString().trim();
    console.log(new Date().toLocaleTimeString(), out);
  } catch (e) {
    console.error("Build failed:", e.message);
  }
}

build();
console.log("Watching src/ for changes…\n");

let debounce;
fs.watch(SRC, { recursive: true }, (_, filename) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    console.log(`  changed: ${filename}`);
    build();
  }, 150);
});
