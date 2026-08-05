export class DashboardBackendUnavailableError extends Error { public constructor() { super("Dashboard backend unavailable."); this.name = "DashboardBackendUnavailableError"; } }
export class DashboardBackendBadRequestError extends Error { public constructor() { super("Dashboard filters rejected."); this.name = "DashboardBackendBadRequestError"; } }
