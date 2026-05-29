#!/usr/bin/env node
// scripts/download-font.js
// Downloads a Google Font and embeds all woff2 files as base64 data URIs.
// Output: src/vendor/<family>-embedded.css
//
// Usage: node scripts/download-font.js "Lexend" "wght@100..900"
//        node scripts/download-font.js "Noto Sans" "wght@400;700"

const https = require("https");
const fs    = require("fs");
const path  = require("path");

const family  = process.argv[2] || "Lexend";
const weights = process.argv[3] || "wght@100..900";
const outFile = path.join(__dirname, "../src/vendor", family.replace(/\s+/g, "-").toLowerCase() + "-embedded.css");

const googleUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${weights}&display=swap`;

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = Object.assign(new URL(url), { headers });
    https.get(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location, headers));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  console.log(`Fetching CSS for ${family} (${weights})...`);

  // Use a modern browser UA to get woff2 format
  const cssRes = await get(googleUrl, {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  });

  if (cssRes.status !== 200) {
    console.error(`Failed to fetch CSS: HTTP ${cssRes.status}`);
    process.exit(1);
  }

  const css = cssRes.body.toString("utf8");
  const fontUrls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);

  console.log(`Found ${fontUrls.length} font file(s). Downloading...`);

  let result = css;
  for (const url of fontUrls) {
    process.stdout.write(`  ${url.split("/").pop()} ... `);
    const fontRes = await get(url);
    if (fontRes.status !== 200) {
      console.log(`SKIP (HTTP ${fontRes.status})`);
      continue;
    }
    const b64 = fontRes.body.toString("base64");
    const dataUri = `data:font/woff2;base64,${b64}`;
    result = result.replace(url, dataUri);
    console.log(`${Math.round(fontRes.body.length / 1024)} KB → ${Math.round(b64.length / 1024)} KB base64`);
  }

  fs.writeFileSync(outFile, result, "utf8");
  const outKB = Math.round(fs.statSync(outFile).size / 1024);
  console.log(`\n✓ Written to ${outFile} (${outKB} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
