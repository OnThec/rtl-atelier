import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFontFilename, collectFontFamilies, renderFontFaceCss, buildFonts } from "../scripts/fonts.js";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("parseFontFilename parses weight and family from standard file names", () => {
  assert.deepEqual(parseFontFilename("Vazir-Bold.ttf"), { family: "Vazir", weight: 700 });
  assert.deepEqual(parseFontFilename("Shabnam_Thin.woff2"), { family: "Shabnam", weight: 100 });
  assert.deepEqual(parseFontFilename("Samim.ttf"), { family: "Samim", weight: 400 });
  assert.deepEqual(parseFontFilename("Sahel-Medium.otf"), { family: "Sahel", weight: 500 });
  assert.equal(parseFontFilename("invalid-file.txt"), null);
  assert.equal(parseFontFilename("noextension"), null);
});

test("collectFontFamilies groups font files by family and sorts faces", () => {
  const files = [
    "Vazir-Bold.ttf",
    "Vazir-Light.ttf",
    "Vazir.ttf",
    "Samim.ttf",
  ];
  const families = collectFontFamilies(files);
  assert.equal(families.length, 2);
  assert.equal(families[0].family, "Samim");
  assert.equal(families[1].family, "Vazir");
  assert.deepEqual(families[1].faces, [
    { file: "Vazir-Light.ttf", weight: 300 },
    { file: "Vazir.ttf", weight: 400 },
    { file: "Vazir-Bold.ttf", weight: 700 },
  ]);
});

test("collectFontFamilies respects custom manifest json if supplied", () => {
  const files = ["CustomFont-Reg.ttf", "CustomFont-Bold.ttf"];
  const manifest = [
    {
      family: "Custom Font",
      faces: [
        { file: "CustomFont-Reg.ttf", weight: 400 },
        { file: "CustomFont-Bold.ttf", weight: 700 },
      ],
    },
  ];
  const families = collectFontFamilies(files, manifest);
  assert.equal(families.length, 1);
  assert.equal(families[0].family, "Custom Font");
  assert.equal(families[0].faces.length, 2);
});

test("renderFontFaceCss outputs valid @font-face rules", () => {
  const families = [
    {
      family: "Vazir",
      faces: [{ file: "Vazir-Bold.ttf", weight: 700 }],
    },
  ];
  const css = renderFontFaceCss(families, (f) => `chrome-extension://id/fonts/${f}`);
  assert.ok(css.includes('@font-face'));
  assert.ok(css.includes('font-family: "Vazir";'));
  assert.ok(css.includes('src: url("chrome-extension://id/fonts/Vazir-Bold.ttf") format("truetype");'));
  assert.ok(css.includes('font-weight: 700;'));
});

test("buildFonts writes fonts.css, fonts.ui.css, and fonts.manifest.json in temp directory", () => {
  const tmp = mkdtempSync(join(tmpdir(), "rtl-fonts-test-"));
  try {
    const fontsDir = join(tmp, "fonts");
    const distDir = join(tmp, "dist");
    mkdirSync(fontsDir, { recursive: true });
    writeFileSync(join(fontsDir, "TestFont-Bold.ttf"), "dummy");
    writeFileSync(join(fontsDir, "TestFont.woff2"), "dummy");

    const manifest = buildFonts(tmp, distDir);
    assert.deepEqual(manifest.families, ["TestFont"]);
    assert.deepEqual(manifest.weights, { TestFont: [400, 700] });
    assert.deepEqual(manifest.faces, {
      TestFont: [
        { file: "TestFont.woff2", weight: 400 },
        { file: "TestFont-Bold.ttf", weight: 700 },
      ],
    });

    assert.ok(existsSync(join(distDir, "fonts.css")));
    assert.ok(existsSync(join(distDir, "fonts.ui.css")));
    assert.ok(existsSync(join(distDir, "fonts.manifest.json")));

    const css = readFileSync(join(distDir, "fonts.css"), "utf8");
    assert.ok(css.includes('font-family: "TestFont";'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
