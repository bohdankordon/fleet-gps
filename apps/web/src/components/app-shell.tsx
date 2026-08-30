import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";
import { SidebarProvider } from "./ui/sidebar";

export function AppShell({ children, skipLabel }: Readonly<{ children: ReactNode; skipLabel: string }>) {
  return <SidebarProvider>
    <a className="app-shell__skip-link" href="#app-main">{skipLabel}</a>
    <AppSidebar />
    <div className="app-shell">
      <Topbar />
      <main id="app-main" className="app-shell__main" tabIndex={-1}><div className="app-shell__content">{children}</div></main>
    </div>
  </SidebarProvider>;
}
