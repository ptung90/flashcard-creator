// ── i18n ─────────────────────────────────────────────────────────────
const STRINGS = {
  en: {
    // Settings bar
    'set.paper': 'Paper',
    'set.margin': 'Margin',
    'set.mm': 'mm',
    'set.textPad': 'Text Pad',
    'set.imgPad': 'Img Pad',
    'set.bd.title': 'Border settings',
    'set.img.title': 'Image settings',
    'set.font.title': 'Font settings',
    'set.zoom.dec': 'Decrease UI size',
    'set.zoom.inc': 'Increase UI size',
    // Font panel
    'font.title': 'Title',
    'font.content': 'Content',
    'font.px': 'px',
    'font.lh': 'LH',
    // Border panel
    'bd.width': 'Width',
    'bd.style': 'Style',
    'bd.color': 'Color',
    'bd.radius': 'Radius',
    // Img panel
    'img.fit': 'Fit',
    'img.pos': 'Position',
    // Toolbar
    'toolbar.newCard': 'New Card',
    'toolbar.thumbs': '↻ Thumbs',
    'toolbar.settings': 'Settings',
    'toolbar.customCss': 'Custom CSS',
    'toolbar.setFolder': 'Set Folder',
    'toolbar.save': 'Save',
    'toolbar.saveAs': 'Save As',
    'toolbar.load': 'Load',
    'toolbar.printAll': 'Print All',
    'toolbar.pdfAll': 'PDF All',
    'toolbar.toggleSidebar': 'Toggle sidebar',
    // Sidebar
    'sidebar.cards': 'Cards',
    'sidebar.listView': 'List view',
    'sidebar.gridView': 'Grid view',
    // Preview
    'preview.label': 'Preview',
    'preview.print': 'Print',
    'preview.export': 'Export PDF',
    // Editor
    'editor.empty': 'Select a card to edit, or click "+ New Card"',
    'editor.layout': 'Layout',
    'editor.orientation': 'Orientation',
    'editor.imgHeight': 'Image Area Height',
    'editor.images': 'Images',
    'editor.slots': 'slots',
    'editor.title': 'Title',
    'toolbar.labelSize': 'Title (each)',
    'toolbar.contentSize': 'Content (each)',
    'toolbar.gridFontSize': 'Font (all)',
    'editor.hideTitle': 'Hide in card',
    'editor.hideLabels': 'Hide labels',
    'editor.titlePh': 'Card title...',
    'editor.sections': 'Sections',
    'editor.noSections': 'No sections — add one below',
    'editor.addSection': 'Add Section',
    'editor.pasteBlock': 'Paste block',
    'editor.css': 'CSS',
    'editor.data': 'Data',
    'editor.cssHint': 'Scoped to this card — use .fc-title, .fc-section__content, etc.',
    'editor.pasteBlockPh': 'Feature: Broad cap, dark brown\nHabitat: Grows on rotting wood\nEach line becomes one section',
    'editor.replaceSection': 'Replace sections',
    'editor.append': 'Append',
    'editor.cancel': 'Cancel',
    'editor.cardData': 'Current Card Data',
    'editor.edit': 'Edit',
    'editor.saveData': 'Save',
    'editor.labelPh': 'Label',
    'editor.contentPh': 'Markdown content...',
    'editor.pairedPh': 'Text label...',
    'editor.noImage': 'No image',
    'editor.hiddenSlot': 'slot {n} — hidden in this layout',
    'editor.dragHandle': 'Drag to reorder',
    'editor.custom': 'Custom',
    'editor.bgColor': 'Background color',
    'editor.clickImg': 'Click to change image',
    'editor.override': 'Override',
    'editor.fromGlobal': '↑ from global',
    // Orientation
    'orient.portrait': 'Portrait',
    'orient.landscape': 'Landscape',
    // Confirm
    'confirm.deleteCard': 'Delete this card?',
    // Card
    'card.untitled': 'Untitled',
    'card.new': 'New Card',
    // Restore banner
    'restore.resume': 'Resume',
    'restore.dismiss': 'Dismiss',
    // Misc
    'misc.moveUp': 'Move up',
    'misc.moveDown': 'Move down',
    'misc.clone': 'Clone',
    'misc.delete': 'Delete',
    'toast.jsonCopied': 'JSON copied (no images)',
    'toast.jsonCopiedFull': 'JSON copied',
    'toast.jsonExported': 'JSON file downloaded',
    'json.btnTitle': 'Export / Copy JSON',
    'json.modalTitle': 'Export / Copy JSON',
    'json.exportFile': 'Export to file',
    'json.exportFileDesc': 'Download as .json',
    'json.copyFull': 'Copy JSON',
    'json.copyFullDesc': 'Full project including images',
    'json.copyNoImg': 'Copy JSON (no images)',
    'json.copyNoImgDesc': 'Images replaced with placeholder URL',
    'json.pasteLoad': 'Paste & Load',
    'json.pasteLoadDesc': 'Load project from clipboard JSON',
    'toast.jsonLoaded': 'Project loaded from clipboard',
    'toast.jsonInvalid': 'Clipboard does not contain valid JSON',
    'toast.clipboardDenied': 'Clipboard access denied',
    'ai.noKey': 'Enter an OpenAI API key first',
    'ai.noSubject': 'Enter a subject to generate',
    'ai.generating': 'Generating… this may take a few seconds',
    'ai.done': 'Project generated for',
    'ai.badKey': 'Invalid API key (401)',
    'ai.emptyResponse': 'AI returned empty response',
    'ai.rateLimit': 'Rate limit / quota exceeded — check your billing',
    'ai.keySaved': 'API key saved',
  },

  vi: {
    // Settings bar
    'set.paper': 'Khổ',
    'set.margin': 'Lề',
    'set.mm': 'mm',
    'set.textPad': 'Đệm chữ',
    'set.imgPad': 'Đệm ảnh',
    'set.bd.title': 'Cài đặt viền',
    'set.img.title': 'Cài đặt ảnh',
    'set.font.title': 'Cài đặt font',
    'set.zoom.dec': 'Thu nhỏ giao diện',
    'set.zoom.inc': 'Phóng to giao diện',
    // Font panel
    'font.title': 'Tiêu đề',
    'font.content': 'Nội dung',
    'font.px': 'px',
    'font.lh': 'CK',
    // Border panel
    'bd.width': 'Độ rộng',
    'bd.style': 'Kiểu',
    'bd.color': 'Màu',
    'bd.radius': 'Bo góc',
    // Img panel
    'img.fit': 'Khớp',
    'img.pos': 'Vị trí',
    // Toolbar
    'toolbar.newCard': 'Thẻ mới',
    'toolbar.thumbs': '↻ Thumbnail',
    'toolbar.settings': 'Cài đặt',
    'toolbar.customCss': 'CSS tùy chỉnh',
    'toolbar.setFolder': 'Chọn thư mục',
    'toolbar.save': 'Lưu',
    'toolbar.saveAs': 'Lưu thành',
    'toolbar.load': 'Mở',
    'toolbar.printAll': 'In tất cả',
    'toolbar.pdfAll': 'Xuất PDF',
    'toolbar.toggleSidebar': 'Ẩn/hiện thanh bên',
    // Sidebar
    'sidebar.cards': 'Thẻ',
    'sidebar.listView': 'Dạng danh sách',
    'sidebar.gridView': 'Dạng lưới',
    // Preview
    'preview.label': 'Xem trước',
    'preview.print': 'In',
    'preview.export': 'Xuất PDF',
    // Editor
    'editor.empty': 'Chọn một thẻ để chỉnh sửa, hoặc nhấn "+ Thẻ mới"',
    'editor.layout': 'Bố cục',
    'editor.orientation': 'Hướng',
    'editor.imgHeight': 'Chiều cao vùng ảnh',
    'editor.images': 'Ảnh',
    'editor.slots': 'ô',
    'editor.title': 'Tiêu đề',
    'toolbar.labelSize': 'Tiêu đề (riêng)',
    'toolbar.contentSize': 'Nội dung (riêng)',
    'toolbar.gridFontSize': 'Font (chung)',
    'editor.hideTitle': 'Ẩn trên thẻ',
    'editor.hideLabels': 'Ẩn nhãn',
    'editor.titlePh': 'Tiêu đề thẻ...',
    'editor.sections': 'Mục nội dung',
    'editor.noSections': 'Chưa có mục — thêm bên dưới',
    'editor.addSection': 'Thêm mục',
    'editor.pasteBlock': 'Dán nhanh',
    'editor.css': 'CSS',
    'editor.data': 'Dữ liệu',
    'editor.cssHint': 'Chỉ áp dụng cho thẻ này — dùng .fc-title, .fc-section__content, v.v.',
    'editor.pasteBlockPh': 'Đặc điểm: Dạng tai, màu nâu sẫm\nMôi trường: Mọc trên thân cây gỗ mục\nMỗi dòng thành một mục',
    'editor.replaceSection': 'Thay thế mục',
    'editor.append': 'Thêm vào',
    'editor.cancel': 'Hủy',
    'editor.cardData': 'Dữ liệu thẻ hiện tại',
    'editor.edit': 'Sửa',
    'editor.saveData': 'Lưu',
    'editor.labelPh': 'Nhãn',
    'editor.contentPh': 'Nội dung (Markdown)...',
    'editor.pairedPh': 'Chú thích...',
    'editor.noImage': 'Chưa có ảnh',
    'editor.hiddenSlot': 'ô {n} — ẩn trong bố cục này',
    'editor.dragHandle': 'Kéo để sắp xếp',
    'editor.custom': 'Tùy chỉnh',
    'editor.bgColor': 'Màu nền',
    'editor.clickImg': 'Nhấn để đổi ảnh',
    'editor.override': 'Ghi đè',
    'editor.fromGlobal': '↑ từ cài đặt chung',
    // Orientation
    'orient.portrait': 'Dọc',
    'orient.landscape': 'Ngang',
    // Confirm
    'confirm.deleteCard': 'Xóa thẻ này?',
    // Card
    'card.untitled': 'Chưa đặt tên',
    'card.new': 'Thẻ mới',
    // Restore banner
    'restore.resume': 'Tiếp tục',
    'restore.dismiss': 'Bỏ qua',
    // Misc
    'misc.moveUp': 'Lên',
    'misc.moveDown': 'Xuống',
    'misc.clone': 'Nhân bản',
    'misc.delete': 'Xóa',
    'toast.jsonCopied': 'Đã copy JSON (không có hình)',
    'toast.jsonCopiedFull': 'Đã copy JSON',
    'toast.jsonExported': 'Đã tải file JSON',
    'json.btnTitle': 'Xuất / Copy JSON',
    'json.modalTitle': 'Xuất / Copy JSON',
    'json.exportFile': 'Xuất ra file',
    'json.exportFileDesc': 'Tải xuống dạng .json',
    'json.copyFull': 'Copy JSON',
    'json.copyFullDesc': 'Toàn bộ project bao gồm hình',
    'json.copyNoImg': 'Copy JSON (không hình)',
    'json.copyNoImgDesc': 'Hình được thay bằng placeholder URL',
    'json.pasteLoad': 'Paste & Load',
    'json.pasteLoadDesc': 'Load project từ JSON trong clipboard',
    'toast.jsonLoaded': 'Đã load project từ clipboard',
    'toast.jsonInvalid': 'Clipboard không chứa JSON hợp lệ',
    'toast.clipboardDenied': 'Không có quyền đọc clipboard',
    'ai.noKey': 'Nhập OpenAI API key trước',
    'ai.noSubject': 'Nhập chủ đề cần generate',
    'ai.generating': 'Đang generate… chờ vài giây',
    'ai.done': 'Đã generate project cho',
    'ai.badKey': 'API key không hợp lệ (401)',
    'ai.emptyResponse': 'AI trả về kết quả rỗng',
    'ai.rateLimit': 'Rate limit / hết quota — kiểm tra billing',
    'ai.keySaved': 'Đã lưu API key',
  },
};

let _lang = localStorage.getItem('fc_lang') || 'en';

function t(key) {
  return (STRINGS[_lang] || STRINGS.en)[key] ?? STRINGS.en[key] ?? key;
}

function getLang() { return _lang; }

function setLang(lang) {
  if (!STRINGS[lang]) return;
  _lang = lang;
  localStorage.setItem('fc_lang', lang);
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  applyI18n();
  renderEditor();
  renderSidebar();
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
}
