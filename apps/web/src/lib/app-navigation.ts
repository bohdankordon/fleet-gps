export const APP_NAVIGATION = Object.freeze([{ href: "/", label: "Автопарк" }, { href: "/map", label: "Карта" }, { href: "/events", label: "События" }] as const);
export function isActiveAppNavigationPath(href: string, pathname: string): boolean { return href === pathname; }
