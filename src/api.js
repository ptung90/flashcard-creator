// ── External APIs (Image Search) ──────────────────────────────────

const _searchState = {
  wikimedia:   { q: '', offset: 0, hasMore: false },
  inaturalist: { q: '', page: 1,   hasMore: false },
  pixabay:     { q: '', page: 1,   hasMore: false },
};

function _appendResults(containerId, html, hasMore, loadMoreFn) {
  const res = document.getElementById(containerId);
  // Remove existing "Load more" button before appending
  res.querySelector('.search-load-more')?.remove();
  res.insertAdjacentHTML('beforeend', html);
  if (hasMore) {
    res.insertAdjacentHTML('beforeend',
      `<div class="search-load-more" style="grid-column:1/-1;padding:8px 0;text-align:center">
        <button class="btn btn-secondary btn-sm" onclick="${loadMoreFn}()">Load more</button>
      </div>`
    );
  }
}

// Wikimedia Commons
async function searchWikimedia(append = false) {
  const q = document.getElementById("search-wikimedia").value.trim();
  if (!q) return;
  const res = document.getElementById("results-wikimedia");

  if (!append || _searchState.wikimedia.q !== q) {
    _searchState.wikimedia = { q, offset: 0, hasMore: false };
    res.innerHTML = '<div class="search-status">Searching...</div>';
  } else {
    res.querySelector('.search-load-more')?.remove();
    res.insertAdjacentHTML('beforeend', '<div class="search-status-inline" style="grid-column:1/-1;text-align:center;padding:6px;font-size:12px;color:#6b7280">Loading...</div>');
  }

  const { offset } = _searchState.wikimedia;
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=20&gsroffset=${offset}&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=300&format=json&origin=*`;
    const r = await fetch(url);
    const data = await r.json();

    res.querySelector('.search-status-inline')?.remove();

    const pages = Object.values(data.query?.pages || {});
    const nextOffset = data['query-continue']?.generator?.gsroffset ?? data.continue?.gsroffset;
    _searchState.wikimedia.hasMore = !!nextOffset;
    _searchState.wikimedia.offset = nextOffset || 0;

    if (!pages.length) {
      if (!append) res.innerHTML = '<div class="search-status">No results</div>';
      return;
    }

    const html = pages.map((p) => {
      const info = p.imageinfo?.[0];
      if (!info) return "";
      const thumb = info.thumburl || info.url;
      return `<div class="search-result-item" onclick="insertImageUrl('${esc(info.url)}')"><img src="${esc(thumb)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
    }).join("");

    if (!append) res.innerHTML = html;
    else _appendResults("results-wikimedia", html, _searchState.wikimedia.hasMore, "loadMoreWikimedia");

    if (!append && _searchState.wikimedia.hasMore) {
      res.insertAdjacentHTML('beforeend',
        `<div class="search-load-more" style="grid-column:1/-1;padding:8px 0;text-align:center">
          <button class="btn btn-secondary btn-sm" onclick="loadMoreWikimedia()">Load more</button>
        </div>`
      );
    }
  } catch (e) {
    res.querySelector('.search-status-inline')?.remove();
    if (!append) res.innerHTML = `<div class="search-status">Error: ${e.message}</div>`;
  }
}

function loadMoreWikimedia() { searchWikimedia(true); }

// iNaturalist
async function searchINaturalist(append = false) {
  const q = document.getElementById("search-inaturalist").value.trim();
  if (!q) return;
  const res = document.getElementById("results-inaturalist");

  if (!append || _searchState.inaturalist.q !== q) {
    _searchState.inaturalist = { q, page: 1, hasMore: false };
    res.innerHTML = '<div class="search-status">Searching...</div>';
  } else {
    res.querySelector('.search-load-more')?.remove();
    res.insertAdjacentHTML('beforeend', '<div class="search-status-inline" style="grid-column:1/-1;text-align:center;padding:6px;font-size:12px;color:#6b7280">Loading...</div>');
  }

  const perPage = 24;
  const { page } = _searchState.inaturalist;
  try {
    const url = `https://api.inaturalist.org/v1/observations?q=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&photos=true&order_by=votes`;
    const r = await fetch(url);
    const data = await r.json();

    res.querySelector('.search-status-inline')?.remove();

    const items = data.results || [];
    _searchState.inaturalist.hasMore = (data.total_results || 0) > page * perPage;
    _searchState.inaturalist.page = page + 1;

    const imgs = [];
    for (const obs of items) {
      for (const photo of obs.photos || []) {
        const thumb = photo.url?.replace("square", "medium");
        const full = photo.url?.replace("square", "large");
        if (thumb && full) imgs.push({ thumb, full });
      }
    }

    if (!imgs.length) {
      if (!append) res.innerHTML = '<div class="search-status">No images found</div>';
      return;
    }

    const html = imgs.map((img) =>
      `<div class="search-result-item" onclick="insertImageUrl('${esc(img.full)}')"><img src="${esc(img.thumb)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
    ).join("");

    if (!append) {
      res.innerHTML = html;
      if (_searchState.inaturalist.hasMore) {
        res.insertAdjacentHTML('beforeend',
          `<div class="search-load-more" style="grid-column:1/-1;padding:8px 0;text-align:center">
            <button class="btn btn-secondary btn-sm" onclick="loadMoreINaturalist()">Load more</button>
          </div>`
        );
      }
    } else {
      _appendResults("results-inaturalist", html, _searchState.inaturalist.hasMore, "loadMoreINaturalist");
    }
  } catch (e) {
    res.querySelector('.search-status-inline')?.remove();
    if (!append) res.innerHTML = `<div class="search-status">Error: ${e.message}</div>`;
  }
}

function loadMoreINaturalist() { searchINaturalist(true); }

// Pixabay
function savePixabayKey() {
  const key = document.getElementById("pixabay-key").value.trim();
  localStorage.setItem("pixabay-key", key);
}

async function searchPixabay(append = false) {
  const key =
    document.getElementById("pixabay-key").value.trim() ||
    localStorage.getItem("pixabay-key") || "";
  if (!key) { alert("Please enter your Pixabay API key first."); return; }

  const q = document.getElementById("search-pixabay").value.trim();
  if (!q) return;
  const res = document.getElementById("results-pixabay");

  if (!append || _searchState.pixabay.q !== q) {
    _searchState.pixabay = { q, page: 1, hasMore: false };
    res.innerHTML = '<div class="search-status">Searching...</div>';
  } else {
    res.querySelector('.search-load-more')?.remove();
    res.insertAdjacentHTML('beforeend', '<div class="search-status-inline" style="grid-column:1/-1;text-align:center;padding:6px;font-size:12px;color:#6b7280">Loading...</div>');
  }

  const perPage = 20;
  const { page } = _searchState.pixabay;
  try {
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&safesearch=true`;
    const r = await fetch(url);
    const data = await r.json();

    res.querySelector('.search-status-inline')?.remove();

    if (data.error) {
      if (!append) res.innerHTML = `<div class="search-status">Error: ${data.error}</div>`;
      return;
    }

    const hits = data.hits || [];
    _searchState.pixabay.hasMore = (data.totalHits || 0) > page * perPage;
    _searchState.pixabay.page = page + 1;

    if (!hits.length) {
      if (!append) res.innerHTML = '<div class="search-status">No results</div>';
      return;
    }

    const html = hits.map((h) =>
      `<div class="search-result-item" onclick="insertImageUrl('${esc(h.largeImageURL)}')"><img src="${esc(h.previewURL)}" loading="lazy"></div>`
    ).join("");

    if (!append) {
      res.innerHTML = html;
      if (_searchState.pixabay.hasMore) {
        res.insertAdjacentHTML('beforeend',
          `<div class="search-load-more" style="grid-column:1/-1;padding:8px 0;text-align:center">
            <button class="btn btn-secondary btn-sm" onclick="loadMorePixabay()">Load more</button>
          </div>`
        );
      }
    } else {
      _appendResults("results-pixabay", html, _searchState.pixabay.hasMore, "loadMorePixabay");
    }
  } catch (e) {
    res.querySelector('.search-status-inline')?.remove();
    if (!append) res.innerHTML = `<div class="search-status">Error: ${e.message}</div>`;
  }
}

function loadMorePixabay() { searchPixabay(true); }
