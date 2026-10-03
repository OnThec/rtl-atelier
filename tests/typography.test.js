import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCharacters,
  collapseWhitespace,
  applyZwnj,
  fixPunctuation,
  convertDigits,
  transformText,
} from "../src/core/typography.js";

const ZW = "\u200c";

test("normalizeCharacters unifies ي/ك to Persian ی/ک", () => {
  const result = normalizeCharacters("كتاب و علي");
  assert.equal(result.text, "کتاب و علی");
  assert.equal(result.count, 2);
});

test("normalizeCharacters strips tatweel", () => {
  const result = normalizeCharacters("ک\u0640\u0640تاب");
  assert.equal(result.text, "کتاب");
  assert.equal(result.count, 2);
});

test("normalizeCharacters preserves Arabic orthography when persian is off", () => {
  const result = normalizeCharacters("كتاب و على", { persian: false });
  assert.equal(result.changed, false);
  assert.equal(result.text, "كتاب و على");
});

test("normalizeCharacters still strips tatweel in non-Persian context", () => {
  const result = normalizeCharacters("ك\u0640تاب", { persian: false });
  assert.equal(result.text, "كتاب");
});

test("transformText gates letter unification on Persian context", () => {
  assert.equal(transformText("كتاب", {}, { persian: false }).changed, false);
  assert.equal(transformText("كتاب", {}).text, "کتاب");
});

test("applyZwnj joins می/نمی prefixes with half-space", () => {
  assert.equal(applyZwnj("می روم").text, "می" + ZW + "روم");
  assert.equal(applyZwnj("نمی دانم").text, "نمی" + ZW + "دانم");
  assert.equal(applyZwnj("او بی ادب است").text, "او بی" + ZW + "ادب است");
});

test("applyZwnj joins ها/های/ترین suffixes", () => {
  assert.equal(applyZwnj("کتاب ها").text, "کتاب" + ZW + "ها");
  assert.equal(applyZwnj("خانه های شهر").text, "خانه" + ZW + "های شهر");
  assert.equal(applyZwnj("قشنگ ترین است").text, "قشنگ" + ZW + "ترین است");
});

test("applyZwnj is idempotent and conservative", () => {
  const joined = "می" + ZW + "روم";
  assert.equal(applyZwnj(joined).changed, false);
  assert.equal(applyZwnj("در خانه").changed, false);
  assert.equal(applyZwnj("بهتر").changed, false);
  assert.equal(applyZwnj("می").changed, false);
});

test("fixPunctuation removes space before closing marks", () => {
  const result = fixPunctuation("سلام ، دنیا .");
  assert.equal(result.text, "سلام، دنیا.");
  assert.equal(result.count, 2);
});

test("fixPunctuation inserts space after marks glued to words", () => {
  assert.equal(fixPunctuation("چرا؟چون").text, "چرا؟ چون");
  assert.equal(fixPunctuation("گفته:This").text, "گفته: This");
  // Shared marks with Latin on both sides stay untouched (URL/domain safety):
  // "example.com", "e.g.", "a,b" must never be split.
  assert.equal(fixPunctuation("a,b").changed, false);
  assert.equal(fixPunctuation("example.com").changed, false);
});

test("fixPunctuation removes space inside brackets without injecting digits", () => {
  // Regression: the open-punct rule had no capture group, so "$1" expanded
  // to the numeric match offset and turned "a ( b" into "a 2b".
  assert.equal(fixPunctuation("a ( b ) c").text, "a (b) c");
  assert.equal(fixPunctuation("« نقل »").text, "«نقل»");
  assert.equal(fixPunctuation("[ لیست ]").text, "[لیست]");
});

test("fixPunctuation keeps Persian thousands separators intact", () => {
  // "۲،۵۰۰" is the number 2500 — the glued '،' between digits must not be
  // spaced apart (digits are bidi-neutral, not RTL letters).
  assert.equal(fixPunctuation("قیمت ۲،۵۰۰ تومان").changed, false);
  assert.equal(fixPunctuation("۱،۲۳۴،۵۶۷").changed, false);
  // A letter on either side still gets the missing space.
  assert.equal(fixPunctuation("۲،پس").text, "۲، پس");
});

test("fixPunctuation leaves decimals alone", () => {
  assert.equal(fixPunctuation("3.14").changed, false);
});

test("collapseWhitespace squashes runs of spaces", () => {
  assert.equal(collapseWhitespace("a    b\t\tc").text, "a b c");
  assert.equal(collapseWhitespace("single").changed, false);
});

test("convertDigits to Persian only in RTL neighborhoods", () => {
  assert.equal(convertDigits("سال 2024 بود", "persian").text, "سال ۲۰۲۴ بود");
  assert.equal(convertDigits("CSS3", "persian").text, "CSS3");
  assert.equal(convertDigits("نسخه 2 است", "persian").text, "نسخه ۲ است");
  assert.equal(convertDigits("٥ نجوم", "persian").text, "۵ نجوم");
});

test("convertDigits to Latin converts Persian and Arabic-Indic digits", () => {
  assert.equal(convertDigits("سال ۲۰۲۴ بود", "latin").text, "سال 2024 بود");
  assert.equal(convertDigits("٥ نجوم", "latin").text, "5 نجوم");
});

test("convertDigits with keep target is a no-op", () => {
  assert.equal(convertDigits("۲۰۲۴", "keep").changed, false);
});

test("convertDigits keeps Latin digits separated by short neutral runs", () => {
  assert.equal(convertDigits("v 2", "persian").text, "v 2");
});

test("convertDigits context scan is bounded and still converts far RTL context", () => {
  const input = "سلام" + " ".repeat(60) + "2024";
  const result = convertDigits(input, "persian");
  assert.equal(result.text, "سلام" + " ".repeat(60) + "۲۰۲۴");
});

test("transformText pipeline composes all rules", () => {
  const result = transformText("مي روم .");
  assert.equal(result.text, "می" + ZW + "روم.");
  assert.equal(result.changed, true);
  assert.equal(result.counts.chars, 1);
  assert.equal(result.counts.zwnj, 1);
  assert.equal(result.counts.punctuation, 1);
});

test("transformText respects per-rule toggles", () => {
  const result = transformText("مي روم", { zwnj: false });
  assert.equal(result.text, "می روم");
  assert.equal(result.counts.zwnj, undefined);
});

test("transformText is idempotent", () => {
  const once = transformText("مي روم .");
  const twice = transformText(once.text);
  assert.equal(twice.changed, false);
});
