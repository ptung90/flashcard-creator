// ── CSS ───────────────────────────────────────────────────────────────
import '../css/lexend-embedded.css'
import '../css/base.css'
import '../css/sidebar.css'
import '../css/editor.css'
import '../css/preview.css'
import '../css/modal.css'
import '../css/tomoe.css'

// ── JS — dependency order (named imports also execute the module) ─────
// Layer 0
import './env.js'
import { FC_CONFIG, FC_VERSION } from './core/config.js'
// Layer 1
import { state, uiState, LAYOUTS, PAPER_MM, HIDE_TITLE_LAYOUTS, getLocaleValue, setActiveLocale, addLocale } from './core/state.js'
import './core/utils.js'
// Layer 2
import { saveJSON, saveJSONAs, loadJSON, dismissRestoreBanner, resumeLastProject,
         toggleSidebar, setDirty, _updateLabels, _computeReadOnly } from './storage/storage.js'
import { openLoadModal, closeLoadModal, newProject, openBackupModal, closeBackupModal,
         manualBackup, setWorkDir, openSaveAsModal, closeSaveAsModal, executeSaveAs,
         browseSubfolder, loadFromFolder, createSubfolder, openFilePicker,
         _renderFolderSection, toggleFolderCollapse,
         deleteRecentItem, loadFromRecent,
         deleteFromFolder, showMoveMenu, showCloneMenu,
         _execMove, _execClone } from './storage/file-modals.js'
import { searchWikimedia, searchINaturalist, searchPixabay, searchUnsplash,
         saveUnsplashKey, savePixabayKey, saveAiKey, switchAiProvider,
         toggleAiSection, aiGenerateProject } from './api.js'
import { setLang } from './i18n.js'
// Layer 3
import './render.js'
// Layer 4
import { editorToolbarCmd, setActiveSectionFontProp, renderEditor } from './editor/editor.js'
import {
  switchLayoutTab, setLayout, setTextRows, setTextCols,
  setCardFontAlign, setCardFontProp, toggleCardFontColor,
  toggleCardOrientation, setCardOrientation,
  updateCardProp, updateGridSplitProp,
  setSlotSize, toggleImgOverride, updateImgProp, clearSlot,
} from './editor/controls.js'
import {
  setFontAlign, setTextVAlign,
  mergeSections, addSection, deleteSection, moveSection,
  openSectionMenu, closeSectionMenu, setSectionClass,
  copySection, pasteSection, copySectionWithImage, pasteSectionWithImage,
  updateSection, toggleCardCssEditor, updateCardCss,
  togglePasteBlock, parsePasteBlock,
  toggleDataArea, editCardData, cancelCardData, saveCardData, swapSlots,
} from './editor/sections.js'
// Layer 5
import { renderPreview, printOne, printAll, exportOnePDF,
         openExportPdfDialog, runExportPdf } from './preview.js'
import { openCssModal, closeCssModal, openSettingsModal, closeSettingsModal,
         openImgModal, closeImgModal, switchTab, copySlot, pasteToSlot,
         applyCustomCss, resetCustomCss, toggleCfgSection, applyAndSaveSettings,
         exportStyle, importStyle, resetUserConfig, previewUrlInput, insertUrl,
         migrateImages, saveStyleToLibrary, applyStyleFromLibrary,
         deleteStyleFromLibrary } from './modals.js'
// Layer 6
import { undo, redo, pushUndo } from './core/undo.js'
// Layer 7
import { renderRecordsPanel, openRecordDetail, addRecord, deleteRecord,
         _clearRecordImage, _copyRecordImage, _pasteRecordImage, _pasteToRecordImage,
         _pickRecordImage, _recToolbarCmd, toggleColMenu, togglePackMenu,
         toggleRecCol, toggleRecordsMoreMenu, toggleSort,
         toggleSelectRecord, toggleSelectAll, deleteSelected, exportSelected,
         toggleBilingualView, toggleTranslateMenu, _getSelectedSet,
         _migrateRecordFields } from './records/records.js'
import { confirmPack, packAll, generateRecord, generateAll,
         syncRecord, syncAllPacked, openPackDialog } from './records/pack.js'
import { openSchemaEditor, closeSchemaEditor, saveSchema, closePackDialog,
         applySchemaFromLibrary, saveSchemaToLibrary,
         deleteSchemaFromLibrary,
         _addSchemaField, _addSchemaSection, _addSchemaTemplate,
         _removeSchemaField, _removeSchemaTemplate, _schemaCardConfig,
         _schemaFieldChange, _schemaSingleImageSlot, _schemaSingleSection,
         _schemaTemplateChange } from './records/schema-editor.js'
import { copyRecordsForAI, closeRecordsAiModal, executeRecordsAiCopy,
         pasteRecordsAiNames, openGenerateRecordsDialog,
         closeGenerateRecordsDialog, executeGenerateRecords,
         exportRecordsJson, importRecordsJsonClick, importRecordsJsonFile,
         pasteRecordsJson, translateRecords } from './records/ai.js'
import { openAiChat, closeAiChat, toggleAiChatMinimize, sendAiChat,
         applyAiChatOps, onAiTemplateChange, onAiChatModelChange,
         appendTranslateOptions,
         _appendUserMessage, _appendAiMessage, _appendAiTyping, _removeTyping } from './ai/chat.js'
// Layer 8
import { addGoogleFont, removeGoogleFont, setGlobalOrient, changeUIZoom,
         setPhysicalZoom, changePreviewZoom, applyGoogleFonts,
         applySettingsToUI, bindSettings } from './app/settings.js'
import { addCard, renderSidebar, newCard, refreshAllThumbs,
         scheduleThumbRefresh, setViewMode,
         cloneCard, closeCardMenu, copyCardStyle, pasteCardStyle,
         setTwoUpRatio, openCardMenu, setActive, moveCard,
         deleteCard, handleUploadFiles } from './app/cards.js'
import { dispatch, showCardPanel, showRecordsPanel, toggleSettingsBar,
         toggleEmojiPicker, toggleMoreMenu, closeMoreMenu, openJsonModal, closeJsonModal,
         openJsonEditor, openJsonPreview, closeJsonPreview,
         validateJsonPreview, applyJsonPreview, exportJsonFile,
         copyJsonFull, copyJsonNoImg, copyJsonForAI, pasteJsonLoad,
         _syncJsonLineNums, selectProjectIcon, renderLocaleSwitch } from './app/app.js'

// ── Window globals for HTML onclick handlers ─────────────────────────
Object.assign(window, {
  // app/app.js
  dispatch, showCardPanel, showRecordsPanel, toggleSettingsBar,
  toggleEmojiPicker, toggleMoreMenu, closeMoreMenu, openJsonModal, closeJsonModal,
  openJsonEditor, openJsonPreview, closeJsonPreview,
  validateJsonPreview, applyJsonPreview, exportJsonFile,
  copyJsonFull, copyJsonNoImg, copyJsonForAI, pasteJsonLoad,
  _syncJsonLineNums, selectProjectIcon, renderLocaleSwitch,
  // app/settings.js
  addGoogleFont, removeGoogleFont, setGlobalOrient, changeUIZoom, setPhysicalZoom,
  changePreviewZoom, applyGoogleFonts, applySettingsToUI, bindSettings,
  // app/cards.js
  addCard, renderSidebar, newCard, refreshAllThumbs, scheduleThumbRefresh,
  setViewMode, cloneCard, closeCardMenu, copyCardStyle, pasteCardStyle,
  setTwoUpRatio, openCardMenu, setActive, moveCard, deleteCard, handleUploadFiles,
  // storage/storage.js
  saveJSON, saveJSONAs, loadJSON, dismissRestoreBanner, resumeLastProject, toggleSidebar,
  setDirty, _updateLabels, _computeReadOnly,
  // storage/file-modals.js
  openLoadModal, closeLoadModal, newProject, openBackupModal, closeBackupModal, manualBackup, setWorkDir,
  openSaveAsModal, closeSaveAsModal, executeSaveAs,
  browseSubfolder, loadFromFolder, createSubfolder, openFilePicker,
  _renderFolderSection, toggleFolderCollapse,
  deleteRecentItem, loadFromRecent,
  deleteFromFolder, showMoveMenu, showCloneMenu, _execMove, _execClone,
  // api.js
  searchWikimedia, searchINaturalist, searchPixabay, searchUnsplash,
  saveUnsplashKey, savePixabayKey, saveAiKey, switchAiProvider,
  toggleAiSection, aiGenerateProject,
  // preview.js
  renderPreview, printOne, printAll, exportOnePDF, openExportPdfDialog, runExportPdf,
  // modals.js
  openCssModal, closeCssModal, openSettingsModal, closeSettingsModal,
  openImgModal, closeImgModal, switchTab, copySlot, pasteToSlot,
  applyCustomCss, resetCustomCss, toggleCfgSection, applyAndSaveSettings,
  exportStyle, importStyle, resetUserConfig, previewUrlInput, insertUrl,
  migrateImages, saveStyleToLibrary, applyStyleFromLibrary, deleteStyleFromLibrary,
  // core/undo.js
  undo, redo, pushUndo,
  // editor/editor.js
  editorToolbarCmd, setActiveSectionFontProp, renderEditor,
  // editor/controls.js
  switchLayoutTab, setLayout, setTextRows, setTextCols,
  setCardFontAlign, setCardFontProp, toggleCardFontColor,
  toggleCardOrientation, setCardOrientation,
  updateCardProp, updateGridSplitProp,
  setSlotSize, toggleImgOverride, updateImgProp, clearSlot,
  // editor/sections.js
  setFontAlign, setTextVAlign,
  mergeSections, addSection, deleteSection, moveSection,
  openSectionMenu, closeSectionMenu, setSectionClass,
  copySection, pasteSection, copySectionWithImage, pasteSectionWithImage,
  updateSection, toggleCardCssEditor, updateCardCss,
  togglePasteBlock, parsePasteBlock,
  toggleDataArea, editCardData, cancelCardData, saveCardData, swapSlots,
  // records/records.js
  renderRecordsPanel, openRecordDetail, addRecord, deleteRecord,
  _clearRecordImage, _copyRecordImage, _pasteRecordImage, _pasteToRecordImage,
  _pickRecordImage, _recToolbarCmd, toggleColMenu, togglePackMenu,
  toggleRecCol, toggleRecordsMoreMenu, toggleSort,
  toggleSelectRecord, toggleSelectAll, deleteSelected, exportSelected,
  toggleBilingualView, toggleTranslateMenu, _getSelectedSet,
  _migrateRecordFields,
  // records/pack.js
  confirmPack, packAll, generateRecord, generateAll,
  syncRecord, syncAllPacked, openPackDialog,
  // records/schema-editor.js
  openSchemaEditor, closeSchemaEditor, saveSchema, closePackDialog,
  applySchemaFromLibrary, saveSchemaToLibrary, deleteSchemaFromLibrary,
  _addSchemaField, _addSchemaSection, _addSchemaTemplate,
  _removeSchemaField, _removeSchemaTemplate, _schemaCardConfig,
  _schemaFieldChange, _schemaSingleImageSlot, _schemaSingleSection,
  _schemaTemplateChange,
  // records/ai.js
  copyRecordsForAI, closeRecordsAiModal, executeRecordsAiCopy,
  pasteRecordsAiNames, openGenerateRecordsDialog,
  closeGenerateRecordsDialog, executeGenerateRecords,
  exportRecordsJson, importRecordsJsonClick, importRecordsJsonFile,
  pasteRecordsJson, translateRecords,
  // ai/chat.js
  openAiChat, closeAiChat, toggleAiChatMinimize, sendAiChat,
  applyAiChatOps, onAiTemplateChange, onAiChatModelChange,
  appendTranslateOptions,
  _appendUserMessage, _appendAiMessage, _appendAiTyping, _removeTyping,
  // i18n.js
  setLang,
  // core/state.js
  state, uiState, LAYOUTS, PAPER_MM, HIDE_TITLE_LAYOUTS,
  getLocaleValue, setActiveLocale, addLocale,
  // core/config.js
  FC_CONFIG, FC_VERSION,
})
