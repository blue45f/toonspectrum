import { api } from "@/infrastructure/api";

export type EconomyPolicy = {
  mode: "dual-wallet-beta";
  paymentsEnabled: boolean;
  studioCreditsEnabled: boolean;
  membershipCreditsEnabled: boolean;
  creditPurchasesEnabled: boolean;
  publicAsset: "reward_point";
  pointExpiryDays: number | null;
  purchasedCreditExpiryDays: number | null;
  fairUseLimitsApplyDuringBeta: boolean;
};

export type MembershipEntitlementValue = number | boolean;

export type MembershipPlanView = {
  id: "free" | "creator" | "pro" | "team";
  label: string;
  description: string;
  entitlements: Record<string, MembershipEntitlementValue>;
};

export type ActivityRewardView = {
  key: string;
  label: string;
  points: number;
  dailyGrantLimit: number;
  cooldownSeconds: number;
  claimMode: "server" | "client";
};
export type MembershipCatalog = {
  economy: EconomyPolicy;
  plans: MembershipPlanView[];
  activityRewards: ActivityRewardView[];
  rewardMilestones: Record<string, { points: number; label: string }>;
  policyNotes: {
    paymentsEnabled: boolean;
    pointsAreCashEquivalent: boolean;
    fairUseLimitsApplyDuringBeta: boolean;
  };
};

export type WalletBalanceView = {
  available: number;
  reserved: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  bySource: Record<string, number>;
};

export type MembershipGrantView = {
  id: string;
  planId: string;
  source: string;
  grantKey: string;
  sourceRef?: string | null;
  startsAt: string;
  endsAt?: string | null;
  autoRenew: boolean;
};
export type MembershipOverview = {
  membership: {
    planId: "free" | "creator" | "pro" | "team";
    plan: MembershipPlanView;
    grants: MembershipGrantView[];
  };
  economy: EconomyPolicy;
  wallet: {
    points: WalletBalanceView;
    studioCredits: WalletBalanceView;
  };
  creditCycle: {
    monthlyIncluded: number;
    dailyLimit: number;
    spentToday: number;
    remainingToday: number;
    monthlyResetsAt: string;
    dailyResetsAt: string;
  };
  levels: {
    creatorLevel: string;
    trustLevel: string;
    sellerLevel: string;
    trustScore: number;
    updatedAt?: string;
  };
  recentLedger: Array<{
    id: string;
    entryType: string;
    amount: number;
    deltaAvailable: number;
    deltaReserved: number;
    reason: string;
    referenceKey?: string | null;
    createdAt: string;
  }>;
};

export function getMembershipCatalog(): Promise<MembershipCatalog> {
  return api.get<MembershipCatalog>("/membership/catalog");
}
export function getMembershipOverview(): Promise<MembershipOverview> {
  return api.get<MembershipOverview>("/membership/overview");
}

export function getMembershipEntitlements(): Promise<{
  planId: MembershipOverview["membership"]["planId"];
  entitlements: Record<string, MembershipEntitlementValue>;
}> {
  return api.get("/membership/entitlements");
}

export function claimMembershipActivity(
  activity: string,
  sourceRef: string,
  metadata: Record<string, unknown> = {},
): Promise<{
  granted: boolean;
  points: number;
  capped?: boolean;
  cooldown?: boolean;
  idempotent?: boolean;
  remainingDailyGrants?: number;
}> {
  return api.post("/membership/activity/claim", {
    activity,
    sourceRef,
    metadata,
  });
}
