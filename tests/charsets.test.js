import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRtlCode,
  isLatinCode,
  isAsciiDigitCode,
  isEasternDigitCode,
  strengthOfCode,
  charClass,
  hasPersianMarkers,
} from "../src/core/charsets.js";

test("charsets classify Persian letters as RTL", () => {
  for (const ch of "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی") {
    assert.equal(isRtlCode(ch.codePointAt(0)), true, ch);
  }
});

test("charsets classify Hebrew as RTL and Latin as LTR", () => {
  assert.equal(isRtlCode("ש".codePointAt(0)), true);
  assert.equal(isLatinCode("a".codePointAt(0)), true);
  assert.equal(isLatinCode("É".codePointAt(0)), true);
  assert.equal(isRtlCode("a".codePointAt(0)), false);
});

test("digit detection covers ASCII and eastern digits", () => {
  assert.equal(isAsciiDigitCode("5".codePointAt(0)), true);
  assert.equal(isEasternDigitCode("۵".codePointAt(0)), true);
  assert.equal(isEasternDigitCode("٥".codePointAt(0)), true);
  assert.equal(isEasternDigitCode("5".codePointAt(0)), false);
});

test("charClass buckets", () => {
  assert.equal(charClass("پ"), "rtl");
  assert.equal(charClass("z"), "ltr");
  assert.equal(charClass("۵"), "digit");
  assert.equal(charClass(" "), "ws");
  assert.equal(charClass("!"), "other");
});

test("hasPersianMarkers", () => {
  assert.equal(hasPersianMarkers("پدر"), true);
  assert.equal(hasPersianMarkers("کتاب"), true);
  assert.equal(hasPersianMarkers("سلام"), false);
  assert.equal(hasPersianMarkers("hello"), false);
});

test("Arabic-script punctuation is NOT a Persian marker", () => {
  // Regression: "،" "؛" "؟" belong to all Arabic-script languages; counting
  // them as Persian evidence Persianized every Arabic sentence.
  assert.equal(hasPersianMarkers("هذا كتاب، هذا"), false);
  assert.equal(hasPersianMarkers("مرحبا؛ كيف؟"), false);
  // Persian digits remain decisive evidence for Persian.
  assert.equal(hasPersianMarkers("۱۲۳"), true);
});

test("strengthOfCode treats every digit flavor as bidi-neutral", () => {
  assert.equal(strengthOfCode("5".codePointAt(0)), null);
  assert.equal(strengthOfCode("۵".codePointAt(0)), null);
  assert.equal(strengthOfCode("٥".codePointAt(0)), null);
  assert.equal(strengthOfCode("a".codePointAt(0)), "ltr");
  assert.equal(strengthOfCode("ب".codePointAt(0)), "rtl");
});
