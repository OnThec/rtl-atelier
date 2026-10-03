import { analyzeText, resolveDirectionSmart } from "./analyzer.js";
import { strengthOfCode, isAnyDigitCode } from "./charsets.js";

// Unicode directional isolates (UAX #9). LRI/RLI open an isolated run whose
// internal order is computed independently of the host paragraph; PDI closes
// it. They are zero-width and render no glyph.
export const LRI = "\u2066";
export const RLI = "\u2067";
export const FSI = "\u2068";
export const PDI = "\u2069";

const ISOLATE_RE = /[\u2066\u2067\u2068\u2069]/g;

/**
 * Describe the directional makeup of a text run without deciding its layout.
 * Returns a coarse tier and a 0..1 confidence so callers can distinguish a
 * decisive flip (pure/dominant) from a balanced mix where forcing a block
 * direction would be an all-or-nothing guess.
 */
export function analyzeFlow(text) {
  const { rtl, ltr } = analyzeText(text);
  const letters = rtl + ltr;
  if (letters === 0) {
    return { direction: "neutral", tier: "neutral", confidence: 0, rtl: 0, ltr: 0 };
  }
  const ratio = rtl / letters;
  const confidence = Math.abs(ratio - 0.5) * 2; // 0 balanced → 1 single-script
  let direction = ratio >= 0.5 ? "rtl" : "ltr";
  direction = resolveDirectionSmart(text, direction === "rtl" ? "rtl" : "ltr");
  let tier;
  if (rtl === 0) tier = "pure-ltr";
  else if (ltr === 0) tier = "pure-rtl";
  else if (confidence < 0.2) tier = "balanced";
  else tier = direction === "rtl" ? "dominant-rtl" : "dominant-ltr";
  return { direction, tier, confidence, rtl, ltr };
}

/**
 * Wrap embedded opposite-direction phrases in directional isolates so their
 * word order survives line wrapping and boundary punctuation stops drifting
 * to the wrong edge — the contextual behavior of native BiDi editors, as
 * opposed to flipping the whole block.
 *
 * This is the "smart text arrangement" tier that complements per-block
 * direction: the block keeps the host writing direction and layout, while
 * each foreign run reads as a coherent unit.
 *
 * Alphanumeric tokens (e.g. GPT-4, Python 3.12, v1.6.0, C++) stay unified inside
 * the isolate so version numbers and technical terms never scramble in RTL text,
 * while boundary punctuation stays anchored to the host direction.
 *
 * Idempotent: any isolate characters already present are stripped and the
 * placement recomputed, so repeated rescan passes never stack them.
 */
export function isolateRuns(text, options = {}) {
  if (text == null) return { text: "", changed: false, count: 0 };
  const direction = options.direction === "rtl" ? "rtl" : "ltr";
  const minLetters = Number.isFinite(options.minLetters) ? options.minLetters : 2;
  const cleaned = String(text).replace(ISOLATE_RE, "");
  const chars = Array.from(cleaned);
  if (chars.length === 0) {
    return { text: String(text), changed: false, count: 0 };
  }

  const strength = chars.map((ch) => strengthOfCode(ch.codePointAt(0)));
  const host = direction;
  const opp = host === "rtl" ? "ltr" : "rtl";
  const opener = opp === "ltr" ? LRI : RLI;

  const out = [];
  let count = 0;
  let i = 0;
  while (i < chars.length) {
    if (strength[i] !== opp) {
      out.push(chars[i]);
      i++;
      continue;
    }
    // Grow the island across embedded neutrals (spaces, digits, symbols) until
    // a host strong char appears. Trailing digits and symbols attached to the
    // foreign term (e.g. "GPT-4", "Python 3.12", "C++") stay within the isolate,
    // while trailing host boundary punctuation (",", "،", ")") stays anchored outside.
    let lastOpp = i;
    let letters = 0;
    let digits = 0;
    let k = i;
    while (k < chars.length) {
      const code = chars[k].codePointAt(0);
      if (chars[k] === "\n" || chars[k] === "\r") break;
      if (strength[k] === opp) {
        lastOpp = k;
        letters++;
        k++;
      } else if (strength[k] === host) {
        break;
      } else if (isAnyDigitCode(code) && letters > 0) {
        lastOpp = k;
        digits++;
        k++;
      } else if ((chars[k] === "+" || chars[k] === "#") && k > i) {
        lastOpp = k;
        k++;
      } else {
        k++;
      }
    }
    const end = lastOpp + 1;
    const segment = chars.slice(i, end).join("");
    const qualifies =
      letters >= minLetters ||
      (letters >= 1 && (digits > 0 || segment.includes("+") || segment.includes("#")));

    if (qualifies) {
      out.push(opener, segment, PDI);
      count++;
    } else {
      out.push(segment);
    }
    i = end;
  }

  const result = out.join("");
  return { text: result, changed: result !== text, count };
}
