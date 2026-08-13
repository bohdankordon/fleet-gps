export function isSameOriginWrite(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (fetchSite === "same-origin" && (origin === null || origin === "null")) return true;
  if (!origin || origin === "null") return false;
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host");
    const expectedOrigin = host ? new URL(`${requestUrl.protocol}//${host}`).origin : requestUrl.origin;
    const suppliedOrigin = new URL(origin).origin;
    return suppliedOrigin === origin && suppliedOrigin === expectedOrigin;
  }
  catch { return false; }
}

export function rejectCrossOriginWrite(request: Request): Response | null {
  return isSameOriginWrite(request) ? null : Response.json({ statusCode: 403, error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
