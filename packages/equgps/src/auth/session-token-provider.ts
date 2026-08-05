import type { SessionToken } from "../contracts/client-contracts";
import { EquGpsResponseValidationError } from "../errors/equgps-errors";

export type CreateSessionToken = () => Promise<SessionToken>;

export class SessionTokenProvider {
  readonly #createSession: CreateSessionToken;
  #token: SessionToken | undefined;
  #pending: Promise<SessionToken> | undefined;

  public constructor(createSession: CreateSessionToken) {
    this.#createSession = createSession;
  }

  public async getToken(): Promise<SessionToken> {
    if (this.#token !== undefined) return this.#token;
    if (this.#pending !== undefined) return this.#pending;

    const pending = this.createAndStoreToken();
    this.#pending = pending;
    try {
      return await pending;
    } finally {
      if (this.#pending === pending) this.#pending = undefined;
    }
  }

  public invalidateToken(expectedToken?: SessionToken): void {
    if (expectedToken !== undefined && this.#token !== expectedToken) return;
    this.#token = undefined;
  }

  private async createAndStoreToken(): Promise<SessionToken> {
    const token = await this.#createSession();
    if (typeof token !== "string" || token.trim().length === 0) {
      throw new EquGpsResponseValidationError("createSession");
    }
    this.#token = token;
    return token;
  }
}
