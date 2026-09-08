import type {
  CreatorMarketplaceResourceEngine,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

import {
  compareCreatorMarketplaceSemver,
  isCreatorMarketplaceSemver,
  normalizeCreatorMarketplaceLegacySemver,
} from "@/shared/lib/creator-marketplace-semver";

export const MARKET_PRODUCTION_PROFILE_STORAGE_KEY =
  "toonspectrum.market.production-fit.v1" as const;
export const MARKET_PRODUCTION_PROFILE_VERSION = 1 as const;
export const MARKET_PRODUCTION_PROFILE_MAX_STUDIO_VERSION_CHARACTERS = 40;

export const MARKET_PRODUCTION_PROFILE_ENGINES = [
  "any",
  "canvas2d",
  "webgl2",
  "webgpu",
  "three",
] as const;
export const MARKET_PRODUCTION_PROFILE_USAGES = [
  "commercial",
  "noncommercial",
] as const;
export const MARKET_PRODUCTION_PROFILE_AI_POLICIES = [
  "allow",
  "review",
  "exclude",
] as const;
export const MARKET_PRODUCTION_PROFILE_PROVENANCE_POLICIES = [
  "any",
  "original-only",
] as const;
export const MARKET_PRODUCTION_PROFILE_DELIVERY_POLICIES = [
  "any",
  "self-contained",
] as const;

export type MarketProductionProfileEngine =
  (typeof MARKET_PRODUCTION_PROFILE_ENGINES)[number];
export type MarketProductionProfileUsage =
  (typeof MARKET_PRODUCTION_PROFILE_USAGES)[number];
export type MarketProductionProfileAiPolicy =
  (typeof MARKET_PRODUCTION_PROFILE_AI_POLICIES)[number];
export type MarketProductionProfileProvenancePolicy =
  (typeof MARKET_PRODUCTION_PROFILE_PROVENANCE_POLICIES)[number];
export type MarketProductionProfileDeliveryPolicy =
  (typeof MARKET_PRODUCTION_PROFILE_DELIVERY_POLICIES)[number];

export interface MarketProductionProfile {
  readonly version: typeof MARKET_PRODUCTION_PROFILE_VERSION;
  /** Empty means the user has not declared the Studio compatibility version to compare. */
  readonly studioVersion: string;
  readonly engine: MarketProductionProfileEngine;
  readonly usage: MarketProductionProfileUsage;
  readonly aiPolicy: MarketProductionProfileAiPolicy;
  readonly provenancePolicy: MarketProductionProfileProvenancePolicy;
  readonly deliveryPolicy: MarketProductionProfileDeliveryPolicy;
  readonly attributionSupported: boolean;
}

export const DEFAULT_MARKET_PRODUCTION_PROFILE: MarketProductionProfile = Object.freeze({
  version: MARKET_PRODUCTION_PROFILE_VERSION,
  studioVersion: "",
  engine: "any",
  usage: "commercial",
  aiPolicy: "review",
  provenancePolicy: "any",
  deliveryPolicy: "any",
  attributionSupported: true,
});

export const MARKET_PRODUCTION_PROFILE_PRESETS = Object.freeze([
  {
    id: "commercial-serial",
    label: "상업 연재",
    description: "상업 이용을 허용하고 AI 포함 리소스는 적용 전에 확인합니다.",
    patch: {
      usage: "commercial",
      aiPolicy: "review",
      provenancePolicy: "any",
      deliveryPolicy: "any",
      attributionSupported: true,
    },
  },
  {
    id: "original-strict",
    label: "엄격한 원본",
    description: "배급자 원본·비AI·독립 패키지만 통과시킵니다.",
    patch: {
      usage: "commercial",
      aiPolicy: "exclude",
      provenancePolicy: "original-only",
      deliveryPolicy: "self-contained",
      attributionSupported: true,
    },
  },
  {
    id: "reference-research",
    label: "레퍼런스 탐색",
    description: "비상업 검토 단계에서 출처와 AI 정보를 열어 둡니다.",
    patch: {
      usage: "noncommercial",
      aiPolicy: "allow",
      provenancePolicy: "any",
      deliveryPolicy: "any",
      attributionSupported: true,
    },
  },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly patch: Omit<
    Partial<MarketProductionProfile>,
    "version" | "studioVersion" | "engine"
  >;
}[]);

export type MarketProductionFitCheckStatus = "pass" | "review" | "block";
export type MarketProductionFitStatus = "ready" | "review" | "blocked";
export type MarketProductionFitCheckId =
  | "studio-version"
  | "engine"
  | "license"
  | "attribution"
  | "ai-disclosure"
  | "provenance"
  | "delivery";

export interface MarketProductionFitCheck {
  readonly id: MarketProductionFitCheckId;
  readonly label: string;
  readonly status: MarketProductionFitCheckStatus;
  readonly summary: string;
  readonly evidence: string;
}

export interface MarketProductionFitEvaluation {
  readonly status: MarketProductionFitStatus;
  readonly checks: readonly MarketProductionFitCheck[];
  readonly passCount: number;
  readonly reviewCount: number;
  readonly blockCount: number;
  readonly headline: string;
  readonly guidance: string;
}

export interface MarketProductionFitRecord {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly evaluation: MarketProductionFitEvaluation;
}

const ENGINE_LABELS: Readonly<Record<CreatorMarketplaceResourceEngine, string>> = {
  canvas2d: "Canvas 2D",
  webgl2: "WebGL 2",
  webgpu: "WebGPU",
  three: "Three.js",
};

const LICENSE_CAPABILITIES: Readonly<
  Record<CreatorMarketplaceResourceLicense, {
    readonly commercialUse: boolean;
    readonly attributionRequired: boolean;
  }>
> = {
  "toonspectrum-standard": {
    commercialUse: true,
    attributionRequired: false,
  },
  "cc0-1.0": {
    commercialUse: true,
    attributionRequired: false,
  },
  "cc-by-4.0": {
    commercialUse: true,
    attributionRequired: true,
  },
  "cc-by-nc-4.0": {
    commercialUse: false,
    attributionRequired: true,
  },
};

const LICENSE_LABELS: Readonly<Record<CreatorMarketplaceResourceLicense, string>> = {
  "toonspectrum-standard": "ToonSpectrum 표준 사용권",
  "cc0-1.0": "CC0 1.0",
  "cc-by-4.0": "CC BY 4.0",
  "cc-by-nc-4.0": "CC BY-NC 4.0",
};

const PROFILE_ENGINE_SET = new Set<string>(MARKET_PRODUCTION_PROFILE_ENGINES);
const PROFILE_USAGE_SET = new Set<string>(MARKET_PRODUCTION_PROFILE_USAGES);
const PROFILE_AI_POLICY_SET = new Set<string>(MARKET_PRODUCTION_PROFILE_AI_POLICIES);
const PROFILE_PROVENANCE_POLICY_SET = new Set<string>(
  MARKET_PRODUCTION_PROFILE_PROVENANCE_POLICIES,
);
const PROFILE_DELIVERY_POLICY_SET = new Set<string>(
  MARKET_PRODUCTION_PROFILE_DELIVERY_POLICIES,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function sanitizeStudioVersion(value: unknown): string {
  if (typeof value !== "string") return "";
  let sanitized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) continue;
    sanitized += character;
  }
  return sanitized
    .trim()
    .slice(0, MARKET_PRODUCTION_PROFILE_MAX_STUDIO_VERSION_CHARACTERS);
}

function enumValue<T extends string>(
  value: unknown,
  values: ReadonlySet<string>,
  fallback: T,
): T {
  return typeof value === "string" && values.has(value) ? value as T : fallback;
}

/**
 * Reads a browser or imported profile defensively. Unknown fields, prototype values and future
 * schema versions are ignored so a malformed preference can never turn into a false compatibility
 * approval.
 */
export function parseMarketProductionProfile(value: unknown): MarketProductionProfile {
  if (
    !isRecord(value)
    || ownValue(value, "version") !== MARKET_PRODUCTION_PROFILE_VERSION
  ) {
    return DEFAULT_MARKET_PRODUCTION_PROFILE;
  }

  return Object.freeze({
    version: MARKET_PRODUCTION_PROFILE_VERSION,
    studioVersion: sanitizeStudioVersion(ownValue(value, "studioVersion")),
    engine: enumValue(
      ownValue(value, "engine"),
      PROFILE_ENGINE_SET,
      DEFAULT_MARKET_PRODUCTION_PROFILE.engine,
    ),
    usage: enumValue(
      ownValue(value, "usage"),
      PROFILE_USAGE_SET,
      DEFAULT_MARKET_PRODUCTION_PROFILE.usage,
    ),
    aiPolicy: enumValue(
      ownValue(value, "aiPolicy"),
      PROFILE_AI_POLICY_SET,
      DEFAULT_MARKET_PRODUCTION_PROFILE.aiPolicy,
    ),
    provenancePolicy: enumValue(
      ownValue(value, "provenancePolicy"),
      PROFILE_PROVENANCE_POLICY_SET,
      DEFAULT_MARKET_PRODUCTION_PROFILE.provenancePolicy,
    ),
    deliveryPolicy: enumValue(
      ownValue(value, "deliveryPolicy"),
      PROFILE_DELIVERY_POLICY_SET,
      DEFAULT_MARKET_PRODUCTION_PROFILE.deliveryPolicy,
    ),
    attributionSupported: typeof ownValue(value, "attributionSupported") === "boolean"
      ? ownValue(value, "attributionSupported") as boolean
      : DEFAULT_MARKET_PRODUCTION_PROFILE.attributionSupported,
  });
}

export function mergeMarketProductionProfile(
  profile: MarketProductionProfile,
  patch: Partial<Omit<MarketProductionProfile, "version">>,
): MarketProductionProfile {
  return parseMarketProductionProfile({
    ...profile,
    ...patch,
    version: MARKET_PRODUCTION_PROFILE_VERSION,
  });
}

export function serializeMarketProductionProfile(
  profile: MarketProductionProfile,
): string {
  return JSON.stringify(parseMarketProductionProfile(profile));
}

export function isMarketProductionStudioVersionValid(value: string): boolean {
  return value.length === 0 || isCreatorMarketplaceSemver(value);
}

export function marketProductionEngineLabel(
  engine: MarketProductionProfileEngine | CreatorMarketplaceResourceEngine,
): string {
  return engine === "any" ? "렌더러 제한 없음" : ENGINE_LABELS[engine];
}

function engineEvidence(record: CreatorMarketplaceResourceRecord): string {
  return record.compatibility.engines.map((engine) => ENGINE_LABELS[engine]).join(", ");
}

function studioVersionCheck(
  record: CreatorMarketplaceResourceRecord,
  profile: MarketProductionProfile,
): MarketProductionFitCheck {
  const minimum = normalizeCreatorMarketplaceLegacySemver(record.minimumStudioVersion);
  if (!minimum) {
    return {
      id: "studio-version",
      label: "Studio 버전",
      status: "review",
      summary: "리소스의 최소 버전을 판정할 수 없습니다.",
      evidence: `manifest: ${record.minimumStudioVersion}`,
    };
  }
  if (!profile.studioVersion) {
    return {
      id: "studio-version",
      label: "Studio 버전",
      status: "review",
      summary: "현재 Studio 버전을 입력하면 설치 가능 여부를 판정합니다.",
      evidence: `최소 v${minimum}`,
    };
  }
  if (!isCreatorMarketplaceSemver(profile.studioVersion)) {
    return {
      id: "studio-version",
      label: "Studio 버전",
      status: "review",
      summary: "현재 버전을 SemVer 형식으로 다시 입력해 주세요.",
      evidence: `입력 ${profile.studioVersion} · 최소 v${minimum}`,
    };
  }
  if (compareCreatorMarketplaceSemver(profile.studioVersion, minimum) < 0) {
    return {
      id: "studio-version",
      label: "Studio 버전",
      status: "block",
      summary: `Studio v${minimum} 이상이 필요합니다.`,
      evidence: `현재 v${profile.studioVersion} · 최소 v${minimum}`,
    };
  }
  return {
    id: "studio-version",
    label: "Studio 버전",
    status: "pass",
    summary: "선택한 Studio 버전에서 사용할 수 있습니다.",
    evidence: `현재 v${profile.studioVersion} · 최소 v${minimum}`,
  };
}

function engineCheck(
  record: CreatorMarketplaceResourceRecord,
  profile: MarketProductionProfile,
): MarketProductionFitCheck {
  const evidence = engineEvidence(record);
  if (profile.engine === "any") {
    return {
      id: "engine",
      label: "렌더러",
      status: "pass",
      summary: "렌더러 제한을 적용하지 않았습니다.",
      evidence: `manifest: ${evidence}`,
    };
  }
  if (!record.compatibility.engines.includes(profile.engine)) {
    return {
      id: "engine",
      label: "렌더러",
      status: "block",
      summary: `${ENGINE_LABELS[profile.engine]} 호환 선언이 없습니다.`,
      evidence: `manifest: ${evidence}`,
    };
  }
  return {
    id: "engine",
    label: "렌더러",
    status: "pass",
    summary: `${ENGINE_LABELS[profile.engine]} 호환이 선언되어 있습니다.`,
    evidence: `manifest: ${evidence}`,
  };
}

function licenseCheck(
  record: CreatorMarketplaceResourceRecord,
  profile: MarketProductionProfile,
): MarketProductionFitCheck {
  const capability = LICENSE_CAPABILITIES[record.license];
  const label = LICENSE_LABELS[record.license];
  if (profile.usage === "commercial" && !capability.commercialUse) {
    return {
      id: "license",
      label: "이용 범위",
      status: "block",
      summary: "상업 연재 조건과 맞지 않는 비상업 전용 사용권입니다.",
      evidence: label,
    };
  }
  return {
    id: "license",
    label: "이용 범위",
    status: "pass",
    summary: profile.usage === "commercial"
      ? "상업 작품 사용이 허용된 사용권입니다."
      : "선택한 비상업 검토 범위에서 사용할 수 있습니다.",
    evidence: label,
  };
}

function attributionCheck(
  record: CreatorMarketplaceResourceRecord,
  profile: MarketProductionProfile,
): MarketProductionFitCheck {
  const required = LICENSE_CAPABILITIES[record.license].attributionRequired;
  if (!required) {
    return {
      id: "attribution",
      label: "저작자 표시",
      status: "pass",
      summary: "이 사용권은 저작자 표시를 필수로 요구하지 않습니다.",
      evidence: LICENSE_LABELS[record.license],
    };
  }
  if (!record.attributionText.trim()) {
    return {
      id: "attribution",
      label: "저작자 표시",
      status: "review",
      summary: "표시는 필요하지만 manifest에 사용할 문구가 없습니다.",
      evidence: `${LICENSE_LABELS[record.license]} · 표시 문구 없음`,
    };
  }
  if (!profile.attributionSupported) {
    return {
      id: "attribution",
      label: "저작자 표시",
      status: "block",
      summary: "현재 배포 흐름에서 필수 표시를 유지할 수 없습니다.",
      evidence: record.attributionText,
    };
  }
  return {
    id: "attribution",
    label: "저작자 표시",
    status: "pass",
    summary: "필수 표시 문구를 작품 크레딧에 보존할 수 있습니다.",
    evidence: record.attributionText,
  };
}

function aiDisclosureCheck(
  record: CreatorMarketplaceResourceRecord,
  profile: MarketProductionProfile,
): MarketProductionFitCheck {
  if (!record.containsAi) {
    return {
      id: "ai-disclosure",
      label: "AI 포함 여부",
      status: "pass",
      summary: "manifest가 AI 미포함으로 선언되어 있습니다.",
      evidence: "containsAi: false",
    };
  }
  if (profile.aiPolicy === "exclude") {
    return {
      id: "ai-disclosure",
      label: "AI 포함 여부",
      status: "block",
      summary: "AI 포함 리소스를 제외하는 제작 정책과 충돌합니다.",
      evidence: "containsAi: true",
    };
  }
  if (profile.aiPolicy === "review") {
    return {
      id: "ai-disclosure",
      label: "AI 포함 여부",
      status: "review",
      summary: "AI 포함 범위와 권리 설명을 적용 전에 확인하세요.",
      evidence: "containsAi: true",
    };
  }
  return {
    id: "ai-disclosure",
    label: "AI 포함 여부",
    status: "pass",
    summary: "현재 제작 정책은 AI 포함 리소스를 허용합니다.",
    evidence: "containsAi: true",
  };
}

function provenanceCheck(
  record: CreatorMarketplaceResourceRecord,
  profile: MarketProductionProfile,
): MarketProductionFitCheck {
  if (record.provenance.origin === "original") {
    return {
      id: "provenance",
      label: "출처",
      status: "pass",
      summary: "배급자가 직접 만든 원본으로 선언했습니다.",
      evidence: "origin: original · authoredByPublisher: true",
    };
  }
  if (profile.provenancePolicy === "original-only") {
    return {
      id: "provenance",
      label: "출처",
      status: "block",
      summary: "배급자 원본만 허용하는 제작 정책과 충돌합니다.",
      evidence: `${record.provenance.sourceName} · ${record.provenance.sourceLicenseUrl}`,
    };
  }
  return {
    id: "provenance",
    label: "출처",
    status: "pass",
    summary: "원 출처와 사용권 원문 링크가 함께 기록되어 있습니다.",
    evidence: `${record.provenance.sourceName} · ${record.provenance.sourceLicenseUrl}`,
  };
}

function deliveryCheck(
  record: CreatorMarketplaceResourceRecord,
  profile: MarketProductionProfile,
): MarketProductionFitCheck {
  const modes = Array.from(new Set(record.entries.map((entry) => entry.delivery.mode)));
  const builtinCount = record.entries.filter(
    (entry) => entry.delivery.mode === "builtin-ref",
  ).length;
  const evidence = `${record.entries.length}개 항목 · ${modes.join(", ")}`;
  if (profile.deliveryPolicy === "self-contained" && builtinCount > 0) {
    return {
      id: "delivery",
      label: "전달 방식",
      status: "block",
      summary: `내장 참조 ${builtinCount}개가 있어 독립 패키지 조건을 충족하지 않습니다.`,
      evidence,
    };
  }
  return {
    id: "delivery",
    label: "전달 방식",
    status: "pass",
    summary: profile.deliveryPolicy === "self-contained"
      ? "모든 항목이 패키지 안에 포함된 portable 정의입니다."
      : "manifest에 기록된 전달 방식을 허용합니다.",
    evidence,
  };
}

export function evaluateMarketProductionFit(
  record: CreatorMarketplaceResourceRecord,
  profileInput: MarketProductionProfile,
): MarketProductionFitEvaluation {
  const profile = parseMarketProductionProfile(profileInput);
  const checks = Object.freeze([
    studioVersionCheck(record, profile),
    engineCheck(record, profile),
    licenseCheck(record, profile),
    attributionCheck(record, profile),
    aiDisclosureCheck(record, profile),
    provenanceCheck(record, profile),
    deliveryCheck(record, profile),
  ]);
  const passCount = checks.filter((check) => check.status === "pass").length;
  const reviewCount = checks.filter((check) => check.status === "review").length;
  const blockCount = checks.filter((check) => check.status === "block").length;
  const status: MarketProductionFitStatus = blockCount > 0
    ? "blocked"
    : reviewCount > 0
      ? "review"
      : "ready";

  if (status === "blocked") {
    return {
      status,
      checks,
      passCount,
      reviewCount,
      blockCount,
      headline: "현재 제작 조건에서는 적용 차단",
      guidance: "차단된 조건을 바꾸거나 다른 리소스를 선택한 뒤 획득을 진행하세요.",
    };
  }
  if (status === "review") {
    return {
      status,
      checks,
      passCount,
      reviewCount,
      blockCount,
      headline: "적용 전 확인 필요",
      guidance: "확인 항목을 검토한 뒤 리소스 상세의 획득·적용 단계를 진행하세요.",
    };
  }
  return {
    status,
    checks,
    passCount,
    reviewCount,
    blockCount,
    headline: "현재 제작 조건과 일치",
    guidance: "manifest 기준의 사전점검을 통과했습니다. 실제 적용 전 미리보기를 확인하세요.",
  };
}

const FIT_STATUS_ORDER: Readonly<Record<MarketProductionFitStatus, number>> = {
  ready: 0,
  review: 1,
  blocked: 2,
};

export function evaluateAndSortMarketProductionRecords(
  records: readonly CreatorMarketplaceResourceRecord[],
  profile: MarketProductionProfile,
): readonly MarketProductionFitRecord[] {
  return records
    .map((record) => ({
      record,
      evaluation: evaluateMarketProductionFit(record, profile),
    }))
    .sort((left, right) => {
      const statusDifference = FIT_STATUS_ORDER[left.evaluation.status]
        - FIT_STATUS_ORDER[right.evaluation.status];
      if (statusDifference !== 0) return statusDifference;
      const timeDifference = Date.parse(right.record.updatedAt) - Date.parse(left.record.updatedAt);
      if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
      return left.record.name.localeCompare(right.record.name, "ko-KR");
    });
}

export function marketProductionFitSearchText(
  record: CreatorMarketplaceResourceRecord,
): string {
  return [
    record.name,
    record.description,
    record.publisher.name,
    record.kind,
    record.license,
    record.resourceVersion,
    record.minimumStudioVersion,
    ...record.tags,
    ...record.compatibility.engines,
    ...record.entries.flatMap((entry) => [entry.name, entry.kind, entry.delivery.mode]),
  ].join("\n").toLocaleLowerCase("ko-KR");
}
