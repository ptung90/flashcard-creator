// ── CSS ───────────────────────────────────────────────────────────────
import '../css/lexend-embedded.css'
import '../css/base.css'
import '../css/sidebar.css'
import '../css/editor.css'
import '../css/preview.css'
import '../css/modal.css'
import '../css/tomoe.css'

// ── JS — dependency order ────────────────────────────────────────────
// Layer 0
import './env.js'
import './core/config.js'
// Layer 1
import './core/state.js'
import './core/utils.js'
// Layer 2
import './storage/storage.js'
import './storage/file-modals.js'
import './api.js'
import './i18n.js'
// Layer 3
import './render.js'
// Layer 4
import './editor/editor.js'
import './editor/controls.js'
import './editor/sections.js'
// Layer 5
import './preview.js'
import './modals.js'
// Layer 6
import './core/undo.js'
// Layer 7
import './records/records.js'
import './records/pack.js'
import './records/schema-editor.js'
import './records/ai.js'
import './ai/chat.js'
// Layer 8
import './app/settings.js'
import './app/cards.js'
import './app/app.js'

// ── Window globals for HTML onclick handlers ─────────────────────────
import { dispatch, showCardPanel, showRecordsPanel, toggleSettingsBar,
         toggleEmojiPicker, toggleMoreMenu, openJsonModal, closeJsonModal,
         openJsonEditor, openJsonPreview, closeJsonPreview,
         validateJsonPreview, applyJsonPreview, exportJsonFile,
         copyJsonFull, copyJsonNoImg, copyJsonForAI, pasteJsonLoad,
         _syncJsonLineNums, selectProjectIcon } from './app/app.js'
import { addGoogleFont, removeGoogleFont, setGlobalOrient, changeUIZoom,
         setPhysicalZoom, changePreviewZoom } from './app/settings.js'
import { addCard, renderSidebar, newCard, refreshAllThumbs,
         scheduleThumbRefresh, setViewMode,
         cloneCard, closeCardMenu, copyCardStyle, pasteCardStyle,
         setTwoUpRatio, openCardMenu, setActive, moveCard,
         deleteCard } from './app/cards.js'
import { saveJSON, saveJSONAs, dismissRestoreBanner, resumeLastProject,
         toggleSidebar } from './storage/storage.js'
import { openLoadModal, openBackupModal, closeBackupModal,
         manualBackup, setWorkDir, openSaveAsModal } from './storage/file-modals.js'
import { printOne, printAll, exportOnePDF,
         openExportPdfDialog, runExportPdf } from './preview.js'
import { openCssModal, closeCssModal, openSettingsModal, closeSettingsModal,
         openImgModal, closeImgModal, switchTab } from './modals.js'
import { undo, redo } from './core/undo.js'
import { renderRecordsPanel, openRecordDetail } from './records/records.js'
import { confirmPack, packAll, generateRecord, generateAll,
         syncRecord, syncAllPacked } from './records/pack.js'
import { openSchemaEditor, closeSchemaEditor, saveSchema, closePackDialog,
         applySchemaFromLibrary, saveSchemaToLibrary,
         deleteSchemaFromLibrary } from './records/schema-editor.js'
import { copyRecordsForAI, closeRecordsAiModal, executeRecordsAiCopy,
         pasteRecordsAiNames, openGenerateRecordsDialog,
         closeGenerateRecordsDialog, executeGenerateRecords,
         exportRecordsJson, importRecordsJsonClick, importRecordsJsonFile,
         pasteRecordsJson } from './records/ai.js'
import { openAiChat, closeAiChat, toggleAiChatMinimize, sendAiChat,
         applyAiChatOps, onAiTemplateChange } from './ai/chat.js'
import { setLang } from './i18n.js'
import { state, uiState, LAYOUTS, PAPER_MM, HIDE_TITLE_LAYOUTS } from './core/state.js'
import { FC_CONFIG, FC_VERSION } from './core/config.js'

Object.assign(window, {
  // app/app.js + app/settings.js + app/cards.js
  addCard, dispatch, renderSidebar, newCard,
  addGoogleFont, removeGoogleFont, setGlobalOrient, setViewMode, showRecordsPanel,
  showCardPanel, toggleSettingsBar, changeUIZoom, setPhysicalZoom,
  toggleEmojiPicker, toggleMoreMenu, openJsonModal, closeJsonModal,
  openJsonEditor, openJsonPreview, closeJsonPreview,
  validateJsonPreview, applyJsonPreview, exportJsonFile,
  copyJsonFull, copyJsonNoImg, copyJsonForAI, pasteJsonLoad,
  _syncJsonLineNums, selectProjectIcon,
  refreshAllThumbs, scheduleThumbRefresh, changePreviewZoom,
  cloneCard, closeCardMenu, copyCardStyle, pasteCardStyle,
  setTwoUpRatio, openCardMenu, setActive, moveCard, deleteCard,
  // storage/storage.js
  saveJSON, saveJSONAs, dismissRestoreBanner, resumeLastProject, toggleSidebar,
  // storage/file-modals.js
  openLoadModal, openBackupModal, closeBackupModal, manualBackup, setWorkDir, openSaveAsModal,
  // preview.js
  printOne, printAll, exportOnePDF,
  openExportPdfDialog, runExportPdf,
  // modals.js
  openCssModal, closeCssModal, openSettingsModal, closeSettingsModal,
  openImgModal, closeImgModal, switchTab,
  // core/undo.js
  undo, redo,
  // records/records.js
  renderRecordsPanel, openRecordDetail,
  // records/pack.js
  confirmPack, packAll, generateRecord, generateAll,
  syncRecord, syncAllPacked,
  // records/schema-editor.js
  openSchemaEditor, closeSchemaEditor, saveSchema, closePackDialog,
  applySchemaFromLibrary, saveSchemaToLibrary, deleteSchemaFromLibrary,
  // records/ai.js
  copyRecordsForAI, closeRecordsAiModal, executeRecordsAiCopy,
  pasteRecordsAiNames, openGenerateRecordsDialog,
  closeGenerateRecordsDialog, executeGenerateRecords,
  exportRecordsJson, importRecordsJsonClick, importRecordsJsonFile,
  pasteRecordsJson,
  // ai/chat.js
  openAiChat, closeAiChat, toggleAiChatMinimize, sendAiChat,
  applyAiChatOps, onAiTemplateChange,
  // i18n.js
  setLang,
  // core/state.js
  state, uiState, LAYOUTS, PAPER_MM, HIDE_TITLE_LAYOUTS,
  // core/config.js
  FC_CONFIG, FC_VERSION,
})
