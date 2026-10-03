import test from "node:test";
import assert from "node:assert/strict";
import { ErrorManager, ERROR_LEVELS, SUBSYSTEMS, globalErrors } from "../src/core/errors.js";

test("ERROR_LEVELS and SUBSYSTEMS constants are defined and unique", () => {
  assert.equal(ERROR_LEVELS.INFO, "info");
  assert.equal(ERROR_LEVELS.WARNING, "warning");
  assert.equal(ERROR_LEVELS.ERROR, "error");
  assert.equal(ERROR_LEVELS.CRITICAL, "critical");

  assert.equal(SUBSYSTEMS.ENGINE, "engine");
  assert.equal(SUBSYSTEMS.CONTENT, "content");
  assert.equal(SUBSYSTEMS.WORKER, "service-worker");
  assert.equal(SUBSYSTEMS.POPUP, "popup");
});

test("ErrorManager records entries with correct fields and IDs", () => {
  const manager = new ErrorManager({ maxEntries: 10 });
  const entry = manager.record({
    subsystem: SUBSYSTEMS.ENGINE,
    level: ERROR_LEVELS.WARNING,
    title: "Test Warning",
    message: "Something unusual occurred",
    details: "Stack trace or extra data",
    host: "example.com",
  });

  assert.ok(entry.id.startsWith("err_"));
  assert.ok(entry.timestamp > 0);
  assert.equal(entry.subsystem, SUBSYSTEMS.ENGINE);
  assert.equal(entry.level, ERROR_LEVELS.WARNING);
  assert.equal(entry.title, "Test Warning");
  assert.equal(entry.message, "Something unusual occurred");
  assert.equal(entry.details, "Stack trace or extra data");
  assert.equal(entry.host, "example.com");

  assert.equal(manager.getEntries().length, 1);
  assert.deepEqual(manager.getEntries()[0], entry);
});

test("ErrorManager helper methods record correct levels", () => {
  const manager = new ErrorManager();
  manager.info("Info Title", "Info Msg");
  manager.warn("Warn Title", "Warn Msg");
  manager.error("Error Title", "Error Msg");
  manager.critical("Critical Title", "Critical Msg");

  const entries = manager.getEntries();
  assert.equal(entries.length, 4);
  assert.equal(entries[0].level, "info");
  assert.equal(entries[1].level, "warning");
  assert.equal(entries[2].level, "error");
  assert.equal(entries[3].level, "critical");
});

test("captureException extracts message and stack trace safely", () => {
  const manager = new ErrorManager();
  const fakeErr = new TypeError("Cannot read properties of null");
  const entry = manager.captureException(fakeErr, {
    subsystem: SUBSYSTEMS.CONTENT,
    title: "TypeError caught",
    host: "app.chatgpt.com",
  });

  assert.equal(entry.subsystem, SUBSYSTEMS.CONTENT);
  assert.equal(entry.level, ERROR_LEVELS.ERROR);
  assert.equal(entry.title, "TypeError caught");
  assert.equal(entry.message, "Cannot read properties of null");
  assert.ok(entry.details && entry.details.includes("TypeError"));
  assert.equal(entry.host, "app.chatgpt.com");
});

test("ring buffer respects maxEntries limit", () => {
  const manager = new ErrorManager({ maxEntries: 3 });
  manager.info("1", "first");
  manager.info("2", "second");
  manager.info("3", "third");
  assert.equal(manager.getEntries().length, 3);
  assert.equal(manager.getEntries()[0].title, "1");

  manager.info("4", "fourth");
  assert.equal(manager.getEntries().length, 3);
  assert.equal(manager.getEntries()[0].title, "2");
  assert.equal(manager.getEntries()[2].title, "4");
});

test("subscribe receives new entries and unsubscribe removes listener", () => {
  const manager = new ErrorManager();
  const events = [];
  const unsubscribe = manager.subscribe((entry) => events.push(entry));

  manager.warn("Warn 1", "test");
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Warn 1");

  unsubscribe();
  manager.warn("Warn 2", "test");
  assert.equal(events.length, 1); // Not called after unsubscribe
});

test("summary correctly aggregates metrics and issue status", () => {
  const manager = new ErrorManager();
  assert.equal(manager.summary().total, 0);
  assert.equal(manager.summary().hasIssues, false);
  assert.equal(manager.summary().lastEvent, null);

  manager.info("I", "msg");
  manager.warn("W", "msg");
  assert.equal(manager.summary().hasIssues, false);

  manager.error("E", "msg");
  const s = manager.summary();
  assert.equal(s.total, 3);
  assert.equal(s.counts.info, 1);
  assert.equal(s.counts.warning, 1);
  assert.equal(s.counts.error, 1);
  assert.equal(s.counts.critical, 0);
  assert.equal(s.hasIssues, true);
  assert.equal(s.lastEvent.title, "E");

  manager.clear();
  assert.equal(manager.getEntries().length, 0);
  assert.equal(manager.summary().total, 0);
});

test("globalErrors singleton is initialized and functional", () => {
  assert.ok(globalErrors instanceof ErrorManager);
  assert.ok(Array.isArray(globalErrors.getEntries()));
});
