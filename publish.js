#!/usr/bin/env node
// publish.js — bump patch version then run build.js
// Usage: node publish.js

const fs           = require("node:fs");
const path         = require("node:path");
const os           = require("node:os");
const { execSync } = require("node:child_process");

const ROOT        = __dirname;
const CONFIG_FILE = path.join(ROOT, "src", "js", "config.js");

// ── 1. Bump patch version ─────────────────────────────────────────
const configSrc = fs.readFileSync(CONFIG_FILE, "utf8");
const versionMatch = configSrc.match(/window\.FC_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!versionMatch) {
  console.error("✗ Could not find FC_VERSION in src/js/config.js");
  process.exit(1);
}
const [, major, minor, patch] = versionMatch;
const newVersion = `${major}.${minor}.${Number.parseInt(patch, 10) + 1}`;
const oldVersion = `${major}.${minor}.${patch}`;
fs.writeFileSync(
  CONFIG_FILE,
  configSrc.replace(`window.FC_VERSION = "${oldVersion}"`, `window.FC_VERSION = "${newVersion}"`),
  "utf8"
);
console.log(`✓ Version ${oldVersion} → ${newVersion}`);

// ── 2. Build ──────────────────────────────────────────────────────
execSync("node build.js", { stdio: "inherit", cwd: ROOT });

// ── 3. Copy to FlashCardApp/app/ ──────────────────────────────────
const DIST_FILE = "FlashCard Creator.html";
const src  = path.join(ROOT, "FlashCardApp2", DIST_FILE);
const dest = path.join(ROOT, "FlashCardApp", "app", DIST_FILE);
fs.mkdirSync(path.dirname(dest), { recursive: true });

function copyAtomic(from, to) {
  const tmp = path.join(os.tmpdir(), path.basename(to) + ".pub.tmp");
  fs.copyFileSync(from, tmp);
  try { fs.renameSync(tmp, to); } catch { fs.copyFileSync(tmp, to); fs.unlinkSync(tmp); }
}
copyAtomic(src, dest);
console.log(`✓ FlashCardApp/app/${DIST_FILE}`);

console.log(`\n🚀 Published v${newVersion}`);
