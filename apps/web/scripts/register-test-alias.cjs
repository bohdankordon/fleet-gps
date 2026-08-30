const Module = require("node:module");
const path = require("node:path");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.resolve(__dirname, "../.test-dist", request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
