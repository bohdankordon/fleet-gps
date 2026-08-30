import { redirect } from "next/navigation";
import { AuditViewer } from "@/components/audit-viewer";
import { requireAuthUser } from "@/lib/auth/auth-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function AdminAuditPage() { const user = await requireAuthUser(); if (user.role !== "ADMIN") redirect("/forbidden"); return <div><AuditViewer /></div>; }
