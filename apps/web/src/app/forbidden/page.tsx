import { ForbiddenState } from "@/components/forbidden-state";
import { requireAuthUser } from "@/lib/auth/auth-user";
export const dynamic = "force-dynamic";
export default async function ForbiddenPage() {
  await requireAuthUser();
  return <ForbiddenState />;
}
