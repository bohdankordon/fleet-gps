# Alert events read API

`GET /api/alert-events` is the read-only source for the Events / Notifications screen. It reads persisted `AlertEvent` snapshots and never runs detectors, evaluation, synchronization, notification dispatch, or database writes.

Optional filters are `status=OPEN|RESOLVED`, `type=SPEEDING|INACTIVITY`, and the public dashboard `vehicleId` UUID. Results use keyset pagination ordered by `openedAt` (`confirmedAt`) descending and event UUID descending. `limit` defaults to 50 and is bounded to 1..100; pass the opaque `nextCursor` as `cursor` for the next page. Invalid known query values return the project's safe `400` response.

The public event contains only its UUID, public vehicle UUID/name, type, status, UTC ISO `openedAt`/`resolvedAt`, persisted type-specific snapshot metrics, and `notificationDeliveryStatus`. Delivery mapping is `NONE` when no `ALERT_CONFIRMED` outbox intent exists, `PENDING` for internal `PENDING` or leased `SENDING`, `SENT` for `SENT`, and `FAILED` for `FAILED`.

`GET /api/alert-events/summary` returns only OPEN total, SPEEDING, and INACTIVITY counts through one aggregate database query.

`GET /api/alert-events/map` is the dedicated bounded OPEN-state projection for the fleet map. It does not reuse the paginated event list. One explicit read selects only alert type, `confirmedAt` (published as `openedAt`), and public vehicle ID/name, ordered deterministically and guarded at 1,000 OPEN rows. The response groups at most one OPEN `SPEEDING` and one OPEN `INACTIVITY` per vehicle, matching the lifecycle `activeKey(type, vehicleId)` invariant. Its summary distinguishes total OPEN alerts from vehicles with alerts.

The alert-map response deliberately contains no coordinates. The web client joins it to `GET /api/fleet/map` by public vehicle ID and renders an alert indicator at the vehicle's current persisted position. That indicator is not an assertion about where the alert originated. An alert whose vehicle has no valid current map position remains in the OPEN totals and is reported by the UI as not visible on the map.

The query explicitly selects safe columns. It does not expose external device IDs, coordinates, evaluation observations, dedupe/active keys, confirmation receipts, Telegram settings or transport data, provider payloads, outbox leases/retry fields, raw errors, or full Prisma models.
