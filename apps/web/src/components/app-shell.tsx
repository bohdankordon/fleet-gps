import type { ReactNode } from "react";

export function AppShell({ children, navigation, skipLabel }: Readonly<{ children: ReactNode; navigation: ReactNode; skipLabel: string }>) {
  return <div className="app-shell">
    <a className="app-shell__skip-link" href="#app-main">{skipLabel}</a>
    {navigation}
    <main id="app-main" className="app-shell__main" tabIndex={-1}><div className="app-shell__content">{children}</div></main>
  </div>;
}
