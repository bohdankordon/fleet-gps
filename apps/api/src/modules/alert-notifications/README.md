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

The optional `dispatchBatch(limit, signal)` signal is a cooperative stop only
between notifications. An already-aborted signal prevents the next claim. If
the signal becomes aborted while a notification is being delivered, that HTTP
request and its durable `SENT`, retry, `FAILED`, or lost-lease transition still
finish before the batch returns its actual aggregate result. The signal is not
passed to the Telegram transport, whose independent ten-second timeout remains
responsible for bounding HTTP work.

Delivery is **at least once**, not exactly once. Telegram `sendMessage` has no
application-level idempotency key that can be committed atomically with this
database. If Telegram accepts a message but the subsequent `markSent` database
operation fails, that current row remains recoverable as `SENDING`. After its
five-minute lease expires, another dispatcher may send it again. Rows whose
delivery has not started are not claimed and remain `PENDING`. Marking the
current row `SENT` before the network request would instead risk losing the
notification intent, so this narrow duplicate boundary is intentional and the
database failure propagates.

## Production scheduler

Telegram notifications remain disabled by default. When
`TELEGRAM_NOTIFICATIONS_ENABLED=true`, the independent notification scheduler
registers one timer during module initialization. It does not dispatch
immediately: the first call occurs only after
`TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS` (default `60000`, accepted range
`1000..3600000`). Each cycle calls `dispatchBatch` with
`TELEGRAM_NOTIFICATION_BATCH_SIZE` (default `20`, accepted range `1..100`). It
never claims outbox rows itself, so the Stage 7B.1 just-in-time one-row leasing
contract remains unchanged.

Only one notification cycle may run per process. A tick that overlaps a running
cycle is skipped and counted. Resolved dispatcher results are successful
scheduler cycles even when they include retries or permanent Telegram
failures, because those outcomes were durably handled by the outbox state
machine. Unexpected dispatcher, formatter, or database failures count as
scheduler failures; the timer callback contains the rejection and releases the
overlap guard for the next tick.

Shutdown removes the timer and marks the scheduler stopped immediately, then
aborts only the cycle's cooperative batch signal. The scheduler never forcibly
cancels an already-started Telegram HTTP delivery: its current claimed row
finishes the durable transition, while the remaining unclaimed batch items stay
`PENDING` for the next process. Shutdown waits only for that current work to
finish.

These scheduling rules do not alter the at-least-once delivery boundary above.
