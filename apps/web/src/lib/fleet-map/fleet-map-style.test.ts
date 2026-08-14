import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FLEET_MAP_STYLE_URL, fleetMapStyleUrl } from "./fleet-map-style";
test("uses OpenFreeMap Positron by default and permits only the inventoried OpenFreeMap origin", () => { assert.equal(fleetMapStyleUrl(undefined), DEFAULT_FLEET_MAP_STYLE_URL); assert.equal(fleetMapStyleUrl("https://tiles.openfreemap.org/styles/liberty"), "https://tiles.openfreemap.org/styles/liberty"); assert.equal(fleetMapStyleUrl("https://example.test/style.json"), DEFAULT_FLEET_MAP_STYLE_URL); assert.equal(fleetMapStyleUrl("https://token@tiles.openfreemap.org/style.json"), DEFAULT_FLEET_MAP_STYLE_URL); });
