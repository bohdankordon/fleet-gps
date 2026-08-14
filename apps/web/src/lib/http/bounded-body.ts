export const BFF_REQUEST_BODY_LIMIT_BYTES = 64 * 1_024;

export class BoundedBodyError extends Error {
  public constructor(public readonly status: 400 | 413) {
    super(status === 413 ? "Request body too large." : "Invalid request body.");
    this.name = "BoundedBodyError";
  }
}

function declaredLength(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (value === null) return null;
  if (!/^[0-9]+$/.test(value)) throw new BoundedBodyError(400);
  const length = Number(value);
  if (!Number.isSafeInteger(length)) throw new BoundedBodyError(400);
  if (length > BFF_REQUEST_BODY_LIMIT_BYTES) throw new BoundedBodyError(413);
  return length;
}

export async function readBoundedText(request: Request): Promise<string> {
  declaredLength(request);
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BFF_REQUEST_BODY_LIMIT_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new BoundedBodyError(413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BoundedBodyError) throw error;
    throw new BoundedBodyError(400);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { throw new BoundedBodyError(400); }
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  try { return JSON.parse(await readBoundedText(request)); }
  catch (error) { if (error instanceof BoundedBodyError) throw error; throw new BoundedBodyError(400); }
}

export async function readBoundedForm(request: Request): Promise<URLSearchParams> {
  try { return new URLSearchParams(await readBoundedText(request)); }
  catch (error) { if (error instanceof BoundedBodyError) throw error; throw new BoundedBodyError(400); }
}

export function boundedBodyStatus(error: unknown): 400 | 413 {
  return error instanceof BoundedBodyError ? error.status : 400;
}
