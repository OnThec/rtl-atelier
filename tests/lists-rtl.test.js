import test from "node:test";
import assert from "node:assert/strict";
import { RtlEngine } from "../src/core/engine.js";
import { normalizeSettings } from "../src/core/settings.js";
import { el, text } from "./fixtures/fake-dom.js";

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

test("ordered list with direct text items receives RTL direction and alignment on LI", () => {
  const li1 = el("li", text("مورد اول برای شروع"));
  const li2 = el("li", text("مورد دوم جهت ادامه"));
  const ol = el("ol", li1, li2);
  const body = el("body", ol);

  const engine = makeEngine(body, { directionMode: "auto" });
  engine.start();

  assert.equal(li1.getAttribute("dir"), "rtl", "first LI must have dir=rtl");
  assert.equal(li1.classList.contains("rtlm-align"), true, "first LI must have rtlm-align class");
  assert.equal(li2.getAttribute("dir"), "rtl", "second LI must have dir=rtl");
  assert.equal(li2.classList.contains("rtlm-align"), true, "second LI must have rtlm-align class");

  engine.stop();
  assert.equal(li1.hasAttribute("dir"), false, "LI dir reverted after stop");
  assert.equal(li1.classList.contains("rtlm-align"), false, "LI class reverted after stop");
});

test("markdown nested paragraph inside LI synchronizes RTL onto enclosing LI", () => {
  // In DeepSeek and Claude markdown rendering: <ol><li><p>متن</p></li></ol>
  const p1 = el("p", text("گام اول: نصب و راه‌اندازی پروژه"));
  const li1 = el("li", p1);
  const p2 = el("p", text("گام دوم: اجرای تست‌ها و بررسی خروجی"));
  const li2 = el("li", p2);
  const ol = el("ol", li1, li2);
  const body = el("body", ol);

  const engine = makeEngine(body, { directionMode: "auto" });
  engine.start();

  // Paragraph units get RTL
  assert.equal(p1.getAttribute("dir"), "rtl", "nested paragraph 1 gets RTL");
  assert.equal(p2.getAttribute("dir"), "rtl", "nested paragraph 2 gets RTL");

  // Enclosing LI gets synchronized with dir=rtl and rtlm-align so ::marker numbers align right!
  assert.equal(li1.getAttribute("dir"), "rtl", "enclosing LI 1 must have dir=rtl for marker positioning");
  assert.equal(li1.classList.contains("rtlm-align"), true, "enclosing LI 1 must have rtlm-align class");
  assert.equal(li2.getAttribute("dir"), "rtl", "enclosing LI 2 must have dir=rtl for marker positioning");
  assert.equal(li2.classList.contains("rtlm-align"), true, "enclosing LI 2 must have rtlm-align class");

  engine.stop();
  assert.equal(p1.hasAttribute("dir"), false, "P dir reverted after stop");
  assert.equal(li1.hasAttribute("dir"), false, "LI 1 dir reverted after stop");
  assert.equal(li1.classList.contains("rtlm-align"), false, "LI 1 class reverted after stop");
});

test("unordered list with bullets synchronizes RTL on bullet items", () => {
  const p = el("p", text("نکته مهم: به این مورد توجه کنید"));
  const li = el("li", p);
  const ul = el("ul", li);
  const body = el("body", ul);

  const engine = makeEngine(body, { directionMode: "auto" });
  engine.start();

  assert.equal(p.getAttribute("dir"), "rtl");
  assert.equal(li.getAttribute("dir"), "rtl", "bullet LI must have dir=rtl so bullet renders on the right");
  assert.equal(li.classList.contains("rtlm-align"), true);

  engine.stop();
});

test("English ordered list remains untouched and left-aligned", () => {
  const p1 = el("p", text("Step 1: Install dependencies"));
  const li1 = el("li", p1);
  const p2 = el("p", text("Step 2: Run verification tests"));
  const li2 = el("li", p2);
  const ol = el("ol", li1, li2);
  const body = el("body", ol);

  const engine = makeEngine(body, { directionMode: "auto" });
  engine.start();

  assert.equal(p1.hasAttribute("dir"), false, "English P has no dir");
  assert.equal(li1.hasAttribute("dir"), false, "English LI has no dir");
  assert.equal(li1.classList.contains("rtlm-align"), false, "English LI has no rtlm-align");
  assert.equal(ol.hasAttribute("dir"), false, "English OL has no dir");

  engine.stop();
});
