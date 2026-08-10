import assert from "node:assert/strict";
import test from "node:test";
import { initialFleetMapBasemapState, recordFleetMapBasemapError, recordFleetMapBasemapLoad } from "./fleet-map-basemap-state";

test("initial basemap errors are visible until a successful load clears them, while post-load generic errors are ignored", () => {
  const failedBeforeLoad = recordFleetMapBasemapError(initialFleetMapBasemapState());
  assert.deepEqual(failedBeforeLoad, { loaded: false, error: true });
  const loaded = recordFleetMapBasemapLoad();
  assert.deepEqual(loaded, { loaded: true, error: false });
  assert.equal(recordFleetMapBasemapError(loaded), loaded);
});
