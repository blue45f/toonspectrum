import { api } from "@/platform/api";

export type MembershipOperationsOverview = {
  membership: {
    planId: "free" | "creator" | "pro" | "team";
    endsAt: string | null;
    daysUntilExpiry: number | null;
  };
  storage: {
    workAssetBytes: number;
    rasterAssetBytes: number;
    generatedObjectBytes: number;
    totalBytes: number;
    limitBytes: number;
    warningRatio: number;
    usageRatio: number;
    status: "normal" | "warning" | "grace" | "read_only";
    canUpload: boolean;
    overQuotaSince: string | null;
    graceEndsAt: string | null;
  };
  upload: {
    todayBytes: number;
    dailyLimitBytes: number;
    remainingTodayBytes: number;
    fileMaxBytes: number;
  };
  activityRewards: Record<string, {
    used: number;
    limit: number;
    remaining: number;
  }>;
  notices: Array<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    seenAt: string | null;
    createdAt: string;
  }>;
};

export function getMembershipOperationsOverview(): Promise<MembershipOperationsOverview> {
  return api.get("/membership/operations/overview");
}

export function markMembershipNoticeSeen(
  noticeId: string,
): Promise<{ updated: boolean }> {
  return api.patch(
    `/membership/operations/notices/${encodeURIComponent(noticeId)}/seen`,
  );
}
