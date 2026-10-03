import { RtlEngine } from "../core/engine.js";
import { detectAdapter } from "../adapters/registry.js";
import { normalizeSettings, normalizeHost } from "../core/settings.js";
import {
  fontClassMode,
  fontFaceRule,
  pageFontCss,
  safeWeight,
} from "../core/page-style.js";
import { globalErrors, SUBSYSTEMS } from "../core/errors.js";

const HOST = normalizeHost(typeof location !== "undefined" ? location.hostname : "");
const EMPTY_STATS = { paragraphs: 0, rtlBlocks: 0, textEdits: 0, inputs: 0 };
const REPORT_DELAY_MS = 400;
const FONT_STYLE_ID = "rtlm-font-style";
const CUSTOM_FONT_STYLE_ID = "rtlm-custom-font-style";

let engine = null;
let engineActive = false;
let reportTimer = null;
let pendingStats = EMPTY_STATS;
let lastFontSignature = null;
let lastFullSig = null;

// Epoch invalidation: any apply operation that was queued before a stop()
// must abort instead of resurrecting a freshly stopped engine.
let stateEpoch = 0;

// Apply operations mutate shared engine/style state and must never interleave:
// a broadcast arriving mid-apply could otherwise stop() a freshly started
// engine or leave half-swapped styles behind.
let applyChain = Promise.resolve();

function queueApply(task) {
  const run = applyChain.then(task, task);
  applyChain = run.catch(() => {});
  return run;
}

/**
 * Replace-or-create a <style> by id so repeated applies never stack
 * duplicate rules (the previous cause of layout breakage on re-apply).
 * Empty content removes the element entirely: pages where the extension is
 * inactive must not accumulate placeholder <style> nodes.
 */
function syncStyle(id, css) {
  if (!css) {
    const existing = document.getElementById(id);
    if (existing && existing.parentNode) {
      try {
        existing.parentNode.removeChild(existing);
      } catch {}
    }
    return;
  }
  let style = document.getElementById(id);
  const host = document.head || document.documentElement;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    if (!host || !host.appendChild) return;
    host.appendChild(style);
  } else if (host && style.nextSibling) {
    try {
      host.appendChild(style);
    } catch {}
  }
  style.textContent = css;
}

const activeLoadedFaces = new Set();

function base64ToArrayBuffer(base64) {
  const clean = String(base64 || "").replace(/\s+/g, "");
  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function clearFontStyles() {
  syncStyle(FONT_STYLE_ID, "");
  syncStyle(CUSTOM_FONT_STYLE_ID, "");
  if (typeof document !== "undefined" && document.fonts) {
    for (const face of activeLoadedFaces) {
      try {
        document.fonts.delete(face);
      } catch {}
    }
  }
  activeLoadedFaces.clear();
  lastFontSignature = null;
  lastFullSig = null;
}

let docCaptured = false;
let docHadDir = false;
let docOrigDir = null;
let docHadLang = false;
let docOrigLang = null;
let bodyHadDir = false;
let bodyOrigDir = null;

function captureOriginalDocState() {
  if (docCaptured) return;
  if (typeof document === "undefined") return;
  const doc = document.documentElement;
  if (!doc) return;
  docCaptured = true;
  docHadDir = doc.hasAttribute("dir");
  docOrigDir = docHadDir ? doc.getAttribute("dir") : null;
  docHadLang = doc.hasAttribute("lang");
  docOrigLang = docHadLang ? doc.getAttribute("lang") : null;
  if (document.body) {
    bodyHadDir = document.body.hasAttribute("dir");
    bodyOrigDir = bodyHadDir ? document.body.getAttribute("dir") : null;
  }
}

function ensureBodyCaptured() {
  if (bodyHadDir !== false && bodyOrigDir !== null) return;
  if (typeof document !== "undefined" && document.body) {
    bodyHadDir = document.body.hasAttribute("dir");
    bodyOrigDir = bodyHadDir ? document.body.getAttribute("dir") : null;
  }
}

function syncDocumentDirection(directionMode, active) {
  if (typeof document === "undefined" || !document.documentElement) return;
  captureOriginalDocState();
  ensureBodyCaptured();
  const doc = document.documentElement;
  const body = document.body;

  if (active && (directionMode === "rtl" || directionMode === "ltr")) {
    doc.setAttribute("data-rtlm-dir", directionMode);
    doc.setAttribute("dir", directionMode);

    if (directionMode === "rtl") {
      doc.setAttribute("lang", "fa");
    } else if (directionMode === "ltr") {
      doc.setAttribute("lang", "en");
    }

    if (body) {
      body.setAttribute("data-rtlm-dir", directionMode);
      body.setAttribute("dir", directionMode);
    }
  } else {
    // In "auto" mode, or when inactive:
    // Completely restore the web page's original UI structure and attributes!
    doc.removeAttribute("data-rtlm-dir");
    delete doc.dataset.rtlmDir;

    if (docHadDir && docOrigDir !== null) {
      doc.setAttribute("dir", docOrigDir);
    } else {
      doc.removeAttribute("dir");
    }

    if (docHadLang && docOrigLang !== null) {
      doc.setAttribute("lang", docOrigLang);
    } else {
      doc.removeAttribute("lang");
    }

    if (body) {
      body.removeAttribute("data-rtlm-dir");
      delete body.dataset.rtlmDir;
      if (bodyHadDir && bodyOrigDir !== null) {
        body.setAttribute("dir", bodyOrigDir);
      } else {
        body.removeAttribute("dir");
      }
    }
  }
}

async function loadFontFaces(settings) {
  const family = settings?.pageFont;
  if (!family || family === "default") {
    if (typeof document !== "undefined" && document.fonts) {
      for (const face of activeLoadedFaces) {
        try {
          document.fonts.delete(face);
        } catch {}
      }
    }
    activeLoadedFaces.clear();
    return "";
  }
  try {
    const res = await chrome.runtime.sendMessage({
      type: "rtlm:font:data",
      payload: { family },
    });
    const records = Array.isArray(res?.records) ? res.records : [];
    if (records.length === 0) {
      return "";
    }

    // 1. Web Font API (FontFace) directly in memory - immune to CSP font-src blocks
    if (typeof document !== "undefined" && document.fonts && typeof FontFace === "function") {
      const currentFaces = new Set();
      for (const record of records) {
        if (!record?.family || !record?.data) continue;
        try {
          const buffer = base64ToArrayBuffer(record.data);
          const weight = String(safeWeight(record.weight || 400));
          const face = new FontFace(record.family, buffer, {
            weight,
            style: "normal",
            display: "swap",
          });
          await face.load();
          document.fonts.add(face);
          currentFaces.add(face);
        } catch (err) {
          globalErrors.warn("FontFace load error", `Could not load face ${record.family} (${record.weight}): ${err?.message || err}`, {
            subsystem: SUBSYSTEMS.CONTENT,
            host: HOST,
          });
        }
      }
      for (const oldFace of activeLoadedFaces) {
        if (!currentFaces.has(oldFace)) {
          try {
            document.fonts.delete(oldFace);
          } catch {}
        }
      }
      activeLoadedFaces.clear();
      for (const f of currentFaces) activeLoadedFaces.add(f);

      if (currentFaces.size > 0) {
        globalErrors.info("Font active in DOM", `Loaded ${currentFaces.size} face(s) for "${family}" via FontFace API`, {
          subsystem: SUBSYSTEMS.CONTENT,
          host: HOST,
        });
      }
    }

    // 2. CSS @font-face fallback
    return records
      .map((record) => fontFaceRule(record))
      .filter(Boolean)
      .join("\n");
  } catch (err) {
    globalErrors.warn("Font loading IPC failed", `Could not request font ${family}: ${err?.message || err}`, {
      subsystem: SUBSYSTEMS.CONTENT,
      host: HOST,
    });
    return "";
  }
}

function sendReport() {
  try {
    chrome.runtime.sendMessage({
      type: "rtlm:report",
      payload: { host: HOST, stats: pendingStats, active: engineActive },
    });
  } catch {}
}

/*
 * Fault surfacing: the engine records recovered faults per unit; once a page
 * accumulates many, the user deserves a visible signal instead of silently
 * degraded coverage. One push per threshold crossing (state resets with each
 * engine rebuild) keeps a streaming page from flooding the worker.
 */
const FAULT_PUSH_THRESHOLD = 10;
let faultPushedAtLevel = 0;

function pushFaultNotice(force = false) {
  const count = engine ? engine.errors.length : 0;
  const level = Math.floor(count / FAULT_PUSH_THRESHOLD);
  if (!engine || level === 0 || (level === faultPushedAtLevel && !force)) return;
  faultPushedAtLevel = level;
  try {
    chrome.runtime.sendMessage({
      type: "rtlm:fault",
      payload: {
        host: HOST,
        count,
        kinds: engine.diagnostics().faultKinds || {},
      },
    });
  } catch {}
}

function report(stats) {
  pendingStats = stats || EMPTY_STATS;
  pushFaultNotice();
  if (reportTimer !== null) return;
  reportTimer = setTimeout(() => {
    reportTimer = null;
    sendReport();
  }, REPORT_DELAY_MS);
}

function reportNow(stats) {
  pendingStats = stats || EMPTY_STATS;
  if (reportTimer !== null) {
    clearTimeout(reportTimer);
    reportTimer = null;
  }
  sendReport();
}

function buildEngine(settings) {
  return new RtlEngine({
    root: document.body,
    settings,
    adapter: detectAdapter(HOST),
    report,
  });
}

function fontSignature(settings, enabled, customFamilies, customStamp = "") {
  return JSON.stringify([
    enabled,
    settings.master,
    settings.pageFont,
    settings.pageFontWeight,
    settings.pageFontSize,
    Array.isArray(customFamilies) ? [...customFamilies].sort() : [],
    String(customStamp),
  ]);
}

/**
 * Settings minus font keys — used to detect font-only changes.
 * fontScope is intentionally kept: switching between "RTL text" and "All
 * readable text" re-targets which page elements receive styling AND must
 * re-run the direction engine (the readable scope has to re-evaluate
 * otherwise-skipped containers), so it always takes the full rebuild path.
 */
function coreSettings(settings) {
  const { pageFont, pageFontWeight, pageFontSize, ...rest } = settings;
  return rest;
}

async function applyState(
  settings,
  enabled,
  customFamilies = [],
  customStamp = "",
  epoch = stateEpoch,
  force = false
) {
  if (epoch !== stateEpoch) return; // stopped while this apply was queued
  if (!document.body) {
    const onBodyReady = () => {
      if (document.body) {
        boot({ force });
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onBodyReady, { once: true });
    } else {
      setTimeout(onBodyReady, 50);
    }
    return;
  }
  const active = enabled && settings.master && Boolean(document.body);
  const fontSig = fontSignature(settings, active, customFamilies, customStamp);
  const fullSig = JSON.stringify({ settings: coreSettings(settings), enabled, active, customStamp });

  // Nothing changed at all → no-op. coreSettings() strips the font keys, so
  // a font-only change produces an identical fullSig; the font signature must
  // be part of this check or the fast path below would never be reached.
  // Explicit re-applies (force) skip this short-circuit: their whole purpose
  // is to re-walk a page whose DOM changed underneath a settled signature.
  if (!force && engine && active && fullSig === lastFullSig && fontSig === lastFontSignature) return;

  // Fast path: only the font keys changed → swap injected styles without
  // tearing down and re-scanning the page. Prevents the flicker/layout shift
  // previously seen when switching fonts or pressing "Re-apply".
  if (
    !force &&
    engine &&
    active &&
    fontSig !== lastFontSignature &&
    fontClassMode(engine.settings) === fontClassMode(settings) &&
    JSON.stringify(coreSettings(engine.settings)) === JSON.stringify(coreSettings(settings))
  ) {
    const faces = await loadFontFaces(settings);
    if (epoch !== stateEpoch) return;
    syncStyle(FONT_STYLE_ID, pageFontCss(settings, active));
    syncStyle(CUSTOM_FONT_STYLE_ID, faces);
    lastFontSignature = fontSig;
    lastFullSig = fullSig;
    return;
  }

  if (engine) {
    engine.stop();
    engine = null;
  }
  lastFontSignature = fontSig;
  lastFullSig = fullSig;

  const faces = await loadFontFaces(settings);
  if (epoch !== stateEpoch) return;

  syncStyle(FONT_STYLE_ID, pageFontCss(settings, active));
  syncStyle(CUSTOM_FONT_STYLE_ID, faces);
  syncDocumentDirection(settings.directionMode, active);

  if (active) {
    engine = buildEngine(settings);
    engineActive = true;
    faultPushedAtLevel = 0; // fresh engine → fresh fault budget
    engine.start();
    reportNow(engine.snapshot());

    // Proactive sweeps for heavy SPAs like Claude and DeepSeek during initial hydration
    const initSweeps = [150, 400, 800, 1500, 3000];
    for (const delay of initSweeps) {
      setTimeout(() => {
        if (engine && engineActive) {
          engine.rescanVisible();
          engine.rescan(true);
        }
      }, delay);
    }
  } else {
    engineActive = false;
    reportNow(EMPTY_STATS);
  }
}

async function boot({ force = false, payload: directPayload = null } = {}) {
  // Capture the epoch before any await: if a stop lands while we are fetching
  // state, this apply is stale and must not resurrect a stopped engine.
  const epoch = stateEpoch;
  let payload = directPayload;
  if (!payload) {
    try {
      payload = await chrome.runtime.sendMessage({
        type: "rtlm:get-content-state",
        payload: { host: HOST },
      });
    } catch (err) {
      globalErrors.captureException(err, { subsystem: SUBSYSTEMS.CONTENT, host: HOST, title: "boot fetch failed" });
    }
  }
  if (epoch !== stateEpoch) return;
  const settings = normalizeSettings(payload ? payload.settings : null);
  const enabled = payload ? payload.siteEnabled !== false : true;
  const customFamilies = payload?.customFamilies || [];
  const stamp = String(payload?.customStamp || "");
  try {
    await queueApply(() => {
      if (epoch !== stateEpoch) return;
      return applyState(settings, enabled, customFamilies, stamp, epoch, force);
    });
  } catch (err) {
    globalErrors.captureException(err, { subsystem: SUBSYSTEMS.CONTENT, host: HOST, title: "applyState queue failed" });
  }
}

if (typeof window !== "undefined" && window.__RTL_ATELIER_INITIALIZED__) {
  if (typeof window.__RTL_ATELIER_BOOT__ === "function") {
    window.__RTL_ATELIER_BOOT__(true);
  }
} else {
  if (typeof window !== "undefined") {
    window.__RTL_ATELIER_INITIALIZED__ = true;
    window.__RTL_ATELIER_BOOT__ = (force = false) => boot({ force });
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== "string" || !message.type.startsWith("rtlm:")) {
        return undefined;
      }
      switch (message.type) {
        case "rtlm:ping":
          sendResponse({ ok: true, active: engineActive, host: HOST });
          break;
        case "rtlm:apply":
          boot({ payload: message.payload });
          break;
        case "rtlm:navigate":
          checkUrlChange();
          onNavigate();
          break;
        case "rtlm:apply-force":
          // "Re-apply on this page": the engine may already be running with an
          // unchanged settings signature, so the idempotent fast path would
          // no-op. Force a full stop/start + rescan instead.
          boot({ force: true, payload: message.payload });
          break;
        case "rtlm:stop":
          stateEpoch += 1;
          if (engine) {
            engine.stop();
            engine = null;
          }
          engineActive = false;
          clearFontStyles();
          syncDocumentDirection("auto", false);
          reportNow(EMPTY_STATS);
          break;
        case "rtlm:refresh":
          if (engine) {
            engine.refresh();
            report(engine.snapshot());
          }
          break;
        case "rtlm:diagnostics": {
          let fontCheck = null;
          const fontName = engine?.settings?.pageFont || "default";
          if (typeof document !== "undefined" && document.fonts?.check && fontName !== "default") {
            try {
              fontCheck = document.fonts.check(`16px "${fontName}"`);
            } catch {}
          }
          let chatContainers = 0;
          if (typeof document !== "undefined" && document.querySelectorAll) {
            try {
              chatContainers = document.querySelectorAll(
                "[data-testid*='message'], [role='article'], .font-claude-message, .ds-markdown, .prose"
              ).length;
            } catch {}
          }
          sendResponse({
            diagnostics: engine ? engine.diagnostics() : null,
            host: HOST,
            url: typeof location !== "undefined" ? location.href : "",
            fontState: {
              activeFamily: fontName,
              loadedFacesCount: activeLoadedFaces.size,
              fontApiAvailable: typeof document !== "undefined" && Boolean(document.fonts),
              fontCheck,
              styleInjected: Boolean(document.getElementById(FONT_STYLE_ID)),
            },
            domState: {
              readyState: typeof document !== "undefined" ? document.readyState : "unknown",
              hasBody: typeof document !== "undefined" && Boolean(document.body),
              chatContainers,
            },
          });
          break;
        }
        case "rtlm:stats":
          sendResponse({
            stats: engine ? engine.snapshot() : null,
            faults: engine ? engine.errors.length : 0,
            faultKinds: engine ? engine.diagnostics().faultKinds : {},
          });
          break;
      }
      return undefined;
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }

    // Broadcasts (chrome.tabs.sendMessage) never wake a throttled or fully
    // backgrounded tab, so settings changed elsewhere used to leave this page
    // running stale settings until the next manual reload. The storage watch
    // fires in every tab regardless of visibility: any change to the settings
    // key is an authoritative trigger to re-fetch state and re-apply. Duplicate
    // work with a simultaneous rtlm:apply broadcast is harmless — the signature
    // check turns the second pass into a no-op.
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes.settings) return;
        boot();
      });
    }

    // Forward all content and engine errors to the background service worker log
    globalErrors.subscribe((entry) => {
      try {
        if (chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            type: "rtlm:log-error",
            payload: entry,
          }).catch(() => {});
        }
      } catch {}
    });

    // SPA route changes (DeepSeek, Claude, ChatGPT, etc.)
    let lastObservedUrl = typeof location !== "undefined" ? location.href : "";
    function checkUrlChange() {
      if (typeof location === "undefined") return;
      if (location.href !== lastObservedUrl) {
        lastObservedUrl = location.href;
        onNavigate();
      }
    }

    function onNavigate() {
      if (!engine || !engineActive) return;
      engine.refresh();
      const delays = [80, 200, 500, 1200, 2500];
      for (const delay of delays) {
        setTimeout(() => {
          if (engine && engineActive) {
            engine.rescanVisible();
            engine.rescan(true);
          }
        }, delay);
      }
      try {
        globalErrors.info("SPA route changed", `Navigated on ${HOST} to ${location.pathname || ""}`, {
          subsystem: SUBSYSTEMS.CONTENT,
          host: HOST,
        });
      } catch {}
    }

    // Virtualized Scroll Listener:
    // Claude and DeepSeek use custom scroll containers (overflow-y: auto)
    // where new chat items are mounted as the user scrolls. Scroll events
    // on nested elements do not bubble, but they ARE captured on window!
    let scrollThrottleTimer = null;
    let lastScrollScan = 0;

    function onPageScroll() {
      if (!engine || !engineActive) return;
      checkUrlChange();
      const now = Date.now();
      if (now - lastScrollScan > 80) {
        lastScrollScan = now;
        engine.rescanVisible();
      }
      if (scrollThrottleTimer !== null) clearTimeout(scrollThrottleTimer);
      scrollThrottleTimer = setTimeout(() => {
        scrollThrottleTimer = null;
        if (engine && engineActive) {
          engine.rescanVisible();
        }
      }, 120);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("scroll", onPageScroll, { passive: true, capture: true });
      window.addEventListener("wheel", onPageScroll, { passive: true, capture: true });
      window.addEventListener("popstate", onNavigate);
      window.addEventListener("hashchange", onNavigate);

      try {
        const origPushState = history.pushState;
        if (typeof origPushState === "function") {
          history.pushState = function (...args) {
            const ret = origPushState.apply(this, args);
            checkUrlChange();
            return ret;
          };
        }
        const origReplaceState = history.replaceState;
        if (typeof origReplaceState === "function") {
          history.replaceState = function (...args) {
            const ret = origReplaceState.apply(this, args);
            checkUrlChange();
            return ret;
          };
        }
      } catch {}

      // Active URL polling: guarantees route changes in SPAs using isolated pushState are detected
      setInterval(checkUrlChange, 250);
    }

    // Rescan on visibility recovery (e.g. background tab finishes streaming while hidden)
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && engine && engineActive) {
          checkUrlChange();
          engine.rescanVisible();
          engine.rescan(true);
        }
      });
    }
  }
}
