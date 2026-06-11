// ── CSS ───────────────────────────────────────────────────────────────
import '../css/lexend-embedded.css'
import '../css/base.css'
import '../css/sidebar.css'
import '../css/editor.css'
import '../css/preview.css'
import '../css/modal.css'
import '../css/tomoe.css'

// ── JS — dependency order from build.js ──────────────────────────────
// Layer 0
import './env.js'
import './config.js'
// Layer 1
import './state.js'
import './utils.js'
// Layer 2
import './storage.js'
import './api.js'
import './i18n.js'
// Layer 3
import './render.js'
// Layer 4
import './editor.js'
import './editor-controls.js'
import './editor-sections.js'
// Layer 5
import './preview.js'
import './modals.js'
// Layer 6
import './undo.js'
// Layer 7
import './records.js'
import './records-pack.js'
import './schema-editor.js'
import './records-ai.js'
import './ai-chat.js'
// Layer 8
import './app.js'
