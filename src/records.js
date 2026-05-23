// ── Records ──────────────────────────────────────────────────────────
function renderRecordsPanel() {
  const panel = document.getElementById('records-panel');
  if (!panel) return;
  if (!state.schema) {
    panel.innerHTML = `
      <div style="padding:32px;text-align:center;color:#555;">
        <p>No schema configured for this project.</p>
        <button onclick="openSchemaEditor()">Setup Schema</button>
      </div>`;
    return;
  }
  panel.innerHTML = '<p>Records panel — coming soon</p>';
}

function openSchemaEditor() { /* implemented in Task 8 */ }
