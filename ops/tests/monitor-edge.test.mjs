import assert from "node:assert/strict";
import tls from "node:tls";
import test from "node:test";
import { localEdgeHttpsOptions } from "../lib/monitor-runtime.mjs";

test("local edge probe forces loopback while preserving SNI and Host", () => {
  const options = localEdgeHttpsOptions("taxi.example.test", "/login", 10_000);
  assert.equal(options.hostname, "taxi.example.test");
  assert.equal(options.servername, "taxi.example.test");
  assert.equal(options.path, "/login");
  assert.equal(options.method, "GET");
  assert.equal(options.port, 443);
  assert.equal(options.rejectUnauthorized, true);
  assert.deepEqual(options.headers, { host: "taxi.example.test" });

  // The lookup function must resolve the production hostname to loopback.
  let resolved;
  options.lookup("taxi.example.test", {}, (error, address, family) => {
    resolved = { error, address, family };
  });
  assert.deepEqual(resolved, { error: null, address: "127.0.0.1", family: 4 });

  // Node 24 may invoke a custom lookup with { all: true }; in that mode the
  // callback must receive an address array (no scalar family argument),
  // otherwise Node throws ERR_INVALID_IP_ADDRESS before connecting.
  let allArgs;
  options.lookup("taxi.example.test", { all: true }, (...args) => {
    allArgs = args;
  });
  assert.equal(allArgs.length, 2);
  assert.equal(allArgs[0], null);
  assert.deepEqual(allArgs[1], [{ address: "127.0.0.1", family: 4 }]);
});

test("certificate hostname validation is enforced by the local edge mechanism", () => {
  const validCert = { subjectaltname: "DNS:taxi.example.test", subject: { CN: "taxi.example.test" } };
  const mismatchedCert = { subjectaltname: "DNS:other.example.test", subject: { CN: "other.example.test" } };

  // Node's TLS verifier accepts only a certificate matching the hostname.
  assert.equal(tls.checkServerIdentity("taxi.example.test", validCert), undefined);
  assert.ok(tls.checkServerIdentity("taxi.example.test", mismatchedCert) instanceof Error);

  // The edge probe relies on Node's verifier (rejectUnauthorized stays true),
  // never on an insecure TLS override.
  assert.equal(localEdgeHttpsOptions("taxi.example.test", "/login", 10_000).rejectUnauthorized, true);
});
