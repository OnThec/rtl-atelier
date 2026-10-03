import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAdapter, listAdapters, GENERIC_ADAPTER } from "../src/adapters/registry.js";

test("detectAdapter matches known AI platforms", () => {
  assert.equal(detectAdapter("chatgpt.com").id, "chatgpt");
  assert.equal(detectAdapter("www.claude.ai").id, "claude");
  assert.equal(detectAdapter("gemini.google.com").id, "gemini");
  assert.equal(detectAdapter("chat.deepseek.com").id, "deepseek");
  assert.equal(detectAdapter("v0.dev").id, "v0");
});

test("detectAdapter matches subdomains", () => {
  assert.equal(detectAdapter("sub.perplexity.ai").id, "perplexity");
});

test("detectAdapter falls back to generic adapter", () => {
  assert.equal(detectAdapter("example.com").id, GENERIC_ADAPTER.id);
  assert.equal(detectAdapter("").id, GENERIC_ADAPTER.id);
  assert.equal(detectAdapter(undefined).id, GENERIC_ADAPTER.id);
});

test("every adapter provides input selectors", () => {
  for (const adapter of listAdapters()) {
    assert.ok(adapter.id, "adapter id");
    assert.ok(adapter.name, "adapter name");
    assert.ok(Array.isArray(adapter.unitHints), "unitHints array present");
  }
  for (const known of ["chatgpt", "claude", "gemini"]) {
    const adapter = detectAdapter(`${known === "claude" ? "claude.ai" : known === "gemini" ? "gemini.google.com" : "chatgpt.com"}`);
    assert.ok(adapter.inputSelectors.length > 0);
  }
});

test("claude and qwen adapters declare unit-boundary hints", () => {
  const claude = detectAdapter("claude.ai");
  assert.ok(claude.unitHints.length > 0, "claude hints");
  const qwen = detectAdapter("chat.qwen.ai");
  assert.ok(qwen.unitHints.length > 0, "qwen hints");
  // The generic adapter must stay hint-free: hint matching on arbitrary
  // websites would treat random class names as paragraph boundaries.
  assert.deepEqual(detectAdapter("example.com").unitHints, []);
});
