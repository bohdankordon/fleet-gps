import Link from "next/link";

export function AppNavigation() {
  return <nav className="app-nav" aria-label="Основная навигация"><div><Link href="/">Автопарк</Link><Link href="/events">События</Link></div></nav>;
}
