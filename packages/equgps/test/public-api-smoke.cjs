const assert = require("node:assert/strict");
const packageApi = require("@taxi-gps/equgps");

assert.equal(typeof packageApi.SessionTokenProvider, "function");
assert.equal(typeof packageApi.parseEquGpsConfig, "function");
