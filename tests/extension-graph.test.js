import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MV3 blocks `node:*` specifiers under script-src 'self'. A single stray
 * import of a build script from runtime code bricks the whole extension
 * (service worker registration fails). This guard walks the import graph of
 * every extension-reachable entry point and fails if any Node built-in or
 * scripts/ module is reachable.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const ENTRY_POINTS = [
  "src/background/service-worker.js",
  "src/content/content.js",
  "src/ui/popup.js",
  "src/ui/i18n.js",
];

// Content-script modules are bundled in this exact set by scripts/bundle.js.
const BUNDLED_MODULES = [
  "core/charsets.js",
  "core/analyzer.js",
  "core/typography.js",
  "core/scheduler.js",
  "core/patch-store.js",
  "core/errors.js",
  "adapters/registry.js",
  "core/settings.js",
  "core/engine.js",
  "content/content.js",
];

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_RE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function resolveRelative(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(join(ROOT, fromFile)), spec);
  for (const candidate of [`${base}.js`, base]) {
    const rel = candidate.slice(ROOT.length + 1).replace(/\\/g, "/");
    try {
      readFileSync(join(ROOT, rel));
      return rel;
    } catch {}
  }
  return null;
}

function walkImports(entry, seen = new Set()) {
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let source = "";
    try {
      source = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    const specs = [];
    for (const re of [IMPORT_RE, DYNAMIC_RE]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(source)) !== null) specs.push(match[1]);
    }
    for (const spec of specs) {
      const resolved = resolveRelative(file, spec);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

test("extension entry points never reach Node built-ins or build scripts", () => {
  const offenders = [];
  const roots = [
    ...ENTRY_POINTS,
    ...BUNDLED_MODULES.map((file) => `src/${file}`),
  ];
  for (const entry of roots) {
    for (const file of walkImports(entry)) {
      if (file.startsWith("scripts/")) {
        offenders.push(`${entry} -> ${file} (build script)`);
      }
      const source = readFileSync(join(ROOT, file), "utf8");
      if (/["']node:[a-z]+["']/.test(source) || /require\(["'][a-z_]+["']\)/.test(source)) {
        offenders.push(`${entry} -> ${file} (Node built-in import)`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("bundled font parser stays in sync between core and scripts", async () => {
  const core = await import("../src/core/font-names.js");
  const script = await import("../scripts/fonts.js");
  for (const name of ["Vazir-Bold.ttf", "Shabnam-Light.woff2", "Gandom.ttf", "nope.txt"]) {
    assert.deepEqual(core.parseFontFilename(name), script.parseFontFilename(name));
  }
});

test("service worker bundle evaluates cleanly with complete dependency closure", () => {
  const swCode = readFileSync(join(ROOT, "dist", "service-worker.bundle.js"), "utf8");
  const mockChrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener() {} },
      sendMessage() {},
    },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      session: { get: async () => ({}), set: async () => {} },
    },
    tabs: {
      onRemoved: { addListener() {} },
      query: async () => [],
      get: async () => null,
      sendMessage: async () => {},
    },
    action: {
      setBadgeText() {},
      setBadgeBackgroundColor() {},
    },
    commands: {
      onCommand: { addListener() {} },
    },
  };
  assert.doesNotThrow(() => {
    new Function("chrome", swCode)(mockChrome);
  }, "Service worker bundle must execute cleanly without missing modules");
});
