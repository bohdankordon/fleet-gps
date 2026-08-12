import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { requireAuthUser } from "@/lib/auth/auth-user";
export const dynamic = "force-dynamic";
export default async function AccountPage() { const user = await requireAuthUser(); return <main className="auth-page"><section className="auth-card"><h1>Аккаунт</h1><dl><div><dt>Логин</dt><dd>{user.login}</dd></div><div><dt>Роль</dt><dd>{user.role}</dd></div></dl><div className="account-actions"><Link href="/account/change-password">Изменить пароль</Link><LogoutButton /></div></section></main>; }
