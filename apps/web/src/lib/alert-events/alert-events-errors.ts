export class AlertEventsBackendBadRequestError extends Error { public constructor() { super("Alert-events backend rejected the request."); this.name = "AlertEventsBackendBadRequestError"; } }
export class AlertEventsBackendUnavailableError extends Error { public constructor() { super("Alert-events backend is unavailable."); this.name = "AlertEventsBackendUnavailableError"; } }
