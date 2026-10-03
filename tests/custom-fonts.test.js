import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FONT_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  buildFontRecord,
  sanitizeFileName,
  hasFontExtension,
  findRecordByName,
  mergeFamilies,
  totalBytes,
} from "../src/core/custom-fonts.js";

test("sanitizeFileName accepts safe font names and rejects the rest", () => {
  assert.equal(sanitizeFileName("My Font-Bold.ttf"), "My Font-Bold.ttf");
  assert.equal(sanitizeFileName("C:\\fake\\path\\vazir.woff2"), "vazir.woff2");
  assert.equal(sanitizeFileName("وزیر-Bold.ttf"), "وزیر-Bold.ttf");
  assert.equal(sanitizeFileName("Vazirmatn[wght].woff2"), "Vazirmatn[wght].woff2");
  assert.equal(sanitizeFileName("Vazirmatn[opsz,wght].woff2"), "Vazirmatn[opsz,wght].woff2");
  assert.equal(sanitizeFileName("font<>.ttf"), "");
  assert.equal(sanitizeFileName("readme.txt"), "");
  assert.equal(sanitizeFileName(""), "");
  assert.equal(sanitizeFileName(null), "");
});

test("hasFontExtension covers supported formats only", () => {
  for (const ext of FONT_EXTENSIONS) {
    assert.equal(hasFontExtension(`x${ext}`), true);
  }
  assert.equal(hasFontExtension("x.svg"), false);
});

test("buildFontRecord infers family and weight from filename", () => {
  const record = buildFontRecord({ name: "MyFont-Bold.ttf", data: "AAAA", size: 4 });
  assert.ok(record);
  assert.equal(record.family, "MyFont");
  assert.equal(record.weight, 700);
  assert.equal(record.name, "MyFont-Bold.ttf");
  assert.equal(record.size, 4);

  const plain = buildFontRecord({ name: "plain.woff2", data: "AA", size: 2 });
  assert.equal(plain.weight, 400);

  const variable = buildFontRecord({ name: "Vazirmatn[wght].woff2", data: "AAAA", size: 4 });
  assert.ok(variable);
  assert.equal(variable.family, "Vazirmatn");
  assert.equal(variable.weight, 400);

  const variableOpsz = buildFontRecord({ name: "Vazirmatn[opsz,wght].woff2", data: "AAAA", size: 4 });
  assert.ok(variableOpsz);
  assert.equal(variableOpsz.family, "Vazirmatn");
  assert.equal(variableOpsz.weight, 400);

  const complexPunct = buildFontRecord({ name: "IRANSansX(FaNum)+Display-Bold[opsz,wght].ttf", data: "AAAA", size: 4 });
  assert.ok(complexPunct);
  assert.equal(complexPunct.weight, 700);

  const persian = buildFontRecord({ name: "وزیر-Bold.ttf", data: "AAAA", size: 4 });
  assert.ok(persian);
  assert.equal(persian.family, "وزیر");
  assert.equal(persian.weight, 700);
});

test("buildFontRecord rejects invalid or oversized input", () => {
  assert.equal(buildFontRecord({ name: "evil.exe", data: "AAAA", size: 4 }), null);
  assert.equal(
    buildFontRecord({ name: "big.ttf", data: "A".repeat(16), size: MAX_FILE_BYTES + 1 }),
    null
  );
  assert.equal(buildFontRecord({ name: "empty.ttf", data: "", size: 0 }), null);
});

test("findRecordByName is case-insensitive", () => {
  const records = [{ name: "Vazir-Bold.TTF" }, { name: "other.woff" }];
  assert.equal(findRecordByName(records, "vazir-bold.ttf"), records[0]);
  assert.equal(findRecordByName(records, "missing.ttf"), null);
  assert.equal(findRecordByName(null, "x.ttf"), null);
});

test("mergeFamilies unions bundled and custom names without duplicates", () => {
  const merged = mergeFamilies(["Vazir", "Shabnam"], [
    { family: "Vazir" },
    { family: "CustomFace" },
    { family: null },
  ]);
  assert.deepEqual(merged, ["Vazir", "Shabnam", "CustomFace"]);
});

test("totalBytes guards against malformed records", () => {
  assert.equal(totalBytes([{ size: 10 }, { size: "20" }, {}, null]), 30);
  assert.equal(totalBytes("nope"), 0);
  assert.ok(MAX_TOTAL_BYTES > MAX_FILE_BYTES);
});
