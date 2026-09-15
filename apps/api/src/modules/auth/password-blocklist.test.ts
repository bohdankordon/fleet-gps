import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { buildPasswordBlocklistMetadata, canonicalizeSourceEntry, generatePasswordBlocklist } from "../../maintenance/password-blocklist-generator";
import { PASSWORD_BLOCKLIST_WHITESPACE_RULE, canonicalBlocklistIdentity, trimBlocklistWhitespace } from "./password-canonical";
import { loadPasswordBlocklist, PasswordBlocklistArtifactError } from "./password-blocklist";

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "fleet-gps-password-blocklist-"));
  const source = Buffer.from("password\n\uFF30\uFF21\uFF33\uFF33\uFF37\uFF2F\uFF32\uFF24\n password \nunique phrase\n\n", "utf8");
  const generated = generatePasswordBlocklist(source);
  const metadata = {
    ...JSON.parse(readFileSync(resolve(process.cwd(), "assets/password-policy/common-passwords.metadata.json"), "utf8")) as Record<string, unknown>,
    canonicalDigestCount: generated.digestCount,
    binarySha256: createHash("sha256").update(generated.binary).digest("hex"),
  };
  const binaryPath = resolve(directory, "common-passwords.bin");
  const metadataPath = resolve(directory, "common-passwords.metadata.json");
  writeFileSync(binaryPath, generated.binary);
  writeFileSync(metadataPath, JSON.stringify(metadata));
  return { directory, source, generated, metadata: metadata as Record<string, unknown>, binaryPath, metadataPath };
}

test("generation is deterministic, fixed-width, sorted, and deduplicated after canonicalization", () => {
  const source = Buffer.from("password\n\uFF30\uFF21\uFF33\uFF33\uFF37\uFF2F\uFF32\uFF24\n password \nunique phrase\n\n", "utf8");
  const first = generatePasswordBlocklist(source);
  const second = generatePasswordBlocklist(source);
  assert.deepEqual(first.binary, second.binary);
  assert.deepEqual(buildPasswordBlocklistMetadata(source, first), buildPasswordBlocklistMetadata(source, second));
  assert.equal(first.sourceRecordCount, 5);
  assert.equal(first.digestCount, 2);
  assert.equal(first.binary.byteLength, 64);
  assert.ok(Buffer.compare(first.binary.subarray(0, 32), first.binary.subarray(32, 64)) < 0);
});

test("canonicalization uses true Unicode White_Space trimming shared with runtime", () => {
  assert.equal(PASSWORD_BLOCKLIST_WHITESPACE_RULE, "remove only leading and trailing Unicode \\p{White_Space}");
  assert.equal(canonicalizeSourceEntry("  password  "), "password");
  assert.equal(canonicalizeSourceEntry("\u0085password\u0085"), "password");
  assert.equal("\u0085password\u0085".trim(), "\u0085password\u0085");
  assert.equal(trimBlocklistWhitespace("\u0085password\u0085"), "password");
  assert.equal(canonicalBlocklistIdentity("  PASSWORD  "), "password");
  assert.equal(canonicalBlocklistIdentity("\u0085PASSWORD\u0085"), "password");
  assert.equal(canonicalizeSourceEntry("a b"), "a b");
  assert.equal(trimBlocklistWhitespace("  violet otters  navigate "), "violet otters  navigate");
  assert.equal(canonicalizeSourceEntry("\uFF30\uFF21\uFF33\uFF33\uFF37\uFF2F\uFF32\uFF24"), "password");
  const padded = Buffer.from("password\n\u0085password\u0085\n  PASSWORD  \nunique phrase\n\n", "utf8");
  const generated = generatePasswordBlocklist(padded);
  assert.equal(generated.sourceRecordCount, 5);
  assert.equal(generated.digestCount, 2);
  const again = generatePasswordBlocklist(padded);
  assert.deepEqual(generated.binary, again.binary);
  assert.deepEqual(buildPasswordBlocklistMetadata(padded, generated), buildPasswordBlocklistMetadata(padded, again));
});

test("runtime performs exact full-digest lookup", () => {
  const state = fixture();
  try {
    const index = loadPasswordBlocklist(state.binaryPath, state.metadataPath);
    assert.equal(index.hasIdentity("password"), true);
    assert.equal(index.hasIdentity("unique phrase"), true);
    assert.equal(index.hasIdentity("not present"), false);
    assert.equal(index.hasDigest(createHash("sha256").update("password").digest()), true);
    assert.equal(index.hasDigest(Buffer.alloc(31)), false);
  } finally { rmSync(state.directory, { recursive: true, force: true }); }
});

test("missing, malformed-width, and corrupt-checksum artifacts fail securely", () => {
  const state = fixture();
  try {
    assert.throws(() => loadPasswordBlocklist(resolve(state.directory, "missing.bin"), state.metadataPath), PasswordBlocklistArtifactError);
    writeFileSync(state.binaryPath, Buffer.alloc(31));
    assert.throws(() => loadPasswordBlocklist(state.binaryPath, state.metadataPath), /width/);
    writeFileSync(state.binaryPath, state.generated.binary);
    const corrupt = Buffer.from(state.generated.binary); corrupt[0] = corrupt[0]! ^ 0xff; writeFileSync(state.binaryPath, corrupt);
    assert.throws(() => loadPasswordBlocklist(state.binaryPath, state.metadataPath), /checksum/);
  } finally { rmSync(state.directory, { recursive: true, force: true }); }
});

test("runtime rejects unsorted and duplicate adjacent digests even with a matching checksum", () => {
  const state = fixture();
  try {
    for (const invalid of [
      Buffer.concat([state.generated.binary.subarray(32, 64), state.generated.binary.subarray(0, 32)]),
      Buffer.concat([state.generated.binary.subarray(0, 32), state.generated.binary.subarray(0, 32)]),
    ]) {
      writeFileSync(state.binaryPath, invalid);
      writeFileSync(state.metadataPath, JSON.stringify({ ...state.metadata, binarySha256: createHash("sha256").update(invalid).digest("hex") }));
      assert.throws(() => loadPasswordBlocklist(state.binaryPath, state.metadataPath), /strictly sorted/);
    }
  } finally { rmSync(state.directory, { recursive: true, force: true }); }
});

test("runtime rejects unsupported metadata and source identity", () => {
  const state = fixture();
  try {
    writeFileSync(state.metadataPath, JSON.stringify({ ...state.metadata, formatVersion: 2 }));
    assert.throws(() => loadPasswordBlocklist(state.binaryPath, state.metadataPath), /format/);
    const source = state.metadata.source as Record<string, unknown>;
    writeFileSync(state.metadataPath, JSON.stringify({ ...state.metadata, source: { ...source, commit: "floating-main" } }));
    assert.throws(() => loadPasswordBlocklist(state.binaryPath, state.metadataPath), /source identity/);
  } finally { rmSync(state.directory, { recursive: true, force: true }); }
});

test("production build contains a loadable binary and deterministic metadata", () => {
  const binaryPath = resolve(process.cwd(), "dist/assets/password-policy/common-passwords.bin");
  const metadataPath = resolve(process.cwd(), "dist/assets/password-policy/common-passwords.metadata.json");
  const index = loadPasswordBlocklist(binaryPath, metadataPath);
  assert.equal(index.count, 937_010);
  assert.equal(index.hasIdentity("password1234"), true);
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as { binarySha256: string; normalizationRules: string[] };
  assert.equal(createHash("sha256").update(readFileSync(binaryPath)).digest("hex"), metadata.binarySha256);
  assert.equal(metadata.normalizationRules[3], PASSWORD_BLOCKLIST_WHITESPACE_RULE);
});
