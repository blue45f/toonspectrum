import type {
  ActivityPointKey,
  RewardMilestoneKey,
} from "../../../../../packages/core/src/membership-wallet";

export const MEMBERSHIP_REWARD_SERVICE = Symbol("MEMBERSHIP_REWARD_SERVICE");

export interface MembershipRewardService {
  grantActivityPoints(input: {
    userId: string | undefined;
    activity: ActivityPointKey;
    sourceRef: unknown;
    metadata?: Record<string, unknown>;
    clientClaim?: boolean;
  }): Promise<unknown>;

  grantRewardMilestone(
    userId: string | undefined,
    milestone: RewardMilestoneKey,
    sourceRef: unknown,
  ): Promise<unknown>;
}
