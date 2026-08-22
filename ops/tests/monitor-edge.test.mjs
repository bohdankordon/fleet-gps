import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import https from "node:https";
import tls from "node:tls";
import test from "node:test";
import { localEdgeHttpsOptions, probeLocalHttps } from "../lib/monitor-runtime.mjs";

const TEST_HOSTNAME = "taxi.example.test";
const TEST_KEY = Buffer.from("LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2Z0lCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktnd2dnU2tBZ0VBQW9JQkFRRHZSWEswczcwbWpaWkYKR0V1aTVSeVZ1bFcwbTVVWXdWQnEwWksvZkh3emVmZWNlU3V3aDE3ek5tNlNNQTdxS0Y1UzBHRFlWUjdKVnJVbApEMnRFOXozZkJ5WUFjM0h3SFYwUzFQVi9vdXF4NVhyOERFazEzY20ydXo1cHdUTW8vckd2c3BNRzk3eFh1V3lKCmg5VGpvV0poTXVaN0ZJdmMrdkRkWllaRi9JYkRMajVSVE82c1F3akViM3dwV3FsZEdBMGNNUmdxdWpIOTIvWFEKSUVaN1g2NHdIS01GWVFmODRHNFdnZnNvSkU5TGliWFU5VjJVbU85RWU2M3NaNXl5ZnJEaHgrbW42cmJ5RjEzSQpPSE9OUEJReG1aN1hZSXNTWThUOVZiZ0Jvd204R3FiTEFxQVJrM3RhSzMwQzZzSk5qVndxV0xDUnJ0SUh6ZC9lCmFudHlLU1ZaQWdNQkFBRUNnZ0VBVjFPaWRMOHc1dFJBSndHaUFWYmJZdTQ1LzR2VkU4N2lPY281WS9mY0lMR0EKSkxTNHRGb0Qxb0prUXFpVm1QS1kwbUxKSmN1VFMrcUFmSUV2Sm1HU1RFY0FvS09CengvNGF6b2NTN1E3TWloTwpCWlc2VnBXVzNFRmtteFp2UktRSVY5YTJBSklFUklRaFQrU3FWMVg4WVB0QjBXUURVK2ltWmpkNmxTcUFTTlZ3Ck1vVVYvd0dlRWRnQmJ0eW92aVpDb1BybUViM28vdHNMRzZNanRIaWZjZHNkVEdEVWZPMVB1MnhqSHZRanpXUm4Kckt1dWlVMUNXZW1qbjRoM2tRSGlBQ1lmN3FOTHFKMmtmRG1hQ1VxNVRadm1BMUdLRytRdnJVWFF1bk10WkRlRAphUk01OGxwNVlFVTBUS1VCRjJDMUNwU0JQcHRPNytmZ3pENzVnWDdaSFFLQmdRRDN3Z08wNHZsaGtBMDg2WTIzCjU3c0xJYlBsVDh6VzdtaUg5NmV6aEZEQzBxeEtNL2dKeG8vZE1OOTVzaHFUa3ByUlZFNGF3bFB2TWtRTjNFM1MKMXNZdnJvaE1Wa21rL1pwT1l3U0l4RDBkdlREcld3VkdEUlhWKytuM3YzWXd4SlBLcnJpYlhJeGlHa3NsMVdhQwpvSHlvcm1VcnBmUStpcy9iZ1hkYzRxMVh5d0tCZ1FEM095aTUvbmFhb25ZT0VrSmJaWTRsaDlNT1R4c3RXZXVrCnFISG5ENkRkRDVvcFBTU2RSTmN0dWxHL1VjNXBER0Z1NE1ydVl5SkxleTM4ckJxR284TUJDTEZmcENmc0RySkkKdGMzNFk3ZlFuZWJMY20zYkZIVFh4b3pnU2dLNUdia2xQeitTZmRGNFNFV1ZNN3RPaEVkdy90R3dpSkovd3I2Swp2dmZmd3g3cTZ3S0JnUURsOE5LdjF0Zk1qSDA4d3lZY1FKMS92MC9PeXprNVlScnkxZzUydFo2ZXNoZms1a2FXCkRBc0pKb3JCejJLTEE4MWI2ZnB6SzFmcTc2UHBtVVZCSU1QZkRRVENsSExWQmVsb1JzMjJnU3FYcHpiM3VBbzAKOFlBS2tUcWNETDRNbE9UMWZ5TW1UY2FjWmZySXFqM3hqakVqL0hjNUExU2psd0ZDbisyLzcwRWg4UUtCZ0h0bQpETXJoQnNQaUNQaTNCbVhtQjVBVi9qTXJLczUxRGxmT042UHp1Zi84bEo2MnhQcTJiSXlIYmR3SGNmWWUxdGJuCjNvSWordThmMlhFL1diSVFOUG5rSTl3djdEazNrS2NZRDJsR0pHNDlFZ0JENmk4cVE3T2JoNTgvY2FLQUExaGkKL0ZFYStaMkd2U3hlZU1RVTVDK3pFR2lEa2xPd21UaFpYeEZScTdIbkFvR0JBTVErTGQwd0s4RW9HZUdJRG1VaQpBL0NTQnJOejRDUk8vTEZpNmtjM1JOWTVuNGowcE4wcXU0MTd5ODlZSXFHRXdRWGNWNFcyOEI1bWgvMnN4Y3gwCmdneElIUVAwZG9hQ2VWb2cwbGJUbGJZNmEySUlyZGNSUnRiZEd2dzMwUEZyQStrVjQzOVd2TStabHFtZXpZSWUKcjZPUlY2MnVZYWlhV0hGK1VIQzFzcXhnCi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0K", "base64").toString("ascii");
const TEST_CERTIFICATE = Buffer.from("LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUROekNDQWgrZ0F3SUJBZ0lVTVh1bklZYm1LMC9ZZmhwQjdmNUVFbDNCb3F3d0RRWUpLb1pJaHZjTkFRRUwKQlFBd0hERWFNQmdHQTFVRUF3d1JkR0Y0YVM1bGVHRnRjR3hsTG5SbGMzUXdIaGNOTWpZd09ESXlNakF3TWpBMQpXaGNOTXpZd09ERTVNakF3TWpBMVdqQWNNUm93R0FZRFZRUUREQkYwWVhocExtVjRZVzF3YkdVdWRHVnpkRENDCkFTSXdEUVlKS29aSWh2Y05BUUVCQlFBRGdnRVBBRENDQVFvQ2dnRUJBTzlGY3JTenZTYU5sa1VZUzZMbEhKVzYKVmJTYmxSakJVR3JSa3I5OGZETjU5NXg1SzdDSFh2TTJicEl3RHVvb1hsTFFZTmhWSHNsV3RTVVBhMFQzUGQ4SApKZ0J6Y2ZBZFhSTFU5WCtpNnJIbGV2d01TVFhkeWJhN1BtbkJNeWorc2EreWt3YjN2RmU1YkltSDFPT2hZbUV5CjVuc1VpOXo2OE4xbGhrWDhoc011UGxGTTdxeERDTVJ2ZkNsYXFWMFlEUnd4R0NxNk1mM2I5ZEFnUm50ZnJqQWMKb3dWaEIvemdiaGFCK3lna1QwdUp0ZFQxWFpTWTcwUjdyZXhubkxKK3NPSEg2YWZxdHZJWFhjZzRjNDA4RkRHWgpudGRnaXhKanhQMVZ1QUdqQ2J3YXBzc0NvQkdUZTFvcmZRTHF3azJOWENwWXNKR3UwZ2ZOMzk1cWUzSXBKVmtDCkF3RUFBYU54TUc4d0hRWURWUjBPQkJZRUZDaTB6WFN5RDMxSkFUb1diV2lrS2xUS2pselZNQjhHQTFVZEl3UVkKTUJhQUZDaTB6WFN5RDMxSkFUb1diV2lrS2xUS2pselZNQThHQTFVZEV3RUIvd1FGTUFNQkFmOHdIQVlEVlIwUgpCQlV3RTRJUmRHRjRhUzVsZUdGdGNHeGxMblJsYzNRd0RRWUpLb1pJaHZjTkFRRUxCUUFEZ2dFQkFKQzhFNmhwClcxV1J0d1NsN25ZanpmMTlnTmhueGIvOGNiejdnZUI0MHJhdkV1ang4Mm5mQTZ6N0ZieWYyUnVPM2RhdHlZNzkKZVcyb0xjREFZTlRvMHFTejBaR1F6NUVhTkxXeVloQlFlT3liK0hkTytZbkthV0pqakxWeklhTVpHbmUxQ01uSgpJRVF2M2J3TTJtOXBuTnhsMEJyQmF6end3RXJmeDBEMlN4cVIvZ2FpU0xPclg4R1U0QURDNEx5ZllzYjFxM09KCmlaaG5qcFNNb3ZySWNzRUVobFNwemZZU0Q2Vk5oWFFMT0J3KzEyTnhGekJvTXhlU3NLR3NJNG5TVDgrRE53MUoKWXZ3YlAwZ0QvUE5aaVpIb1lRYkdWV2FsUGdjNzFMalgzWXJheitIT2VaQ0ZNZ3d3YlZLSjMzWTJDRzRnK0M0TgoyblhNWTQrcitzeENjNEE9Ci0tLS0tRU5EIENFUlRJRklDQVRFLS0tLS0K", "base64").toString("ascii");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function requestWith(options, callback, port, trustCertificate) {
  return https.request({ ...options, port, ...(trustCertificate ? { ca: TEST_CERTIFICATE } : {}) }, callback);
}

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

  let allResolved;
  options.lookup("taxi.example.test", { hints: 0, all: true }, (error, addresses) => {
    allResolved = { error, addresses };
  });
  assert.deepEqual(allResolved, { error: null, addresses: [{ address: "127.0.0.1", family: 4 }] });
});

test("Node 24 rejects the RC.2 scalar all-address result but accepts the repaired HTTPS monitor lookup", async (t) => {
  let received;
  const server = https.createServer({ key: TEST_KEY, cert: TEST_CERTIFICATE }, (request, response) => {
    received = { host: request.headers.host, path: request.url, servername: request.socket.servername };
    response.writeHead(200).end();
  });
  const port = await listen(server);
  t.after(() => close(server));

  const legacy = localEdgeHttpsOptions(TEST_HOSTNAME, "/login", 1_000);
  legacy.port = port;
  legacy.ca = TEST_CERTIFICATE;
  legacy.lookup = (_hostname, _options, callback) => callback(null, "127.0.0.1", 4);
  const legacyError = await new Promise((resolve) => {
    const request = https.request(legacy, (response) => response.resume());
    request.on("error", resolve);
    request.end();
  });
  assert.equal(legacyError.code, "ERR_INVALID_IP_ADDRESS");

  let lookupOptions;
  const result = await probeLocalHttps({
    hostname: TEST_HOSTNAME,
    requestPath: "/login",
    httpsTimeout: 1_000,
    request: (options, callback) => {
      const lookup = options.lookup;
      return requestWith({
        ...options,
        lookup: (hostname, options, callback) => {
          lookupOptions = options;
          lookup(hostname, options, callback);
        },
      }, callback, port, true);
    },
  });
  assert.deepEqual(result, { ok: true, status: 200 });
  assert.equal(lookupOptions.all, true);
  assert.deepEqual(received, { host: TEST_HOSTNAME, path: "/login", servername: TEST_HOSTNAME });
});

test("monitor probe returns unhealthy for DNS errors and timeouts", async () => {
  const dnsFailure = await probeLocalHttps({
    hostname: TEST_HOSTNAME,
    requestPath: "/login",
    httpsTimeout: 1_000,
    request: (options, callback) => https.request({
      ...options,
      lookup: (_hostname, _options, done) => done(Object.assign(new Error("DNS failure"), { code: "ENOTFOUND" })),
    }, callback),
  });
  assert.deepEqual(dnsFailure, { ok: false });

  let destroyed = false;
  const timeout = await probeLocalHttps({
    hostname: TEST_HOSTNAME,
    requestPath: "/login",
    httpsTimeout: 1_000,
    request: () => {
      const request = new EventEmitter();
      request.destroy = () => { destroyed = true; };
      request.end = () => queueMicrotask(() => request.emit("timeout"));
      return request;
    },
  });
  assert.deepEqual(timeout, { ok: false });
  assert.equal(destroyed, true);
});

test("monitor probe preserves TLS verification", async (t) => {
  const server = https.createServer({ key: TEST_KEY, cert: TEST_CERTIFICATE }, (_request, response) => response.writeHead(200).end());
  const port = await listen(server);
  t.after(() => close(server));

  let rejectUnauthorized;
  const result = await probeLocalHttps({
    hostname: TEST_HOSTNAME,
    requestPath: "/login",
    httpsTimeout: 1_000,
    request: (options, callback) => {
      rejectUnauthorized = options.rejectUnauthorized;
      return requestWith(options, callback, port, false);
    },
  });
  assert.deepEqual(result, { ok: false });
  assert.equal(rejectUnauthorized, true);
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
