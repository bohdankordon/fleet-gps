import { EquGpsForbiddenError, EquGpsHttpError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsResponseValidationError, EquGpsTimeoutError, EquGpsUnauthorizedError } from "../errors/equgps-errors";
import type { HttpRequest, HttpResponse, HttpTransport } from "../contracts/http";

function safeResponseHeaders(headers: Headers): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const name of ["content-type", "content-disposition"]) {
    const value = headers.get(name);
    if (value !== null) result[name] = value;
  }
  return result;
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType !== null && /(?:^|\/)json(?:;|$)|\+json(?:;|$)/i.test(contentType);
}

function parseRetryAfterMs(value: string | null, now: number): number | null {
  if (value === null) return null;
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(value.trim())) return Math.max(0, Math.ceil(Number(value) * 1_000));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

function httpError(status: number, operation: HttpRequest["operation"], headers: Headers, now: number): Error {
  if (status === 401) return new EquGpsUnauthorizedError(operation);
  if (status === 403) return new EquGpsForbiddenError(operation);
  if (status === 429) return new EquGpsRateLimitError(operation, parseRetryAfterMs(headers.get("retry-after"), now));
  return new EquGpsHttpError(status, operation);
}

export class FetchHttpTransport implements HttpTransport {
  public constructor(private readonly now: () => number = Date.now) {}

  public async execute(request: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    const headers = new Headers(request.headers);
    if (request.formBody !== undefined) headers.set("Content-Type", "application/x-www-form-urlencoded");
    try {
      let response: Response;
      try {
        response = await fetch(request.url, {
          method: request.method,
          headers,
          ...(request.formBody === undefined ? {} : { body: new URLSearchParams(request.formBody).toString() }),
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) throw new EquGpsTimeoutError(request.operation);
        throw new EquGpsNetworkError(request.operation);
      }

      if (!response.ok) throw httpError(response.status, request.operation, response.headers, this.now());
      let text: string;
      try {
        text = await response.text();
      } catch {
        if (controller.signal.aborted) throw new EquGpsTimeoutError(request.operation);
        throw new EquGpsNetworkError(request.operation);
      }
      let body: unknown = null;
      if (text.length > 0) {
        if (isJsonContentType(response.headers.get("content-type"))) {
          try {
            body = JSON.parse(text);
          } catch {
            throw new EquGpsResponseValidationError(request.operation, "invalid_json");
          }
        } else {
          body = text;
        }
      }
      return { status: response.status, headers: safeResponseHeaders(response.headers), body };
    } finally {
      clearTimeout(timer);
    }
  }
}
