import { test } from "node:test";
import assert from "node:assert/strict";
import { isRtlCode, isLtrCode, strengthOfCode, hasPersianMarkers, ZWNJ, TATWEEL } from "../src/core/charsets.js";
import { analyzeText, looksPersian, resolveDirectionSmart } from "../src/core/analyzer.js";
import { transformText, applyZwnj, fixPunctuation, convertDigits } from "../src/core/typography.js";
import { isolateRuns, LRI, RLI, PDI } from "../src/core/flow.js";
import { normalizeSettings, normalizeHost, siteEnabled } from "../src/core/settings.js";
import { buildFontRecord, sanitizeFileName } from "../src/core/custom-fonts.js";
import { PatchStore } from "../src/core/patch-store.js";
import { RtlEngine } from "../src/core/engine.js";
import { setDirAttributes } from "../src/ui/i18n.js";
import { el, text } from "./fixtures/fake-dom.js";

// ============================================================================
// 1. EXTREME TEXT LENGTHS & STRESS / REDOS SIMULATION
// ============================================================================

test("edge-case: extreme text length (120,000+ characters) processes cleanly under budget", () => {
  const baseChunk = "سلام به همه! این یک متن طولانی است با کلمات انگلیسی مثل ChatGPT 4 و Python 3.12 برای آزمایش. ";
  const bigText = baseChunk.repeat(1500); // ~138,000 characters
  assert.ok(bigText.length > 100000);

  const start = performance.now();
  const res = transformText(bigText, {
    normalizeChars: true,
    whitespace: true,
    zwnj: true,
    punctuation: true,
    digits: "persian",
    smartRuns: true,
  }, { direction: "rtl", persian: true });
  const duration = performance.now() - start;

  assert.equal(res.changed, true);
  assert.ok(duration < 250, `processing took ${duration}ms, expected < 250ms (no ReDoS)`);
  assert.ok(res.text.includes(LRI + "ChatGPT 4" + PDI));
  assert.ok(res.text.includes(LRI + "Python 3.12" + PDI));
});

test("edge-case: repetitive whitespace and punctuation runs (stressing regex engines)", () => {
  const pathologicalSpaces = "سلام" + "   \t  \u00a0 ".repeat(500) + "دنیا";
  const res = transformText(pathologicalSpaces, { whitespace: true });
  assert.equal(res.text, "سلام دنیا");

  const pathologicalPunct = "سلام" + "!!؟؟؟...".repeat(200) + "Hello";
  const punctRes = transformText(pathologicalPunct, { punctuation: true }, { direction: "rtl" });
  assert.ok(punctRes.text.endsWith(" Hello"));
});

// ============================================================================
// 2. UNUSUAL CHARACTER COMBINATIONS, BIDI CONTROLS & ENCODING
// ============================================================================

test("edge-case: Unicode bidi control characters & ZWNJ/ZWJ permutations", () => {
  // Repeated ZWNJs
  const doubleZwnj = "می" + ZWNJ + ZWNJ + "روم";
  assert.equal(applyZwnj(doubleZwnj).text, "می" + ZWNJ + "روم");

  // Accidental spaces around ZWNJ (common Persian keyboard typo)
  const spacedZwnj1 = "کتاب " + ZWNJ + "ها";
  assert.equal(applyZwnj(spacedZwnj1).text, "کتاب" + ZWNJ + "ها");

  const spacedZwnj2 = "کتاب" + ZWNJ + " هایم";
  assert.equal(applyZwnj(spacedZwnj2).text, "کتاب" + ZWNJ + "هایم");

  // Tatweel strip combined with punctuation
  const tatweelPunct = "ســــلامـــــ ، خـــوبی ؟";
  const res = transformText(tatweelPunct, { normalizeChars: true, punctuation: true }, { persian: true });
  assert.equal(res.text, "سلام، خوبی؟");

  // Directional overrides and isolates in input (LRI, RLI, PDI, LRM, RLM)
  const bidiOverlaid = "سلام \u200e\u2066Hello\u2069 \u200fدنیا";
  const isolated = isolateRuns(bidiOverlaid, { direction: "rtl" });
  assert.equal(isolated.text, "سلام \u200e" + LRI + "Hello" + PDI + " \u200fدنیا");
});

test("edge-case: Persian function words accurately recognize Persian on Arabic keyboards", () => {
  // Text using Arabic yeh (ي) and Arabic kaf (ك) without unique Persian letters (گ چ پ ژ)
  const arabicKeyedPersian = "اين يك متن ساده است كه براي تست نوشته شده است.";
  assert.equal(hasPersianMarkers(arabicKeyedPersian), false, "no explicit Persian markers");
  assert.equal(looksPersian(arabicKeyedPersian), true, "grammatical markers identify Persian");

  const res = transformText(arabicKeyedPersian, { normalizeChars: true }, { persian: looksPersian(arabicKeyedPersian) });
  assert.equal(res.changed, true);
  assert.equal(res.text, "این یک متن ساده است که برای تست نوشته شده است.");

  // Genuine Arabic text MUST NOT be classified as Persian
  const authenticArabic = "هذا كتاب جميل ومفيد جداً، السلام عليكم ورحمة الله.";
  assert.equal(looksPersian(authenticArabic), false, "Arabic is not Persian");
  const arabicRes = transformText(authenticArabic, { normalizeChars: true }, { persian: looksPersian(authenticArabic) });
  assert.equal(arabicRes.text, authenticArabic, "Arabic letters preserved intact");
});

test("edge-case: emojis, astral code points, and replacement characters", () => {
  const emojiText = "پروژهٔ هوش مصنوعی 👩‍💻✨ با مدل GPT-4 نسخه v2.0 آماده شد! 🚀";
  const transformed = transformText(emojiText, {
    normalizeChars: true,
    smartRuns: true,
  }, { direction: "rtl", persian: true });

  assert.ok(transformed.text.includes(LRI + "GPT-4" + PDI));
  assert.ok(transformed.text.includes(LRI + "v2.0" + PDI));
  assert.ok(transformed.text.includes("👩‍💻✨"));
  assert.ok(transformed.text.includes("🚀"));

  // Replacement character \ufffd
  const corruptText = "سلام دنیا و Englishword تست";
  const corruptRes = transformText(corruptText, {}, { direction: "rtl", persian: true });
  assert.ok(corruptRes.text.includes("سلام"));
});

test("edge-case: non-Latin LTR scripts (Cyrillic, Greek, Armenian, Georgian, CJK)", () => {
  assert.equal(isLtrCode("П".codePointAt(0)), true, "Cyrillic is LTR");
  assert.equal(isLtrCode("Ω".codePointAt(0)), true, "Greek is LTR");
  assert.equal(isLtrCode("語".codePointAt(0)), true, "CJK is LTR");
  assert.equal(strengthOfCode("П".codePointAt(0)), "ltr");

  const mixedRussian = "سلام Привет мир چطوری";
  const analysis = analyzeText(mixedRussian);
  assert.ok(analysis.rtl > 0);
  assert.ok(analysis.ltr > 0);
  assert.equal(analysis.firstStrong, "rtl");
});

test("edge-case: technical terms, C++, version numbers, and IP addresses in RTL text", () => {
  const techText = "برنامه با C++ و Python 3.12 روی IP 192.168.1.1 اجرا شد.";
  const res = isolateRuns(techText, { direction: "rtl" });

  assert.ok(res.text.includes(LRI + "C++" + PDI), "C++ isolated intact");
  assert.ok(res.text.includes(LRI + "Python 3.12" + PDI), "Python 3.12 isolated intact");
  assert.ok(res.text.includes(LRI + "IP 192.168.1.1" + PDI), "IP address isolated intact");
});

test("edge-case: glued semicolon and multi-punctuation spacing", () => {
  const gluedSemicolon = "پایان کار;شروع مجدد";
  const res = fixPunctuation(gluedSemicolon);
  assert.equal(res.text, "پایان کار; شروع مجدد");

  const multiPunct = "موضوع اول...Hello World";
  const resMulti = fixPunctuation(multiPunct);
  assert.equal(resMulti.text, "موضوع اول... Hello World");
});

// ============================================================================
// 3. UNEXPECTED USER INPUTS, MALFORMED SETTINGS & PROTOTYPE SAFETY
// ============================================================================

test("edge-case: null, undefined, and non-string inputs to transformText and flow", () => {
  assert.equal(transformText(null).changed, false);
  assert.equal(transformText(undefined).changed, false);
  assert.equal(transformText(12345).changed, false);
  assert.equal(transformText("").changed, false);

  assert.equal(isolateRuns("").changed, false);
  assert.equal(isolateRuns(null).changed, false);
  assert.equal(resolveDirectionSmart(""), "ltr");
  assert.equal(resolveDirectionSmart("   \n\t  "), "ltr");
});

test("edge-case: prototype pollution and hostile objects in normalizeSettings", () => {
  const hostile = JSON.parse('{"__proto__": {"polluted": true}, "master": "not-bool", "pageFontSize": "NaN", "pageFont": "<script>alert(1)</script>"}');
  const clean = normalizeSettings(hostile);

  assert.equal(Object.prototype.polluted, undefined, "no prototype pollution");
  assert.equal(clean.master, true, "sanitizes non-boolean master to default");
  assert.equal(clean.pageFontSize, 100, "sanitizes NaN font size to 100");
  assert.equal(clean.pageFont, "default", "rejects script injection in font name");
});

test("edge-case: hostile font file names and path traversals in buildFontRecord", () => {
  assert.equal(sanitizeFileName("../../evil.ttf"), "evil.ttf", "strips path traversal down to safe base name");
  assert.equal(sanitizeFileName("..\\..\\windows\\system32\\cmd.exe"), "", "rejects invalid extension");
  assert.equal(sanitizeFileName("font<script>.woff2"), "", "rejects invalid characters");
  assert.equal(sanitizeFileName("valid-font (Regular).ttf"), "valid-font (Regular).ttf");

  const nullRecord = buildFontRecord({ name: "evil.exe", data: "AAAA", size: 100 });
  assert.equal(nullRecord, null, "rejects non-font extension");

  const oversized = buildFontRecord({ name: "huge.ttf", data: "AAAA", size: 50 * 1024 * 1024 });
  assert.equal(oversized, null, "rejects file exceeding MAX_FILE_BYTES");
});

test("edge-case: normalizeHost handles edge-case URLs, IPv4, ports, and malformed inputs", () => {
  assert.equal(normalizeHost("https://www.chatgpt.com:8080/path"), "");
  assert.equal(normalizeHost("chatgpt.com:443"), "chatgpt.com");
  assert.equal(normalizeHost("WWW.DeepSeek.COM"), "deepseek.com");
  assert.equal(normalizeHost("127.0.0.1:3000"), "127.0.0.1");
  assert.equal(normalizeHost("   "), "");
  assert.equal(normalizeHost(null), "");
  assert.equal(normalizeHost("a".repeat(300)), "", "rejects oversized hostname");
});

// ============================================================================
// 4. ENGINE RESILIENCE: DETACHED NODES, CLEARED INPUTS & DOM RECOVERY
// ============================================================================

test("edge-case: engine handles cleared inputs without leaving stuck RTL styling", () => {
  const input = el("input");
  input.value = "سلام تست";
  const body = el("body", input);

  const engine = new RtlEngine({
    root: body,
    settings: normalizeSettings({ autoDirInputs: true }),
    idle: (cb) => cb(),
  });
  engine.enableInputs();

  // Type Persian
  input.value = "سلام تست";
  engine.applyInputDirection(input);
  assert.equal(input.style.getPropertyValue("direction"), "rtl");
  assert.equal(input.style.getPropertyValue("text-align"), "right");

  // User clears input (e.g. Backspace all)
  input.value = "";
  engine.applyInputDirection(input);
  assert.equal(input.style.getPropertyValue("direction"), "", "direction reset when input cleared");
  assert.equal(input.style.getPropertyValue("text-align"), "", "textAlign reset when input cleared");
});

test("edge-case: PatchStore bound limits under 15,000 element churn", () => {
  const store = new PatchStore();
  for (let i = 0; i < 15000; i++) {
    const dummy = el("p");
    store.addClass(dummy, `class-${i}`);
    store.setAttribute(dummy, "data-test", String(i));
  }
  assert.ok(store.size <= 12288, `PatchStore capped at 12288, was ${store.size}`);
  store.revertAll();
  assert.equal(store.size, 0);
});

test("edge-case: uiDirection independently controls UI orientation", () => {
  const originalDoc = globalThis.document;
  try {
    const html = el("html");
    globalThis.document = { documentElement: html };

    // Auto with English -> LTR
    setDirAttributes("en", "auto");
    assert.equal(html.getAttribute("dir"), "ltr");
    assert.equal(html.classList.contains("rtla-rtl"), false);

    // Auto with Persian -> RTL
    setDirAttributes("fa", "auto");
    assert.equal(html.getAttribute("dir"), "rtl");
    assert.equal(html.classList.contains("rtla-rtl"), true);

    // Forced RTL with English language -> RTL
    setDirAttributes("en", "rtl");
    assert.equal(html.getAttribute("dir"), "rtl");
    assert.equal(html.classList.contains("rtla-rtl"), true);

    // Forced LTR with Persian language -> LTR
    setDirAttributes("fa", "ltr");
    assert.equal(html.getAttribute("dir"), "ltr");
    assert.equal(html.classList.contains("rtla-rtl"), false);
  } finally {
    globalThis.document = originalDoc;
  }
});

test("edge-case: buildFontRecord accepts variable fonts with opsz,wght and complex names", () => {
  const rec1 = buildFontRecord({
    name: "Vazirmatn[opsz,wght].woff2",
    data: "AA==",
    size: 1024,
  });
  assert.ok(rec1);
  assert.equal(rec1.family, "Vazirmatn");
  assert.equal(rec1.name, "Vazirmatn[opsz,wght].woff2");

  const rec2 = buildFontRecord({
    name: "IRANSansX(FaNum)+Display-Bold[wght].ttf",
    data: "AA==",
    size: 2048,
  });
  assert.ok(rec2);
  assert.equal(rec2.weight, 700);

  const rec3 = buildFontRecord({
    name: "فونت-فارسی-وزیر.woff2",
    data: "AA==",
    size: 512,
  });
  assert.ok(rec3);
  assert.equal(rec3.family, "فونت-فارسی-وزیر");
});
