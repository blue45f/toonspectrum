export const STUDIO_STAFFING_ROLES = [
  "story-assistant",
  "storyboard",
  "lineart",
  "background",
  "color",
  "lettering",
  "localization",
  "production-assistant",
] as const;
export type StudioStaffingRole = (typeof STUDIO_STAFFING_ROLES)[number];

export const STUDIO_STAFFING_REGIONS = ["korea", "southeast-asia", "japan", "global"] as const;
export type StudioStaffingRegion = (typeof STUDIO_STAFFING_REGIONS)[number];

export interface StudioStaffingBrief {
  readonly version: 1;
  readonly projectId: string;
  readonly role: StudioStaffingRole;
  readonly preferredRegion: StudioStaffingRegion;
  readonly language: string;
  readonly monthlyBudgetUsd: number;
  readonly timezoneOverlapHours: number;
  readonly remoteOnly: boolean;
  readonly ndaRequired: boolean;
  readonly rightsAssignmentRequired: boolean;
  readonly portfolioVerificationRequired: boolean;
  readonly scope: string;
  readonly dueDate: string;
}

export interface StudioStaffingPool {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly region: StudioStaffingRegion;
  readonly roles: readonly StudioStaffingRole[];
  readonly languages: readonly string[];
  readonly typicalMonthlyUsd: readonly [number, number];
  readonly timezoneOverlapHours: number;
  readonly identityVerification: boolean;
  readonly portfolioVerification: boolean;
  readonly contractReady: boolean;
  readonly kind: "sample-pool";
}

export interface StudioStaffingMatch {
  readonly pool: StudioStaffingPool;
  readonly score: number;
  readonly reasons: readonly string[];
}

export const STUDIO_SAMPLE_STAFFING_POOLS: readonly StudioStaffingPool[] = Object.freeze([
  {
    id: "sea-webtoon-art-pool",
    labelKo: "동남아 웹툰 작화 보조 후보군",
    labelEn: "Southeast Asia webtoon art pool",
    region: "southeast-asia",
    roles: ["storyboard", "lineart", "background", "color"],
    languages: ["en"],
    typicalMonthlyUsd: [700, 1800],
    timezoneOverlapHours: 5,
    identityVerification: true,
    portfolioVerification: true,
    contractReady: true,
    kind: "sample-pool",
  },
  {
    id: "sea-production-assist-pool",
    labelKo: "동남아 제작·업무 보조 후보군",
    labelEn: "Southeast Asia production assistant pool",
    region: "southeast-asia",
    roles: ["production-assistant", "lettering", "localization"],
    languages: ["en", "ko"],
    typicalMonthlyUsd: [650, 1500],
    timezoneOverlapHours: 6,
    identityVerification: true,
    portfolioVerification: false,
    contractReady: true,
    kind: "sample-pool",
  },
  {
    id: "global-story-pool",
    labelKo: "글로벌 스토리·콘티 협업 후보군",
    labelEn: "Global story and storyboard pool",
    region: "global",
    roles: ["story-assistant", "storyboard", "localization"],
    languages: ["en", "ko", "ja"],
    typicalMonthlyUsd: [1200, 3200],
    timezoneOverlapHours: 3,
    identityVerification: true,
    portfolioVerification: true,
    contractReady: true,
    kind: "sample-pool",
  },
]);

export function createStudioStaffingBrief(projectId: string): StudioStaffingBrief {
  return Object.freeze({
    version: 1,
    projectId,
    role: "background",
    preferredRegion: "southeast-asia",
    language: "en",
    monthlyBudgetUsd: 1500,
    timezoneOverlapHours: 4,
    remoteOnly: true,
    ndaRequired: true,
    rightsAssignmentRequired: true,
    portfolioVerificationRequired: true,
    scope: "",
    dueDate: "",
  });
}

export function staffingBriefStorageKey(projectId: string): string {
  return `toonstudio:staffing-brief:v1:${encodeURIComponent(projectId)}`;
}

export function rankStudioStaffingPools(
  brief: StudioStaffingBrief,
  pools: readonly StudioStaffingPool[] = STUDIO_SAMPLE_STAFFING_POOLS,
): readonly StudioStaffingMatch[] {
  return pools.map((pool) => {
    let score = 0;
    const reasons: string[] = [];
    if (pool.roles.includes(brief.role)) {
      score += 45;
      reasons.push("role-match");
    }
    if (pool.region === brief.preferredRegion || pool.region === "global") {
      score += 20;
      reasons.push("region-match");
    }
    if (pool.languages.includes(brief.language)) {
      score += 12;
      reasons.push("language-match");
    }
    if (pool.timezoneOverlapHours >= brief.timezoneOverlapHours) {
      score += 8;
      reasons.push("timezone-match");
    }
    const [low, high] = pool.typicalMonthlyUsd;
    if (brief.monthlyBudgetUsd >= low) {
      score += brief.monthlyBudgetUsd >= high ? 8 : 5;
      reasons.push("budget-compatible");
    }
    if (!brief.portfolioVerificationRequired || pool.portfolioVerification) {
      score += 4;
      reasons.push("portfolio-ready");
    }
    if ((!brief.ndaRequired && !brief.rightsAssignmentRequired) || pool.contractReady) {
      score += 3;
      reasons.push("contract-ready");
    }
    return Object.freeze({ pool, score, reasons: Object.freeze(reasons) });
  }).sort((left, right) => right.score - left.score || left.pool.id.localeCompare(right.pool.id));
}
