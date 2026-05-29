// ── Records JSON Export / Import ───────────────────────────────────────────────

function exportRecordsJson() {
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

function copyRecordsForAI() {
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

function closeRecordsAiModal() {
  document.getElementById('records-ai-modal').close();
}

function pasteRecordsAiNames() {
  navigator.clipboard.readText()
    .then(text => { document.getElementById('records-ai-names').value = text.trim(); })
    .catch(() => showToast('Clipboard read failed'));
}

function executeRecordsAiCopy() {
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

function importRecordsJsonClick() {
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
          const url = await _wikimediaFirstResult(val);
          if (url) target.fields[f.key] = url;
        } catch (_) {}
      }
    }
  }

  setDirty();
  renderRecordsPanel();
  showToast(`Imported: ${updated} updated, ${added} added`);
}

function importRecordsJsonFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const reader = new FileReader();
  reader.onload = e => _applyImportedRecords(e.target.result).catch(err => alert('Import failed: ' + err.message));
  reader.readAsText(file);
}

function pasteRecordsJson(append = false) {
  navigator.clipboard.readText()
    .then(text => {
      const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      return _applyImportedRecords(stripped, append);
    })
    .catch(err => alert('Paste failed: ' + (err.message || err)));
}