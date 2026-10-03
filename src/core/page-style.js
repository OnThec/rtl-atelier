/**
 * Pure builders for the styles injected into web pages. No DOM, no Node
 * built-ins — shared by the content script and covered by unit tests.
 */

const FONT_FORMATS = new Set(["woff2", "woff", "opentype", "truetype"]);

export function quoteFamily(family) {
  return `"${String(family).replace(/[\\"]/g, "\\$&")}"`;
}

export function formatFor(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".woff2")) return "woff2";
  if (lower.endsWith(".woff")) return "woff";
  if (lower.endsWith(".otf")) return "opentype";
  if (lower.endsWith(".ttf")) return "truetype";
  return "";
}

export function safeWeight(value) {
  const num = Math.round(Number(value));
  return Number.isFinite(num) ? Math.min(900, Math.max(100, num)) : 400;
}

/** Mirrors RtlEngine.fontActive(): whether units receive the .rtlm-font class. */
export function fontClassMode(settings) {
  return Boolean(
    (settings.pageFont && settings.pageFont !== "default") ||
      String(settings.pageFontWeight) !== "auto" ||
      Number(settings.pageFontSize) !== 100
  );
}

/**
 * Selector scope for injected font rules.
 * - "rtl": only units the engine detected as right-to-left (precise, default).
 * - "readable": every common text container, so fonts also apply on pages
 *   without Persian/Arabic content — previously a dead control there.
 *
 * The list also covers rich-text editors (ProseMirror composers on Claude,
 * Quill on Gemini) and the data-testid message containers used by the
 * flagship chat platforms, whose text frequently sits outside classic
 * block tags — the previous list is why "all readable text" only partially
 * covered Claude.
 */
const READABLE_SELECTOR =
  "p, li, blockquote, dd, dt, td, th, caption, figcaption, h1, h2, h3, h4, h5, h6, summary, " +
  "[contenteditable='true'], [data-testid='user-message'], [data-testid='assistant-message'], " +
  "[data-message-author-role]";

export function fontScopeSelector(settings) {
  return settings?.fontScope === "readable" ? READABLE_SELECTOR : ".rtlm-font";
}

/**
 * CSS for the main injected <style>. Returns exactly "" when there is nothing
 * to apply so callers can avoid creating empty style elements on pages where
 * the extension is inactive.
 */
export function pageFontCss(settings, active) {
  if (!active) return "";
  const rules = [];
  const sel = fontScopeSelector(settings);
  const family = settings.pageFont;
  const isClassScope = sel === ".rtlm-font";
  const chatBoost =
    ":is([class*='font-claude'], [class*='font-user'], [role='article'], [data-testid*='message'], [class*='prose'], [class*='markdown']) .rtlm-font, " +
    ".rtlm-font.rtlm-font";

  // Family is optional; weight and size are meaningful on their own and must
  // apply even while the site default family is in use.
  if (family && family !== "default") {
    const chain = `${quoteFamily(family)}, ${quoteFamily("Vazir")}, "Vazirmatn", Tahoma, sans-serif`;
    rules.push(`${sel} { font-family: ${chain} !important; }`);
    if (isClassScope) {
      rules.push(`${chatBoost} { font-family: ${chain} !important; }`);
    }
  }
  const weight = String(settings.pageFontWeight);
  if (weight !== "auto" && /^[1-9]00$/.test(weight)) {
    rules.push(`${sel} { font-weight: ${weight} !important; }`);
    if (isClassScope) {
      rules.push(`${chatBoost} { font-weight: ${weight} !important; }`);
    }
  }
  const size = Number(settings.pageFontSize);
  if (Number.isFinite(size) && size > 0 && size !== 100) {
    // Percent-of-inherited sizing keeps the page's own hierarchy intact.
    rules.push(`${sel} { font-size: ${Math.round(size)}% !important; }`);
    if (isClassScope) {
      rules.push(`${chatBoost} { font-size: ${Math.round(size)}% !important; }`);
    }
  }
  return rules.length > 0 ? `${rules.join("\n")}\n` : "";
}

/**
 * One validated @font-face rule from a stored custom-font record, or null
 * when the record is malformed. Storage is re-validated at injection time.
 */
export function fontFaceRule(record) {
  if (!record || typeof record.data !== "string" || record.data.length === 0) return null;
  const data = record.data.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const format = formatFor(record.name);
  if (!FONT_FORMATS.has(format)) return null;
  const family =
    typeof record.family === "string" && record.family.length > 0 && record.family.length <= 64
      ? record.family
      : "";
  if (!family) return null;
  const mimeMap = {
    woff2: "font/woff2",
    woff: "font/woff",
    opentype: "font/otf",
    truetype: "font/ttf",
  };
  const mime = mimeMap[format] || `font/${format}`;
  return (
    `@font-face {\n` +
    `  font-family: ${quoteFamily(family)};\n` +
    `  src: url(data:${mime};base64,${data}) format("${format}");\n` +
    `  font-weight: ${safeWeight(record.weight)};\n` +
    `  font-style: normal;\n` +
    `  font-display: swap;\n` +
    `}`
  );
}
