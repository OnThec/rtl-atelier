import test from "node:test";
import assert from "node:assert/strict";
import { RtlEngine } from "../src/core/engine.js";
import { normalizeSettings } from "../src/core/settings.js";
import { detectAdapter } from "../src/adapters/registry.js";
import { globalErrors, SUBSYSTEMS, ERROR_LEVELS } from "../src/core/errors.js";
import { pageFontCss } from "../src/core/page-style.js";
import { BUNDLED_FONTS, isBundledFont, bundledFacesForFamily } from "../src/core/bundled-fonts.js";
import { el, text } from "./fixtures/fake-dom.js";

function makeEngine(root, patch = {}, extra = {}) {
  const settings = normalizeSettings({ autoDirInputs: false, ...patch });
  return new RtlEngine({
    root,
    settings,
    adapter: extra.adapter || { id: "generic", inputSelectors: [], unitHints: [] },
    computeAlign: extra.computeAlign || (() => "left"),
    computeDisplay: extra.computeDisplay || null,
    observerCtor: extra.observerCtor || null,
    idle: (cb) => cb(),
    report: extra.report || (() => {}),
  });
}

test("DeepSeek chat markdown container with nested Persian list formats correctly", () => {
  const adapter = detectAdapter("chat.deepseek.com");
  assert.equal(adapter.id, "deepseek");

  // DeepSeek chat message structure
  const li1Text = text("مرحله اول: بارگذاری اطلاعات چت");
  const p1 = el("p", li1Text);
  const li1 = el("li", p1);

  const li2Text = text("مرحله دوم: پردازش و مرتب‌سازی");
  const p2 = el("p", li2Text);
  const li2 = el("li", p2);

  const ol = el("ol", li1, li2);
  const markdown = el("div", ol);
  markdown.className = "ds-markdown ds-markdown--block";

  const messageItem = el("div", markdown);
  messageItem.className = "ds-message-item";

  const body = el("body", messageItem);
  const engine = makeEngine(body, { directionMode: "auto" }, { adapter });
  engine.start();

  // Nested paragraph units get RTL
  assert.equal(p1.getAttribute("dir"), "rtl");
  assert.equal(p2.getAttribute("dir"), "rtl");

  // Enclosing LI gets synchronized with dir=rtl and rtlm-align so numbers render on right
  assert.equal(li1.getAttribute("dir"), "rtl");
  assert.equal(li1.classList.contains("rtlm-align"), true);
  assert.equal(li2.getAttribute("dir"), "rtl");
  assert.equal(li2.classList.contains("rtlm-align"), true);

  engine.stop();
  assert.equal(li1.hasAttribute("dir"), false);
  assert.equal(li1.classList.contains("rtlm-align"), false);
});

test("Claude chat container with previous messages formatted when mounted", () => {
  const adapter = detectAdapter("claude.ai");
  assert.equal(adapter.id, "claude");

  // Claude chat message container
  const userMsgText = text("سلام، لطفاً این متن را به فارسی ترجمه کن");
  const userP = el("p", userMsgText);
  const userContainer = el("div", userP);
  userContainer.className = "font-user-message";
  userContainer.setAttribute("data-testid", "user-message");

  const claudeMsgText = text("سلام! با کمال میل متن شما را ترجمه می‌کنم.");
  const claudeP = el("p", claudeMsgText);
  const claudeContainer = el("div", claudeP);
  claudeContainer.className = "font-claude-message";
  claudeContainer.setAttribute("data-testid", "assistant-message");

  const body = el("body", userContainer, claudeContainer);
  const engine = makeEngine(body, { directionMode: "auto" }, { adapter });
  engine.start();

  assert.equal(userP.getAttribute("dir"), "rtl");
  assert.equal(claudeP.getAttribute("dir"), "rtl");
  assert.equal(userP.classList.contains("rtlm-align"), true);
  assert.equal(claudeP.classList.contains("rtlm-align"), true);

  const diag = engine.diagnostics();
  assert.equal(diag.status, "active");
  assert.equal(diag.reasonCode, "ACTIVE_RTL");
  assert.equal(diag.rtlBlocks, 2);
  assert.equal(diag.paragraphs, 2);
  assert.equal(diag.coveragePct, 100);

  engine.stop();
});

test("rescanVisible processes newly mounted elements in virtual scroll", () => {
  const adapter = detectAdapter("chat.deepseek.com");
  const existingMsg = el("p", text("First message"));
  const body = el("body", existingMsg);

  const engine = makeEngine(body, { directionMode: "auto" }, { adapter });
  engine.start();

  assert.equal(engine.snapshot().rtlBlocks, 0);

  // Simulate scrolling into view of a new Persian chat turn
  const newMsg = el("p", text("پیام جدید فارسی در حین اسکرول"));
  body.appendChild(newMsg);

  // Calling rescanVisible()
  engine.rescanVisible();

  assert.equal(newMsg.getAttribute("dir"), "rtl");
  assert.equal(newMsg.classList.contains("rtlm-align"), true);
  assert.equal(engine.snapshot().rtlBlocks, 1);

  engine.stop();
});

test("diagnostics provides accurate status, reasonCode and troubleshooting", () => {
  // 1. Empty body
  const emptyBody = el("body");
  const engineEmpty = makeEngine(emptyBody, { directionMode: "auto" });
  engineEmpty.start();

  const emptyDiag = engineEmpty.diagnostics();
  assert.equal(emptyDiag.status, "standby");
  assert.equal(emptyDiag.reasonCode, "NO_PARAGRAPHS_FOUND");
  assert.equal(Array.isArray(emptyDiag.troubleshooting), true);
  engineEmpty.stop();

  // 2. English-only body (standby for RTL text)
  const englishBody = el("body", el("p", text("Hello world, this is English text only.")));
  const engineEnglish = makeEngine(englishBody, { directionMode: "auto" });
  engineEnglish.start();

  const engDiag = engineEnglish.diagnostics();
  assert.equal(engDiag.status, "standby");
  assert.equal(engDiag.reasonCode, "NO_RTL_TEXT_DETECTED");
  assert.equal(engDiag.rtlBlocks, 0);
  assert.equal(engDiag.paragraphs, 1);
  engineEnglish.stop();

  // 3. Persian body (active)
  const persianBody = el("body", el("p", text("این یک متن کاملاً فارسی است.")));
  const enginePersian = makeEngine(persianBody, { directionMode: "auto" });
  enginePersian.start();

  const faDiag = enginePersian.diagnostics();
  assert.equal(faDiag.status, "active");
  assert.equal(faDiag.reasonCode, "ACTIVE_RTL");
  assert.equal(faDiag.rtlBlocks, 1);
  assert.equal(faDiag.coveragePct, 100);
  enginePersian.stop();

  // 4. Forced LTR
  const ltrBody = el("body", el("p", text("متن فارسی در حالت چپ‌چین اجباری")));
  const engineLtr = makeEngine(ltrBody, { directionMode: "ltr" });
  engineLtr.start();

  const ltrDiag = engineLtr.diagnostics();
  assert.equal(ltrDiag.reasonCode, "FORCED_LTR");
  engineLtr.stop();
});

test("ErrorManager captures operational events with levels and metadata", () => {
  globalErrors.clear();

  globalErrors.info("Engine Boot", "Content engine initialized", {
    subsystem: SUBSYSTEMS.CONTENT,
    host: "claude.ai",
  });

  globalErrors.warn("Delayed DOM Mount", "Elements mounted after 800ms", {
    subsystem: SUBSYSTEMS.ENGINE,
    host: "claude.ai",
  });

  const entries = globalErrors.getEntries();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].level, ERROR_LEVELS.INFO);
  assert.equal(entries[0].subsystem, SUBSYSTEMS.CONTENT);
  assert.equal(entries[0].host, "claude.ai");
  assert.equal(entries[1].level, ERROR_LEVELS.WARNING);

  const summary = globalErrors.summary();
  assert.equal(summary.total, 2);
  assert.equal(summary.counts.info, 1);
  assert.equal(summary.counts.warning, 1);
  assert.equal(summary.hasIssues, false);

  globalErrors.clear();
  assert.equal(globalErrors.getEntries().length, 0);
});

test("Chat containers with author dir=auto format Persian lists and resolve to RTL without manual reapply", () => {
  const adapter = detectAdapter("chat.deepseek.com");

  // A chat message container with author dir="auto" (like DeepSeek or Claude)
  const item1 = el("li", text("مرحله ۱: دانلود مدل"));
  item1.setAttribute("dir", "auto");
  const item2 = el("li", text("مرحله ۲: پردازش داده‌ها"));
  item2.setAttribute("dir", "auto");
  const ol = el("ol", item1, item2);
  ol.setAttribute("dir", "auto");

  const messageWrapper = el("div", ol);
  messageWrapper.setAttribute("dir", "auto");
  messageWrapper.className = "ds-markdown";

  const body = el("body", messageWrapper);
  const engine = makeEngine(body, { directionMode: "auto" }, { adapter });
  engine.start();

  // In Auto mode, dir="auto" on Persian units must be resolved to dir="rtl" and rtlm-align
  assert.equal(item1.getAttribute("dir"), "rtl");
  assert.equal(item1.classList.contains("rtlm-align"), true);
  assert.equal(item2.getAttribute("dir"), "rtl");
  assert.equal(item2.classList.contains("rtlm-align"), true);

  // Stopping engine restores original dir="auto"
  engine.stop();
  assert.equal(item1.getAttribute("dir"), "auto");
  assert.equal(item1.classList.contains("rtlm-align"), false);
  assert.equal(item2.getAttribute("dir"), "auto");
  assert.equal(item2.classList.contains("rtlm-align"), false);
});

test("structural flex/grid containers protect outer layout while aligning inner Persian text children", () => {
  const spanText = text("متن داخل باکس فلکس");
  const span = el("span", spanText);
  const flexContainer = el("div", span);
  flexContainer.className = "flex items-center gap-2";

  const body = el("body", flexContainer);
  const engine = makeEngine(
    body,
    { directionMode: "auto", layoutSafe: true },
    {
      computeDisplay: (node) => (node === flexContainer ? "flex" : "inline"),
    }
  );
  engine.start();

  // The outer flex container must NOT get dir="rtl" to prevent reversing flex children
  assert.equal(flexContainer.hasAttribute("dir"), false);

  // But the inner text-bearing child MUST receive dir="rtl" and rtlm-align!
  assert.equal(span.getAttribute("dir"), "rtl");
  assert.equal(span.classList.contains("rtlm-align"), true);

  engine.stop();
  assert.equal(span.hasAttribute("dir"), false);
  assert.equal(span.classList.contains("rtlm-align"), false);
});

test("enableInputs handles input events fired on child elements inside contenteditable (Claude ProseMirror)", () => {
  const p = el("p", text(""));
  const editor = el("div", p);
  editor.className = "ProseMirror";
  editor.setAttribute("contenteditable", "true");

  const body = el("body", editor);
  const engine = makeEngine(body, { autoDirInputs: true });
  engine.start();

  // Simulate user typing Persian inside <p> inside ProseMirror editor
  p.textContent = "سلام، این یک پرامپت فارسی برای تست است";
  p.value = "سلام، این یک پرامپت فارسی برای تست است";

  // Simulate input event bubbling from <p>
  body.ownerDocument.dispatchEvent({
    type: "input",
    target: p,
  });

  assert.equal(editor.style.direction, "rtl");
  assert.equal(editor.style.textAlign, "right");

  engine.stop();
});

test("Chat containers with author dir=ltr on Claude/DeepSeek correctly format Persian units in Auto mode", () => {
  const adapter = detectAdapter("claude.ai");
  const p = el("p", text("سلام، این پیام با وجود پیش‌فرض چپ‌چین به درستی راست‌چین می‌شود"));
  p.setAttribute("dir", "ltr"); // Claude or template had dir="ltr"

  const container = el("div", p);
  container.className = "prose font-claude-message";
  container.setAttribute("dir", "ltr");

  const body = el("body", container);
  const engine = makeEngine(body, { directionMode: "auto" }, { adapter });
  engine.start();

  assert.equal(p.getAttribute("dir"), "rtl", "Persian unit overrides author dir=ltr to rtl");
  assert.equal(p.classList.contains("rtlm-align"), true, "Persian unit receives rtlm-align");

  engine.stop();
  assert.equal(p.getAttribute("dir"), "ltr", "Original dir=ltr is cleanly restored on stop");
  assert.equal(p.classList.contains("rtlm-align"), false);
});

test("List container OL and UL synchronize dir=rtl and rtlm-align in Auto mode for right-aligned numbers", () => {
  const adapter = detectAdapter("chat.deepseek.com");
  const li1 = el("li", el("p", text("مرحله اول: آماده‌سازی محیط")));
  const li2 = el("li", el("p", text("مرحله دوم: بارگذاری مدل")));
  const ol = el("ol", li1, li2);
  ol.className = "ds-markdown-list";

  const body = el("body", ol);
  const engine = makeEngine(body, { directionMode: "auto" }, { adapter });
  engine.start();

  assert.equal(ol.getAttribute("dir"), "rtl", "Enclosing OL must have dir=rtl so numbers 1. 2. align on the right");
  assert.equal(ol.classList.contains("rtlm-align"), true, "Enclosing OL must have rtlm-align class");
  assert.equal(li1.getAttribute("dir"), "rtl", "Enclosing LI 1 must have dir=rtl");
  assert.equal(li2.getAttribute("dir"), "rtl", "Enclosing LI 2 must have dir=rtl");

  engine.stop();
  assert.equal(ol.hasAttribute("dir"), false, "OL dir reverted after stop");
  assert.equal(ol.classList.contains("rtlm-align"), false, "OL class reverted after stop");
});

test("SPA route navigation: engine.refresh() cleanly formats new conversation view without requiring manual reapply", () => {
  const adapter = detectAdapter("claude.ai");
  const msg1 = el("p", text("مکالمه اول: متن قدیمی"));
  const view1 = el("div", msg1);
  view1.className = "font-claude-message";

  const body = el("body", view1);
  const engine = makeEngine(body, { directionMode: "auto" }, { adapter });
  engine.start();

  assert.equal(msg1.getAttribute("dir"), "rtl");
  assert.equal(engine.diagnostics().rtlBlocks, 1);

  // Simulate SPA route change to a new conversation (React mounts new chat view into body)
  body.removeChild(view1);
  const msg2 = el("p", text("مکالمه دوم: متن جدید چت کلاد"));
  const view2 = el("div", msg2);
  view2.className = "font-claude-message";
  body.appendChild(view2);

  // engine.refresh() is executed on SPA route changes (onNavigate)
  engine.refresh();

  assert.equal(msg2.getAttribute("dir"), "rtl", "New conversation view is immediately formatted to RTL");
  assert.equal(msg2.classList.contains("rtlm-align"), true, "New conversation view receives rtlm-align");
  assert.equal(engine.diagnostics().rtlBlocks, 1, "Stats accurately reflect new conversation without stale nodes");

  engine.stop();
});

test("Diagnostics reports rich telemetry including queue depth, font settings, and matched chat containers", () => {
  const adapter = detectAdapter("claude.ai");
  const p = el("p", text("متن تستی برای عیب‌یابی و پایش هوشمند سیستم"));
  const container = el("div", p);
  container.className = "font-claude-message";

  const body = el("body", container);
  const engine = makeEngine(body, { pageFont: "Vazir", pageFontWeight: "700", directionMode: "auto" }, { adapter });
  engine.start();

  const d = engine.diagnostics();
  assert.equal(d.status, "active");
  assert.equal(d.reasonCode, "ACTIVE_RTL");
  assert.equal(d.pageFont, "Vazir");
  assert.equal(d.pageFontWeight, "700");
  assert.equal(d.directionMode, "auto");
  assert.equal(d.queueSize, 0);
  assert.equal(d.fontActive, true);
  assert.equal(d.adapterId, "claude");
  assert.ok(d.adapterMatched >= 1);

  engine.stop();
});

test("Bundled fonts registry provides static face metadata for in-memory CSP-immune loading", () => {
  assert.equal(isBundledFont("Vazir"), true);
  assert.equal(isBundledFont("Shabnam"), true);
  assert.equal(isBundledFont("Sahel"), true);
  assert.equal(isBundledFont("Samim"), true);
  assert.equal(isBundledFont("NonExistentFont"), false);

  const vazirFaces = bundledFacesForFamily("Vazir");
  assert.ok(Array.isArray(vazirFaces));
  assert.equal(vazirFaces.length, 5);
  assert.ok(vazirFaces.some((f) => f.weight === 400 && f.file === "Vazir.ttf"));
  assert.ok(vazirFaces.some((f) => f.weight === 700 && f.file === "Vazir-Bold.ttf"));
});

test("pageFontCss emits high-specificity cascade overrides for Claude and DeepSeek message containers", () => {
  const css = pageFontCss({ pageFont: "Vazir", pageFontWeight: "700", pageFontSize: 110 }, true);

  // Base rule for tests and standard elements
  assert.ok(css.includes(".rtlm-font { font-family:"));

  // Boosted specificity rule for Claude/DeepSeek chat framework classes
  assert.ok(css.includes("[class*='font-claude']"));
  assert.ok(css.includes("[data-testid*='message']"));
  assert.ok(css.includes(".rtlm-font.rtlm-font"));
  assert.ok(css.includes("font-weight: 700 !important;"));
  assert.ok(css.includes("font-size: 110% !important;"));
});
