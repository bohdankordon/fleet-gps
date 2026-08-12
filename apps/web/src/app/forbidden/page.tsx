import Link from "next/link";
import { requireAuthUser } from "@/lib/auth/auth-user";
export const dynamic = "force-dynamic";
export default async function ForbiddenPage() { await requireAuthUser(); return <main><section className="empty"><h1>Недостаточно прав</h1><p>У вас нет разрешения на доступ к этому разделу.</p><Link href="/account">Открыть аккаунт</Link></section></main>; }
