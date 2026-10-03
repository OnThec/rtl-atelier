import { test } from "node:test";
import assert from "node:assert/strict";
import { RtlEngine } from "../src/core/engine.js";
import { LRI, PDI } from "../src/core/flow.js";
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

test("RTL paragraph receives dir attribute and alignment class", () => {
  const p = el("p", text("سلام دنیا hello"));
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(p.getAttribute("dir"), "rtl");
  assert.equal(p.classList.contains("rtlm-align"), true);
  assert.equal(engine.snapshot().rtlBlocks, 1);
});

test("centered RTL paragraph keeps center alignment", () => {
  const p = el("p", text("سلام دنیا"));
  const engine = makeEngine(el("body", p), { alignRtl: true }, { computeAlign: () => "center" });
  engine.start();
  assert.equal(p.classList.contains("rtlm-center"), true);
  assert.equal(p.classList.contains("rtlm-align"), false);
});

test("pure LTR paragraph is left untouched", () => {
  const p = el("p", text("Hello world"));
  const node = p.childNodes[0];
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(p.hasAttribute("dir"), false);
  assert.equal(p.classList.set.size, 0);
  assert.equal(node.data, "Hello world");
});

test("Latin-first mostly-Persian paragraph becomes RTL", () => {
  const p = el("p", text("ChatGPT بهترین ابزار است"));
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(p.getAttribute("dir"), "rtl");
});

test("mostlyRtl=false restores pure first-strong behavior", () => {
  const p = el("p", text("ChatGPT بهترین ابزار است"));
  const engine = makeEngine(el("body", p), { mostlyRtl: false });
  engine.start();
  assert.equal(p.hasAttribute("dir"), false);
});

test("typography fixes apply inside RTL text nodes", () => {
  const node = text("مي روم .");
  const p = el("p", node);
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(node.data, "می" + ZW + "روم.");
});

test("code blocks are kept LTR and unmodified", () => {
  const preText = text("const x = 1;");
  const codeText = text("let y");
  const pre = el("pre", preText);
  const code = el("code", codeText);
  const p = el("p", text("کد نمونه: "), pre, code);
  const engine = makeEngine(el("body", p));
  engine.start();

  assert.equal(p.getAttribute("dir"), "rtl");
  assert.equal(pre.classList.contains("rtlm-block-ltr"), true);
  assert.equal(code.classList.contains("rtlm-ltr"), true);
  assert.equal(preText.data, "const x = 1;");
  assert.equal(codeText.data, "let y");
});

test("author-set dir attribute is respected", () => {
  const node = text("سلام");
  const p = el("p", node);
  p.setAttribute("dir", "ltr");
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(p.getAttribute("dir"), "ltr");
  assert.equal(p.classList.set.size, 0);
  assert.equal(node.data, "سلام");
});

test("nested blocks become separate units without double processing", () => {
  const innerText = text("سلام دنیا");
  const p = el("p", innerText);
  const div = el("div", text("مقدمه"), p);
  const engine = makeEngine(el("body", div));
  engine.start();

  assert.equal(div.getAttribute("dir"), "rtl");
  assert.equal(p.getAttribute("dir"), "rtl");
  assert.equal(engine.snapshot().rtlBlocks, 2);
});

test("stop() reverts every DOM touch", () => {
  const node = text("مي روم .");
  const p = el("p", node);
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(p.getAttribute("dir"), "rtl");
  assert.notEqual(node.data, "مي روم .");

  engine.stop();
  assert.equal(p.hasAttribute("dir"), false);
  assert.equal(p.classList.set.size, 0);
  assert.equal(node.data, "مي روم .");
  assert.equal(engine.snapshot().rtlBlocks, 0);
});

test("contentEditable is skipped unless allowed", () => {
  const node = text("مي روم .");
  const p = el("p", node);
  p.isContentEditable = true;
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(node.data, "مي روم .");
  assert.equal(p.hasAttribute("dir"), false);

  const permissive = makeEngine(el("body", p), { processEditable: true });
  permissive.start();
  assert.equal(p.getAttribute("dir"), "rtl");
});

class FakeObserver {
  constructor(callback) {
    FakeObserver.instance = this;
    this.callback = callback;
    this.disconnected = false;
  }

  observe() {}

  disconnect() {
    this.disconnected = true;
  }
}

test("layoutSafe skips direction on flex/grid containers but still edits text", () => {
  const flex = el("div", text("سلام دنیا"));

  // Structural container + layoutSafe (default) → no dir, no alignment class.
  const safe = makeEngine(el("body", flex), {}, { computeDisplay: () => "flex" });
  safe.start();
  assert.equal(flex.hasAttribute("dir"), false);
  assert.equal(flex.classList.contains("rtlm-align"), false);

  // layoutSafe disabled → legacy behavior applies direction even to flex.
  const flex2 = el("div", text("سلام دنیا"));
  const unsafe = makeEngine(el("body", flex2), { layoutSafe: false }, {
    computeDisplay: () => "flex",
  });
  unsafe.start();
  assert.equal(flex2.getAttribute("dir"), "rtl");

  // Plain block containers are unaffected by the guard.
  const block = el("p", text("سلام دنیا"));
  const normal = makeEngine(el("body", block), {}, { computeDisplay: () => "block" });
  normal.start();
  assert.equal(block.getAttribute("dir"), "rtl");
});

test("layoutSafe keeps typography and font styling on structural containers", () => {
  const p = el("p", text("مي روم ."));
  const engine = makeEngine(el("body", p), { pageFont: "Vazir" }, {
    computeDisplay: () => "grid",
  });
  engine.start();
  assert.equal(p.hasAttribute("dir"), false, "no structural dir flip");
  assert.equal(p.classList.contains("rtlm-font"), true, "font styling still applies");
  assert.notEqual(p.childNodes[0].data, "مي روم .", "typography still repairs the text");
});

test("diagnostics exposes identity, counters and scan performance", () => {
  const p = el("p", text("سلام دنیا hello"));
  const engine = makeEngine(el("body", p));
  engine.start();

  const d = engine.diagnostics();
  assert.equal(d.adapterId, "generic");
  assert.equal(d.rootTag, "BODY");
  assert.equal(d.paragraphs, 1);
  assert.equal(d.rtlBlocks, 1);
  assert.ok(d.scans >= 1, "at least one scan recorded");
  assert.ok(typeof d.lastScanMs === "number");
  assert.equal(d.errors, 0);
  assert.equal(d.running, true);
});

test("mutations trigger reprocessing of added nodes", () => {
  const body = el("body", el("p", text("سلام")));
  const engine = makeEngine(body, {}, { observerCtor: FakeObserver });
  engine.start();

  const fresh = el("p", text("پیام جدید"));
  body.append(fresh);
  FakeObserver.instance.callback([{ type: "childList", target: body, addedNodes: [fresh], removedNodes: [] }]);
  assert.equal(fresh.getAttribute("dir"), "rtl");
});

test("mutation-driven rescans report updated statistics", () => {
  const p = el("p", text("سلام"));
  const reports = [];
  const engine = makeEngine(el("body", p), {}, {
    observerCtor: FakeObserver,
    report: (snapshot) => reports.push(snapshot),
  });
  engine.start();
  assert.ok(reports.length >= 1, "initial scan reports a snapshot");

  // Streaming edit inside an already-processed unit → unit rescan path.
  // The replacement contains a ZWNJ join, glued punctuation and double
  // spaces, so the typography pipeline must register real text edits.
  p.childNodes[0].data = `مي روم .  `;
  FakeObserver.instance.callback([{ type: "characterData", target: p.childNodes[0] }]);

  assert.ok(reports.length > 1, "rescan must push a fresh snapshot");
  assert.ok(
    reports.at(-1).textEdits > (reports[0].textEdits || 0),
    "snapshot after rescan reflects the new edits"
  );
});

test("inline content added inside a processed unit is processed too", () => {
  const p = el("p", text("سلام"));
  const engine = makeEngine(el("body", p), {}, { observerCtor: FakeObserver });
  engine.start();

  const span = el("span", text("مي روم"));
  p.append(span);
  FakeObserver.instance.callback([{ type: "childList", target: p, addedNodes: [span], removedNodes: [] }]);

  assert.equal(p.getAttribute("dir"), "rtl");
  assert.equal(span.childNodes[0].data, "می" + ZW + "روم");
});

test("unit losing RTL content is reset", () => {
  const node = text("مي روم");
  const p = el("p", node);
  const engine = makeEngine(el("body", p), {}, { observerCtor: FakeObserver });
  engine.start();
  assert.equal(p.getAttribute("dir"), "rtl");
  assert.equal(p.classList.contains("rtlm-align"), true);

  node.data = "Hello world";
  FakeObserver.instance.callback([{ type: "characterData", target: node, addedNodes: [], removedNodes: [] }]);

  assert.equal(p.hasAttribute("dir"), false);
  assert.equal(p.classList.contains("rtlm-align"), false);
  assert.equal(engine.snapshot().paragraphs, 1);
});

test("removed RTL text resets the unit", () => {
  const node = text("سلام تنها");
  const p = el("p", node);
  const engine = makeEngine(el("body", p), {}, { observerCtor: FakeObserver });
  engine.start();
  assert.equal(p.getAttribute("dir"), "rtl");

  node.parentNode = null;
  p.childNodes.length = 0;
  FakeObserver.instance.callback([{ type: "childList", target: p, addedNodes: [], removedNodes: [node] }]);

  assert.equal(p.hasAttribute("dir"), false);
});

test("pure Arabic text keeps its original letters", () => {
  const node = text("كتاب الطالب");
  const p = el("p", node);
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(p.getAttribute("dir"), "rtl");
  assert.equal(node.data, "كتاب الطالب");
});

test("characterData mutations re-evaluate direction", () => {
  const node = text("Hello there");
  const p = el("p", node);
  const engine = makeEngine(el("body", p), {}, { observerCtor: FakeObserver });
  engine.start();
  assert.equal(p.hasAttribute("dir"), false);

  node.data = "می روم";
  FakeObserver.instance.callback([{ type: "characterData", target: node, addedNodes: [], removedNodes: [] }]);
  assert.equal(p.getAttribute("dir"), "rtl");
});

test("stop disconnects the observer", () => {
  const engine = makeEngine(el("body", el("p", text("سلام"))), {}, { observerCtor: FakeObserver });
  engine.start();
  engine.stop();
  assert.equal(FakeObserver.instance.disconnected, true);
});

test("script subtrees and buttons are skipped", () => {
  const scriptText = text("var salam = 1;");
  const button = el("button", text("سلام"));
  const engine = makeEngine(el("body", el("script", scriptText), button));
  engine.start();
  assert.equal(scriptText.data, "var salam = 1;");
  assert.equal(button.hasAttribute("dir"), false);
});

test("custom elements act as unit boundaries without a page-wide mega unit", () => {
  const msgA = el("chat-message", el("span", text("سلام دنیا")));
  const msgB = el("chat-message", el("span", text("پیام دوم")));
  const app = el("my-app", msgA, msgB);
  const body = el("body", app);
  const engine = makeEngine(body);
  engine.start();

  assert.equal(body.hasAttribute("dir"), false, "root must never receive a direction patch");
  assert.equal(app.hasAttribute("dir"), false, "outer wrapper must not become one giant unit");
  assert.equal(msgA.getAttribute("dir"), "rtl");
  assert.equal(msgB.getAttribute("dir"), "rtl");
});

test("a fault in one unit does not abort processing of the rest", () => {
  const good = el("p", text("سلام دنیا"));
  const broken = el("p", text("سلام دیگری"));
  broken.isContentEditable = undefined;
  Object.defineProperty(broken, "hasAttribute", {
    value() {
      throw new Error("boom");
    },
  });
  const body = el("body", broken, good);
  const engine = makeEngine(body);
  engine.start();
  assert.equal(good.getAttribute("dir"), "rtl");
  assert.ok(engine.errors.length >= 1, "error should be captured, not thrown");
});

test("auto input direction follows the typed language", () => {
  const area = el("textarea");
  const engine = makeEngine(el("body"), {});
  area.value = "سلام دنیا";
  engine.applyInputDirection(area);
  assert.equal(area.style.getPropertyValue("direction"), "rtl");
  assert.equal(area.style.getPropertyValue("text-align"), "right");

  area.value = "hello there";
  engine.applyInputDirection(area);
  assert.equal(area.style.getPropertyValue("direction"), "ltr");
  assert.equal(area.style.getPropertyValue("text-align"), "left");
});

test("pageFont setting applies rtlm-font class to RTL units and inputs", () => {
  const p = el("p", text("سلام دنیا"));
  const area = el("textarea");
  const engine = makeEngine(el("body", p), { pageFont: "Vazir" });
  engine.start();

  assert.equal(p.classList.contains("rtlm-font"), true);

  area.value = "سلام دنیا";
  engine.applyInputDirection(area);
  assert.equal(area.classList.contains("rtlm-font"), true);

  area.value = "hello world";
  engine.applyInputDirection(area);
  assert.equal(area.classList.contains("rtlm-font"), false);
});

test("font weight or size alone activates font styling without a family", () => {
  const bySize = el("p", text("سلام دنیا"));
  makeEngine(el("body", bySize), { pageFontSize: 120 }).start();
  assert.equal(bySize.classList.contains("rtlm-font"), true);

  const byWeight = el("p", text("سلام دنیا"));
  makeEngine(el("body", byWeight), { pageFontWeight: "700" }).start();
  assert.equal(byWeight.classList.contains("rtlm-font"), true);

  const plain = el("p", text("سلام دنیا"));
  makeEngine(el("body", plain), { pageFont: "default" }).start();
  assert.equal(plain.classList.contains("rtlm-font"), false);
});

test("inputs are counted once per element", () => {
  const area = el("textarea");
  const engine = makeEngine(el("body"), {});
  area.value = "سلام دنیا";
  engine.applyInputDirection(area);
  engine.applyInputDirection(area);
  assert.equal(engine.snapshot().inputs, 1);
});

test("report callback receives stats snapshots", () => {
  const reports = [];
  const engine = makeEngine(el("body", el("p", text("سلام"))), {}, { report: (s) => reports.push(s) });
  engine.start();
  assert.ok(reports.length >= 1);
  assert.equal(reports.at(-1).paragraphs, 1);
});

test("layoutSafe engages through the default computed-style fallback", () => {
  // Production never injects computeDisplay; the built-in getComputedStyle
  // fallback must keep the flex/grid guard alive (it was previously dead).
  const flex = el("div", text("سلام دنیا"));
  globalThis.getComputedStyle = () => ({ textAlign: "left", display: "flex" });
  try {
    const engine = makeEngine(el("body", flex));
    engine.start();
    assert.equal(flex.hasAttribute("dir"), false, "flex container keeps its layout");
    assert.equal(flex.classList.contains("rtlm-align"), false);
  } finally {
    delete globalThis.getComputedStyle;
  }
});

test("paragraphs counts every text unit while rtlBlocks counts only RTL ones", () => {
  const ltr = el("p", text("Hello world"));
  const rtl = el("p", text("سلام دنیا"));
  const engine = makeEngine(el("body", ltr, rtl));
  engine.start();
  const stats = engine.snapshot();
  assert.equal(stats.paragraphs, 2, "both text units are paragraphs");
  assert.equal(stats.rtlBlocks, 1, "only the RTL unit is an RTL block");
});

test("smartRuns isolates the embedded Latin phrase inside an RTL unit", () => {
  const node = text("سلام hello world خداحافظ");
  const p = el("p", node);
  const engine = makeEngine(el("body", p), { smartRuns: true });
  engine.start();
  assert.equal(p.getAttribute("dir"), "rtl");
  assert.equal(node.data, "سلام " + LRI + "hello world" + PDI + " خداحافظ");

  engine.stop();
  assert.equal(node.data, "سلام hello world خداحافظ", "isolates revert with everything else");
});

test("smartRuns is inert by default", () => {
  const node = text("سلام hello world خداحافظ");
  const engine = makeEngine(el("body", el("p", node)));
  engine.start();
  assert.equal(node.data, "سلام hello world خداحافظ");
});

test("author dir attribute no longer vetoes typography repair and resolves dir=auto to rtl", () => {
  // ChatGPT/Claude message containers ship dir="auto". The engine must intelligently
  // resolve them to dir="rtl" and rtlm-align, while preserving reversibility on stop().
  const node = text("مي روم .");
  const p = el("p", node);
  p.setAttribute("dir", "auto");
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(node.data, "می" + ZW + "روم.", "text is still repaired");
  assert.equal(p.getAttribute("dir"), "rtl", "dir=auto resolved to rtl for Persian text");
  assert.equal(p.classList.contains("rtlm-align"), true, "alignment classes applied to dir=auto");
  assert.equal(p.classList.contains("rtlm-font"), true, "font hook reaches dir=auto units");
  assert.equal(engine.snapshot().rtlBlocks, 1, "dir=auto RTL units count for coverage");

  // Reversibility check: stopping engine must restore original author dir="auto"
  engine.stop();
  assert.equal(p.getAttribute("dir"), "auto", "original author dir=auto is cleanly restored on stop");
  assert.equal(p.classList.contains("rtlm-align"), false, "alignment class is cleanly removed on stop");
});

test("font class reaches author-dir units and explicit dir=ltr stays untouched", () => {
  // Regression for "fonts do nothing on Claude": rtlm-font was gated on
  // writing our own dir attribute, so dir=auto wrappers never got fonts.
  const auto = el("p", text("سلام دنیا"));
  auto.setAttribute("dir", "auto");
  makeEngine(el("body", auto), { pageFont: "Vazir" }).start();
  assert.equal(auto.classList.contains("rtlm-font"), true, "font hook works under dir=auto");
  assert.equal(auto.getAttribute("dir"), "rtl", "dir=auto resolved to rtl for Persian");

  // An explicit author dir=ltr is a hard direction decision: no dir flip, no
  // alignment class, no font hook, no coverage counting.
  const forced = el("p", text("سلام دنیا"));
  forced.setAttribute("dir", "ltr");
  const ltrEngine = makeEngine(el("body", forced), { pageFont: "Vazir" });
  ltrEngine.start();
  assert.equal(forced.getAttribute("dir"), "ltr");
  assert.equal(forced.classList.set.size, 0, "no style patches against explicit ltr");
  assert.equal(ltrEngine.snapshot().rtlBlocks, 0, "author ltr is not an RTL block");
});

test("stop() preserves text the page replaced after our patch", () => {
  // Regression: revertAll restored the first-seen original even after an
  // SPA had rewritten the text node in place, destroying live content.
  const node = text("سلام .");
  const p = el("p", node);
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(node.data, "سلام.");
  node.data = "خداحافظ ."; // simulated React in-place update
  engine.stop();
  assert.equal(node.data, "خداحافظ .", "page-owned content must survive");
});

test("the engine's own characterData writes do not re-trigger a rescan", () => {
  const node = text("مي روم .");
  const p = el("p", node);
  const engine = makeEngine(el("body", p), {}, { observerCtor: FakeObserver });
  engine.start();
  assert.notEqual(node.data, "مي روم .", "unit was patched");

  const calls = [];
  const original = engine.processUnit.bind(engine);
  engine.processUnit = (unit, rescan) => {
    calls.push(unit);
    return original(unit, rescan);
  };
  // The record our own setText() produced must be recognized and ignored.
  FakeObserver.instance.callback([{ type: "characterData", target: node }]);
  assert.equal(calls.length, 0, "self-write must not re-enqueue the unit");

  // A genuine page write on the same node must still be processed.
  node.data = "سلام .";
  FakeObserver.instance.callback([{ type: "characterData", target: node }]);
  assert.equal(node.data, "سلام.", "foreign write is still handled");
});

test("shadow content of a custom-element unit is processed", () => {
  // Regression: collectTree refused to descend into the unit's own
  // shadowRoot, so every web-component block was detected and then skipped.
  const shadowText = text("مي روم .");
  const host = el("chat-message");
  host.shadowRoot = { childNodes: [shadowText], nodeType: 11 };
  const engine = makeEngine(el("body", host));
  engine.start();
  assert.equal(shadowText.data, "می" + ZW + "روم.");
  assert.equal(host.getAttribute("dir"), "rtl");
});

test("layoutSafe also protects tables from column-order mirroring", () => {
  // dir=rtl on a <table> unit mirrors the whole column order, corrupting
  // LTR-origin data tables; the guard must cover display:table too.
  const table = el("table");
  table.append(text("سلام دنیا .")); // unit resolves to the table itself
  const engine = makeEngine(el("body", table), {}, {
    computeDisplay: () => "table",
  });
  engine.start();
  assert.equal(table.hasAttribute("dir"), false, "table keeps its column order");
  assert.equal(table.childNodes[0].data, "سلام دنیا.", "text is still repaired");
});

test("svg text-family nodes are repaired while markup stays untouched", () => {
  // Qwen-style badges: user-facing text lives in <title>/<text> inside an
  // <svg>. The svg is skipped as layout, but its text nodes must still be
  // found, repaired, and written back — text nodes only, never markup.
  const label = text("مي روم");
  const title = el("title", label);
  const svg = el("svg", title);
  const p = el("p", text("سلام"), svg);
  const engine = makeEngine(el("body", p));
  engine.start();
  assert.equal(label.data, "می" + ZW + "روم", "svg text content is repaired");
  assert.equal(engine.snapshot().rtlBlocks, 1);
});

test("svg without text-family content is fully ignored", () => {
  // Path data and other non-text svg strings must never be treated as
  // user-facing text (they are geometry, and writing to them corrupts icons).
  const pathData = text("M10 10 L20 20");
  const svg = el("svg", el("path", pathData));
  const engine = makeEngine(el("body", svg));
  engine.start();
  assert.equal(pathData.data, "M10 10 L20 20", "geometry strings untouched");
  assert.equal(engine.snapshot().paragraphs, 0);
});

test("innermost units are processed first so nested text has one owner", () => {
  // Regression: container-before-child processing merged the inner
  // paragraph's text into the container's analysis. An LTR container with an
  // RTL inner paragraph resolved RTL from the mixed text and mirrored the
  // container; depth-sorted processing leaves the decision to the inner unit.
  const p = el("p", text("سلام دنیا"));
  const div = el("div", text("Hello world"), p);
  const engine = makeEngine(el("body", div));
  engine.start();
  assert.equal(p.getAttribute("dir"), "rtl");
  assert.equal(div.hasAttribute("dir"), false, "outer unit must not inherit inner RTL content");
  assert.equal(engine.snapshot().rtlBlocks, 1);
});

test("adapter unit hints act as paragraph-unit boundaries", () => {
  // Claude renders turns as plain <span class="font-claude-message"> — no
  // block tag, no custom element. The adapter's hint selectors must become
  // unit boundaries so the engine resolves one unit per message.
  const inner = el("span", text("سلام دنیا"));
  const turn = el("span", inner);
  turn.matches = (selector) => String(selector).includes("message-turn");
  const body = el("body", turn);
  const engine = makeEngine(body);
  engine.adapter = { id: "claude", unitHints: [".message-turn"] };
  engine.hintSelector = engine.compileUnitHints();
  engine.start();
  assert.equal(turn.getAttribute("dir"), "rtl", "hinted container becomes the unit");
  assert.equal(inner.hasAttribute("dir"), false, "inner span is not a separate unit");
});

test("rescan() re-walks the page without reverting settled units", () => {
  // Background tabs starve the observer; the forced re-apply path must heal
  // subtrees it missed WITHOUT tearing down already-correct units.
  const first = el("p", text("سلام"));
  const body = el("body", first);
  const engine = makeEngine(body);
  engine.start();
  assert.equal(first.getAttribute("dir"), "rtl");

  const fresh = el("p", text("پیام تازه"));
  body.append(fresh); // arrived while no observer was watching
  engine.rescan();
  assert.equal(fresh.getAttribute("dir"), "rtl", "missed subtree is processed");
  assert.equal(first.getAttribute("dir"), "rtl", "settled unit keeps its state");
});

test("attribute show-transitions trigger unit rescans; own class writes do not", () => {
  // Popups/tooltips appear by class/hidden/style flips — mutations that
  // childList/characterData observers never see.
  const host = el("div", text("سلام دنیا"));
  const engine = makeEngine(el("body", host), {}, { observerCtor: FakeObserver });
  engine.start();
  assert.equal(engine.snapshot().paragraphs, 1);

  // A tooltip subtree revealed by a class flip must be discovered.
  const tip = el("div", text("راهنمای نمایشی"));
  host.append(tip);
  tip.className = "popover show";
  FakeObserver.instance.callback([
    { type: "attributes", target: tip, attributeName: "class" },
  ]);
  assert.equal(tip.getAttribute("dir") === "rtl" || tip.classList.contains("rtlm-font"), true,
    "revealed tooltip subtree is processed");

  // Our own rtlm-* class writes must not re-enqueue anything.
  const calls = [];
  const original = engine.processUnit.bind(engine);
  engine.processUnit = (unit, rescan) => {
    calls.push(unit);
    return original(unit, rescan);
  };
  host.className = "rtlm-align rtlm-font";
  FakeObserver.instance.callback([
    { type: "attributes", target: host, attributeName: "class" },
  ]);
  assert.equal(calls.length, 0, "own class writes are ignored");

  // Hover-style churn (no show token) is ignored too.
  tip.className = "highlighted";
  FakeObserver.instance.callback([
    { type: "attributes", target: tip, attributeName: "class" },
  ]);
  assert.equal(calls.length, 0, "non-show class churn is ignored");

  // style.display = none → none→block is a show transition.
  const modal = el("div", text("پنجرهٔ کمک"));
  host.append(modal);
  modal.style.setProperty("display", "block");
  FakeObserver.instance.callback([
    { type: "attributes", target: modal, attributeName: "style" },
  ]);
  assert.equal(calls.length, 1, "style reveal rescans the unit");
});

test("injection never touches structure: text edits only", () => {
  // Contract under test: only text content is manipulated. Structure —
  // element identity, child order, structural attributes — must survive a
  // full engine pass byte-for-byte, with the sole exception of the whitelisted
  // unit-level dir/class patches the engine owns and can revert.
  const STRUCT_TAGS = new Set(["DIV", "SECTION", "NAV", "UL", "LI", "BUTTON", "SPAN"]);
  const nav = el("nav", el("button", text("ارسال")));
  const list = el("ul", el("li", text("مورد اول")), el("li", text("مورد دوم")));
  const section = el("section", el("div", text("سلام دنیا hello"), nav, list));
  const body = el("body", section);

  // Structural snapshot BEFORE the run: tag names, child order, and
  // childList shapes for every structural element.
  const walkStructure = (node, out) => {
    if (node.nodeType === 1) {
      out.push(`${node.tagName}<${node.childNodes.length}>`);
      for (const child of node.childNodes) walkStructure(child, out);
    }
  };
  const snapshot = [];
  walkStructure(body, snapshot);

  const engine = makeEngine(body);
  engine.start();

  const after = [];
  walkStructure(body, after);
  assert.deepEqual(after, snapshot, "element tree shape must be identical");

  // Structural elements never receive direction or font classes; only text
  // leaf containers (p/ul-level units) may.
  for (const node of [section, nav, nav.childNodes[0], list]) {
    assert.equal(node.hasAttribute("dir"), false, `no dir on ${node.tagName}`);
  }

  // Typography edits stay confined to text nodes.
  const liText = list.childNodes[0].childNodes[0].data;
  assert.equal(typeof liText, "string");
  engine.stop();
});

test("directionMode forces global RTL or LTR orientation", () => {
  const p1 = el("p", text("Hello world"));
  const p2 = el("p", text("سلام دنیا"));
  const pAuto = el("p", text("سلام چت‌جی‌پی‌تی"));
  pAuto.setAttribute("dir", "auto");
  const pForcedLtr = el("p", text("سلام بر کلود"));
  pForcedLtr.setAttribute("dir", "ltr");
  const body = el("body", p1, p2, pAuto, pForcedLtr);

  // Force RTL mode
  const rtlEngine = makeEngine(body, { directionMode: "rtl" });
  rtlEngine.start();
  assert.equal(p1.getAttribute("dir"), "rtl", "p1 forced to RTL");
  assert.equal(p2.getAttribute("dir"), "rtl", "p2 is RTL");
  assert.equal(pAuto.getAttribute("dir"), "rtl", "pAuto forced to RTL");
  assert.equal(pForcedLtr.getAttribute("dir"), "rtl", "pForcedLtr forced to RTL overriding author dir");
  rtlEngine.stop();

  // Force LTR mode
  const ltrEngine = makeEngine(body, { directionMode: "ltr" });
  ltrEngine.start();
  assert.equal(p1.hasAttribute("dir"), false, "p1 not marked RTL");
  assert.equal(p2.hasAttribute("dir"), false, "p2 not marked RTL in LTR mode");
  ltrEngine.stop();
});

test("zero-flicker rescan does not momentarily strip dir from settled units", () => {
  const p = el("p", text("سلام دنیا"));
  const body = el("body", p);
  const engine = makeEngine(body);
  engine.start();
  assert.equal(p.getAttribute("dir"), "rtl");

  // Track attribute removals during rescan
  let removedDir = false;
  const originalRemove = p.removeAttribute.bind(p);
  p.removeAttribute = (attr) => {
    if (attr === "dir") removedDir = true;
    return originalRemove(attr);
  };

  engine.processUnit(p, true);
  assert.equal(removedDir, false, "dir attribute was never momentarily stripped during rescan");
  assert.equal(p.getAttribute("dir"), "rtl", "dir remains rtl throughout rescan");
  engine.stop();
});
