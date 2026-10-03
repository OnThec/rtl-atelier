import test from "node:test";
import assert from "node:assert/strict";
import { RtlEngine } from "../src/core/engine.js";
import { normalizeSettings } from "../src/core/settings.js";
import { el, text } from "./fixtures/fake-dom.js";

const ZW = "\u200c";

class FakeObserver {
  constructor(callback) {
    this.callback = callback;
    this.observedRoot = null;
    FakeObserver.instances.push(this);
  }

  observe(root) {
    this.observedRoot = root;
  }

  disconnect() {
    this.observedRoot = null;
  }

  trigger(records) {
    this.callback(records);
  }
}
FakeObserver.instances = [];

function makeEngine(root, patch = {}, extra = {}) {
  const settings = normalizeSettings({ autoDirInputs: false, ...patch });
  return new RtlEngine({
    root,
    settings,
    computeAlign: extra.computeAlign || (() => "left"),
    computeDisplay: extra.computeDisplay || null,
    observerCtor: FakeObserver,
    idle: (cb) => cb(),
    report: extra.report || (() => {}),
  });
}

test("streaming scenario: unit settled early with initial tokens automatically updates when full Persian text streams in", () => {
  FakeObserver.instances = [];
  const textNode = text("1. ");
  const p = el("p", textNode);
  const messageContainer = el("div", p);
  const body = el("body", messageContainer);

  const engine = makeEngine(body, { directionMode: "auto", zwnj: true });
  engine.start();

  const observer = FakeObserver.instances[0];
  assert.ok(observer, "observer initialized");

  // Initial state: "1. " has 0 RTL letters, so dir is not RTL
  assert.equal(p.hasAttribute("dir"), false, "initial token does not set RTL");

  // Simulate DeepSeek / Claude streaming tokens into the text node
  textNode.data = "1. سلام، مي روم به خانه برای شروع کار";

  // Trigger characterData mutation from streaming
  observer.trigger([
    {
      type: "characterData",
      target: textNode,
    },
  ]);

  // The engine must re-evaluate the unit because text has changed!
  assert.equal(p.getAttribute("dir"), "rtl", "p gets RTL after Persian tokens stream in");
  assert.equal(p.classList.contains("rtlm-align"), true, "p gets rtlm-align class");
  assert.ok(textNode.data.includes("می" + ZW + "روم"), "typography (ZWNJ) applied to streamed text");

  engine.stop();
});

test("streaming scenario: new chat message container dynamically added to DOM during conversation", () => {
  FakeObserver.instances = [];
  const initialMsg = el("div", el("p", text("First message")));
  const body = el("body", initialMsg);

  const engine = makeEngine(body, { directionMode: "auto" });
  engine.start();

  const observer = FakeObserver.instances[0];

  // DeepSeek / Claude renders a new assistant message turn
  const newTextNode = text("پاسخ دیپ‌سیک به درخواست شما در این بخش آمده است.");
  const newP = el("p", newTextNode);
  const newMsg = el("div", newP);
  body.append(newMsg);

  // Trigger childList mutation
  observer.trigger([
    {
      type: "childList",
      target: body,
      addedNodes: [newMsg],
      removedNodes: [],
    },
  ]);

  assert.equal(newP.getAttribute("dir"), "rtl", "dynamically added assistant message gets RTL");
  assert.equal(newP.classList.contains("rtlm-align"), true);

  engine.stop();
});

test("SPA navigation: rescan() smoothly updates new view content without teardown", () => {
  const chat1 = el("div", el("p", text("Previous conversation")));
  const body = el("body", chat1);

  const engine = makeEngine(body, { directionMode: "auto" });
  engine.start();

  // User navigates in SPA to another chat session
  chat1.childNodes[0].childNodes[0].data = "گفتگوی جدید با دستیار هوشمند کلاد";

  // Navigation listener triggers rescan()
  engine.rescan();

  assert.equal(chat1.childNodes[0].getAttribute("dir"), "rtl", "new chat view gets RTL on rescan");
  engine.stop();
});

test("rapid mutation burst: multiple updates to same unit settle with latest text", () => {
  FakeObserver.instances = [];
  const textNode = text("شروع");
  const p = el("p", textNode);
  const body = el("body", p);

  const engine = makeEngine(body, { directionMode: "auto", zwnj: true });
  engine.start();

  const observer = FakeObserver.instances[0];

  // Rapid streaming burst: 3 chunks arrive in quick succession
  textNode.data = "شروع به";
  observer.trigger([{ type: "characterData", target: textNode }]);

  textNode.data = "شروع به كار";
  observer.trigger([{ type: "characterData", target: textNode }]);

  textNode.data = "شروع به كار كرديم و مي رويم";
  observer.trigger([{ type: "characterData", target: textNode }]);

  assert.equal(p.getAttribute("dir"), "rtl");
  assert.ok(textNode.data.includes("می" + ZW + "رویم"), "final typography correctly settled");

  engine.stop();
});
