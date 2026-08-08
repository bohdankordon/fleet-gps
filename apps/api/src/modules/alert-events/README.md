# Alert events read API

`GET /api/alert-events` is the read-only source for the Events / Notifications screen. It reads persisted `AlertEvent` snapshots and never runs detectors, evaluation, synchronization, notification dispatch, or database writes.

Optional filters are `status=OPEN|RESOLVED`, `type=SPEEDING|INACTIVITY`, and the public dashboard `vehicleId` UUID. Results use keyset pagination ordered by `openedAt` (`confirmedAt`) descending and event UUID descending. `limit` defaults to 50 and is bounded to 1..100; pass the opaque `nextCursor` as `cursor` for the next page. Invalid known query values return the project's safe `400` response.

The public event contains only its UUID, public vehicle UUID/name, type, status, UTC ISO `openedAt`/`resolvedAt`, persisted type-specific snapshot metrics, and `notificationDeliveryStatus`. Delivery mapping is `NONE` when no `ALERT_CONFIRMED` outbox intent exists, `PENDING` for internal `PENDING` or leased `SENDING`, `SENT` for `SENT`, and `FAILED` for `FAILED`.

`GET /api/alert-events/summary` returns only OPEN total, SPEEDING, and INACTIVITY counts through one aggregate database query.

The query explicitly selects safe columns. It does not expose external device IDs, coordinates, evaluation observations, dedupe/active keys, confirmation receipts, Telegram settings or transport data, provider payloads, outbox leases/retry fields, raw errors, or full Prisma models.
