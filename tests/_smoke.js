import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { el, text } from "./fixtures/fake-dom.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = readFileSync(join(ROOT, "dist", "content.bundle.js"), "utf8");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Boot the real content bundle inside a fresh stubbed environment and return
 * handles for assertions. Each scenario gets an isolated DOM/chrome sandbox.
 */
function makeSandbox({ settings = { autoDirInputs: false }, siteEnabled = true, stateDelayMs = 0 } = {}) {
  const body = el("body", el("p", text("مي روم .")));
  const messages = [];
  const createdStyles = [];
  let styleCounter = 0;
  let listener = null;

  globalThis.document = {
    readyState: "complete",
    body,
    getElementById: (id) => createdStyles.find((style) => style.id === id) || null,
    createElement: () => {
      const node = { id: `style-${styleCounter++}`, textContent: "", parentNode: null };
      createdStyles.push(node);
      return node;
    },
    head: {
      appendChild(node) {
        node.parentNode = this;
      },
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.location = { hostname: "www.chatgpt.com" };
  globalThis.getComputedStyle = () => ({ textAlign: "left" });
  globalThis.chrome = {
    runtime: {
      async sendMessage(msg) {
        messages.push(msg);
        if (msg.type === "rtlm:get-content-state") {
          if (stateDelayMs > 0) await sleep(stateDelayMs);
          return { settings, siteEnabled, customFamilies: [], customStamp: "" };
        }
        if (msg.type === "rtlm:custom-fonts:data") return { records: [] };
        return { ok: true };
      },
      onMessage: { addListener(cb) { listener = cb; } },
    },
  };

  new Function(code)();
  return {
    body,
    messages,
    createdStyles,
    settings,
    p: body.childNodes[0],
    send: (message) => listener(message, {}, () => {}),
    reset() {
      delete globalThis.chrome;
      delete globalThis.document;
      delete globalThis.location;
      delete globalThis.getComputedStyle;
    },
  };
}

// ------------------------------------------------------------------
// Scenario 1: happy path + repeated applies + font-only fast path
// ------------------------------------------------------------------
{
  const env = makeSandbox();
  await sleep(600); // report debounce is 400 ms trailing

  assert.equal(env.p.getAttribute("dir"), "rtl");
  assert.equal(env.p.childNodes[0].data, "می\u200cروم.");
  assert.ok(env.messages.some((m) => m.type === "rtlm:report"));
  assert.equal(
    env.createdStyles.length,
    1,
    "main style created exactly once; empty custom-face list must not create a second node"
  );

  // Repeated re-applies stay idempotent.
  for (let i = 0; i < 5; i += 1) env.send({ type: "rtlm:apply" });
  await sleep(60);
  assert.equal(env.p.getAttribute("dir"), "rtl");
  assert.equal(env.createdStyles.length, 1, "no duplicate style nodes");

  // Font-only settings change rides the fast path: the injected style must
  // be swapped in place without tearing down the engine (regression guard
  // for an undeclared-identifier crash that silently swallowed every
  // font-only apply).
  const mainStyle = env.createdStyles[0];
  env.settings.pageFontSize = 130;
  env.send({ type: "rtlm:apply" });
  await sleep(600);
  assert.equal(env.createdStyles.length, 1, "fast path swaps styles in place");
  assert.equal(env.p.getAttribute("dir"), "rtl", "engine survives a font-only apply");
  assert.ok(
    (mainStyle.textContent || "").includes("font-size: 130%"),
    "font-only change must update the injected CSS"
  );

  // Full stop reverts every DOM touch.
  env.send({ type: "rtlm:stop" });
  assert.equal(env.p.hasAttribute("dir"), false);
  assert.equal(env.p.classList.set.size, 0);
  assert.equal(env.p.childNodes[0].data, "مي روم .");
  env.reset();
}

// ------------------------------------------------------------------
// Scenario 2: inactive page must not create any <style> elements
// ------------------------------------------------------------------
{
  const env = makeSandbox({ siteEnabled: false });
  await sleep(100);

  assert.equal(env.p.hasAttribute("dir"), false);
  assert.equal(
    env.createdStyles.length,
    0,
    "disabled pages must not receive placeholder style elements"
  );
  const reports = env.messages.filter((m) => m.type === "rtlm:report");
  assert.ok(reports.every((m) => m.payload?.active !== true), "inactive reports flagged inactive");
  env.reset();
}

// ------------------------------------------------------------------
// Scenario 3: a stop landing mid-apply invalidates the in-flight apply
// ------------------------------------------------------------------
{
  const env = makeSandbox({ stateDelayMs: 80 });
  env.send({ type: "rtlm:apply" });
  await sleep(20); // fetch still in flight
  env.send({ type: "rtlm:stop" }); // epoch bumps while apply is queued
  await sleep(200); // stale apply would have completed by now

  assert.equal(
    env.p.hasAttribute("dir"),
    false,
    "stale apply after stop must not resurrect the engine"
  );
  assert.equal(env.p.childNodes[0].data, "مي روم .", "text untouched after stop+stale-apply");
  env.reset();
}

console.log("bundle smoke test: OK");
