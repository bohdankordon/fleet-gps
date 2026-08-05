const assert = require("node:assert/strict");
const packageApi = require("@taxi-gps/equgps");

assert.equal(typeof packageApi.SessionTokenProvider, "function");
assert.equal(typeof packageApi.parseEquGpsConfig, "function");
assert.equal(typeof packageApi.FetchHttpTransport, "function");
assert.equal(typeof packageApi.createOfficialEquGpsClient, "function");
assert.equal(typeof packageApi.createWebRunsClient, "function");
assert.equal(typeof packageApi.createWebVehicleDetailsClient, "function");
assert.equal(typeof packageApi.createWebSpeedEventsClient, "function");
assert.equal(typeof packageApi.createWebRouteClient, "function");
