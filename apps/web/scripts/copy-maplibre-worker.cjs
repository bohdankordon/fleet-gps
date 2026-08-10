const { copyFileSync, mkdirSync, statSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..", "..", "..", "node_modules", "maplibre-gl", "dist");
const publicRoot = resolve(__dirname, "..", "public", "maplibre");
const assets = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(publicRoot, { recursive: true });
for (const asset of assets) {
  const source = resolve(packageRoot, asset);
  if (!statSync(source).isFile()) throw new Error(`Missing MapLibre worker asset: ${asset}`);
  copyFileSync(source, resolve(publicRoot, asset));
}

process.stdout.write(`Prepared ${assets.length} same-origin MapLibre worker assets in ${dirname(resolve(publicRoot, assets[0]))}.\n`);
