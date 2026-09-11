export const STUDIO_ASSET_TYPES = [
  "brush",
  "image",
  "webtoon-template",
  "3d",
  "font",
  "audio",
  "design-template",
  "automation",
  "plugin",
  "ai-reference",
] as const;

export const STUDIO_ASSET_DESTINATIONS = [
  "internal",
  "webtoon",
  "print",
  "video",
  "merchandise",
  "app",
  "ebook",
  "client-delivery",
] as const;

export type StudioAssetType = (typeof STUDIO_ASSET_TYPES)[number];
export type StudioAssetDestination = (typeof STUDIO_ASSET_DESTINATIONS)[number];
export type StudioAssetPermission = "allowed" | "conditional" | "prohibited" | "unknown";
export type StudioAssetDecisionStatus = "allowed" | "warning" | "blocked";
export type StudioAssetFindingSeverity = "info" | "warning" | "error";
export type StudioAssetAiClassification = "none" | "assisted" | "generated";

export interface StudioAssetSource {
  readonly providerId: string;
  readonly providerName: string;
  readonly authorName: string;
  readonly sourceUrl?: string;
  readonly receiptId?: string;
  readonly importedAt: string;
}

export interface StudioAssetCompatibility {
  readonly minStudioVersion?: string;
  readonly maxStudioVersion?: string;
  readonly requiredCapabilities: readonly string[];
  readonly supportedPlatforms: readonly ("web" | "desktop" | "mobile")[];
  readonly supportedFormats: readonly string[];
}

export interface StudioAssetQualityBase {
  readonly status: "verified" | "review-needed" | "rejected";
  readonly grade: "A" | "B" | "C" | "unrated";
  readonly fileSizeBytes: number;
  readonly checksum: string;
  readonly previewAvailable: boolean;
  readonly compatibility: StudioAssetCompatibility;
}

export interface StudioBrushQuality {
  readonly kind: "brush";
  readonly engineIds: readonly string[];
  readonly deterministic: boolean;
  readonly gpuCost: "low" | "medium" | "high";
  readonly pressure: boolean;
  readonly tilt: boolean;
}

export interface StudioImageQuality {
  readonly kind: "image";
  readonly width: number;
  readonly height: number;
  readonly dpi: number | null;
  readonly colorSpace: string;
  readonly alpha: boolean;
  readonly layers: number | null;
}

export interface Studio3dQuality {
  readonly kind: "3d";
  readonly triangles: number;
  readonly materials: number;
  readonly textures: number;
  readonly textureMaxSize: number;
  readonly rigged: boolean;
  readonly pbr: boolean;
  readonly lineArtReady: boolean;
}

export interface StudioFontQuality {
  readonly kind: "font";
  readonly familyName: string;
  readonly supportedLanguages: readonly string[];
  readonly glyphCount: number;
  readonly variable: boolean;
  readonly ebookEmbedding: boolean;
  readonly webfont: boolean;
}

export interface StudioAudioQuality {
  readonly kind: "audio";
  readonly durationMs: number;
  readonly sampleRate: number;
  readonly bitDepth: number;
  readonly loudnessLufs: number | null;
  readonly loopable: boolean;
  readonly stems: number;
}

export interface StudioGenericQuality {
  readonly kind:
    | "webtoon-template"
    | "design-template"
    | "automation"
    | "plugin"
    | "ai-reference";
  readonly itemCount: number;
  readonly editable: boolean;
  readonly dependencies: readonly string[];
}

export type StudioAssetTypeQuality =
  | StudioBrushQuality
  | StudioImageQuality
  | Studio3dQuality
  | StudioFontQuality
  | StudioAudioQuality
  | StudioGenericQuality;

export interface StudioAssetQualityPassport extends StudioAssetQualityBase {
  readonly details: StudioAssetTypeQuality;
}

export interface StudioAssetRights {
  readonly verified: boolean;
  readonly licenseId: string;
  readonly licenseName: string;
  readonly commercialUse: StudioAssetPermission;
  readonly modification: StudioAssetPermission;
  readonly clientWork: StudioAssetPermission;
  readonly publishing: StudioAssetPermission;
  readonly video: StudioAssetPermission;
  readonly merchandise: StudioAssetPermission;
  readonly appEmbedding: StudioAssetPermission;
  readonly ebookEmbedding: StudioAssetPermission;
  readonly sourceRedistribution: StudioAssetPermission;
  readonly aiGenerationReference: StudioAssetPermission;
  readonly aiTraining: StudioAssetPermission;
  readonly attributionRequired: boolean;
  readonly attributionText?: string;
  readonly seatLimit?: number;
  readonly expiresAt?: string;
  readonly territoryRestrictions?: readonly string[];
  readonly notes?: string;
}

export interface StudioAssetAiProvenance {
  readonly classification: StudioAssetAiClassification;
  readonly providerIds: readonly string[];
  readonly modelNames: readonly string[];
  readonly sourceReferencesCleared: boolean;
  readonly disclosureRequired: boolean;
  readonly editedByHuman: boolean;
}

export interface StudioAssetPassport {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly versionId: string;
  readonly type: StudioAssetType;
  readonly title: string;
  readonly source: StudioAssetSource;
  readonly quality: StudioAssetQualityPassport;
  readonly rights: StudioAssetRights;
  readonly ai: StudioAssetAiProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioAssetUsageContext {
  readonly destination: StudioAssetDestination;
  readonly commercial: boolean;
  readonly teamSeats: number;
  readonly modifiesAsset: boolean;
  readonly deliversSourceFiles: boolean;
  readonly usesAsAiReference: boolean;
  readonly usesForAiTraining: boolean;
  readonly attributionIncluded: boolean;
  readonly territory?: string;
  readonly now?: string;
}

export interface StudioAssetPassportIssue {
  readonly code: string;
  readonly severity: StudioAssetFindingSeverity;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioAssetUsageDecision {
  readonly status: StudioAssetDecisionStatus;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly findings: readonly StudioAssetPassportIssue[];
}

const ASSET_TYPE_SET = new Set<string>(STUDIO_ASSET_TYPES);
const DESTINATION_PERMISSION: Readonly<
  Record<Exclude<StudioAssetDestination, "internal">, keyof StudioAssetRights>
> = Object.freeze({
  webtoon: "publishing",
  print: "publishing",
  video: "video",
  merchandise: "merchandise",
  app: "appEmbedding",
  ebook: "ebookEmbedding",
  "client-delivery": "clientWork",
});

function validId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 180 || value.trim() !== value) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return value !== "." && value !== ".." && !value.includes("\\");
}

function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function issue(
  code: string,
  severity: StudioAssetFindingSeverity,
  messageKo: string,
  messageEn: string,
): StudioAssetPassportIssue {
  return Object.freeze({ code, severity, messageKo, messageEn });
}

function validateQualityDetails(
  type: StudioAssetType,
  details: StudioAssetTypeQuality,
): StudioAssetPassportIssue[] {
  const findings: StudioAssetPassportIssue[] = [];
  const expectedKind = type === "image" ? "image" : type;
  if (details.kind !== expectedKind) {
    findings.push(issue(
      "quality-kind-mismatch",
      "error",
      "에셋 종류와 품질 정보가 서로 맞지 않습니다.",
      "The asset type does not match its quality details.",
    ));
    return findings;
  }
  if (details.kind === "image" && (details.width <= 0 || details.height <= 0)) {
    findings.push(issue("image-size", "error", "이미지 크기가 올바르지 않습니다.", "The image dimensions are invalid."));
  }
  if (details.kind === "3d" && (details.triangles <= 0 || details.textureMaxSize <= 0)) {
    findings.push(issue("3d-metrics", "error", "3D 품질 정보가 부족합니다.", "Required 3D quality metrics are missing."));
  }
  if (details.kind === "font" && details.glyphCount <= 0) {
    findings.push(issue("font-glyphs", "error", "글리프 정보가 올바르지 않습니다.", "The font glyph information is invalid."));
  }
  if (details.kind === "audio" && (details.durationMs <= 0 || details.sampleRate <= 0)) {
    findings.push(issue("audio-metrics", "error", "오디오 품질 정보가 올바르지 않습니다.", "The audio quality metrics are invalid."));
  }
  if (details.kind === "brush" && details.engineIds.length === 0) {
    findings.push(issue("brush-engine", "error", "지원 브러시 엔진 정보가 없습니다.", "No supported brush engine is declared."));
  }
  if (
    details.kind !== "brush"
    && details.kind !== "image"
    && details.kind !== "3d"
    && details.kind !== "font"
    && details.kind !== "audio"
    && details.itemCount <= 0
  ) {
    findings.push(issue("asset-items", "error", "에셋에 사용할 항목이 없습니다.", "The asset package contains no usable items."));
  }
  return findings;
}

export function isStudioAssetType(value: unknown): value is StudioAssetType {
  return typeof value === "string" && ASSET_TYPE_SET.has(value);
}

export function validateStudioAssetPassport(
  passport: StudioAssetPassport,
): readonly StudioAssetPassportIssue[] {
  const findings: StudioAssetPassportIssue[] = [];
  if (passport.schemaVersion !== 1) {
    findings.push(issue("schema", "error", "지원하지 않는 에셋 정보 버전입니다.", "The asset passport schema is unsupported."));
  }
  if (!validId(passport.assetId) || !validId(passport.versionId)) {
    findings.push(issue("identity", "error", "에셋 또는 버전 식별자가 올바르지 않습니다.", "The asset or version identity is invalid."));
  }
  if (!isStudioAssetType(passport.type) || passport.title.trim().length === 0) {
    findings.push(issue("metadata", "error", "에셋 기본 정보가 부족합니다.", "Required asset metadata is missing."));
  }
  if (!validIsoDate(passport.createdAt) || !validIsoDate(passport.updatedAt) || !validIsoDate(passport.source.importedAt)) {
    findings.push(issue("dates", "error", "에셋 날짜 정보가 올바르지 않습니다.", "One or more asset dates are invalid."));
  }
  if (passport.quality.fileSizeBytes <= 0 || passport.quality.checksum.length < 8) {
    findings.push(issue("quality-base", "error", "파일 크기 또는 무결성 정보가 올바르지 않습니다.", "The file size or checksum is invalid."));
  }
  if (passport.quality.status === "rejected") {
    findings.push(issue("quality-rejected", "error", "품질 검사에서 거부된 에셋입니다.", "The asset failed quality admission."));
  } else if (passport.quality.status === "review-needed") {
    findings.push(issue("quality-review", "warning", "사용 전에 품질 확인이 필요합니다.", "Review asset quality before use."));
  }
  findings.push(...validateQualityDetails(passport.type, passport.quality.details));
  if (!passport.rights.verified) {
    findings.push(issue("rights-unverified", "warning", "사용 권리가 아직 확인되지 않았습니다.", "The usage rights have not been verified."));
  }
  if (!validId(passport.rights.licenseId) || passport.rights.licenseName.trim().length === 0) {
    findings.push(issue("license", "error", "라이선스 정보가 부족합니다.", "Required license information is missing."));
  }
  if (passport.rights.attributionRequired && !passport.rights.attributionText?.trim()) {
    findings.push(issue("attribution-text", "error", "필수 출처 표시 문구가 없습니다.", "Required attribution text is missing."));
  }
  if (passport.rights.seatLimit !== undefined && (!Number.isInteger(passport.rights.seatLimit) || passport.rights.seatLimit < 1)) {
    findings.push(issue("seat-limit", "error", "팀 좌석 수 제한이 올바르지 않습니다.", "The seat limit is invalid."));
  }
  if (passport.rights.expiresAt !== undefined && !validIsoDate(passport.rights.expiresAt)) {
    findings.push(issue("rights-expiry", "error", "사용 기한이 올바르지 않습니다.", "The rights expiry date is invalid."));
  }
  if (passport.ai.classification !== "none" && passport.ai.providerIds.length === 0) {
    findings.push(issue("ai-provider", "error", "AI 생성·보조 공급자 정보가 없습니다.", "AI-assisted assets must name a provider."));
  }
  return Object.freeze(findings);
}

function addPermissionFinding(
  findings: StudioAssetPassportIssue[],
  permission: StudioAssetPermission,
  code: string,
  labelKo: string,
  labelEn: string,
): void {
  if (permission === "allowed") return;
  if (permission === "prohibited") {
    findings.push(issue(code, "error", `${labelKo}에는 사용할 수 없습니다.`, `The asset cannot be used for ${labelEn}.`));
    return;
  }
  if (permission === "conditional") {
    findings.push(issue(code, "warning", `${labelKo} 사용 조건을 확인하세요.`, `Review the conditions for ${labelEn}.`));
    return;
  }
  findings.push(issue(code, "warning", `${labelKo} 사용 가능 여부가 확인되지 않았습니다.`, `Permission for ${labelEn} is unknown.`));
}

export function evaluateStudioAssetUsage(
  passport: StudioAssetPassport,
  context: StudioAssetUsageContext,
): StudioAssetUsageDecision {
  const findings = [...validateStudioAssetPassport(passport)];
  const now = context.now ?? new Date().toISOString();
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) {
    findings.push(issue("usage-date", "error", "사용 시점 정보가 올바르지 않습니다.", "The usage date is invalid."));
  }
  if (passport.rights.expiresAt && Number.isFinite(nowTime) && Date.parse(passport.rights.expiresAt) < nowTime) {
    findings.push(issue("rights-expired", "error", "이 에셋의 사용 기한이 지났습니다.", "The asset usage rights have expired."));
  }
  if (passport.rights.seatLimit !== undefined && context.teamSeats > passport.rights.seatLimit) {
    findings.push(issue(
      "seat-limit-exceeded",
      "error",
      `현재 팀 ${context.teamSeats}명은 허용 좌석 ${passport.rights.seatLimit}명을 초과합니다.`,
      `The current team of ${context.teamSeats} exceeds the ${passport.rights.seatLimit}-seat license.`,
    ));
  }
  if (context.commercial) {
    addPermissionFinding(findings, passport.rights.commercialUse, "commercial-use", "상업 작업", "commercial work");
  }
  if (context.modifiesAsset) {
    addPermissionFinding(findings, passport.rights.modification, "modification", "편집·변형", "modification");
  }
  if (context.destination !== "internal") {
    const permissionKey = DESTINATION_PERMISSION[context.destination];
    addPermissionFinding(
      findings,
      passport.rights[permissionKey] as StudioAssetPermission,
      `destination-${context.destination}`,
      context.destination,
      context.destination,
    );
  }
  if (context.deliversSourceFiles) {
    addPermissionFinding(
      findings,
      passport.rights.sourceRedistribution,
      "source-redistribution",
      "원본 파일 전달",
      "source-file delivery",
    );
  }
  if (context.usesAsAiReference) {
    addPermissionFinding(
      findings,
      passport.rights.aiGenerationReference,
      "ai-reference",
      "AI 생성 참조",
      "AI generation reference",
    );
  }
  if (context.usesForAiTraining) {
    addPermissionFinding(findings, passport.rights.aiTraining, "ai-training", "AI 학습", "AI training");
  }
  if (passport.rights.attributionRequired && !context.attributionIncluded) {
    findings.push(issue("attribution-missing", "error", "필수 출처 표시가 누락되었습니다.", "Required attribution is missing."));
  }
  if (
    context.territory
    && passport.rights.territoryRestrictions?.some((territory) => territory === context.territory)
  ) {
    findings.push(issue("territory", "error", "선택한 지역에서는 사용할 수 없습니다.", "The asset cannot be used in the selected territory."));
  }
  if (
    passport.ai.classification !== "none"
    && context.destination !== "internal"
    && !passport.ai.sourceReferencesCleared
  ) {
    findings.push(issue(
      "ai-source-rights",
      "error",
      "AI 참조 원본의 사용 권리가 확인되지 않았습니다.",
      "The rights for AI source references are not cleared.",
    ));
  }
  if (passport.ai.disclosureRequired && context.destination !== "internal") {
    findings.push(issue(
      "ai-disclosure",
      "warning",
      "게시 시 AI 사용 표시가 필요합니다.",
      "AI-use disclosure is required when publishing.",
    ));
  }

  const hasError = findings.some((finding) => finding.severity === "error");
  const hasWarning = findings.some((finding) => finding.severity === "warning");
  const status: StudioAssetDecisionStatus = hasError ? "blocked" : hasWarning ? "warning" : "allowed";
  return Object.freeze({
    status,
    summaryKo: status === "allowed"
      ? "현재 용도로 사용할 수 있습니다."
      : status === "warning"
        ? "사용할 수 있지만 확인할 조건이 있습니다."
        : "현재 용도로는 사용할 수 없습니다.",
    summaryEn: status === "allowed"
      ? "The asset can be used for this purpose."
      : status === "warning"
        ? "The asset can be used after reviewing the conditions."
        : "The asset cannot be used for this purpose.",
    findings: Object.freeze(findings),
  });
}
