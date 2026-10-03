import { test } from "node:test";
import assert from "node:assert/strict";
import {
  familiesForPicker,
  resolveStoredWeight,
  weightOptionsForFamily,
  weightsForFamily,
} from "../src/core/font-options.js";

const FACES = {
  Vazir: [
    { file: "Vazir-Thin.ttf", weight: 100 },
    { file: "Vazir-Light.ttf", weight: 300 },
    { file: "Vazir.ttf", weight: 400 },
    { file: "Vazir-Medium.ttf", weight: 500 },
    { file: "Vazir-Bold.ttf", weight: 700 },
  ],
};

test("weightsForFamily collects sorted unique bundled weights", () => {
  assert.deepEqual(weightsForFamily("Vazir", FACES), [100, 300, 400, 500, 700]);
});

test("weightsForFamily merges custom uploads with bundled faces", () => {
  const customs = [
    { family: "Vazir", weight: 600, name: "Vazir-SemiBold.woff2" },
    { family: "CustomFace", weight: 700, name: "CustomFace-Bold.ttf" },
  ];
  assert.deepEqual(weightsForFamily("Vazir", FACES, customs), [100, 300, 400, 500, 600, 700]);
  assert.deepEqual(weightsForFamily("CustomFace", {}, customs), [700]);
});

test("weightsForFamily ignores malformed weights and unknown families", () => {
  const customs = [{ family: "X", weight: "junk" }, { family: "X", weight: 450 }];
  assert.deepEqual(weightsForFamily("X", {}, customs), [450]);
  assert.deepEqual(weightsForFamily("Missing", FACES), []);
  assert.deepEqual(weightsForFamily(null, null, null), []);
});

test("weightOptionsForFamily never advertises weights the font lacks", () => {
  assert.deepEqual(weightOptionsForFamily("Vazir", FACES).includes(200), false);
});

test("resolveStoredWeight falls back to auto for unavailable values", () => {
  assert.equal(resolveStoredWeight("auto", [400]), "auto");
  assert.equal(resolveStoredWeight("700", [400, 700]), "700");
  assert.equal(resolveStoredWeight("900", [400]), "auto");
  assert.equal(resolveStoredWeight("junk", [400]), "auto");
  assert.equal(resolveStoredWeight(undefined, []), "auto");
});

test("familiesForPicker unions bundled and custom names without duplicates", () => {
  assert.deepEqual(
    familiesForPicker(["Vazir"], [{ family: "CustomFace" }, { family: "Vazir" }, {}]),
    ["Vazir", "CustomFace"]
  );
});
