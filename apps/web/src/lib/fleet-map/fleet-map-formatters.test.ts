import assert from "node:assert/strict";
import test from "node:test";
import { formatFleetMapAge } from "./fleet-map-formatters";
test("formats snapshot-relative age without changing freshness and handles future safely", () => { assert.equal(formatFleetMapAge("2026-08-10T12:00:00.000Z", "2026-08-10T12:00:05.000Z"), "только что"); assert.equal(formatFleetMapAge("2026-08-10T12:00:00.000Z", "2026-08-10T12:00:35.000Z"), "35 сек назад"); assert.equal(formatFleetMapAge("2026-08-10T12:00:00.000Z", "2026-08-10T12:02:00.000Z"), "2 мин назад"); assert.equal(formatFleetMapAge("2026-08-10T12:01:00.000Z", "2026-08-10T12:00:00.000Z"), "время позиции уточняется"); });
