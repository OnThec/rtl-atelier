import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fontClassMode,
  fontFaceRule,
  formatFor,
  pageFontCss,
  quoteFamily,
  safeWeight,
} from "../src/core/page-style.js";

test("pageFontCss returns empty string when inactive or nothing configured", () => {
  const settings = { pageFont: "default", pageFontWeight: "auto", pageFontSize: 100 };
  assert.equal(pageFontCss(settings, false), "");
  assert.equal(pageFontCss(settings, true), "");
});

test("pageFontCss emits family independently of weight and size", () => {
  const css = pageFontCss(
    { pageFont: "Vazir", pageFontWeight: "auto", pageFontSize: 100 },
    true
  );
  assert.ok(css.includes("font-family"));
  assert.ok(!css.includes("font-weight"));
  assert.ok(!css.includes("font-size"));

  const sized = pageFontCss(
    { pageFont: "default", pageFontWeight: "auto", pageFontSize: 120 },
    true
  );
  assert.ok(sized.includes("font-size: 120%"), "size must apply without a family");
  assert.ok(!sized.includes("font-family"));

  const weighted = pageFontCss(
    { pageFont: "default", pageFontWeight: "700", pageFontSize: 100 },
    true
  );
  assert.ok(weighted.includes("font-weight: 700"), "weight must apply without a family");
});

test("pageFontCss rejects malformed weight values", () => {
  const css = pageFontCss(
    { pageFont: "default", pageFontWeight: "<script>", pageFontSize: 100 },
    true
  );
  assert.equal(css, "");
});

test("fontFaceRule validates records and escapes families", () => {
  const good = fontFaceRule({
    name: "My Font-Bold.ttf",
    family: "My Font",
    weight: 700,
    data: "AAAA",
  });
  assert.ok(good);
  assert.ok(good.includes('format("truetype")'));
  assert.ok(good.includes('"My Font"'));

  assert.equal(fontFaceRule(null), null);
  assert.equal(fontFaceRule({ name: "x.exe", family: "X", data: "AA" }), null);
  assert.equal(fontFaceRule({ name: "a.ttf", family: "", data: "AA" }), null);
  assert.equal(fontFaceRule({ name: "a.ttf", family: "A", data: "" }), null);
});

test("safeWeight clamps and defaults", () => {
  assert.equal(safeWeight(5000), 900);
  assert.equal(safeWeight(-3), 100);
  assert.equal(safeWeight("junk"), 400);
  assert.equal(safeWeight(650.6), 651);
});

test("formatFor covers supported extensions only", () => {
  assert.equal(formatFor("A.woff2"), "woff2");
  assert.equal(formatFor("A.WOFF"), "woff");
  assert.equal(formatFor("a.otf"), "opentype");
  assert.equal(formatFor("b.ttf"), "truetype");
  assert.equal(formatFor("c.svg"), "");
});

test("quoteFamily escapes quotes and backslashes", () => {
  assert.equal(quoteFamily('Bad"Name'), '"Bad\\"Name"');
  assert.equal(quoteFamily("Plain"), '"Plain"');
});

test("fontClassMode mirrors engine class gating", () => {
  assert.equal(fontClassMode({ pageFont: "Vazir", pageFontWeight: "auto", pageFontSize: 100 }), true);
  assert.equal(fontClassMode({ pageFont: "default", pageFontWeight: "auto", pageFontSize: 100 }), false);
  assert.equal(fontClassMode({ pageFont: "default", pageFontWeight: "600", pageFontSize: 100 }), true);
  assert.equal(fontClassMode({ pageFont: "default", pageFontWeight: "auto", pageFontSize: 130 }), true);
});

test("readable scope targets common text containers instead of RTL units only", () => {
  const rtl = { pageFont: "Vazir", pageFontWeight: "auto", pageFontSize: 100, fontScope: "rtl" };
  const readable = { ...rtl, fontScope: "readable" };

  assert.match(pageFontCss(rtl, true), /^\.rtlm-font \{/);
  const css = pageFontCss(readable, true);
  assert.match(css, /^p, li, blockquote/);
  assert.ok(css.includes("h1, h2, h3"));

  // Unknown scope values fall back to the precise RTL selector.
  const weird = { ...rtl, fontScope: "bogus" };
  assert.match(pageFontCss(weird, true), /^\.rtlm-font \{/);

  // Scope change alone is enough to flip the class-mode signature so the
  // content script rebuilds instead of taking the style-swap fast path.
  assert.equal(fontClassMode({ pageFont: "default", pageFontWeight: "auto", pageFontSize: 100 }), false);
});
