# Audit trail

The audit trail is durable evidence of successful, meaningful administration, security, population, and retention changes. `AuditEvent` is append-only product persistence: product code can append an event but cannot update, delete, clear, prune, or retain audit rows.

There is no audit viewer, public audit API, export, audit permission, or audit-retention feature. Stage 20C remains reserved for a read-only ADMIN audit viewer.

## Complete current catalog

Stage 20B completes integration of every approved event in the existing catalog:

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

No event types beyond this source-controlled catalog are accepted.

## Identity, targets, and safe details

A USER actor is always derived from the authenticated server principal. New USER events require the authenticated user's ID and a login snapshot that follows the application login policy. The snapshot preserves historical identity if the optional AuthUser relation is later removed with `SET NULL`. A SYSTEM actor has a null user ID and null login snapshot; no fake AuthUser represents a scheduler.

Targets use the fixed generic target categories `USER`, `POSITION_HISTORY`, `POSITION_HISTORY_POPULATION_RUN`, and `POSITION_HISTORY_RETENTION`. Only user and durable-run events have target IDs. There are no generic target foreign keys.

Every event has a strict typed detail shape and exact-key runtime validation. Role values are only `ADMIN` or `USER`. Permission arrays contain only source-controlled permissions, include required dependencies, and use deterministic catalog order. ADMIN audit facts describe ADMIN's effective full access rather than empty permission-row storage. An access request that produces no normalized role or effective-permission change writes no event.

Audit details never contain passwords, temporary or generated passwords, hashes, salts, session IDs or tokens, cookies, authorization headers, provider credentials or credential-bearing URLs, raw provider payloads or errors, raw request bodies, stack traces, GPS coordinates or fingerprints, external device IDs, or Telegram credentials. Controller DTOs, provider results, and arbitrary request JSON are never serialized into audit details.

## Atomic auth and durable creation

`USER_CREATED` shares one transaction with the user and permission inserts. `USER_ACCESS_CHANGED` shares one transaction with role and permission replacement. `USER_DISABLED` shares one transaction with disabling and session revocation. `USER_ENABLED` shares one transaction with enabling. `USER_PASSWORD_RESET` shares one transaction with credential replacement, the must-change state, and session revocation. `OWN_PASSWORD_CHANGED` shares one transaction with credential replacement and the existing session rotation. If the corresponding audit append fails, those database changes roll back.

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
