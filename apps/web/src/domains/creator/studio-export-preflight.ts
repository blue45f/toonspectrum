export const STUDIO_EXPORT_TARGETS = [
  "webtoon-platform",
  "social",
  "print",
  "image-pdf",
  "editable",
  "ebook",
  "video",
  "archive",
] as const;

export type StudioExportTargetId = (typeof STUDIO_EXPORT_TARGETS)[number];
export type StudioExportPreflightSeverity = "info" | "warning" | "error";
export type StudioExportPreflightStatus = "pass" | "warning" | "blocked";

export interface StudioExportTargetProfile {
  readonly id: StudioExportTargetId;
  readonly policyVersion: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly allowedFormats: readonly string[];
  readonly exactWidth?: number;
  readonly maxWidth?: number;
  readonly maxSegmentHeight?: number;
  readonly maxFileSizeBytes?: number;
  readonly minimumDpi?: number;
  readonly allowedColorSpaces?: readonly string[];
  readonly minimumTextPx?: number;
  readonly requireReadingOrder: boolean;
  readonly requireRightsClearance: boolean;
  readonly requireAiDisclosure: boolean;
  readonly requireAltText: boolean;
  readonly requireCaptions: boolean;
  readonly preserveEditableStructure: boolean;
}

export interface StudioExportDocumentSnapshot {
  readonly documentId: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly segmentHeights: readonly number[];
  readonly estimatedFileSizeBytes: number;
  readonly dpi: number | null;
  readonly colorSpace: string;
  readonly minimumTextPx: number | null;
  readonly missingFontIds: readonly string[];
  readonly missingAssetIds: readonly string[];
  readonly rightsBlockedAssetIds: readonly string[];
  readonly rightsWarningAssetIds: readonly string[];
  readonly aiGeneratedObjectIds: readonly string[];
  readonly aiDisclosurePrepared: boolean;
  readonly readingOrderComplete: boolean;
  readonly altTextCoverage: number;
  readonly captionsComplete: boolean;
  readonly editableStructurePreserved: boolean;
  readonly localizationBlockingIssues: number;
  readonly unresolvedComments: number;
}

export interface StudioExportPreflightFinding {
  readonly code: string;
  readonly severity: StudioExportPreflightSeverity;
  readonly messageKo: string;
  readonly messageEn: string;
  readonly suggestedActionKo: string;
  readonly suggestedActionEn: string;
  readonly affectedIds: readonly string[];
}

export interface StudioExportPreflightResult {
  readonly target: StudioExportTargetId;
  readonly policyVersion: string;
  readonly status: StudioExportPreflightStatus;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly findings: readonly StudioExportPreflightFinding[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

function profile(
  value: StudioExportTargetProfile,
): StudioExportTargetProfile {
  return Object.freeze({
    ...value,
    allowedFormats: Object.freeze([...value.allowedFormats]),
    ...(value.allowedColorSpaces
      ? { allowedColorSpaces: Object.freeze([...value.allowedColorSpaces]) }
      : {}),
  });
}

export const STUDIO_EXPORT_TARGET_PROFILES: Readonly<
  Record<StudioExportTargetId, StudioExportTargetProfile>
> = Object.freeze({
  "webtoon-platform": profile({
    id: "webtoon-platform",
    policyVersion: "2026-09",
    labelKo: "웹툰 플랫폼",
    labelEn: "Webtoon platform",
    allowedFormats: ["png", "jpg", "jpeg", "webp"],
    exactWidth: 800,
    maxSegmentHeight: 12_800,
    maxFileSizeBytes: 20 * MIB,
    allowedColorSpaces: ["srgb"],
    minimumTextPx: 18,
    requireReadingOrder: true,
    requireRightsClearance: true,
    requireAiDisclosure: true,
    requireAltText: false,
    requireCaptions: false,
    preserveEditableStructure: false,
  }),
  social: profile({
    id: "social",
    policyVersion: "2026-09",
    labelKo: "SNS",
    labelEn: "Social",
    allowedFormats: ["png", "jpg", "jpeg", "webp", "mp4"],
    maxWidth: 4096,
    maxFileSizeBytes: 100 * MIB,
    allowedColorSpaces: ["srgb"],
    minimumTextPx: 16,
    requireReadingOrder: false,
    requireRightsClearance: true,
    requireAiDisclosure: true,
    requireAltText: true,
    requireCaptions: true,
    preserveEditableStructure: false,
  }),
  print: profile({
    id: "print",
    policyVersion: "2026-09",
    labelKo: "인쇄",
    labelEn: "Print",
    allowedFormats: ["pdf", "tif", "tiff", "psd"],
    maxFileSizeBytes: 2 * GIB,
    minimumDpi: 300,
    allowedColorSpaces: ["cmyk", "gray"],
    minimumTextPx: 12,
    requireReadingOrder: false,
    requireRightsClearance: true,
    requireAiDisclosure: false,
    requireAltText: false,
    requireCaptions: false,
    preserveEditableStructure: false,
  }),
  "image-pdf": profile({
    id: "image-pdf",
    policyVersion: "2026-09",
    labelKo: "이미지·PDF",
    labelEn: "Image & PDF",
    allowedFormats: ["png", "jpg", "jpeg", "webp", "pdf", "svg"],
    maxWidth: 65_535,
    maxFileSizeBytes: 2 * GIB,
    allowedColorSpaces: ["srgb", "display-p3", "cmyk", "gray"],
    minimumTextPx: 12,
    requireReadingOrder: false,
    requireRightsClearance: true,
    requireAiDisclosure: false,
    requireAltText: false,
    requireCaptions: false,
    preserveEditableStructure: false,
  }),
  editable: profile({
    id: "editable",
    policyVersion: "2026-09",
    labelKo: "다른 편집기",
    labelEn: "Editable handoff",
    allowedFormats: ["psd", "ora", "svg", "pptx", "json"],
    maxFileSizeBytes: 4 * GIB,
    allowedColorSpaces: ["srgb", "display-p3", "cmyk", "gray"],
    requireReadingOrder: false,
    requireRightsClearance: true,
    requireAiDisclosure: false,
    requireAltText: false,
    requireCaptions: false,
    preserveEditableStructure: true,
  }),
  ebook: profile({
    id: "ebook",
    policyVersion: "2026-09",
    labelKo: "전자책",
    labelEn: "E-book",
    allowedFormats: ["epub", "pdf"],
    maxFileSizeBytes: 2 * GIB,
    allowedColorSpaces: ["srgb"],
    minimumTextPx: 16,
    requireReadingOrder: true,
    requireRightsClearance: true,
    requireAiDisclosure: true,
    requireAltText: true,
    requireCaptions: true,
    preserveEditableStructure: false,
  }),
  video: profile({
    id: "video",
    policyVersion: "2026-09",
    labelKo: "영상",
    labelEn: "Video",
    allowedFormats: ["mp4", "webm", "gif"],
    maxWidth: 7680,
    maxFileSizeBytes: 8 * GIB,
    allowedColorSpaces: ["srgb", "display-p3", "rec709"],
    minimumTextPx: 18,
    requireReadingOrder: false,
    requireRightsClearance: true,
    requireAiDisclosure: true,
    requireAltText: false,
    requireCaptions: true,
    preserveEditableStructure: false,
  }),
  archive: profile({
    id: "archive",
    policyVersion: "2026-09",
    labelKo: "완전한 백업",
    labelEn: "Complete archive",
    allowedFormats: ["zip", "toonstudio", "json"],
    maxFileSizeBytes: 16 * GIB,
    allowedColorSpaces: ["srgb", "display-p3", "cmyk", "gray", "rec709"],
    requireReadingOrder: false,
    requireRightsClearance: false,
    requireAiDisclosure: false,
    requireAltText: false,
    requireCaptions: false,
    preserveEditableStructure: true,
  }),
});

function finding(
  code: string,
  severity: StudioExportPreflightSeverity,
  messageKo: string,
  messageEn: string,
  suggestedActionKo: string,
  suggestedActionEn: string,
  affectedIds: readonly string[] = [],
): StudioExportPreflightFinding {
  return Object.freeze({
    code,
    severity,
    messageKo,
    messageEn,
    suggestedActionKo,
    suggestedActionEn,
    affectedIds: Object.freeze([...affectedIds]),
  });
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validateSnapshot(document: StudioExportDocumentSnapshot): void {
  const counts = [document.localizationBlockingIssues, document.unresolvedComments];
  if (
    !document.documentId.trim()
    || !document.format.trim()
    || !validPositive(document.width)
    || !validPositive(document.height)
    || !validPositive(document.estimatedFileSizeBytes)
    || !Number.isFinite(document.altTextCoverage)
    || document.altTextCoverage < 0
    || document.altTextCoverage > 1
    || counts.some((value) => !Number.isInteger(value) || value < 0)
  ) {
    throw new Error("Export preflight requires a valid document snapshot.");
  }
}

export function studioExportTargetProfile(
  target: StudioExportTargetId,
): StudioExportTargetProfile {
  const targetProfile = STUDIO_EXPORT_TARGET_PROFILES[target];
  if (!targetProfile) throw new Error(`Unknown Studio export target: ${target}`);
  return targetProfile;
}

export function runStudioExportPreflight(
  target: StudioExportTargetId,
  document: StudioExportDocumentSnapshot,
): StudioExportPreflightResult {
  const targetProfile = studioExportTargetProfile(target);
  validateSnapshot(document);

  const findings: StudioExportPreflightFinding[] = [];
  const format = document.format.toLowerCase();
  if (!targetProfile.allowedFormats.includes(format)) {
    findings.push(finding(
      "format",
      "error",
      `${targetProfile.labelKo}에서 ${format.toUpperCase()} 형식을 사용할 수 없습니다.`,
      `${format.toUpperCase()} is not supported for ${targetProfile.labelEn}.`,
      "지원 형식으로 변경하세요.",
      "Choose a supported output format.",
    ));
  }

  const exactWidth = targetProfile.exactWidth;
  const maxWidth = targetProfile.maxWidth;
  if (exactWidth !== undefined && document.width !== exactWidth) {
    findings.push(finding(
      "width-exact",
      "error",
      `가로 폭을 ${exactWidth}px로 맞춰야 합니다.`,
      `The document width must be ${exactWidth}px.`,
      "안전한 비율로 자동 크기 조정을 실행하세요.",
      "Run safe automatic resizing.",
    ));
  } else if (maxWidth !== undefined && document.width > maxWidth) {
    findings.push(finding(
      "width-max",
      "error",
      `가로 폭이 최대 ${maxWidth}px를 넘습니다.`,
      `The document exceeds the ${maxWidth}px width limit.`,
      "대상 규격에 맞게 축소하세요.",
      "Resize to the destination limit.",
    ));
  }

  const maxSegmentHeight = targetProfile.maxSegmentHeight;
  if (
    maxSegmentHeight !== undefined
    && document.segmentHeights.some((height) => height > maxSegmentHeight)
  ) {
    findings.push(finding(
      "segment-height",
      "error",
      `분할 이미지 중 최대 ${maxSegmentHeight}px를 넘는 항목이 있습니다.`,
      `One or more segments exceed ${maxSegmentHeight}px.`,
      "원고를 안전한 위치에서 다시 분할하세요.",
      "Split the manuscript again at safe boundaries.",
    ));
  }
  if (document.segmentHeights.some((height) => !validPositive(height))) {
    findings.push(finding(
      "segment-invalid",
      "error",
      "분할 이미지 높이 정보가 올바르지 않습니다.",
      "One or more segment heights are invalid.",
      "출력 분할을 다시 계산하세요.",
      "Recalculate output segmentation.",
    ));
  }

  const maxFileSizeBytes = targetProfile.maxFileSizeBytes;
  if (maxFileSizeBytes !== undefined && document.estimatedFileSizeBytes > maxFileSizeBytes) {
    findings.push(finding(
      "file-size",
      "error",
      "예상 파일 용량이 대상 제한을 넘습니다.",
      "The estimated file size exceeds the destination limit.",
      "화질을 유지하는 최적화를 적용하거나 파일을 분할하세요.",
      "Optimize without visible quality loss or split the output.",
    ));
  }

  const minimumDpi = targetProfile.minimumDpi;
  if (minimumDpi !== undefined && (document.dpi === null || document.dpi < minimumDpi)) {
    findings.push(finding(
      "dpi",
      "error",
      `최소 ${minimumDpi} DPI가 필요합니다.`,
      `At least ${minimumDpi} DPI is required.`,
      "출력 해상도와 실제 인쇄 크기를 다시 확인하세요.",
      "Review output resolution and physical print size.",
    ));
  }

  const allowedColorSpaces = targetProfile.allowedColorSpaces;
  if (
    allowedColorSpaces
    && !allowedColorSpaces
      .map((value) => value.toLowerCase())
      .includes(document.colorSpace.toLowerCase())
  ) {
    findings.push(finding(
      "color-space",
      "error",
      `색 공간 ${document.colorSpace}은(는) 이 대상에 맞지 않습니다.`,
      `The ${document.colorSpace} color space is not valid for this target.`,
      "미리보기 후 대상 색 공간으로 변환하세요.",
      "Preview and convert to a supported color space.",
    ));
  }

  const minimumTextPx = targetProfile.minimumTextPx;
  if (
    minimumTextPx !== undefined
    && document.minimumTextPx !== null
    && document.minimumTextPx < minimumTextPx
  ) {
    findings.push(finding(
      "text-size",
      "warning",
      `일부 글자가 권장 크기 ${minimumTextPx}px보다 작습니다.`,
      `Some text is smaller than the recommended ${minimumTextPx}px.`,
      "휴대폰·출력 미리보기에서 가독성을 확인하세요.",
      "Review readability in device or print preview.",
    ));
  }

  if (document.missingFontIds.length > 0) {
    findings.push(finding(
      "missing-fonts",
      "error",
      "사용할 수 없는 글꼴이 있습니다.",
      "One or more fonts are unavailable.",
      "글꼴을 활성화하거나 안전한 대체 글꼴을 선택하세요.",
      "Activate the fonts or choose safe replacements.",
      document.missingFontIds,
    ));
  }
  if (document.missingAssetIds.length > 0) {
    findings.push(finding(
      "missing-assets",
      "error",
      "연결이 끊긴 에셋이 있습니다.",
      "One or more linked assets are missing.",
      "원본을 다시 연결하거나 프로젝트에 포함하세요.",
      "Relink or embed the original assets.",
      document.missingAssetIds,
    ));
  }
  if (targetProfile.requireRightsClearance && document.rightsBlockedAssetIds.length > 0) {
    findings.push(finding(
      "rights-blocked",
      "error",
      "현재 사용 목적이 허용되지 않는 에셋이 있습니다.",
      "Some assets are not licensed for this destination.",
      "에셋을 교체하거나 필요한 라이선스를 확보하세요.",
      "Replace the assets or obtain the required license.",
      document.rightsBlockedAssetIds,
    ));
  }
  if (targetProfile.requireRightsClearance && document.rightsWarningAssetIds.length > 0) {
    findings.push(finding(
      "rights-warning",
      "warning",
      "사용 조건을 확인해야 하는 에셋이 있습니다.",
      "Some assets have conditions that require review.",
      "출처 표시·좌석·용도 조건을 확인하세요.",
      "Review attribution, seats and usage conditions.",
      document.rightsWarningAssetIds,
    ));
  }
  if (
    targetProfile.requireAiDisclosure
    && document.aiGeneratedObjectIds.length > 0
    && !document.aiDisclosurePrepared
  ) {
    findings.push(finding(
      "ai-disclosure",
      "error",
      "필요한 AI 사용 표시가 준비되지 않았습니다.",
      "Required AI-use disclosure has not been prepared.",
      "대상 플랫폼 정책에 맞는 표시를 추가하세요.",
      "Add disclosure required by the destination policy.",
      document.aiGeneratedObjectIds,
    ));
  }
  if (targetProfile.requireReadingOrder && !document.readingOrderComplete) {
    findings.push(finding(
      "reading-order",
      "error",
      "읽기 순서가 완성되지 않았습니다.",
      "Reading order is incomplete.",
      "컷·말풍선·대체 텍스트 순서를 검토하세요.",
      "Review panel, balloon and alternative-text order.",
    ));
  }
  if (targetProfile.requireAltText && document.altTextCoverage < 1) {
    findings.push(finding(
      "alt-text",
      "warning",
      "모든 핵심 이미지에 대체 텍스트가 없습니다.",
      "Not every essential image has alternative text.",
      "자동 초안을 검토해 대체 텍스트를 완성하세요.",
      "Review generated drafts and complete alternative text.",
    ));
  }
  if (targetProfile.requireCaptions && !document.captionsComplete) {
    findings.push(finding(
      "captions",
      "warning",
      "음성·효과음 자막이 완성되지 않았습니다.",
      "Voice and sound captions are incomplete.",
      "자막과 화자 정보를 검토하세요.",
      "Review captions and speaker information.",
    ));
  }
  if (targetProfile.preserveEditableStructure && !document.editableStructurePreserved) {
    findings.push(finding(
      "editable-structure",
      "error",
      "레이어·텍스트·컴포넌트 구조가 유지되지 않습니다.",
      "Layers, text or component structure will not be preserved.",
      "호환성 보고서에서 손실 항목을 해결하거나 이미지 출력으로 전환하세요.",
      "Resolve compatibility losses or switch to flattened output.",
    ));
  }
  if (document.localizationBlockingIssues > 0) {
    findings.push(finding(
      "localization",
      "error",
      `현지화 오류 ${document.localizationBlockingIssues}건이 남아 있습니다.`,
      `${document.localizationBlockingIssues} blocking localization issues remain.`,
      "번역·레터링·말풍선 맞춤 검사를 완료하세요.",
      "Complete translation, lettering and balloon-fit checks.",
    ));
  }
  if (document.unresolvedComments > 0) {
    findings.push(finding(
      "unresolved-comments",
      "warning",
      `해결되지 않은 검토 댓글 ${document.unresolvedComments}건이 있습니다.`,
      `${document.unresolvedComments} review comments remain unresolved.`,
      "의도된 미해결 항목인지 확인하세요.",
      "Confirm that the remaining comments are intentionally unresolved.",
    ));
  }

  const blockingCount = findings.filter((item) => item.severity === "error").length;
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  const status: StudioExportPreflightStatus = blockingCount > 0
    ? "blocked"
    : warningCount > 0
      ? "warning"
      : "pass";

  return Object.freeze({
    target,
    policyVersion: targetProfile.policyVersion,
    status,
    blockingCount,
    warningCount,
    findings: Object.freeze(findings),
    summaryKo: status === "pass"
      ? "내보낼 준비가 되었습니다."
      : status === "warning"
        ? "내보낼 수 있지만 확인할 항목이 있습니다."
        : "먼저 해결해야 할 항목이 있습니다.",
    summaryEn: status === "pass"
      ? "Ready to export."
      : status === "warning"
        ? "The document can be exported after reviewing warnings."
        : "Resolve the blocking issues before export.",
  });
}
