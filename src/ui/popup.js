import { transformText } from "../core/typography.js";
import { resolveDirectionSmart, looksPersian } from "../core/analyzer.js";
import { normalizeSettings, normalizeHost } from "../core/settings.js";
import {
  FONT_EXTENSIONS,
  MAX_FILE_BYTES,
  encodeBase64,
  findRecordByName,
} from "../core/custom-fonts.js";
import { isPresetHost, PRESET_HOSTS } from "../adapters/registry.js";
import {
  familiesForPicker,
  resolveStoredWeight,
  weightOptionsForFamily,
  weightsForFamily,
} from "../core/font-options.js";
import { applyI18n, t, lang, exists, isRtlLang } from "./i18n.js";
import { globalErrors, SUBSYSTEMS } from "../core/errors.js";

const FEATURE_KEYS = [
  "normalizeChars",
  "zwnj",
  "punctuation",
  "whitespace",
  "alignRtl",
  "keepCenter",
  "smartRuns",
  "mostlyRtl",
  "forceCodeLtr",
  "autoDirInputs",
  "processEditable",
];

const SAMPLE =
  "سلام! RTL Atelier متن هاي فارسي را    هوشمندانه تميز مي كند - even when English appears inside, مثل همين جمله.";

const THEME_GLYPH = { auto: "◐", light: "☀", dark: "☾" };
const UI_FONT_FALLBACKS = '"Vazirmatn", "Vazir", "Segoe UI", system-ui, sans-serif';
const PAGE_FONT_FALLBACKS = '"Vazir", "Vazirmatn", Tahoma, sans-serif';

let state = {
  settings: normalizeSettings(null),
  tab: null,
};

let fontFamilies = [];
let fontFaces = {};
let customFonts = []; // [{name, family, weight, size}]
let activeSites = [];
let siteFaults = null; // { count, kinds } for the active tab's content script
let renderedLang = null;
let activeView = "site";
const presetHostList = PRESET_HOSTS;

function $(selector) {
  return document.querySelector(selector);
}

async function rpc(type, payload) {
  try {
    return await chrome.runtime.sendMessage({ type, payload });
  } catch {
    return null;
  }
}

const NOTIF_ICONS = {
  success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

function showNotification(message, tone = "info", duration = 3200) {
  const container = $("#toast-container");
  if (!container) {
    const elx = $("#toast");
    if (elx) {
      elx.textContent = message;
      elx.hidden = false;
      setTimeout(() => { elx.hidden = true; }, duration);
    }
    return;
  }
  const item = document.createElement("div");
  item.className = `toast-item toast-${tone}`;

  const iconSpan = document.createElement("span");
  iconSpan.className = "toast-icon";
  iconSpan.innerHTML = NOTIF_ICONS[tone] || NOTIF_ICONS.info;

  const msgSpan = document.createElement("span");
  msgSpan.className = "toast-msg";
  msgSpan.textContent = message;

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";

  item.append(iconSpan, msgSpan, closeBtn);
  container.appendChild(item);

  let timer = setTimeout(() => dismiss(), duration);

  function dismiss() {
    clearTimeout(timer);
    item.style.opacity = "0";
    item.style.transform = "translateY(8px) scale(0.95)";
    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 200);
  }

  closeBtn.addEventListener("click", dismiss);
  item.addEventListener("mouseenter", () => clearTimeout(timer));
  item.addEventListener("mouseleave", () => {
    timer = setTimeout(() => dismiss(), 1500);
  });
}

function toast(message, tone = "info") {
  showNotification(message, tone);
}

function quoteFamily(family) {
  return `"${String(family).replace(/[\\"]/g, "\\$&")}"`;
}

function fontFamilyValue(family, fallbacks) {
  return `${quoteFamily(family)}, ${fallbacks}`;
}

/* ================= view switching ================= */

function switchView(view) {
  activeView = view;
  for (const tab of document.querySelectorAll("#app-nav-tabs .tab")) {
    const selected = tab.dataset.view === view;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  for (const section of document.querySelectorAll(".view")) {
    section.hidden = section.id !== `view-${view}`;
  }
  if (view === "sites") loadActiveSites();
}

/* ================= theme ================= */

function resolvedTheme(theme) {
  if (theme === "light" || theme === "dark") return theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = resolvedTheme(theme);
  const icon = $("#theme-icon");
  if (icon) icon.textContent = THEME_GLYPH[themeMode(theme)] || "◐";
}

function themeMode(theme) {
  return ["auto", "light", "dark"].includes(theme) ? theme : "auto";
}

/**
 * Settings changes render optimistically: local state updates and the panel
 * repaints immediately, then the persisted truth reconciles on response.
 */
async function persist(patch, { silentRender = false } = {}) {
  state.settings = normalizeSettings({ ...state.settings, ...patch });
  if (!silentRender) renderAll();
  const response = await rpc("rtlm:set-settings", patch);
  if (response && response.settings) {
    state.settings = normalizeSettings(response.settings);
    if (!silentRender) renderAll();
  }
}

/* ================= generic builders ================= */

function makeSwitch(label) {
  const sw = document.createElement("button");
  sw.className = "switch";
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", "false");
  if (label) sw.setAttribute("aria-label", label);
  const knob = document.createElement("span");
  knob.className = "switch-knob";
  knob.setAttribute("aria-hidden", "true");
  sw.appendChild(knob);
  return sw;
}

function buildFeatureRows() {
  const list = $("#feature-list");
  list.textContent = "";
  for (const key of FEATURE_KEYS) {
    const row = document.createElement("div");
    row.className = "feature-row";
    row.dataset.feature = key;

    const copy = document.createElement("div");
    copy.className = "feature-copy";
    const label = document.createElement("span");
    label.className = "feature-label";
    label.textContent = t(`feature.${key}.label`);
    const desc = document.createElement("span");
    desc.className = "feature-desc";
    desc.textContent = t(`feature.${key}.desc`);
    copy.append(label, desc);

    const sw = makeSwitch(t(`feature.${key}.label`));
    sw.addEventListener("click", () => {
      persist({ [key]: !state.settings[key] });
    });

    row.append(copy, sw);
    list.appendChild(row);
  }
}

function syncFeatureRows() {
  for (const row of document.querySelectorAll("[data-feature]")) {
    const sw = row.querySelector(".switch");
    if (sw) sw.setAttribute("aria-checked", String(state.settings[row.dataset.feature] === true));
  }
  for (const item of document.querySelectorAll("#digits-segment .segmented-item")) {
    item.setAttribute("aria-checked", String(item.dataset.value === state.settings.digits));
  }
  for (const item of document.querySelectorAll("#theme-segment .segmented-item")) {
    item.setAttribute("aria-checked", String(item.dataset.value === state.settings.theme));
  }
  const scope = state.settings.fontScope === "readable" ? "readable" : "rtl";
  for (const item of document.querySelectorAll("#scope-segment .segmented-item")) {
    item.setAttribute("aria-checked", String(item.dataset.value === scope));
  }
  const dirMode = state.settings.directionMode || "auto";
  for (const item of document.querySelectorAll("#direction-segment .segmented-item")) {
    item.setAttribute("aria-checked", String(item.dataset.value === dirMode));
  }
  const uiDir = state.settings.uiDirection || "auto";
  for (const item of document.querySelectorAll("#ui-direction-segment .segmented-item")) {
    item.setAttribute("aria-checked", String(item.dataset.value === uiDir));
  }
}

/* ================= site view ================= */

function siteEnabledOn(host) {
  if (!host || !state.settings.master) return false;
  const entry = state.settings.overrides[host];
  if (entry?.enabled === false) return false;
  if (state.settings.activationMode !== "everywhere") {
    return Boolean(isPresetHost(host) || entry?.enabled === true);
  }
  return true;
}

let isActivating = false;

/**
 * Full status model for the dashboard pill: distinguishes "running" from
 * "enabled but idle" and names the exact blocker when inactive.
 */
function siteStatus() {
  const host = state.tab?.host || "";
  if (!host) return { tone: "idle", key: "", cta: false };
  if (!state.settings.master) return { tone: "blocked", key: "status.off", cta: false };
  const entry = state.settings.overrides[host];
  if (entry?.enabled === false) return { tone: "blocked", key: "status.disabled", cta: false };
  const activated = siteEnabledOn(host);
  if (!activated && state.settings.activationMode !== "everywhere" && !isPresetHost(host)) {
    return { tone: "idle", key: "status.whitelist", cta: true };
  }
  if (!activated) return { tone: "blocked", key: "status.disabled", cta: false };
  if (isActivating) return { tone: "running", key: "status.activating", cta: false };

  const mode = state.settings.directionMode || "auto";
  if (mode === "rtl") {
    return { tone: "running", key: "status.runningRtl", cta: false };
  }
  if (mode === "ltr") {
    return { tone: "running", key: "status.runningLtr", cta: false };
  }

  const stats = state.tab?.stats;
  const hasActivity =
    stats && (stats.paragraphs > 0 || stats.textEdits > 0 || stats.inputs > 0);
  return hasActivity
    ? { tone: "running", key: "status.running", cta: false }
    : { tone: "running", key: "status.monitoring", cta: false };
}

function renderSite() {
  const tab = state.tab;
  const host = tab?.host || "";
  $("#site-host").textContent = host || t("site.noPage");

  const status = siteStatus();
  const pill = $("#status-pill");
  pill.dataset.tone = status.tone;
  pill.textContent = status.key ? t(status.key) : "—";
  pill.hidden = !status.key;

  $("#site-switch").setAttribute(
    "aria-checked",
    String(Boolean(host) && siteEnabledOn(host))
  );
  $("#master-switch").setAttribute("aria-checked", String(state.settings.master === true));

  const activateBtn = $("#activate-cta");
  if (activateBtn) {
    if (isActivating) {
      activateBtn.hidden = false;
      activateBtn.disabled = true;
      activateBtn.textContent = t("status.activating");
    } else {
      activateBtn.hidden = !status.cta;
      activateBtn.disabled = false;
      activateBtn.textContent = t("action.activateHere");
    }
  }

  let hintKey = "";
  if (host && !state.settings.master) hintKey = "hint.masterOff";
  else if (host && status.cta) hintKey = "hint.notWhitelisted";
  else if (host && !siteEnabledOn(host)) hintKey = "hint.disabled";
  $("#site-hint").textContent = hintKey ? t(hintKey) : "";

  renderFaultBanner();
  renderFavicon();

  const adapterBadge = $("#site-adapter-badge");
  if (adapterBadge) {
    if (host.includes("claude.ai")) adapterBadge.textContent = "Claude Smart Adapter";
    else if (host.includes("deepseek.com")) adapterBadge.textContent = "DeepSeek Stream Engine";
    else if (host.includes("chatgpt.com") || host.includes("openai.com")) adapterBadge.textContent = "ChatGPT BiDi Adapter";
    else if (host.includes("github.com")) adapterBadge.textContent = "GitHub Markdown Engine";
    else if (host.includes("x.com") || host.includes("twitter.com")) adapterBadge.textContent = "X/Twitter Dynamic BiDi";
    else if (host.includes("wikipedia.org")) adapterBadge.textContent = "Wikipedia Multilingual";
    else adapterBadge.textContent = "Universal BiDi Engine";
  }

  const activeFontName = $("#site-active-font-name");
  if (activeFontName) {
    const fam = state.settings.pageFont || "Vazirmatn";
    activeFontName.textContent = `Font: ${fam}`;
  }
}

/**
 * User-facing failure signal: the engine recovers faults silently, but once
 * a page accumulates enough of them the user must learn that coverage is
 * degraded — with the dominant fault kinds named in plain language.
 */
function renderFaultBanner() {
  const banner = $("#fault-banner");
  if (!banner) return;
  const count = Number(siteFaults?.count) || 0;
  if (!count) {
    banner.hidden = true;
    banner.textContent = "";
    return;
  }
  banner.textContent = t("fault.title", { count: String(count) });
  banner.hidden = false;
}

function renderFavicon() {
  const well = $("#favicon-well");
  const img = $("#site-favicon");
  const url = state.tab && typeof state.tab.url === "string" ? state.tab.url : "";
  if (!url || typeof chrome?.runtime?.getURL !== "function") {
    well.hidden = true;
    img.removeAttribute("src");
    return;
  }
  img.onload = () => {
    well.hidden = false;
  };
  img.onerror = () => {
    // Unavailable icons vanish entirely — no broken-image placeholder.
    well.hidden = true;
    img.removeAttribute("src");
  };
  img.src = `${chrome.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(url)}&size=32`;
}

const STAT_BARS = { paragraphs: 60, edits: 200, inputs: 20 };
const statAnimations = new Map();

/** Animate numeric changes so live updates are visible, not jumpy. */
function countUp(el, to) {
  const from = Number(el.textContent) || 0;
  if (from === to) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || to < from) {
    el.textContent = String(to);
    return;
  }
  const previous = statAnimations.get(el);
  if (previous) cancelAnimationFrame(previous);
  const start = performance.now();
  const duration = 420;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) statAnimations.set(el, requestAnimationFrame(step));
    else statAnimations.delete(el);
  };
  statAnimations.set(el, requestAnimationFrame(step));
}

function renderStats() {
  const stats = state.tab && state.tab.stats ? state.tab.stats : null;
  // stats === null means no report has ever arrived for this tab (page still
  // loading, script blocked, or extension just installed). That is genuinely
  // "information unavailable" — display it as such instead of a false zero.
  const unavailable = !stats;
  const values = {
    paragraphs: unavailable ? null : stats.paragraphs || 0,
    edits: unavailable ? null : stats.textEdits || 0,
    inputs: unavailable ? null : stats.inputs || 0,
  };
  for (const [key, value] of Object.entries(values)) {
    const el = $(`#stat-${key}`);
    if (value === null) {
      const pending = statAnimations.get(el);
      if (pending) cancelAnimationFrame(pending);
      statAnimations.delete(el);
      el.textContent = "—";
      el.title = t("status.noData");
    } else {
      el.removeAttribute("title");
      countUp(el, value);
    }
    const bar = document.querySelector(`.stat[data-stat="${key}"] .bar b`);
    if (bar) bar.style.width = value ? `${Math.min(100, Math.round((value / STAT_BARS[key]) * 100))}%` : "0%";
  }
  renderCoverageRing(stats);
}

/**
 * RTL coverage meter: the share of detected paragraphs that are actually
 * right-to-left. A distinctive at-a-glance signal no competitor shows.
 *
 * Prefer the LIVE tab's own stats when the site card being rendered is the
 * active tab: the active-sites registry is fed by content-script reports and
 * lags behind (report debounce, throttled tabs), which previously pinned the
 * ring at 0% for freshly activated sites until an unrelated report arrived.
 */
function renderCoverageRing(stats) {
  const ring = $("#coverage-ring");
  if (!ring) return;
  const paragraphs = Number(stats?.paragraphs) || 0;
  const rtl = Number(stats?.rtlBlocks) || 0;
  const hasData = paragraphs > 0;
  const pct = hasData ? Math.round((rtl / paragraphs) * 100) : 0;
  ring.style.setProperty("--pct", String(pct));
  ring.dataset.empty = String(!hasData);
  $("#coverage-value").textContent = hasData ? `${pct}%` : "—";
  ring.setAttribute("aria-valuenow", String(pct));
}

let lastDiagTelemetry = null;

async function refreshDiagnosticsCenter() {
  await updateHealthStatus();
  renderErrorsModal();

  const out = $("#diagnostics-live-view");
  if (!out) return;
  out.textContent = "…";

  // Synchronize modal chip with header health chip
  const modalChip = $("#diag-modal-health-chip");
  const modalText = $("#diag-modal-health-text");
  const headerChip = $("#health-chip");
  const headerText = $("#health-text");
  if (modalChip && headerChip) {
    modalChip.dataset.status = headerChip.dataset.status || "healthy";
    if (modalText && headerText) modalText.textContent = headerText.textContent;
  }

  if (!state.tab || typeof state.tab.id !== "number") {
    out.textContent = "";
    const card = document.createElement("div");
    card.className = "diag-status-card";
    card.textContent = t("toast.openPage");
    out.appendChild(card);
    return;
  }

  try {
    const res = await chrome.tabs.sendMessage(state.tab.id, { type: "rtlm:diagnostics" });
    const d = res?.diagnostics;
    lastDiagTelemetry = {
      diagnostics: d,
      fontState: res?.fontState,
      domState: res?.domState,
      host: state.tab.host,
      url: state.tab.url,
      settings: state.settings,
      timestamp: new Date().toISOString(),
      errors: currentErrors,
    };

    if (!d) {
      let reason = t("diag.inactive");
      if (!state.settings.master) {
        reason = lang() === "fa"
          ? "افزونه به صورت سراسری غیرفعال است (Master Switch خاموش است)."
          : "Extension is turned off globally (Master switch is OFF).";
      } else if (!siteEnabledOn(state.tab.host)) {
        reason = lang() === "fa"
          ? "این سایت در تنظیمات غیرفعال است. برای فعال‌سازی، کلید سایت را روشن کنید."
          : "This site is disabled in settings. Toggle the switch above to activate.";
      }
      out.textContent = "";
      const card = document.createElement("div");
      card.className = "diag-status-card";
      const head = document.createElement("div");
      head.className = "diag-status-head";
      const pill = document.createElement("span");
      pill.className = "diag-status-pill";
      pill.dataset.status = "inactive";
      pill.textContent = t("diag.state.inactive");
      head.appendChild(pill);
      const text = document.createElement("div");
      text.className = "diag-status-text";
      text.textContent = reason;
      card.append(head, text);
      out.appendChild(card);
      return;
    }

    out.textContent = "";

    // 1. Status banner
    const statusCard = document.createElement("div");
    statusCard.className = "diag-status-card";

    const head = document.createElement("div");
    head.className = "diag-status-head";

    const pill = document.createElement("span");
    pill.className = "diag-status-pill";
    pill.dataset.status = d.status || "active";
    const statusKey = `diag.state.${d.status || "active"}`;
    pill.textContent = exists(statusKey) ? t(statusKey) : (d.status || "Active");

    const hostTag = document.createElement("span");
    hostTag.className = "active-site-meta";
    hostTag.textContent = `${state.tab.host || d.adapterId} (${d.adapterId})`;

    head.append(pill, hostTag);

    const text = document.createElement("div");
    text.className = "diag-status-text";
    text.textContent = d.reasonText || t("status.running");

    statusCard.append(head, text);
    out.appendChild(statusCard);

    // 2. Metrics Grid
    const grid = document.createElement("div");
    grid.className = "diag-grid";

    const cards = [
      {
        title: t("diag.units"),
        val: `${d.paragraphs}`,
        sub: `${d.rtlBlocks} RTL (${d.coveragePct}%)`,
      },
      {
        title: t("directionMode.label"),
        val: d.directionMode?.toUpperCase() || "AUTO",
        sub: d.directionMode === "rtl" ? t("diag.modeRtlDesc") : d.directionMode === "ltr" ? t("diag.modeLtrDesc") : t("diag.modeAutoDesc"),
      },
      {
        title: t("diag.containersFound"),
        val: `${res.domState?.chatContainers || d.adapterMatched || 0}`,
        sub: t("diag.virtualScrollActive"),
      },
      {
        title: t("diag.queueState"),
        val: d.queueSize > 0 ? `${d.queueSize}` : "0",
        sub: d.queueSize > 0 ? t("diag.queueItems", { n: d.queueSize }) : t("diag.queueClean"),
      },
    ];

    for (const item of cards) {
      const card = document.createElement("div");
      card.className = "diag-card";
      const cardTitle = document.createElement("div");
      cardTitle.className = "diag-card-title";
      cardTitle.textContent = item.title;
      const cardVal = document.createElement("div");
      cardVal.className = "diag-card-val";
      cardVal.textContent = item.val;
      const cardSub = document.createElement("div");
      cardSub.className = "diag-card-sub";
      cardSub.textContent = item.sub;
      card.append(cardTitle, cardVal, cardSub);
      grid.appendChild(card);
    }
    out.appendChild(grid);

    // 3. Font & CSP status box
    const fontBox = document.createElement("div");
    fontBox.className = "diag-font-box";

    const fontBoxHead = document.createElement("div");
    fontBoxHead.className = "diag-font-box-head";

    const fontBoxTitle = document.createElement("span");
    fontBoxTitle.className = "diag-font-box-title";
    fontBoxTitle.textContent = t("diag.fontStatus");

    const fontBadge = document.createElement("span");
    const isFontLoaded = res.fontState?.loadedFacesCount > 0;
    fontBadge.className = `diag-font-box-badge ${isFontLoaded ? "badge-ok" : "badge-pending"}`;
    fontBadge.textContent = isFontLoaded ? t("diag.fontActive") : (d.pageFont === "default" ? t("diag.fontSiteDefault") : t("diag.fontPending"));

    fontBoxHead.append(fontBoxTitle, fontBadge);

    const fontBoxDesc = document.createElement("div");
    fontBoxDesc.className = "diag-font-box-desc";
    const familyLabel = d.pageFont === "default" ? t("font.default") : d.pageFont;
    const fontStateDesc = isFontLoaded
      ? `${familyLabel} (${d.pageFontWeight || "auto"}, ${d.pageFontSize || 100}%) — ${t("diag.fontLoaded")}`
      : `${familyLabel} — ${d.pageFont === "default" ? t("diag.fontDefault") : t("diag.fontNotLoaded")}`;
    fontBoxDesc.textContent = fontStateDesc;

    fontBox.append(fontBoxHead, fontBoxDesc);
    out.appendChild(fontBox);

    // 4. Troubleshooting recommendations
    const troubleshoot = Array.isArray(d.troubleshooting) ? d.troubleshooting : [];
    const tsBox = document.createElement("div");
    tsBox.className = "diag-troubleshoot";

    const tsTitle = document.createElement("div");
    tsTitle.className = "diag-troubleshoot-title";
    tsTitle.textContent = t("diag.troubleshooting");

    const ul = document.createElement("ul");
    ul.className = "diag-troubleshoot-list";

    const items = [...troubleshoot];
    if (items.length === 0) {
      if (d.paragraphs === 0) {
        items.push(lang() === "fa"
          ? "صفحه در حال بارگذاری است یا پیام‌های چت هنوز رندر نشده‌اند. یک پیام بفرستید یا صفحه را اسکرول کنید."
          : "Page is loading or chat messages have not mounted yet. Send a message or scroll conversation.");
      } else if (d.rtlBlocks === 0) {
        items.push(lang() === "fa"
          ? "در چت متنی فارسی تایپ کنید تا قالب‌بندی راست‌به‌چپ فعال شود."
          : "Type Persian text in chat to trigger RTL formatting.");
      } else {
        items.push(t("diag.healthyText"));
      }
    }

    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    tsBox.append(tsTitle, ul);
    out.appendChild(tsBox);

  } catch (err) {
    globalErrors.captureException(err, { subsystem: SUBSYSTEMS.POPUP, title: "refreshDiagnosticsCenter failed" });
    out.textContent = t("diag.unreachable");
  }
}

function switchDiagTab(view) {
  const tabLive = $("#diag-tab-live");
  const tabLogs = $("#diag-tab-logs");
  const pLive = $("#diag-panel-live");
  const pLogs = $("#diag-panel-logs");
  const summaryText = $("#errors-summary-text");
  const clearBtn = $("#clear-errors-btn");

  if (view === "live") {
    tabLive?.classList.add("is-active");
    tabLive?.setAttribute("aria-selected", "true");
    tabLogs?.classList.remove("is-active");
    tabLogs?.setAttribute("aria-selected", "false");
    if (pLive) pLive.hidden = false;
    if (pLogs) pLogs.hidden = true;
    if (summaryText) summaryText.textContent = t("diag.tabLiveDesc");
    if (clearBtn) clearBtn.hidden = true;
  } else {
    tabLogs?.classList.add("is-active");
    tabLogs?.setAttribute("aria-selected", "true");
    tabLive?.classList.remove("is-active");
    tabLive?.setAttribute("aria-selected", "false");
    if (pLogs) pLogs.hidden = false;
    if (pLive) pLive.hidden = true;
    if (summaryText) {
      summaryText.textContent = currentErrors.length > 0
        ? t("status.hasErrors", { count: currentErrors.length })
        : t("diag.tabLogsDesc");
    }
    if (clearBtn) clearBtn.hidden = currentErrors.length === 0;
  }
}

async function runDiagnostics() {
  const backdrop = $("#errors-backdrop");
  if (backdrop) backdrop.hidden = false;
  switchDiagTab("live");
  await refreshDiagnosticsCenter();
}

/* ================= system health & error log ================= */

let currentErrors = [];

async function updateHealthStatus() {
  const chip = $("#health-chip");
  const text = $("#health-text");
  if (!chip || !text) return;

  const res = await rpc("rtlm:get-errors");
  const workerEntries = Array.isArray(res?.entries) ? res.entries : [];
  const localEntries = globalErrors.getEntries();

  const map = new Map();
  for (const e of [...workerEntries, ...localEntries]) {
    if (e?.id) map.set(e.id, e);
  }
  currentErrors = [...map.values()].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let errorCount = 0;
  let warnCount = 0;
  for (const e of currentErrors) {
    if (e.level === "error" || e.level === "critical") errorCount++;
    else if (e.level === "warning") warnCount++;
  }

  const promoPill = $("#diag-promo-status-pill");
  const promoLabel = $("#diag-promo-status-label");
  const modalChip = $("#diag-modal-health-chip");
  const modalText = $("#diag-modal-health-text");

  let statusKey = "healthy";
  let statusText = t("status.healthy");
  let statusTitle = t("diag.noErrors");

  if (errorCount > 0) {
    statusKey = "error";
    statusText = t("status.hasErrors", { count: errorCount });
    statusTitle = `${t("diag.errorsTitle")}: ${statusText}`;
  } else if (warnCount > 0) {
    statusKey = "warning";
    statusText = t("status.hasErrors", { count: warnCount });
    statusTitle = `${t("diag.errorsTitle")}: ${statusText}`;
  }

  chip.dataset.status = statusKey;
  text.textContent = statusText;
  chip.title = statusTitle;

  if (promoPill && promoLabel) {
    promoPill.dataset.status = statusKey;
    promoLabel.textContent = statusText;
  }

  if (modalChip && modalText) {
    modalChip.dataset.status = statusKey;
    modalText.textContent = statusText;
    modalChip.title = statusTitle;
  }
}

function renderErrorsModal() {
  const backdrop = $("#errors-backdrop");
  const list = $("#errors-list");
  if (!backdrop || !list) return;

  const countBadge = $("#diag-tab-logs-count");
  if (countBadge) {
    if (currentErrors.length > 0) {
      countBadge.textContent = String(currentErrors.length);
      countBadge.hidden = false;
    } else {
      countBadge.hidden = true;
    }
  }

  const clearBtn = $("#clear-errors-btn");
  const isLogsActive = $("#diag-tab-logs")?.classList.contains("is-active");
  if (clearBtn) {
    clearBtn.hidden = !isLogsActive || currentErrors.length === 0;
  }

  const bufferBadge = $("#log-buffer-badge");
  const footerText = $("#log-footer-text");

  list.textContent = "";
  if (currentErrors.length === 0) {
    if (bufferBadge) bufferBadge.textContent = "0 / 100";
    if (footerText) footerText.textContent = t("diag.logStatusNominal");

    const box = document.createElement("div");
    box.className = "nominal-status-box";

    const shield = document.createElement("div");
    shield.className = "nominal-shield-icon";
    shield.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`;

    const head = document.createElement("div");
    head.className = "nominal-header";

    const title = document.createElement("div");
    title.className = "nominal-title";
    title.textContent = t("diag.subsystemsHealthy");

    const desc = document.createElement("div");
    desc.className = "nominal-desc";
    desc.textContent = t("diag.subsystemsDesc");

    head.append(title, desc);

    const checklist = document.createElement("div");
    checklist.className = "nominal-checklist";

    const checks = [
      t("diag.chkEngine"),
      t("diag.chkFonts"),
      t("diag.chkScheduler"),
      t("diag.chkPatches")
    ];

    for (const label of checks) {
      const item = document.createElement("div");
      item.className = "chk-item";
      const dot = document.createElement("span");
      dot.className = "chk-dot";
      dot.setAttribute("aria-hidden", "true");
      const span = document.createElement("span");
      span.textContent = label;
      item.append(dot, span);
      checklist.appendChild(item);
    }

    box.append(shield, head, checklist);
    list.appendChild(box);
    return;
  }

  if (bufferBadge) bufferBadge.textContent = `${currentErrors.length} / 100`;
  if (footerText) footerText.textContent = t("diag.logBufferHint");

  for (const entry of [...currentErrors].reverse()) {
    const div = document.createElement("div");
    div.className = "error-entry";

    const head = document.createElement("div");
    head.className = "error-entry-head";

    const badge = document.createElement("span");
    badge.className = `error-badge badge-${entry.level || "info"}`;
    badge.textContent = `${entry.subsystem || "system"}:${entry.level || "info"}`;

    const time = document.createElement("span");
    time.className = "error-time";
    const date = new Date(entry.timestamp);
    time.textContent = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;

    head.append(badge, time);

    const msg = document.createElement("div");
    msg.className = "error-msg";
    msg.textContent = entry.message || entry.title || "Unknown event";

    div.append(head, msg);

    if (entry.stack || entry.details) {
      const details = document.createElement("div");
      details.className = "error-details";
      details.textContent = entry.details ? JSON.stringify(entry.details, null, 2) : entry.stack;
      div.appendChild(details);
    }

    list.appendChild(div);
  }
}

/* ================= sites view ================= */

async function loadActiveSites() {
  const res = await rpc("rtlm:get-active-sites");
  if (Array.isArray(res?.sites)) activeSites = res.sites;
  renderActiveSites();
}

function renderActiveSites() {
  const list = $("#active-site-list");
  list.textContent = "";
  if (activeSites.length === 0) {
    const li = document.createElement("li");
    li.className = "sites-empty";
    li.style.boxShadow = "none";
    li.textContent = t("sites.activeEmpty");
    list.appendChild(li);
    return;
  }
  for (const site of activeSites) {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = site.host;

    const meta = document.createElement("span");
    meta.className = "active-site-meta";
    const edits = Number(site.stats?.textEdits) || 0;
    meta.textContent = edits > 0 ? `${edits}` : "·";

    const sw = makeSwitch(`${t("site.switch")}: ${site.host}`);
    sw.setAttribute("aria-checked", String(siteEnabledOn(site.host)));
    sw.addEventListener("click", async () => {
      // Optimistic flip from the authoritative settings model, then
      // reconcile from the worker response. Rendering from the ACTIVE_SITES
      // registry re-painted the switch with its pre-click state whenever the
      // page's content script had not re-reported yet (throttled tabs),
      // which made the toggle look broken.
      const wasEnabled = siteEnabledOn(site.host);
      const previous = state.settings.overrides[site.host];
      state.settings.overrides = {
        ...state.settings.overrides,
        [site.host]: { enabled: !wasEnabled },
      };
      renderActiveSites();
      const res = await rpc("rtlm:toggle-site", { host: site.host });
      if (res?.settings) {
        state.settings = normalizeSettings(res.settings);
      } else {
        state.settings.overrides = {
          ...state.settings.overrides,
          [site.host]: previous ?? { enabled: wasEnabled },
        };
      }
      renderActiveSites();
      renderSite();
      refreshTabState();
    });

    li.append(name, meta, sw);
    list.appendChild(li);
  }
}

async function refreshTabState() {
  let queried = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    queried = tab || null;
  } catch {}

  // Derive identity locally first: the dashboard must never go blank just
  // because the service-worker round-trip failed (cold start, transient
  // chrome.tabs.get errors — observed as an empty Site tab on DeepSeek).
  if (queried && typeof queried.url === "string") {
    try {
      const derived = {
        id: queried.id,
        url: queried.url,
        host: normalizeHost(new URL(queried.url).hostname),
        stats: state.tab?.id === queried.id ? state.tab.stats : null,
      };
      if (derived.host) {
        state.tab = { ...(state.tab?.id === derived.id ? state.tab : {}), ...derived };
      }
    } catch {}
  }

  try {
    if (queried && typeof queried.id === "number") {
      const res = await rpc("rtlm:get-all", { tabId: queried.id });
      if (res?.settings) state.settings = normalizeSettings(res.settings);
      // Only trust the worker's richer tab object when it actually resolved.
      if (res?.tab && res.tab.host) state.tab = { ...state.tab, ...res.tab };
    }
  } catch (error) {
    console.warn("[RTL Atelier] get-all failed:", error);
  }

  // Fault state for the active tab: the content script answers with its
  // recovered-fault count (an unreachable page simply reports none).
  siteFaults = null;
  if (queried && typeof queried.id === "number" && state.tab?.id === queried.id) {
    try {
      const res = await chrome.tabs.sendMessage(queried.id, { type: "rtlm:stats" });
      if (res && Number(res.faults) > 0) {
        siteFaults = { count: Number(res.faults), kinds: res.faultKinds || {} };
      }
    } catch {}
  }
}

function renderActivation() {
  const mode = state.settings.activationMode === "everywhere" ? "everywhere" : "targeted";
  for (const item of document.querySelectorAll("#activation-segment .segmented-item")) {
    item.setAttribute("aria-checked", String(item.dataset.value === mode));
  }
  $("#activation-desc").textContent = t(
    mode === "everywhere" ? "activation.everywhere.desc" : "activation.smart.desc"
  );
  renderPresetGrid();
  renderSiteList();
}

/**
 * Built-in platforms were previously invisible — the site list only showed
 * custom domains, so users saw an empty manager. Every preset is now a
 * toggleable chip; disabling one stores an explicit override.
 */
function renderPresetGrid() {
  const grid = $("#preset-grid");
  if (!grid) return;
  grid.textContent = "";
  let onCount = 0;
  for (const host of [...presetHostList].sort()) {
    const disabled = state.settings.overrides[host]?.enabled === false;
    if (!disabled) onCount += 1;

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "platform-chip";
    chip.dataset.on = String(!disabled);
    chip.title = `${host} — ${disabled ? t("status.disabled") : t("status.running")}`;
    chip.textContent = host.replace(/\.(com|ai|dev|org|net)$/, "");
    chip.setAttribute("aria-pressed", String(!disabled));
    chip.addEventListener("click", () => {
      const overrides = { ...state.settings.overrides };
      if (disabled) delete overrides[host];
      else overrides[host] = { enabled: false };
      persist({ overrides });
    });
    grid.appendChild(chip);
  }
  $("#presets-count").textContent = String(onCount);
}

function renderSiteList() {
  const list = $("#site-list");
  const overrides = state.settings.overrides || {};
  const customEntries = Object.entries(overrides).filter(([host]) => !isPresetHost(host));
  list.textContent = "";

  if (customEntries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "sites-empty";
    empty.textContent = t("sites.empty");
    list.appendChild(empty);
  }

  for (const [host, entry] of customEntries.sort(([a], [b]) => a.localeCompare(b))) {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = host;

    const tag = document.createElement("span");
    tag.className = "site-tag";
    tag.textContent = entry?.enabled === false ? "OFF" : "ON";

    const remove = document.createElement("button");
    remove.className = "site-remove";
    remove.type = "button";
    remove.setAttribute("title", t("sites.remove"));
    remove.setAttribute("aria-label", `${t("sites.remove")}: ${host}`);
    remove.textContent = "×";
    remove.addEventListener("click", async () => {
      const overridesNext = { ...state.settings.overrides };
      delete overridesNext[host];
      await persist({ overrides: overridesNext });
    });

    li.append(name, tag, remove);
    list.appendChild(li);
  }

  $("#sites-count").textContent = String(customEntries.length);

  const addCurrentBtn = $("#add-current-domain-btn");
  const addCurrentLabel = $("#add-current-domain-label");
  if (addCurrentBtn && addCurrentLabel) {
    const host = state.tab?.host || "";
    if (host && !isPresetHost(host) && !overrides[host]) {
      addCurrentLabel.textContent = t("sites.addCurrent", { host });
      addCurrentBtn.hidden = false;
    } else {
      addCurrentBtn.hidden = true;
    }
  }
}

/* ================= fonts ================= */

function allFamilies() {
  return familiesForPicker(fontFamilies, customFonts);
}

function fillFontSelect(select, value, defaultKey, defaultLabelKey, families) {
  select.textContent = "";
  const entries = [
    [defaultKey, t(defaultLabelKey)],
    ...families.map((family) => {
      const weights = weightsForFamily(family, fontFaces, customFonts).length;
      const suffix = weights > 1 ? ` · ${t("weights.count", { n: weights })}` : "";
      return [family, `${family}${suffix}`];
    }),
  ];
  for (const [entryValue, entryLabel] of entries) {
    const option = document.createElement("option");
    option.value = entryValue;
    option.textContent = entryLabel;
    select.appendChild(option);
  }
  select.value = entries.some(([entryValue]) => entryValue === value) ? value : defaultKey;
}

/**
 * Weight options always mirror the selected family's real faces. A font with
 * two weights shows two; the picker never invents values the font lacks.
 */
function renderWeightSelect() {
  const select = $("#weight-select");
  const family = state.settings.pageFont;
  const hasFamily = family && family !== "default";
  const weights = hasFamily ? weightOptionsForFamily(family, fontFaces, customFonts) : [];

  select.textContent = "";
  const autoOption = document.createElement("option");
  autoOption.value = "auto";
  autoOption.textContent = t("weight.auto");
  select.appendChild(autoOption);

  for (const weight of weights) {
    const option = document.createElement("option");
    option.value = String(weight);
    const key = `weight.${weight}`;
    option.textContent = exists(key) ? t(key) : String(weight);
    select.appendChild(option);
  }

  const resolved = resolveStoredWeight(state.settings.pageFontWeight, weights);
  select.value = resolved;
  select.disabled = !hasFamily;
  return resolved;
}

function renderFontRows() {
  const pageSelect = $("#font-select");
  const families = allFamilies();

  fillFontSelect(pageSelect, state.settings.pageFont, "default", "font.default", families);

  const storedWeight = renderWeightSelect();
  // If the family changed underneath and the stored weight no longer exists,
  // reconcile it so what the selector shows is exactly what applies.
  if (storedWeight !== String(state.settings.pageFontWeight)) {
    state.settings.pageFontWeight = storedWeight;
    rpc("rtlm:set-settings", { pageFontWeight: storedWeight });
  }

  const bundledFaces = Object.values(fontFaces).reduce((sum, faces) => sum + faces.length, 0);
  $("#font-desc").textContent = t("font.page.desc.bundled", {
    n: bundledFaces + customFonts.length,
  });

  fillFontSelect($("#ui-font-select"), state.settings.uiFont, "default", "font.system", families);

  $("#ui-weight-select").value =
    ["auto", "300", "400", "500", "600", "700"].includes(String(state.settings.uiFontWeight))
      ? String(state.settings.uiFontWeight)
      : "auto";

  for (const stepper of document.querySelectorAll(".stepper")) {
    const key = stepper.dataset.target;
    stepper.querySelector(".stepper-value").textContent = `${state.settings[key]}%`;
  }

  $("#lang-select").value = state.settings.uiLang;

  const badge = $("#activation-mode-badge");
  if (badge) {
    badge.textContent = state.settings.activationMode === "everywhere" ? "Everywhere Mode" : "Smart Mode";
  }

  const activeFontName = $("#site-active-font-name");
  if (activeFontName) {
    const fam = state.settings.pageFont || "Vazirmatn";
    activeFontName.textContent = `Font: ${fam}`;
  }
}

function renderCustomFonts() {
  const list = $("#custom-font-list");
  list.textContent = "";
  if (customFonts.length === 0) {
    const li = document.createElement("li");
    li.className = "sites-empty";
    li.textContent = t("fonts.customEmpty");
    list.appendChild(li);
  }
  for (const record of [...customFonts].sort((a, b) => a.name.localeCompare(b.name))) {
    const li = document.createElement("li");

    const label = document.createElement("span");
    label.className = "font-face-label";
    label.title = record.name;
    label.textContent = record.family;

    const ext = (record.name.split(".").pop() || "").toUpperCase();
    const formatTag = document.createElement("span");
    formatTag.className = "font-format-tag";
    formatTag.textContent = ext || "FONT";

    const sizeTag = document.createElement("span");
    sizeTag.className = "font-size-tag";
    const kb = Math.round((Number(record.size) || 0) / 1024);
    sizeTag.textContent = kb > 0 ? `${kb} KB` : "";

    const weight = document.createElement("span");
    weight.className = "font-weight-tag";
    weight.textContent = String(record.weight);

    const remove = document.createElement("button");
    remove.className = "site-remove";
    remove.type = "button";
    remove.setAttribute("title", t("fonts.removed"));
    remove.setAttribute("aria-label", `${t("fonts.removed")}: ${record.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", async () => {
      const res = await rpc("rtlm:custom-fonts:remove", { name: record.name });
      if (Array.isArray(res?.fonts)) {
        customFonts = res.fonts;
        showNotification(t("fonts.removed"), "info");
        renderAll();
      }
    });

    li.append(label, formatTag, sizeTag, weight, remove);
    list.appendChild(li);
  }
  $("#custom-fonts-count").textContent = String(customFonts.length);
}

/* ================= preview + ui chrome ================= */

function getScratchpadSource() {
  const input = $("#scratchpad-input");
  if (input && typeof input.value === "string" && input.value.trim().length > 0) {
    return input.value;
  }
  return SAMPLE;
}

function renderPreview() {
  const box = $("#preview-box");
  const p = $("#preview-text");
  if (!box || !p) return;
  const raw = getScratchpadSource();
  const dir = resolveDirectionSmart(raw, "ltr");
  const context = { direction: dir, persian: looksPersian(raw) };
  const result = transformText(raw, state.settings, context);
  p.textContent = result.text;
  box.dir = state.settings.alignRtl ? dir : "auto";
  box.style.textAlign = state.settings.alignRtl ? (dir === "rtl" ? "right" : "left") : "";

  const family = state.settings.pageFont;
  box.style.fontFamily =
    family && family !== "default" ? fontFamilyValue(family, PAGE_FONT_FALLBACKS) : "";

  const weight = String(state.settings.pageFontWeight);
  p.style.fontWeight =
    weight !== "auto"
      ? weight
      : "";
  const size = Number(state.settings.pageFontSize);
  p.style.fontSize = Number.isFinite(size) && size > 0 ? `${Math.round(14 * (size / 100))}px` : "";

  $("#preview-note").textContent = result.changed ? t("preview.note.changed") : t("preview.note.clean");
}

function applyUiChrome() {
  const uiFamily = state.settings.uiFont;
  document.body.style.fontFamily =
    uiFamily && uiFamily !== "default" ? fontFamilyValue(uiFamily, UI_FONT_FALLBACKS) : "";
  // Full typographic control over the panel itself: family, weight, size.
  // Weight is applied through design-system TOKENS, not body inheritance:
  // hardcoded font-weight declarations on titles/stats/tabs used to win over
  // the body-level value, so weight changes only reached part of the panel.
  const uiWeight = String(state.settings.uiFontWeight);
  const rootStyle = document.documentElement.style;
  if (/^[1-9]00$/.test(uiWeight)) {
    const w = Number(uiWeight);
    rootStyle.setProperty("--rtla-fw-body", String(w));
    rootStyle.setProperty("--rtla-fw-strong", String(Math.min(900, w + 200)));
    rootStyle.setProperty("--rtla-fw-heading", String(Math.min(900, w + 300)));
  } else {
    rootStyle.removeProperty("--rtla-fw-body");
    rootStyle.removeProperty("--rtla-fw-strong");
    rootStyle.removeProperty("--rtla-fw-heading");
  }
  // Panel scaling uses zoom on the document element: the design system is
  // built from px tokens, and scaling <html> keeps the background covering
  // the whole window at every zoom level (scaling <body> left blank margins).
  const uiSize = Number(state.settings.uiFontSize);
  document.documentElement.style.zoom =
    Number.isFinite(uiSize) && uiSize > 0 && uiSize !== 100 ? String(uiSize / 100) : "";
  applyTheme(state.settings.theme);

  const uiDir = state.settings.uiDirection || "auto";
  const isRtl = uiDir === "rtl" ? true : uiDir === "ltr" ? false : isRtlLang(state.settings.uiLang);
  document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");
  document.documentElement.classList.toggle("rtla-rtl", isRtl);
}

/* ================= data loading ================= */

async function loadFontManifest() {
  try {
    const res = await fetch(chrome.runtime.getURL("dist/fonts.manifest.json"));
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data?.families)) return;
    fontFamilies = data.families.filter((f) => typeof f === "string" && f.length > 0 && f.length <= 64);
    fontFaces = data.faces && typeof data.faces === "object"
      ? Object.fromEntries(Object.entries(data.faces).filter(([family]) => fontFamilies.includes(family)))
      : {};
  } catch {
    fontFamilies = [];
    fontFaces = {};
  }
}

const activePopupFontFaces = new Set();

async function applyCustomFontToPopup(family) {
  if (typeof document === "undefined" || !document.fonts || typeof FontFace !== "function") return;
  if (!family || family === "default") {
    for (const f of activePopupFontFaces) {
      try { document.fonts.delete(f); } catch {}
    }
    activePopupFontFaces.clear();
    return;
  }
  try {
    const res = await rpc("rtlm:custom-fonts:data", { family });
    const records = Array.isArray(res?.records) ? res.records : [];
    if (records.length === 0) return;
    const currentFaces = new Set();
    for (const record of records) {
      if (!record?.family || !record?.data) continue;
      try {
        const clean = String(record.data || "").replace(/\s+/g, "");
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const face = new FontFace(record.family, bytes.buffer, {
          weight: String(record.weight || 400),
          style: "normal",
          display: "swap",
        });
        await face.load();
        document.fonts.add(face);
        currentFaces.add(face);
      } catch {}
    }
    for (const old of activePopupFontFaces) {
      if (!currentFaces.has(old)) {
        try { document.fonts.delete(old); } catch {}
      }
    }
    activePopupFontFaces.clear();
    for (const f of currentFaces) activePopupFontFaces.add(f);
  } catch {}
}

async function loadCustomFontsList() {
  const res = await rpc("rtlm:custom-fonts:list");
  if (Array.isArray(res?.fonts)) customFonts = res.fonts;
  if (state.settings?.pageFont && state.settings.pageFont !== "default") {
    await applyCustomFontToPopup(state.settings.pageFont);
  }
}

/* ================= custom font upload flow ================= */

let pendingUpload = null;

function askReplace(record) {
  return new Promise((resolve) => {
    const backdrop = $("#dup-backdrop");
    $("#dup-desc").textContent = t("fonts.replaceDesc", { name: record.name });
    backdrop.hidden = false;
    pendingUpload = { record, resolve };
  });
}

function settleDuplicate(decision) {
  const pending = pendingUpload;
  pendingUpload = null;
  $("#dup-backdrop").hidden = true;
  if (pending) pending.resolve(decision);
}

async function readFileAsRecord(file) {
  if (!FONT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) return null;
  if (file.size > MAX_FILE_BYTES) return null;
  const buffer = await file.arrayBuffer();
  return { name: file.name, data: encodeBase64(buffer), size: file.size };
}

async function uploadFontFiles(files) {
  for (const file of Array.from(files)) {
    const record = await readFileAsRecord(file);
    if (!record) {
      showNotification(t("fonts.invalid"), "error");
      continue;
    }
    let res = await rpc("rtlm:custom-fonts:add", { ...record, action: "check" });
    if (!res?.ok) {
      showNotification(res?.error === "storage-limit" ? t("fonts.storageFull") : t("fonts.invalid"), "error");
      continue;
    }
    if (res.duplicate) {
      const decision = await askReplace({ name: record.name });
      if (decision === "skip") {
        showNotification(t("fonts.skipped"), "info");
        continue;
      }
      res = await rpc("rtlm:custom-fonts:add", { ...record, action: "replace" });
      if (res?.ok) showNotification(t("fonts.replaced"), "success");
    } else {
      showNotification(t("fonts.uploaded"), "success");
    }
    if (!res?.ok) {
      showNotification(res?.error === "storage-limit" ? t("fonts.storageFull") : t("fonts.invalid"), "error");
      continue;
    }
    if (Array.isArray(res.fonts)) {
      customFonts = res.fonts;
      // Seamless experience: auto-apply the uploaded font immediately
      const added = findRecordByName(customFonts, record.name) || customFonts[customFonts.length - 1];
      if (added?.family) {
        await applyCustomFontToPopup(added.family);
        await persist({ pageFont: added.family, pageFontWeight: "auto" });
      }
    }
    renderAll();
  }
}

/* ================= render orchestration ================= */

/**
 * One failing render section must never take down the rest of the panel:
 * every sub-render is fault-isolated so a bad element degrades one card
 * instead of blanking the popup.
 */
function renderAll() {
  const applied = applyI18n(state.settings.uiLang, state.settings.uiDirection);
  if (applied.changed || renderedLang !== applied.lang) {
    renderedLang = applied.lang;
    safeRender("buildFeatureRows", buildFeatureRows);
  }
  safeRender("renderSite", renderSite);
  safeRender("renderStats", renderStats);
  safeRender("renderActivation", renderActivation);
  safeRender("syncFeatureRows", syncFeatureRows);
  safeRender("renderFontRows", renderFontRows);
  safeRender("renderCustomFonts", renderCustomFonts);
  safeRender("renderActiveSites", renderActiveSites);
  safeRender("renderPreview", renderPreview);
  safeRender("applyUiChrome", applyUiChrome);
  safeRender("updateHealthStatus", updateHealthStatus);
}

function safeRender(name, fn) {
  try {
    fn();
  } catch (error) {
    console.warn(`[RTL Atelier] render/${name} failed:`, error);
  }
}

/* ================= listeners ================= */

/**
 * Null-tolerant wiring: a missing element logs instead of aborting, so one
 * bad selector can never silence every later listener (the previous cause of
 * an entirely dead Typography tab).
 */
function on(selector, event, handler) {
  const el = document.querySelector(selector);
  if (!el) {
    console.debug(`[RTL Atelier] listener target not found: ${selector}`);
    return;
  }
  el.addEventListener(event, handler);
}

function attachListeners() {
  // Tab navigation first: view switching must survive any later wiring fault.
  for (const tab of document.querySelectorAll("#app-nav-tabs .tab")) {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  }

  on("#master-switch", "click", () => {
    // Optimistic flip keeps the header responsive even if the worker is cold.
    const next = !state.settings.master;
    state.settings.master = next;
    renderAll();
    rpc("rtlm:toggle-master").then((res) => {
      if (res?.settings) {
        state.settings = normalizeSettings(res.settings);
        renderAll();
      }
    });
  });

  on("#site-switch", "click", async () => {
    const host = state.tab && state.tab.host;
    if (!host) {
      toast(t("toast.openPage"));
      return;
    }
    // Optimistic flip: render the new state from local settings immediately,
    // then reconcile. The previous version waited on refreshTabState() without
    // re-rendering the Site view, so the switch visually ignored clicks until
    // an unrelated stats push happened to repaint it.
    const entry = state.settings.overrides[host];
    const wasEnabled = siteEnabledOn(host);
    state.settings.overrides = {
      ...state.settings.overrides,
      [host]: { enabled: !wasEnabled },
    };
    renderAll();
    const res = await rpc("rtlm:toggle-site", { host });
    if (res?.settings) {
      state.settings = normalizeSettings(res.settings);
    } else {
      state.settings.overrides = { ...state.settings.overrides, [host]: entry ?? { enabled: wasEnabled } };
    }
    await refreshTabState();
    renderAll();
    loadActiveSites();
  });

  on("#reapply-btn", "click", async () => {
    const icon = $("#reapply-btn .icon-reapply");
    icon?.classList.add("is-spinning");
    setTimeout(() => icon?.classList.remove("is-spinning"), 650);
    if (!state.tab || typeof state.tab.id !== "number") {
      showNotification(t("toast.openPage"), "warning");
      return;
    }
    const res = await rpc("rtlm:reapply", { tabId: state.tab.id });
    if (res?.ok) {
      showNotification(t("toast.reapplied"), "success");
    } else {
      showNotification(res?.reason === "no-tab" ? t("toast.openPage") : t("toast.unreachable"), "error");
    }
  });

  on("#preset-search-input", "input", (e) => {
    const q = (e.target.value || "").toLowerCase().trim();
    for (const chip of document.querySelectorAll("#preset-grid .platform-chip")) {
      const text = chip.textContent.toLowerCase();
      const title = (chip.title || "").toLowerCase();
      const match = !q || text.includes(q) || title.includes(q);
      chip.style.display = match ? "" : "none";
    }
  });

  on("#add-current-domain-btn", "click", async () => {
    const host = state.tab?.host || "";
    if (!host) return;
    const overrides = { ...state.settings.overrides, [host]: { enabled: true } };
    await persist({ overrides });
    renderSiteList();
    showNotification(t("sites.addSuccess", { host }), "success");
  });

  on("#activation-segment", "click", (event) => {
    const item = event.target.closest(".segmented-item");
    if (item) persist({ activationMode: item.dataset.value });
  });

  on("#scope-segment", "click", (event) => {
    const item = event.target.closest(".segmented-item");
    if (item) persist({ fontScope: item.dataset.value });
  });

  on("#direction-segment", "click", (event) => {
    const item = event.target.closest(".segmented-item");
    if (item && item.dataset.value) {
      for (const btn of document.querySelectorAll("#direction-segment .segmented-item")) {
        btn.setAttribute("aria-checked", String(btn === item));
      }
      persist({ directionMode: item.dataset.value });
    }
  });

  on("#ui-direction-segment", "click", (event) => {
    const item = event.target.closest(".segmented-item");
    if (item && item.dataset.value) {
      for (const btn of document.querySelectorAll("#ui-direction-segment .segmented-item")) {
        btn.setAttribute("aria-checked", String(btn === item));
      }
      persist({ uiDirection: item.dataset.value });
    }
  });

  on("#activate-cta", "click", async () => {
    const host = state.tab?.host;
    if (!host) {
      showNotification(t("toast.openPage"), "warning");
      return;
    }
    isActivating = true;
    renderSite();
    try {
      const res = await rpc("rtlm:activate-site", { host, tabId: state.tab?.id });
      if (res?.ok) {
        if (res.settings) {
          state.settings = normalizeSettings(res.settings);
        }
        await new Promise((r) => setTimeout(r, 120));
        await refreshTabState();
        showNotification(t("hint.activatedSuccess", { host }), "success");
      } else {
        showNotification(t("error.activationFailed"), "error");
      }
    } catch {
      showNotification(t("error.activationFailed"), "error");
    } finally {
      isActivating = false;
      renderAll();
    }
  });

  on("#reset-stats-btn", "click", async () => {
    if (state.tab && typeof state.tab.id === "number") {
      await rpc("rtlm:reset-stats", { tabId: state.tab.id });
    }
    if (state.tab) state.tab.stats = { paragraphs: 0, rtlBlocks: 0, textEdits: 0, inputs: 0 };
    renderStats();
    showNotification(t("toast.statsReset"), "info");
  });

  on("#diagnostics-run", "click", () => runDiagnostics());

  on("#fault-banner", "click", () => runDiagnostics());

  on("#theme-segment", "click", (event) => {
    const item = event.target.closest(".segmented-item");
    if (item) persist({ theme: item.dataset.value });
  });

  on("#site-add-form", "submit", async (event) => {
    event.preventDefault();
    const input = $("#site-add-input");
    const host = normalizeHost(input.value.trim());
    if (!host) {
      toast(t("sites.invalid"));
      return;
    }
    const overrides = { ...state.settings.overrides, [host]: { enabled: true } };
    await persist({ overrides });
    input.value = "";
  });

  for (const item of document.querySelectorAll("#digits-segment .segmented-item")) {
    item.addEventListener("click", () => persist({ digits: item.dataset.value }));
  }

  on("#font-select", "change", async (event) => {
    const family = event.target.value;
    const weights =
      family && family !== "default"
        ? weightOptionsForFamily(family, fontFaces, customFonts)
        : [];
    const resolvedWeight = resolveStoredWeight(state.settings.pageFontWeight, weights);
    await applyCustomFontToPopup(family);
    await persist({ pageFont: family, pageFontWeight: resolvedWeight });
  });

  on("#weight-select", "change", (event) => {
    persist({ pageFontWeight: event.target.value });
  });

  on("#ui-font-select", "change", (event) => {
    persist({ uiFont: event.target.value });
  });

  on("#ui-weight-select", "change", (event) => {
    persist({ uiFontWeight: event.target.value });
  });

  on("#lang-select", "change", (event) => {
    persist({ uiLang: event.target.value });
  });

  for (const stepper of document.querySelectorAll(".stepper")) {
    const applyStep = (btn) => {
      const key = stepper.dataset.target;
      const min = Number(stepper.dataset.min);
      const max = Number(stepper.dataset.max);
      const step = Number(stepper.dataset.step) * Number(btn.dataset.dir);
      const next = Math.min(max, Math.max(min, Math.round(Number(state.settings[key]) + step)));
      if (next !== Number(state.settings[key])) persist({ [key]: next });
    };

    // Click steps once; holding the button repeats for smooth sizing.
    stepper.addEventListener("click", (event) => {
      const btn = event.target.closest(".stepper-btn");
      if (btn) applyStep(btn);
    });

    let holdTimer = null;
    let repeatTimer = null;
    for (const btn of stepper.querySelectorAll(".stepper-btn")) {
      btn.addEventListener("pointerdown", () => {
        holdTimer = setTimeout(() => {
          repeatTimer = setInterval(() => applyStep(btn), 130);
        }, 380);
      });
      const stop = () => {
        clearTimeout(holdTimer);
        clearInterval(repeatTimer);
        holdTimer = null;
        repeatTimer = null;
      };
      btn.addEventListener("pointerup", stop);
      btn.addEventListener("pointerleave", stop);
      btn.addEventListener("pointercancel", stop);
    }
  }

  on("#upload-font-btn", "click", () => $("#font-file").click());
  on("#open-tab-btn", "click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/ui/popup.html") });
  });

  on("#font-file", "change", async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length > 0) await uploadFontFiles(files);
  });

  // Drag-and-drop font files directly into the custom fonts dropzone
  const dropzone = $("#custom-font-dropzone") || $(".custom-fonts");
  if (dropzone) {
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      dropzone.classList.add("drag-active");
    });
    dropzone.addEventListener("dragleave", (event) => {
      if (!dropzone.contains(event.relatedTarget)) {
        dropzone.classList.remove("drag-active");
      }
    });
    dropzone.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropzone.classList.remove("drag-active");
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length > 0) await uploadFontFiles(files);
    });
  }

  on("#dup-replace", "click", () => settleDuplicate("replace"));
  on("#dup-skip", "click", () => settleDuplicate("skip"));

  on("#scratchpad-input", "input", () => renderPreview());
  on("#scratchpad-copy", "click", async () => {
    const p = $("#preview-text");
    if (!p || !p.textContent) return;
    try {
      await navigator.clipboard.writeText(p.textContent);
      toast(t("toast.copied"));
    } catch {
      const ta = document.createElement("textarea");
      ta.value = p.textContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast(t("toast.copied"));
    }
  });
  on("#scratchpad-reset", "click", () => {
    const input = $("#scratchpad-input");
    if (input) input.value = SAMPLE;
    renderPreview();
  });

  on("#export-btn", "click", async () => {
    const json = JSON.stringify(state.settings, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url, filename: "rtl-atelier-settings.json" });
      toast(t("toast.exported"));
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.download = "rtl-atelier-settings.json";
      a.click();
      toast(t("toast.exported"));
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  });

  on("#import-btn", "click", () => $("#import-file").click());
  on("#import-file", "change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("invalid");
      }
      await persist(parsed);
      toast(t("toast.imported"));
    } catch {
      toast(t("toast.readFail"));
    }
  });

  on("#reset-btn", "click", async () => {
    const message =
      lang() === "fa"
        ? "همهٔ تنظیمات RTL Atelier به حالت پیش‌فرض برگردد؟"
        : "Reset all RTL Atelier settings to defaults?";
    if (!confirm(message)) return;
    const res = await rpc("rtlm:reset");
    if (res && res.settings) state.settings = normalizeSettings(res.settings);
    renderAll();
    toast(t("toast.reset"));
  });

  on("#about-btn", "click", () => {
    $("#about-backdrop").hidden = false;
  });
  on("#about-close", "click", () => {
    $("#about-backdrop").hidden = true;
  });

  on("#open-diagnostics-btn", "click", () => runDiagnostics());
  on("#health-chip", "click", () => runDiagnostics());

  on("#diag-tab-live", "click", () => switchDiagTab("live"));
  on("#diag-tab-logs", "click", () => switchDiagTab("logs"));

  on("#diag-quick-fix-btn", "click", async () => {
    if (!state.tab || typeof state.tab.id !== "number") {
      toast(t("toast.openPage"));
      return;
    }
    const btn = $("#diag-quick-fix-btn");
    if (btn) btn.disabled = true;
    try {
      await rpc("rtlm:reapply", { tabId: state.tab.id });
      showNotification(t("toast.reapplied"), "success");
      await new Promise((r) => setTimeout(r, 250));
      await refreshDiagnosticsCenter();
    } catch {
      showNotification(t("toast.unreachable"), "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  on("#errors-close", "click", () => {
    const backdrop = $("#errors-backdrop");
    if (backdrop) backdrop.hidden = true;
    switchView(activeView || "site");
  });

  on("#diag-back-btn", "click", () => {
    const backdrop = $("#errors-backdrop");
    if (backdrop) backdrop.hidden = true;
    switchView(activeView || "site");
  });

  on("#copy-errors-btn", "click", async () => {
    let report = "";
    if (lastDiagTelemetry) {
      const dt = lastDiagTelemetry;
      report = [
        `# RTL Atelier Technical Diagnostic Report`,
        `Generated: ${dt.timestamp}`,
        `Host: ${dt.host || "—"}`,
        `URL: ${dt.url || "—"}`,
        `Adapter: ${dt.diagnostics?.adapterId || "generic"}`,
        `Direction Mode: ${dt.settings?.directionMode || "auto"}`,
        `Page Font: ${dt.settings?.pageFont || "default"} (${dt.settings?.pageFontWeight || "auto"}, ${dt.settings?.pageFontSize || 100}%)`,
        `Engine Running: ${dt.diagnostics?.running}`,
        `Status: ${dt.diagnostics?.status} (${dt.diagnostics?.reasonCode}: ${dt.diagnostics?.reasonText})`,
        `Paragraphs Detected: ${dt.diagnostics?.paragraphs || 0}`,
        `RTL Blocks Formatted: ${dt.diagnostics?.rtlBlocks || 0} (${dt.diagnostics?.coveragePct || 0}%)`,
        `Text Edits: ${dt.diagnostics?.textEdits || 0}`,
        `Inputs: ${dt.diagnostics?.inputs || 0}`,
        `Queue Items: ${dt.diagnostics?.queueSize || 0}`,
        `Chat Containers Matched: ${dt.domState?.chatContainers || 0}`,
        `FontFace In-Memory Loaded: ${dt.fontState?.loadedFacesCount || 0} faces`,
        `Document ReadyState: ${dt.domState?.readyState || "unknown"}`,
        `\n## Recent Event Logs (${currentErrors.length})`,
        ...currentErrors.map((e) => `[${new Date(e.timestamp).toISOString()}] [${e.subsystem}:${e.level}] ${e.message || e.title}`),
      ].join("\n");
    } else {
      report = JSON.stringify({ errors: currentErrors, timestamp: Date.now() }, null, 2);
    }
    try {
      await navigator.clipboard.writeText(report);
      showNotification(t("diag.copied") || "Report copied to clipboard!", "success");
    } catch {
      showNotification(t("toast.readFail"), "error");
    }
  });

  on("#clear-errors-btn", "click", async () => {
    globalErrors.clear();
    await rpc("rtlm:clear-errors");
    currentErrors = [];
    renderErrorsModal();
    await updateHealthStatus();
    switchDiagTab("logs");
    showNotification(t("diag.clearErrors"), "info");
  });
  for (const layer of document.querySelectorAll(".modal-backdrop")) {
    layer.addEventListener("click", (event) => {
      if (event.target !== layer) return;
      if (layer.id === "dup-backdrop") {
        // Dismissing the replace dialog must still settle the pending
        // upload promise, or the awaiting upload flow hangs forever.
        settleDuplicate("skip");
        return;
      }
      layer.hidden = true;
      if (layer.id === "errors-backdrop") {
        switchView(activeView || "site");
      }
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const layer of document.querySelectorAll(".modal-backdrop")) {
      if (!layer.hidden) {
        if (layer.id === "dup-backdrop") {
          settleDuplicate("skip");
        } else {
          layer.hidden = true;
          if (layer.id === "errors-backdrop") {
            switchView(activeView || "site");
          }
        }
      }
    }
  });

  const scheme = matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => {
    if (state.settings.theme === "auto" || !["light", "dark"].includes(state.settings.theme)) {
      applyTheme(state.settings.theme);
    }
  };
  if (typeof scheme.addEventListener === "function") {
    scheme.addEventListener("change", onSchemeChange);
  } else if (typeof scheme.addListener === "function") {
    scheme.addListener(onSchemeChange);
  }
}

/* ================= init ================= */

/**
 * Live statistics: the service worker pushes every report it receives, so the
 * Site card tracks page changes in real time instead of only at popup open.
 */
function attachStatsPush() {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "rtlm:fault-changed") {
      const { host, count, kinds } = message.payload || {};
      if (host && host === state.tab?.host) {
        siteFaults = { count: Number(count) || 0, kinds: kinds || {} };
        safeRender("renderFaultBanner", renderFaultBanner);
      }
      safeRender("updateHealthStatus", updateHealthStatus);
      return undefined;
    }
    if (message?.type !== "rtlm:stats-changed") return undefined;
    const { tabId, host, stats } = message.payload || {};
    if (state.tab && typeof state.tab.id === "number" && tabId === state.tab.id) {
      state.tab.stats = stats || null;
      safeRender("renderStats", renderStats);
    }
    if (host && Array.isArray(activeSites)) {
      const entry = activeSites.find((site) => site.host === host);
      if (entry && stats) entry.stats = stats;
      if (!entry && host && stats) activeSites.push({ host, stats, lastSeen: Date.now() });
      if (activeView === "sites") safeRender("renderActiveSites", renderActiveSites);
    }
    return undefined;
  });
}

async function init() {
  try {
    const manifest = chrome.runtime.getManifest();
    $("#version-chip").textContent = `v${manifest.version}`;
    $("#about-version").textContent = `${manifest.name} ${manifest.version} — ${t("license.note")}`;
  } catch (error) {
    console.warn("[RTL Atelier] version chip failed:", error);
  }

  // 1. Static content + listeners. The default view is revealed immediately
  // so a later data failure can never leave a blank panel.
  try {
    buildFeatureRows();
  } catch (error) {
    console.warn("[RTL Atelier] feature rows failed:", error);
  }
  try {
    attachListeners();
  } catch (error) {
    console.warn("[RTL Atelier] listener wiring failed:", error);
  }
  switchView("site");

  // 2. Live state, then enrichment. Each step renders independently.
  await refreshTabState().catch((error) => console.warn("[RTL Atelier] tab state failed:", error));
  attachStatsPush();
  updateHealthStatus();

  // 3. Font library + custom fonts; re-render when they land.
  const enrich = [loadFontManifest(), loadCustomFontsList()];
  await Promise.allSettled(enrich).then(() => renderAll());
}

init();
