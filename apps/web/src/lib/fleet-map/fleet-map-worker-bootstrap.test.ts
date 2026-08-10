import assert from "node:assert/strict";
import test from "node:test";
import { createFleetMapAfterWorkerBootstrap, isSameOriginFleetMapWorkerUrl, type FleetMapWorkerBootstrapState } from "./fleet-map-worker-bootstrap";

test("configures the same-origin worker once before creating the first map", () => {
  const calls: string[] = [];
  const state: FleetMapWorkerBootstrapState = { configured: false };
  const bootstrap = {
    state,
    workerUrl: "/maplibre/maplibre-gl-worker.mjs",
    setWorkerUrl: (workerUrl: string) => calls.push(`worker:${workerUrl}`),
  };

  const first = createFleetMapAfterWorkerBootstrap(bootstrap, () => { calls.push("map:first"); return "first"; });
  const second = createFleetMapAfterWorkerBootstrap(bootstrap, () => { calls.push("map:second"); return "second"; });

  assert.equal(first, "first");
  assert.equal(second, "second");
  assert.deepEqual(calls, ["worker:/maplibre/maplibre-gl-worker.mjs", "map:first", "map:second"]);
  assert.equal(isSameOriginFleetMapWorkerUrl(bootstrap.workerUrl, "http://127.0.0.1:3001/map"), true);
  assert.equal(isSameOriginFleetMapWorkerUrl("https://cdn.example.test/worker.mjs", "http://127.0.0.1:3001/map"), false);
});
