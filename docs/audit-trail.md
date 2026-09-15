# Audit trail

The audit trail is durable evidence of successful, meaningful administration, security, population, and retention changes. `AuditEvent` is append-only product persistence: product code can append an event but cannot update, delete, clear, prune, or retain audit rows.

Stage 20C completes the planned v1.0 audit subsystem with an ADMIN-only read-only viewer at `/admin/audit`. It adds no audit permission, export, mutation, automatic refresh, or audit-retention feature.

## Complete current catalog

The current approved catalog is:

- `USER_CREATED`: USER actor; USER target; details `targetLoginSnapshot`, `role`, and canonical effective `permissions`.
- `USER_ACCESS_CHANGED`: USER actor; USER target; details `targetLoginSnapshot`, factual `previousRole`/`role`, and canonical effective `previousPermissions`/`permissions`.
- `USER_DISABLED`: USER actor; USER target; details `targetLoginSnapshot`.
- `USER_ENABLED`: USER actor; USER target; details `targetLoginSnapshot`.
- `USER_PASSWORD_RESET`: USER actor; USER target; details `targetLoginSnapshot`.
- `OWN_PASSWORD_CHANGED`: USER actor and the same USER target; empty details.
- `SHORT_POPULATION_EXECUTED`: USER actor; `POSITION_HISTORY` target with no target ID; details `to`, `windowBudget`, `excludeProviderDisabled`, and `committedWindows`.
- `DURABLE_POPULATION_CREATED`: USER actor; created `POSITION_HISTORY_POPULATION_RUN` target; details `to`, `windowBudget`, and `excludeProviderDisabled`.
- `RETENTION_EXECUTED`: USER actor; `POSITION_HISTORY_RETENTION` target with no target ID; factual bounded-retention details.
- `SYSTEM_POPULATION_CREATED`: SYSTEM actor; created `POSITION_HISTORY_POPULATION_RUN` target; details `to`, `windowBudget`, and `excludeProviderDisabled`.
- `AUTOMATIC_RETENTION_EXECUTED`: SYSTEM actor; `POSITION_HISTORY_RETENTION` target with no target ID; the same factual bounded-retention details as manual retention.
- `SETTINGS_UPDATED`: USER actor; `APPLICATION_SETTINGS` target; bounded changed-field facts.
- `TELEGRAM_LINKED` and `TELEGRAM_DISCONNECTED`: USER actor and USER target; empty safe details.
- `VEHICLE_GROUP_CREATED`: USER actor; `VEHICLE_GROUP` target; name and curated color.
- `VEHICLE_GROUP_RENAMED`: retained compatibility event shape for name-only history.
- `VEHICLE_GROUP_UPDATED`: USER actor; `VEHICLE_GROUP` target; previous/current name and color.
- `VEHICLE_GROUP_MEMBERSHIP_CHANGED`: USER actor; `VEHICLE_GROUP` target; group-name snapshot and bounded added/removed counts.
- `VEHICLE_GROUP_DELETED`: USER actor; `VEHICLE_GROUP` target; name and pre-delete vehicle/user-grant counts.
- `USER_VEHICLE_ACCESS_CHANGED`: USER actor; USER target; login snapshot, previous/current mode, and bounded group/direct-grant counts and deltas.

  No event types beyond this source-controlled catalog are accepted.

## Identity, targets, and safe details

A USER actor is always derived from the authenticated server principal. New USER events require the authenticated user's ID and a login snapshot that follows the application login policy. The snapshot preserves historical identity if the optional AuthUser relation is later removed with `SET NULL`. A SYSTEM actor has a null user ID and null login snapshot; no fake AuthUser represents a scheduler.

Targets use the fixed generic target categories `USER`, `VEHICLE_GROUP`,
`POSITION_HISTORY`, `POSITION_HISTORY_POPULATION_RUN`,
`POSITION_HISTORY_RETENTION`, and `APPLICATION_SETTINGS`. User, vehicle-group,
durable-run, and settings events have target IDs. There are no generic target
foreign keys. Telegram events never carry link tokens, bot secrets, chat
secrets, or credential material.

Every event has a strict typed detail shape and exact-key runtime validation. Role values are only `ADMIN` or `USER`. Permission arrays contain only source-controlled permissions, include required dependencies, and use deterministic catalog order. ADMIN audit facts describe ADMIN's effective full access rather than empty permission-row storage. An access request that produces no normalized role or effective-permission change writes no event.

Audit details never contain passwords, temporary or generated passwords, hashes, salts, session IDs or tokens, cookies, authorization headers, provider credentials or credential-bearing URLs, raw provider payloads or errors, raw request bodies, stack traces, GPS coordinates or fingerprints, external device IDs, or Telegram credentials. Controller DTOs, provider results, and arbitrary request JSON are never serialized into audit details.

## Atomic auth and durable creation

`USER_CREATED` shares one transaction with the user and permission inserts. `USER_ACCESS_CHANGED` shares one transaction with role and permission replacement. `USER_DISABLED` shares one transaction with disabling and session revocation. `USER_ENABLED` shares one transaction with enabling. `USER_PASSWORD_RESET` shares one transaction with credential replacement, the must-change state, and session revocation. `OWN_PASSWORD_CHANGED` shares one transaction with credential replacement and the existing session rotation. If the corresponding audit append fails, those database changes roll back.

Vehicle Group create, update, membership replacement, and delete share their
transaction with the corresponding audit append. USER Product Vehicle Access
replacement and its audit append are likewise atomic. Failed validation,
missing references, duplicate names, and semantic no-ops write no event.

Temporary password material is returned only through the existing one-time response path after a successful commit and is never placed in an AuditEvent.

USER and SYSTEM durable population creation use the same transaction-aware creation service. The run insert and either `DURABLE_POPULATION_CREATED` or `SYSTEM_POPULATION_CREATED` commit together. Active-run conflicts, scheduler-disabled/no-work decisions, and creation races write no event. SYSTEM evaluation creates a pending run only; it does not execute a provider worker.

## Post-execution population and retention auditing

Synchronous short population writes `SHORT_POPULATION_EXECUTED` only after the bounded Stage 17C operation returns a normal factual result with `committedWindows > 0`. Provider work is not wrapped in one giant transaction. If the final audit append fails after history/checkpoint commits, committed history is not compensated; database and checkpoint truth remain authoritative. Lock conflicts, validation or authorization rejection, executor failure, and zero committed windows write no event.

Manual and automatic retention share the same locked checkpoint-first destructive core and one factual detail mapper:

- `canonicalAnchor`
- `policyCutoff`
- `deletedCheckpoints`
- `deletedObservations`
- `remainingFullyObsoleteCheckpoints`
- `remainingExecutableObservationCandidates`
- `stoppedByBudget`

Manual retention selects `RETENTION_EXECUTED` with a USER actor. Automatic retention selects only `AUTOMATIC_RETENTION_EXECUTED` with a SYSTEM actor. An event is appended only after a normal bounded result that deleted at least one checkpoint or observation.

Retention deliberately is not one giant transaction. It preserves the shared lock, checkpoint-first invariant, short committed delete transactions, 5000-checkpoint and 25000-observation limits, and partial crash safety. If the final audit append or process fails after destructive batches committed, deletion is not compensated and the audit event may be absent. Disabled, no-work, lock-unavailable, active-population, and failed-safe scheduler outcomes write no event.

## Deliberately unaudited noise

The database audit trail does not record 401 or 403 responses, validation rejection, same-origin rejection, login success or failure, logout, GET requests, provider retries, scheduler polling, scheduler no-work or lock-unavailable ticks, or GPS observation ingestion.

## ADMIN viewer

The viewer uses one protected read endpoint, `GET /api/admin/audit`, and a matching Next BFF. Authorization follows the existing ADMIN-only convention: unauthenticated requests are rejected, every USER is forbidden regardless of granular permissions, and no `audit.view` permission exists. Responses and BFF reads are `no-store`; opening, filtering, paginating, or refreshing the viewer creates no AuditEvent and performs no business mutation.

Pages contain at most 50 events. The page size is source-controlled and cannot be supplied by the browser. Rows are ordered by `createdAt DESC, id DESC` and paginated with an opaque keyset cursor containing only the validated last `createdAt` and AuditEvent UUID. The query fetches at most 51 rows to determine `hasMore`; it uses no OFFSET and performs no total-count query.

The only filters are one `eventType`, one `actorType`, one `targetType`, inclusive absolute `from` and `to` instants, and the opaque cursor. Unknown parameters, client page sizes, sorting, search, malformed cursors, date-only values, timezone-less values, invalid calendar timestamps, and reversed ranges are rejected.

The public DTO exposes only the event ID and timestamp, event type, actor, target, and safe details. USER actors expose the durable login snapshot but never `actorUserId`; SYSTEM actors expose only their type. Targets are displayed without live target lookup. The repository's JSON details are never returned directly: every row is revalidated against its exact source-controlled event detail contract and reconstructed into typed fields. If one historical row has malformed or extra details, that row remains visible with `details.status = UNAVAILABLE`; raw JSON, validation errors, and embedded forbidden content are discarded without failing the rest of the page.

The browser renders Russian, Ukrainian, and English labels and typed
descriptions for all 20 approved event types, including group/access and
Telegram events. It provides the approved filters, an explicit first-page
refresh, and cursor-based “Показать ещё”. Changing or resetting filters and
refreshing discard the previous cursor chain. There is no polling, SSE,
WebSocket, JSON dump, actor UUID, export/download, audit
update/delete/clear/prune, or audit retention control. A valid page containing
any approved event never fails as a whole; per-row UNAVAILABLE remains the only
fallback.
