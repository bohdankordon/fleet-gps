import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAuthUser } from "@/lib/auth/auth-user";
import { landingFor } from "@/lib/auth/auth-contract";
export const dynamic = "force-dynamic";
export default async function LoginPage() { const user = await getAuthUser(); if (user) redirect(landingFor(user)); return <main className="auth-page"><section className="auth-card"><h1>Вход</h1><LoginForm /></section></main>; }
