import type { NextConfig } from "next";
import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { browserSecurityHeaders } from "./src/lib/security-headers";
import { parseWebConfig } from "./src/lib/web-config";

const nextConfig = (phase: string): NextConfig => {
  if (phase === PHASE_PRODUCTION_SERVER) parseWebConfig(process.env);
  return {
    output: "standalone",
    productionBrowserSourceMaps: false,
    async headers() {
      return [{ source: "/:path*", headers: [...browserSecurityHeaders(process.env.NODE_ENV === "production")] }];
    },
  };
};

export default nextConfig;
