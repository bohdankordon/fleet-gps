# Frontend design direction

Status: Slice 1 foundation and authenticated application shell implemented on
current `main`. The next implementation slice is Fleet overview redesign.

This brief is the authoritative UX and visual direction for the completed Taxi
GPS / fleet-monitoring product. It starts from `main` at
`ab2fa386ced0727983987933fda48c43a138b567` and does not reuse the retired
DeepSeek design experiments.

## Product direction

Taxi GPS is professional operational software for company fleets, service
vehicles, delivery vehicles, work vehicles, and mixed commercial fleets. The
interface should help an operator scan a fleet, find exceptions, inspect a
vehicle, understand its history, and adjust policy with minimal cognitive
overhead.

The intended personality is **professional, calm, operational, dense,
legible, trustworthy, and restrained**. It should feel like a durable fleet
operations product used for hours each day: clear hierarchy, quiet surfaces,
strong status language, and useful density. It should not resemble a consumer
taxi-hailing app, a crypto dashboard, a generic admin template, or a marketing
site.

The design principles are:

1. **Attention before decoration.** Put vehicles, freshness, exceptions, and
   actions ahead of decorative metrics or oversized introductions.
2. **One operational truth.** Reuse the server-provided freshness semantics,
   existing alert states, authorization rules, and current track modes. The UI
   may clarify them, but must not create competing business rules.
3. **Context stays visible.** A selected vehicle, date range, and current
   workspace should remain clear while moving between list, map, detail, and
   history.
4. **Structured density.** Prefer readable tables and compact lists for
   repetitive fleet data. Use panels and cards only when they group a decision
   or an important state.
5. **Progressive disclosure.** Show the decision-relevant summary first and
   keep technical or administrative detail one level deeper.
6. **Status is explicit.** Text and icon cues accompany color. Similar-looking
   states must not be collapsed into one generic red/green treatment.
7. **Safe incremental change.** Each implementation slice must be independently
   reviewable, testable, and behavior-preserving.

## Scope and behavioral boundary

This is a presentation and interaction brief. The implementation that follows
must preserve authentication, authorization, API contracts, provider behavior,
position freshness semantics, history and track behavior, trips/stops,
reports, alerts, global settings, user management, audit behavior, Telegram
linking/preferences/delivery, and localization.

Expected database impact is **zero migrations**. If a future visual design
needs information that the current read contract does not provide, that is a
separate backend/API decision; it must not be smuggled into a presentation-only
slice.

## Current product inventory

The current main branch was inspected from source and exercised locally on
`127.0.0.1` with development background jobs disabled. The relevant source
surfaces include:

| Surface | Current route(s) | Notes |
| --- | --- | --- |
| Authentication | `/login`, logout action | Public login, authenticated redirect, validation and error states |
| Application shell | all authenticated routes | Header navigation, language selector, account link, logout, skip link |
| Fleet overview | `/` | Dashboard filters, scheduler status, summary metrics, desktop table, mobile list |
| Fleet map | `/map` | MapLibre map, freshness summary, alert/geofence overlays, marker selection and vehicle panel |
| Vehicle detail | `/vehicles/[vehicleId]` | Current position/state, speed, freshness, today summary, events and deep links |
| Exact track | `/vehicles/[vehicleId]/track` | Recent exact mode, custom date/time range, gaps, track map and legend |
| Sampled/overview track | `/vehicles/[vehicleId]/track` with overview behavior | Multiday overview mode and track-quality summary |
| Trips and stops | `/vehicles/[vehicleId]/trips` | Policy-aware trip/stop analysis, GPS gaps and date presets |
| Alerts/events | `/events` | Open/resolved and type filters, summary counts, event history and delivery context |
| Reports | `/reports` | Fleet daily activity, date controls, KPIs and numeric table |
| Administration/users | `/admin/users`, `/admin/users/new`, `/admin/users/[userId]` | User identity, role/permissions, lifecycle actions and Telegram safety controls |
| Global business settings | `/admin/settings` | General, speeding, inactivity, trips/stops and geofence ownership |
| GPS history administration | `/admin/history` | Coverage/status, horizon planning, population and retention-related operational controls |
| Audit | `/admin/audit` | Filterable audit event viewer |
| Account | `/account`, `/account/change-password`, `/account/no-access` | Identity, password change, access guidance and account actions |
| Telegram and notification preferences | `/account/notifications` | Connection/link/relink/disconnect, master enablement, types and vehicle scope |
| Permission outcomes | `/forbidden`, `/account/no-access` | Explicit denied/access guidance states |
| Shared states | route loading files, initial error components, refresh errors, empty states | Loading, retry, no-data and permission patterns already exist in several forms |
| Localization | language selector and locale preference BFF route | User locale, translated labels, dates, times and numbers |

The inventory includes the current authenticated feature set rather than the
retired subset from earlier design experiments. The Web BFF/API routes were
reviewed as supporting surfaces; they are not redesign targets in this stage.
Useful source anchors are the [application shell](../apps/web/src/components/app-shell.tsx),
[navigation](../apps/web/src/components/app-navigation.tsx),
[dashboard](../apps/web/src/components/dashboard-client.tsx),
[map](../apps/web/src/components/fleet-map-client.tsx), and the
[shared UI primitives](../apps/web/src/components/ui/index.ts).

## UX audit of current main

The audit covered approximately 1440px, 1280px, 768px, and 390px widths on
the local application. The observed data included an empty-alert state,
stale/no-position vehicles, empty report/trip results, admin policy data, and
an unconnected Telegram account, so the review included more than a happy-path
mock state.

### Strengths to retain

- The current branch exposes the completed product surface: fleet, map,
  details, exact/overview tracks, trips/stops, reports, alerts, settings,
  users, audit, history administration, account, and Telegram preferences.
- The existing light theme has semantic tokens, a practical system-first sans
  stack, restrained blue/neutral surfaces, and no dependence on decorative
  imagery or exotic fonts.
- The desktop fleet table is materially more scannable than a one-card-per-
  vehicle dashboard. It already exposes vehicle identity, connectivity,
  freshness, speed, distance, source quality, and activity.
- Fresh/stale/missing position labels, current alert type labels, exact versus
  overview track copy, and server freshness metadata are good foundations for
  a shared status language.
- The map already supports MapLibre, marker selection, selected-vehicle
  details, city-geofence state, open-alert overlays, refresh fallback, and a
  legend. The track surface has useful date presets, custom range controls,
  gap summaries, and a data-quality explanation.
- Shared `Button`, form, feedback, dialog, `PageHeader`, icon, skip-link,
  reduced-motion, and focus-visible patterns provide a usable base. The Radix
  dialog implementation is an appropriate foundation for destructive
  confirmations.
- Permission-filtered navigation, explicit forbidden/no-access states, audit
  visibility, revision-conflict handling, and locale-aware formatting are
  important trust features.

### Weaknesses to address

- The top horizontal header is doing the work of a desktop application shell.
  At 768px and 390px it becomes a horizontally scrolling navigation strip, so
  the user loses a stable sense of workspace and the current destination can
  sit off-screen.
- Fleet overview begins with a large hero and a dominant scheduler panel before
  the operator reaches the filter bar and vehicle rows. This is visually calm
  but delays the primary question: which vehicles need attention now.
- Summary cards are useful in moderation, but several screens repeat large
  metric/card stacks and generous vertical gaps. Vehicle detail is especially
  sparse when today statistics and events are empty.
- Map-to-list context is incomplete. Marker selection reveals a panel below
  the map, but the desktop surface has no persistent fleet list beside the map
  and no clear list-to-marker workflow. On mobile the map and selected details
  are pushed below the summary and legend.
- The mobile fallback is inconsistent: the dashboard has a compact list, while
  generic table styling can hide a table at small widths or leave reports and
  audit data dependent on horizontal overflow. Each screen needs a deliberate
  fallback based on its information shape.
- Status is expressed through several ad hoc combinations of badges, labels,
  icons, and colors: online/offline/unknown, fresh/stale/missing,
  speeding/inactivity, provider-disabled, and Telegram states are not yet a
  single comprehensible vocabulary.
- Settings and notification forms become visually awkward on mobile. Current
  checkbox/radio controls can appear detached from their labels, and global
  settings use very wide fields despite being naturally grouped into readable
  form sections.
- Admin pages are functionally valuable but mix summary, policy controls,
  technical history details, and destructive actions without a consistent
  hierarchy. Audit/history tables are dense enough to need a deliberate
  detail/reveal pattern.
- Events has a clear empty state and filters, but it needs stronger triage
  structure for type, vehicle, time, current/resolved state, context, and next
  action. Account Notifications still contains stage-oriented copy saying
  delivery will be added later even though per-user delivery is complete;
  that copy should be removed in the implementation stage.
- Reports have useful numeric alignment and date context, but the empty-data
  presentation leaves a wide, quiet table and does not yet define a clear
  mobile reading mode for many columns.
- Long translations and longer date/time formats will challenge the current
  nowrap navigation, wide filter rows, action clusters, and fixed table
  assumptions.

These are visual and interaction findings. They do not by themselves indicate
functional defects or justify changes to the API, domain logic, or schema.

## Operator workflows

The target experience is organized around these daily workflows:

| Workflow | Target support |
| --- | --- |
| A. Understand what needs attention | Fleet opens to a dense, sortable view with freshness and alert cues above the fold; an explicit “attention” filter groups existing stale, missing, offline, and open-alert states without changing their meaning. |
| B. Find/select a vehicle | Search by the existing vehicle identity, filter, sort, and select a row; selection is retained when opening the map or detail. |
| C. Verify freshness/location/speed/state | The same freshness label, observed time/age, speed, connectivity, and provider state appear in fleet, map selection, and vehicle detail. |
| D. Move between vehicle and map | A selected vehicle has a visible “show on map” action; the split map opens with the row/marker selected and the vehicle context remains available. |
| E. Inspect an alert | Events is a triage table with type, vehicle, opened/updated time, current/resolved state, context, and an action to open the vehicle or map. |
| F. Inspect recent/history track | Vehicle detail exposes exact recent track and overview history as clearly labelled destinations with the active vehicle and date range visible. |
| G. Understand trips/stops | Trip/stop results lead with range, policy context, totals, GPS gaps, and compact segments; the map/timeline is secondary to the operational summary. |
| H. Adjust fleet-wide policy | Administration → Business settings keeps General, Speeding, Inactivity, Trips & stops, and Geofence ownership explicit, with clear save/conflict/error feedback. |
| I. Manage users | Administration → Users separates identity, role, permission/status, Telegram safe status, and actions with deliberate confirmation for danger. |
| J. Configure personal Telegram notifications | Account → Notifications explains connection status, link/relink/disconnect, master enablement, SPEEDING, INACTIVITY, ALL/SELECTED scope, vehicle selection, save, and conflict recovery in user language. |

## Information architecture and navigation

### Selected model

Use a persistent desktop sidebar with a compact top bar. The sidebar is the
primary navigation model; the current horizontal header should not be carried
forward as the main desktop shell.

Desktop target structure:

```text
┌────────────────┬──────────────────────────────────────────────────────────┐
│ Taxi GPS       │ context / freshness / locale / account                   │
│ Fleet          ├──────────────────────────────────────────────────────────┤
│ Map            │ page header                                                │
│ Events         │ filters / content / map / table                            │
│ Reports        │                                                            │
│                │                                                            │
│ Administration │                                                            │
│  Users         │                                                            │
│  Settings      │                                                            │
│  Audit         │                                                            │
│  GPS history   │                                                            │
│                │                                                            │
│ Account        │                                                            │
└────────────────┴──────────────────────────────────────────────────────────┘
```

- The full sidebar is approximately 224–248px wide. It can collapse to a
  labelled icon rail on large screens, with a persistent expand control and
  tooltips for icons. Collapsing is a preference, not a hidden navigation
  state.
- Fleet, Map, Events, and Reports form the primary operational group.
  Administration is permission-gated and groups Users, Business settings,
  Audit, and GPS history. Account is anchored at the bottom of the sidebar and
  remains available from the user menu in the top bar.
- The top bar is for context and utilities: sidebar toggle, breadcrumb or
  active vehicle context, last refresh/freshness indication when relevant,
  locale, account, and logout. It should not duplicate the primary nav.
- Breadcrumbs are useful only on deep contexts such as
  `Fleet / Vehicle / Track` and `Administration / Users / User`. They are not
  needed on Fleet, Map, Events, Reports, or top-level settings.
- Vehicle detail uses a compact local tab/link row for Overview, Track, and
  Trips. Existing URLs remain the source of truth; the tabs are navigational
  context, not a new routing contract.
- At 768px the sidebar becomes a collapsible rail or drawer and the content
  retains a stable top bar. At 390px use a menu button and a modal/off-canvas
  drawer with grouped links; close the drawer after navigation. Do not use a
  horizontal primary-navigation scrollbar as the mobile architecture.

The user should always see the current workspace, the active vehicle/date
context where one exists, and a direct route back to Fleet.

## Fleet overview direction

Fleet is the primary operational screen. The target desktop order is:

1. compact page header with fleet count, service date/timezone, and generated
   time;
2. a small refresh/freshness line and any actionable system warning;
3. one filter/sort toolbar;
4. the vehicle table, with summary metrics available as a compact strip rather
   than a dominant wall of cards.

Use a structured table for repetitive fleet data. The baseline columns should
retain the current contract-backed fields: vehicle identity, connectivity
status, position freshness and last fix time/age, speed, daily distance/source
quality, and activity. A compact open-alert indicator may be included only if
the existing response data supports it. The current dashboard contract should
not be extended during a visual slice solely to add an alert-count column; if
that information is required, flag it as a separate API decision.

Table behavior:

- One row is one vehicle, 44–52px depending on density mode. Vehicle name is
  the primary link; secondary metadata is quiet and aligned.
- Use sticky column headers when the list scrolls, numeric `tabular-nums`,
  right alignment for speed/distance/counts, and a selected-row background with
  a strong non-color cue such as an inset border or leading marker.
- Search, status, freshness, activity, disabled inclusion, alert/open-state
  and sorting controls should live in one responsive filter bar. Preserve
  existing query/history behavior.
- For 50 vehicles, show the full table without pagination pressure. For 100,
  keep the same scan model and allow vertical scrolling. For 200+, use
  windowed rendering or an equivalent performance-safe list strategy in the
  Web layer if needed; do not alter the API contract as part of the redesign.
- Selecting a row keeps the selection visible while opening a detail view or
  the map. “Show on map” is a direct action, not a hidden side effect.
- Keep scheduler status available, but reduce it to an operationally useful
  inline system panel or a collapsible “data service status” section. It must
  not push the vehicle list below the first viewport on ordinary desktop use.

## Map direction

MapLibre is a work tool and should receive most of the usable height on map
screens.

- Desktop uses a split workspace: approximately 38–44% compact vehicle list
  and 56–62% map. The list and map share one selection model. The selected row
  and marker are both visibly active, and the map fits or pans to the selected
  vehicle without losing the fleet context.
- Keep only the controls needed to work: zoom, fit fleet, optional filter,
  legend, and a small freshness/alert key. Do not stack unrelated cards over
  the map.
- The selected vehicle appears in a narrow context panel or anchored side
  sheet beside the map, with identity, freshness, speed, last position/age,
  current alert type/state, and actions to open detail/events. It should not
  require scrolling below the map on desktop.
- At high fleet sizes, clustering is appropriate only when it improves marker
  selection. Cluster counts, selected state, and list filtering must remain
  understandable and must not change the underlying freshness or alert
  semantics.
- Freshness, stale, no-position, speeding, inactivity, geofence, and provider
  state use text/icon cues in the legend and selected panel. Avoid relying on
  marker color alone.
- On mobile, use a full-width map mode with a compact top control row and a
  draggable or modal bottom sheet for the vehicle list/selected context. The
  map should be reachable early, with list results and selected details
  available without covering the entire map permanently.

## Vehicle detail direction

Vehicle detail should answer “what is this vehicle doing now, and what can I
inspect next?” above the fold.

Above the fold:

- breadcrumb back to Fleet and a clear vehicle identity;
- connectivity and position freshness as separate statuses;
- observed time and age, current speed, and last position context;
- primary actions: show on map, open track, open trips, refresh;
- a compact current-state strip rather than a large empty hero.

Secondary content:

- today’s trip/distance summary when available, with an explicit no-data state
  when it is not;
- current/open events before historical events;
- a local navigation row for Overview, Track, and Trips.

Use a two-column layout around 1440px, a single readable column at 768px and
390px, and avoid reserving large blank regions for missing statistics. Existing
deep links and route-level authorization remain unchanged.

## Alerts and events direction

Events is an operational triage surface, not a decorative notification
dashboard. Keep the current domain model: SPEEDING and INACTIVITY types and
the current open/resolved behavior. Do not invent a severity scale or rename
existing states into an unapproved taxonomy.

The primary table/list fields are:

| Field | Direction |
| --- | --- |
| Type | A text label plus type-specific icon; distinguish SPEEDING from INACTIVITY without color alone. |
| Vehicle | Primary link to vehicle detail; retain the vehicle name in every compact row. |
| Time | Opened/updated time with locale-aware absolute time and an understandable relative age where useful. |
| State | Existing current/resolved state, with text and icon. |
| Context | Short factual supporting value such as the current event context already provided by the domain. |
| Action | Open vehicle, map, or the relevant event context; use an action menu on narrow widths. |

Summary counts remain useful as a slim strip above filters. Filters should be
stable across widths, and empty results should distinguish “no events match
these filters” from “the fleet has no events.”

## History, tracks, trips, and stops

The interface should explain data coverage without exposing storage or
implementation details.

- Label the current recent mode as **Exact track** and the multiday mode as
  **Overview track** (or the accepted localized equivalent). Include the
  selected range and timezone next to the label.
- Keep quick ranges and custom date/time input together. Put the current range,
  point count, start/end, and gap count in a compact summary strip.
- Render gaps longer than the existing threshold as explicit breaks or
  annotated spans in the timeline/map. A missing segment is a data condition,
  not a continuous line.
- Trips/stops should lead with the date range, policy context, totals,
  duration/distance, GPS gaps, and a compact segment list. Use the map or
  timeline to explain the result only when it helps comprehension.
- “No history,” “no points in this range,” “provider unavailable,” and an API
  failure are different states and should remain distinct.

## Reports and analytics direction

Reports should prioritize a reliable answer over chart decoration.

- Keep one consistent date/range toolbar with timezone and generated/coverage
  context visible.
- Use a compact KPI strip for fleet totals, GPS coverage, trips, distance,
  and time when the current report provides them. Keep zero/no-data values
  legible rather than visually disappearing.
- Use dense tables for vehicle-by-vehicle numeric data. Align numbers by the
  decimal/right edge and use tabular numerals. Keep the table header visible
  when scrolling.
- At 768px, allow controlled horizontal scrolling for a genuinely wide report
  table while keeping the first identity column visible if practical. At 390px,
  prefer compact report rows with the vehicle and the two or three highest
  value metrics first; expose the remaining metrics through a drill-down or a
  clearly labelled horizontal detail region. Do not apply the dashboard card
  transformation blindly.
- Add charts only when they reveal a trend or comparison that the table cannot
  communicate. The current daily activity report does not need decorative
  charts to be useful.

## Settings, account, and administration

### Global business settings

Administration → Business settings owns the current global policy and groups
the existing implementation into:

1. General
2. Speeding
3. Inactivity
4. Trips & stops
5. Geofence

Use one readable form column or a carefully bounded two-column form at desktop,
not full-width inputs across the entire operations canvas. Each section has a
short explanation, labelled controls, units where applicable, and a consistent
save/status area. Show revision/conflict and validation feedback as user-facing
messages; do not expose internal revisions as a primary concept. The geofence
summary remains read-only unless and until its existing behavior is formally
expanded.

GPS history administration is a separate technical/admin surface. It should
be visually calmer and progressively disclose run details, coverage, and
maintenance actions instead of competing with the business-policy form.

### Account → Notifications

The page should read as a personal notification setup:

1. Telegram connection card: Connected, Not connected, Link pending, or Needs
   attention; explain the next user action with Connect, Reconnect, or
   Disconnect.
2. Notification master switch.
3. Event-type controls for SPEEDING and INACTIVITY.
4. Vehicle scope: ALL or SELECTED, followed by an accessible vehicle selector
   only when SELECTED is active.
5. Save state: saving, saved, validation error, or “settings changed elsewhere”
   with a clear recovery action.

Connection revisions, Telegram IDs, queue/dispatcher details, lease tokens,
and internal delivery mechanics do not belong in the UI. The stale message
that delivery will be added in a later stage must be removed when this screen
is implemented; the product behavior is already complete.

### Administration → Users

The list separates identity, role, permission/status, safe Telegram connection
status, and administrative actions. Use an action menu or compact action group
for edit, enable/disable, reset, and safe Telegram disconnect. Destructive
actions use a clear confirmation dialog and danger treatment, but do not become
oversized primary buttons. User detail can progressively disclose permissions
and one-time secrets.

## Status system

Use separate status families so semantically different states are not reduced
to one vague color:

| Family | States and treatment |
| --- | --- |
| Connectivity | Online, Offline, Unknown. Use a connection icon, text label, and neutral/danger treatment appropriate to the state. Do not infer position freshness from connectivity. |
| Position | Fresh, Stale, No position. Use clock/history/no-position icons and text; stale is a warning condition, no position is neutral/unknown until the domain says otherwise. |
| Provider | Enabled/available versus Provider disabled. Provider-disabled is a neutral/informational explanation, not an alarm by default. |
| Operational alert | SPEEDING and INACTIVITY. Use their existing type labels/icons and current/resolved state. Do not add severity semantics. |
| Integration | Connected, Link pending, Disconnected, Needs attention/Broken. Use link/check/clock/warning cues and explanatory text. |
| Request/system state | Normal, Loading, Warning, Error, Permission denied. Use an icon, heading, explanation, and action where recovery exists. |

`active` may be used only where the current domain meaning is actually active
(for example, an active event or current operation); it is not a synonym for
online. Badges are compact labels, not the only way to show state. Red is
reserved for danger/error or the existing alert treatment, amber for stale or
warning, green for confirmed healthy/fresh/connected, blue for action/info,
purple only where it gives a distinct existing alert/data meaning, and gray for
neutral/unknown/disabled. Every status remains understandable in grayscale.

## Design system direction

### Typography

Keep the existing practical system-first sans token stack; do not add a web
font merely for novelty. The current `Inter, ui-sans-serif, system-ui` token
can remain the preferred stack with safe fallbacks.

| Role | Target |
| --- | --- |
| Page title | 28–32px, semibold, line height around 36–40px; concise and never a giant marketing headline. |
| Section title | 18–20px, semibold, line height around 26–28px. |
| Body | 14–16px with 1.45–1.6 line height. |
| Secondary text | 12–13px, muted but comfortably contrasted. |
| Table label | 12–14px, semibold; sentence case where possible. |
| Numeric data | 14–16px, tabular numerals; align by value type. |
| Caption/meta | 12px, used for timezone, generated time, and supporting facts. |

### Spacing and density

Use the existing 4/8-based tokens and expand them consistently rather than
introducing arbitrary one-off values.

- Operational desktop page gutters: approximately 24–32px; mobile: 16px.
- Section spacing: 20–24px; related controls: 8–12px.
- Panel padding: 16–20px; compact summary items: 12–16px.
- Table rows: 44–52px default, 40px compact mode; table header around 40px.
- Form field groups: 12–16px vertical rhythm; mobile controls have at least
  44px touch height.
- Settings and account forms use a readable maximum around 800–960px. Fleet,
  map, report, and audit workspaces use the available width instead of a narrow
  marketing-style column.
- Remove long empty hero spacing. A page may breathe, but the first useful
  operator action should be visible without a large decorative preamble.

### Surface hierarchy

Use one clear container level for most content:

1. page canvas: quiet light neutral background;
2. primary surface: white/near-white work area with a subtle border;
3. secondary/raised surface: a restrained tinted panel for grouping or a
   dialog/popover elevation;
4. table/list rows: transparent or primary surface with separators;
5. selected: a pale action tint plus an inset border/marker;
6. hover: a very light neutral/action tint;
7. dialog/drawer: raised surface with overlay and clear focus management;
8. popover/tooltip: compact raised surface, never a second dashboard card.

Avoid card-inside-card-inside-card composition. A panel should have a reason:
grouping controls, showing a decision metric, containing a form, or isolating a
state.

### Color roles

Retain the restrained blue/ink/neutral foundation already expressed by the
tokens, with semantic roles rather than page-specific colors:

- background: quiet cool neutral;
- surface: white or near-white;
- border: subtle neutral, stronger on controls/focus;
- text: high-contrast ink, secondary/muted text still readable;
- brand/action: deep operational blue with a darker hover/pressed state;
- success: green for confirmed fresh/connected/healthy states;
- warning: amber for stale/warning states;
- danger: red for errors, destructive actions, and existing alert emphasis;
- informational: blue/cyan tint for explanations and provider state;
- neutral: gray for unknown, unavailable, disabled, and no-position conditions;
- distinct alert/data cue: only where the existing domain needs it and always
  with text/icon support.

Do not make every metric colorful. Most fleet rows should be neutral with one
or two meaningful semantic cues.

## Component strategy

The project already uses Next.js/React, Tailwind 4 via the existing CSS import,
MapLibre, Radix Dialog, Luxon, Zod, and local CSS/token files. Continue with
that stack. Do not replace the framework or add a UI library for visual trend
reasons.

| Decision | Current/target components |
| --- | --- |
| KEEP | Existing token files and system-first typography; `Button`, `LinkButton`, `Input`, `NativeSelect`, `Label`, `FormField`, `Alert`, `Badge`, `Card`, `EmptyState`, `ErrorState`, `LoadingStatus`, `Spinner`, `Dialog`/`AlertDialog`, icon set, skip link, focus-visible contract, reduced-motion behavior, `AuthProvider`, `I18nProvider`, and the MapLibre adapter. |
| REFACTOR | `AppShell`, `AppNavigation`, and `AdminSubnavigation` into the sidebar/topbar model; `PageHeader` into compact operational headers; checkbox/radio composition so labels and controls stay together; page-specific summary/card layout; refresh/error announcements; admin and account form layout. |
| REPLACE | Screen-specific hero/scheduler/metric-card compositions that delay the primary work surface, and ad hoc status classes that duplicate `Badge` semantics. This is a layout/composition replacement, not a framework replacement. |
| ADD | `Sidebar`, `Topbar`, `NavGroup`, `Breadcrumbs`, `VehicleContext`, `StatusBadge`/`StatusIcon`, `DataFreshness`, `DataTable`, `FilterBar`, `MetricStrip`, `Panel`, `Tabs`, `Drawer`, `Popover`, `Tooltip`, `Skeleton`, `InlineRefreshStatus`, and reusable `EmptyState`/`ErrorState`/`PermissionDenied` variants. |

The additions should be small, composable primitives with semantic HTML and
existing token usage. A component is not justified only because it creates a
new visual wrapper.

## Tables, lists, cards, and detail panels

- **Tables:** default for repetitive fleet, alerts, users, audit, history, and
  report rows on desktop. Use scopes, sticky headers where appropriate,
  consistent numeric alignment, and selection/hover cues.
- **Compact lists:** preferred on mobile for fleet and alerts when a row can
  express identity, the key status, time, and one action without losing the
  workflow.
- **Cards/panels:** use for current-state summaries, form sections, selected
  vehicle context, empty/error states, and a small number of decision metrics.
  Do not make every vehicle a large card on desktop.
- **Detail panels/drawers:** use for selected map vehicles, mobile row details,
  audit event payloads, and narrow-width report expansion. The active context
  should be adjacent to its source list where possible.

## Responsive model

### Desktop: 1440 and 1280

Use a full available-width operational shell with a 224–248px sidebar and
content gutters around 24–32px. Fleet, map, reports, audit, and history may
use the full content area; settings/account forms remain bounded for reading.
The 1280 layout should not collapse into a mobile pattern merely because the
header is busy. Prefer a collapsed rail or reduced utility spacing while
keeping the operational table/map usable.

### Tablet: 768

Use a collapsible sidebar/drawer, 16–24px content gutters, two-column metric
strips only where labels remain readable, and one-column settings forms. Fleet
rows remain a structured list/table with an intentional horizontal or compact
fallback. Map and list may stack vertically with an explicit selection sheet;
do not allow a summary block to consume the entire first viewport.

### Mobile: 390

- Navigation: compact top bar with menu, product mark, context, locale/account
  access through the drawer or menu; no horizontal primary-nav scrollbar.
- Fleet: search and filters in a compact toolbar or filter sheet; results are
  stacked rows with vehicle name, primary status, freshness/age, speed, and a
  clear open action. Keep selection and “show on map.”
- Vehicle detail: stacked current-state, summary, and events sections with
  actions near the identity; preserve the active vehicle in every link.
- Map: full-width map first, around 360–480px useful height, with a bottom
  sheet for list/selected details and a small, non-blocking legend/control row.
- Alerts: compact triage rows with type, vehicle, time, current/resolved state,
  and a menu/action; filters open in a sheet or stack naturally.
- Settings: single-column labelled fields, grouped sections, clear inline
  errors, and a sticky or consistently reachable save action. Controls and
  labels are one touch target where possible.
- Telegram: connection status and next action first; master/type/scope groups
  follow in a single-column form. Selected-vehicle choices are progressive and
  do not overwhelm the connection card.
- Reports: compact rows for primary metrics; horizontal scrolling only for a
  genuinely dense detail table, with identity kept visible if practical.

## Accessibility and inclusive operation

- All controls and links are keyboard reachable in a predictable order. Keep
  the existing skip link and focus-visible ring; verify focus within the
  sidebar drawer, popovers, tabs, and dialogs.
- Maintain semantic headings, landmarks, table captions/`scope`, labels,
  descriptions, and error associations. A status badge is not a replacement
  for accessible text.
- Maintain at least WCAG AA contrast for text, controls, borders needed to
  identify inputs, and focus indicators. Do not encode status by color alone;
  pair color with text, icon, shape, or pattern.
- Use at least 44px touch targets on mobile. Compact desktop controls may use
  the existing 32–40px tokens when surrounding spacing and keyboard focus are
  clear.
- Radix dialogs remain modal with a focus trap, initial focus, escape/outside
  behavior appropriate to the action, and a clearly labelled close/cancel
  path. Destructive confirmation must name the action and target.
- Loading/refresh and save outcomes use appropriate polite/assertive live
  announcements without repeatedly interrupting screen readers.
- Provide a non-map list path for every map operation. Map visual state is
  supplemental, not the only way to find a vehicle or alert.
- Respect reduced motion and avoid animation as a status signal.

## Loading, empty, error, and freshness behavior

Use one family of state patterns:

- **Initial loading:** skeleton the final table/panel shape so the page does not
  jump; show a concise loading label for assistive technology.
- **Background refresh:** retain current data, mark the affected region busy,
  show “refreshing” near the toolbar, and show the last successful data time.
  Do not replace a usable table with a spinner.
- **Empty filtered result:** say that no vehicles/events/report rows match the
  current filters and provide “clear filters.”
- **Truly empty fleet/alert/history state:** explain what the absence means and
  what can happen next; do not use a generic error panel.
- **API failure:** retain fallback data where safe, state what failed, offer
  retry, and do not imply that stale data is current.
- **Permission denied:** use the existing forbidden/no-access behavior with a
  direct route to Account or Fleet where appropriate.
- **Stale information:** present stale as a business status with the age and
  last observed time; it is not automatically an API error.
- **No position/provider disabled:** distinguish no observed position from a
  disabled/unavailable provider using the status families above.

Vehicle freshness must use the existing server business-setting semantics. The
frontend should display the server-provided classification/threshold context
where available and must not introduce a second hard-coded threshold in a
visual redesign.

## Localization and content resilience

The existing localization and preference behavior remains in place. Design for
longer strings and formats from the beginning:

- allow nav labels, buttons, badges, headings, and helper text to wrap where
  safe; avoid fixed widths and unnecessary `nowrap`;
- keep dates/times with their timezone context and permit longer localized
  formats;
- use locale-aware number, distance, and speed formatting with tabular
  numerals where alignment matters;
- test a pseudo-long locale or expanded strings at all four target widths;
- do not use text embedded in images, and do not rely on English word length to
  size a control.

## Incremental implementation strategy

Implementation starts only after this brief is accepted. Every slice starts
from `main`, changes presentation code only unless a separately approved
contract change is documented, has focused tests, leaves the working tree
clean, and is independently reviewable.

## Design-system implementation policy

The generic UI layer is now **shadcn/ui** under `apps/web/src/components/ui`.
New shadcn components use **Base UI** primitives, the official **Mira** style,
and its semantic Tailwind 4 token model. The application is light-first and
does not expose a dark-mode feature.

For any generic interface need, first use an official shadcn component; next
compose from available shadcn components; create a custom generic component
only where neither is suitable. Install official components only when they are
needed by the active slice. Product and fleet-specific components remain
source-owned outside that generic layer.

Existing CSS tokens and the legacy Radix dialog remain temporary compatibility
surfaces for screens that have not yet migrated. They are migration targets,
not a second generic design-system authority. New UI must use the shadcn
semantic tokens and Base UI-backed components.

| Slice | Scope | Safety and acceptance gate |
| --- | --- | --- |
| 1 — Shell foundation | **Done.** Design tokens, AppShell, persistent sidebar, topbar, responsive drawer/rail, PageHeader, and selected shadcn primitives. | Existing auth/permission routes still land correctly; keyboard navigation, locale, logout, focus, loading/error states, and current smoke tests remain green. |
| 2 — Fleet overview | Compact fleet header, filter/sort bar, summary strip, dense table, mobile fleet rows, selection contract. | Existing dashboard queries/history, scheduler status, freshness labels, disabled inclusion, and current data fields remain unchanged; add focused desktop/mobile component tests. |
| 3 — Map workspace | List/map split, shared selection, selected vehicle context panel, map controls/legend, tablet/mobile sheet. | MapLibre worker/style, geofence, alert overlays, refresh fallback, marker semantics, and map permissions remain intact; verify list-to-marker and marker-to-list paths. |
| 4 — Vehicle detail | Above-fold current state, context actions, local navigation, summary/events hierarchy, responsive stack. | Existing detail data, deep links, stale/no-position semantics, and permission handling remain unchanged. |
| 5 — Alerts and history | Events triage table/list, status families, exact/overview track presentation, gap and range context. | Preserve OPEN/RESOLVED and SPEEDING/INACTIVITY domain behavior, exact/overview limits, filters, and track API calls. |
| 6 — Reports and analytics | Report toolbar/KPI strip, dense numeric table, mobile report fallback, trips/stops hierarchy. | Preserve date/timezone, policy-driven analytics, no-data meaning, numeric values, and report contracts. |
| 7 — Administration and account | Business settings grouping, GPS history progressive disclosure, user management hierarchy, Account and Telegram notification form. | Preserve revision conflicts, permissions, dangerous-action confirmations, Telegram linking/preferences/delivery, and remove only stale presentation copy. |
| 8 — Responsive/accessibility consolidation | Cross-screen 1440/1280/768/390 tuning, keyboard/focus/contrast audit, long-string and reduced-motion pass. | Run the acceptance matrix across representative authenticated states; fix layout/accessibility defects without changing business semantics. |
| 9 — Authenticated acceptance and release handoff | Local authenticated acceptance, focused Web tests/typecheck/lint/build as appropriate, review, production preflight and deployment as a separately authorized stage. | No deployment is part of this brief. Release only after the repository is clean, behavior is accepted, and production actions are explicitly authorized. |

## Screen acceptance matrix

The matrix is a target acceptance checklist for the implementation stages. The
phrasing is intentionally about the key concern at each width, not a promise
that every screen has identical geometry.

| Screen | Desktop 1440 | Laptop 1280 | Tablet 768 | Mobile 390 |
| --- | --- | --- | --- | --- |
| Login | Centered, readable auth card; locale utility and focus order are clear. | Card stays bounded without wasting the viewport. | Form remains comfortably readable with no clipped errors. | Full-width fields, 44px targets, password/error text stays visible. |
| Fleet | Table and first attention signals above fold; sidebar/context stable. | Full table remains scannable with reduced gutters; no header crowding. | Drawer/rail plus compact rows or controlled table fallback; filters remain usable. | Menu drawer, filter sheet, stacked rows with identity/status/freshness/action. |
| Map | List/map split; selected vehicle panel adjacent; map controls unobstructed. | Split remains useful without squeezing the list into unreadable rows. | Explicit stacked/split choice; selection survives list/map transition. | Map reachable early; bottom sheet exposes list and selected context. |
| Vehicle detail | Identity, freshness, speed, last position, and primary actions above fold. | Two-column state remains balanced and compact. | Single readable column with actions still near identity. | Stacked state/summary/events; active vehicle context never disappears. |
| Alerts | Triage table with type, vehicle, time, state, context, action. | Filters and table fit without losing the primary identity column. | Compact rows/table with filters stacked or grouped. | Triage rows and filter sheet; no severity invented or color-only state. |
| History | Exact/overview mode, range, gap explanation, summary, map/timeline. | Controls and summary stay together; map remains usable. | Custom range fields stack; data mode and gaps remain explicit. | Presets first, readable range/status, map/timeline secondary and scroll-safe. |
| Reports | Dense numeric report, consistent date context, no decorative noise. | Table remains wide but identity and numeric alignment stay clear. | Controlled horizontal detail region or compact row fallback. | Primary metrics first; dense columns drill down or scroll deliberately. |
| Admin Users | Identity/role/status/Telegram/actions distinct; danger is restrained. | Actions remain available without table crowding. | Permission detail and action menu remain reachable in stacked rows. | Identity/status first, actions in menu, confirmations fully usable. |
| Business Settings | Five ownership groups, bounded form, clear save/conflict state. | Inputs do not span an unnecessarily wide canvas. | Single-column grouped form with readable helper text. | One-column controls, label/control association, reachable save/errors. |
| Account Notifications | Connection, master/types/scope/vehicles/save are one clear flow. | Status and save feedback remain visible beside the form. | Form groups stack without control/label separation. | Connection action first; scope and selected vehicles progressive and touch-safe. |

## Validation and non-goals for this stage

For this documentation-only stage, validation is limited to repository state,
Markdown/link consistency, and diff hygiene. Full API/Web suites are not
required because runtime source is not being changed. The implementation stage
must add focused tests per slice and perform the authenticated acceptance
matrix above.

This stage does not:

- implement the sidebar, visual tokens, map split, or any screen redesign;
- change business logic, API contracts, database schema, migrations,
  authentication, authorization, provider/history behavior, alerts, reports,
  settings, users, audit, Telegram delivery, or localization behavior;
- access production, deploy, restart services, call Telegram/provider/history,
  or perform backfills.
