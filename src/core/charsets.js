const RTL_RANGES = [
  [0x0590, 0x05ff], // Hebrew + presentation forms
  [0x0600, 0x06ff], // Arabic
  [0x0700, 0x074f], // Syriac
  [0x0750, 0x077f], // Arabic Supplement
  [0x0780, 0x07bf], // Thaana
  [0x07c0, 0x07ff], // NKo
  [0x0840, 0x085f], // Mandaic
  [0x0860, 0x086f], // Syriac Supplement
  [0x0870, 0x089f], // Arabic Extended-B (Unicode 14+)
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb1d, 0xfb4f], // Hebrew presentation forms
  [0xfb50, 0xfdff], // Arabic presentation forms A (full block)
  [0xfe70, 0xfeff], // Arabic presentation forms B
];

// Persian/Arabic-script punctuation ("،" "؛" "؟") is shared by Arabic too,
// so it must NOT count as Persian evidence — treating it as such Persianized
// ("ي"→"ی", "ك"→"ک") every Arabic sentence containing a comma.
const PERSIAN_MARKERS = new Set([
  0x067e, 0x0686, 0x0698, 0x06af, 0x06cc, 0x06a9,
  0x06f0, 0x06f1, 0x06f2, 0x06f3, 0x06f4,
  0x06f5, 0x06f6, 0x06f7, 0x06f8, 0x06f9,
]);

function inRanges(code, ranges) {
  for (let i = 0; i < ranges.length; i++) {
    if (code >= ranges[i][0] && code <= ranges[i][1]) return true;
  }
  return false;
}

export function isRtlCode(code) {
  return inRanges(code, RTL_RANGES);
}

export function isLatinCode(code) {
  // 0xd7 (×) and 0xf7 (÷) sit inside the Latin-1 supplement range but are
  // math symbols with neutral bidi class; counting them as letters skewed
  // the RTL/LTR ratio on mixed-formula text.
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0xc0 && code <= 0x024f && code !== 0xd7 && code !== 0xf7) ||
    (code >= 0x1e00 && code <= 0x1eff)
  );
}

export function isLtrCode(code) {
  if (isLatinCode(code)) return true;
  return (
    (code >= 0x0370 && code <= 0x03ff) || // Greek
    (code >= 0x0400 && code <= 0x04ff) || // Cyrillic
    (code >= 0x0530 && code <= 0x058f) || // Armenian
    (code >= 0x10a0 && code <= 0x10ff) || // Georgian
    (code >= 0x2c60 && code <= 0x2c7f) || // Latin Extended-C
    (code >= 0xa720 && code <= 0xa7ff) || // Latin Extended-D
    (code >= 0x3040 && code <= 0x30ff) || // Hiragana / Katakana
    (code >= 0x4e00 && code <= 0x9fff)    // CJK Unified Ideographs
  );
}

export function isAsciiDigitCode(code) {
  return code >= 0x30 && code <= 0x39;
}

export function isEasternDigitCode(code) {
  return (code >= 0x06f0 && code <= 0x06f9) || (code >= 0x0660 && code <= 0x0669);
}

export function isWhitespaceCode(code) {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0x00a0 || code === 0x200c || code === 0x200d || code === 0x200e || code === 0x200f;
}

/** Any digit the engine treats as a numeric run member (ASCII/Eastern/Arabic-Indic). */
export function isAnyDigitCode(code) {
  return isAsciiDigitCode(code) || isEasternDigitCode(code);
}

/** True for Persian-specific letters and Extended Arabic-Indic digits. */
export function isPersianCode(code) {
  return PERSIAN_MARKERS.has(code);
}

/**
 * Bidi strength of a code point: "rtl", "ltr", or null for neutrals/digits.
 * Digits are weak types in UAX #9 (AN/EN) — treating them as strong RTL made
 * digit-only text ("۱۲۳") resolve to RTL and split thousand separators
 * ("۲،۵۰۰") apart.
 */
export function strengthOfCode(code) {
  if (isAnyDigitCode(code)) return null;
  if (isRtlCode(code)) return "rtl";
  if (isLtrCode(code)) return "ltr";
  return null;
}

export function charClass(ch) {
  const code = ch.codePointAt(0);
  if (isAsciiDigitCode(code) || isEasternDigitCode(code)) return "digit";
  if (isRtlCode(code)) return "rtl";
  if (isLtrCode(code)) return "ltr";
  if (isWhitespaceCode(code)) return "ws";
  return "other";
}

export function hasPersianMarkers(text) {
  for (const ch of text) {
    if (PERSIAN_MARKERS.has(ch.codePointAt(0))) return true;
  }
  return false;
}

export const ZWNJ = "\u200c";
export const TATWEEL = "\u0640";
export const ARABIC_LETTER_CLASS = "\u0621-\u063f\u0641-\u064a\u0654-\u065e\u066e-\u066f\u0671-\u06d3\u06d5\u06ee-\u06ef\u06fa-\u06ff\u06cc\u06a9\u06af\u067e\u0686\u0698\u0622\u0623\u0625\u0624\u0626\u0629\u0640";
