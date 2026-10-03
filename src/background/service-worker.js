import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  migrateRawSettings,
  normalizeSettings,
  normalizeHost,
  siteEnabled,
} from "../core/settings.js";
import {
  buildFontRecord,
  findRecordByName,
  sanitizeFileName,
  totalBytes,
  MAX_TOTAL_BYTES,
} from "../core/custom-fonts.js";
import { PRESET_HOSTS } from "../adapters/registry.js";
import { globalErrors, SUBSYSTEMS } from "../core/errors.js";
import { BUNDLED_FONTS, isBundledFont } from "../core/bundled-fonts.js";

const STATS = new Map();
const ACTIVE_SITES = new Map(); // host -> { host, stats, lastSeen }
const FAULTS = new Map(); // host -> { count, kinds, at }
const BADGE_COLOR = "#6d5df6";
const ACTIVE_SITES_TTL_MS = 30 * 60 * 1000;
const BUNDLED_FONT_CACHE = new Map();

async function loadBundledFontRecord(family, face) {
  const cacheKey = `${family}:${face.file}`;
  if (BUNDLED_FONT_CACHE.has(cacheKey)) {
    return BUNDLED_FONT_CACHE.get(cacheKey);
  }
  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return null;
    const url = chrome.runtime.getURL(`fonts/${face.file}`);
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    const data = btoa(binary);
    const record = {
      name: face.file,
      family,
      weight: face.weight,
      data,
      size: len,
      bundled: true,
    };
    BUNDLED_FONT_CACHE.set(cacheKey, record);
    return record;
  } catch (err) {
    globalErrors.warn("Bundled font fetch failed", `Could not read fonts/${face.file}: ${err?.message || err}`, {
      subsystem: SUBSYSTEMS.WORKER,
    });
    return null;
  }
}

let sessionRestored = false;

async function restoreSessionState() {
  if (sessionRestored) return;
  try {
    if (chrome.storage?.session) {
      const data = await chrome.storage.session.get({
        stats: {},
        activeSites: [],
        faults: {},
      });
      if (data.stats && typeof data.stats === "object") {
        for (const [id, s] of Object.entries(data.stats)) {
          STATS.set(Number(id), s);
        }
      }
      if (Array.isArray(data.activeSites)) {
        for (const site of data.activeSites) {
          if (site?.host) ACTIVE_SITES.set(site.host, site);
        }
      }
      if (data.faults && typeof data.faults === "object") {
        for (const [host, f] of Object.entries(data.faults)) {
          FAULTS.set(host, f);
        }
      }
      sessionRestored = true;
    }
  } catch {}
}

async function persistSessionState() {
  try {
    if (chrome.storage?.session) {
      const statsObj = {};
      for (const [id, s] of STATS) statsObj[id] = s;
      const faultsObj = {};
      for (const [host, f] of FAULTS) faultsObj[host] = f;
      await chrome.storage.session.set({
        stats: statsObj,
        activeSites: [...ACTIVE_SITES.values()],
        faults: faultsObj,
      });
    }
  } catch {}
}

// Restore session state on service worker wake-up
restoreSessionState();

async function loadRawState() {
  const data = await chrome.storage.local.get({ settings: null, schemaVersion: 0 });
  return data;
}

async function loadSettings() {
  const { settings: raw, schemaVersion } = await loadRawState();
  if (schemaVersion < SETTINGS_SCHEMA_VERSION) {
    const migrated = normalizeSettings(migrateRawSettings(raw));
    await chrome.storage.local.set({ settings: migrated, schemaVersion: SETTINGS_SCHEMA_VERSION });
    return migrated;
  }
  return normalizeSettings(raw);
}

async function saveSettings(settings) {
  const clean = normalizeSettings(settings);
  await chrome.storage.local.set({ settings: clean, schemaVersion: SETTINGS_SCHEMA_VERSION });
  return clean;
}

/* ---------------- custom fonts (virtual /fonts store) ---------------- */

async function loadCustomFonts() {
  const data = await chrome.storage.local.get({ customFonts: [] });
  return Array.isArray(data.customFonts) ? data.customFonts : [];
}

async function saveCustomFonts(records) {
  await chrome.storage.local.set({ customFonts: records });
  return records.map(({ name, family, weight, size, addedAt }) => ({
    name,
    family,
    weight,
    size,
    addedAt,
  }));
}

function fontSummaries(records) {
  return (Array.isArray(records) ? records : []).map(({ name, family, weight, size, addedAt }) => ({
    name,
    family,
    weight,
    size,
    addedAt,
  }));
}

async function addCustomFont(payload) {
  const action = payload?.action === "replace" || payload?.action === "skip" ? payload.action : "check";
  const record = buildFontRecord({ name: payload?.name, data: payload?.data, size: payload?.size });
  if (!record) return { ok: false, error: "invalid-font-file" };
  const existing = await loadCustomFonts();
  const duplicate = findRecordByName(existing, record.name);
  if (duplicate && action === "check") {
    return { ok: true, duplicate: true, existing: { name: duplicate.name, family: duplicate.family, weight: duplicate.weight, size: duplicate.size } };
  }
  if (duplicate && action === "skip") {
    return { ok: true, duplicate: false, skipped: true, fonts: fontSummaries(existing) };
  }
  const others = duplicate ? existing.filter((entry) => entry !== duplicate) : existing;
  if (totalBytes(others) + record.size > MAX_TOTAL_BYTES) {
    return { ok: false, error: "storage-limit" };
  }
  const next = [...others, record];
  return { ok: true, duplicate: false, replaced: Boolean(duplicate), fonts: await saveCustomFonts(next) };
}

async function broadcast(preloadedSettings = null) {
  const settings = preloadedSettings || (await loadSettings());
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (typeof tab.id !== "number" || !tab.url) continue;
    let host = "";
    try {
      host = new URL(tab.url).hostname;
    } catch {
      continue;
    }
    if (!host) continue;
    chrome.tabs
      .sendMessage(tab.id, {
        type: "rtlm:apply",
        payload: { settings, siteEnabled: siteEnabled(settings, host) },
      })
      .catch(() => {});
  }
  return settings;
}

function safe(fn) {
  try {
    const result = fn();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {}
}

function updateBadge(tabId, stats) {
  const edits = stats && Number.isFinite(stats.textEdits) ? stats.textEdits : 0;
  safe(() =>
    chrome.action.setBadgeText({
      tabId,
      text: edits > 0 ? String(Math.min(edits, 999)) : "",
    })
  );
  if (edits > 0) {
    safe(() => chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR }));
  }
}

function normalizeStats(raw) {
  if (!raw || typeof raw !== "object") return null;
  const toCount = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  return {
    paragraphs: toCount(raw.paragraphs),
    rtlBlocks: toCount(raw.rtlBlocks),
    textEdits: toCount(raw.textEdits),
    inputs: toCount(raw.inputs),
  };
}

function recordActiveSite(host, stats, active) {
  const key = normalizeHost(host);
  if (!key) return;
  if (!active) {
    // The page reported a disabled/idle state — it must not appear in the
    // "Active sites" dashboard, and any stale entry has to go.
    ACTIVE_SITES.delete(key);
    persistSessionState();
    return;
  }
  const existing = ACTIVE_SITES.get(key);
  ACTIVE_SITES.set(key, {
    host: key,
    stats: stats || existing?.stats || { paragraphs: 0, rtlBlocks: 0, textEdits: 0, inputs: 0 },
    lastSeen: Date.now(),
    firstSeen: existing?.firstSeen || Date.now(),
  });
  persistSessionState();
}

function activeSitesSnapshot() {
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of ACTIVE_SITES) {
    if (now - entry.lastSeen > ACTIVE_SITES_TTL_MS) {
      ACTIVE_SITES.delete(key);
      FAULTS.delete(key);
      changed = true;
    }
  }
  for (const [key, fault] of FAULTS) {
    if (now - fault.at > ACTIVE_SITES_TTL_MS) {
      FAULTS.delete(key);
      changed = true;
    }
  }
  if (changed) persistSessionState();
  return [...ACTIVE_SITES.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map((entry) => {
      const fault = FAULTS.get(entry.host);
      return fault
        ? { ...entry, faults: fault.count, faultKinds: fault.kinds }
        : entry;
    });
}

async function ensureContentScript(tabId) {
  if (typeof tabId !== "number") return false;
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "rtlm:ping" });
    if (ping?.ok) return true;
  } catch {}
  try {
    if (chrome.scripting) {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["src/content/inject.css", "dist/fonts.css"],
      }).catch(() => {});
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["dist/content.bundle.js"],
      });
      return true;
    }
  } catch (err) {
    globalErrors.captureException(err, { subsystem: SUBSYSTEMS.WORKER, title: "ensureContentScript failed" });
  }
  return false;
}

async function reapplyToTab(tabId) {
  if (typeof tabId !== "number") return { ok: false, reason: "no-tab" };
  const settings = await loadSettings();
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return { ok: false, reason: "no-tab" };
    let host = "";
    try {
      if (tab.url) host = new URL(tab.url).hostname;
    } catch {}

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "rtlm:apply-force",
        payload: { settings, siteEnabled: siteEnabled(settings, host) },
      });
      return { ok: true };
    } catch {
      // Content script may not be loaded yet (e.g. pre-existing tab). Try injecting!
      const injected = await ensureContentScript(tabId);
      if (injected) {
        await new Promise((r) => setTimeout(r, 60));
        await chrome.tabs.sendMessage(tabId, {
          type: "rtlm:apply-force",
          payload: { settings, siteEnabled: siteEnabled(settings, host) },
        });
        return { ok: true };
      }
      throw new Error("Could not reach tab content script");
    }
  } catch (error) {
    globalErrors.captureException(error, { subsystem: SUBSYSTEMS.WORKER, title: "reapplyToTab failed" });
    return { ok: false, reason: "unreachable", error: String(error) };
  }
}

async function toggleSite(hostRaw) {
  const host = normalizeHost(hostRaw);
  if (!host) return null;
  const settings = await loadSettings();
  // Flip the EFFECTIVE state, not the stored override: with no entry a
  // non-preset host in "targeted" mode is off, and the old
  // `current?.enabled === false` expression wrote {enabled:false} for it —
  // clicking "on" pinned the site OFF permanently, even in "everywhere".
  const next = !siteEnabled(settings, host);
  settings.overrides[host] = { enabled: next };
  const saved = await saveSettings(settings);
  await broadcast(saved);
  return saved;
}

async function toggleMaster() {
  const settings = await loadSettings();
  settings.master = !settings.master;
  const saved = await saveSettings(settings);
  await broadcast(saved);
  return saved;
}

chrome.runtime.onInstalled.addListener(async () => {
  await restoreSessionState();
  const { settings } = await chrome.storage.local.get({ settings: null });
  if (!settings) await saveSettings(DEFAULT_SETTINGS);

  // Automatically inject content scripts into open HTTP/HTTPS tabs so existing chat tabs activate immediately without manual refresh
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      safe(async () => {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["src/content/inject.css", "dist/fonts.css"],
        }).catch(() => {});
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["dist/content.bundle.js"],
        }).catch(() => {});
      });
    }
  } catch {}
});

if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(async () => {
    await restoreSessionState();
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  STATS.delete(tabId);
  persistSessionState();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string" || !message.type.startsWith("rtlm:")) {
    return false;
  }

  (async () => {
    switch (message.type) {
      case "rtlm:get-content-state": {
        const settings = await loadSettings();
        let host = "";
        try {
          host = message.payload?.host || (sender.tab?.url ? new URL(sender.tab.url).hostname : "");
        } catch {}
        const customFonts = await loadCustomFonts();
        sendResponse({
          settings,
          siteEnabled: siteEnabled(settings, host),
          customFamilies: [...new Set(customFonts.map((record) => record.family))],
          // Fingerprint that changes whenever a file is (re)placed, even at
          // identical byte size — count+total missed same-size replacements
          // and left pages serving a stale face until browser restart.
          customStamp: customFonts
            .map((record) => `${record.name}:${record.size}:${record.addedAt || 0}`)
            .join("|"),
        });
        break;
      }
      case "rtlm:activate-site": {
        const hostRaw = message.payload?.host;
        const tabId = message.payload?.tabId;
        const host = normalizeHost(hostRaw);
        if (!host) {
          sendResponse({ ok: false, error: "invalid-host" });
          break;
        }
        const settings = await loadSettings();
        settings.overrides[host] = { enabled: true };
        const saved = await saveSettings(settings);

        if (typeof tabId === "number") {
          await ensureContentScript(tabId);
          await chrome.tabs.sendMessage(tabId, {
            type: "rtlm:apply-force",
            payload: { settings: saved, siteEnabled: true },
          }).catch(() => {});
        }
        await broadcast(saved);
        sendResponse({ ok: true, settings: saved });
        break;
      }
      case "rtlm:get-errors": {
        sendResponse({ entries: globalErrors.getEntries(), summary: globalErrors.summary() });
        break;
      }
      case "rtlm:clear-errors": {
        globalErrors.clear();
        sendResponse({ ok: true });
        break;
      }
      case "rtlm:log-error": {
        const entry = globalErrors.record(message.payload || {});
        sendResponse({ ok: true, entry });
        break;
      }
      case "rtlm:get-all": {
        const settings = await loadSettings();
        let tab = null;
        const tabId = message.payload?.tabId;
        if (typeof tabId === "number") {
          try {
            const entry = await chrome.tabs.get(tabId);
            tab = {
              id: entry.id,
              url: entry.url,
              host: normalizeHost(new URL(entry.url).hostname),
              stats: STATS.get(entry.id) || null,
            };
          } catch {}
        }
        sendResponse({ settings, tab });
        break;
      }
      case "rtlm:set-settings": {
        const base = await loadSettings();
        const next = await saveSettings({ ...base, ...message.payload });
        await broadcast(next);
        sendResponse({ settings: next });
        break;
      }
      case "rtlm:toggle-site": {
        // toggleSite() already broadcasts to all tabs; broadcasting again
        // would double-apply on every open page.
        const settings = await toggleSite(message.payload?.host);
        sendResponse({ settings });
        break;
      }
      case "rtlm:toggle-master": {
        // Same as above: toggleMaster() broadcasts once internally.
        const settings = await toggleMaster();
        sendResponse({ settings });
        break;
      }
      case "rtlm:reapply": {
        const result = await reapplyToTab(message.payload?.tabId);
        sendResponse(result);
        break;
      }
      case "rtlm:reset": {
        const settings = await saveSettings({ ...DEFAULT_SETTINGS });
        await broadcast(settings);
        sendResponse({ settings });
        break;
      }
      case "rtlm:report": {
        const tabId = sender.tab?.id;
        const stats = normalizeStats(message.payload?.stats);
        if (typeof tabId === "number") {
          STATS.set(tabId, stats);
          updateBadge(tabId, stats);
          // Push to extension pages (popup) for real-time monitoring.
          safe(() =>
            chrome.runtime.sendMessage({
              type: "rtlm:stats-changed",
              payload: { tabId, host: normalizeHost(message.payload?.host), stats },
            })
          );
        }
        recordActiveSite(
          message.payload?.host,
          stats,
          message.payload?.active === true && Boolean(stats)
        );
        persistSessionState();
        sendResponse({ ok: true });
        break;
      }
      case "rtlm:get-active-sites": {
        sendResponse({ sites: activeSitesSnapshot() });
        break;
      }
      case "rtlm:fault": {
        // Content scripts report fault-threshold crossings so the popup can
        // warn the user instead of silently degraded coverage.
        const host = normalizeHost(message.payload?.host);
        const count = Math.max(0, Math.floor(Number(message.payload?.count) || 0));
        if (host && count > 0) {
          const fault = { count, kinds: message.payload?.kinds || {}, at: Date.now() };
          FAULTS.set(host, fault);
          persistSessionState();
          safe(() =>
            chrome.runtime.sendMessage({
              type: "rtlm:fault-changed",
              payload: { host, count, kinds: fault.kinds },
            })
          );
        }
        sendResponse({ ok: true });
        break;
      }
      case "rtlm:reset-stats": {
        // Only the requesting tab's counters may be cleared; wiping the whole
        // STATS map left every other tab's badge showing stale numbers that
        // no longer matched its stored stats.
        const tabId = typeof message.payload?.tabId === "number" ? message.payload.tabId : null;
        if (tabId !== null) {
          STATS.delete(tabId);
          safe(() => chrome.action.setBadgeText({ tabId, text: "" }));
        } else {
          STATS.clear();
        }
        persistSessionState();
        sendResponse({ ok: true });
        break;
      }
      case "rtlm:custom-fonts:list": {
        sendResponse({ fonts: fontSummaries(await loadCustomFonts()) });
        break;
      }
      case "rtlm:get-presets": {
        sendResponse({ hosts: PRESET_HOSTS });
        break;
      }
      case "rtlm:custom-fonts:add": {
        try {
          const result = await addCustomFont(message.payload);
          // Skip the tab-wide broadcast when storage did not actually change.
          if (result.ok && result.fonts && !result.skipped) await broadcast(await loadSettings());
          sendResponse(result);
        } catch (error) {
          sendResponse({ ok: false, error: String(error) });
        }
        break;
      }
      case "rtlm:custom-fonts:remove": {
        const name = sanitizeFileName(message.payload?.name);
        const existing = await loadCustomFonts();
        const next = existing.filter((record) => record.name !== name);
        const changed = next.length !== existing.length;
        if (changed) {
          await chrome.storage.local.set({ customFonts: next });
          await broadcast(await loadSettings());
        }
        sendResponse({ ok: true, fonts: fontSummaries(next) });
        break;
      }
      case "rtlm:font:data":
      case "rtlm:custom-fonts:data": {
        // Content scripts request bytes for the family in use — whether custom or bundled.
        const wanted = String(message.payload?.family || "");
        if (!wanted || wanted === "default") {
          sendResponse({ records: [] });
          break;
        }
        // 1. Custom user-uploaded fonts
        const customRecords = await loadCustomFonts();
        const customMatches = customRecords.filter((record) => record.family === wanted);
        if (customMatches.length > 0) {
          sendResponse({ records: customMatches, source: "custom" });
          break;
        }
        // 2. Bundled fonts (read binary and return base64 for CSP-immune in-memory FontFace)
        if (isBundledFont(wanted)) {
          const faces = BUNDLED_FONTS[wanted] || [];
          const records = [];
          for (const face of faces) {
            const rec = await loadBundledFontRecord(wanted, face);
            if (rec) records.push(rec);
          }
          sendResponse({ records, source: "bundled" });
          break;
        }
        sendResponse({ records: [], notFound: true });
        break;
      }
      default:
        sendResponse({ ok: false });
    }
  })().catch((error) => {
    try {
      sendResponse({ ok: false, error: String(error) });
    } catch {}
  });

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-master") {
    await toggleMaster();
    return;
  }
  if (command === "toggle-site") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    try {
      await toggleSite(new URL(tab.url).hostname);
    } catch {}
  }
});

if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === "complete") {
      chrome.tabs.sendMessage(tabId, {
        type: "rtlm:navigate",
        payload: { url: tab?.url },
      }).catch(() => {});
    }
  });
}
