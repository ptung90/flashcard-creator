// ── Undo / Redo ──────────────────────────────────────────────────────
const imagePool = new Map();  // imgKey → dataURL
const _revPool  = new Map();  // dataURL → imgKey  (dedup index)

function _internImg(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  if (_revPool.has(dataUrl)) return _revPool.get(dataUrl);
  const key = 'img_' + uid();
  imagePool.set(key, dataUrl);
  _revPool.set(dataUrl, key);
  return key;
}

function _encodeState() {
  const snap = {
    cards:       JSON.parse(JSON.stringify(state.cards)),
    settings:    JSON.parse(JSON.stringify(state.settings)),
    projectName: state.projectName
  };
  for (const card of snap.cards) {
    for (const img of (card.images || [])) {
      if (img.url?.startsWith('data:')) { img._k = _internImg(img.url); delete img.url; }
    }
  }
  return JSON.stringify(snap);
}

function _decodeSnap(snapStr) {
  const snap = JSON.parse(snapStr);
  for (const card of snap.cards) {
    for (const img of (card.images || [])) {
      if (img._k) {
        img.url = imagePool.get(img._k) || '';
        delete img._k;
      }
    }
  }
  return snap;
}

const _undoStack = [];
const _redoStack = [];
function _undoMax() { return (window.FC_CONFIG || {}).undoMax ?? 50; }

function pushUndo() {
  const snap = _encodeState();
  if (_undoStack.length && _undoStack.at(-1) === snap) return;
  _undoStack.push(snap);
  while (_undoStack.length > _undoMax()) _undoStack.shift();
  _redoStack.length = 0;
  _updateUndoButtons();
}

function _restoreState(snap) {
  state.cards       = snap.cards;
  state.settings    = snap.settings;
  state.projectName = snap.projectName;
  if (!state.cards.find(c => c.id === uiState.activeCardId))
    uiState.activeCardId = state.cards.length ? state.cards[state.cards.length - 1].id : null;
}

function undo() {
  if (!_undoStack.length) return;
  _redoStack.push(_encodeState());
  _restoreState(_decodeSnap(_undoStack.pop()));
  dispatch('FULL_STATE_UPDATED');
  _updateUndoButtons();
}

function redo() {
  if (!_redoStack.length) return;
  _undoStack.push(_encodeState());
  _restoreState(_decodeSnap(_redoStack.pop()));
  dispatch('FULL_STATE_UPDATED');
  _updateUndoButtons();
}

function _updateUndoButtons() {
  const u = document.getElementById('undo-btn');
  const r = document.getElementById('redo-btn');
  if (u) u.disabled = !_undoStack.length;
  if (r) r.disabled = !_redoStack.length;
}

function initUndoKeys() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      undo();
    } else if (
      ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')
    ) {
      e.preventDefault();
      redo();
    }
  });
}
