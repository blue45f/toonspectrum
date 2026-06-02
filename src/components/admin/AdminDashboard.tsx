import { useEffect, useState } from "react";
import { Users, MessagesSquare, Coins } from "lucide-react";
import { adminFetch, formatNum, formatWon, type AdminApiError } from "./admin-client";
import { AdminNotice, AdminSpinner, Stat, StatGroup } from "./admin-ui";

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

  if (error) return <AdminNotice title="지표를 불러오지 못했어요" body={error} />;
  if (!data) return <AdminSpinner />;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-fg-3">
        최근 {data.monetization.periodDays}일 · {new Date(data.updatedAt).toLocaleString("ko-KR")} 기준
      </p>
      <StatGroup icon={<Users size={15} />} label="사용자">
        <Stat label="전체" value={formatNum(data.users.total)} />
        <Stat label="7일 활성" value={formatNum(data.users.activeLast7d)} />
        <Stat label="30일 활성" value={formatNum(data.users.activeLast30d)} />
        <Stat label="관리자" value={formatNum(data.users.admins)} />
        <Stat label="크리에이터" value={formatNum(data.users.creators)} />
      </StatGroup>
      <StatGroup icon={<MessagesSquare size={15} />} label="커뮤니티">
        <Stat label="펜카페 글" value={formatNum(data.community.fanPosts)} />
        <Stat label="펜카페 댓글" value={formatNum(data.community.fanReplies)} />
        <Stat label="리뷰" value={formatNum(data.community.reviews)} />
        <Stat label="리뷰 댓글" value={formatNum(data.community.reviewReplies)} />
        <Stat label="활동 사용자" value={formatNum(data.community.userActivity)} />
      </StatGroup>
      <StatGroup icon={<Coins size={15} />} label="수익">
        <Stat
          label="활성/전체 플랜"
          value={`${formatNum(data.monetization.activePlanCount)}/${formatNum(data.monetization.planCount)}`}
        />
        <Stat label="캠페인" value={formatNum(data.monetization.campaignCount)} />
        <Stat label="대기 정산건" value={formatNum(data.monetization.pendingEvents)} />
        <Stat label="정산 완료액" value={formatWon(data.monetization.revenuePaidCents)} />
        <Stat label="대기 금액" value={formatWon(data.monetization.revenuePendingCents)} />
      </StatGroup>
    </div>
  );
}
