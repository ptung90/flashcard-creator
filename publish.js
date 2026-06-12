#!/usr/bin/env node
// publish.js — bump patch version then run build.js
// Usage: node publish.js

const fs           = require("node:fs");
const path         = require("node:path");
const os           = require("node:os");
const { execSync } = require("node:child_process");

const ROOT        = __dirname;
const PKG_FILE    = path.join(ROOT, "package.json");

// ── 1. Bump patch version ─────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(PKG_FILE, "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
const oldVersion = pkg.version;
const newVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = newVersion;
fs.writeFileSync(PKG_FILE, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`✓ Version ${oldVersion} → ${newVersion}`);

// ── 2. Build ──────────────────────────────────────────────────────
execSync("npm run build", { stdio: "inherit", cwd: ROOT });

// ── 3. Copy to FlashCardApp/app/ ──────────────────────────────────
const DIST_FILE = "FlashCard Creator.html";
const src  = path.join(ROOT, "FlashCardApp", DIST_FILE);
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
