import type { StudioAssetRightsPermission } from "./studio-asset-rights-manifest";

export const STUDIO_3D_ASSET_SUPPLY_SOURCES = [
  "first_party",
  "commissioned_partner",
  "cc0",
  "creator_marketplace",
  "commercial_marketplace",
  "ai_assisted",
  "photogrammetry",
  "motion_capture",
  "private_user",
] as const;
export type Studio3dAssetSupplySource =
  (typeof STUDIO_3D_ASSET_SUPPLY_SOURCES)[number];

export const STUDIO_3D_ASSET_COMPATIBILITY_MODES = [
  "canonical",
  "compatibility",
  "private_import",
] as const;
export type Studio3dAssetCompatibilityMode =
  (typeof STUDIO_3D_ASSET_COMPATIBILITY_MODES)[number];

export interface Studio3dAssetSupplyPermissions {
  readonly commercialUse: StudioAssetRightsPermission;
  readonly redistribution: StudioAssetRightsPermission;
  readonly sublicensing: StudioAssetRightsPermission;
  readonly derivatives: StudioAssetRightsPermission;
  readonly publicCatalog: StudioAssetRightsPermission;
}

export interface Studio3dAiSupplyEvidence {
  readonly modelId: string | null;
  readonly modelVersion: string | null;
  readonly generationReceiptReference: string | null;
  readonly inputRightsConfirmed: boolean;
  readonly quarantineCleared: boolean;
}

export interface Studio3dScanSupplyEvidence {
  readonly propertyReleaseConfirmed: boolean;
  readonly privacyClearanceConfirmed: boolean;
  readonly trademarkClearanceConfirmed: boolean;
}

export interface Studio3dMotionSupplyEvidence {
  readonly performerReleaseConfirmed: boolean;
  readonly redistributionRightsConfirmed: boolean;
}

export interface Studio3dAssetSupplyEvidence {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly source: Studio3dAssetSupplySource;
  readonly compatibilityMode: Studio3dAssetCompatibilityMode;
  readonly licenseId: string | null;
  readonly proofReference: string | null;
  readonly distributionAgreementReference: string | null;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly humanReviewApproved: boolean;
  readonly ownershipConfirmed: boolean;
  readonly cc0DedicationConfirmed: boolean;
  readonly permissions: Studio3dAssetSupplyPermissions;
  readonly ai?: Studio3dAiSupplyEvidence | null;
  readonly scan?: Studio3dScanSupplyEvidence | null;
  readonly motion?: Studio3dMotionSupplyEvidence | null;
}

export const STUDIO_3D_ASSET_SUPPLY_DIAGNOSTIC_CODES = [
  "PRIVATE_IMPORT_NOT_DISTRIBUTABLE",
  "PRIVATE_USER_ASSET_NOT_DISTRIBUTABLE",
  "PROOF_REQUIRED",
  "HUMAN_REVIEW_REQUIRED",
  "COMMERCIAL_USE_NOT_ALLOWED",
  "REDISTRIBUTION_NOT_ALLOWED",
  "PUBLIC_CATALOG_NOT_ALLOWED",
  "DERIVATIVE_RIGHTS_NOT_ALLOWED",
  "SUBLICENSE_NOT_ALLOWED",
  "OWNERSHIP_NOT_CONFIRMED",
  "CC0_LICENSE_REQUIRED",
  "CC0_DEDICATION_NOT_CONFIRMED",
  "DISTRIBUTION_AGREEMENT_REQUIRED",
  "AI_PROVENANCE_INCOMPLETE",
  "AI_INPUT_RIGHTS_NOT_CONFIRMED",
  "AI_QUARANTINE_NOT_CLEARED",
  "SCAN_CLEARANCE_INCOMPLETE",
  "PERFORMER_RELEASE_REQUIRED",
  "MOTION_REDISTRIBUTION_NOT_ALLOWED",
] as const;
export type Studio3dAssetSupplyDiagnosticCode =
  (typeof STUDIO_3D_ASSET_SUPPLY_DIAGNOSTIC_CODES)[number];

export interface Studio3dAssetSupplyDiagnostic {
  readonly code: Studio3dAssetSupplyDiagnosticCode;
  readonly message: string;
}

export interface Studio3dAssetSupplyDecision {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly source: Studio3dAssetSupplySource;
  readonly compatibilityMode: Studio3dAssetCompatibilityMode;
  readonly allowedForPublicCatalog: boolean;
  readonly diagnostics: readonly Studio3dAssetSupplyDiagnostic[];
}

const SUPPLY_SOURCE_SET = new Set<string>(STUDIO_3D_ASSET_SUPPLY_SOURCES);
const COMPATIBILITY_MODE_SET = new Set<string>(STUDIO_3D_ASSET_COMPATIBILITY_MODES);

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
}

function requiredText(value: string, field: string, maximumLength: number): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > maximumLength
    || hasControlCharacters(normalized)) {
    throw new TypeError(`${field} 값이 올바르지 않습니다.`);
  }
  return normalized;
}

function hasText(value: string | null, maximumLength = 500): boolean {
  if (value === null) return false;
  const normalized = value.normalize("NFKC").trim();
  return normalized.length > 0
    && normalized.length <= maximumLength
    && !hasControlCharacters(normalized);
}

function hasReviewTimestamp(value: string | null): boolean {
  return value !== null && Number.isFinite(Date.parse(value));
}

function isAllowed(permission: StudioAssetRightsPermission): boolean {
  return permission === "allowed";
}

export function evaluateStudio3dAssetSupply(
  evidence: Studio3dAssetSupplyEvidence
): Studio3dAssetSupplyDecision {
  if (!SUPPLY_SOURCE_SET.has(evidence.source)) {
    throw new TypeError("지원하지 않는 3D 에셋 공급원입니다.");
  }
  if (!COMPATIBILITY_MODE_SET.has(evidence.compatibilityMode)) {
    throw new TypeError("지원하지 않는 3D 캐릭터 호환 모드입니다.");
  }

  const assetId = requiredText(evidence.assetId, "assetId", 160);
  const assetVersion = requiredText(evidence.assetVersion, "assetVersion", 160);
  const diagnostics = new Map<
    Studio3dAssetSupplyDiagnosticCode,
    Studio3dAssetSupplyDiagnostic
  >();
  const add = (code: Studio3dAssetSupplyDiagnosticCode, message: string): void => {
    if (!diagnostics.has(code)) diagnostics.set(code, Object.freeze({ code, message }));
  };

  if (evidence.compatibilityMode === "private_import") {
    add(
      "PRIVATE_IMPORT_NOT_DISTRIBUTABLE",
      "개인 가져오기 모드의 에셋은 공개 카탈로그에 배포할 수 없습니다."
    );
  }
  if (evidence.source === "private_user") {
    add(
      "PRIVATE_USER_ASSET_NOT_DISTRIBUTABLE",
      "사용자 개인 소유 에셋은 별도의 재배포 계약 없이는 공개할 수 없습니다."
    );
  }
  if (!hasText(evidence.proofReference)) {
    add("PROOF_REQUIRED", "원본 출처 또는 계약 증빙 참조가 필요합니다.");
  }
  if (!evidence.humanReviewApproved
    || !hasText(evidence.reviewedBy, 80)
    || !hasReviewTimestamp(evidence.reviewedAt)) {
    add("HUMAN_REVIEW_REQUIRED", "담당자와 검토 시각을 포함한 사람의 승인이 필요합니다.");
  }
  if (!isAllowed(evidence.permissions.commercialUse)) {
    add("COMMERCIAL_USE_NOT_ALLOWED", "상업적 이용 권한이 명시적으로 허용되지 않았습니다.");
  }
  if (!isAllowed(evidence.permissions.redistribution)) {
    add("REDISTRIBUTION_NOT_ALLOWED", "서비스 내 재배포 권한이 명시적으로 허용되지 않았습니다.");
  }
  if (!isAllowed(evidence.permissions.publicCatalog)) {
    add("PUBLIC_CATALOG_NOT_ALLOWED", "공개 카탈로그 배포 권한이 명시적으로 허용되지 않았습니다.");
  }
  if (!isAllowed(evidence.permissions.derivatives)) {
    add("DERIVATIVE_RIGHTS_NOT_ALLOWED", "최적화·LOD·재질 변환을 위한 파생물 권한이 없습니다.");
  }

  if (evidence.source === "first_party" && !evidence.ownershipConfirmed) {
    add("OWNERSHIP_NOT_CONFIRMED", "ToonStudio가 원저작권 또는 충분한 독점 권리를 보유해야 합니다.");
  }

  if (evidence.source === "cc0") {
    if (evidence.licenseId?.trim().toLocaleLowerCase("en-US") !== "cc0-1.0") {
      add("CC0_LICENSE_REQUIRED", "CC0 공급 경로는 CC0 1.0 원문 확인이 필요합니다.");
    }
    if (!evidence.cc0DedicationConfirmed) {
      add("CC0_DEDICATION_NOT_CONFIRMED", "공개 도메인 헌정과 원출처를 확인해야 합니다.");
    }
  }

  if ([
    "commissioned_partner",
    "creator_marketplace",
    "commercial_marketplace",
  ].includes(evidence.source)) {
    if (!hasText(evidence.distributionAgreementReference)) {
      add(
        "DISTRIBUTION_AGREEMENT_REQUIRED",
        "서비스 배포·변환·기존 사용자 존속 권리를 포함한 별도 계약이 필요합니다."
      );
    }
    if (!isAllowed(evidence.permissions.sublicensing)) {
      add("SUBLICENSE_NOT_ALLOWED", "최종 사용자에게 부여할 서비스 내 이용 권한이 없습니다.");
    }
  }

  if (evidence.source === "ai_assisted") {
    if (!evidence.ai
      || !hasText(evidence.ai.modelId, 160)
      || !hasText(evidence.ai.modelVersion, 160)
      || !hasText(evidence.ai.generationReceiptReference)) {
      add("AI_PROVENANCE_INCOMPLETE", "생성 모델·버전·생성 영수증을 모두 기록해야 합니다.");
    }
    if (!evidence.ai?.inputRightsConfirmed) {
      add("AI_INPUT_RIGHTS_NOT_CONFIRMED", "AI 입력 이미지와 참조물의 사용 권한이 확인되지 않았습니다.");
    }
    if (!evidence.ai?.quarantineCleared) {
      add("AI_QUARANTINE_NOT_CLEARED", "AI 에셋 격리 검수와 유사성 점검을 통과해야 합니다.");
    }
  }

  if (evidence.source === "photogrammetry"
    && (!evidence.scan?.propertyReleaseConfirmed
      || !evidence.scan.privacyClearanceConfirmed
      || !evidence.scan.trademarkClearanceConfirmed)) {
    add(
      "SCAN_CLEARANCE_INCOMPLETE",
      "스캔 대상의 재산권·개인정보·상표 노출 검토를 모두 통과해야 합니다."
    );
  }

  if (evidence.source === "motion_capture") {
    if (!evidence.motion?.performerReleaseConfirmed) {
      add("PERFORMER_RELEASE_REQUIRED", "모션 연기자의 초상·실연 사용 동의가 필요합니다.");
    }
    if (!evidence.motion?.redistributionRightsConfirmed) {
      add(
        "MOTION_REDISTRIBUTION_NOT_ALLOWED",
        "모션 클립을 서비스 사용자에게 제공할 수 있는 재배포 권한이 필요합니다."
      );
    }
  }

  const result = Object.freeze([...diagnostics.values()]);
  return Object.freeze({
    assetId,
    assetVersion,
    source: evidence.source,
    compatibilityMode: evidence.compatibilityMode,
    allowedForPublicCatalog: result.length === 0,
    diagnostics: result,
  });
}
