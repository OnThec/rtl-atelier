import { isPresetHost } from "../adapters/registry.js";

export const DEFAULT_SETTINGS = {
  master: true,
  theme: "auto",
  activationMode: "targeted",
  normalizeChars: true,
  zwnj: true,
  punctuation: true,
  whitespace: true,
  digits: "keep",
  alignRtl: true,
  keepCenter: true,
  smartRuns: false,
  layoutSafe: true,
  mostlyRtl: true,
  forceCodeLtr: true,
  autoDirInputs: true,
  processEditable: false,
  pageFont: "Vazir",
  pageFontWeight: "auto",
  pageFontSize: 100,
  fontScope: "rtl",
  directionMode: "auto",
  uiDirection: "auto",
  uiFont: "default",
  uiFontWeight: "auto",
  uiFontSize: 100,
  uiLang: "auto",
  overrides: {},
};

const BOOLEAN_KEYS = [
  "master",
  "normalizeChars",
  "zwnj",
  "punctuation",
  "whitespace",
  "alignRtl",
  "keepCenter",
  "smartRuns",
  "layoutSafe",
  "mostlyRtl",
  "forceCodeLtr",
  "autoDirInputs",
  "processEditable",
];

const DIGIT_MODES = ["keep", "latin", "persian"];
const THEMES = ["auto", "light", "dark"];
const UI_LANGS = ["auto", "en", "fa"];
const ACTIVATION_MODES = ["targeted", "everywhere"];
const FONT_WEIGHTS = ["auto", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const FONT_SCOPES = ["rtl", "readable"];
const DIRECTION_MODES = ["auto", "rtl", "ltr"];
const UI_DIRECTIONS = ["auto", "rtl", "ltr"];

/** Schema version for stored-settings migrations. */
export const SETTINGS_SCHEMA_VERSION = 2;

/**
 * Migrate raw persisted settings from an older schema.
 * v1 → v2: the empty page-font choice ("default") becomes the new bundled
 * default "Vazir"; explicit family choices are preserved untouched.
 */
export function migrateRawSettings(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (raw.pageFont === "default") raw.pageFont = DEFAULT_SETTINGS.pageFont;
  return raw;
}

function clampInt(value, min, max, fallback) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function sanitizeFontName(value, fallback) {
  // Accepts unicode letters/numbers, spaces, and punctuation (including commas
  // and brackets used in variable font filenames).
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[\p{L}\p{N}\s._'&()[\]+,-]+$/u.test(value)
    ? value
    : fallback;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function normalizeHost(host) {
  let value = String(host ?? "").toLowerCase().trim();
  value = value.replace(/^www\./, "").replace(/:\d+$/, "");
  if (value.length === 0 || value.length > 253) return "";
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)) return "";
  return value;
}

function normalizeOverrides(raw) {
  const overrides = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return overrides;
  for (const key of Object.keys(raw)) {
    const host = normalizeHost(key);
    if (!host) continue;
    const entry = raw[key];
    const disabled = Boolean(entry && typeof entry === "object" && entry.enabled === false);
    overrides[host] = { enabled: !disabled };
  }
  return overrides;
}

export function normalizeSettings(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const settings = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    settings[key] = hasOwn(source, key) ? source[key] : DEFAULT_SETTINGS[key];
  }
  for (const key of BOOLEAN_KEYS) {
    settings[key] = typeof settings[key] === "boolean" ? settings[key] : DEFAULT_SETTINGS[key];
  }
  settings.digits = DIGIT_MODES.includes(settings.digits) ? settings.digits : "keep";
  settings.theme = THEMES.includes(settings.theme) ? settings.theme : "auto";
  settings.activationMode = ACTIVATION_MODES.includes(settings.activationMode)
    ? settings.activationMode
    : DEFAULT_SETTINGS.activationMode;
  settings.pageFont = sanitizeFontName(settings.pageFont, "default");
  settings.uiFont = sanitizeFontName(settings.uiFont, "default");
  settings.uiLang = UI_LANGS.includes(settings.uiLang) ? settings.uiLang : "auto";
  settings.uiFontWeight = FONT_WEIGHTS.includes(String(settings.uiFontWeight))
    ? String(settings.uiFontWeight)
    : "auto";
  settings.pageFontWeight = FONT_WEIGHTS.includes(String(settings.pageFontWeight))
    ? String(settings.pageFontWeight)
    : "auto";
  settings.fontScope = FONT_SCOPES.includes(settings.fontScope) ? settings.fontScope : "rtl";
  settings.directionMode = DIRECTION_MODES.includes(settings.directionMode)
    ? settings.directionMode
    : "auto";
  settings.uiDirection = UI_DIRECTIONS.includes(settings.uiDirection)
    ? settings.uiDirection
    : "auto";
  settings.pageFontSize = clampInt(settings.pageFontSize, 50, 250, 100);
  settings.uiFontSize = clampInt(settings.uiFontSize, 80, 180, 100);
  settings.overrides = normalizeOverrides(source.overrides);
  return settings;
}

export function siteEnabled(settings, host) {
  if (!settings.master) return false;
  const key = normalizeHost(host);
  if (!key) return settings.master;
  const entry = settings.overrides[key];
  if (entry && entry.enabled === false) return false;
  // "targeted" activation: only preset platforms and explicitly whitelisted
  // sites run the engine; "everywhere" keeps the legacy always-on behavior.
  if (settings.activationMode !== "everywhere") {
    if (!isPresetHost(key)) return Boolean(entry && entry.enabled === true);
  }
  return true;
}
