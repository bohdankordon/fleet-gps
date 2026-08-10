export class OpenAlertMapBackendUnavailableError extends Error {
  public constructor() {
    super("OPEN alert map backend is unavailable.");
    this.name = "OpenAlertMapBackendUnavailableError";
  }
}
