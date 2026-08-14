import { PRODUCTION_MAP_ORIGIN } from "./web-config";

export type BrowserSecurityHeader = Readonly<{ key: string; value: string }>;

export function contentSecurityPolicy(production: boolean): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${PRODUCTION_MAP_ORIGIN}${production ? "" : " ws: wss:"}`,
    "worker-src 'self'",
    "child-src 'self'",
    "frame-src 'none'",
    "media-src 'none'",
    "manifest-src 'self'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ];
  return `${directives.join("; ")};`;
}

export function browserSecurityHeaders(production: boolean): readonly BrowserSecurityHeader[] {
  return Object.freeze([
    { key: "Content-Security-Policy", value: contentSecurityPolicy(production) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" },
  ]);
}
