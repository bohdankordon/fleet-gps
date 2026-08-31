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

Fleet remains at `/` and is the first fully migrated Ant Design route. It uses existing validated data only and preserves current search, status, activity, disabled-vehicle, debounce, URL/history, refresh, retry, and client-only sort semantics. There is no server-side sort contract: ordering stays local, while filtering and authorization remain server-owned.

The human-selected Fleet composition is final. The page uses native Typography for a compact header and real metadata, the operational scheduler, four semantic Ant Design summary Cards for total, connection, GPS, and daily distance, one list-control surface, and a real Ant Design Table for desktop. Search, local Sort, and Refresh remain always visible. Optional Status, minimum-distance, and disabled-vehicle filters live in a collapsed-by-default section; an active count keeps hidden filter state visible. Reset is always present at the far right of the disclosure header, disabled at defaults and enabled when any optional filter is active. Refresh loading retains its visible label so toolbar geometry remains stable. Scheduler diagnostics are collapsed by default in healthy operation, and the generated timestamp is owned by the page metadata rather than repeated in the collapsed scheduler row. The table uses the complete authorized fleet with `pagination={false}` and no decorative row selection. Its current columns are linked vehicle identity, connectivity status, GPS freshness and timestamp, speed, daily distance, distance-data provenance/quality, and minimum-distance classification. Vehicle names use conventional link affordance, while vehicle-disabled state remains a separate compact neutral Tag.

Scheduler/data-service diagnostics remain factual but are collapsed by default in normal operation, using native Collapse, Badge, Alert, Button, Cards, and Descriptions without changing the scheduler. Expanded diagnostics use three semantic Cards for overall state, vehicles/positions, and daily distance. A degraded refresh expands the disclosure and retains retry plus all useful diagnostics. Fleet prioritizes vehicle data above diagnostic detail; loading keeps useful table data visible, errors preserve retry, and Ant Design Empty distinguishes an empty fleet from an empty filtered result. On narrow screens, a native List-based domain composition replaces the desktop table. Tablet columns are responsive and the table uses official horizontal scroll support.

Operational tables prioritize scanability over decoration. Vehicle identity is the strongest row content, numeric metrics use right alignment and tabular numerals, and long desktop tables use the official sticky header when page geometry permits. Meaningful domain absence remains explicit, while generic nullable cells use a restrained em dash. Hover remains subtle, links retain keyboard focus, and tables do not gain fictional actions, selection, zebra striping, or pagination.

## Migration sequence

1. Ant Design native foundation, top navigation, and Fleet are human accepted and complete.
2. Map is the next redesign slice.
3. Vehicle detail, Events, Reports, Administration, Account, and remaining routes migrate in small behavior-preserving slices.

The Map redesign has not started in the first foundation slice.
