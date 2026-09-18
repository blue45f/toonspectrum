export const MEMBERSHIP_PLAN_IDS = ["free", "creator", "pro", "team"] as const;
export type MembershipPlanId = (typeof MEMBERSHIP_PLAN_IDS)[number];

export const WALLET_ASSETS = ["studio_credit", "reward_point"] as const;
export type WalletAsset = (typeof WALLET_ASSETS)[number];

export const MEMBER_CREATOR_LEVELS = [
  "new",
  "verified",
  "active",
  "trusted",
  "professional",
  "partner",
] as const;
export type MemberCreatorLevel = (typeof MEMBER_CREATOR_LEVELS)[number];

export const MEMBER_TRUST_LEVELS = [
  "new",
  "verified",
  "trusted",
  "restricted",
] as const;
export type MemberTrustLevel = (typeof MEMBER_TRUST_LEVELS)[number];

export const MEMBER_SELLER_LEVELS = [
  "none",
  "starter",
  "verified",
  "professional",
] as const;
export type MemberSellerLevel = (typeof MEMBER_SELLER_LEVELS)[number];

export const MEMBERSHIP_ENTITLEMENT_KEYS = [
  "storage.bytes",
  "upload.file.maxBytes",
  "upload.concurrent",
  "render.concurrent",
  "retention.versionsDays",
  "retention.trashDays",
  "collaboration.members",
  "collaboration.viewers",
  "collaboration.videoPeers",
  "collaboration.canvasPeers",
  "market.sell",
  "market.bulkUpload",
  "export.highResolution",
] as const;
export type MembershipEntitlementKey =
  (typeof MEMBERSHIP_ENTITLEMENT_KEYS)[number];
export type MembershipEntitlementValue = number | boolean;

export interface MembershipPlanPolicy {
  readonly id: MembershipPlanId;
  readonly label: string;
  readonly monthlyCredits: number;
  readonly entitlements: Readonly<
    Record<MembershipEntitlementKey, MembershipEntitlementValue>
  >;
}

const GB = 1_000_000_000;
const TB = 1_000 * GB;

export const MEMBERSHIP_PLAN_POLICIES = Object.freeze({
  free: {
    id: "free",
    label: "Free",
    monthlyCredits: 500,
    entitlements: {
      "storage.bytes": 10 * GB,
      "upload.file.maxBytes": 1 * GB,
      "upload.concurrent": 3,
      "render.concurrent": 2,
      "retention.versionsDays": 30,
      "retention.trashDays": 30,
      "collaboration.members": 5,
      "collaboration.viewers": 50,
      "collaboration.videoPeers": 6,
      "collaboration.canvasPeers": 20,
      "market.sell": false,
      "market.bulkUpload": false,
      "export.highResolution": false,
    },
  },

  creator: {
    id: "creator",
    label: "Creator",
    monthlyCredits: 2_000,
    entitlements: {
      "storage.bytes": 100 * GB,
      "upload.file.maxBytes": 2 * GB,
      "upload.concurrent": 8,
      "render.concurrent": 4,
      "retention.versionsDays": 90,
      "retention.trashDays": 30,
      "collaboration.members": 10,
      "collaboration.viewers": 200,
      "collaboration.videoPeers": 8,
      "collaboration.canvasPeers": 40,
      "market.sell": true,
      "market.bulkUpload": false,
      "export.highResolution": true,
    },
  },

  pro: {
    id: "pro",
    label: "Pro",
    monthlyCredits: 5_000,
    entitlements: {
      "storage.bytes": 500 * GB,
      "upload.file.maxBytes": 5 * GB,
      "upload.concurrent": 16,
      "render.concurrent": 8,
      "retention.versionsDays": 365,
      "retention.trashDays": 30,
      "collaboration.members": 20,
      "collaboration.viewers": 500,
      "collaboration.videoPeers": 10,
      "collaboration.canvasPeers": 50,
      "market.sell": true,
      "market.bulkUpload": true,
      "export.highResolution": true,
    },
  },

  team: {
    id: "team",
    label: "Team",
    monthlyCredits: 12_000,
    entitlements: {
      "storage.bytes": TB,
      "upload.file.maxBytes": 10 * GB,
      "upload.concurrent": 24,
      "render.concurrent": 12,
      "retention.versionsDays": 730,
      "retention.trashDays": 30,
      "collaboration.members": 100,
      "collaboration.viewers": 2_000,
      "collaboration.videoPeers": 12,
      "collaboration.canvasPeers": 100,
      "market.sell": true,
      "market.bulkUpload": true,
      "export.highResolution": true,
    },
  },
} satisfies Record<MembershipPlanId, MembershipPlanPolicy>);

export const MEMBERSHIP_PLAN_RANK: Readonly<Record<MembershipPlanId, number>> =
  Object.freeze({ free: 0, creator: 1, pro: 2, team: 3 });

export function isMembershipPlanId(value: unknown): value is MembershipPlanId {
  return typeof value === "string"
    && (MEMBERSHIP_PLAN_IDS as readonly string[]).includes(value);
}

export function highestMembershipPlan(
  plans: readonly MembershipPlanId[],
): MembershipPlanId {
  return plans.reduce<MembershipPlanId>(
    (best, current) =>
      MEMBERSHIP_PLAN_RANK[current] > MEMBERSHIP_PLAN_RANK[best]
        ? current
        : best,
    "free",
  );
}

export const CREDIT_FEATURE_KEYS = [
  "ai.text.generate",
  "ai.translation",
  "ai.image.analyze",
  "ai.image.removeBackground",
  "ai.image.upscale",
  "ai.image.generate",
  "ai.storyboard.generate",
  "ai.voice.generate",
  "ai.video.generate",
  "render.server",
] as const;
export type CreditFeatureKey = (typeof CREDIT_FEATURE_KEYS)[number];

export interface CreditCostPolicy {
  readonly key: CreditFeatureKey;
  readonly label: string;
  readonly baseCredits: number;
  readonly minimumCredits: number;
  readonly maximumCredits: number;
}

function credit(
  key: CreditFeatureKey,
  label: string,
  baseCredits: number,
  minimumCredits: number,
  maximumCredits: number,
): CreditCostPolicy {
  return { key, label, baseCredits, minimumCredits, maximumCredits };
}

export const CREDIT_COST_POLICIES = Object.freeze({
  "ai.text.generate": credit("ai.text.generate", "AI text generation", 1, 1, 20),
  "ai.translation": credit("ai.translation", "AI translation", 2, 2, 40),
  "ai.image.analyze": credit("ai.image.analyze", "Image analysis", 2, 2, 20),
  "ai.image.removeBackground": credit(
    "ai.image.removeBackground", "Background removal", 2, 2, 10,
  ),
  "ai.image.upscale": credit("ai.image.upscale", "Image upscale", 4, 4, 40),

  "ai.image.generate": credit("ai.image.generate", "Image generation", 8, 5, 80),
  "ai.storyboard.generate": credit(
    "ai.storyboard.generate", "Storyboard generation", 10, 5, 100,
  ),
  "ai.voice.generate": credit("ai.voice.generate", "Voice generation", 12, 4, 240),
  "ai.video.generate": credit("ai.video.generate", "Video generation", 80, 30, 500),
  "render.server": credit("render.server", "Server render", 5, 1, 200),
} satisfies Record<CreditFeatureKey, CreditCostPolicy>);

export function isCreditFeatureKey(value: unknown): value is CreditFeatureKey {
  return typeof value === "string"
    && (CREDIT_FEATURE_KEYS as readonly string[]).includes(value);
}

export function estimateCreditCost(feature: CreditFeatureKey, units = 1): number {
  const policy = CREDIT_COST_POLICIES[feature];
  const safeUnits = Number.isFinite(units) ? Math.max(0, units) : 1;
  return Math.min(

    policy.maximumCredits,
    Math.max(
      policy.minimumCredits,
      Math.ceil(policy.baseCredits * safeUnits),
    ),
  );
}

export const BETA_PROMOTIONS = Object.freeze({
  "beta-founder-6m": {
    planId: "pro" as const,
    durationMonths: 6,
    label: "Beta Founder",
  },
  "beta-public-creator-12m": {
    planId: "pro" as const,
    durationMonths: 12,
    label: "Beta Public Creator",
  },
});

export const REWARD_MILESTONES = Object.freeze({
  "profile-complete": { points: 300, label: "Complete creator profile" },
  "first-public-work": { points: 1_000, label: "Publish first work" },
  "beta-feedback-accepted": { points: 1_500, label: "Accepted beta feedback" },
  "bug-report-accepted": { points: 500, label: "Accepted bug report" },
});
export type RewardMilestoneKey = keyof typeof REWARD_MILESTONES;

export function membershipPolicy(
  planId: MembershipPlanId,
): MembershipPlanPolicy {
  return MEMBERSHIP_PLAN_POLICIES[planId];
}
