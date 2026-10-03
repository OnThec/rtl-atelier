/**
 * Pure helpers for building font option lists in the popup.
 * No DOM, no Node built-ins — safe for every runtime context.
 */

/**
 * Available weights for a family across bundled faces and custom uploads.
 * Returns a sorted, de-duplicated array (e.g. [300, 400, 700]).
 */
export function weightsForFamily(family, bundledFaces = {}, customFonts = []) {
  const weights = new Set();
  const faces = bundledFaces && typeof bundledFaces === "object" ? bundledFaces[family] : null;
  if (Array.isArray(faces)) {
    for (const face of faces) {
      const num = Math.round(Number(face?.weight));
      if (Number.isFinite(num)) weights.add(Math.min(900, Math.max(100, num)));
    }
  }
  if (Array.isArray(customFonts)) {
    for (const record of customFonts) {
      if (record?.family !== family) continue;
      const num = Math.round(Number(record.weight));
      if (Number.isFinite(num)) weights.add(Math.min(900, Math.max(100, num)));
    }
  }
  return [...weights].sort((a, b) => a - b);
}

/** All families offered by the library: bundled first, then custom-only ones. */
export function familiesForPicker(bundledFamilies = [], customFonts = []) {
  const bundled = Array.isArray(bundledFamilies) ? bundledFamilies.filter((f) => typeof f === "string") : [];
  const customs = Array.isArray(customFonts)
    ? [...new Set(customFonts.map((record) => record?.family).filter((f) => typeof f === "string" && f))]
    : [];
  return [...bundled, ...customs.filter((family) => !bundled.includes(family))];
}

/**
 * Weight options that should be shown for a family. When the family exposes
 * fewer than two faces, the list collapses to just those real values — the
 * selector must never advertise weights the font does not contain.
 */
export function weightOptionsForFamily(family, bundledFaces = {}, customFonts = []) {
  return weightsForFamily(family, bundledFaces, customFonts);
}

/** True when the stored weight is meaningful for this family's options. */
export function resolveStoredWeight(stored, availableWeights) {
  const value = String(stored ?? "");
  if (value === "auto" || value === "") return "auto";
  const num = Number(value);
  return availableWeights.includes(num) ? String(num) : "auto";
}
