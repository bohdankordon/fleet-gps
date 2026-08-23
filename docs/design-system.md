# Taxi GPS design system

Taxi GPS uses a Fluent 2-inspired enterprise web UI: restrained, data-dense, desktop-first, and predictable. WCAG 2.2 AA is the accessibility target; this foundation supports that target but is not a certification claim.

Shared decisions live in semantic tokens in `apps/web/src/styles/tokens.css`. Use the locally owned primitives in `apps/web/src/components/ui` for standard controls, feedback, fields, and cards. Keep native HTML semantics first: `Button` is a button, `LinkButton` is an anchor, and `NativeSelect` remains a native select.

The approved scale is spacing 4/8/12/16/20/24/32/40/48px; radii 4/6/8/12px and full; controls 32/40/44px; and table rows 40/48px. Typography roles are caption 12px, label 14px, body 16px, section title 20px, page title 24px, and display 32px. Apply `ui-tabular-nums` to operational numeric data.

Do not recreate standard control styling in page-local CSS. Add capability to the owned primitive when it is shared; retain page CSS only for page layout and genuinely local presentation. Existing pages remain on transitional aliases until their explicit migration.

No full Fluent UI, shadcn, Material, or Carbon library is installed. Radix may be considered later only for complex overlays or dialogs. Dark theme is not implemented.
