"use client";

import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { AdminUsersLoadingWorkspace, AdminUsersPageHeader } from "@/components/admin-users-workspace";

export default function AdminUsersLoading() {
  return <div className="admin-users-page-v2"><AdminUsersPageHeader loading /><AdminNavigationTabs /><AdminUsersLoadingWorkspace /></div>;
}
