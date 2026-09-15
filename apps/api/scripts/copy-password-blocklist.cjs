const { copyFileSync, mkdirSync } = require("node:fs");
const { resolve } = require("node:path");

const outputName = process.argv[2] ?? "dist";
if (!/^(dist|\.test-dist)$/.test(outputName)) throw new Error("Password blocklist output must be dist or .test-dist.");
const source = resolve(__dirname, "../assets/password-policy");
const destination = resolve(__dirname, `../${outputName}/assets/password-policy`);
mkdirSync(destination, { recursive: true });
for (const name of ["common-passwords.bin", "common-passwords.metadata.json", "NOTICE.md"]) copyFileSync(resolve(source, name), resolve(destination, name));
