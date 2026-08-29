# Isolated local PostgreSQL test database

`compose.test.yaml` and `test-db.ps1` provide a disposable PostgreSQL 17 instance for real integration tests. It is deliberately separate from normal development Compose: project `taxi-gps-test`, service `postgres-test`, database/user `taxi_gps_test`, its own `postgres_test_data` volume, and loopback-only `127.0.0.1:5434`. Development remains on `127.0.0.1:5433` and `postgres_data`.

Windows Application Control can block Prisma's Windows schema engine. The harness therefore runs migrations and DB integration tests in the one-off `api-db-test-runner` container (`node:24-slim`), using Linux-native dependencies installed by `npm ci` from the lockfile. The image is built from the current working tree, so uncommitted migrations are included, while `.dockerignore` excludes host `node_modules`; Windows Prisma engines are not reused or bypassed.

From the repository root in PowerShell:

```powershell
npm run test-db:start     # start and wait for health
npm run test-db:migrate   # apply the complete Prisma migration chain
npm run test-db:smoke     # recreate from empty, migrate, build Prisma, and run harness smokes
npm run test-db:api -- apps/api/test/isolated-postgres.smoke.test.cjs # selected Linux DB/API test(s)
npm run test-db:validate  # Prisma validation in the Linux runner
npm run test-db:api-typecheck # API typecheck in the Linux runner
npm run test-db:api-full-test # complete API suite in the Linux runner
npm run test-db:stop      # stop but preserve the test volume
npm run test-db:reset     # destroy only test containers/volume, then recreate and migrate
npm run test-db:destroy   # destroy only test containers/volume
```

The launcher injects the only permitted test connection string and `TEST_DATABASE=1` into its child commands. It never loads `.env` as the source of `DATABASE_URL`; an inherited development URL is overridden only inside the launcher process. Before host-side migration, reset, destruction, or runner execution, `apps/api/scripts/assert-test-database-url.cjs` requires PostgreSQL, `localhost`/`127.0.0.1`, port `5434`, database `taxi_gps_test`, and user `taxi_gps_test`. Inside Docker, the separate `assert-container-test-database-url.cjs` requires the explicit `TEST_DATABASE_RUNNER=linux` marker plus `postgres-test:5432` and the same test database/user. A wrong URL therefore stops before a destructive action.

Reusable DB tests can import `apps/api/test-support/isolated-postgres.cjs`. It provides guarded independent `pg` clients, a guarded Prisma client, transaction wrapper, and an all-public-table reset helper. The harness smoke proves rollback persistence semantics, two real concurrent connections with PostgreSQL advisory locking, and Prisma access to the migrated schema (including the current Telegram linking tables). The one-off runner has no host port and starts no API application container. It explicitly disables sync, alert ingestion, history maintenance/retention, Telegram notifications/product linking, and OPS alerts. Future Telegram tests can inject fake transport/config/webhook input while retaining real PostgreSQL.

This database contains test-only credentials and is disposable. Do not point normal development, production, provider, or Telegram commands at it; no external service is required or started.
