"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/auth/auth-contract";
import { useAuth } from "./auth-provider";
export function AdminSubnavigation() { const user = useAuth(); const path = usePathname(); if (!user) return null; return <nav className="admin-subnav" aria-label="Администрирование">{user.role === "ADMIN" && <Link href="/admin/users" aria-current={path.startsWith("/admin/users") ? "page" : undefined}>Пользователи</Link>}{hasPermission(user, "historyAdmin.view") && <Link href="/admin/history" aria-current={path === "/admin/history" ? "page" : undefined}>История GPS</Link>}</nav>; }
