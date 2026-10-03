import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeText, resolveDirection, resolveDirectionSmart, hasSignificantRtl, isMostlyRtl, looksPersian } from "../src/core/analyzer.js";

test("analyzeText counts letter classes and first strong char", () => {
  const result = analyzeText("123 سلام hello");
  assert.equal(result.rtl, 4);
  assert.equal(result.ltr, 5);
  assert.equal(result.digits, 3);
  assert.equal(result.firstStrong, "rtl");
});

test("resolveDirection follows first strong character", () => {
  assert.equal(resolveDirection("123 سلام hi"), "rtl");
  assert.equal(resolveDirection("Hello سلام"), "ltr");
  assert.equal(resolveDirection("   "), "ltr");
  assert.equal(resolveDirection("", "rtl"), "rtl");
});

test("resolveDirectionSmart rescues Latin-first mostly-RTL text", () => {
  assert.equal(resolveDirectionSmart("ChatGPT چیست؟"), "rtl");
  assert.equal(resolveDirectionSmart("۲۰۲۶ چه سالی است؟"), "rtl");
  assert.equal(resolveDirectionSmart("Hello سلام"), "ltr");
  assert.equal(resolveDirectionSmart("Hello world"), "ltr");
  assert.equal(resolveDirectionSmart("سلام دنیا"), "rtl");
});

test("resolveDirectionSmart thresholds are conservative", () => {
  assert.equal(resolveDirectionSmart("a ب"), "ltr");
  assert.equal(resolveDirectionSmart("ab بب"), "ltr");
  assert.equal(resolveDirectionSmart("ab بببببب"), "rtl");
});

test("hasSignificantRtl respects minimum", () => {
  assert.equal(hasSignificantRtl("abc"), false);
  assert.equal(hasSignificantRtl("aبc"), true);
  assert.equal(hasSignificantRtl("ب", 2), false);
});

test("isMostlyRtl uses letter ratio", () => {
  assert.equal(isMostlyRtl("سلام خوبی hi"), true);
  assert.equal(isMostlyRtl("سلامسلام hi"), true);
  assert.equal(isMostlyRtl("hello سلام"), false);
  assert.equal(isMostlyRtl("123 456"), false);
});

test("analyzeText flags Persian-specific shapes", () => {
  assert.equal(analyzeText("کتاب").hasPersian, true);
  assert.equal(analyzeText("كتاب").hasPersian, false);
});

test("looksPersian detects markers and the Persian verb prefix", () => {
  assert.equal(looksPersian("کتاب"), true);
  assert.equal(looksPersian("پدر"), true);
  assert.equal(looksPersian("مي روم"), true);
  assert.equal(looksPersian("نمي دانم"), true);
  assert.equal(looksPersian("سلام مي"), true);
  assert.equal(looksPersian("كتاب الطالب"), false);
  assert.equal(looksPersian("الرامية"), false);
  assert.equal(looksPersian("hello"), false);
});

test("math symbols × and ÷ are neutral, not Latin letters", () => {
  const result = analyzeText("a × b ÷ c");
  assert.equal(result.ltr, 3);
  assert.equal(result.letters, 3);
});

test("digits never act as strong RTL evidence", () => {
  // Regression: Extended Arabic-Indic digits sit inside the Arabic Unicode
  // block and were counted as RTL letters, so a number-only run ("۱۲۳")
  // resolved to RTL and skewed every ratio.
  const result = analyzeText("۱۲۳ 456");
  assert.equal(result.rtl, 0);
  assert.equal(result.digits, 6);
  assert.equal(result.firstStrong, null);
  assert.equal(result.hasPersian, true);
  assert.equal(resolveDirection("۱۲۳"), "ltr");
  assert.equal(hasSignificantRtl("۱۲۳"), false);
});

test("Arabic comma no longer flips Arabic text to Persian", () => {
  assert.equal(looksPersian("هذا كتاب، هذا"), false);
  assert.equal(analyzeText("هذا كتاب، هذا").hasPersian, false);
  // Persian text keeps its own evidence regardless.
  assert.equal(analyzeText("کتاب، این").hasPersian, true);
});
