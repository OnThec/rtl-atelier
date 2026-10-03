import {
  TATWEEL,
  ARABIC_LETTER_CLASS,
  strengthOfCode,
  isAnyDigitCode,
} from "./charsets.js";
import { isolateRuns } from "./flow.js";

export const ZWNJ = "\u200c";

const ARABIC_BLOCK = "\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff\u0590-\u05ff";

const CHAR_MAP = new Map([
  ["\u064a", "\u06cc"],
  ["\u0643", "\u06a9"],
  ["\u0649", "\u06cc"],
]);

export function normalizeCharacters(text, options = {}) {
  const persian = options.persian !== false;
  let out = "";
  let count = 0;
  for (const ch of text) {
    if (ch === TATWEEL) {
      count++;
      continue;
    }
    const mapped = persian ? CHAR_MAP.get(ch) : undefined;
    if (mapped) {
      out += mapped;
      count++;
    } else {
      out += ch;
    }
  }
  return { text: out, changed: count > 0, count };
}

export function collapseWhitespace(text) {
  let count = 0;
  const out = text.replace(/[ \t\u00a0]{2,}/g, () => {
    count++;
    return " ";
  });
  return { text: out, changed: count > 0, count };
}

const ZWNJ_RULES = [
  {
    re: new RegExp(
      `(^|[^${ARABIC_BLOCK}])(\u0646\u0645[\u06cc\u064a]|\u0645[\u06cc\u064a]|\u0628[\u06cc\u064a])[ \\t]+([${ARABIC_LETTER_CLASS}][${ARABIC_LETTER_CLASS}\u064b-\u065f])`,
      "g"
    ),
    to: `$1$2${ZWNJ}$3`,
  },
  {
    re: new RegExp(
      `([${ARABIC_LETTER_CLASS}])[ \\t]+(\u0647\u0627\u06cc\u0634\u0627\u0646|\u0647\u0627\u06cc\u062a\u0627\u0646|\u0647\u0627\u06cc\u0645\u0627\u0646|\u0647\u0627\u06cc\u0634|\u0647\u0627\u06cc\u062a|\u0647\u0627\u06cc\u0645|\u0647\u0627\u06cc\u06cc|\u0647\u0627\u06cc|\u0647\u0627|\u062a\u0631\u06cc\u0646|\u062a\u0631\u06cc|\u062a\u0631)(?=$|[^${ARABIC_BLOCK}])`,
      "g"
    ),
    to: `$1${ZWNJ}$2`,
  },
];

export function applyZwnj(text) {
  let out = text;
  let count = 0;
  // Clean up redundant spaces adjacent to ZWNJs and duplicate ZWNJs between words
  out = out
    .replace(/(\S)(?:[ \t\u00a0]+\u200c+|\u200c+[ \t\u00a0]+)[ \t\u00a0]*(\S)/g, (_, a, b) => {
      count++;
      return `${a}${ZWNJ}${b}`;
    })
    .replace(/\u200c{2,}/g, () => {
      count++;
      return ZWNJ;
    });

  for (const rule of ZWNJ_RULES) {
    out = out.replace(rule.re, (...args) => {
      count++;
      return rule.to.replace(/\$(\d)/g, (_, d) => args[Number(d)]);
    });
  }
  const changed = out !== text;
  return { text: out, changed, count: changed ? count : 0 };
}

const CLOSE_PUNCT = "\u060c\u061b\u061f:!?\u2026.,;)\u005c]\u005c}\u00bb\u203a\u201d";
// The class must be captured: without the group, "$1" resolved to the
// numeric match offset and every "( " was replaced by a stray digit.
const OPEN_PUNCT_RE = /([\u00ab(\[{‹\u201c])\s+/g;

const SPACING_RULES = [
  {
    re: new RegExp(`\\s+([${CLOSE_PUNCT}]+)`, "g"),
    to: "$1",
  },
  {
    re: OPEN_PUNCT_RE,
    to: "$1",
  },
];

/*
 * Marks whose glued-to-letter usage is unambiguously Persian/Arabic:
 * inserting the missing trailing space is always safe.
 */
const UNAMBIGUOUS_MARKS = new Set(["\u060c", "\u061b", "\u061f"]);

/*
 * Marks shared with Latin typography. Blindly spacing them corrupts English
 * embedded in mixed paragraphs — "example.com", "e.g." and "U.S.A" all match
 * a naive `[.,](?=letter)` pattern. A shared mark only gets its space when
 * it is anchored to right-to-left text on at least one side, i.e. when the
 * glue is actually a Persian-typography defect:
 *
 *   "پایان.شروع"   → "پایان. شروع"   (RTL on the left)
 *   "تست.This"     → "تست. This"     (RTL on the left)
 *   "This!تست"     → "This! تست"     (RTL on the right)
 *   "example.com"  → untouched       (Latin on both sides)
 *   "e.g."         → untouched
 *   "Note:this"    → untouched
 */
const SHARED_MARKS = new Set([":", "!", "?", ".", ",", ";", "\u2026"]);

function strongLetterAt(chars, index) {
  const ch = chars[index];
  if (!ch) return null;
  return strengthOfCode(ch.codePointAt(0));
}

function insertMarkSpaces(text) {
  if (/[\u060c\u061b\u061f:!?,.;\u2026]/.test(text) === false) {
    return { text, changed: false, count: 0 };
  }
  const chars = Array.from(text);
  let out = "";
  let count = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    out += ch;
    const isMark = UNAMBIGUOUS_MARKS.has(ch) || SHARED_MARKS.has(ch);
    if (!isMark) continue;
    const nextStrong = strongLetterAt(chars, i + 1);
    if (!nextStrong) continue; // nothing glued to the mark's right
    let applySpacing = UNAMBIGUOUS_MARKS.has(ch);
    if (!applySpacing) {
      // Digits are neutral for anchoring. Look back past preceding marks
      // so multi-mark clusters (e.g. "تست...Hello", "سلام!!خوبی") resolve
      // the true preceding strong character instead of hitting null.
      const prevStrong = strongAt(chars, i - 1, -1);
      applySpacing = prevStrong === "rtl" || nextStrong === "rtl";
    }
    if (applySpacing) {
      out += " ";
      count++;
    }
  }
  return { text: out, changed: count > 0, count };
}

export function fixPunctuation(text) {
  let out = text;
  let count = 0;
  for (const rule of SPACING_RULES) {
    out = out.replace(rule.re, (...args) => {
      count++;
      return rule.to.replace(/\$(\d)/g, (_, d) => args[Number(d)]);
    });
  }
  const spaced = insertMarkSpaces(out);
  count += spaced.count;
  return { text: spaced.text, changed: count > 0, count };
}

const FA_DIGITS = ["\u06f0", "\u06f1", "\u06f2", "\u06f3", "\u06f4", "\u06f5", "\u06f6", "\u06f7", "\u06f8", "\u06f9"];
const AR_DIGITS = ["\u0660", "\u0661", "\u0662", "\u0663", "\u0664", "\u0665", "\u0666", "\u0667", "\u0668", "\u0669"];

function isDigitChar(ch) {
  return isAnyDigitCode(ch.codePointAt(0));
}

const STRONG_SCAN_CAP = 48;

function strongAt(chars, start, dir) {
  let steps = 0;
  for (let i = start; i >= 0 && i < chars.length && steps < STRONG_SCAN_CAP; i += dir, steps++) {
    if (isDigitChar(chars[i])) continue;
    const s = strengthOfCode(chars[i].codePointAt(0));
    if (s) return s;
    const c = chars[i].codePointAt(0);
    if (c === 0x0a || c === 0x2028 || c === 0x2029) return null;
  }
  return null;
}

function toPersianDigits(run) {
  let out = "";
  for (const ch of run) {
    const c = ch.codePointAt(0);
    if (c >= 0x30 && c <= 0x39) out += FA_DIGITS[c - 0x30];
    else if (c >= 0x0660 && c <= 0x0669) out += FA_DIGITS[c - 0x0660];
    else out += ch;
  }
  return out;
}

function toLatinDigits(run) {
  let out = "";
  for (const ch of run) {
    const c = ch.codePointAt(0);
    if (c >= 0x06f0 && c <= 0x06f9) out += String(c - 0x06f0);
    else if (c >= 0x0660 && c <= 0x0669) out += String(c - 0x0660);
    else out += ch;
  }
  return out;
}

export function convertDigits(text, target) {
  if (target !== "persian" && target !== "latin") {
    return { text, changed: false, count: 0 };
  }
  const chars = Array.from(text);
  let out = "";
  let count = 0;
  let i = 0;
  while (i < chars.length) {
    if (!isDigitChar(chars[i])) {
      out += chars[i];
      i++;
      continue;
    }
    let j = i;
    while (j < chars.length && isDigitChar(chars[j])) j++;
    const run = chars.slice(i, j).join("");
    let mapped = run;
    if (target === "persian") {
      const prev = strongAt(chars, i - 1, -1);
      const next = strongAt(chars, j, 1);
      if (prev !== "ltr" && next !== "ltr") mapped = toPersianDigits(run);
    } else {
      mapped = toLatinDigits(run);
    }
    if (mapped !== run) count++;
    out += mapped;
    i = j;
  }
  return { text: out, changed: count > 0, count };
}

export function transformText(input, settings = {}, context = {}) {
  if (input == null) return { text: "", changed: false, counts: {} };
  const text = String(input);
  let current = text;
  const counts = {};
  const persian = context.persian !== false;

  const run = (id, enabled, fn) => {
    if (!enabled) return;
    const result = fn(current);
    if (result.changed) {
      current = result.text;
      counts[id] = result.count;
    }
  };

  run("chars", settings.normalizeChars !== false, (t) => normalizeCharacters(t, { persian }));
  run("whitespace", settings.whitespace !== false, collapseWhitespace);
  run("zwnj", settings.zwnj !== false && persian, applyZwnj);
  run("punctuation", settings.punctuation !== false, fixPunctuation);
  run("digits", settings.digits === "persian" || settings.digits === "latin", (t) => convertDigits(t, settings.digits));
  // Final stage: the visible text is now orthographically clean, so isolate
  // placement is computed on stable letter classification. Requires the
  // host block direction from the engine; a node processed without it is
  // left untouched rather than guessed at.
  if (settings.smartRuns === true && (context.direction === "rtl" || context.direction === "ltr")) {
    run("isolate", true, (t) => isolateRuns(t, { direction: context.direction }));
  }

  return { text: current, changed: current !== text, counts };
}
