# Vehicle details read API

`GET /api/vehicles/:vehicleId/details` returns one bounded, vehicle-scoped snapshot from local PostgreSQL. A malformed public UUID returns the standard safe `400`; a valid UUID not present in `Vehicle` returns the standard safe `404`.

The public response contains `generatedAt`; vehicle `id` and `name`; nullable current `position` (`latitude`, `longitude`, `observedAt`), `speedKph`, and `freshness`; nullable `today`; OPEN `activeAlerts`; and at most 10 newest-first `recentEvents`. It never exposes external device IDs, provider flags or payloads, evaluation journal data, dedupe/active keys, notification leases/retries/errors, Telegram data, or Prisma rows.

Current-state coordinates, persisted speed in km/h, and `FRESH`/`STALE` are projected by the same helper as `GET /api/fleet/map`. Invalid or incomplete coordinates or fix time produce `currentState: null`; GET never repairs data. `generatedAt` is captured once after the database transaction and is the instant used for freshness.

`today.date` is the operational `YYYY-MM-DD` selected with the IANA timezone stored in `ApplicationSettings`, using the database transaction timestamp rather than the API host timezone. No row means `today: null`, not synthetic zeroes. A present row exposes persisted `distanceMeters`, nullable `movementDurationSeconds`, nullable `maxSpeedKph`, `source`, `quality`, `isStale`, and `isDegraded`; decimal values are converted to JSON numbers without additional rounding.

`activeAlerts` contains only persisted OPEN events and only `type` plus `openedAt`, ordered SPEEDING then INACTIVITY. `recentEvents` is fixed at 10 and uses the same safe type-specific snapshot and notification delivery projection as `GET /api/alert-events`, omitting the repeated vehicle object. Delivery is `NONE` with no confirmation outbox intent, `PENDING` for internal PENDING/SENDING, `SENT` for SENT, and `FAILED` for FAILED.

The repository uses one bounded `REPEATABLE READ` transaction and explicit selects. It performs no synchronization, detector evaluation, writes, eQuGPS, Telegram, map-tile, or other network calls.
