import "server-only";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME } from "./auth-contract";

export async function authenticatedApiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const headers = new Headers(init.headers);
  if (token) headers.set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);
  return fetch(input, { ...init, headers });
}
