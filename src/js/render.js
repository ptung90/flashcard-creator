import { LAYOUT_SLOTS, LAYOUT_SPLIT_DEFAULTS, getCardOrientation, getLocaleValue, state } from './core/state.js'
import { esc, getPaperPx, mmToPx, mdParseInline, renderSectionContent, mdParse } from './core/utils.js'

// ── Card Render (HTML) ─────────────────────────────────────────────
const GRID_STRATEGIES = {
  "2x2": (r, c, n) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:${c}% ${100 - c}%;`,
  "1top-1bot": (r, c, n) => `grid-template-rows:${r}% ${100 - r}%;`,
  "2top-1bot": (r, c, n) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:${n}% ${100 - n}%;`,
  "1top-2bot": (r, c, n) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:${n}% ${100 - n}%;`,
  "1big-2small": (r, c, n) => `grid-template-columns:${c}% ${100 - c}%;grid-template-rows:${n}% ${100 - n}%;`,
  "1left-2right": (r, c, n) => `grid-template-columns:${c}% ${100 - c}%;grid-template-rows:${n}% ${100 - n}%;`,
  "1left-3right": (r, c, n) => `grid-template-columns:${c}% ${100 - c}%;grid-template-rows:1fr 1fr 1fr;`,
  "1top-3bot": (r, c, n) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:1fr 1fr 1fr;`,
  "2img-2txt": (r, c, n) => `grid-template-columns:1fr 1fr;grid-template-rows:${r}% ${100 - r}%;`,
  "2img-4txt": (r, c, n) => `grid-template-columns:1fr 1fr;grid-template-rows:${r}% ${(100 - r) * n / 100}% ${100 - r - ((100 - r) * n / 100)}%;`
};
export function getGridTemplateStyle(layout, sp) {
  const generator = GRID_STRATEGIES[layout];
  return generator ? generator(sp.row, sp.col, sp.inner) : "";
}

const _H = (type, sty) => `<div class="fc-grid-handle" data-handle="${type}" style="position:absolute;z-index:20;${sty}"></div>`;
const _ROW = "height:28px;cursor:row-resize;transform:translateY(-50%)";
const _COL = "width:28px;cursor:col-resize;transform:translateX(-50%)";

const HANDLE_STRATEGIES = {
  "1big-2small": (r, c, n) => _H("col", `left:${c}%;top:0;bottom:0;${_COL}`) + _H("inner-row", `top:${n}%;left:${c}%;right:0;${_ROW}`),
  "1left-2right": (r, c, n) => _H("col", `left:${c}%;top:0;bottom:0;${_COL}`) + _H("inner-row", `top:${n}%;left:${c}%;right:0;${_ROW}`),
  "1left-3right": (r, c, n) => _H("col", `left:${c}%;top:0;bottom:0;${_COL}`),
  "1top-3bot": (r, c, n) => _H("row", `top:${r}%;left:0;right:0;${_ROW}`),
  "2top-1bot": (r, c, n) => _H("row", `top:${r}%;left:0;right:0;${_ROW}`) + _H("inner-col", `left:${n}%;top:0;height:${r}%;${_COL}`),
  "1top-2bot": (r, c, n) => _H("row", `top:${r}%;left:0;right:0;${_ROW}`) + _H("inner-col", `left:${n}%;top:${r}%;height:${100 - r}%;${_COL}`),
  "1top-1bot": (r, c, n) => _H("row", `top:${r}%;left:0;right:0;${_ROW}`),
  "2x2": (r, c, n) => _H("row", `top:${r}%;left:0;right:0;${_ROW}`) + _H("col", `left:${c}%;top:0;bottom:0;${_COL}`),
  "2img-4txt": (r, c, n) => "",
  "2img-2txt": (r, c, n) => "",
  "3img-3txt": (r, c, n) => "",
  "img3-txt3": (r, c, n) => _H("col", `left:${c}%;top:0;bottom:0;${_COL}`),
  "6cell": (r, c, n) => "",
  "txtgrid": (r, c, n) => ""
};

export function buildHandles(layout, sp) {
  const generator = HANDLE_STRATEGIES[layout];
  return generator ? generator(sp.row, sp.col, sp.inner) : "";
}
function resolveImgStyle(img, globalImgStyle) {
  if (!img || img.size == null) return globalImgStyle;
  return "background-size:" + img.size + ";background-position:center;" +
    (img.size !== "cover" && img.color ? "background-color:" + img.color + ";" : "");
}

function buildAttrHtml(img) {
  if (!img?.attribution) return "";
  const { name, profileUrl, photoUrl } = img.attribution;
  return `<div class="fc-img-attribution"><a href="${esc(photoUrl)}" target="_blank">Photo</a> by <a href="${esc(profileUrl)}" target="_blank">${esc(name)}</a> on <a href="https://unsplash.com" target="_blank">Unsplash</a></div>`;
}

function buildSlots(card, slotCount, imgStyle, forPrint = false) {
  return Array.from({ length: slotCount }, (_, i) => {
    const img = card.images.find((im) => im.slot === i);
    if (img && img.url) {
      return (
        '<div class="fc-image-slot fc-image-slot-' + i +
        '"><div class="img-bg" style="background-image:url(\'' + esc(img.url) + "\');" +
        resolveImgStyle(img, imgStyle) +
        'background-repeat:no-repeat;width:100%;height:100%;"></div>' +
        buildAttrHtml(img) +
        '</div>'
      );
    }
    if (forPrint) return '<div class="fc-image-slot fc-image-slot-' + i + '" style="background:transparent;"></div>';
    return '<div class="fc-image-slot fc-image-slot-' + i + '"><span class="empty-placeholder">📷</span></div>';
  }).join("");
}

function buildSectionsHtml(sections, hideLabels, inlineSections) {
  return sections
    .map(
      (sec) =>
        `<div class="fc-section${sec.customClass ? ` ${esc(sec.customClass)}` : ''}">` +
        (!hideLabels && getLocaleValue(sec.label, state.activeLocale) ? '<span class="fc-section__label"' + (sec.labelSize ? ` style="font-size:${sec.labelSize}px"` : '') + '>• ' + mdParseInline(getLocaleValue(sec.label, state.activeLocale)) + ': </span>' : '') +
        '<div class="fc-section__content"' + buildSectionContentStyle(sec, inlineSections) + '>' +
        (inlineSections ? mdParseInline(getLocaleValue(sec.content, state.activeLocale)) : renderSectionContent(getLocaleValue(sec.content, state.activeLocale))) +
        "</div></div>",
    )
    .join("");
}

function buildSectionContentStyle(sec, inline) {
  let s = inline ? 'display:inline;' : '';
  if (sec.fontSize) s += `font-size:${sec.fontSize}px;`;
  if (sec.textAlign) s += `text-align:${sec.textAlign};`;
  return s ? ` style="${s}"` : '';
}

function buildSectionCellHtml(section, hideLabels) {
  if (!section) return '<div class="fc-section fc-section--empty"></div>';
  const _label = getLocaleValue(section.label, state.activeLocale);
  const _content = getLocaleValue(section.content, state.activeLocale);
  return (
    `<div class="fc-section${section.customClass ? ` ${esc(section.customClass)}` : ''}">` +
    (!hideLabels && _label ? '<span class="fc-section__label"' + (section.labelSize ? ` style="font-size:${section.labelSize}px"` : '') + '>• ' + mdParseInline(_label) + ': </span>' : '') +
    '<div class="fc-section__content"' + ((section.fontSize || section.textAlign) ? ` style="${section.fontSize ? `font-size:${section.fontSize}px;` : ''}${section.textAlign ? `text-align:${section.textAlign};` : ''}"` : '') + '>' +
    renderSectionContent(_content) +
    "</div></div>"
  );
}

function buildCompoundCellStyle(baseStyle, options = {}) {
  const {
    paddingPx = 0,
    borderWidth = 0,
    borderCss = "",
    borderRadiusPx = 0,
    overflow = "auto",
    background = "white",
  } = options;
  return (
    baseStyle +
    "box-sizing:border-box;" +
    "background:" + background + ";" +
    "padding:" +
    paddingPx +
    "px;" +
    "overflow:" +
    overflow +
    ";" +
    "border:" +
    borderWidth +
    "px " +
    borderCss +
    ";" +
    "border-radius:" +
    borderRadiusPx +
    "px;"
  );
}

function buildCompoundImageSlots(card, imgStyle, cellOptions, sections, forPrint = false) {
  const slotCount = LAYOUT_SLOTS[card.layout] || 0;
  return Array.from({ length: slotCount }, (_, i) => {
    const img = card.images.find((im) => im.slot === i);
    const section = sections ? sections[i] : null;
    const label = section && !card.hideSectionLabels && getLocaleValue(section.label, state.activeLocale) ? getLocaleValue(section.label, state.activeLocale) : null;
    const hasImg = !!(img && img.url);
    const effectiveCellOptions = (forPrint && !hasImg) ? { ...cellOptions, borderWidth: 0 } : cellOptions;
    const slotStyle = buildCompoundCellStyle(
      label ? "display:flex;flex-direction:column;" : "",
      { ...effectiveCellOptions, overflow: "hidden" }
    );
    const imgContent = hasImg
      ? '<div class="fc-compound-cell-inner" style="flex:1;width:100%;height:100%;overflow:hidden;"><div class="img-bg" style="background-image:url(\'' +
      esc(img.url) + "\');" + resolveImgStyle(img, imgStyle) +
      'background-repeat:no-repeat;width:100%;height:100%;"></div></div>'
      : forPrint
        ? '<div class="fc-compound-cell-inner" style="flex:1;width:100%;height:100%;background:transparent;"></div>'
        : '<div class="fc-compound-cell-inner" style="flex:1;width:100%;height:100%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;overflow:hidden;"><span class="empty-placeholder">📷</span></div>';
    const labelHtml = label
      ? '<div class="fc-img-label"' + (section.labelSize ? ' style="font-size:' + section.labelSize + 'px"' : '') + '>' + mdParseInline(label) + '</div>'
      : '';
    return (
      '<div class="fc-image-slot fc-image-slot-' + i + '" style="' + slotStyle + '">' +
      imgContent +
      labelHtml +
      "</div>"
    );
  }).join("");
}

function buildSectionCellsHtml(sections, count, contentStyle, cellOptions, hideLabels, forPrint = false) {
  return Array.from({ length: count }, (_, i) => {
    const sec = sections[i];
    const isEmpty = !sec || (!(sec.content || '').trim() && !((sec.label || '').trim() && !hideLabels));
    const opts = (forPrint && isEmpty) ? { ...cellOptions, borderWidth: 0 } : cellOptions;
    return (
      '<div class="fc-sections" style="' +
      buildCompoundCellStyle(contentStyle, opts) +
      '">' +
      buildSectionCellHtml(sec, hideLabels) +
      "</div>"
    );
  }).join("");
}

const COMPOUND_TRACK_STRATEGIES = {
  "2img-2txt": (sp, gap) => ({
    columns: `calc((100% - ${gap}px)/2) calc((100% - ${gap}px)/2)`,
    rows: `calc((100% - ${gap}px) * ${sp.row} / 100) calc((100% - ${gap}px) * ${100 - sp.row} / 100)`
  }),
  "3img-3txt": (sp, gap) => ({
    columns: `calc((100% - ${gap * 2}px)/3) calc((100% - ${gap * 2}px)/3) calc((100% - ${gap * 2}px)/3)`,
    rows: `calc((100% - ${gap}px) * ${sp.row} / 100) calc((100% - ${gap}px) * ${100 - sp.row} / 100)`
  }),
  "img3-txt3": (sp, gap) => ({
    columns: `calc((100% - ${gap}px) * ${sp.col} / 100) calc((100% - ${gap}px) * ${100 - sp.col} / 100)`,
    rows: `repeat(3, calc((100% - ${gap * 2}px) / 3))`
  }),
  "2img-4txt": (sp, gap) => {
    const rTop = ((100 - sp.row) * sp.inner) / 100;
    const rBot = ((100 - sp.row) * (100 - sp.inner)) / 100;
    return {
      columns: `calc((100% - ${gap}px)/2) calc((100% - ${gap}px)/2)`,
      rows: `calc((100% - ${gap * 2}px) * ${sp.row} / 100) calc((100% - ${gap * 2}px) * ${rTop} / 100) calc((100% - ${gap * 2}px) * ${rBot} / 100)`
    };
  }
};

function getCompoundGridStyle(layout, split, gapPx, imgPct) {
  const sp = (layout === "2img-2txt" || layout === "3img-3txt") && imgPct != null ? { ...split, row: imgPct } : split;
  const tracks = getCompoundGridTracks(layout, sp, gapPx);
  return tracks ? `grid-template-columns:${tracks.columns};grid-template-rows:${tracks.rows};` : "";
}

export function getCompoundGridTracks(layout, split, gapPx) {
  const generator = COMPOUND_TRACK_STRATEGIES[layout];
  return generator ? generator(split, gapPx) : null;
}

function buildFontOverride(f) {
  return (
    (f.family ? "font-family:" + f.family + ";" : "") +
    (f.size ? "font-size:" + f.size + "px;" : "") +
    (f.weight ? "font-weight:" + f.weight + ";" : "") +
    (f.color ? "color:" + f.color + ";" : "") +
    (f.lineHeight ? "line-height:" + f.lineHeight + ";" : "") +
    (f.textAlign ? "text-align:" + f.textAlign + ";" : "")
  );
}

const TEXT_VALIGN_MAP = { top: "flex-start", middle: "center", bottom: "flex-end" };

function _scopeCardCss(css, cardId) {
  const prefix = `.fc-card[data-id="${cardId}"]`;
  return css.replace(/([^{}@][^{]*)\{([^}]*)\}/g, (_, sel, body) =>
    `${prefix} ${sel.trim()} { ${body} }`
  );
}

export function buildCardHTML(card, settings, forPrint = false, overridePx = null) {
  const s = settings;
  const { w, h } = overridePx || getPaperPx(s.paperSize, card.orientation || s.orientation);
  const marginPx = mmToPx(s.margin);
  const paddingPx = mmToPx(s.padding);
  const imgPaddingPx = mmToPx(s.imgPadding ?? 0);
  const vAlign = s.textVAlign || "top";
  const vAlignJustify = TEXT_VALIGN_MAP[vAlign] || "flex-start";
  const textVAlignStyle = "justify-content:" + vAlignJustify + ";";
  const sectionsFlexOverride = vAlign !== "top" ? "flex:none;" : "";
  const compoundTextBase = "display:flex;flex-direction:column;" + textVAlignStyle;
  const cardW = w - 2 * marginPx;
  const cardH = h - 2 * marginPx;
  const innerH = cardH - 2 * paddingPx;
  const imgH = Math.round((innerH * card.imageHeightPercent) / 100);
  const slotCount = LAYOUT_SLOTS[card.layout] ?? 3;
  const split = card.imageGridSplit ||
    LAYOUT_SPLIT_DEFAULTS[card.layout] || { row: 50, col: 50, inner: 50 };

  const imgStyle =
    "background-size:" +
    s.image.backgroundSize +
    ";background-position:" +
    s.image.backgroundPosition +
    ";";

  const slots = buildSlots(card, slotCount, imgStyle, forPrint);
  const handles = forPrint ? "" : buildHandles(card.layout, split);
  const hideLabels = !!card.hideSectionLabels;
  const sectionsHtml = buildSectionsHtml(card.sections, hideLabels, !!card.inlineSections);

  const cls =
    "fc-card fc-card--" +
    (forPrint ? "print" : "preview") +
    " fc-layout-" +
    card.layout +
    (card.cssClass ? " " + card.cssClass.trim() : "");
  const borderStyle =
    "border:" +
    s.border.width +
    "px " +
    s.border.style +
    " " +
    s.border.color +
    ";border-radius:" +
    s.border.radius +
    "px;";
  const sizeStyle =
    "width:" +
    cardW +
    "px;height:" +
    cardH +
    "px;margin:" +
    marginPx +
    "px auto;background:white;padding:" +
    paddingPx +
    "px;";
  const compoundSizeStyle =
    "width:" +
    cardW +
    "px;height:" +
    cardH +
    "px;margin:" +
    marginPx +
    "px auto;background:white;padding:0;";
  const compoundWrapperStyle =
    "width:" +
    cardW +
    "px;height:" +
    cardH +
    "px;margin:" +
    marginPx +
    "px auto;background:white;padding:0;border:none;";
  const gridStyle = getGridTemplateStyle(card.layout, split);
  const resolvedTitle = getLocaleValue(card.title, state.activeLocale);
  const titleF = { ...s.titleFont, ...(card.titleFont || {}) };
  const contentF = { ...s.contentFont, ...(card.contentFont || {}) };
  const titleStyle = buildFontOverride(titleF);
  const contentStyle = buildFontOverride(contentF);
  const _cs = `.fc-card[data-id="${card.id}"]`;
  const _h1Rule =
    `${_cs} .fc-section__content h1{margin:0;padding:0;${titleStyle}}` +
    `${_cs} .fc-section__content h2{margin:0;padding:0;${titleStyle}font-size:${Math.round((titleF.size || 14) * 0.85)}px;}` +
    `${_cs} .fc-section__content h3{margin:0;padding:0;${titleStyle}font-size:${Math.round((titleF.size || 14) * 0.75)}px;}`;
  const _labelSizeRule = card.labelSize
    ? `${_cs} .fc-section__label{font-size:${card.labelSize}px}${_cs} .fc-img-label{font-size:${card.labelSize}px}`
    : '';
  const _contentSizeRule = card.contentSize
    ? `${_cs} .fc-section__content{font-size:${card.contentSize}px}`
    : '';
  const _imgLabelFontRule = contentStyle ? `${_cs} .fc-img-label{${contentStyle}}` : '';
  const cardStyleTag = '<style>' + _h1Rule + _labelSizeRule + _contentSizeRule + _imgLabelFontRule + (card.customCss ? _scopeCardCss(card.customCss, card.id) : '') + '</style>';
  const showTitle = !!resolvedTitle && !card.hideTitle;
  const borderCss = s.border.style + " " + s.border.color;
  const compoundCellOptions = {
    paddingPx,
    borderWidth: s.border.width,
    borderCss,
    borderRadiusPx: s.border.radius,
  };
  const imgCompoundCellOptions = {
    paddingPx: imgPaddingPx,
    borderWidth: s.border.width,
    borderCss,
    borderRadiusPx: s.border.radius,
  };
  const compoundGridStyle = getCompoundGridStyle(card.layout, split, marginPx, card.imageHeightPercent);

  // fullimage: image-only card with inner padding wrapper
  if (card.layout === 'fullimage') {
    const borderW = s.border.width || 0;
    const nopadStyle = "width:" + cardW + "px;height:" + cardH + "px;margin:" + marginPx + "px auto;background:white;padding:0;";
    const innerWrapStyle =
      "box-sizing:border-box;width:100%;height:100%;padding:" +
      imgPaddingPx +
      'px;';
    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id +
      '" style="' + nopadStyle + borderStyle + '">' +
      '<div style="' + innerWrapStyle + '">' +
      '<div class="fc-image-area" style="height:' + (cardH - 2 * imgPaddingPx - 2 * borderW) + 'px;position:relative;">' +
      slots + handles +
      '</div></div></div>'
    );
  }

  if (card.layout === "2img-2txt") {
    const sectionA = buildSectionCellHtml(card.sections[0], hideLabels);
    const sectionB = buildSectionCellHtml(card.sections[1], hideLabels);
    const compoundSlots = buildCompoundImageSlots(card, imgStyle, imgCompoundCellOptions, null, forPrint);
    return (
      cardStyleTag +
      '<div class="' +
      cls +
      '" data-layout="' +
      card.layout +
      '" data-id="' +
      card.id +
      '" style="' +
      compoundWrapperStyle +
      '">' +
      (showTitle
        ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + "</div>"
        : "") +
      '<div class="fc-image-area" style="flex:1;position:relative;display:grid;overflow:hidden;gap:' +
      marginPx +
      "px;" +
      compoundGridStyle +
      '">' +
      compoundSlots +
      '<div class="fc-sections" style="' +
      buildCompoundCellStyle(compoundTextBase + contentStyle, compoundCellOptions) +
      '">' +
      sectionA +
      '</div>' +
      '<div class="fc-sections" style="' +
      buildCompoundCellStyle(compoundTextBase + contentStyle, compoundCellOptions) +
      '">' +
      sectionB +
      "</div>" +
      handles +
      "</div></div>"
    );
  }

  if (card.layout === "3img-3txt") {
    const sectionA = buildSectionCellHtml(card.sections[0], true);
    const sectionB = buildSectionCellHtml(card.sections[1], true);
    const sectionC = buildSectionCellHtml(card.sections[2], true);
    const compoundSlots = buildCompoundImageSlots(card, imgStyle, imgCompoundCellOptions, card.sections, forPrint);
    return (
      cardStyleTag +
      '<div class="' +
      cls +
      '" data-layout="' +
      card.layout +
      '" data-id="' +
      card.id +
      '" style="' +
      compoundWrapperStyle +
      '">' +
      (showTitle
        ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + "</div>"
        : "") +
      '<div class="fc-image-area" style="flex:1;position:relative;display:grid;overflow:hidden;gap:' +
      marginPx +
      "px;" +
      compoundGridStyle +
      '">' +
      compoundSlots +
      '<div class="fc-sections" style="' + buildCompoundCellStyle(compoundTextBase + contentStyle, compoundCellOptions) + '">' + sectionA + '</div>' +
      '<div class="fc-sections" style="' + buildCompoundCellStyle(compoundTextBase + contentStyle, compoundCellOptions) + '">' + sectionB + '</div>' +
      '<div class="fc-sections" style="' + buildCompoundCellStyle(compoundTextBase + contentStyle, compoundCellOptions) + '">' + sectionC + '</div>' +
      handles +
      "</div></div>"
    );
  }

  if (card.layout === "img3-txt3") {
    // Interleaved DOM order (img0,txt0,img1,txt1,img2,txt2) so 2-col grid auto-places images left, text right
    const rowBorders = card.imageGridSplit?.rowBorders;
    const r = s.border.radius;
    const cells = Array.from({ length: 3 }, (_, i) => {
      const sec = card.sections[i] || { id: '', label: '', content: '' };
      const img = card.images.find(im => im.slot === i);
      const imgContent = img && img.url
        ? '<div class="fc-compound-cell-inner" style="flex:1;width:100%;height:100%;overflow:hidden;"><div class="img-bg" style="background-image:url(\'' + esc(img.url) + '\');' + resolveImgStyle(img, imgStyle) + 'background-repeat:no-repeat;width:100%;height:100%;"></div></div>'
        : forPrint
          ? '<div class="fc-compound-cell-inner" style="flex:1;width:100%;height:100%;background:transparent;"></div>'
          : '<div class="fc-compound-cell-inner" style="flex:1;width:100%;height:100%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;overflow:hidden;"><span class="empty-placeholder">📷</span></div>';
      const label = sec && !card.hideSectionLabels && getLocaleValue(sec.label, state.activeLocale) ? getLocaleValue(sec.label, state.activeLocale) : null;
      const labelHtml = label ? '<div class="fc-img-label"' + (sec.labelSize ? ' style="font-size:' + sec.labelSize + 'px"' : '') + '>' + mdParseInline(label) + '</div>' : '';
      const isImgEmpty = !(img && img.url);
      const isTxtEmpty = !((sec.content || '').trim() || (sec.label || '').trim());
      // rowBorders mode: merge img+txt into one visual row — remove the shared border edge and set directional radius
      const imgExtra = rowBorders ? 'border-right:0;border-radius:' + r + 'px 0 0 ' + r + 'px;' : '';
      const txtExtra = rowBorders ? 'border-left:0;border-radius:0 ' + r + 'px ' + r + 'px 0;' : '';
      const imgCellOpts = (forPrint && isImgEmpty) ? { ...imgCompoundCellOptions, borderWidth: 0 } : imgCompoundCellOptions;
      const txtCellOpts = (forPrint && isTxtEmpty) ? { ...compoundCellOptions, borderWidth: 0 } : compoundCellOptions;
      const imgCellStyle = buildCompoundCellStyle(label ? 'display:flex;flex-direction:column;' : '', { ...imgCellOpts, overflow: 'hidden' }) + imgExtra;
      const imgCell = '<div class="fc-image-slot fc-image-slot-' + i + '" style="' + imgCellStyle + '">' + imgContent + labelHtml + '</div>';
      const txtCell = '<div class="fc-sections" style="' + buildCompoundCellStyle(compoundTextBase + contentStyle, txtCellOpts) + txtExtra + '">' + buildSectionCellHtml(sec, true) + '</div>';
      return imgCell + txtCell;
    }).join('');
    const gapStyle = rowBorders
      ? 'row-gap:' + marginPx + 'px;column-gap:0;'
      : 'gap:' + marginPx + 'px;';
    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id + '" style="' + compoundWrapperStyle + '">' +
      (showTitle ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + '</div>' : '') +
      '<div class="fc-image-area" style="flex:1;position:relative;display:grid;overflow:hidden;' + gapStyle + compoundGridStyle + '">' +
      cells + handles +
      '</div></div>'
    );
  }

  if (card.layout === "6cell") {
    const effectiveOrientation = card.orientation || s.orientation;
    const isLandscape = effectiveOrientation === "landscape";
    const cols = isLandscape ? 3 : 2;
    const rows = isLandscape ? 2 : 3;
    const imgFlex = card.imageHeightPercent || 55;
    const txtFlex = 100 - imgFlex;
    const cells = Array.from({ length: 6 }, (_, i) => {
      const img = card.images.find(im => im.slot === i);
      const section = card.sections[i] || { id: '', label: '', content: '' };
      const hasImg = !!(img && img.url);
      const _6cellLabel = getLocaleValue(section.label, state.activeLocale);
      const _6cellContent = getLocaleValue(section.content, state.activeLocale);
      const hasTitle = !!(_6cellLabel && !hideLabels);
      const hasContent = !!_6cellContent;
      const imgAreaHtml = hasImg
        ? '<div style="flex:' + imgFlex + ';min-height:0;overflow:hidden;box-sizing:border-box;padding:' + imgPaddingPx + 'px;">' +
        '<div class="img-bg" style="background-image:url(\'' + esc(img.url) + '\');' + resolveImgStyle(img, imgStyle) + 'background-repeat:no-repeat;width:100%;height:100%;"></div>' +
        '</div>'
        : '';
      const cellTitleHtml = hasTitle
        ? '<div class="fc-6cell-title" style="' + titleStyle + '">' + mdParseInline(_6cellLabel) + '</div>'
        : '';
      const textHtml = hasContent
        ? '<div class="fc-sections" style="flex:' + txtFlex + ';min-height:0;overflow:auto;padding:' + paddingPx + 'px;' + compoundTextBase + contentStyle + '">' +
        buildSectionCellHtml(section, true) +
        '</div>'
        : '';
      const isEmpty = !hasImg && !hasContent && !hasTitle;
      const cellStyle = buildCompoundCellStyle('display:flex;flex-direction:column;', {
        paddingPx: 0,
        borderWidth: (forPrint && isEmpty) ? 0 : s.border.width,
        borderCss,
        borderRadiusPx: s.border.radius,
        overflow: 'hidden',
      });
      return (
        '<div class="fc-image-slot-' + i + '" style="' + cellStyle + '">' +
        imgAreaHtml + cellTitleHtml + textHtml +
        '</div>'
      );
    }).join('');
    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id + '" style="' + compoundWrapperStyle + '">' +
      (showTitle ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + '</div>' : '') +
      '<div style="flex:1;overflow:hidden;display:grid;grid-template-columns:repeat(' + cols + ',1fr);grid-template-rows:repeat(' + rows + ',1fr);gap:' + marginPx + 'px;">' +
      cells +
      '</div></div>'
    );
  }

  if (card.layout === "2img-4txt") {
    const compoundSlots = buildCompoundImageSlots(card, imgStyle, imgCompoundCellOptions, null, forPrint);
    return (
      cardStyleTag +
      '<div class="' +
      cls +
      '" data-layout="' +
      card.layout +
      '" data-id="' +
      card.id +
      '" style="' +
      compoundWrapperStyle +
      '">' +
      (showTitle
        ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + "</div>"
        : "") +
      '<div class="fc-image-area" style="flex:1;position:relative;display:grid;overflow:hidden;gap:' +
      marginPx +
      "px;" +
      compoundGridStyle +
      '">' +
      compoundSlots +
      buildSectionCellsHtml(card.sections, 4, compoundTextBase + contentStyle, compoundCellOptions, hideLabels, forPrint) +
      handles +
      "</div></div>"
    );
  }


  if (card.layout === "8img-8txt") {
    const effectiveOrientation = card.orientation || s.orientation;
    const isLandscape = effectiveOrientation === "landscape";
    const cols = isLandscape ? 4 : 2;
    const pairRows = isLandscape ? 2 : 4;
    const imgFr = card.imageHeightPercent || 65;
    const txtFr = 100 - imgFr;
    const rowTemplate = "repeat(" + pairRows + "," + imgFr + "fr " + txtFr + "fr)";

    const imgItems = [];
    const txtItems = [];
    for (let i = 0; i < 8; i++) {
      const img = card.images.find((im) => im.slot === i);
      const section = card.sections[i];
      const imgContent = img && img.url
        ? '<div style="width:100%;height:100%;overflow:hidden;"><div class="img-bg" style="background-image:url(\'' +
        esc(img.url) + '\');' + resolveImgStyle(img, imgStyle) + 'background-repeat:no-repeat;width:100%;height:100%;"></div></div>'
        : forPrint
          ? '<div style="width:100%;height:100%;background:transparent;"></div>'
          : '<div style="width:100%;height:100%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;"><span class="empty-placeholder">📷</span></div>';
      imgItems.push(
        '<div class="fc-image-slot fc-image-slot-' + i + '" style="' +
        buildCompoundCellStyle("", { paddingPx: imgPaddingPx, borderWidth: s.border.width, borderCss, borderRadiusPx: s.border.radius, overflow: "hidden" }) + '">' +
        imgContent + '</div>'
      );
      txtItems.push(
        '<div class="fc-sections" style="' +
        buildCompoundCellStyle(compoundTextBase + contentStyle, compoundCellOptions) + '">' +
        buildSectionCellHtml(section, hideLabels) +
        '</div>'
      );
    }

    let cells = "";
    for (let p = 0; p < pairRows; p++) {
      for (let c = 0; c < cols; c++) cells += imgItems[p * cols + c];
      for (let c = 0; c < cols; c++) cells += txtItems[p * cols + c];
    }

    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id + '" style="' + compoundWrapperStyle + '">' +
      '<div style="width:100%;height:100%;display:grid;grid-template-columns:repeat(' + cols + ',1fr);grid-template-rows:' + rowTemplate + ';gap:' + marginPx + 'px;">' +
      cells + '</div></div>'
    );
  }

  if (card.layout === "txtgrid") {
    const cols = card.textCols || 3;
    const gridAutoRows = card.textCardHeight ? card.textCardHeight + "px" : "auto";
    const colTrack = "calc((100% - " + (marginPx * (cols - 1)) + "px)/" + cols + ")";
    const colTracks = Array(cols).fill(colTrack).join(" ");
    const gridStyle3 =
      "grid-template-columns:" + colTracks + ";" +
      "grid-auto-rows:" + gridAutoRows + ";";
    const cellCount = (card.textRows || 1) * cols;
    const gridContentStyle = card.gridFontSize ? contentStyle + 'font-size:' + card.gridFontSize + 'px;' : contentStyle;
    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id +
      '" style="' + compoundWrapperStyle + '">' +
      (showTitle ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + '</div>' : '') +
      '<div style="flex:1;overflow:auto;display:grid;gap:' + marginPx + 'px;' + gridStyle3 + '">' +
      buildSectionCellsHtml(card.sections, cellCount, compoundTextBase + gridContentStyle, compoundCellOptions, hideLabels, forPrint) +
      '</div></div>'
    );
  }

  // fulltext: text fills entire card, no image area
  if (card.layout === 'fulltext') {
    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id +
      '" style="' + sizeStyle + borderStyle + '">' +
      '<div class="fc-text-area" style="height:' + cardH + 'px;overflow:auto;' + textVAlignStyle + '">' +
      (showTitle ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + '</div>' : '') +
      '<div class="fc-sections" style="' + contentStyle + sectionsFlexOverride + '">' + sectionsHtml + '</div>' +
      '</div></div>'
    );
  }

  return (
    cardStyleTag +
    '<div class="' +
    cls +
    '" data-layout="' +
    card.layout +
    '" data-id="' +
    card.id +
    '" style="' +
    sizeStyle +
    borderStyle +
    '">' +
    '<div class="fc-image-area" style="height:' +
    imgH +
    "px;position:relative;" +
    gridStyle +
    '">' +
    slots +
    handles +
    "</div>" +
    '<div class="fc-text-area" style="' + textVAlignStyle + '">' +
    (showTitle
      ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + "</div>"
      : "") +
    '<div class="fc-sections" style="' + contentStyle + sectionsFlexOverride + '">' +
    sectionsHtml +
    "</div></div></div>"
  );
}

export function buildCaptureHTML(card, settings) {
  const paperSize = card.paperSize || settings.paperSize;
  const orient = getCardOrientation(card);
  const { w, h } = getPaperPx(paperSize, orient);
  const overridePx = card.paperSize ? { w, h } : null;
  return (
    '<div style="width:' + w + 'px;height:' + h + 'px;background:white;position:relative;overflow:hidden;">' +
    buildCardHTML(card, settings, true, overridePx) +
    '</div>'
  );
}