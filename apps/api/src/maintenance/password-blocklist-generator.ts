import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const PASSWORD_BLOCKLIST_SOURCE = Object.freeze({
  repository: "https://github.com/danielmiessler/SecLists",
  commit: "e57f8ad37904658709bceb20b82f22a0e9f2046f",
  path: "Passwords/Common-Credentials/Pwdb_top-1000000.txt",
  blobSha: "99665aeb16c221dfb9a258e39dd58fa37116cfdd",
  downloadedSha256: "e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8",
  recordCount: 1_000_000,
});

export const PASSWORD_BLOCKLIST_FORMAT_VERSION = 1;
export const PASSWORD_BLOCKLIST_DIGEST_WIDTH = 32;

export type GeneratedPasswordBlocklist = Readonly<{
  binary: Buffer;
  sourceRecordCount: number;
  digestCount: number;
}>;

export function gitBlobSha(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

export function canonicalizeSourceEntry(entry: string): string {
  return entry.normalize("NFKC").toLowerCase().trim();
}

export function generatePasswordBlocklist(sourceBytes: Uint8Array): GeneratedPasswordBlocklist {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
  const records = decoded.split("\n");
  if (records.at(-1) === "") records.pop();
  const digests: Buffer[] = [];
  for (const record of records) {
    const withoutCr = record.endsWith("\r") ? record.slice(0, -1) : record;
    const canonical = canonicalizeSourceEntry(withoutCr);
    if (canonical.length === 0 || Array.from(canonical).length > 128) continue;
    digests.push(createHash("sha256").update(canonical, "utf8").digest());
  }
  digests.sort(Buffer.compare);
  const unique: Buffer[] = [];
  for (const digest of digests) {
    if (unique.length === 0 || !digest.equals(unique[unique.length - 1]!)) unique.push(digest);
  }
  const binary = Buffer.concat(unique);
  validateGeneratedPasswordBlocklist(binary, unique.length);
  return Object.freeze({ binary, sourceRecordCount: records.length, digestCount: unique.length });
}

export function validateGeneratedPasswordBlocklist(binary: Buffer, expectedCount: number): void {
  if (binary.byteLength !== expectedCount * PASSWORD_BLOCKLIST_DIGEST_WIDTH || binary.byteLength === 0) throw new Error("Generated password blocklist has an invalid byte length.");
  for (let offset = PASSWORD_BLOCKLIST_DIGEST_WIDTH; offset < binary.byteLength; offset += PASSWORD_BLOCKLIST_DIGEST_WIDTH) {
    const previous = binary.subarray(offset - PASSWORD_BLOCKLIST_DIGEST_WIDTH, offset);
    const current = binary.subarray(offset, offset + PASSWORD_BLOCKLIST_DIGEST_WIDTH);
    if (Buffer.compare(previous, current) >= 0) throw new Error("Generated password blocklist is not strictly sorted and deduplicated.");
  }
}

export function buildPasswordBlocklistMetadata(sourceBytes: Uint8Array, generated: GeneratedPasswordBlocklist): Readonly<Record<string, unknown>> {
  return Object.freeze({
    formatVersion: PASSWORD_BLOCKLIST_FORMAT_VERSION,
    source: {
      repository: PASSWORD_BLOCKLIST_SOURCE.repository,
      commit: PASSWORD_BLOCKLIST_SOURCE.commit,
      path: PASSWORD_BLOCKLIST_SOURCE.path,
      blobSha: gitBlobSha(sourceBytes),
      downloadedSha256: createHash("sha256").update(sourceBytes).digest("hex"),
      recordCount: generated.sourceRecordCount,
    },
    canonicalDigestCount: generated.digestCount,
    normalizationRules: [
      "decode source as strict UTF-8",
      "Unicode NFKC normalization",
      "deterministic Unicode lowercase",
      "remove leading and trailing Unicode whitespace",
      "omit empty identities and identities over 128 Unicode code points",
      "UTF-8 encode and SHA-256",
      "deduplicate and lexicographically sort full digests",
    ],
    digestAlgorithm: "SHA-256",
    digestWidthBytes: PASSWORD_BLOCKLIST_DIGEST_WIDTH,
    binarySha256: createHash("sha256").update(generated.binary).digest("hex"),
    attribution: {
      secLists: "SecLists by Daniel Miessler and contributors; upstream repository license is MIT.",
      pwdb: "Source corpus is attributed by SecLists to the Pwdb project (ignis-sec/Pwdb-Public).",
      notice: "This repository contains only a derived digest index, not the upstream plaintext wordlist. See NOTICE.md and the pinned upstream repository for attribution and license text.",
    },
  });
}

async function downloadPinnedSource(): Promise<Buffer> {
  const url = `https://raw.githubusercontent.com/danielmiessler/SecLists/${PASSWORD_BLOCKLIST_SOURCE.commit}/${PASSWORD_BLOCKLIST_SOURCE.path}`;
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`Pinned password source download failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

export function verifyPinnedSource(sourceBytes: Uint8Array): void {
  const blobSha = gitBlobSha(sourceBytes);
  const downloadedSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  if (blobSha !== PASSWORD_BLOCKLIST_SOURCE.blobSha) throw new Error(`Pinned source Git blob mismatch: expected ${PASSWORD_BLOCKLIST_SOURCE.blobSha}, received ${blobSha}.`);
  if (downloadedSha256 !== PASSWORD_BLOCKLIST_SOURCE.downloadedSha256) throw new Error(`Pinned source SHA-256 mismatch: expected ${PASSWORD_BLOCKLIST_SOURCE.downloadedSha256}, received ${downloadedSha256}.`);
}

async function main(): Promise<void> {
  const sourceBytes = await downloadPinnedSource();
  verifyPinnedSource(sourceBytes);
  const generated = generatePasswordBlocklist(sourceBytes);
  if (generated.sourceRecordCount !== PASSWORD_BLOCKLIST_SOURCE.recordCount) throw new Error(`Pinned source record count mismatch: expected ${PASSWORD_BLOCKLIST_SOURCE.recordCount}, received ${generated.sourceRecordCount}.`);
  const metadata = buildPasswordBlocklistMetadata(sourceBytes, generated);
  const outputDirectory = resolve(process.cwd(), "assets", "password-policy");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "common-passwords.bin"), generated.binary);
  writeFileSync(resolve(outputDirectory, "common-passwords.metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  process.stdout.write(`Source records: ${generated.sourceRecordCount}\nCanonical digests: ${generated.digestCount}\nBinary bytes: ${generated.binary.byteLength}\n`);
}

if (require.main === module) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Password blocklist generation failed."}\n`); process.exitCode = 1; });
