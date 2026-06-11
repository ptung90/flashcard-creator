// ── Records JSON Export / Import ───────────────────────────────────────────────

export function exportRecordsJson() {
  if (!state.schema || !state.records.length) { showToast('No records to export'); return; }
  const allFields = state.schema.fields;
  const out = {
    schema: allFields.map(f => ({ key: f.key, label: f.label, type: f.type })),
    records: state.records.map(r => {
      const obj = { id: r.id };
      allFields.forEach(f => {
        const val = r.fields[f.key] ?? '';
        // strip data: URLs to keep export file small
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
    const existing = nameField && state.records.find(r => r.fields[nameField.key] === name);
    const obj = { id: existing ? existing.id : `rec_${uid()}` };
    if (nameField) obj[nameField.key] = name;
    otherFields.forEach(f => { obj[f.key] = ''; });
    return obj;
  });

  // Pick up to 2 filled records as style reference (exclude names in the fill list)
  const referenceRecords = state.records.filter(r => {
    if (!nameField) return false;
    if (filledNames.has(r.fields[nameField.key] ?? '')) return false;
    return otherFields.some(f => f.type !== 'image' && (r.fields[f.key] ?? '').trim());
  }).slice(0, 2);

  let referenceSection = '';
  if (referenceRecords.length) {
    const refObjs = referenceRecords.map(r => {
      const obj = { id: r.id };
      allFields.forEach(f => {
        const val = r.fields[f.key] ?? '';
        obj[f.key] = (f.type === 'image' && val.startsWith('data:')) ? '' : val;
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
  const n = parseInt(document.getElementById('gen-records-count').value, 10) || 5;
  const hint = document.getElementById('gen-records-hint').value.trim();
  const allFields = state.schema.fields;
  const imageFields = allFields.filter(f => f.type === 'image');
  const textFields = allFields.filter(f => f.type !== 'image');

  const schemaLines = allFields.map(function(f) { return '- ' + f.key + ' (' + f.type + '): ' + f.label; }).join('\n');
  const imgNote = imageFields.length
    ? '\n- image fields: set value to a concise English Wikimedia search keyword (e.g. species name, landmark) — NOT a URL'
    : '';

  // Pick up to 3 records with the most filled text fields as samples
  const samples = state.records.slice().sort(function(a, b) {
    const scoreA = textFields.filter(function(f) { return (a.fields[f.key] || '').trim(); }).length;
    const scoreB = textFields.filter(function(f) { return (b.fields[f.key] || '').trim(); }).length;
    return scoreB - scoreA;
  }).slice(0, 3).map(function(r) {
    const obj = {};
    allFields.forEach(function(f) {
      const v = r.fields[f.key] || '';
      obj[f.key] = (f.type === 'image' && v.startsWith('data:')) ? '' : v;
    });
    return obj;
  });

  const systemContent = [
    'You are a record data generator. Generate new records matching a schema and return valid JSON.',
    '',
    'Schema:',
    schemaLines,
    '',
    'Rules:',
    '1. Return ONLY a JSON array of exactly ' + n + ' records — no wrapper, no explanation, no markdown fences.',
    '2. Each record: { ' + allFields.map(function(f) { return '"' + f.key + '": "..."'; }).join(', ') + ' }',
    '3. text/text-long fields: 2–4 sentences of specific, accurate, interesting facts. Use Markdown (**bold**, - lists). No HTML.',
    '4. All records must be distinct — avoid duplicates with each other.' + imgNote,
  ].join('\n');

  const userLines = [];
  if (samples.length) {
    userLines.push('Sample records (match this style, language, and depth — do NOT repeat them):');
    userLines.push(JSON.stringify(samples, null, 2));
    userLines.push('');
  }
  userLines.push('Generate ' + n + ' new records' + (hint ? ' about: "' + hint + '"' : '') + '.');

  const key = localStorage.getItem(_aiProvider + '-key') || '';
  if (!key) { showToast('No ' + _aiProvider + ' key set'); return; }

  const btn = document.getElementById('gen-records-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user',   content: userLines.join('\n') },
    ];
    const result = _aiProvider === 'gemini'
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

async function _applyImportedRecords(jsonText, append = false) {
  let parsed = JSON.parse(jsonText);
  const incoming = Array.isArray(parsed) ? parsed : (parsed.records || []);
  if (!incoming.length) { showToast('No records found'); return; }

  const allFields = state.schema?.fields || [];
  const imageFields = allFields.filter(f => f.type === 'image');
  let added = 0, updated = 0;

  for (const row of incoming) {
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
      if (f.key in row) target.fields[f.key] = row[f.key];
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
  renderRecordsPanel();
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