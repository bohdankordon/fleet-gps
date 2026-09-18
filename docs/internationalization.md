# Application internationalization

The supported product locales are exactly `ru`, `uk`, and `en`. Locale resolution is request-scoped and deterministic: a valid explicit `taxi_locale` preference wins; otherwise only the primary `Accept-Language` range is considered; unsupported, missing, empty, wildcard, or malformed primary ranges fall back to Ukrainian. Later language ranges are deliberately ignored, so `pl-PL,en-US;q=0.9` resolves to `uk`.

Locale is a display preference and never a routing dimension. Existing paths remain unchanged, with no `/ru`, `/uk`, or `/en` route trees. Only an explicit manual choice is stored in the HttpOnly `taxi_locale` cookie. Automatic resolution does not create or rewrite a cookie; an invalid cookie is treated as absent and falls through to browser-language resolution and the Ukrainian fallback.

## Preference flow

The reusable language selector is mounted by the root layout, so it is available before authentication, on must-change-password screens, and throughout the authenticated application. Its explicit choices use the native names `Русский`, `Українська`, and `English`; it also offers a localized “Automatic (browser language)” choice. Automatic remains selected when the resolved locale came from the request rather than an explicit cookie, even when that resolved locale is Ukrainian.

An explicit selection sends one strict same-origin `POST /api/preferences/locale` request with `{ "locale": "ru" | "uk" | "en" }`. Selecting Automatic sends `DELETE` to the same route, which expires `taxi_locale` and lets the refreshed request resolve its primary browser language. The Next-only route does not contact Nest. It sets or expires `taxi_locale` with `Path=/`, `SameSite=Lax`, and `HttpOnly`; explicit values use `Max-Age=31536000`. `Secure` is enabled in production and omitted for local non-production HTTP. The route uses the established centralized same-origin write policy but intentionally requires no session, role, or permission. The client refreshes the current route after success and does not automatically retry failure.

Because this cookie is browser-level rather than session-level, the selection persists across navigation, reload, logout, and later login. Changing language creates no session, database row, `AuditEvent`, `AuthUser` update, or `ApplicationSettings` update.

## Translation architecture

The source-controlled layer lives in `apps/web/src/i18n`. `locales.ts` owns the canonical locale values, native language names, display locale mapping, cookie constants, primary-language parsing, explicit-preference precedence, and Ukrainian fallback. `messages.ts` is one semantic-key catalog whose values are typed triples for `ru`, `uk`, and `en`; this construction enforces identical key sets. Tests additionally verify key and interpolation-placeholder parity.

Messages are plain strings. Interpolation supports named text values such as `{count}` and is inserted through normal React text rendering. Translation code never renders message HTML and does not use `dangerouslySetInnerHTML`. Dictionaries are bundled locally: there is no runtime translation request, CMS, or external i18n service.

The server resolver reads the explicit cookie and request `Accept-Language` before rendering. The root layout uses the same resolution for `<html lang>`, Ant Design locale, the client `I18nProvider`, and server-rendered copy, avoiding client-only detection, locale flash, and hydration differences. The provider also carries whether the source was `explicit` or `automatic`, which keeps the selector state truthful. Server Components use the server translator; Client Components use the provider. The proxy’s service-unavailable HTML calls the same pure resolver.

## Formatting and canonical data

Human-readable presentation uses the source-controlled display mapping:

- `ru` → `ru-UA`
- `uk` → `uk-UA`
- `en` → `en-GB`

`Europe/Kyiv` remains the single business and display timezone authority for all three languages. Locale changes formatting only: absolute instants, GPS timestamps, history anchors, audit timestamps, report/date query boundaries, and existing Europe/Kyiv local-input conversion semantics do not change. Numeric presentation uses `Intl.NumberFormat`; genuine grammatical units use `Intl.PluralRules` with source-controlled RU/UK/EN forms.

Backend contracts remain language-neutral. Canonical roles (`ADMIN`, `USER`), permission codes, event/status enums, provider values, logs, database values, and `AuditEvent` contents are not translated or rewritten. The UI translates application-owned labels for those values while leaving user logins, vehicle names and identifiers, snapshots, IDs, and other domain data unchanged.

Known frontend error paths map stable status/error codes to local messages. Raw Nest/BFF `message` strings are neither parsed as control flow nor used as translation authority. Unknown server errors discard raw text and show a localized safe fallback.

## Persistence and feature-freeze boundary

There is no locale field in Prisma or authentication data, no migration, no new permission, and no new audit event. The migration count remains 11. No runtime translation dependency or external provider request is required.

Stage 20D is the last planned functional stage before v1.0 feature freeze. After Stage 20D acceptance, new product functionality belongs outside the v1.0 feature-frozen scope.
