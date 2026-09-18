/**
 * Studio quota compatibility layer.
 *
 * Membership limits are authored only in packages/core/src/membership-wallet.ts.
 * This module keeps the existing Studio API while deriving every value from that
 * single policy source so public guidance and runtime checks cannot drift apart.
 */
import {
  MEMBERSHIP_PLAN_POLICIES,
  type MembershipPlanId,
} from "../../../../../packages/core/src/membership-wallet";

export const STUDIO_SUBSCRIPTION_QUOTA_VERSION = 2 as const;
export const SUBSCRIPTION_TIERS = ["free", "creator", "pro", "team"] as const;
export type SubscriptionTier = MembershipPlanId;

export interface TierEntitlements {
  readonly tier: SubscriptionTier;
  readonly maxCanvasHeightPx: number;
  readonly maxStorageMb: number;
  readonly maxCollabSeats: number;
  readonly allowWebGpuExport: boolean;
  readonly allowCmykSoftProof: boolean;
  readonly monthlyAiTokens: number;
  readonly allowCustomPlugins: boolean;
}

const bytesToMb = (bytes: number) => Math.floor(bytes / 1_000_000);

function fromMembershipPolicy(tier: SubscriptionTier): TierEntitlements {
  const policy = MEMBERSHIP_PLAN_POLICIES[tier];
  return {
    tier,
    maxCanvasHeightPx: Number(policy.entitlements["canvas.maxHeightPx"]),
    maxStorageMb: bytesToMb(Number(policy.entitlements["storage.bytes"])),
    maxCollabSeats: Number(policy.entitlements["collaboration.members"]),
    allowWebGpuExport: Boolean(policy.entitlements["feature.webgpuExport"]),
    allowCmykSoftProof: Boolean(policy.entitlements["feature.cmykSoftProof"]),
    monthlyAiTokens: Number(policy.entitlements["ai.monthlyTokens"]),
    allowCustomPlugins: Boolean(policy.entitlements["feature.customPlugins"]),
  };
}

export const TIER_ENTITLEMENT_DEFINITIONS: Record<
  SubscriptionTier,
  TierEntitlements
> = {
  free: fromMembershipPolicy("free"),
  creator: fromMembershipPolicy("creator"),
  pro: fromMembershipPolicy("pro"),
  team: fromMembershipPolicy("team"),
};

export interface SubscriptionUsageState {
  readonly userIdOrOrgId: string;
  readonly tier: SubscriptionTier;
  readonly currentStorageMbUsed: number;
  readonly currentAiTokensUsed: number;
  readonly currentCollabSeatsActive: number;
}

export interface EntitlementCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly isWarningThreshold: boolean;
  readonly usageRatio: number;
}

export function getTierEntitlements(tier: SubscriptionTier): TierEntitlements {
  return TIER_ENTITLEMENT_DEFINITIONS[tier]
    ?? TIER_ENTITLEMENT_DEFINITIONS.free;
}

export function checkActionEntitlement(
  state: SubscriptionUsageState,
  action:
    | { type: "consume-storage"; requestedMb: number }
    | { type: "consume-ai-tokens"; tokenCount: number }
    | { type: "create-canvas"; heightPx: number }
    | {
      type: "use-feature";
      feature: "webgpu-export" | "cmyk-softproof" | "custom-plugins";
    },
): EntitlementCheckResult {
  const spec = getTierEntitlements(state.tier);
  const warningRatio = Number(
    MEMBERSHIP_PLAN_POLICIES[state.tier].entitlements["storage.warningRatio"],
  );

  if (action.type === "consume-storage") {
    const nextTotal = state.currentStorageMbUsed + action.requestedMb;
    const ratio = nextTotal / spec.maxStorageMb;
    if (nextTotal > spec.maxStorageMb) {
      return {
        allowed: false,
        reason: `클라우드 저장공간 한도(${spec.maxStorageMb}MB)를 초과합니다 (현재 ${nextTotal.toFixed(1)}MB).`,
        isWarningThreshold: true,
        usageRatio: ratio,
      };
    }
    return {
      allowed: true,
      isWarningThreshold: ratio >= warningRatio,
      usageRatio: ratio,
    };
  }

  if (action.type === "consume-ai-tokens") {
    const nextTokens = state.currentAiTokensUsed + action.tokenCount;
    const ratio = nextTokens / spec.monthlyAiTokens;
    if (nextTokens > spec.monthlyAiTokens) {
      return {
        allowed: false,
        reason: `이번 달 AI 토큰 한도(${spec.monthlyAiTokens})를 초과했습니다 (요청량: ${action.tokenCount}, 잔여: ${Math.max(0, spec.monthlyAiTokens - state.currentAiTokensUsed)}).`,
        isWarningThreshold: true,
        usageRatio: ratio,
      };
    }
    return {
      allowed: true,
      isWarningThreshold: ratio >= 0.8,
      usageRatio: ratio,
    };
  }

  if (action.type === "create-canvas") {
    if (action.heightPx > spec.maxCanvasHeightPx) {
      return {
        allowed: false,
        reason: `${state.tier} 등급의 최대 캔버스 세로 높이는 ${spec.maxCanvasHeightPx}px입니다 (요청: ${action.heightPx}px).`,
        isWarningThreshold: false,
        usageRatio: 1,
      };
    }
    return {
      allowed: true,
      isWarningThreshold: false,
      usageRatio: action.heightPx / spec.maxCanvasHeightPx,
    };
  }

  const allowed = action.feature === "webgpu-export"
    ? spec.allowWebGpuExport
    : action.feature === "cmyk-softproof"
      ? spec.allowCmykSoftProof
      : spec.allowCustomPlugins;
  if (!allowed) {
    return {
      allowed: false,
      reason: "이 기능은 Creator 이상 멤버십에서 사용할 수 있습니다.",
      isWarningThreshold: false,
      usageRatio: 0,
    };
  }
  return {
    allowed: true,
    isWarningThreshold: false,
    usageRatio: 0,
  };
}

export function recordResourceUsage(
  state: SubscriptionUsageState,
  delta: { storageMb?: number; aiTokens?: number; activeSeats?: number },
): SubscriptionUsageState {
  return Object.freeze({
    ...state,
    currentStorageMbUsed: Math.max(
      0,
      state.currentStorageMbUsed + (delta.storageMb ?? 0),
    ),
    currentAiTokensUsed: Math.max(
      0,
      state.currentAiTokensUsed + (delta.aiTokens ?? 0),
    ),
    currentCollabSeatsActive: Math.max(
      0,
      state.currentCollabSeatsActive + (delta.activeSeats ?? 0),
    ),
  });
}
