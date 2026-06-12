import { state, getLocaleValue } from '../core/state.js'
import { uid } from '../core/utils.js'
import { setDirty, showToast } from '../storage/storage.js'
import { getAiProvider, _fetchImageByKeyword, _callGemini, _callOpenAI } from '../api.js'

// ── Records JSON Export / Import ───────────────────────────────────────────────

export function exportRecordsJson(ids = null) {
  if (!state.schema || !state.records.length) { showToast('No records to export'); return; }
  const allFields = state.schema.fields;
  const source = ids ? state.records.filter(r => ids.has(r.id)) : state.records;
  if (!source.length) { showToast('No records to export'); return; }
  const out = {
    schema: allFields.map(f => ({ key: f.key, label: f.label, type: f.type })),
    records: source.map(r => {
      const obj = { id: r.id };
      allFields.forEach(f => {
        const val = r.fields[f.key] ?? '';
        obj[f.key] = (f.type === 'image' && val.startsWith('data:')) ? '' : val;
      });
      return obj;
    })
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.projectName || 'records'}-records.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function copyRecordsForAI() {
  if (!state.schema) { showToast('No schema defined'); return; }
  // Pre-populate textarea with existing record names (first text field)
  const nameField = state.schema.fields.find(f => f.type !== 'image');
  const lines = state.records.length && nameField
    ? state.records.map(r => r.fields[nameField.key] ?? '').join('\n')
    : '';
  document.getElementById('records-ai-names').value = lines;
  document.getElementById('records-ai-modal').showModal();
  setTimeout(() => document.getElementById('records-ai-names').focus(), 50);
}

export function closeRecordsAiModal() {
  document.getElementById('records-ai-modal').close();
}

export function pasteRecordsAiNames() {
  navigator.clipboard.readText()
    .then(text => { document.getElementById('records-ai-names').value = text.trim(); })
    .catch(() => showToast('Clipboard read failed'));
}

export function executeRecordsAiCopy() {
  if (!state.schema) return;
  const rawNames = document.getElementById('records-ai-names').value;
  const names = rawNames.split('\n').map(s => s.trim()).filter(Boolean);
  if (!names.length) { showToast('Enter at least one name'); return; }

  const allFields = state.schema.fields;
  const nameField = allFields.find(f => f.type !== 'image');
  const otherFields = allFields.filter(f => f !== nameField);
  const imageFields = allFields.filter(f => f.type === 'image');
  const schemaLines = allFields.map(f => `- ${f.key} (${f.type}): ${f.label}`).join('\n');

  // Match names to existing records to preserve IDs — but keep other fields empty for AI to fill
  const filledNames = new Set(names);
  const records = names.map(name => {
    const existing = nameField && state.records.find(r => getLocaleValue(r.fields[nameField.key] ?? '', state.activeLocale) === name);
    const obj = { id: existing ? existing.id : `rec_${uid()}` };
    if (nameField) obj[nameField.key] = name;
    otherFields.forEach(f => { obj[f.key] = ''; });
    return obj;
  });

  // Pick up to 2 filled records as style reference (exclude names in the fill list)
  const referenceRecords = state.records.filter(r => {
    if (!nameField) return false;
    if (filledNames.has(getLocaleValue(r.fields[nameField.key] ?? '', state.activeLocale))) return false;
    return otherFields.some(f => f.type !== 'image' && getLocaleValue(r.fields[f.key] ?? '', state.activeLocale).trim());
  }).slice(0, 2);

  let referenceSection = '';
  if (referenceRecords.length) {
    const refObjs = referenceRecords.map(r => {
      const obj = { id: r.id };
      allFields.forEach(f => {
        const val = r.fields[f.key] ?? '';
        const resolved = getLocaleValue(val, state.activeLocale);
        obj[f.key] = (f.type === 'image' && typeof resolved === 'string' && resolved.startsWith('data:')) ? '' : resolved;
      });
      return obj;
    });
    referenceSection = `\nReference examples — match this style, tone, length, and language (DO NOT include these in output):\n${JSON.stringify(refObjs, null, 2)}\n`;
  }

  const out = {
    schema: allFields.map(f => ({ key: f.key, label: f.label, type: f.type })),
    records
  };

  const imgNote = imageFields.length
    ? `\n- For image fields (type "image"): set the value to a concise English search term for Wikimedia/Wikipedia (e.g. species scientific name, landmark name) — NOT a URL`
    : '';
  const filledNote = otherFields.length
    ? `The "${nameField?.label}" field is already filled. Fill in all other fields.`
    : 'Improve or rewrite all fields.';

  const aiPrompt = `You are filling in flashcard record data.

Schema fields:
${schemaLines}
${referenceSection}
${filledNote}
Rules:
- Keep the same record IDs and JSON structure
- Text fields: 2–4 sentences of specific, accurate, interesting information
- Use Markdown for formatting (e.g. **bold**, *italic*, - list items) — do NOT use any HTML tags
- Ensure all JSON strings are properly escaped (no unescaped double quotes inside values)${imgNote}
- Return ONLY valid JSON — the "records" array only, no wrapper object, no explanation, no markdown fences

${JSON.stringify(out.records, null, 2)}`;

  navigator.clipboard.writeText(aiPrompt)
    .then(() => { showToast('✦ Copied for AI'); closeRecordsAiModal(); })
    .catch(() => showToast('Copy failed'));
}

export function openGenerateRecordsDialog() {
  if (!state.schema) { showToast('No schema defined'); return; }
  document.getElementById('generate-records-dialog').showModal();
  setTimeout(() => document.getElementById('gen-records-count').focus(), 50);
}

export function closeGenerateRecordsDialog() {
  document.getElementById('generate-records-dialog').close();
}

export async function executeGenerateRecords() {
  const n = Number.parseInt(document.getElementById('gen-records-count').value, 10) || 5;
  const hint = document.getElementById('gen-records-hint').value.trim();
  const allFields = state.schema.fields;
  const imageFields = allFields.filter(f => f.type === 'image');
  const textFields = allFields.filter(f => f.type !== 'image');

  const schemaLines = allFields.map(f => `- ${f.key} (${f.type}): ${f.label}`).join('\n');
  const imgNote = imageFields.length
    ? '\n- image fields: set value to a concise English Wikimedia search keyword (e.g. species name, landmark) — NOT a URL'
    : '';

  // Pick up to 3 records with the most filled text fields as samples
  const samples = state.records.slice().sort((a, b) => {
    const scoreA = textFields.filter(f => getLocaleValue(a.fields[f.key] ?? '', state.activeLocale).trim()).length;
    const scoreB = textFields.filter(f => getLocaleValue(b.fields[f.key] ?? '', state.activeLocale).trim()).length;
    return scoreB - scoreA;
  }).slice(0, 3).map(r => {
    const obj = {};
    allFields.forEach(f => {
      const v = r.fields[f.key] ?? '';
      const resolved = getLocaleValue(v, state.activeLocale);
      obj[f.key] = (f.type === 'image' && typeof resolved === 'string' && resolved.startsWith('data:')) ? '' : resolved;
    });
    return obj;
  });

  // Build blacklist from the required "name" field
  const existingNames = state.records
    .map(r => getLocaleValue(r.fields['name'] ?? '', state.activeLocale).trim())
    .filter(Boolean);

  const systemContent = [
    'You are a record data generator. Generate new records matching a schema and return valid JSON.',
    '',
    'Schema:',
    schemaLines,
    ...(existingNames.length ? [
      '',
      'Already exists — DO NOT generate these or anything too similar:',
      existingNames.map(name => `- ${name}`).join('\n'),
    ] : []),
    '',
    'Rules:',
    `1. Return ONLY a JSON array of exactly ${n} records — no wrapper, no explanation, no markdown fences.`,
    '2. Each record: { ' + allFields.map(f => '"' + f.key + '": "..."').join(', ') + ' }',
    '3. text/text-long fields: 2–4 sentences of specific, accurate, interesting facts. Use Markdown (**bold**, - lists). No HTML.',
    `4. All records must be distinct — avoid duplicates with each other.${imgNote}`,
  ].join('\n');

  const userLines = [];
  if (samples.length) {
    userLines.push('Sample records (match this style, language, and depth — do NOT repeat them):');
    userLines.push(JSON.stringify(samples, null, 2));
    userLines.push('');
  }
  userLines.push('Generate ' + n + ' new records' + (hint ? ' about: "' + hint + '"' : '') + '.');

  let provider = getAiProvider();
  let key = localStorage.getItem(`${provider}-key`) || '';
  if (!key) { showToast(`No ${provider} key set. Add it in Settings → AI`); return; }

  const btn = document.getElementById('gen-records-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user',   content: userLines.join('\n') },
    ];
    const result = provider === 'gemini'
      ? await _callGemini(key, messages[0].content + '\n\n' + messages[1].content)
      : await _callOpenAI(key, messages);

    // _callOpenAI returns parsed JSON — but we expect an array, not {ops}
    // The AI should return a raw array; if it wrapped it, unwrap
    const arr = Array.isArray(result) ? result : (result.records || Object.values(result)[0]);
    if (!Array.isArray(arr) || !arr.length) { showToast('No records returned'); return; }

    closeGenerateRecordsDialog();
    await _applyImportedRecords(JSON.stringify(arr), true);
  } catch (e) {
    showToast('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✦ Generate'; }
  }
}

export function importRecordsJsonClick() {
  document.getElementById('records-import-input')?.click();
}

function _isDuplicateRecord(row, textFields) {
  return state.records.some(r =>
    textFields.every(f => {
      const rv = getLocaleValue(r.fields[f.key] ?? '', state.activeLocale);
      const iv = getLocaleValue(row[f.key] ?? '', state.activeLocale);
      return rv === iv;
    })
  );
}

export async function _applyImportedRecords(jsonText, append = false) {
  let parsed = JSON.parse(jsonText);
  const incoming = Array.isArray(parsed) ? parsed : (parsed.records || parsed.result || []);
  if (!incoming.length) { showToast('No records found'); return; }

  const allFields = state.schema?.fields || [];
  const imageFields = allFields.filter(f => f.type === 'image');
  const textFields = allFields.filter(f => f.type !== 'image');
  let added = 0;
  let updated = 0;

  for (const rawRow of incoming) {
    const row = (rawRow.fields && typeof rawRow.fields === 'object' && !Array.isArray(rawRow.fields))
      ? { ...rawRow.fields, id: rawRow.id }
      : rawRow;
    if (append && _isDuplicateRecord(row, textFields)) continue;

    const existing = !append && row.id && state.records.find(r => r.id === row.id);
    const target = existing || (() => {
      if (!state.schema) return null;
      const rec = { id: `rec_${uid()}`, fieldsHash: '', fields: {} };
      state.schema.fields.forEach(f => { rec.fields[f.key] = ''; });
      state.records.push(rec);
      added++;
      return rec;
    })();
    if (!target) continue;
    if (existing) { existing.fieldsHash = ''; updated++; }

    allFields.filter(f => f.type !== 'image').forEach(f => {
      if (!(f.key in row)) return;
      const incomingVal = row[f.key];
      const existingVal = target.fields[f.key];
      if (incomingVal && typeof incomingVal === 'object' && existingVal && typeof existingVal === 'object') {
        Object.assign(existingVal, incomingVal);
      } else if (typeof incomingVal === 'string' && existingVal && typeof existingVal === 'object') {
        existingVal[state.activeLocale] = incomingVal;
      } else {
        target.fields[f.key] = incomingVal;
      }
    });

    for (const f of imageFields) {
      const val = row[f.key] ?? '';
      if (!val) continue;
      if (val.startsWith('http') || val.startsWith('data:')) {
        target.fields[f.key] = val;
      } else {
        try {
          const url = await _fetchImageByKeyword(val);
          if (url) target.fields[f.key] = url;
        } catch (_) {}
      }
    }
  }

  setDirty();
  window.renderRecordsPanel();
  showToast(`Imported: ${updated} updated, ${added} added`);
}

export function importRecordsJsonFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const reader = new FileReader();
  reader.onload = e => _applyImportedRecords(e.target.result).catch(err => alert('Import failed: ' + err.message));
  reader.readAsText(file);
}

export function pasteRecordsJson(append = false) {
  navigator.clipboard.readText()
    .then(text => {
      const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      return _applyImportedRecords(stripped, append);
    })
    .catch(err => alert('Paste failed: ' + (err.message || err)));
}

export async function translateRecords(sourceLocale, targetLocale, ids = null, force = false) {
  if (!state.schema) return;
  const provider = getAiProvider();
  const key = localStorage.getItem(`${provider}-key`) || '';
  if (!key) { showToast(`No ${provider} key set. Add it in Settings → AI`); return; }

  const mlFields = state.schema.fields.filter(f => f.multilingual !== false && f.type !== 'image');
  if (!mlFields.length) { showToast('No multilingual fields in schema'); return; }

  const scope = ids
    ? state.records.filter(r => ids.has(r.id))
    : state.records;

  const toTranslate = scope.map(rec => {
    const fields = {};
    mlFields.forEach(f => {
      const val = rec.fields[f.key];
      if (!val || typeof val !== 'object') return;
      const src = val[sourceLocale]?.trim();
      const tgt = val[targetLocale]?.trim();
      if (src && (force || !tgt)) fields[f.key] = src;
    });
    return Object.keys(fields).length ? { id: rec.id, fields } : null;
  }).filter(Boolean);

  if (!toTranslate.length) { showToast('Nothing to translate'); return; }

  const systemPrompt = `You are a translation engine. Translate the given field values from ${sourceLocale.toUpperCase()} to ${targetLocale.toUpperCase()}.
Return ONLY a JSON array with the same structure — same ids, same field keys, values replaced with ${targetLocale.toUpperCase()} translations.
Preserve HTML/Markdown formatting. No explanation, no markdown fences.`;

  const userPrompt = JSON.stringify(toTranslate, null, 2);

  showToast(`Translating ${toTranslate.length} record(s)…`);

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const result = provider === 'gemini'
      ? await _callGemini(key, systemPrompt + '\n\n' + userPrompt)
      : await _callOpenAI(key, messages);

    const arr = Array.isArray(result) ? result : (result?.records || result?.translations || null);
    if (!Array.isArray(arr)) { showToast('Invalid response from AI'); return; }

    arr.forEach(item => {
      const rec = state.records.find(r => r.id === item.id);
      if (!rec) return;
      Object.entries(item.fields).forEach(([fieldKey, translated]) => {
        if (rec.fields[fieldKey] && typeof rec.fields[fieldKey] === 'object') {
          rec.fields[fieldKey][targetLocale] = translated;
        }
      });
    });

    setDirty();
    window.renderRecordsPanel();
    showToast(`Translated ${arr.length} record(s) → ${targetLocale.toUpperCase()}`);
  } catch (e) {
    showToast('Translation error: ' + e.message);
  }
}