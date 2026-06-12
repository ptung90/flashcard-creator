import { state, uiState, getActiveCard } from '../core/state.js'
import { esc, uid } from '../core/utils.js'
import { FC_CONFIG } from '../core/config.js'
import { setDirty, showToast } from '../storage/storage.js'
import { t } from '../i18n.js'
import { getAiProvider, switchAiProvider, _callGemini, _callOpenAI, _fetchImageByKeyword } from '../api.js'
import { _applyImportedRecords } from '../records/ai.js'
import { pushUndo } from '../core/undo.js'

// ── AI Chat Panel ──────────────────────────────────────────────────

const _chatOpsMap = {};

// ── Snapshot helpers ───────────────────────────────────────────────

function _chatProjectSnapshot() {
  const snap = JSON.parse(JSON.stringify({
    project_name: state.projectName, settings: state.settings, cards: state.cards,
  }));
  snap.cards.forEach(function (card) {
    card.images = (card.images || []).map(function (img) {
      return (img && img.url && img.url.startsWith('data:')) ? Object.assign({}, img, { url: '' }) : img;
    });
  });
  return snap;
}

function _chatCompactCards() {
  return state.cards.map(function (c) {
    return {
      id: c.id, layout: c.layout, title: c.title,
      sections: c.sections.map(function (s) {
        return { id: s.id, label: s.label, content: s.content };
      }),
    };
  });
}

// Compact snapshot for rewrite: structure + labels only, no content (saves ~80% tokens)
function _chatRewriteSnapshot() {
  return {
    project_name: state.projectName,
    settings: (function () {
      var s = state.settings;
      return { paperSize: s.paperSize, orientation: s.orientation, customCss: s.customCss || '' };
    })(),
    cards: state.cards.map(function (c) {
      return {
        id: c.id,
        layout: c.layout,
        orientation: c.orientation || null,
        hideTitle: c.hideTitle || false,
        hideSectionLabels: c.hideSectionLabels || false,
        titleFont: c.titleFont || null,
        contentFont: c.contentFont || null,
        customCss: c.customCss || null,
        images: (c.images || []).map(function (img) {
          return { slot: img.slot, size: img.size || null, color: img.color || null };
        }),
        sections: c.sections.map(function (s) {
          return { id: s.id, label: s.label || '', content: '' };
        }),
      };
    }),
  };
}

// ── Prompt templates ───────────────────────────────────────────────

const AI_CHAT_TEMPLATES = [
  {
    id: 'rewrite',
    get label() { return t('ai.tpl.rewrite.label'); },
    get placeholder() { return t('ai.tpl.rewrite.ph'); },
    buildPrompt: function (input) {
      const snap = _chatProjectSnapshot();
      // Ensure every image has search_query:"" so AI knows to fill it
      snap.cards.forEach(function (card) {
        (card.images || []).forEach(function (img) {
          if (!('search_query' in img)) img.search_query = '';
        });
      });
      const cardCount = snap.cards.length;
      const rules = [
        'Return ALL ' + cardCount + ' cards — never fewer, never truncate.',
        'Keep identical structure: same card order, same layout, same number of sections per card.',
        'Keep generic section labels; replace subject-specific labels with accurate equivalents.',
        'Replace title and all section content with accurate, specific facts about the new subject.',
        'Each section: 2–4 sentences of interesting facts. No one-liners.',
        'Write all card content in the same language as the user\'s request. Write the summary field in that same language too.',
        'Use HTML where useful: <strong>term</strong>, <ul><li>item</li></ul>.',
        'Set project_name to the new subject, project_icon to a single relevant emoji.',
        'For EVERY image (including fullimage cards): fill search_query with an English Wikimedia-friendly keyword, set url to "".',
      ].map(function (r, i) { return (i + 1) + '. ' + r; }).join('\n');
      const returnShape = `{ "summary": "Rewrote all ${cardCount} cards for [new subject]", "ops": [{ "type": "SET_PROJECT", "project": { "project_name": "...", "project_icon": "...", "settings": {}, "cards": [] } }] }`;
      const systemContent = [
        'You are a flashcard content generator. Your only job is to rewrite a flashcard project for a new subject and return valid JSON.',
        '',
        'Rules (follow ALL of them):',
        rules,
        '',
        'Return ONLY this JSON shape — no explanation, no markdown:',
        returnShape,
      ].join('\n');
      const userContent = [
        'Rewrite this project for the subject: "' + input + '"',
        'The project has ' + cardCount + ' cards. Return all ' + cardCount + '.',
        '',
        JSON.stringify(snap, null, 2),
      ].join('\n');
      return [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ];
    },
  },
  {
    id: 'add_cards',
    get label() { return t('ai.tpl.add.label'); },
    get placeholder() { return t('ai.tpl.add.ph'); },
    buildPrompt: function (input) {
      const snap = _chatProjectSnapshot();
      const cardSummary = snap.cards.map(function (c) {
        return '  [' + c.layout + '] "' + c.title + '" - sections: ' + c.sections.map(function (s) { return s.label || '(no label)'; }).join(', ');
      }).join('\n');
      const returnShape = '{ "summary": "Added 3 cards about [topic]", "ops": [ { "type": "ADD_CARD", "card": { "layout": "...", "title": "...", "sections": [{"label":"...","content":"..."}], "images": [{"slot":0,"url":"","search_query":"..."}] } } ] }';
      return [
        {
          role: 'system', content: [
            'You are a flashcard content generator. Your only job is to add new cards to an existing project and return valid JSON.',
            '',
            '1. Match the style and section structure of existing cards.',
            '2. Write all content in the same language as the user\'s request. Write the summary in that same language too.',
            '3. Each section: 2–4 sentences of specific, interesting facts. No one-liners.',
            '4. For every image slot: set search_query (English, Wikimedia-friendly keyword), set url to "".',
            '5. Use HTML where useful: <strong>term</strong>, <ul><li>item</li></ul>.',
            '',
            'Return ONLY this JSON shape — no explanation, no markdown:',
            returnShape,
          ].join('\n')
        },
        {
          role: 'user', content: [
            'Project: "' + state.projectName + '" — default layout: "' + FC_CONFIG.newCard.layout + '"',
            'Existing cards:',
            cardSummary,
            '',
            'Request: "' + input + '"',
          ].join('\n')
        },
      ];
    },
  },
  {
    id: 'edit_all',
    get label() { return t('ai.tpl.editAll.label'); },
    get placeholder() { return t('ai.tpl.editAll.ph'); },
    buildPrompt: function (input) {
      const cards = _chatCompactCards();
      const returnShape = '{ "summary": "Shortened content on 4 cards to max 2 sentences", "ops": [ { "type": "UPDATE_CARD", "id": "...", "patch": { "title": "...", "sections": [{"id":"...","label":"...","content":"..."}] } } ] }';
      return [
        {
          role: 'system', content: [
            'You are a flashcard editor. Apply the requested change to flashcard content and return valid JSON.',
            '',
            '1. Only include cards that actually need changes.',
            '2. Keep existing section IDs; new sections can omit id.',
            '3. Write all content in the same language as the user\'s request. Write the summary in that same language too.',
            '4. Use HTML where useful: <strong>term</strong>, <ul><li>item</li></ul>.',
            '',
            'Return ONLY this JSON shape — no explanation, no markdown:',
            returnShape,
          ].join('\n')
        },
        {
          role: 'user', content: [
            'Cards:',
            JSON.stringify(cards, null, 2),
            '',
            'Request: "' + input + '"',
          ].join('\n')
        },
      ];
    },
  },
  {
    id: 'edit_active',
    get label() { return t('ai.tpl.editActive.label'); },
    get placeholder() { return t('ai.tpl.editActive.ph'); },
    buildPrompt: function (input) {
      const card = getActiveCard();
      if (!card) return null;
      const cardData = { id: card.id, layout: card.layout, title: card.title, sections: card.sections };
      const returnShape = `{ "summary": "Updated title and 3 sections on card '${card.id}'", "ops": [ { "type": "UPDATE_CARD", "id": "${card.id}", "patch": { "title": "...", "sections": [{"id":"...","label":"...","content":"..."}] } } ] }`;
      return [
        {
          role: 'system', content: [
            'You are a flashcard editor. Edit the given card based on the request and return valid JSON.',
            '',
            '1. Keep existing section IDs; new sections can omit id.',
            '2. Write all content in the same language as the user\'s request. Write the summary in that same language too.',
            '3. Use HTML where useful: <strong>term</strong>, <ul><li>item</li></ul>.',
            '',
            'Return ONLY this JSON shape — no explanation, no markdown:',
            returnShape,
          ].join('\n')
        },
        {
          role: 'user', content: [
            'Card:',
            JSON.stringify(cardData, null, 2),
            '',
            'Request: "' + input + '"',
          ].join('\n')
        },
      ];
    },
  },
  {
    id: 'generate_records',
    get label() { return t('ai.tpl.genRecords.label'); },
    get placeholder() { return t('ai.tpl.genRecords.ph'); },
    buildPrompt: function (input) {
      if (!state.schema || !state.schema.fields.length) return null;
      const allFields = state.schema.fields;
      const textFields = allFields.filter(function (f) { return f.type !== 'image'; });
      const imageFields = allFields.filter(function (f) { return f.type === 'image'; });

      // Parse leading number as count, rest as hint
      const match = input.match(/^(\d+)\s*(.*)/);
      const n = match ? parseInt(match[1], 10) : 1;
      const hint = match ? match[2].trim() : input.trim();

      const schemaLines = allFields.map(function (f) { return '- ' + f.key + ' (' + f.type + '): ' + f.label; }).join('\n');
      const imgNote = imageFields.length
        ? '\n5. image fields: set value to a concise English Wikimedia search keyword — NOT a URL.'
        : '';
      const returnShape = `{ "summary": "Generated ${n} records about [topic]", "ops": [{ "type": "GENERATE_RECORDS", "records": [{ `
        + allFields.map(function (f) { return '"' + f.key + '": "..."'; }).join(', ')
        + ' }] }] }';

      // Up to 3 sample records with most filled text fields
      const samples = state.records.slice().sort(function (a, b) {
        return textFields.filter(function (f) { return (b.fields[f.key] || '').trim(); }).length
          - textFields.filter(function (f) { return (a.fields[f.key] || '').trim(); }).length;
      }).slice(0, 3).map(function (r) {
        const obj = {};
        allFields.forEach(function (f) {
          const v = r.fields[f.key] || '';
          obj[f.key] = (f.type === 'image' && v.startsWith('data:')) ? '' : v;
        });
        return obj;
      });

      const existingNames = state.records
        .map(function (r) { return (r.fields['name'] || '').trim(); })
        .filter(Boolean);

      return [
        {
          role: 'system', content: [
            'You are a record data generator. Generate new records and return valid JSON.',
            '',
            'Schema:',
            schemaLines,
            ...(existingNames.length ? [
              '',
              'Already exists — DO NOT generate these or anything too similar:',
              existingNames.map(function (name) { return '- ' + name; }).join('\n'),
            ] : []),
            '',
            'Rules:',
            '1. Return ONLY the JSON shape below — no explanation, no markdown fences.',
            '2. Generate exactly ' + n + ' records, all distinct.',
            '3. Write all text content in the same language as the user\'s request. Write the summary in that same language too.',
            '4. text/text-long fields: 2–4 sentences, specific facts. Use Markdown (**bold**, - lists). No HTML.',
            '5. Each record must be unique — no duplicates with each other or with existing records.' + imgNote,
            '',
            'Return ONLY this JSON shape:',
            returnShape,
          ].join('\n')
        },
        {
          role: 'user', content: [
            samples.length ? ('Sample records (match style — do NOT repeat):\n' + JSON.stringify(samples, null, 2)) : '',
            '',
            'Generate ' + n + ' new records' + (hint ? ' about: "' + hint + '"' : '') + '.',
          ].filter(Boolean).join('\n')
        },
      ];
    },
  },
];

// ── Dialog open / close ────────────────────────────────────────────

const _CHAT_MODELS = {
  gemini: [
    { value: 'gemini-2.0-flash', label: '2.0 Flash' },
    { value: 'gemini-2.5-flash-preview-05-20', label: '2.5 Flash' },
    { value: 'gemini-2.5-pro-preview-05-06', label: '2.5 Pro' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: '4o-mini' },
    { value: 'gpt-4o', label: '4o' },
  ],
};

const _ALL_CHAT_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
];

function _populateChatModelSelect() {
  const sel = document.getElementById('ai-chat-model-select');
  if (!sel) return;
  const provider = getAiProvider();
  const savedModel = localStorage.getItem(`${provider}-model`)
    || _ALL_CHAT_MODELS.find(function (m) { return m.provider === provider; })?.value;
  sel.innerHTML = _ALL_CHAT_MODELS.map(function (m) {
    return '<option value="' + m.value + '"' + (m.value === savedModel ? ' selected' : '') + '>' + m.label + '</option>';
  }).join('');
  // Sync provider to match the actually-selected model
  const selectedModel = _ALL_CHAT_MODELS.find(function (m) { return m.value === sel.value; });
  if (selectedModel && selectedModel.provider !== provider) switchAiProvider(selectedModel.provider);
}

export function onAiChatModelChange(value) {
  const m = _ALL_CHAT_MODELS.find(function (m) { return m.value === value; });
  if (!m) return;
  switchAiProvider(m.provider);
  localStorage.setItem(`${m.provider}-model`, value);
}

export function openAiChat(templateId) {
  const panel = document.getElementById('ai-chat-panel');
  if (!panel) return;
  _populateChatTemplateSelect();
  _populateChatModelSelect();
  if (templateId) {
    const sel = document.getElementById('ai-chat-template-select');
    if (sel) sel.value = templateId;
  }
  onAiTemplateChange();
  panel.classList.remove('minimized');
  panel.style.display = 'flex';
  document.getElementById('ai-chat-input').focus();
}

export function closeAiChat() {
  const panel = document.getElementById('ai-chat-panel');
  if (panel) panel.style.display = 'none';
}

export function toggleAiChatMinimize() {
  const panel = document.getElementById('ai-chat-panel');
  if (panel) panel.classList.toggle('minimized');
}

export function _populateChatTemplateSelect() {
  const sel = document.getElementById('ai-chat-template-select');
  if (!sel || sel.dataset.ready) return;
  sel.innerHTML = AI_CHAT_TEMPLATES.map(function (t) {
    return '<option value="' + t.id + '">' + esc(t.label) + '</option>';
  }).join('');
  sel.dataset.ready = '1';
}

export function onAiTemplateChange() {
  const sel = document.getElementById('ai-chat-template-select');
  const inp = document.getElementById('ai-chat-input');
  if (!sel || !inp) return;
  const tpl = AI_CHAT_TEMPLATES.find(function (t) { return t.id === sel.value; });
  if (tpl) inp.placeholder = tpl.placeholder;
}

// ── Send ───────────────────────────────────────────────────────────

export async function sendAiChat() {
  const inp = document.getElementById('ai-chat-input');
  const sel = document.getElementById('ai-chat-template-select');
  const text = inp ? inp.value.trim() : '';
  if (!text) return;

  const tpl = AI_CHAT_TEMPLATES.find(function (t) { return t.id === (sel && sel.value); }) || AI_CHAT_TEMPLATES[0];
  let provider = getAiProvider();
  let key = localStorage.getItem(`${provider}-key`) || '';
  if (!key) {
    _appendAiMessage(`No ${provider} key set. Add it in Settings → AI (⋯ toolbar).`);
    return;
  }

  _appendUserMessage(text, tpl.label);
  inp.value = '';
  _setChatSending(true);

  const prompt = tpl.buildPrompt(text);
  if (!prompt) {
    _appendAiMessage('No active card selected. Click a card first, then try again.');
    _setChatSending(false);
    return;
  }

  _appendAiTyping();

  try {
    const result = provider === 'gemini'
      ? await _callGemini(key, prompt)
      : await _callOpenAI(key, prompt);
    _removeTyping();
    if (!result || !result.ops || !result.ops.length) {
      _appendAiMessage('No changes returned. Try rephrasing your request.');
      return;
    }
    _appendAiMessage(result.summary || 'Done. Review the changes below.', result.ops);
  } catch (e) {
    _removeTyping();
    _appendAiMessage('Error: ' + e.message);
  } finally {
    _setChatSending(false);
  }
}

function _setChatSending(on) {
  const btn = document.getElementById('ai-chat-send-btn');
  if (!btn) return;
  btn.disabled = on;
  btn.textContent = on ? '…' : 'Send';
}

// ── Apply ops ──────────────────────────────────────────────────────

export function applyAiChatOps(msgId) {
  const ops = _chatOpsMap[msgId];
  if (!ops || !ops.length) return;
  delete _chatOpsMap[msgId];
  pushUndo();

  ops.forEach(function (op) {
    if (op.type === 'SET_PROJECT' && op.project) {
      const p = op.project;
      state.cards = (p.cards || []).map(function (c) {
        return Object.assign({}, c, {
          id: c.id || uid(),
          sections: (c.sections || []).map(function (s) { return Object.assign({}, s, { id: s.id || uid() }); }),
          images: c.images || [],
        });
      });
      state.projectName = p.project_name || state.projectName;
      const nameEl = document.getElementById('project-name-input');
      if (nameEl) nameEl.value = state.projectName;
      if (p.project_icon) {
        state.projectIcon = p.project_icon;
        const iconEl = document.getElementById('project-icon-btn');
        if (iconEl) iconEl.textContent = p.project_icon;
      }
    }

    if (op.type === 'ADD_CARD' && op.card) {
      state.cards.push(Object.assign({}, op.card, {
        id: uid(),
        sections: (op.card.sections || []).map(function (s) { return Object.assign({}, s, { id: uid() }); }),
        images: op.card.images || [],
      }));
    }

    if (op.type === 'UPDATE_CARD' && op.id && op.patch) {
      const card = state.cards.find(function (c) { return c.id === op.id; });
      if (card) {
        if (op.patch.title !== undefined) card.title = op.patch.title;
        if (op.patch.layout) card.layout = op.patch.layout;
        if (op.patch.sections) {
          card.sections = op.patch.sections.map(function (s) { return Object.assign({}, s, { id: s.id || uid() }); });
        }
      }
    }

    if (op.type === 'DELETE_CARD' && op.id) {
      state.cards = state.cards.filter(function (c) { return c.id !== op.id; });
    }

    if (op.type === 'GENERATE_RECORDS' && Array.isArray(op.records) && op.records.length) {
      _applyImportedRecords(JSON.stringify(op.records), true);
    }
  });

  window.dispatch('FULL_STATE_UPDATED');

  // Auto-fetch images with search_query but no url
  const pending = [];
  state.cards.forEach(function (card) {
    (card.images || []).forEach(function (img) {
      if (img.search_query && !img.url) pending.push(img);
    });
  });
  if (pending.length) {
    showToast('Fetching ' + pending.length + ' image' + (pending.length > 1 ? 's' : '') + '...');
    let filled = 0;
    Promise.all(pending.map(function (img) {
      return _fetchImageByKeyword(img.search_query).then(function (url) {
        if (url) { img.url = url; filled++; }
      }).catch(function () { });
    })).then(function () {
      if (filled) window.dispatch('CARD_UI_CHANGED');
    });
  }
}

// ── Bubble rendering ───────────────────────────────────────────────

function _appendUserMessage(text, templateLabel) {
  const wrap = document.getElementById('ai-chat-messages');
  if (!wrap) return;
  const div = document.createElement('div');
  div.className = 'ai-chat-bubble ai-chat-bubble--user';
  div.innerHTML = '<span class="ai-chat-label">' + esc(templateLabel) + '</span>' + esc(text);
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function _appendAiMessage(text, ops) {
  const wrap = document.getElementById('ai-chat-messages');
  if (!wrap) return;
  const div = document.createElement('div');
  div.className = 'ai-chat-bubble ai-chat-bubble--ai';
  let html = '<div class="ai-chat-text">' + esc(text) + '</div>';
  if (ops && ops.length) {
    const msgId = uid();
    _chatOpsMap[msgId] = ops;
    html += '<div class="ai-chat-actions">'
      + '<span class="ai-chat-ops-count">' + ops.length + ' operation' + (ops.length > 1 ? 's' : '') + '</span>'
      + '<button class="btn btn-primary btn-sm" onclick="applyAiChatOps(\'' + msgId + '\')">Apply</button>'
      + '</div>';
  }
  div.innerHTML = html;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function _appendAiTyping() {
  const wrap = document.getElementById('ai-chat-messages');
  if (!wrap) return;
  const div = document.createElement('div');
  div.id = 'ai-chat-typing';
  div.className = 'ai-chat-bubble ai-chat-bubble--ai ai-chat-typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function _removeTyping() {
  const el = document.getElementById('ai-chat-typing');
  if (el) el.remove();
}
