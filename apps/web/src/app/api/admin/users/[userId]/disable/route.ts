import { forwardAdminUsers } from "@/lib/admin-users/admin-users-bff";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ userId: string }> }>): Promise<Response> { const { userId } = await params; return forwardAdminUsers(request, `/api/admin/users/${encodeURIComponent(userId)}/disable`, []); }
