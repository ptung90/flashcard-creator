import { state } from './core/state.js'
import { FC_CONFIG } from './core/config.js'
import { showToast } from './storage/storage.js'
import { t } from './i18n.js'
import { esc } from './core/utils.js'

// ── External APIs (Image Search) ──────────────────────────────────

function _imgItem(full, thumb) {
  return `<div class="search-result-item" onclick="insertImageUrl('${esc(full)}')"><img src="${esc(thumb)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
}

export async function _searchImages(inputId, resultId, fetchFn) {
  const q = document.getElementById(inputId).value.trim();
  if (!q) return;
  const res = document.getElementById(resultId);
  res.innerHTML = '<div class="search-status">Searching...</div>';
  try {
    const html = await fetchFn(q);
    res.innerHTML = html || '<div class="search-status">No results</div>';
  } catch (e) {
    res.innerHTML = `<div class="search-status">Error: ${e.message}</div>`;
  }
}

async function _fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// Wikimedia Commons
export async function searchWikimedia() {
  _searchImages("search-wikimedia", "results-wikimedia", async (q) => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=20&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=300&format=json&origin=*`;
    const data = await _fetchJson(url);
    return Object.values(data.query?.pages || {})
      .map(p => { const info = p.imageinfo?.[0]; return info ? _imgItem(info.url, info.thumburl || info.url) : ""; })
      .join("");
  });
}

// iNaturalist
export async function searchINaturalist() {
  _searchImages("search-inaturalist", "results-inaturalist", async (q) => {
    const url = `https://api.inaturalist.org/v1/observations?q=${encodeURIComponent(q)}&per_page=24&photos=true&order_by=votes`;
    const data = await _fetchJson(url);
    const imgs = (data.results || []).flatMap(obs =>
      (obs.photos || []).map(p => ({ thumb: p.url?.replace("square","medium"), full: p.url?.replace("square","large") }))
        .filter(p => p.thumb && p.full)
    );
    return imgs.map(p => _imgItem(p.full, p.thumb)).join("");
  });
}

// Unsplash
const _unsplashCache = {};

export function saveUnsplashKey() {
  const key = document.getElementById("unsplash-key").value.trim();
  localStorage.setItem("unsplash-key", key);
}

export function _unsplashPick(i) {
  const d = _unsplashCache[i];
  if (!d) return;
  const key = document.getElementById("unsplash-key")?.value.trim() || localStorage.getItem("unsplash-key") || "";
  if (key && d.dlUrl) fetch(`${d.dlUrl}?client_id=${encodeURIComponent(key)}`).catch(() => {});
  window.insertUnsplashImage(d.url, { name: d.name, profileUrl: d.profileUrl, photoUrl: d.photoUrl });
}

export async function searchUnsplash() {
  const key = document.getElementById("unsplash-key").value.trim() || localStorage.getItem("unsplash-key") || "";
  if (!key) { alert("Please enter your Unsplash Access Key first."); return; }
  _searchImages("search-unsplash", "results-unsplash", async (q) => {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=20&client_id=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    if (r.status === 401) return '<div class="search-status">Invalid Access Key</div>';
    const data = await r.json();
    return (data.results || []).map((p, i) => {
      _unsplashCache[i] = { url: p.urls.regular, dlUrl: p.links?.download_location || "", name: p.user?.name || "", profileUrl: p.user?.links?.html || "https://unsplash.com", photoUrl: p.links?.html || "https://unsplash.com" };
      return `<div class="search-result-item" title="${esc(_unsplashCache[i].name)}" onclick="_unsplashPick(${i})"><img src="${esc(p.urls.small)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
    }).join("");
  });
}

// ── AI Generate ────────────────────────────────────────────────────
let _aiProvider = localStorage.getItem("ai-provider") || "gemini";
export function getAiProvider() { return _aiProvider; }

export function saveAiKey(provider) {
  const key = document.getElementById(`${provider}-key`).value.trim();
  localStorage.setItem(`${provider}-key`, key);
  showToast(t('ai.keySaved'));
}

export function switchAiProvider(provider) {
  _aiProvider = provider;
  localStorage.setItem("ai-provider", provider);
  document.querySelectorAll(".ai-provider-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.provider === provider)
  );
  document.getElementById("ai-key-gemini").style.display = provider === "gemini" ? "" : "none";
  document.getElementById("ai-key-openai").style.display = provider === "openai" ? "" : "none";
}

export function toggleAiSection() {
  const body = document.getElementById("ai-section-body");
  const chevron = document.getElementById("ai-section-chevron");
  const open = body.style.display === "none";
  body.style.display = open ? "block" : "none";
  chevron.textContent = open ? "▾" : "▸";
  if (open) switchAiProvider(_aiProvider); // sync UI on open
}

export function _buildAiPrompt(subject, snapshot) {
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

const _NOISE_WORDS = /\b(icon|logo|image|photo|picture|img|svg|png|jpg)\b/gi;

function savePexelsKey() {
  const key = document.getElementById('pexels-key').value.trim();
  localStorage.setItem('pexels-key', key);
}

async function _fetchPexelsUrl(query, key) {
  try {
    const params = new URLSearchParams({ query, per_page: '5', orientation: 'landscape' });
    const r = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: key },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.photos?.[0]?.src?.large ?? data.photos?.[0]?.src?.medium ?? null;
  } catch {
    return null;
  }
}

export async function _fetchImageByKeyword(query) {
  const pexelsKey = localStorage.getItem('pexels-key') || '';
  if (pexelsKey) {
    const url = await _fetchPexelsUrl(query, pexelsKey);
    if (url) return url;
  }

  const cleaned = query.replace(_NOISE_WORDS, '').replace(/\s+/g, ' ').trim() || query;
  const _search = async (q) => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=20&prop=imageinfo&iiprop=url|mime&iiurlwidth=900&format=json&origin=*`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const pages = Object.values(data.query?.pages || {});
    const page = pages.find(p => /image\/(jpeg|png|webp)/.test(p.imageinfo?.[0]?.mime || ''));
    return page?.imageinfo?.[0]?.url || null;
  };

  try {
    const url = await _search(cleaned);
    if (url) return url;
    const firstWord = cleaned.split(' ')[0];
    if (firstWord && firstWord !== cleaned) return await _search(firstWord);
    return null;
  } catch {
    return null;
  }
}

export async function _callOpenAI(key, prompt) {
  const messages = Array.isArray(prompt) ? prompt : [{ role: "user", content: prompt }];
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: localStorage.getItem('openai-model') || 'gpt-4o-mini',
      response_format: { type: "json_object" },
      messages,
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

export async function _callGemini(key, prompt) {
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

export async function aiGenerateProject() {
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
    const newProject = getAiProvider() === "gemini"
      ? await _callGemini(key, prompt)
      : await _callOpenAI(key, prompt);
    window.closeJsonModal();
    window.openJsonPreview(JSON.stringify(newProject, null, 2));
  } catch (e) {
    statusEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ Go";
  }
}

// Pixabay
export function savePixabayKey() {
  const key = document.getElementById("pixabay-key").value.trim();
  localStorage.setItem("pixabay-key", key);
}

export async function searchPixabay() {
  const key = document.getElementById("pixabay-key").value.trim() || localStorage.getItem("pixabay-key") || "";
  if (!key) { alert("Please enter your Pixabay API key first."); return; }
  _searchImages("search-pixabay", "results-pixabay", async (q) => {
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=20&safesearch=true`;
    const data = await _fetchJson(url);
    if (data.error) return `<div class="search-status">Error: ${data.error}</div>`;
    return (data.hits || []).map(h => _imgItem(h.largeImageURL, h.previewURL)).join("");
  });
}