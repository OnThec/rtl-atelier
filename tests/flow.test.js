import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFlow, isolateRuns, LRI, RLI, PDI } from "../src/core/flow.js";
import { transformText } from "../src/core/typography.js";

const ALL_DEFAULTS = {
  normalizeChars: false,
  whitespace: false,
  zwnj: false,
  punctuation: false,
  digits: "keep",
};

test("analyzeFlow labels pure single-script text with full confidence", () => {
  assert.equal(analyzeFlow("سلام دنیا").tier, "pure-rtl");
  assert.equal(analyzeFlow("سلام دنیا").confidence, 1);
  assert.equal(analyzeFlow("hello world").tier, "pure-ltr");
});

test("analyzeFlow separates dominant from balanced mixed text", () => {
  assert.equal(analyzeFlow("سلام خوبی hello").tier, "dominant-rtl");
  const balanced = analyzeFlow("ab cd ef سلام");
  assert.equal(balanced.tier, "balanced");
  assert.ok(balanced.confidence < 0.2);
});

test("isolateRuns wraps an embedded Latin phrase in an RTL host", () => {
  const { text, changed } = isolateRuns("سلام hello world خداحافظ", {
    direction: "rtl",
  });
  assert.equal(changed, true);
  assert.equal(text, "سلام " + LRI + "hello world" + PDI + " خداحافظ");
});

test("isolateRuns wraps an embedded RTL phrase in an LTR host", () => {
  const { text } = isolateRuns("the word سلام matters", { direction: "ltr" });
  assert.equal(text, "the word " + RLI + "سلام" + PDI + " matters");
});

test("isolateRuns leaves single embedded letters below the threshold", () => {
  const { text, changed } = isolateRuns("سلام a خداحافظ", {
    direction: "rtl",
    minLetters: 2,
  });
  assert.equal(changed, false);
  assert.equal(text, "سلام a خداحافظ");
});

test("isolateRuns treats a two-word Latin phrase as one island", () => {
  const { text } = isolateRuns("سلام hello world خداحافظ", { direction: "rtl" });
  assert.ok(text.includes(LRI + "hello world" + PDI));
});

test("isolateRuns keeps boundary punctuation on the host side", () => {
  const { text } = isolateRuns("سلام ok، خداحافظ", { direction: "rtl" });
  // The Arabic comma is a neutral that trails the Latin island; the isolate
  // must end at the last strong letter, not swallow the mark.
  assert.equal(text, "سلام " + LRI + "ok" + PDI + "\u060c خداحافظ");
});

test("isolateRuns is idempotent across repeated rescans", () => {
  const once = isolateRuns("سلام hello world خداحافظ", { direction: "rtl" });
  const twice = isolateRuns(once.text, { direction: "rtl" });
  assert.equal(twice.text, once.text);
  assert.equal(twice.changed, false);
});

test("isolateRuns neutralises a host flip before recomputing", () => {
  // A previously isolated string re-analyzed under the opposite host must not
  // stack isolates; it strips and re-places them.
  const rtlPass = isolateRuns("the word سلام matters", { direction: "ltr" });
  const repass = isolateRuns(rtlPass.text, { direction: "ltr" });
  assert.equal(repass.text, rtlPass.text);
});

test("transformText applies isolation only when smartRuns is on and direction known", () => {
  const off = transformText(
    "سلام hello world",
    { ...ALL_DEFAULTS },
    { direction: "rtl", persian: true }
  );
  assert.equal(off.text, "سلام hello world");

  const noDir = transformText(
    "سلام hello world",
    { ...ALL_DEFAULTS, smartRuns: true },
    { persian: true }
  );
  assert.equal(noDir.text, "سلام hello world");

  const on = transformText(
    "سلام hello world",
    { ...ALL_DEFAULTS, smartRuns: true },
    { direction: "rtl", persian: true }
  );
  assert.equal(on.text, "سلام " + LRI + "hello world" + PDI);
  assert.equal(on.counts.isolate, 1);
});
