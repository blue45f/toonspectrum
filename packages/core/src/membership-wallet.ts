export const MEMBERSHIP_PLAN_IDS = ["free", "creator", "pro", "team"] as const;
export type MembershipPlanId = (typeof MEMBERSHIP_PLAN_IDS)[number];

export const WALLET_ASSETS = ["studio_credit", "reward_point"] as const;
export type WalletAsset = (typeof WALLET_ASSETS)[number];
export const PUBLIC_WALLET_ASSET = "reward_point" as const;

export const MEMBERSHIP_ECONOMY_POLICY = Object.freeze({
  mode: "dual-wallet-beta" as const,
  paymentsEnabled: false,
  studioCreditsEnabled: true,
  membershipCreditsEnabled: true,
  creditPurchasesEnabled: false,
  publicAsset: PUBLIC_WALLET_ASSET,
  pointExpiryDays: 365,
  purchasedCreditExpiryDays: null,
  fairUseLimitsApplyDuringBeta: true,
});

export const MEMBER_CREATOR_LEVELS = [
  "new",
  "verified",
  "active",
  "trusted",
  "professional",
  "partner",
] as const;
export type MemberCreatorLevel = (typeof MEMBER_CREATOR_LEVELS)[number];

export interface CreatorLevelMetrics {
  readonly verifiedCreator: boolean;
  readonly publishedWorks: number;
  readonly activityPoints: number;
}

export const CREATOR_LEVEL_AUTO_POLICIES = Object.freeze({
  new: { verifiedCreator: false, publishedWorks: 0, activityPoints: 0 },
  verified: { verifiedCreator: true, publishedWorks: 0, activityPoints: 0 },
  active: { verifiedCreator: true, publishedWorks: 1, activityPoints: 300 },
  trusted: { verifiedCreator: true, publishedWorks: 5, activityPoints: 1_500 },
  professional: { verifiedCreator: true, publishedWorks: 20, activityPoints: 5_000 },
} as const);

export function automaticCreatorLevel(
  metrics: CreatorLevelMetrics,
): Exclude<MemberCreatorLevel, "partner"> {
  if (!metrics.verifiedCreator) return "new";
  if (
    metrics.publishedWorks >= CREATOR_LEVEL_AUTO_POLICIES.professional.publishedWorks
    && metrics.activityPoints >= CREATOR_LEVEL_AUTO_POLICIES.professional.activityPoints
  ) return "professional";
  if (
    metrics.publishedWorks >= CREATOR_LEVEL_AUTO_POLICIES.trusted.publishedWorks
    && metrics.activityPoints >= CREATOR_LEVEL_AUTO_POLICIES.trusted.activityPoints
  ) return "trusted";
  if (
    metrics.publishedWorks >= CREATOR_LEVEL_AUTO_POLICIES.active.publishedWorks
    && metrics.activityPoints >= CREATOR_LEVEL_AUTO_POLICIES.active.activityPoints
  ) return "active";
  return "verified";
}

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
  "storage.warningRatio",
  "upload.file.maxBytes",
  "upload.daily.maxBytes",
  "upload.concurrent",
  "canvas.maxHeightPx",
  "render.concurrent",
  "retention.versionsDays",
  "retention.trashDays",
  "collaboration.members",
  "collaboration.viewers",
  "collaboration.videoPeers",
  "collaboration.canvasPeers",
  "ai.monthlyTokens",
  "credit.monthlyIncluded",
  "credit.dailyLimit",
  "market.sell",
  "market.bulkUpload",
  "export.highResolution",
  "feature.webgpuExport",
  "feature.cmykSoftProof",
  "feature.customPlugins",
] as const;
export type MembershipEntitlementKey =
  (typeof MEMBERSHIP_ENTITLEMENT_KEYS)[number];
export type MembershipEntitlementValue = number | boolean;

export interface MembershipPlanPolicy {
  readonly id: MembershipPlanId;
  readonly label: string;
  readonly description: string;
  readonly entitlements: Readonly<
    Record<MembershipEntitlementKey, MembershipEntitlementValue>
  >;
}

const MB = 1_000_000;
const GB = 1_000 * MB;

export const MEMBERSHIP_PLAN_POLICIES = Object.freeze({
  free: {
    id: "free",
    label: "Free",
    description: "기본 창작·커뮤니티 기능과 개인 작업을 위한 시작 등급",
    entitlements: {
      "storage.bytes": 10 * GB,
      "storage.warningRatio": 0.8,
      "upload.file.maxBytes": 250 * MB,
      "upload.daily.maxBytes": 2 * GB,
      "upload.concurrent": 3,
      "canvas.maxHeightPx": 10_000,
      "render.concurrent": 1,
      "retention.versionsDays": 30,
      "retention.trashDays": 30,
      "collaboration.members": 3,
      "collaboration.viewers": 20,
      "collaboration.videoPeers": 4,
      "collaboration.canvasPeers": 10,
      "ai.monthlyTokens": 100,
      "credit.monthlyIncluded": 500,
      "credit.dailyLimit": 150,
      "market.sell": false,
      "market.bulkUpload": false,
      "export.highResolution": false,
      "feature.webgpuExport": false,
      "feature.cmykSoftProof": false,
      "feature.customPlugins": false,
    },
  },
  creator: {
    id: "creator",
    label: "Creator",
    description: "꾸준히 작품을 제작·공개하는 개인 창작자를 위한 운영 등급",
    entitlements: {
      "storage.bytes": 100 * GB,
      "storage.warningRatio": 0.8,
      "upload.file.maxBytes": 1 * GB,
      "upload.daily.maxBytes": 10 * GB,
      "upload.concurrent": 5,
      "canvas.maxHeightPx": 50_000,
      "render.concurrent": 2,
      "retention.versionsDays": 90,
      "retention.trashDays": 30,
      "collaboration.members": 8,
      "collaboration.viewers": 100,
      "collaboration.videoPeers": 6,
      "collaboration.canvasPeers": 25,
      "ai.monthlyTokens": 2_000,
      "credit.monthlyIncluded": 2_000,
      "credit.dailyLimit": 500,
      "market.sell": true,
      "market.bulkUpload": false,
      "export.highResolution": true,
      "feature.webgpuExport": true,
      "feature.cmykSoftProof": true,
      "feature.customPlugins": true,
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    description: "고용량 제작·배포와 고급 협업을 위한 전문 창작자 등급",
    entitlements: {
      "storage.bytes": 500 * GB,
      "storage.warningRatio": 0.8,
      "upload.file.maxBytes": 2 * GB,
      "upload.daily.maxBytes": 30 * GB,
      "upload.concurrent": 10,
      "canvas.maxHeightPx": 200_000,
      "render.concurrent": 4,
      "retention.versionsDays": 365,
      "retention.trashDays": 30,
      "collaboration.members": 20,
      "collaboration.viewers": 500,
      "collaboration.videoPeers": 10,
      "collaboration.canvasPeers": 50,
      "ai.monthlyTokens": 10_000,
      "credit.monthlyIncluded": 5_000,
      "credit.dailyLimit": 1_500,
      "market.sell": true,
      "market.bulkUpload": true,
      "export.highResolution": true,
      "feature.webgpuExport": true,
      "feature.cmykSoftProof": true,
      "feature.customPlugins": true,
    },
  },
  team: {
    id: "team",
    label: "Team",
    description: "스튜디오·팀 단위 장기 제작과 다인 협업을 위한 최상위 운영 등급",
    entitlements: {
      "storage.bytes": 1_000 * GB,
      "storage.warningRatio": 0.8,
      "upload.file.maxBytes": 5 * GB,
      "upload.daily.maxBytes": 100 * GB,
      "upload.concurrent": 20,
      "canvas.maxHeightPx": 1_000_000,
      "render.concurrent": 8,
      "retention.versionsDays": 730,
      "retention.trashDays": 60,
      "collaboration.members": 100,
      "collaboration.viewers": 2_000,
      "collaboration.videoPeers": 12,
      "collaboration.canvasPeers": 100,
      "ai.monthlyTokens": 50_000,
      "credit.monthlyIncluded": 20_000,
      "credit.dailyLimit": 5_000,
      "market.sell": true,
      "market.bulkUpload": true,
      "export.highResolution": true,
      "feature.webgpuExport": true,
      "feature.cmykSoftProof": true,
      "feature.customPlugins": true,
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

export const ACTIVITY_POINT_KEYS = [
  "creator.work.created",
  "creator.work.published",
  "community.post.created",
  "community.comment.created",
  "fortune.used",
  "playground.used",
] as const;
export type ActivityPointKey = (typeof ACTIVITY_POINT_KEYS)[number];

export interface ActivityPointPolicy {
  readonly key: ActivityPointKey;
  readonly label: string;
  readonly points: number;
  readonly dailyGrantLimit: number;
  readonly cooldownSeconds: number;
  readonly claimMode: "server" | "client";
}

function activity(
  key: ActivityPointKey,
  label: string,
  points: number,
  dailyGrantLimit: number,
  cooldownSeconds: number,
  claimMode: "server" | "client",
): ActivityPointPolicy {
  return { key, label, points, dailyGrantLimit, cooldownSeconds, claimMode };
}

export const ACTIVITY_POINT_POLICIES = Object.freeze({
  "creator.work.created": activity(
    "creator.work.created", "새 작품 만들기", 20, 3, 60, "server",
  ),
  "creator.work.published": activity(
    "creator.work.published", "작품 공개", 100, 2, 300, "server",
  ),
  "community.post.created": activity(
    "community.post.created", "커뮤니티 글 작성", 15, 5, 60, "server",
  ),
  "community.comment.created": activity(
    "community.comment.created", "댓글 작성", 3, 10, 20, "server",
  ),
  "fortune.used": activity(
    "fortune.used", "운세 이용", 2, 3, 60, "server",
  ),
  "playground.used": activity(
    "playground.used", "놀이터 이용", 3, 5, 120, "client",
  ),
} satisfies Record<ActivityPointKey, ActivityPointPolicy>);

export function isActivityPointKey(value: unknown): value is ActivityPointKey {
  return typeof value === "string"
    && (ACTIVITY_POINT_KEYS as readonly string[]).includes(value);
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

/**
 * Studio Credit cost catalog for operator-funded features. Current BYOK,
 * personal-runtime and browser-local work must not consume this wallet.
 * Purchases stay disabled while creditPurchasesEnabled is false.
 */
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

export function estimateCreditCost(
  feature: CreditFeatureKey,
  units = 1,
): number {
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
  "profile-complete": { points: 100, label: "크리에이터 프로필 완성" },
  "first-public-work": { points: 300, label: "첫 작품 공개" },
  "beta-feedback-accepted": { points: 150, label: "채택된 베타 피드백" },
  "bug-report-accepted": { points: 100, label: "채택된 버그 제보" },
});
export type RewardMilestoneKey = keyof typeof REWARD_MILESTONES;

export function membershipPolicy(
  planId: MembershipPlanId,
): MembershipPlanPolicy {
  return MEMBERSHIP_PLAN_POLICIES[planId];
}
