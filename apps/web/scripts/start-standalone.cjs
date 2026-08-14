const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { discoverStandaloneWebRoot } = require("./prepare-standalone.cjs");
const { join } = require("node:path");

async function main() {
  const { parseWebConfig } = await import("../src/lib/web-config.ts");
  parseWebConfig(process.env);
  const standaloneWebRoot = discoverStandaloneWebRoot();
  const serverPath = join(standaloneWebRoot, "server.js");
  if (!existsSync(join(standaloneWebRoot, "public")) || !existsSync(join(standaloneWebRoot, ".next", "static"))) {
    throw new Error("Standalone assets are missing. Run npm run standalone:build before starting production.");
  }
  const child = spawn(process.execPath, [serverPath], { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exitCode = code ?? 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
