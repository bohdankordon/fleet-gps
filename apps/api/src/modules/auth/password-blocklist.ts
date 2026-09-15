import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PASSWORD_BLOCKLIST_WHITESPACE_RULE } from "./password-canonical";

export const PASSWORD_BLOCKLIST_DIGEST_WIDTH = 32;
export const PASSWORD_BLOCKLIST_FORMAT_VERSION = 1;
const EXPECTED_NORMALIZATION_RULES = Object.freeze([
  "decode source as strict UTF-8",
  "Unicode NFKC normalization",
  "deterministic Unicode lowercase",
  PASSWORD_BLOCKLIST_WHITESPACE_RULE,
  "omit empty identities and identities over 128 Unicode code points",
  "UTF-8 encode and SHA-256",
  "deduplicate and lexicographically sort full digests",
]);

type PasswordBlocklistMetadata = Readonly<{
  formatVersion: number;
  canonicalDigestCount: number;
  digestAlgorithm: string;
  digestWidthBytes: number;
  binarySha256: string;
  normalizationRules: readonly string[];
  attribution: Readonly<{ secLists: string; pwdb: string; notice: string }>;
  source: Readonly<{ repository: string; commit: string; path: string; blobSha: string; downloadedSha256: string; recordCount: number }>;
}>;

const EXPECTED_SOURCE = Object.freeze({
  repository: "https://github.com/danielmiessler/SecLists",
  commit: "e57f8ad37904658709bceb20b82f22a0e9f2046f",
  path: "Passwords/Common-Credentials/Pwdb_top-1000000.txt",
  blobSha: "99665aeb16c221dfb9a258e39dd58fa37116cfdd",
  downloadedSha256: "e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8",
  recordCount: 1_000_000,
});

export class PasswordBlocklistArtifactError extends Error {
  public constructor(message: string) { super(message); this.name = "PasswordBlocklistArtifactError"; }
}

function parseMetadata(bytes: Buffer): PasswordBlocklistMetadata {
  let candidate: unknown;
  try { candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new PasswordBlocklistArtifactError("Password blocklist metadata is unreadable."); }
  if (typeof candidate !== "object" || candidate === null) throw new PasswordBlocklistArtifactError("Password blocklist metadata is invalid.");
  const metadata = candidate as Partial<PasswordBlocklistMetadata>;
  if (metadata.formatVersion !== PASSWORD_BLOCKLIST_FORMAT_VERSION || metadata.digestAlgorithm !== "SHA-256" || metadata.digestWidthBytes !== PASSWORD_BLOCKLIST_DIGEST_WIDTH || !Number.isSafeInteger(metadata.canonicalDigestCount) || (metadata.canonicalDigestCount ?? 0) <= 0 || typeof metadata.binarySha256 !== "string" || !/^[0-9a-f]{64}$/u.test(metadata.binarySha256)) throw new PasswordBlocklistArtifactError("Password blocklist metadata format is unsupported.");
  if (!Array.isArray(metadata.normalizationRules) || metadata.normalizationRules.length !== EXPECTED_NORMALIZATION_RULES.length || metadata.normalizationRules.some((rule, index) => rule !== EXPECTED_NORMALIZATION_RULES[index])) throw new PasswordBlocklistArtifactError("Password blocklist normalization metadata is unsupported.");
  if (typeof metadata.attribution !== "object" || metadata.attribution === null || [metadata.attribution.secLists, metadata.attribution.pwdb, metadata.attribution.notice].some((value) => typeof value !== "string" || value.length === 0)) throw new PasswordBlocklistArtifactError("Password blocklist attribution metadata is missing.");
  if (typeof metadata.source !== "object" || metadata.source === null || Object.entries(EXPECTED_SOURCE).some(([key, value]) => metadata.source?.[key as keyof typeof EXPECTED_SOURCE] !== value)) throw new PasswordBlocklistArtifactError("Password blocklist source identity is unsupported.");
  return metadata as PasswordBlocklistMetadata;
}

export class PasswordBlocklist {
  public readonly count: number;
  public constructor(private readonly binary: Buffer, metadata: PasswordBlocklistMetadata) {
    if (binary.byteLength === 0 || binary.byteLength % PASSWORD_BLOCKLIST_DIGEST_WIDTH !== 0) throw new PasswordBlocklistArtifactError("Password blocklist binary width is invalid.");
    this.count = binary.byteLength / PASSWORD_BLOCKLIST_DIGEST_WIDTH;
    if (this.count !== metadata.canonicalDigestCount) throw new PasswordBlocklistArtifactError("Password blocklist record count does not match metadata.");
    const checksum = createHash("sha256").update(binary).digest("hex");
    if (checksum !== metadata.binarySha256) throw new PasswordBlocklistArtifactError("Password blocklist checksum does not match metadata.");
    for (let offset = PASSWORD_BLOCKLIST_DIGEST_WIDTH; offset < binary.byteLength; offset += PASSWORD_BLOCKLIST_DIGEST_WIDTH) {
      if (Buffer.compare(binary.subarray(offset - PASSWORD_BLOCKLIST_DIGEST_WIDTH, offset), binary.subarray(offset, offset + PASSWORD_BLOCKLIST_DIGEST_WIDTH)) >= 0) throw new PasswordBlocklistArtifactError("Password blocklist must be strictly sorted without duplicates.");
    }
  }

  public hasDigest(digest: Uint8Array): boolean {
    if (digest.byteLength !== PASSWORD_BLOCKLIST_DIGEST_WIDTH) return false;
    const needle = Buffer.from(digest.buffer, digest.byteOffset, digest.byteLength);
    let low = 0;
    let high = this.count - 1;
    while (low <= high) {
      const middle = low + Math.floor((high - low) / 2);
      const offset = middle * PASSWORD_BLOCKLIST_DIGEST_WIDTH;
      const comparison = Buffer.compare(needle, this.binary.subarray(offset, offset + PASSWORD_BLOCKLIST_DIGEST_WIDTH));
      if (comparison === 0) return true;
      if (comparison < 0) high = middle - 1;
      else low = middle + 1;
    }
    return false;
  }

  public hasIdentity(identity: string): boolean {
    return this.hasDigest(createHash("sha256").update(identity, "utf8").digest());
  }
}

export function loadPasswordBlocklist(binaryPath: string, metadataPath: string): PasswordBlocklist {
  let binary: Buffer;
  let metadataBytes: Buffer;
  try { binary = readFileSync(binaryPath); metadataBytes = readFileSync(metadataPath); }
  catch { throw new PasswordBlocklistArtifactError("Required password blocklist artifact is missing."); }
  return new PasswordBlocklist(binary, parseMetadata(metadataBytes));
}

function bundledAssetDirectory(): string {
  const compiled = resolve(__dirname, "../../assets/password-policy");
  if (existsSync(compiled)) return compiled;
  const repository = resolve(__dirname, "../../../assets/password-policy");
  if (existsSync(repository)) return repository;
  throw new PasswordBlocklistArtifactError("Required bundled password blocklist directory is missing.");
}

const assetDirectory = bundledAssetDirectory();
export const COMMON_PASSWORD_BLOCKLIST = loadPasswordBlocklist(resolve(assetDirectory, "common-passwords.bin"), resolve(assetDirectory, "common-passwords.metadata.json"));
