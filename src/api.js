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

// Unsplash
const _unsplashCache = {};

function saveUnsplashKey() {
  const key = document.getElementById("unsplash-key").value.trim();
  localStorage.setItem("unsplash-key", key);
}

function _unsplashPick(i) {
  const d = _unsplashCache[i];
  if (!d) return;
  const key = document.getElementById("unsplash-key")?.value.trim()
    || localStorage.getItem("unsplash-key") || "";
  if (key && d.dlUrl) {
    fetch(`${d.dlUrl}?client_id=${encodeURIComponent(key)}`).catch(() => {});
  }
  insertUnsplashImage(d.url, { name: d.name, profileUrl: d.profileUrl, photoUrl: d.photoUrl });
}

async function searchUnsplash() {
  const key =
    document.getElementById("unsplash-key").value.trim() ||
    localStorage.getItem("unsplash-key") ||
    "";
  if (!key) {
    alert("Please enter your Unsplash Access Key first.");
    return;
  }
  const q = document.getElementById("search-unsplash").value.trim();
  if (!q) return;
  const res = document.getElementById("results-unsplash");
  res.innerHTML = '<div class="search-status">Searching...</div>';
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=20&client_id=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    if (r.status === 401) {
      res.innerHTML = '<div class="search-status">Invalid Access Key</div>';
      return;
    }
    const data = await r.json();
    const results = data.results || [];
    if (!results.length) {
      res.innerHTML = '<div class="search-status">No results</div>';
      return;
    }
    res.innerHTML = results
      .map((p, i) => {
        const thumb = p.urls.small;
        _unsplashCache[i] = {
          url: p.urls.regular,
          dlUrl: p.links?.download_location || "",
          name: p.user?.name || "",
          profileUrl: p.user?.links?.html || "https://unsplash.com",
          photoUrl: p.links?.html || "https://unsplash.com",
        };
        return `<div class="search-result-item" title="${esc(_unsplashCache[i].name)}" onclick="_unsplashPick(${i})"><img src="${esc(thumb)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
      })
      .join("");
  } catch (e) {
    res.innerHTML = `<div class="search-status">Error: ${e.message}</div>`;
  }
}

// ── AI Generate ────────────────────────────────────────────────────
let _aiProvider = localStorage.getItem("ai-provider") || "gemini";

function saveAiKey(provider) {
  const key = document.getElementById(`${provider}-key`).value.trim();
  localStorage.setItem(`${provider}-key`, key);
  showToast(t('ai.keySaved'));
}

function switchAiProvider(provider) {
  _aiProvider = provider;
  localStorage.setItem("ai-provider", provider);
  document.querySelectorAll(".ai-provider-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.provider === provider)
  );
  document.getElementById("ai-key-gemini").style.display = provider === "gemini" ? "" : "none";
  document.getElementById("ai-key-openai").style.display = provider === "openai" ? "" : "none";
}

function toggleAiSection() {
  const body = document.getElementById("ai-section-body");
  const chevron = document.getElementById("ai-section-chevron");
  const open = body.style.display === "none";
  body.style.display = open ? "block" : "none";
  chevron.textContent = open ? "▾" : "▸";
  if (open) switchAiProvider(_aiProvider); // sync UI on open
}

function _buildAiPrompt(subject, snapshot) {
  return `You are a flashcard content generator. Rewrite the flashcard project JSON below for the new subject: "${subject}".

Rules:
- Keep identical JSON structure (same number of cards, same layouts, same number of sections per card)
- Keep generic section label names unchanged (e.g. "Kích thước", "Sinh sản", "Phân bố"); replace subject-specific labels that reference the original topic name with accurate equivalents for the new subject
- Replace title and section content with accurate, detailed information about the new subject
- Each section content should be 2–4 sentences with specific, interesting facts — avoid one-liners
- Write in the same language as the original project content
- Use markdown where helpful (bold key terms, bullet points for lists)
- Keep all settings, fonts, and layout configurations unchanged
- Set "project_name" to the new subject
- Set "project_icon" to a single emoji that best represents the subject theme
- For each image object in card.images: set "search_query" to a concise English search term that would find a relevant image on Wikipedia/Wikimedia Commons (e.g. species binomial name, landmark name); set "url" to ""
- Return ONLY valid JSON matching the exact same schema, no explanation

Project JSON:
${JSON.stringify(snapshot, null, 2)}`;
}

async function _wikimediaFirstResult(query) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json&origin=*`;
  const r = await fetch(url);
  const data = await r.json();
  const pages = Object.values(data.query?.pages || {});
  for (const p of pages) {
    const u = p.imageinfo?.[0]?.url;
    if (u) return u;
  }
  return null;
}

async function _callOpenAI(key, prompt) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (r.status === 401) throw Object.assign(new Error(t('ai.badKey')), { handled: true });
  if (r.status === 429) throw Object.assign(new Error(t('ai.rateLimit')), { handled: true });
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { const e = await r.json(); msg = e.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(t('ai.emptyResponse'));
  return JSON.parse(content);
}

async function _callGemini(key, prompt) {
  const model = (document.getElementById("gemini-model")?.value.trim()
    || localStorage.getItem("gemini-model") || "gemini-2.0-flash");
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    }
  );
  if (!r.ok) {
    let detail = "";
    try { const e = await r.json(); detail = e.error?.message || ""; } catch {}
    if (r.status === 400 && !detail) throw new Error(t('ai.badKey'));
    if (r.status === 429 || r.status === 403)
      throw new Error(`${t('ai.rateLimit')}${detail ? `: ${detail}` : ""}`);
    throw new Error(detail || `Error ${r.status}`);
  }
  const data = await r.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error(t('ai.emptyResponse'));
  return JSON.parse(content);
}

async function aiGenerateProject() {
  const key = document.getElementById(`${_aiProvider}-key`).value.trim()
    || localStorage.getItem(`${_aiProvider}-key`) || "";
  if (!key) { showToast(t('ai.noKey')); return; }

  const subject = document.getElementById("ai-subject").value.trim();
  if (!subject) { showToast(t('ai.noSubject')); return; }

  const statusEl = document.getElementById("ai-status");
  const btn = document.getElementById("ai-generate-btn");
  btn.disabled = true;
  btn.textContent = "…";
  statusEl.textContent = t('ai.generating');

  const snapshot = JSON.parse(JSON.stringify({
    project_name: state.projectName, settings: state.settings, cards: state.cards
  }));
  snapshot.cards.forEach(card => {
    card.images = (card.images || []).map(img =>
      img?.url?.startsWith("data:") ? { ...img, url: "" } : img
    );
  });

  try {
    const prompt = _buildAiPrompt(subject, snapshot);
    const newProject = _aiProvider === "gemini"
      ? await _callGemini(key, prompt)
      : await _callOpenAI(key, prompt);
    closeJsonModal();
    openJsonPreview(JSON.stringify(newProject, null, 2));
  } catch (e) {
    statusEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ Go";
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