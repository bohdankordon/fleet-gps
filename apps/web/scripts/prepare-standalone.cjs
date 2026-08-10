const fs = require("node:fs");
const path = require("node:path");

function findFiles(root, fileName) {
  const matches = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) matches.push(...findFiles(entryPath, fileName));
    else if (entry.isFile() && entry.name === fileName) matches.push(entryPath);
  }
  return matches;
}

function discoverStandaloneWebRoot(webRoot = path.resolve(__dirname, "..")) {
  const standaloneRoot = path.join(webRoot, ".next", "standalone");
  if (!fs.existsSync(standaloneRoot)) throw new Error(`Standalone output is missing: ${standaloneRoot}. Run the web build first.`);
  const serverPaths = findFiles(standaloneRoot, "server.js");
  if (serverPaths.length !== 1) throw new Error(`Expected one standalone server.js outside node_modules in ${standaloneRoot}; found ${serverPaths.length}.`);
  return path.dirname(serverPaths[0]);
}

function copyRequiredAssets(webRoot = path.resolve(__dirname, "..")) {
  const sourcePublic = path.join(webRoot, "public");
  const sourceStatic = path.join(webRoot, ".next", "static");
  if (!fs.statSync(sourcePublic, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Required public assets are missing: ${sourcePublic}`);
  if (!fs.statSync(sourceStatic, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Required Next static assets are missing: ${sourceStatic}`);

  const standaloneWebRoot = discoverStandaloneWebRoot(webRoot);
  const destinations = [
    [sourcePublic, path.join(standaloneWebRoot, "public")],
    [sourceStatic, path.join(standaloneWebRoot, ".next", "static")],
  ];
  for (const [source, destination] of destinations) {
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
  }
  return { standaloneWebRoot, serverPath: path.join(standaloneWebRoot, "server.js") };
}

if (require.main === module) {
  const result = copyRequiredAssets();
  process.stdout.write(`Prepared standalone assets in ${result.standaloneWebRoot}.\n`);
}

module.exports = { copyRequiredAssets, discoverStandaloneWebRoot };
