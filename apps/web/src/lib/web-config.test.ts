import assert from "node:assert/strict";
import test from "node:test";
import { parseWebConfig, WebConfigurationError } from "./web-config";
test("normalizes an internal backend URL without changing input", () => { const env = { API_INTERNAL_BASE_URL: " https://api.example.test/base/ " }; assert.deepEqual(parseWebConfig(env), { apiInternalBaseUrl: "https://api.example.test/base" }); assert.equal(env.API_INTERNAL_BASE_URL, " https://api.example.test/base/ "); });
test("rejects unsafe backend URLs without serializing them", () => { const unsafe = "https://user:password@api.example.test/?token=value#fragment"; let error: unknown; try { parseWebConfig({ API_INTERNAL_BASE_URL: unsafe }); } catch (value) { error = value; } assert.ok(error instanceof WebConfigurationError); assert.equal(JSON.stringify(error).includes(unsafe), false); });
