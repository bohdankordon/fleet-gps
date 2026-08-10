import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FLEET_MAP_STYLE_URL, fleetMapStyleUrl } from "./fleet-map-style";
test("uses OpenFreeMap Positron by default and rejects secret-like style URLs", () => { assert.equal(fleetMapStyleUrl(undefined), DEFAULT_FLEET_MAP_STYLE_URL); assert.equal(fleetMapStyleUrl("https://example.test/style.json"), "https://example.test/style.json"); assert.equal(fleetMapStyleUrl("https://token@example.test/style.json"), DEFAULT_FLEET_MAP_STYLE_URL); });
