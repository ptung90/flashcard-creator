// ── External APIs (Image Search) ──────────────────────────────────

// Wikimedia Commons
async function searchWikimedia() {
  const q = document.getElementById("search-wikimedia").value.trim();
  if (!q) return;
  const res = document.getElementById("results-wikimedia");
  res.innerHTML = '<div class="search-status">Searching...</div>';
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=20&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=300&format=json&origin=*`;
    const r = await fetch(url);
    const data = await r.json();
    const pages = Object.values(data.query?.pages || {});
    if (!pages.length) {
      res.innerHTML = '<div class="search-status">No results</div>';
      return;
    }
    res.innerHTML = pages
      .map((p) => {
        const info = p.imageinfo?.[0];
        if (!info) return "";
        const thumb = info.thumburl || info.url;
        const full = info.url;
        return `<div class="search-result-item" onclick="insertImageUrl('${esc(full)}')"><img src="${esc(thumb)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
      })
      .join("");
  } catch (e) {
    res.innerHTML = `<div class="search-status">Error: ${e.message}</div>`;
  }
}

// iNaturalist
async function searchINaturalist() {
  const q = document.getElementById("search-inaturalist").value.trim();
  if (!q) return;
  const res = document.getElementById("results-inaturalist");
  res.innerHTML = '<div class="search-status">Searching...</div>';
  try {
    const url = `https://api.inaturalist.org/v1/observations?q=${encodeURIComponent(q)}&per_page=24&photos=true&order_by=votes`;
    const r = await fetch(url);
    const data = await r.json();
    const items = data.results || [];
    if (!items.length) {
      res.innerHTML = '<div class="search-status">No results</div>';
      return;
    }
    const imgs = [];
    for (const obs of items) {
      for (const photo of obs.photos || []) {
        const thumb = photo.url?.replace("square", "medium");
        const full = photo.url?.replace("square", "large");
        if (thumb && full) imgs.push({ thumb, full });
      }
    }
    if (!imgs.length) {
      res.innerHTML = '<div class="search-status">No images found</div>';
      return;
    }
    res.innerHTML = imgs
      .map(
        (img) =>
          `<div class="search-result-item" onclick="insertImageUrl('${esc(img.full)}')"><img src="${esc(img.thumb)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`,
      )
      .join("");
  } catch (e) {
    res.innerHTML = `<div class="search-status">Error: ${e.message}</div>`;
  }
}

// Pixabay
function savePixabayKey() {
  const key = document.getElementById("pixabay-key").value.trim();
  localStorage.setItem("pixabay-key", key);
}

async function searchPixabay() {
  const key =
    document.getElementById("pixabay-key").value.trim() ||
    localStorage.getItem("pixabay-key") ||
    "";
  if (!key) {
    alert("Please enter your Pixabay API key first.");
    return;
  }
  const q = document.getElementById("search-pixabay").value.trim();
  if (!q) return;
  const res = document.getElementById("results-pixabay");
  res.innerHTML = '<div class="search-status">Searching...</div>';
  try {
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=20&safesearch=true`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) {
      res.innerHTML = `<div class="search-status">Error: ${data.error}</div>`;
      return;
    }
    const hits = data.hits || [];
    if (!hits.length) {
      res.innerHTML = '<div class="search-status">No results</div>';
      return;
    }
    res.innerHTML = hits
      .map(
        (h) =>
          `<div class="search-result-item" onclick="insertImageUrl('${esc(h.largeImageURL)}')"><img src="${esc(h.previewURL)}" loading="lazy"></div>`,
      )
      .join("");
  } catch (e) {
    res.innerHTML = `<div class="search-status">Error: ${e.message}</div>`;
  }
}