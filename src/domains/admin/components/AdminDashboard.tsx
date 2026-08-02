import { Users, MessagesSquare, Coins } from "lucide-react";
import { useEffect, useState } from "react";

import { adminFetch, formatNum, formatWon, type AdminApiError } from "./admin-client";
import { AdminNotice, AdminSpinner, Stat, StatGroup } from "./admin-ui";

import { useT } from "@/lib/i18n";

interface Dashboard {
  updatedAt: string;
  users: { total: number; activeLast7d: number; activeLast30d: number; admins: number; creators: number };
  community: { fanPosts: number; fanReplies: number; reviewReplies: number; reviews: number; userActivity: number };
  monetization: {
    planCount: number;
    activePlanCount: number;
    campaignCount: number;
    revenuePendingCents: number;
    revenuePaidCents: number;
    pendingEvents: number;
    periodDays: number;
  };
}
export function AdminDashboard({ uid }: { uid: string }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    let alive = true;
    setError(null);
    setData(null);
    adminFetch<Dashboard>("/dashboard?days=30", uid)
      .then((d) => alive && setData(d))
      .catch((e: AdminApiError) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [uid]);

  if (error) return <AdminNotice title={t("admin.dashboard.loadError")} body={error} />;
  if (!data) return <AdminSpinner />;

  const periodText = t("admin.dashboard.period")
    .replace("{days}", String(data.monetization.periodDays))
    .replace("{date}", new Date(data.updatedAt).toLocaleString());

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-fg-3">
        {periodText}
      </p>
      <StatGroup icon={<Users size={15} />} label={t("admin.dashboard.groupUsers")}>
        <Stat label={t("admin.dashboard.userTotal")} value={formatNum(data.users.total)} />
        <Stat label={t("admin.dashboard.userActive7d")} value={formatNum(data.users.activeLast7d)} />
        <Stat label={t("admin.dashboard.userActive30d")} value={formatNum(data.users.activeLast30d)} />
        <Stat label={t("admin.dashboard.userAdmins")} value={formatNum(data.users.admins)} />
        <Stat label={t("admin.dashboard.userCreators")} value={formatNum(data.users.creators)} />
      </StatGroup>
      <StatGroup icon={<MessagesSquare size={15} />} label={t("admin.dashboard.groupCommunity")}>
        <Stat label={t("admin.dashboard.communityPosts")} value={formatNum(data.community.fanPosts)} />
        <Stat label={t("admin.dashboard.communityReplies")} value={formatNum(data.community.fanReplies)} />
        <Stat label={t("admin.dashboard.communityReviews")} value={formatNum(data.community.reviews)} />
        <Stat label={t("admin.dashboard.communityReviewReplies")} value={formatNum(data.community.reviewReplies)} />
        <Stat label={t("admin.dashboard.communityActiveUsers")} value={formatNum(data.community.userActivity)} />
      </StatGroup>
      <StatGroup icon={<Coins size={15} />} label={t("admin.dashboard.groupMonetization")}>
        <Stat
          label={t("admin.dashboard.planRatio")}
          value={`${formatNum(data.monetization.activePlanCount)}/${formatNum(data.monetization.planCount)}`}
        />
        <Stat label={t("admin.dashboard.campaigns")} value={formatNum(data.monetization.campaignCount)} />
        <Stat label={t("admin.dashboard.pendingSettlements")} value={formatNum(data.monetization.pendingEvents)} />
        <Stat label={t("admin.dashboard.paidAmount")} value={formatWon(data.monetization.revenuePaidCents)} />
        <Stat label={t("admin.dashboard.pendingAmount")} value={formatWon(data.monetization.revenuePendingCents)} />
      </StatGroup>
    </div>
  );
}
