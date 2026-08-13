import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult } from "pg";
import { POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY, PositionHistoryHorizonAlreadyRunningError, PositionHistoryHorizonExecutionLockService, type PositionHistoryLockConnection } from "./position-history-horizon-execution-lock.service";

function result<T extends Record<string, unknown>>(row: T): QueryResult<T> { return { command: "SELECT", rowCount: 1, oid: 0, fields: [], rows: [row] }; }
function connection(acquired: boolean, events: string[]): PositionHistoryLockConnection { return { query: async <T extends Record<string, unknown>>(text: string, values: readonly unknown[]) => { events.push(text.includes("try") ? "try" : "unlock"); assert.deepEqual(values, [POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY]); return (text.includes("try") ? result({ acquired }) : result({ released: true })) as unknown as QueryResult<T>; }, release: async () => { events.push("release"); } }; }

test("holds the fixed session advisory lock on one dedicated connection for the whole executor promise", async () => {
  const events: string[] = []; const lock = new PositionHistoryHorizonExecutionLockService(async () => connection(true, events));
  await lock.runExclusive(async () => { events.push("execute-start"); await Promise.resolve(); events.push("execute-end"); });
  assert.deepEqual(events, ["try", "execute-start", "execute-end", "unlock", "release"]);
});

test("releases and closes the same connection when the executor throws", async () => {
  const events: string[] = []; const failure = new Error("provider raw secret"); const lock = new PositionHistoryHorizonExecutionLockService(async () => connection(true, events));
  await assert.rejects(lock.runExclusive(async () => { events.push("execute"); throw failure; }), (error) => error === failure);
  assert.deepEqual(events, ["try", "execute", "unlock", "release"]);
});

test("failed acquisition returns conflict and executes no work", async () => {
  const events: string[] = []; let executions = 0; const lock = new PositionHistoryHorizonExecutionLockService(async () => connection(false, events));
  await assert.rejects(lock.runExclusive(async () => { executions += 1; }), PositionHistoryHorizonAlreadyRunningError);
  assert.equal(executions, 0); assert.deepEqual(events, ["try", "release"]);
});

test("two concurrent application requests produce one executor and one conflict", async () => {
  let connects = 0, executions = 0, finish!: () => void; const gate = new Promise<void>((resolve) => { finish = resolve; });
  const lock = new PositionHistoryHorizonExecutionLockService(async () => connection(connects++ === 0, []));
  const first = lock.runExclusive(async () => { executions += 1; await gate; return "done"; });
  const second = lock.runExclusive(async () => { executions += 1; return "unexpected"; });
  await assert.rejects(second, PositionHistoryHorizonAlreadyRunningError); assert.equal(executions, 1); finish(); assert.equal(await first, "done");
});
