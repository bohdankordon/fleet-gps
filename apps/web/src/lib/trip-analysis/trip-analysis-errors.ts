export class TripAnalysisBackendBadRequestError extends Error { public constructor() { super("Trip analysis request rejected."); this.name = "TripAnalysisBackendBadRequestError"; } }
export class TripAnalysisBackendNotFoundError extends Error { public constructor() { super("Vehicle not found."); this.name = "TripAnalysisBackendNotFoundError"; } }
export class TripAnalysisBackendUnavailableError extends Error { public constructor() { super("Trip analysis unavailable."); this.name = "TripAnalysisBackendUnavailableError"; } }

