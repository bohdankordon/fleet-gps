"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavigationFor } from "@/lib/admin-navigation";
import { useAuth } from "./auth-provider";
export function AdminSubnavigation() { const user = useAuth(); const path = usePathname(); if (!user) return null; return <nav className="admin-subnav" aria-label="Администрирование">{adminNavigationFor(user).map((item) => <Link href={item.href} aria-current={path === item.href || item.href === "/admin/users" && path.startsWith("/admin/users") ? "page" : undefined} key={item.href}>{item.label}</Link>)}</nav>; }
