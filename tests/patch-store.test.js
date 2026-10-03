import { test } from "node:test";
import assert from "node:assert/strict";
import { PatchStore, TEXT_CAP, ELEMENT_CAP } from "../src/core/patch-store.js";
import { el, text } from "./fixtures/fake-dom.js";

test("setText records the original and reverts it", () => {
  const store = new PatchStore();
  const node = text("hello");
  store.setText(node, "world");
  assert.equal(node.data, "world");
  store.setText(node, "again");
  store.revertAll();
  assert.equal(node.data, "hello");
});

test("setText is a no-op when unchanged", () => {
  const store = new PatchStore();
  const node = text("same");
  assert.equal(store.setText(node, "same"), false);
  assert.equal(store.textEdits, 0);
});

test("revertAll never overwrites text the page replaced since our patch", () => {
  // Regression: an SPA rewriting a patched node in place used to be reverted
  // to the first-seen original on stop(), destroying live page content.
  const store = new PatchStore();
  const node = text("original .");
  store.setText(node, "original.");
  node.data = "live page content ."; // site re-rendered the same text node
  store.revertAll();
  assert.equal(node.data, "live page content .");
});

test("revertAll restores when the node still holds our last write", () => {
  const store = new PatchStore();
  const node = text("a");
  store.setText(node, "b");
  store.setText(node, "c");
  store.revertAll();
  assert.equal(node.data, "a");
});

test("revert strips only engine edits after a page rewrite and re-patch", () => {
  const store = new PatchStore();
  const node = text("a .");
  store.setText(node, "a.");  // engine edit
  node.data = "b .";          // page rewrites in place
  store.setText(node, "b.");  // engine re-patches on rescan
  store.revertAll();
  assert.equal(node.data, "b .", "page content kept, extension edit undone");
});

test("class and attribute patches revert exactly", () => {
  const store = new PatchStore();
  const element = el("p");

  store.addClass(element, "rtlm-align");
  store.addClass(element, "rtlm-center");
  assert.equal(element.classList.contains("rtlm-align"), true);

  store.setAttribute(element, "dir", "rtl");
  assert.equal(element.getAttribute("dir"), "rtl");

  store.revertAll();
  assert.equal(element.classList.contains("rtlm-align"), false);
  assert.equal(element.classList.contains("rtlm-center"), false);
  assert.equal(element.hasAttribute("dir"), false);
});

test("pre-existing dir attribute is restored, not deleted", () => {
  const store = new PatchStore();
  const element = el("p");
  element.setAttribute("dir", "ltr");
  store.setAttribute(element, "dir", "rtl");
  store.revertAll();
  assert.equal(element.getAttribute("dir"), "ltr");
});

test("style patches restore and clean up empty values", () => {
  const store = new PatchStore();
  const element = el("textarea");
  store.setStyle(element, "direction", "rtl");
  store.setStyle(element, "text-align", "right");
  assert.equal(element.style.getPropertyValue("direction"), "rtl");

  store.revertAll();
  assert.equal(element.style.getPropertyValue("direction"), "");
  assert.equal(element.style.getPropertyValue("text-align"), "");
});

test("style patches restore previous inline values", () => {
  const store = new PatchStore();
  const element = el("textarea");
  element.style.setProperty("direction", "ltr");
  store.setStyle(element, "direction", "rtl");
  store.revertAll();
  assert.equal(element.style.getPropertyValue("direction"), "ltr");
});

test("revertAll resets bookkeeping", () => {
  const store = new PatchStore();
  const element = el("p");
  store.addClass(element, "x");
  store.setText(text("a"), "b");
  store.revertAll();
  assert.equal(store.size, 0);
  assert.equal(store.textEdits, 0);
});

test("text originals are bounded", () => {
  const store = new PatchStore();
  for (let i = 0; i < TEXT_CAP + 64; i++) {
    store.setText(text(`value-${i}`), "changed");
  }
  assert.ok(store.textOriginals.size <= TEXT_CAP);
});

test("element patches are bounded", () => {
  const store = new PatchStore();
  for (let i = 0; i < ELEMENT_CAP + 64; i++) {
    store.addClass(el("p"), `cls-${i}`);
  }
  assert.ok(store.elements.length <= ELEMENT_CAP);
  assert.ok(store.classPatches.size <= ELEMENT_CAP);
});
