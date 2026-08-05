const path = require("node:path");
const { config } = require("dotenv");

function loadRootEnv() {
  config({ path: path.resolve(__dirname, "../../..", ".env"), quiet: true, override: false });
}

module.exports = { loadRootEnv };
