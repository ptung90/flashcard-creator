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

// ── Window globals for HTML onclick handlers ─────────────────────────
import { addCard, dispatch, renderSidebar, newCard,
         addGoogleFont, setGlobalOrient, setViewMode, showRecordsPanel,
         toggleSettingsBar, changeUIZoom, setPhysicalZoom,
         toggleEmojiPicker, toggleMoreMenu, openJsonModal, closeJsonModal,
         refreshAllThumbs, scheduleThumbRefresh, changePreviewZoom } from './app.js'
import { saveJSON, saveJSONAs, openLoadModal, openBackupModal, closeBackupModal,
         manualBackup, setWorkDir, dismissRestoreBanner, resumeLastProject,
         toggleSidebar } from './storage.js'
import { printOne, printAll, exportOnePDF,
         openExportPdfDialog, runExportPdf } from './preview.js'
import { openCssModal, closeCssModal, openSettingsModal, closeSettingsModal,
         openImgModal, closeImgModal, switchTab } from './modals.js'
import { undo, redo } from './undo.js'
import { renderRecordsPanel, openRecordDetail } from './records.js'
import { confirmPack, packAll, generateRecord, generateAll,
         syncRecord, syncAllPacked } from './records-pack.js'
import { openSchemaEditor, closeSchemaEditor, saveSchema, closePackDialog,
         applySchemaFromLibrary, saveSchemaToLibrary,
         deleteSchemaFromLibrary } from './schema-editor.js'
import { copyRecordsForAI, closeRecordsAiModal, executeRecordsAiCopy,
         pasteRecordsAiNames, openGenerateRecordsDialog,
         closeGenerateRecordsDialog, executeGenerateRecords,
         exportRecordsJson, importRecordsJsonClick, importRecordsJsonFile,
         pasteRecordsJson } from './records-ai.js'
import { openAiChat, closeAiChat, toggleAiChatMinimize, sendAiChat,
         applyAiChatOps, onAiTemplateChange } from './ai-chat.js'
import { setLang } from './i18n.js'
import { state, uiState, LAYOUTS, PAPER_MM, HIDE_TITLE_LAYOUTS } from './state.js'
import { FC_CONFIG, FC_VERSION } from './config.js'

Object.assign(window, {
  // app.js
  addCard, dispatch, renderSidebar, newCard,
  addGoogleFont, setGlobalOrient, setViewMode, showRecordsPanel,
  toggleSettingsBar, changeUIZoom, setPhysicalZoom,
  toggleEmojiPicker, toggleMoreMenu, openJsonModal, closeJsonModal,
  refreshAllThumbs, scheduleThumbRefresh, changePreviewZoom,
  // storage.js
  saveJSON, saveJSONAs, openLoadModal, openBackupModal, closeBackupModal,
  manualBackup, setWorkDir, dismissRestoreBanner, resumeLastProject,
  toggleSidebar,
  // preview.js
  printOne, printAll, exportOnePDF,
  openExportPdfDialog, runExportPdf,
  // modals.js
  openCssModal, closeCssModal, openSettingsModal, closeSettingsModal,
  openImgModal, closeImgModal, switchTab,
  // undo.js
  undo, redo,
  // records.js
  renderRecordsPanel, openRecordDetail,
  // records-pack.js
  confirmPack, packAll, generateRecord, generateAll,
  syncRecord, syncAllPacked,
  // schema-editor.js
  openSchemaEditor, closeSchemaEditor, saveSchema, closePackDialog,
  applySchemaFromLibrary, saveSchemaToLibrary, deleteSchemaFromLibrary,
  // records-ai.js
  copyRecordsForAI, closeRecordsAiModal, executeRecordsAiCopy,
  pasteRecordsAiNames, openGenerateRecordsDialog,
  closeGenerateRecordsDialog, executeGenerateRecords,
  exportRecordsJson, importRecordsJsonClick, importRecordsJsonFile,
  pasteRecordsJson,
  // ai-chat.js
  openAiChat, closeAiChat, toggleAiChatMinimize, sendAiChat,
  applyAiChatOps, onAiTemplateChange,
  // i18n.js
  setLang,
  // state.js
  state, uiState, LAYOUTS, PAPER_MM, HIDE_TITLE_LAYOUTS,
  // config.js
  FC_CONFIG, FC_VERSION,
})
