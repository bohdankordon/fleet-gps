import type { ReactNode } from "react";
import { Layout } from "antd";

export function AppShell({ children, navigation, skipLabel }: Readonly<{ children: ReactNode; navigation: ReactNode; skipLabel: string }>) {
  return <Layout className="taxi-shell">
    <a className="taxi-shell__skip-link" href="#app-main">{skipLabel}</a>
    {navigation}
    <main id="app-main" className="taxi-shell__main" tabIndex={-1}><div className="taxi-shell__content">{children}</div></main>
  </Layout>;
}
