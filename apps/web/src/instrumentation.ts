import { parseWebConfig } from "./lib/web-config";

export function register(): void {
  if (process.env.NODE_ENV === "production") parseWebConfig(process.env);
}
