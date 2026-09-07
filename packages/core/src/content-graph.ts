// 공식 API·오픈데이터·검토된 공개 웹 자료를 작품 탐색과 창작 연구에 연결하는
// 공용 계약. 이 파일은 브라우저와 API가 함께 사용하므로 Node/DOM/DB 의존성을 두지 않는다.

export type ContentEntityType =
  | "work"
  | "edition"
  | "serialization"
  | "person"
  | "organization"
  | "adaptation"
  | "event"
  | "opportunity"
  | "place"
  | "reference-asset"
  | "research-work";

export type ProviderCollectionMode =
  | "official-api"
  | "official-open-data"
  | "oai-pmh"
  | "sparql"
  | "iiif"
  | "rss"
  | "owner-feed"
  | "reviewed-html"
  | "manual-editorial"
  | "disabled";

export type ProviderPolicyStatus =
  | "review-required"
  | "approved"
  | "paused-policy-change"
  | "paused-rate-limit"
  | "blocked-robots"
  | "blocked-terms"
  | "blocked-rights"
  | "blocked-privacy"
  | "retired";

export type CommercialReadiness =
  | "commercial-core"
  | "commercial-conditional"
  | "contract-required"
  | "noncommercial-only"
  | "unknown"
  | "blocked";

export type MonetizationModel =
  | "free"
  | "subscription"
  | "advertising"
  | "affiliate"
  | "marketplace"
  | "business-to-business"
  | "paid-export";

export type ContentUsageSurface =
  | "public-discovery"
  | "paid-discovery"
  | "research-board"
  | "studio-reference"
  | "studio-import"
  | "project-export"
  | "marketplace-listing"
  | "marketplace-download"
  | "ai-input"
  | "ai-training";

export type RightsValue = true | false | null;

export interface RightsDecision {
  providerId: string;
  sourceRecordId?: string;
  assetId?: string;

  commercialReadiness: CommercialReadiness;
  allowedMonetizationModels: MonetizationModel[];
  allowedSurfaces: ContentUsageSurface[];

  metadataDisplay: RightsValue;
  descriptionDisplay: RightsValue;
  thumbnailDisplay: RightsValue;
  thumbnailCache: RightsValue;
  originalDownload: RightsValue;
  projectImport: RightsValue;
  transformation: RightsValue;
  aiInput: RightsValue;
  aiTraining: RightsValue;
  commercialUse: RightsValue;
  redistribution: RightsValue;

  attributionRequired: boolean;
  attributionText?: string;
  licenseCode?: string;
  licenseUrl?: string;
  sourceUrl: string;

  reviewStatus: "verified" | "needs-review" | "blocked";
  reviewedAt: string;
  validUntil?: string;
}

export interface SourceRecord {
  id: string;
  providerId: string;
  externalId: string;
  recordType: string;
  canonicalSourceUrl: string;
  payloadHash: string;
  parserVersion: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceUpdatedAt?: string;
  removedAt?: string;
  policySnapshotId: string;
  rightsSnapshotId?: string;
}

export interface EntityClaim<T = unknown> {
  id: string;
  entityId: string;
  fieldPath: string;
  rawValue: T;
  normalizedValue: T;
  providerId: string;
  sourceRecordId: string;
  confidence: number;
  verification:
    | "automatic"
    | "cross-checked"
    | "admin-verified"
    | "user-proposed";
  selectedAsCanonical: boolean;
  validFrom?: string;
  validUntil?: string;
}

export type RelationPredicate =
  | "edition-of"
  | "serialized-as"
  | "adapted-from"
  | "created-by"
  | "illustrated-by"
  | "published-by"
  | "translated-by"
  | "distributed-on"
  | "depicts"
  | "located-at"
  | "related-to";

export interface RelationClaim {
  id: string;
  subjectEntityId: string;
  predicate: RelationPredicate;
  objectEntityId: string;
  providerId: string;
  sourceRecordId: string;
  confidence: number;
  verification:
    | "automatic"
    | "cross-checked"
    | "admin-verified"
    | "user-proposed";
  selectedAsCanonical: boolean;
}

export interface MetricObservation {
  id: string;
  entityId: string;
  metric:
    | "site-detail-view"
    | "site-save"
    | "site-rating"
    | "search-interest"
    | "library-loan"
    | "wiki-pageview"
    | "edition-release"
    | "adaptation-activity"
    | "box-office";
  value: number;
  unit: string;
  providerId: string;
  sourceRecordId?: string;
  periodStart: string;
  periodEnd: string;
  measuredAt: string;
  estimated: boolean;
  methodology?: string;
}

export type ResearchUsageMode =
  | "reference-only"
  | "citation-only"
  | "project-import"
  | "blocked";

export type ResearchItemType =
  | "work"
  | "edition"
  | "person"
  | "adaptation"
  | "museum-object"
  | "heritage"
  | "image"
  | "3d-model"
  | "texture"
  | "hdri"
  | "sound"
  | "place"
  | "weather"
  | "species"
  | "research-paper"
  | "opportunity"
  | "external-link"
  | "user-note";

export interface ResearchItem {
  id: string;
  boardId: string;
  itemType: ResearchItemType;
  entityId?: string;
  sourceRecordId?: string;
  rightsSnapshotId?: string;
  usageMode: ResearchUsageMode;
  title: string;
  note: string;
  tags: string[];
  pinnedAt: string;
}

export interface ResearchBoard {
  id: string;
  ownerId: string;
  projectId?: string;
  title: string;
  description: string;
  visibility: "private" | "shared" | "public";
  items: ResearchItem[];
  createdAt: string;
  updatedAt: string;
}

export interface UsageContext {
  monetization: MonetizationModel;
  surface: ContentUsageSurface;
  commercialProject: boolean;
  willModify: boolean;
  willRedistribute: boolean;
  willUseForAi: boolean;
}

export interface UsageDecision {
  allowed: boolean;
  reason?:
    | "RIGHTS_NOT_VERIFIED"
    | "MONETIZATION_NOT_ALLOWED"
    | "SURFACE_NOT_ALLOWED"
    | "COMMERCIAL_USE_NOT_ALLOWED"
    | "DERIVATIVES_NOT_ALLOWED"
    | "REDISTRIBUTION_NOT_ALLOWED"
    | "AI_INPUT_NOT_ALLOWED";
}

/**
 * UI의 버튼 노출과 서버의 실제 다운로드·가져오기 실행에서 같은 판정을 사용한다.
 * `null`은 권리 미확인 상태이며 허용으로 해석하지 않는다.
 */
export function authorizeContentUsage(
  rights: RightsDecision,
  context: UsageContext,
): UsageDecision {
  if (rights.reviewStatus !== "verified") {
    return { allowed: false, reason: "RIGHTS_NOT_VERIFIED" };
  }
  if (!rights.allowedMonetizationModels.includes(context.monetization)) {
    return { allowed: false, reason: "MONETIZATION_NOT_ALLOWED" };
  }
  if (!rights.allowedSurfaces.includes(context.surface)) {
    return { allowed: false, reason: "SURFACE_NOT_ALLOWED" };
  }
  if (context.commercialProject && rights.commercialUse !== true) {
    return { allowed: false, reason: "COMMERCIAL_USE_NOT_ALLOWED" };
  }
  if (context.willModify && rights.transformation !== true) {
    return { allowed: false, reason: "DERIVATIVES_NOT_ALLOWED" };
  }
  if (context.willRedistribute && rights.redistribution !== true) {
    return { allowed: false, reason: "REDISTRIBUTION_NOT_ALLOWED" };
  }
  if (context.willUseForAi && rights.aiInput !== true) {
    return { allowed: false, reason: "AI_INPUT_NOT_ALLOWED" };
  }
  return { allowed: true };
}
