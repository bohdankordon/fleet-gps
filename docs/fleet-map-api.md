# Fleet map read API

`GET /api/fleet/map` returns a read-only snapshot built exclusively from local PostgreSQL `Vehicle` and `VehicleCurrentState` data. The request does not run fleet synchronization, alert evaluation, database writes, eQuGPS calls, or Telegram calls. The endpoint requires an authenticated account with `map.view`; Nest authorization remains authoritative.

The response is bounded to 1,000 local vehicles and ordered deterministically by persisted vehicle name and then local vehicle ID. Fleets above the guard fail safely instead of returning a silently truncated snapshot. `generatedAt` is the backend clock instant used for all freshness calculations in that response.

```json
{
  "generatedAt": "2026-08-09T12:00:00.000Z",
  "positionFreshnessSeconds": 300,
  "summary": {
    "totalVehicles": 1,
    "withPosition": 1,
    "withoutPosition": 0,
    "invalidPosition": 0,
    "fresh": 1,
    "stale": 0
  },
  "vehicles": [
    {
      "vehicle": { "id": "local-uuid", "name": "Vehicle name" },
      "position": {
        "latitude": 49.0,
        "longitude": 28.0,
        "observedAt": "2026-08-09T11:59:00.000Z"
      },
      "speedKph": 12.5,
      "freshness": "FRESH"
    }
  ]
}
```

Coordinates are WGS 84 decimal degrees. Latitude is accepted inclusively from -90 to 90 and longitude from -180 to 180; both must be finite. `observedAt` is `VehicleCurrentState.fixTime`, the observation time of that GPS fix, and is serialized as an ISO 8601 UTC timestamp. `speedKph` is the persisted current speed in kilometres per hour; a provider-invalid position, or invalid, non-finite, or negative persisted speed, becomes `null`, and the endpoint never derives speed from adjacent points.

Freshness is `FRESH` if and only if provider `valid === true`, provider `outdated === false`, `observedAt <= generatedAt`, and the age at `generatedAt` is less than or equal to `positionFreshnessSeconds`. The backend captures `generatedAt` exactly once after reading the database snapshot. The threshold comes from `ApplicationSettings.positionFreshnessSeconds`; equality is fresh. A false or null provider flag, an actual future timestamp, or an age above the threshold makes every otherwise serializable marker `STALE`.

Only vehicles with structurally valid coordinates and a valid `fixTime` appear in `vehicles`. A provider-invalid or provider-unknown last-known point remains available to the map but is always `STALE`. A vehicle without `VehicleCurrentState`, or with no position fields, contributes to `withoutPosition`. A partial, invalid-timestamp, non-finite, or out-of-range persisted position contributes to `invalidPosition`. No database row is repaired by this read path.

The public marker is allow-listed. It exposes only local vehicle ID/name, coordinates, observation time, persisted speed, and freshness. It never serializes external eQuGPS IDs or payloads, provider validity flags, Telegram data, journal records, dedupe keys, outbox state, timestamps unrelated to the GPS fix, or whole Prisma models.

The `/map` page also reads `GET /api/alert-events/map` through the Next BFF. That endpoint contains no coordinates: the browser joins OPEN alert state to this fleet snapshot by public vehicle ID, so alert rings always follow the current fleet position. They do not represent the historical location where an alert began. Fleet and OPEN alerts refresh in one 30-second generation with independent last-good/error handling; the city geofence remains initial-only configuration data.
