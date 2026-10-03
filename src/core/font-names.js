/**
 * Pure font-name parsing shared by the build pipeline (scripts/fonts.js) and
 * extension runtime modules. Must never import Node built-ins: this file is
 * part of the service-worker/popup module graph where `node:*` specifiers are
 * blocked by the MV3 content security policy.
 */

const FONT_EXT_FORMAT = {
  ".woff2": "woff2",
  ".woff": "woff",
  ".ttf": "truetype",
  ".otf": "opentype",
};

const WEIGHT_MAP = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

const FACE_RE = /^(.+?)[-_](thin|hairline|extralight|ultralight|light|regular|normal|book|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy)$/i;

export function isSupportedFontExtension(extension) {
  return Boolean(FONT_EXT_FORMAT[String(extension || "").toLowerCase()]);
}

export function fontFormatForExtension(extension) {
  return FONT_EXT_FORMAT[String(extension || "").toLowerCase()] || null;
}

export function parseFontFilename(filename) {
  const base = String(filename).trim();
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  let stem = base.slice(0, dot);
  const ext = base.slice(dot).toLowerCase();
  if (!FONT_EXT_FORMAT[ext]) return null;
  // Clean variable font markers such as [wght] or [opsz,wght]
  stem = stem.replace(/\[[^\]]+\]/g, "").trim();
  const match = stem.match(FACE_RE);
  if (match) {
    return {
      family: match[1].replace(/_/g, " ").trim(),
      weight: WEIGHT_MAP[match[2].toLowerCase()],
    };
  }
  return { family: stem.replace(/_/g, " ").trim(), weight: 400 };
}
