import { parseFontFilename } from "./font-names.js";

export const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"];
export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB per font file
export const MAX_TOTAL_BYTES = 24 * 1024 * 1024; // 24 MB across all uploads

const NAME_ALLOWED = /^[\p{L}\p{N}\s._'&()[\]+,-]+$/u;

export function hasFontExtension(filename) {
  const name = String(filename || "").toLowerCase();
  return FONT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Sanitize a filename into a safe, stable storage key. */
export function sanitizeFileName(filename) {
  const name = String(filename || "").trim();
  if (!name || name.length > 128 || !hasFontExtension(name)) return "";
  const base = name.replace(/\\/g, "/").split("/").pop();
  return NAME_ALLOWED.test(base) ? base : "";
}

/**
 * Build a validated custom-font record from an uploaded file.
 * Weight is inferred from the filename (Vazir-Bold.ttf → 700), matching the
 * bundled font pipeline's conventions.
 */
export function buildFontRecord({ name, data, size }) {
  const safeName = sanitizeFileName(name);
  if (!safeName) return null;
  // Prefer the declared file size (authoritative); fall back to the base64
  // payload length when only raw data is available.
  const fromBase64 = typeof data === "string" ? Math.ceil((data.length * 3) / 4) : 0;
  const bytes = Number(size) > 0 ? Math.floor(Number(size)) : fromBase64;
  if (bytes <= 0 || bytes > MAX_FILE_BYTES) return null;
  const parsed = parseFontFilename(safeName) || { family: safeName.replace(/\.[^.]+$/, ""), weight: 400 };
  const family =
    typeof parsed.family === "string" && parsed.family.trim().length > 0 && parsed.family.length <= 64
      ? parsed.family.trim()
      : safeName.replace(/\.[^.]+$/, "").trim().slice(0, 64) || "CustomFont";
  return {
    name: safeName,
    family,
    weight: Math.min(900, Math.max(100, Math.round(Number(parsed.weight) || 400))),
    data: String(data || ""),
    size: bytes,
    addedAt: Date.now(),
  };
}

export function totalBytes(records) {
  if (!Array.isArray(records)) return 0;
  return records.reduce((sum, record) => sum + (Number(record?.size) || 0), 0);
}

/** Case-insensitive duplicate lookup by file name. */
export function findRecordByName(records, name) {
  if (!Array.isArray(records)) return null;
  const target = String(name || "").toLowerCase();
  return records.find((record) => String(record?.name || "").toLowerCase() === target) || null;
}

/**
 * Merge bundled and custom family names for the popup selectors.
 * Custom families shadow bundled ones with a suffix marker handled by the UI.
 */
export function mergeFamilies(bundledFamilies, customRecords) {
  const families = Array.isArray(bundledFamilies) ? bundledFamilies.filter((f) => typeof f === "string") : [];
  const customs = Array.isArray(customRecords)
    ? [...new Set(customRecords.map((record) => record?.family).filter((f) => typeof f === "string" && f))]
    : [];
  return [...families, ...customs.filter((family) => !families.includes(family))];
}

export function encodeBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
