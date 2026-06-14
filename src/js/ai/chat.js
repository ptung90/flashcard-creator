import { state, uiState, getActiveCard, getLocaleValue } from '../core/state.js'
import { esc, uid } from '../core/utils.js'
import { FC_CONFIG } from '../core/config.js'
import { setDirty, showToast } from '../storage/storage.js'
import { t } from '../i18n.js'
import { getAiProvider, switchAiProvider, _callGemini, _callOpenAI, _fetchImageByKeyword } from '../api.js'
import { _applyImportedRecords, translateRecords } from '../records/ai.js'
import { pushUndo } from '../core/undo.js'

// ── AI Chat Panel ──────────────────────────────────────────────────

const _chatOpsMap = {};

let _pendingTranslateIds = null;

// ── Snapshot helpers ───────────────────────────────────────────────

function _chatProjectSnapshot_old() {
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

function _chatProjectSnapshot() {
  const snap = JSON.parse(JSON.stringify({
    project_name: state.projectName, settings: state.settings, records: state.records,
  }));

  snap.records.forEach(function (record) {
    if (
      record.image &&
      typeof record.image === 'string' &&
      record.image.startsWith('data:')
    ) {
      record.image = '';
    }
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
    id: 'rewrite_records',
    get label() { return t('ai.tpl.rewriteRecords.label'); },
    get placeholder() { return t('ai.tpl.rewriteRecords.ph'); },
    buildPrompt: function (input) {
      const localeSel = document.getElementById('ai-chat-locale-select');
      const targetLocale = (localeSel && localeSel.style.display !== 'none' && localeSel.value) ? localeSel.value : state.activeLocale;
      // Collect all schemas that have records
      const schemaData = state.schemas.map(function (s) {
        const recs = state.records.filter(function (r) { return r.schemaId === s.id; });
        if (!recs.length) return null;
        return { schema: s, recs: recs };
      }).filter(Boolean);
      if (!schemaData.length) return null;

      const totalCount = schemaData.reduce(function (n, d) { return n + d.recs.length; }, 0);
      const hasImages = schemaData.some(function (d) { return d.schema.fields.some(function (f) { return f.type === 'image'; }); });

      // Schema descriptions (for system prompt)
      const schemaDescriptions = schemaData.map(function (d) {
        const fieldLines = d.schema.fields.map(function (f) { return '  - ' + f.key + ' (' + f.type + '): ' + f.label; }).join('\n');
        return 'Schema "' + d.schema.name + '" [' + d.schema.id + '] — ' + d.recs.length + ' records:\n' + fieldLines;
      }).join('\n\n');

      // Current records: strip image data URLs → "", send all other fields in full
      const recordsData = schemaData.map(function (d) {
        const rows = d.recs.map(function (r) {
          const obj = {};
          d.schema.fields.forEach(function (f) {
            if (f.type === 'image') { obj[f.key] = ''; return; }
            obj[f.key] = getLocaleValue(r.fields[f.key], targetLocale) || '';
          });
          return obj;
        });
        return 'Schema "' + d.schema.name + '" [' + d.schema.id + ']:\n' + JSON.stringify(rows, null, 2);
      }).join('\n\n');

      // Compute per-field average word counts across all records (for length instruction)
      const rwWordCounts = {};
      schemaData.forEach(function (d) {
        d.schema.fields.filter(function (f) { return f.type !== 'image'; }).forEach(function (f) {
          const total = d.recs.reduce(function (sum, r) {
            return sum + (getLocaleValue(r.fields[f.key], targetLocale) || '').split(/\s+/).filter(Boolean).length;
          }, 0);
          const avg = Math.round(total / d.recs.length);
          if (avg > 0) rwWordCounts[f.key] = Math.max(rwWordCounts[f.key] || 0, avg);
        });
      });
      const rwWordHint = Object.keys(rwWordCounts).length
        ? ' Approximate word counts to match: ' + Object.entries(rwWordCounts).map(function (e) { return '"' + e[0] + '": ~' + e[1] + ' words'; }).join(', ') + '.'
        : '';

      // Return shape: one REPLACE_RECORDS op per schema
      const opsShape = schemaData.map(function (d, i) {
        const ex = '{ ' + d.schema.fields.map(function (f) {
          if (f.type === 'text-long') return '"' + f.key + '": "<detailed text>"';
          if (f.type === 'image') return '"' + f.key + '": "<search keyword>"';
          return '"' + f.key + '": "<text>"';
        }).join(', ') + ' }';
        const proj = (i === 0) ? '"project_name": "...", "project_icon": "🐟", ' : '';
        return '{ ' + proj + '"type": "REPLACE_RECORDS", "schema_id": "' + d.schema.id + '", "records": [' + ex + ', … (' + d.recs.length + ' total)] }';
      }).join(', ');
      const returnShape = '{ "summary": "Rewrote ' + totalCount + ' records for [new subject]", "ops": [' + opsShape + '] }';

      const ruleLines = [
        'Return one REPLACE_RECORDS op per schema. For each schema, return EXACTLY the number of records shown (the count in parentheses).',
        'Keep all field structures; replace every piece of content with accurate facts about the new subject.',
        'Write ALL text content in ' + targetLocale.toUpperCase() + '. Write the summary in ' + targetLocale.toUpperCase() + ' too.',
        'text/text-long fields: rewrite with relevant facts. Match the depth and style of each original record EXACTLY — do NOT write less.' + rwWordHint,
        ...(hasImages ? ['image fields: derive a specific English Wikimedia search keyword from each record\'s name/subject — one distinct keyword per record, NOT a URL.'] : []),
        'Set project_name and project_icon in the FIRST op only.',
        'Return ONLY the JSON shape below — no explanation, no markdown fences.',
      ];

      return [
        {
          role: 'system', content: [
            'You are a record data rewriter. Rewrite ALL provided records for a new subject and return valid JSON.',
            '',
            'Schemas:',
            schemaDescriptions,
            '',
            'Rules:',
            ruleLines.map(function (r, i) { return (i + 1) + '. ' + r; }).join('\n'),
            '',
            'Return ONLY this JSON shape:',
            returnShape,
          ].join('\n'),
        },
        {
          role: 'user', content: [
            'New subject: "' + input + '"',
            '',
            'Current records (rewrite all, keep exact counts per schema):',
            recordsData,
          ].join('\n'),
        },
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
      const schema = state.schemas.find(s => s.id === uiState.activeSchemaId) || state.schemas[0];
      if (!schema?.fields.length) return null;
      const allFields = schema.fields;
      const textFields = allFields.filter(function (f) { return f.type !== 'image'; });
      const imageFields = allFields.filter(function (f) { return f.type === 'image'; });

      // Parse leading number as count, rest as hint
      const match = input.match(/^(\d+)\s*(.*)/);
      const n = match ? parseInt(match[1], 10) : 1;
      const hint = match ? match[2].trim() : input.trim();

      const schemaLines = allFields.map(function (f) { return '- ' + f.key + ' (' + f.type + '): ' + f.label; }).join('\n');
      const imgNote = imageFields.length
        ? ['6. image fields: derive a specific English Wikimedia search keyword from each record\'s name/subject — one distinct keyword per record, NOT a URL (e.g. for "Blue-ringed Octopus" use "blue-ringed octopus", not "octopus").']
        : [];
      const localeSel = document.getElementById('ai-chat-locale-select');
      const targetLocale = (localeSel && localeSel.style.display !== 'none' && localeSel.value) ? localeSel.value : state.activeLocale;

      const returnShape = `{ "summary": "Generated ${n} records about [topic]", "ops": [{ "type": "GENERATE_RECORDS", "records": [{ `
        + allFields.map(function (f) {
            if (f.type === 'text-long') return '"' + f.key + '": "<detailed multi-sentence text>"';
            if (f.type === 'image') return '"' + f.key + '": "<search keyword>"';
            return '"' + f.key + '": "..."';
          }).join(', ')
        + ' }] }] }';

      // Up to 3 sample records with most filled text fields (from targetLocale)
      const samples = state.records.slice().sort(function (a, b) {
        return textFields.filter(function (f) { return getLocaleValue(b.fields[f.key], targetLocale).trim(); }).length
          - textFields.filter(function (f) { return getLocaleValue(a.fields[f.key], targetLocale).trim(); }).length;
      }).slice(0, 3).map(function (r) {
        const obj = {};
        allFields.forEach(function (f) {
          const v = getLocaleValue(r.fields[f.key], targetLocale);
          obj[f.key] = (f.type === 'image' && v.startsWith('data:')) ? '' : v;
        });
        return obj;
      });

      // Compute per-field average word counts from samples (for length instruction)
      const fieldWordCounts = {};
      if (samples.length) {
        textFields.forEach(function (f) {
          const total = samples.reduce(function (sum, r) {
            return sum + (r[f.key] || '').split(/\s+/).filter(Boolean).length;
          }, 0);
          const avg = Math.round(total / samples.length);
          if (avg > 0) fieldWordCounts[f.key] = avg;
        });
      }
      const wordCountHint = Object.keys(fieldWordCounts).length
        ? ' Approximate word counts from samples: ' + Object.entries(fieldWordCounts).map(function (e) { return '"' + e[0] + '": ~' + e[1] + ' words'; }).join(', ') + '.'
        : '';

      const existingNames = state.records
        .map(function (r) { return getLocaleValue(r.fields['name'], targetLocale).trim(); })
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
            '3. Write ALL text content in ' + targetLocale.toUpperCase() + '. Write the summary in ' + targetLocale.toUpperCase() + ' too.',
            ...(samples.length ? [
              '4. text/text-long fields: match the style and length of the sample records EXACTLY — do NOT write less.' + wordCountHint + ' Same Markdown style (bullets vs paragraphs vs short phrases). No HTML.',
            ] : [
              '4. text/text-long fields: 2–4 sentences, specific facts. Use Markdown (**bold**, - lists). No HTML.',
            ]),
            '5. Each record must be unique — no duplicates with each other or with existing records.',
            ...imgNote,
            '',
            'Return ONLY this JSON shape:',
            returnShape,
          ].join('\n')
        },
        {
          role: 'user', content: [
            samples.length ? ('Style reference — match length and format exactly (do NOT repeat these):\n' + JSON.stringify(samples, null, 2)) : '',
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
  const localeSel = document.getElementById('ai-chat-locale-select');
  if (localeSel) {
    const show = sel.value === 'generate_records' && state.locales.length > 1;
    if (show) {
      localeSel.innerHTML = state.locales.map(function (l) {
        return '<option value="' + l + '"' + (l === state.activeLocale ? ' selected' : '') + '>' + l.toUpperCase() + '</option>';
      }).join('');
    }
    localeSel.style.display = show ? '' : 'none';
  }
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
      const localeSel = document.getElementById('ai-chat-locale-select');
      const locale = (localeSel && localeSel.style.display !== 'none' && localeSel.value) ? localeSel.value : state.activeLocale;
      _applyImportedRecords(JSON.stringify(op.records), true, locale);
    }

    if (op.type === 'REPLACE_RECORDS' && Array.isArray(op.records) && op.records.length) {
      const localeSel = document.getElementById('ai-chat-locale-select');
      const locale = (localeSel && localeSel.style.display !== 'none' && localeSel.value) ? localeSel.value : state.activeLocale;
      if (op.schema_id) {
        state.records = state.records.filter(function (r) { return r.schemaId !== op.schema_id; });
        uiState.activeSchemaId = op.schema_id;
      }
      if (op.project_name) {
        state.projectName = op.project_name;
        const nameEl = document.getElementById('project-name-input');
        if (nameEl) nameEl.value = state.projectName;
      }
      if (op.project_icon) {
        state.projectIcon = op.project_icon;
        const iconEl = document.getElementById('project-icon-btn');
        if (iconEl) iconEl.textContent = op.project_icon;
      }
      _applyImportedRecords(JSON.stringify(op.records), false, locale);
    }
  });

  setDirty();
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

export function _appendUserMessage(text, templateLabel) {
  const wrap = document.getElementById('ai-chat-messages');
  if (!wrap) return;
  const div = document.createElement('div');
  div.className = 'ai-chat-bubble ai-chat-bubble--user';
  div.innerHTML = '<span class="ai-chat-label">' + esc(templateLabel) + '</span>' + esc(text);
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

export function _appendAiMessage(text, ops) {
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

export function _appendAiTyping() {
  const wrap = document.getElementById('ai-chat-messages');
  if (!wrap) return;
  const div = document.createElement('div');
  div.id = 'ai-chat-typing';
  div.className = 'ai-chat-bubble ai-chat-bubble--ai ai-chat-typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

export function _removeTyping() {
  const el = document.getElementById('ai-chat-typing');
  if (el) el.remove();
}

export function appendTranslateOptions(idsSnapshot) {
  _pendingTranslateIds = idsSnapshot ? new Set(idsSnapshot) : null;
  openAiChat();
  const wrap = document.getElementById('ai-chat-messages');
  if (!wrap) return;
  const locales = state.locales;
  const scopeLabel = _pendingTranslateIds
    ? `${_pendingTranslateIds.size} selected record${_pendingTranslateIds.size > 1 ? 's' : ''}`
    : `all ${state.records.length} records`;
  const pairs = locales.flatMap(src =>
    locales.filter(tgt => tgt !== src).map(tgt => ({ src, tgt }))
  );
  const buttons = pairs.map(({ src, tgt }) =>
    `<button class="ai-translate-btn" onclick="window._chatTranslate('${src}','${tgt}',false,this)">${src.toUpperCase()} → ${tgt.toUpperCase()}</button>` +
    `<button class="ai-translate-btn ai-translate-btn--force" title="Overwrite existing" onclick="window._chatTranslate('${src}','${tgt}',true,this)">${src.toUpperCase()} → ${tgt.toUpperCase()} ↺</button>`
  ).join('');
  const div = document.createElement('div');
  div.className = 'ai-chat-bubble ai-chat-bubble--ai ai-chat-bubble--translate';
  div.innerHTML = `<div class="ai-chat-text">Translate <strong>${scopeLabel}</strong>:</div><div class="ai-translate-options">${buttons}</div>`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

window._chatTranslate = function (src, tgt, force, btn) {
  const bubble = btn.closest('.ai-chat-bubble--translate');
  if (bubble) bubble.querySelectorAll('button').forEach(b => { b.disabled = true; });
  const ids = _pendingTranslateIds;
  _pendingTranslateIds = null;
  translateRecords(src, tgt, ids, force);
};
