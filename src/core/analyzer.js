import {
  isRtlCode,
  isLatinCode,
  isLtrCode,
  isAsciiDigitCode,
  isEasternDigitCode,
  isPersianCode,
  strengthOfCode,
  hasPersianMarkers,
} from "./charsets.js";

const PERSIAN_VERB_PREFIX = new RegExp(
  "(?:^|[^\\u0590-\\u05ff\\u0600-\\u08ff\\ufb50-\\ufdff\\ufe70-\\ufeff])" +
    "(?:\u0646\u0645\u064a|\u0645\u064a|\u0646\u0645\u06cc|\u0645\u06cc)(?=[\\s\\u200c\\u200d]|$)"
);

// High-frequency Persian function words / grammatical markers that do not exist
// in Arabic (e.g. "است", "برای", "شد", "بود", "کرد", "دارد"). Recognizes Persian
// even when typed on Arabic keyboards or extracted from legacy systems without
// unique Persian letters (پ چ ژ گ).
const PERSIAN_GRAMMAR_WORDS = new RegExp(
  "(?:^|[^\\u0600-\\u08ff\\ufb50-\\ufdff\\ufe70-\\ufeff])" +
    "(?:\u0627\u0633\u062a|\u0628\u0631\u0627\u06cc|\u0634\u062f\u0646|\u0634\u062f\u0647|\u0634\u062f|\u0628\u0648\u062f\u0646|\u0628\u0648\u062f|\u06a9\u0631\u062f\u0646|\u0643\u0631\u062f\u0646|\u06a9\u0631\u062f|\u0643\u0631\u062f|\u062f\u0627\u0631\u062f|\u06af\u0641\u062a)" +
    "(?=[^\\u0600-\\u08ff\\ufb50-\\ufdff\\ufe70-\\ufeff]|$)"
);

export function looksPersian(text) {
  if (hasPersianMarkers(text)) return true;
  if (PERSIAN_VERB_PREFIX.test(text)) return true;
  return PERSIAN_GRAMMAR_WORDS.test(text);
}

export function analyzeText(text) {
  let rtl = 0;
  let ltr = 0;
  let digits = 0;
  let firstStrong = null;
  let hasPersian = false;

  for (const ch of text) {
    const code = ch.codePointAt(0);
    // Digits are weak (AN/EN) in UAX #9: counted as digits, never as RTL
    // letters, so they cannot inflate rtlRatio or settle first-strong.
    if (isAsciiDigitCode(code) || isEasternDigitCode(code)) {
      digits++;
      if (isPersianCode(code)) hasPersian = true;
    } else if (isRtlCode(code)) {
      rtl++;
      if (!firstStrong) firstStrong = "rtl";
      if (isPersianCode(code)) hasPersian = true;
    } else if (isLtrCode(code)) {
      ltr++;
      if (!firstStrong) firstStrong = "ltr";
    }
  }

  const letters = rtl + ltr;
  return {
    rtl,
    ltr,
    digits,
    letters,
    rtlRatio: letters === 0 ? 0 : rtl / letters,
    firstStrong,
    hasPersian,
  };
}

export function resolveDirection(text, fallback = "ltr") {
  for (const ch of text) {
    const strength = strengthOfCode(ch.codePointAt(0));
    if (strength) return strength;
  }
  return fallback;
}

const MOSTLY_RTL_DEFAULTS = { minRtlChars: 3, threshold: 0.45, markedThreshold: 1 / 3 };

/**
 * First-strong resolution with a mostly-RTL fallback.
 * Pure UAX #9 first-strong misclassifies mixed lines that open with a Latin
 * brand word or number ("ChatGPT چیست؟", where the brand contributes most of
 * the Latin letters). When the text starts LTR but RTL letters clearly
 * dominate — or Persian-specific characters confirm the language — it is
 * treated as RTL instead.
 */
export function resolveDirectionSmart(text, fallback = "ltr", options = {}) {
  const first = resolveDirection(text, fallback);
  if (first === "rtl") return "rtl";
  const analysis = analyzeText(text);
  const minRtlChars = options.minRtlChars ?? MOSTLY_RTL_DEFAULTS.minRtlChars;
  const threshold = options.threshold ?? MOSTLY_RTL_DEFAULTS.threshold;
  const markedThreshold = options.markedThreshold ?? MOSTLY_RTL_DEFAULTS.markedThreshold;
  if (analysis.rtl < minRtlChars || analysis.rtlRatio < markedThreshold) return first;
  if (analysis.rtlRatio >= threshold) return "rtl";
  // Persian-specific letters/digits (پ چ ژ گ ی ک …) are decisive evidence.
  return analysis.hasPersian ? "rtl" : first;
}

export function hasSignificantRtl(text, minRtlChars = 1) {
  let count = 0;
  for (const ch of text) {
    if (strengthOfCode(ch.codePointAt(0)) === "rtl") {
      count++;
      if (count >= minRtlChars) return true;
    }
  }
  return false;
}

export function isMostlyRtl(text, threshold = 0.5) {
  const { rtl, ltr } = analyzeText(text);
  return rtl + ltr > 0 && rtl / (rtl + ltr) >= threshold;
}
