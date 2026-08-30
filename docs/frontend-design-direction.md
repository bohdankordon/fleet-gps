# Frontend design direction

Status: Ant Design 6 is the active frontend foundation. The rejected shadcn/Base UI/Mira experiment is retired and is not a reference for future work.

## Product direction

Taxi GPS is operational software for monitoring fleets. Presentation work must preserve authentication, authorization, API contracts, provider behavior, position freshness, history and track behavior, trips/stops, reports, alerts, settings, user management, audit behavior, Telegram, localization, and accepted timezone semantics. Frontend redesign has no API, business-rule, Prisma, or migration scope.

## Foundation and component policy

Ant Design 6 is authoritative for new generic UI. Prefer an official Ant Design component, then composition of official Ant Design components, then a Taxi GPS domain component composed from Ant Design primitives. A custom generic component is the last resort.

The current baseline intentionally uses the native/default Ant Design light appearance. There are no global or component token overrides; custom visual theming is deferred until human acceptance. Tailwind remains installed for legacy pages, MapLibre, and genuinely domain-specific layout, but must not reskin Ant Design controls.

The official App Router registry and a locale-aware `ConfigProvider` are the integration path. Ant Design's `en_US`, `ru_RU`, and `uk_UA` locales accompany product-owned English, Russian, and Ukrainian strings. Use the official Ant Design application context where feedback APIs are needed.

Do not depend on Ant Design's internal DOM or styles. Custom `.ant-*` selectors are prohibited. Prefer component props and responsive APIs such as `Grid.useBreakpoint`, then small Taxi GPS layout rules only where required. There must be no large handcrafted generic visual layer around Ant Design.

Radix remains installed while it has consumers. It is not the preferred choice for new generic interface components and must not be removed without a repository-wide proof that it is unused.

## Navigation

Desktop primary navigation is horizontal and top-based. Taxi GPS has too few primary sections to justify a permanent desktop sidebar that reduces operational workspace. Fleet, Map, Events, Reports, and the permission-aware Administration group belong in one coherent top application header, with language and account/logout controls at the right.

Administration groups only the allowed Users, Settings, Audit, and GPS History links. It is omitted when no child is authorized. Active route state must remain meaningful for nested routes, including vehicle detail and administrative pages. Do not create a duplicate permanent or in-page application navigation surface.

At tablet and phone widths, replace the horizontal menu before it wraps with a compact header and an on-demand, focus-managed Ant Design Drawer. The Drawer contains the same permission-aware navigation and closes after navigation. It is temporary mobile navigation, not a permanent sidebar.

Fleet, Map, Reports, and other operational pages retain the available browser width below the header, subject only to practical page gutters. Do not place them in a narrow marketing-style content container.

## Fleet baseline

Fleet remains at `/` and is the first fully migrated Ant Design route. It uses existing validated data only and preserves current search, status, activity, disabled-vehicle, debounce, URL/history, refresh, and retry semantics. There is no current server-side sort contract, so the baseline does not invent one.

The page uses native Typography for its compact header and real metadata; Card, Statistic, Row, and Col for current derived metrics; Input, Select, Checkbox, and primary Button for the toolbar; and a real Ant Design Table for desktop. The table uses the complete authorized fleet with `pagination={false}` and no decorative row selection. Its current columns are vehicle identity and detail link, status, GPS freshness and timestamp, speed, daily distance, source/quality, and activity.

Scheduler/data-service diagnostics remain factual and subordinate, using native Card, Badge, Alert, Button, and Descriptions without changing the scheduler. Loading keeps useful table data visible; errors preserve retry; and Ant Design Empty distinguishes an empty fleet from an empty filtered result. On narrow screens, a native List-based domain composition replaces the desktop table. Tablet columns are responsive and the table uses official horizontal scroll support.

## Migration sequence

1. Ant Design native foundation, top navigation, and Fleet receive human visual acceptance.
2. Map is the next redesign slice only after that acceptance.
3. Vehicle detail, Events, Reports, Administration, Account, and remaining routes migrate in small behavior-preserving slices.

The Map redesign has not started in the first foundation slice.
