"use client";

import { Skeleton } from "antd";
import { useI18n } from "@/i18n/client";

export default function AdminHistoryLoading() {
  const { t } = useI18n();
  return <div className="history-overview-loading" role="status" aria-busy="true" aria-label={t("common.loading")}>
    <Skeleton active title={{ width: 220 }} paragraph={{ rows: 1 }} />
    <div className="history-overview-loading__context"><Skeleton active paragraph={{ rows: 2 }} /></div>
    <div className="history-overview-loading__facts"><Skeleton active paragraph={{ rows: 5 }} /></div>
    <div className="history-overview-loading__workspace"><Skeleton active paragraph={{ rows: 8 }} /></div>
  </div>;
}
