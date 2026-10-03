import { test } from "node:test";
import assert from "node:assert/strict";
import { IdleScheduler } from "../src/core/scheduler.js";

test("scheduler dedupes by key", () => {
  const calls = [];
  const sched = new IdleScheduler({ idle: (cb) => calls.push(cb) });
  assert.equal(sched.enqueue("a", () => {}), true);
  assert.equal(sched.enqueue("a", () => {}), false);
  assert.equal(sched.size, 1);
});

test("scheduler drains queued work", () => {
  const calls = [];
  const order = [];
  const sched = new IdleScheduler({
    idle: (cb) => calls.push(cb),
    now: () => 0,
  });
  sched.enqueue("a", () => order.push("a"));
  sched.enqueue("b", () => order.push("b"));
  assert.equal(calls.length, 1);
  calls.shift()();
  assert.deepEqual(order, ["a", "b"]);
  assert.equal(sched.size, 0);
});

test("scheduler respects budget and reschedules", () => {
  let clock = 0;
  const calls = [];
  const processed = [];
  const sched = new IdleScheduler({
    budgetMs: 5,
    idle: (cb) => calls.push(cb),
    now: () => (clock += 4),
  });
  sched.enqueue("a", () => processed.push("a"));
  sched.enqueue("b", () => processed.push("b"));
  sched.enqueue("c", () => processed.push("c"));

  calls.shift()();
  assert.equal(processed.length, 1);
  assert.equal(calls.length, 1);
  calls.shift()();
  assert.equal(processed.length, 2);
  calls.shift()();
  assert.deepEqual(processed, ["a", "b", "c"]);
});

test("scheduler collects task errors without dying", () => {
  const sched = new IdleScheduler({ idle: (cb) => cb(), now: () => 0 });
  sched.enqueue("boom", () => {
    throw new Error("task failed");
  });
  assert.equal(sched.errors.length, 1);
});

test("clear empties the queue", () => {
  const sched = new IdleScheduler({ idle: () => {} });
  sched.enqueue("a", () => {});
  sched.clear();
  assert.equal(sched.size, 0);
});

test("scheduler bounds its error log", () => {
  const sched = new IdleScheduler({ idle: (cb) => cb(), now: () => 0 });
  for (let i = 0; i < 80; i++) {
    sched.enqueue(`task-${i}`, () => {
      throw new Error("boom");
    });
  }
  assert.ok(sched.errors.length <= 50);
  assert.ok(sched.errors.length > 0);
});
