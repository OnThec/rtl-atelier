import test from "node:test";
import assert from "node:assert/strict";
import { RtlEngine } from "../src/core/engine.js";
import { normalizeSettings } from "../src/core/settings.js";
import { el, text } from "./fixtures/fake-dom.js";

const ZW = "\u200c";

function makeEngine(root, patch = {}, extra = {}) {
  const settings = normalizeSettings({ autoDirInputs: false, ...patch });
  return new RtlEngine({
    root,
    settings,
    computeAlign: extra.computeAlign || (() => "left"),
    computeDisplay: extra.computeDisplay || null,
    observerCtor: extra.observerCtor || null,
    idle: (cb) => cb(),
    report: extra.report || (() => {}),
  });
}

test("Auto mode: intelligently organizes text only, preserves layout structure", () => {
  const flexContainer = el("div", text("گزینه‌های ناوبری"));
  const pFa = el("p", text("مي روم به خانه 123"));
  const pEn = el("p", text("Hello world 123"));
  const body = el("body", flexContainer, pFa, pEn);

  const engine = makeEngine(
    body,
    { directionMode: "auto", layoutSafe: true, digits: "persian" },
    {
      computeDisplay: (node) => (node === flexContainer ? "flex" : "block"),
    }
  );
  engine.start();

  // In auto mode: flex container layout is protected by layoutSafe
  assert.equal(flexContainer.hasAttribute("dir"), false, "flex container layout not altered");

  // Persian text is intelligently formatted
  assert.equal(pFa.getAttribute("dir"), "rtl", "Persian paragraph gets RTL direction");
  assert.ok(pFa.childNodes[0].data.includes("می" + ZW + "روم"), "ZWNJ applied to Persian text");
  assert.ok(pFa.childNodes[0].data.includes("۱۲۳"), "Digits converted in Persian context");

  // English text is untouched
  assert.equal(pEn.hasAttribute("dir"), false, "English paragraph remains untouched");
  assert.equal(pEn.childNodes[0].data, "Hello world 123", "English text untouched");
  engine.stop();
});

test("RTL mode: optimizes entire web page structure for Persian natively", () => {
  const flexContainer = el("div", text("گزینه‌های ناوبری"));
  const pFa = el("p", text("سلام، مي روم به دنيا"));
  const pEn = el("p", text("English documentation"));
  const body = el("body", flexContainer, pFa, pEn);

  const engine = makeEngine(
    body,
    { directionMode: "rtl", layoutSafe: true },
    {
      computeDisplay: (node) => (node === flexContainer ? "flex" : "block"),
    }
  );
  engine.start();

  // In forced RTL mode: flex container receives RTL regardless of layoutSafe
  assert.equal(flexContainer.getAttribute("dir"), "rtl", "structural containers are aligned RTL");
  assert.equal(pFa.getAttribute("dir"), "rtl");
  assert.equal(pEn.getAttribute("dir"), "rtl", "all units oriented RTL");
  assert.ok(pFa.childNodes[0].data.includes("دنیا"), "Arabic yeh normalized to Persian");
  engine.stop();
});

test("LTR mode: optimizes for English and only font is applied, no Persian transformations", () => {
  const pFa = el("p", text("مي روم به خانه"));
  const pEn = el("p", text("The quick brown fox"));
  const body = el("body", pFa, pEn);

  const engine = makeEngine(body, {
    directionMode: "ltr",
    pageFont: "Vazir",
    digits: "persian",
    normalizeChars: true,
  });
  engine.start();

  // In forced LTR mode:
  assert.equal(pFa.hasAttribute("dir"), false, "no RTL direction applied");
  assert.equal(pEn.hasAttribute("dir"), false, "no RTL direction applied");

  // Font class is applied so custom font works cleanly
  assert.equal(pFa.classList.contains("rtlm-font"), true, "font class applied");
  assert.equal(pEn.classList.contains("rtlm-font"), true, "font class applied");

  // Typography transformations (ZWNJ, Persian digits, normalization) do NOT mutate English mode
  assert.equal(pEn.childNodes[0].data, "The quick brown fox", "English text is not altered");
  engine.stop();
});

test("Switching from RTL back to Auto returns the UI layout structure to the original state", () => {
  const flexContainer = el("div", text("منوی اصلی"));
  const pFa = el("p", text("سلام، می روم به خانه"));
  const pEn = el("p", text("English documentation"));
  const body = el("body", flexContainer, pFa, pEn);

  // 1. Force RTL
  const rtlEngine = makeEngine(
    body,
    { directionMode: "rtl", layoutSafe: true },
    { computeDisplay: (node) => (node === flexContainer ? "flex" : "block") }
  );
  rtlEngine.start();

  assert.equal(flexContainer.getAttribute("dir"), "rtl", "flex container altered in forced RTL");
  assert.equal(pFa.getAttribute("dir"), "rtl");
  assert.equal(pEn.getAttribute("dir"), "rtl", "English unit forced to RTL");

  // 2. Switch back to Auto (simulate engine stop and restart in auto mode)
  rtlEngine.stop();

  assert.equal(flexContainer.hasAttribute("dir"), false, "flex container reverted after stop");
  assert.equal(pEn.hasAttribute("dir"), false, "English unit reverted after stop");

  const autoEngine = makeEngine(
    body,
    { directionMode: "auto", layoutSafe: true },
    { computeDisplay: (node) => (node === flexContainer ? "flex" : "block") }
  );
  autoEngine.start();

  // In auto mode: flex layout structure is preserved, only Persian text is oriented
  assert.equal(flexContainer.hasAttribute("dir"), false, "flex container untouched in auto mode");
  assert.equal(pEn.hasAttribute("dir"), false, "English paragraph untouched in auto mode");
  assert.equal(pFa.getAttribute("dir"), "rtl", "Persian paragraph intelligently oriented");
  autoEngine.stop();
});
