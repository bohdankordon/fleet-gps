# Frontend design direction

Status: Ant Design 6 is the active frontend foundation. The rejected shadcn/Base UI/Mira experiment is retired and is not a reference for future work.

## Product direction

The visible application-shell product brand is **Fleet GPS**. Existing technical Taxi GPS identifiers—including the repository, npm packages, services, environment keys, database identifiers, and historical release documentation—remain unchanged unless a separately scoped technical migration explicitly requires otherwise. The product is operational software for monitoring fleets. Presentation work must preserve authentication, authorization, API contracts, provider behavior, position freshness, history and track behavior, trips/stops, reports, alerts, settings, user management, audit behavior, Telegram, localization, and accepted timezone semantics. Frontend redesign has no API, business-rule, Prisma, or migration scope.

## Foundation and component policy

Ant Design 6 is authoritative for new generic UI. Prefer an official Ant Design component, then composition of official Ant Design components, then a Taxi GPS domain component composed from Ant Design primitives. A custom generic component is the last resort.

The current baseline intentionally uses the native/default Ant Design light appearance. Narrow component-token adjustments are allowed when they preserve that native appearance and express a documented shell requirement, such as the horizontal Menu line height and active indicator. Tailwind remains installed for legacy pages, MapLibre, and genuinely domain-specific layout, but must not reskin Ant Design controls.

The official App Router registry and a locale-aware `ConfigProvider` are the integration path. Ant Design's `en_US`, `ru_RU`, and `uk_UA` locales accompany product-owned English, Russian, and Ukrainian strings. Use the official Ant Design application context where feedback APIs are needed.

Do not depend on Ant Design's internal DOM or styles. Custom `.ant-*` selectors are prohibited. Prefer component props and responsive APIs such as `Grid.useBreakpoint`, then small Taxi GPS layout rules only where required. There must be no large handcrafted generic visual layer around Ant Design.

Radix remains installed while it has consumers. It is not the preferred choice for new generic interface components and must not be removed without a repository-wide proof that it is unused.

`@ant-design/icons` is the default icon source for application UI. Do not introduce Unicode characters as substitute UI icons when an appropriate Ant Design icon exists; use the official icon component and keep it on the same major version as Ant Design. Do not add another icon library or invent a custom graphic without first establishing that the Ant Design icon set has no suitable option.

## Navigation

Desktop primary navigation is horizontal and top-based. Fleet GPS uses a light, viewport-wide Ant Design application header with a compact `EnvironmentFilled` brand. The icon and product name form one semantic home link to `/`, while retaining neutral product-identity styling rather than ordinary content-link styling. The header uses deliberate 24–32px desktop gutters, restrained spacing, and compact language and account controls. The application has too few primary sections to justify a permanent desktop sidebar that reduces operational workspace. Fleet, Map, Events, Reports, and the permission-aware Administration destination belong in one coherent top application header, with language and account/logout controls at the right.

The five primary desktop destinations use deterministic semantic links rather than a responsive horizontal Menu. All five remain visible together; primary-route navigation must never collapse into an overflow ellipsis. Horizontal navigation uses a neutral foreground and native/subtle hover treatment. The active section uses semantic primary text with a restrained 2px bottom indicator, never a full-height filled block. Administration is an ordinary top-level link to the authorized landing destination and stays active for every `/admin/*` route.

Administration children use one shared permission-aware in-page Ant Design Tabs composition near the page title. Tabs expose only the real authorized Users, Settings, Audit, and GPS History destinations, select exact and nested routes correctly, and remain localized. They are local Administration navigation, not a second global header, large card, sidebar, or dark bar.

Brand, primary navigation, locale, and account controls share one centered flex alignment system. Header controls reserve stable border and width geometry: hover may change token-derived color or background but never width, height, padding, or neighboring coordinates. Locale width accounts for the longest supported language name so changing locale cannot displace primary navigation.

At tablet and phone widths, replace the horizontal menu before it wraps with a compact header using the real Ant Design `MenuOutlined` icon and an on-demand, focus-managed Ant Design Drawer. The Drawer contains the same permission-aware navigation plus locale and account access and closes after navigation. It is temporary mobile navigation, not a permanent sidebar.

Fleet, Map, Reports, and other operational pages retain the available browser width below the header, subject only to practical page gutters. Do not place them in a narrow marketing-style content container.

## Fleet baseline

Fleet remains at `/` and is the first fully migrated Ant Design route. It uses existing validated data only and preserves current search, status, activity, disabled-vehicle, debounce, URL/history, refresh, retry, and client-only sort semantics. There is no server-side sort contract: ordering stays local, while filtering and authorization remain server-owned.

The human-selected Fleet composition is final. The page uses native Typography for a compact header and real metadata, the operational scheduler, four semantic Ant Design summary Cards for total, connection, GPS, and daily distance, one list-control surface, and a real Ant Design Table for desktop. Search, local Sort, and Refresh remain always visible. Optional Status, minimum-distance, and disabled-vehicle filters live in a collapsed-by-default section; an active count keeps hidden filter state visible. Reset is always present at the far right of the disclosure header, disabled at defaults and enabled when any optional filter is active. Refresh loading retains its visible label so toolbar geometry remains stable. Scheduler diagnostics are collapsed by default in healthy operation, and the generated timestamp is owned by the page metadata rather than repeated in the collapsed scheduler row. The table uses the complete authorized fleet with `pagination={false}` and no decorative row selection. Its current columns are linked vehicle identity, connectivity status, GPS freshness and timestamp, speed, daily distance, distance-data provenance/quality, and minimum-distance classification. Vehicle names use conventional link affordance, while vehicle-disabled state remains a separate compact neutral Tag.

Scheduler/data-service diagnostics remain factual but are collapsed by default in normal operation, using native Collapse, Badge, Alert, Button, Cards, and Descriptions without changing the scheduler. Expanded diagnostics use three semantic Cards for overall state, vehicles/positions, and daily distance. A degraded refresh expands the disclosure and retains retry plus all useful diagnostics. Fleet prioritizes vehicle data above diagnostic detail; loading keeps useful table data visible, errors preserve retry, and Ant Design Empty distinguishes an empty fleet from an empty filtered result. On narrow screens, a native List-based domain composition replaces the desktop table. Tablet columns are responsive and the table uses official horizontal scroll support.

Operational tables prioritize scanability over decoration. Vehicle identity is the strongest row content, numeric metrics use right alignment and tabular numerals, and long desktop tables use the official sticky header when page geometry permits. Meaningful domain absence remains explicit, while generic nullable cells use a restrained em dash. Hover remains subtle, links retain keyboard focus, and tables do not gain fictional actions, selection, zebra striping, or pagination.

## Human-accepted visual reference

The human-accepted Fleet screen is the canonical visual reference for subsequent screen redesigns. Future screens should inherit its design language while adapting the system to their own workflow; they must not mechanically copy Fleet's exact structure where it does not fit the content or task.

- **Application shell.** The visible brand is Fleet GPS in a light horizontal Ant Design header with no permanent desktop Sidebar. Desktop navigation has five deterministic primary links and a restrained underline active state. Locale and account controls remain compact. Administration is a normal primary route whose children use in-page Ant Design Tabs. Responsive navigation uses `MenuOutlined` with Drawer. `@ant-design/icons` is the default icon source, and Unicode characters must not substitute for an available Ant Design icon.
- **Page canvas.** Use a restrained light Ant Design layout background and deliberate vertical rhythm. Page title, description, and metadata remain open on the canvas unless boxing them serves a functional purpose.
- **Surfaces.** Primary work areas use `colorBgContainer` or the equivalent Ant Design surface. Prefer quiet semantic borders and a consistent restrained radius family over shadows. Frame only real functional groupings; avoid unnecessary nesting and card soup.
- **Secondary surfaces.** Restrained alternate fills may distinguish headers and disclosures. Table headers and comparable secondary surfaces stay subtle, without decorative gradients or strong elevation.
- **Color.** Use semantic state colors only where they carry real meaning. Mixed-status Cards remain neutral rather than becoming red, green, or amber panels. Reserve primary blue for actions, navigation, and restrained orientation accents; neutral content remains neutral.
- **Icons.** Icons are orientation aids, not decoration to repeat everywhere. Fleet demonstrates the approved pattern with `EnvironmentFilled`, `SyncOutlined`, `CarFilled`, `ApiFilled`, `AimOutlined`, `BarChartOutlined`, and `FilterFilled`. Icons beside an adequate text label are normally decorative and hidden from assistive technology. Do not add icons to every label or Table header.
- **Component philosophy.** Prefer native Ant Design 6 primitives and consult current official documentation before inventing custom behavior. Application-owned CSS is acceptable for layout and optical precision, but brittle Ant Design internal selectors are prohibited.
- **Data-dense UI.** Operational Tables remain dense and readable, with deliberate numeric alignment, explicit meaningful absence states, and restrained dashes for generic missing values. Responsive behavior is intentional; desktop layouts must not simply be squeezed onto mobile.

## Migration sequence

1. Ant Design native foundation and Fleet are human accepted and complete.
2. The deterministic Fleet GPS header and in-page Administration Tabs are human accepted and complete.
3. Map is the next redesign slice.
4. Vehicle detail, Events, Reports, Administration, Account, and remaining routes migrate in small behavior-preserving slices.

The Map redesign has not started.
