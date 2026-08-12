import { ChangePasswordForm } from "@/components/change-password-form";
import { LogoutButton } from "@/components/logout-button";
import { requireAuthUser } from "@/lib/auth/auth-user";
export const dynamic = "force-dynamic";
export default async function ChangePasswordPage() { const user = await requireAuthUser(); return <main className="auth-page"><section className="auth-card"><h1>Изменить пароль</h1>{user.mustChangePassword && <p>Для продолжения работы необходимо изменить пароль.</p>}<ChangePasswordForm /><div className="account-actions"><LogoutButton /></div></section></main>; }
