# ADR 005: PostgreSQL и Prisma 7

Для MVP выбран PostgreSQL с Prisma 7, generator `prisma-client`, driver adapter `@prisma/adapter-pg` и версионируемыми SQL migrations. Начальная схема ограничена реестром машин, текущим состоянием, дневной статистикой и singleton-настройками, чтобы не преждевременно моделировать поездки, нарушения или отчёты.

Redis и PostGIS пока не используются: кэширование и геопространственные сценарии ещё не требуют отдельной инфраструктуры. Prisma не подключается к Nest startup до появления DatabaseModule: это сохраняет health-check независимым от БД. Генерируемый client игнорируется Git, а migration SQL остаётся в репозитории.
