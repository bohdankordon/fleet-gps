# Fleet GPS architecture (current)

This is the current architecture overview. Early-MVP staging notes that used to live here were retired as the system outgrew them; the focused documents linked below hold authoritative details. Historical design records remain frozen under `docs/adr/`.

## Request topology

    Browser -> Caddy (production HTTPS edge, only publisher of host ports)
    Caddy -> Next.js Web application and fixed same-origin BFF routes
    Next.js -> NestJS API (server-only, no host ports)
    NestJS -> PostgreSQL 17 / Prisma (named volume, no host port)
    NestJS -> @taxi-gps/equgps provider gateway (official and web adapters)
    NestJS -> Telegram Bot API (dedicated product bot plus operational alerts)

The browser communicates only with the Next.js application. Next forwards narrow, validated requests to the internal NestJS API over a server-only URL; the browser never calls eQuGPS or PostgreSQL directly. Nest is authoritative for authorization. See [deployment](deployment.md) for the Compose network layout.

## Data lanes: live state and history

Two independent lanes share one observation store. The live lane keeps the current fleet picture: vehicle registry, current state, daily statistics, and low-latency observations from fleet sync. The history lane owns durable completeness: per-vehicle ingestion cursors, default-off continuous reconciliation (recent-tail plus contiguous-backlog lanes) with restart catch-up, recurring daily 7-day and rolling 90-day replay generations, and retention-aware completeness floors. Both lanes write `VehiclePositionObservation`, deduplicated by the stable fix fingerprint with first-writer-wins immutability. See [lossless position-history ingestion](lossless-position-history-ingestion.md).
## Coordination and production constraints

Fleet-wide history mutation is serialized through one PostgreSQL session advisory lock (key `1706170003`) held on a dedicated connection for the whole provider execution, so concurrent population, retention, continuous, and replay work cannot overlap destructively. Automatic provider request starts observe a shared cross-replica pacing fence that keeps traffic within budget. The approved production model is a single active API replica with single-host Docker Compose; schedulers and workers run inside the API process with bounded shutdown. No Redis or PostGIS is used. See [GPS history administration](gps-history-administration.md) and [deployment](deployment.md).

## Protected surfaces

Local username and password authentication issues opaque sessions with `ADMIN` and `USER` roles plus explicit USER permissions; Nest authorization is authoritative and production cookies are host-only, `HttpOnly`, `Secure`, and `SameSite=Lax`. Product pages and operations flow through fixed Next.js BFF routes with server-side session, role, and permission checks, including the ADMIN history overview, population, retention, and ingestion-status surfaces. Liveness and database-backed readiness stay on dedicated endpoints, and every administrative mutation writes a durable audit entry. Host-level failure monitoring is a separate subsystem from application operational status; see [observability](observability.md) and [authentication](authentication.md).

## Background work

Schedulers and bounded workers run inside the API process: fleet and runs sync, alert ingestion and evaluation, position-history maintenance and retention, continuous history reconciliation and replay, per-user notification planning and dispatch, and the monitoring and backup tooling described in their runbooks. Local automatic and provider-affecting work is disabled by default and enabled only through explicit gates. See [sync scheduler](sync-scheduler.md), [GPS history retention](gps-history-retention.md), and [local scheduler operation](local-scheduler-operation.md).

## Module map

The NestJS application composes configuration, authentication and users, fleet and provider integration, dashboard and reporting, alerting, history and retention, Telegram linking and delivery, audit, and health modules around one lazy Prisma client owned by an explicit database module. The Next.js application owns fixed BFF routes, permission-checked pages, and MapLibre presentation. Shared provider rules live in the `@taxi-gps/equgps` workspace package. Day-to-day module detail belongs to the focused documents, not here.
