export type ConfiguredTokenMatch = boolean | "not checked";

export function compareConfiguredWebToken(sessionToken: string, configuredWebToken: string | undefined): ConfiguredTokenMatch {
  return configuredWebToken === undefined || configuredWebToken.trim() === ""
    ? "not checked"
    : sessionToken === configuredWebToken;
}

export async function verifySessionTokenWithWebApi<T>(
  createSession: () => Promise<{ token: string }>,
  verifyRuns: (token: string) => Promise<T>,
): Promise<T> {
  const session = await createSession();
  return verifyRuns(session.token);
}
