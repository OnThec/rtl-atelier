import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  migrateRawSettings,
  normalizeSettings,
  normalizeHost,
  siteEnabled,
} from "../src/core/settings.js";

test("normalizeSettings fills defaults and sanitizes types", () => {
  const settings = normalizeSettings(null);
  assert.deepEqual(settings, DEFAULT_SETTINGS);

  const dirty = normalizeSettings({
    master: "yes",
    zwnj: 1,
    digits: "emoji",
    theme: "purple",
    pageFont: "<script>alert(1)</script>",
    overrides: "nope",
  });
  assert.equal(dirty.master, true);
  assert.equal(dirty.zwnj, true);
  assert.equal(dirty.digits, "keep");
  assert.equal(dirty.theme, "auto");
  assert.equal(dirty.pageFont, "default");
  assert.deepEqual(dirty.overrides, {});
});

test("normalizeSettings accepts valid values", () => {
  const settings = normalizeSettings({ zwnj: false, digits: "persian", theme: "dark", pageFont: "Vazir" });
  assert.equal(settings.zwnj, false);
  assert.equal(settings.digits, "persian");
  assert.equal(settings.theme, "dark");
  assert.equal(settings.pageFont, "Vazir");
});

test("normalizeSettings sanitizes uiFont and uiLang independently", () => {
  const settings = normalizeSettings({
    uiFont: "Shabnam",
    uiLang: "fa",
    pageFont: "<script>",
  });
  assert.equal(settings.uiFont, "Shabnam");
  assert.equal(settings.uiLang, "fa");
  assert.equal(settings.pageFont, "default");
  assert.notEqual(settings.uiFont, settings.pageFont);

  const dirty = normalizeSettings({ uiFont: 42, uiLang: "de", uiDirection: "diagonal" });
  assert.equal(dirty.uiFont, "default");
  assert.equal(dirty.uiLang, "auto");
  assert.equal(dirty.uiDirection, "auto");

  const customDir = normalizeSettings({ uiDirection: "rtl" });
  assert.equal(customDir.uiDirection, "rtl");
});

test("normalizeSettings clamps font size and weight controls", () => {
  const settings = normalizeSettings({
    pageFontSize: 999,
    uiFontSize: -5,
    pageFontWeight: "bold",
    fontScope: "everything",
  });
  assert.equal(settings.pageFontSize, 250);
  assert.equal(settings.uiFontSize, 80);
  assert.equal(settings.pageFontWeight, "auto");
  assert.equal(settings.fontScope, "rtl");

  const ok = normalizeSettings({
    pageFontSize: 120,
    uiFontSize: 130,
    pageFontWeight: "600",
    fontScope: "readable",
    uiFontWeight: "500",
  });
  assert.equal(ok.pageFontSize, 120);
  assert.equal(ok.uiFontSize, 130);
  assert.equal(ok.pageFontWeight, "600");
  assert.equal(ok.fontScope, "readable");
  assert.equal(ok.uiFontWeight, "500");

  const bad = normalizeSettings({ uiFontWeight: "bold" });
  assert.equal(bad.uiFontWeight, "auto");
});

test("defaults target Vazir and targeted activation", () => {
  const settings = normalizeSettings(null);
  assert.equal(settings.pageFont, "Vazir");
  assert.equal(settings.activationMode, "targeted");
});

test("migrateRawSettings upgrades legacy empty page font to Vazir", () => {
  assert.deepEqual(migrateRawSettings({ master: true, pageFont: "default" }), {
    master: true,
    pageFont: "Vazir",
  });
  assert.deepEqual(migrateRawSettings({ pageFont: "Shabnam" }), { pageFont: "Shabnam" });
  assert.equal(migrateRawSettings(null), null);
});

test("siteEnabled uses targeted presets by default", () => {
  const settings = normalizeSettings(null);
  // chatgpt.com is a built-in preset; example.com is not.
  assert.equal(siteEnabled(settings, "chatgpt.com"), true);
  assert.equal(siteEnabled(settings, "www.chatgpt.com"), true);
  assert.equal(siteEnabled(settings, "example.com"), false);

  // Whitelisting a custom domain turns it on.
  settings.overrides["example.com"] = { enabled: true };
  assert.equal(siteEnabled(settings, "example.com"), true);

  // Explicit disable always wins.
  settings.overrides["chatgpt.com"] = { enabled: false };
  assert.equal(siteEnabled(settings, "chatgpt.com"), false);
});

test("siteEnabled everywhere mode restores always-on behavior", () => {
  const settings = normalizeSettings({ activationMode: "everywhere" });
  assert.equal(siteEnabled(settings, "example.com"), true);
  settings.overrides["example.com"] = { enabled: false };
  assert.equal(siteEnabled(settings, "example.com"), false);
});

test("siteEnabled honors master switch", () => {
  const settings = normalizeSettings({ master: false });
  assert.equal(siteEnabled(settings, "chatgpt.com"), false);
});

test("normalizeHost strips www and port and case", () => {
  assert.equal(normalizeHost("WWW.ChatGPT.com"), "chatgpt.com");
  assert.equal(normalizeHost("example.com:8080"), "example.com");
  assert.equal(normalizeHost(""), "");
});

test("normalizeHost rejects malformed input", () => {
  assert.equal(normalizeHost("bad host!"), "");
  assert.equal(normalizeHost("__proto__"), "");
  assert.equal(normalizeHost("constructor"), "constructor");
  assert.equal(normalizeHost("a".repeat(300)), "");
  assert.equal(normalizeHost(null), "");
  assert.equal(normalizeHost(undefined), "");
});

test("normalizeSettings whitelists known keys only", () => {
  const settings = normalizeSettings(
    JSON.parse('{"master":false,"__proto__":{"polluted":1},"evil":"x"}')
  );
  assert.equal(settings.master, false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings, "evil"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings, "__proto__"), false);
  assert.equal({}.polluted, undefined);
});

test("normalizeSettings sanitizes override host keys", () => {
  const settings = normalizeSettings({
    overrides: {
      "WWW.Example.com:8080": { enabled: false },
      "bad host!": { enabled: false },
      "__proto__": { enabled: false },
      "ok.site": { enabled: false },
    },
  });
  assert.deepEqual(settings.overrides, {
    "example.com": { enabled: false },
    "ok.site": { enabled: false },
  });
});

test("siteEnabled per-site overrides still apply in targeted mode", () => {
  const settings = normalizeSettings(null);
  settings.overrides["example.com"] = { enabled: false };
  assert.equal(siteEnabled(settings, "example.com"), false);
  assert.equal(siteEnabled(settings, "www.example.com"), false);

  // A whitelisted non-preset site stays on until disabled.
  settings.overrides["example.com"] = { enabled: true };
  assert.equal(siteEnabled(settings, "example.com"), true);

  settings.master = false;
  assert.equal(siteEnabled(settings, "other.com"), false);
});

test("normalizeSettings keeps custom font families containing parentheses", () => {
  // Families parsed from uploaded files (e.g. "Vazir(Bold).ttf") are legal in
  // the custom-font store; the settings sanitizer must not reject them and
  // silently revert the selection to the site default.
  const settings = normalizeSettings({ pageFont: "Vazir(Bold)", uiFont: "IRANSans(FaNum)" });
  assert.equal(settings.pageFont, "Vazir(Bold)");
  assert.equal(settings.uiFont, "IRANSans(FaNum)");
});
