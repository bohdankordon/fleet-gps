# Per-user Telegram linking (2A)

Telegram 2A creates a durable connection between one Taxi GPS account and one Telegram private chat. It does not send product alerts, create notification preferences, select vehicles, or change the existing legacy global alert dispatcher or OPS Telegram paths.

An authenticated, enabled user without a pending password change generates a 256-bit base64url link token. Only its SHA-256 hash is stored; the raw value appears once in the `https://t.me/<product-bot>?start=<token>` link and expires after ten minutes. A replacement request revokes the prior usable token without disconnecting an existing connection.

The public product webhook accepts private `/start <token>` messages only. The Next ingress requires a JSON content type, checks `X-Telegram-Bot-Api-Secret-Token` before reading its 64 KiB bounded body, and forwards only that body and header to the fixed internal endpoint. The API verifies the same secret again before semantic processing. `TELEGRAM_PRODUCT_WEBHOOK_SECRET` is therefore a server-only runtime secret for both the public Web ingress and API; it must never be a `NEXT_PUBLIC_*` value. Webhook receipt creation, token consumption, user eligibility, connection replacement, and audit insertion occur in one transaction, so a failed transaction cannot suppress a legitimate Telegram retry. Raw webhook bodies, tokens, hashes, bot credentials, and Telegram identifiers are never exposed to account/admin APIs or audits.

Product linking configuration is separate from legacy delivery: `TELEGRAM_PRODUCT_LINKING_ENABLED`, `TELEGRAM_PRODUCT_BOT_USERNAME`, `TELEGRAM_PRODUCT_BOT_TOKEN`, and `TELEGRAM_PRODUCT_WEBHOOK_SECRET`. Linking defaults off. `ApplicationSettings.telegramChatId` remains legacy/deprecated and is not reused.

The link-creation guard is deliberately process-local: five requests per Taxi GPS user in ten minutes. This is safe under the current single-API-replica deployment assumption and must be replaced with shared limiting before horizontal API scaling.

Future Telegram delivery must apply existing Taxi GPS authorization: alert/event content requires `events.view`; vehicle-scoped content must additionally respect `vehicles.view` (and `trips.view` or `reports.view` for those product surfaces). Vehicle selection in 2B is a notification preference, never an ACL.

## Per-user notification preferences (2B)

Each Taxi GPS account may save its own future-notification preferences independently of its Telegram connection. The implicit default is master notifications **off**, with SPEEDING and INACTIVITY enabled and vehicle scope **ALL**. The first successful save creates a durable, revisioned row; subsequent changes require the current revision and reject stale writes rather than silently overwriting another change.

Users with `vehicles.view` may choose ALL vehicles or SELECTED vehicles (at least one selection is required for SELECTED). Selections remain stored while ALL is active and survive operational vehicle disablement. They are a preference only: they grant no fleet, event, trip, report, history, or future-delivery authorization. Accounts without `vehicles.view` can still edit their master and event-type choices, but are shown no vehicle metadata and cannot edit vehicle scope or arbitrary IDs.

Disconnect, relink, and ADMIN force-disconnect preserve preferences. Telegram 2B still sends no per-user alert: recipient eligibility, fan-out, durable delivery rows, dispatch, and retries are Telegram 2C work.
