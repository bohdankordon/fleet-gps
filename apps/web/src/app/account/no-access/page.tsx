import Link from "next/link";
import { requireAuthUser } from "@/lib/auth/auth-user";
export const dynamic = "force-dynamic";
export default async function NoAccessPage() { await requireAuthUser(); return <main><section className="empty"><h1>Нет доступных разделов</h1><p>Обратитесь к администратору для назначения разрешений.</p><Link href="/account">Открыть аккаунт</Link></section></main>; }
