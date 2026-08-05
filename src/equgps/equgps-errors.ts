export type EqugpsErrorKind =
  | "http"
  | "network"
  | "timeout"
  | "invalid_json"
  | "invalid_response";

export type SafeHttpDiagnostic = {
  status: number;
  contentType: string | undefined;
  hasContentDispositionAttachment: boolean;
  message: string | undefined;
  parameter: string | undefined;
  code: string | undefined;
  exceptionType: string;
  stackFrames: string[];
};

const maxMessageLength = 500;

export function sanitizeServerMessage(message: string): string {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(deviceId|from|to|groupId|token)\s*=\s*[^\s,&;]+/gi, "$1=[redacted]")
    .replace(/\bdeviceId\s*[:#]?\s*\d+/gi, "deviceId [redacted]")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, (token) =>
      /^[A-Z][A-Za-z0-9]*Exception$/.test(token) ? token : "[redacted]",
    )
    .slice(0, maxMessageLength);
}

function extractExceptionType(value: string): string {
  return /\b([A-Z][A-Za-z0-9]*Exception)\b/.exec(value)?.[1] ?? "unknown";
}

function extractSafeStackFrames(value: string): string[] {
  const frames = new Set<string>();
  for (const match of value.matchAll(/\bat\s+(?:[\w$]+\.)*([A-Z][\w$]*)(?:\.([\w$]+))?\([^:()]+:(\d+)\)/g)) {
    frames.add(`${match[1]}${match[2] === undefined ? "" : `.${match[2]}`}:${match[3]}`);
  }
  for (const match of value.matchAll(/\b(?:[\w$]+\.)*([A-Z][\w$]*):(\d+)\b/g)) {
    frames.add(`${match[1]}:${match[2]}`);
  }
  return [...frames].slice(0, 5);
}

function getStringField(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
    if (typeof candidate === "number") return String(candidate);
  }
  return undefined;
}

export function createSafeHttpDiagnostic(
  status: number,
  contentType: string | null,
  body: string,
  contentDisposition: string | null = null,
): SafeHttpDiagnostic {
  let value: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      value = parsed as Record<string, unknown>;
    }
  } catch {
    // Plain text and unknown content types are treated as a possible message.
  }

  const rawMessage = value === undefined
    ? body
    : getStringField(value, ["message", "error_description", "error", "detail", "description", "details"]);
  const rawParameter = value === undefined ? undefined : getStringField(value, ["parameter", "param", "field"]);
  const rawCode = value === undefined ? undefined : getStringField(value, ["code", "errorCode"]);
  const parameter = rawParameter !== undefined && /^(deviceId|groupId|from|to)$/i.test(rawParameter)
    ? rawParameter
    : /\b(deviceId|groupId|from|to)\b/i.exec(rawMessage ?? "")?.[1];

  const exceptionSource = `${rawMessage ?? ""} ${body}`;
  const exceptionType = extractExceptionType(exceptionSource);

  return {
    status,
    contentType: contentType ?? undefined,
    hasContentDispositionAttachment: /\battachment\b/i.test(contentDisposition ?? ""),
    message: exceptionType === "unknown" && rawMessage !== undefined && rawMessage.length > 0
      ? sanitizeServerMessage(rawMessage)
      : undefined,
    parameter,
    code: rawCode === undefined ? undefined : sanitizeServerMessage(rawCode),
    exceptionType,
    stackFrames: extractSafeStackFrames(exceptionSource),
  };
}

export class EqugpsError extends Error {
  public constructor(
    public readonly kind: EqugpsErrorKind,
    message: string,
    public readonly status?: number,
    public readonly diagnostic?: SafeHttpDiagnostic,
  ) {
    super(message);
    this.name = "EqugpsError";
  }
}

export function httpErrorMessage(status: number, endpoint: string): string {
  const messages: Record<number, string> = {
    400: "eQuGPS rejected the request (HTTP 400).",
    401: "eQuGPS authentication failed (HTTP 401). Check the configured email and password.",
    403: `eQuGPS denied access to ${endpoint} (HTTP 403).`,
    404: `eQuGPS endpoint ${endpoint} was not found (HTTP 404). Check EQUGPS_BASE_URL.`,
    429: "eQuGPS rate limit reached (HTTP 429). Try again later.",
  };

  if (status >= 500 && status <= 599) {
    return `eQuGPS server error (HTTP ${status}). Try again later.`;
  }

  return messages[status] ?? `eQuGPS returned an unexpected HTTP status (${status}).`;
}
