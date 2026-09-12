import Module from "node:module";
import { join } from "node:path";

type ResolveFilename = (request: string, parent: unknown, isMain?: boolean, options?: unknown) => string;
const hook = Module as unknown as { _resolveFilename: ResolveFilename };
const originalResolveFilename = hook._resolveFilename.bind(Module);
// tsc does not rewrite the `@/*` path alias, so compiled `.test-dist`
// modules using it cannot be required. Map it to the compiled output root
// (this file compiles to `.test-dist/test-setup-alias.js`). Test-only.
hook._resolveFilename = function (request: string, parent?: unknown, isMain?: boolean, options?: unknown): string {
  if (request.startsWith("@/")) return originalResolveFilename(join(__dirname, request.slice(2)), parent, isMain, options);
  return originalResolveFilename(request, parent, isMain, options);
};

export {};
