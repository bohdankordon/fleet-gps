import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateGeoJsonPolygon } from "../alert-settings/alert-settings.validation";
import { classifyPointInPolygon } from "./city-geofence.geometry";
import { classifySpeedLimitZone } from "./city-geofence.policy";

const verifier = require("../../../scripts/vinnytsia-boundary-verify.cjs") as {
  ATTRIBUTION: string;
  DATASET_DIRECTORY: string;
  EXPECTED_PLACE_NAME: string;
  EXPECTED_SCOPE: string;
  EXPECTED_SOURCE_ADMIN_LEVEL: string;
  EXPECTED_SOURCE_OBJECT_ID: string;
  run(options: Record<string, unknown>): number;
  verify(rootDir: string, dependencies: Record<string, unknown>): unknown;
};
const repositoryRoot = path.resolve(__dirname, "../../../../..");
const sourceDataset = path.join(repositoryRoot, verifier.DATASET_DIRECTORY);
const dependencies = { validateGeoJsonPolygon, classifyPointInPolygon, classifySpeedLimitZone };

function copiedDataset(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vinnytsia-boundary-"));
  const destination = path.join(root, verifier.DATASET_DIRECTORY);
  fs.mkdirSync(destination, { recursive: true });
  for (const file of ["vinnytsia-city.geojson", "metadata.json", "SHA256SUMS", "control-points.json"]) fs.copyFileSync(path.join(sourceDataset, file), path.join(destination, file));
  return root;
}

function datasetFile(root: string, file: string): string {
  return path.join(root, verifier.DATASET_DIRECTORY, file);
}

function rewriteJson(root: string, file: string, mutate: (value: Record<string, unknown>) => void): void {
  const target = datasetFile(root, file);
  const value = JSON.parse(fs.readFileSync(target, "utf8")) as Record<string, unknown>;
  mutate(value);
  fs.writeFileSync(target, JSON.stringify(value), "utf8");
}

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function points(value: Record<string, unknown>, group: string): Array<Record<string, unknown>> {
  const groupPoints = value[group];
  assert.ok(Array.isArray(groupPoints));
  return groupPoints as Array<Record<string, unknown>>;
}

test("accepts the bundled dataset, production classifier mappings, and immutable geometry without network, Nest, or Prisma", () => {
  const root = copiedDataset();
  const before = fs.readFileSync(datasetFile(root, "vinnytsia-city.geojson"));
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error("network must not be used"); }) as typeof fetch;
  try {
    assert.doesNotThrow(() => verifier.verify(root, dependencies));
    assert.equal(fetchCalls, 0);
    assert.deepEqual(fs.readFileSync(datasetFile(root, "vinnytsia-city.geojson")), before);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects missing, malformed, invalid UTF-8, Feature, and MultiPolygon inputs", () => {
  const cases: Array<(root: string) => void> = [
    (root) => fs.unlinkSync(datasetFile(root, "vinnytsia-city.geojson")),
    (root) => fs.writeFileSync(datasetFile(root, "vinnytsia-city.geojson"), "{", "utf8"),
    (root) => fs.writeFileSync(datasetFile(root, "vinnytsia-city.geojson"), Buffer.from([0xc3, 0x28])),
    (root) => fs.writeFileSync(datasetFile(root, "vinnytsia-city.geojson"), JSON.stringify({ type: "Feature", geometry: null }), "utf8"),
    (root) => fs.writeFileSync(datasetFile(root, "vinnytsia-city.geojson"), JSON.stringify({ type: "MultiPolygon", coordinates: [] }), "utf8"),
  ];
  for (const mutate of cases) {
    const root = copiedDataset();
    try {
      mutate(root);
      assert.throws(() => verifier.verify(root, dependencies));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("rejects geometry and metadata checksum mismatches", () => {
  const checksumRoot = copiedDataset();
  const metadataRoot = copiedDataset();
  try {
    fs.writeFileSync(datasetFile(checksumRoot, "SHA256SUMS"), "0".repeat(64) + "  vinnytsia-city.geojson", "utf8");
    assert.throws(() => verifier.verify(checksumRoot, dependencies));
    rewriteJson(metadataRoot, "metadata.json", (metadata) => { metadata.sha256 = "0".repeat(64); });
    assert.throws(() => verifier.verify(metadataRoot, dependencies));
  } finally {
    fs.rmSync(checksumRoot, { recursive: true, force: true });
    fs.rmSync(metadataRoot, { recursive: true, force: true });
  }
});

test("rejects invalid relation id, scope, licence, attribution, and count metadata", () => {
  const mutations: Array<(metadata: Record<string, unknown>) => void> = [
    (metadata) => { metadata.sourceObjectId = "relation-361818"; },
    (metadata) => { metadata.scope = "hromada"; },
    (metadata) => { metadata.license = "CC0"; },
    (metadata) => { metadata.attribution = "OpenStreetMap"; },
    (metadata) => { metadata.positionCount = 1; },
  ];
  for (const mutate of mutations) {
    const root = copiedDataset();
    try {
      rewriteJson(root, "metadata.json", mutate);
      assert.throws(() => verifier.verify(root, dependencies));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("pins relation 361818, admin level 9, place name, and city scope", () => {
  const acceptedRoot = copiedDataset();
  const rejectedValues: Array<[string, unknown]> = [
    ["sourceObjectId", "12411968"],
    ["sourceObjectId", "90726"],
    ["sourceAdminLevel", "7"],
    ["sourceAdminLevel", null],
    ["sourceAdminLevel", ""],
  ];
  try {
    assert.equal(verifier.EXPECTED_SOURCE_OBJECT_ID, "361818");
    assert.equal(verifier.EXPECTED_SOURCE_ADMIN_LEVEL, "9");
    assert.equal(verifier.EXPECTED_PLACE_NAME, "Вінниця");
    assert.equal(verifier.EXPECTED_SCOPE, "city");
    assert.doesNotThrow(() => verifier.verify(acceptedRoot, dependencies));
    for (const [field, value] of rejectedValues) {
      const root = copiedDataset();
      try {
        rewriteJson(root, "metadata.json", (metadata) => { metadata[field] = value; });
        assert.throws(() => verifier.verify(root, dependencies));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  } finally {
    fs.rmSync(acceptedRoot, { recursive: true, force: true });
  }
});

test("requires both hromada outside points and globally unique point IDs", () => {
  const mutations: Array<(controls: Record<string, unknown>) => void> = [
    (controls) => { controls.outside = points(controls, "outside").filter((point) => point.id !== "vinnytski-khutory-centre"); },
    (controls) => { controls.outside = points(controls, "outside").filter((point) => point.id !== "desna-centre"); },
    (controls) => { points(controls, "outside")[0]!.id = points(controls, "inside")[0]!.id; },
    (controls) => {
      const outside = points(controls, "outside");
      const point = outside.find((candidate) => candidate.id === "vinnytski-khutory-centre");
      assert.ok(point !== undefined);
      controls.outside = outside.filter((candidate) => candidate !== point);
      point.expectedClassification = "INSIDE";
      points(controls, "inside").push(point);
    },
  ];
  for (const mutate of mutations) {
    const root = copiedDataset();
    try {
      rewriteJson(root, "control-points.json", mutate);
      assert.throws(() => verifier.verify(root, dependencies));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("safe verifier output never exposes coordinates or source paths", () => {
  const output: string[] = [];
  const root = copiedDataset();
  try {
    assert.equal(verifier.run({ rootDir: root, dependencies, output: (line: string) => output.push(line) }), 0);
    const text = output.join(" ");
    assert.equal(text.includes("28.4687"), false);
    assert.equal(text.includes(root), false);
    assert.ok(output.includes("network requests: 0"));
    assert.ok(output.includes("database initialized: false"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("bundled control-point geometry checksum is stable for fixture setup", () => {
  const root = copiedDataset();
  try {
    const geometry = datasetFile(root, "vinnytsia-city.geojson");
    const metadata = JSON.parse(fs.readFileSync(datasetFile(root, "metadata.json"), "utf8")) as { sha256: string };
    assert.equal(sha256(geometry), metadata.sha256);
    assert.equal(verifier.ATTRIBUTION, "© OpenStreetMap contributors");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
