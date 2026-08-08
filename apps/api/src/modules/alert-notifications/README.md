# Alert notification delivery semantics

`AlertNotificationOutbox` is a durable notification-intent log. An eligible
`PENDING` row is claimed atomically as `SENDING`, delivered through the
Telegram transport outside the database transaction, and then marked `SENT`
with the same lease token. Retryable failures return to `PENDING` with bounded
exponential backoff. Permanent Telegram request/configuration failures become
`FAILED` and are not selected automatically.

`dispatchBatch(limit)` is logically bounded by `limit`, but it leases rows
just in time, one at a time. The current row completes its send and durable
transition before the dispatcher claims another row with a fresh lease token.
Consequently, a sequential batch never holds leases for notifications whose
delivery has not started, and another worker may safely claim the next pending
row while the first worker is sending its current row. The five-minute lease
also remains well above the ten-second timeout of one Telegram request.

Delivery is **at least once**, not exactly once. Telegram `sendMessage` has no
application-level idempotency key that can be committed atomically with this
database. If Telegram accepts a message but the subsequent `markSent` database
operation fails, that current row remains recoverable as `SENDING`. After its
five-minute lease expires, another dispatcher may send it again. Rows whose
delivery has not started are not claimed and remain `PENDING`. Marking the
current row `SENT` before the network request would instead risk losing the
notification intent, so this narrow duplicate boundary is intentional and the
database failure propagates.

The module is passive. Stage 7B.1 adds no controller, startup dispatch, timer,
cron job, or scheduler integration.
