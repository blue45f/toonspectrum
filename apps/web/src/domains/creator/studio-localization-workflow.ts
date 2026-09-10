export const STUDIO_LOCALIZATION_STATUSES = [
  "untranslated",
  "ai-draft",
  "translating",
  "review-required",
  "approved",
  "layout-check",
  "complete",
] as const;

export const STUDIO_LOCALIZATION_UNIT_KINDS = [
  "dialogue",
  "narration",
  "sfx",
  "title",
  "caption",
] as const;

export type StudioLocalizationStatus = (typeof STUDIO_LOCALIZATION_STATUSES)[number];
export type StudioLocalizationUnitKind = (typeof STUDIO_LOCALIZATION_UNIT_KINDS)[number];
export type StudioLocalizationQaSeverity = "info" | "warning" | "error";

export interface StudioLocalizationGlossaryMatch {
  readonly sourceTerm: string;
  readonly expectedTarget: string;
  readonly actualTarget: string | null;
  readonly required: boolean;
}

export interface StudioLocalizationBalloonFit {
  readonly availableWidth: number;
  readonly availableHeight: number;
  readonly renderedWidth: number;
  readonly renderedHeight: number;
  readonly minimumFontSize: number;
  readonly actualFontSize: number;
  readonly lineCount: number;
  readonly maxLineCount: number;
}

export interface StudioLocalizationQaFinding {
  readonly code: string;
  readonly severity: StudioLocalizationQaSeverity;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioLocalizationUnit {
  readonly id: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly kind: StudioLocalizationUnitKind;
  readonly sourceText: string;
  readonly translatedText: string;
  readonly speakerId?: string;
  readonly sceneId?: string;
  readonly cutId?: string;
  readonly status: StudioLocalizationStatus;
  readonly glossary: readonly StudioLocalizationGlossaryMatch[];
  readonly sourceRemoved: boolean;
  readonly backgroundRestored: boolean;
  readonly letteringApplied: boolean;
  readonly readingOrderAssigned: boolean;
  readonly fontAvailable: boolean;
  readonly balloonFit?: StudioLocalizationBalloonFit;
  readonly reviewerId?: string;
  readonly approvedAt?: string;
  readonly updatedAt: string;
}

export type StudioLocalizationEvent =
  | { readonly type: "start-ai-draft"; readonly at: string; readonly translatedText: string }
  | { readonly type: "start-translation"; readonly at: string }
  | { readonly type: "update-translation"; readonly at: string; readonly translatedText: string }
  | { readonly type: "request-review"; readonly at: string }
  | { readonly type: "approve"; readonly at: string; readonly reviewerId: string }
  | { readonly type: "request-changes"; readonly at: string }
  | {
      readonly type: "prepare-layout";
      readonly at: string;
      readonly sourceRemoved: boolean;
      readonly backgroundRestored: boolean;
      readonly letteringApplied: boolean;
      readonly readingOrderAssigned: boolean;
      readonly fontAvailable: boolean;
      readonly balloonFit?: StudioLocalizationBalloonFit;
    }
  | { readonly type: "complete"; readonly at: string }
  | { readonly type: "reopen"; readonly at: string };

export interface StudioLocalizationSummary {
  readonly total: number;
  readonly completed: number;
  readonly blocking: number;
  readonly warnings: number;
  readonly progress: number;
  readonly byStatus: Readonly<Record<StudioLocalizationStatus, number>>;
}

const STATUS_SET = new Set<string>(STUDIO_LOCALIZATION_STATUSES);
const KIND_SET = new Set<string>(STUDIO_LOCALIZATION_UNIT_KINDS);

function validId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value.trim() === value
    && value !== "."
    && value !== ".."
    && !value.includes("\\");
}

function validLocale(value: string): boolean {
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(value);
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function finding(
  code: string,
  severity: StudioLocalizationQaSeverity,
  messageKo: string,
  messageEn: string,
): StudioLocalizationQaFinding {
  return Object.freeze({ code, severity, messageKo, messageEn });
}

function assertStatus(
  unit: StudioLocalizationUnit,
  allowed: readonly StudioLocalizationStatus[],
  event: StudioLocalizationEvent["type"],
): void {
  if (!allowed.includes(unit.status)) {
    throw new Error(`Localization event ${event} is not allowed from ${unit.status}.`);
  }
}

function requireTranslation(text: string): string {
  const normalized = text.trim();
  if (!normalized) throw new Error("A translated text value is required.");
  return normalized;
}

function validateFit(fit: StudioLocalizationBalloonFit): void {
  const values = [
    fit.availableWidth,
    fit.availableHeight,
    fit.renderedWidth,
    fit.renderedHeight,
    fit.minimumFontSize,
    fit.actualFontSize,
    fit.lineCount,
    fit.maxLineCount,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Balloon fit metrics must be finite non-negative numbers.");
  }
}

export function isStudioLocalizationStatus(value: unknown): value is StudioLocalizationStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

export function isStudioLocalizationUnitKind(value: unknown): value is StudioLocalizationUnitKind {
  return typeof value === "string" && KIND_SET.has(value);
}

export function createStudioLocalizationUnit(input: Omit<
  StudioLocalizationUnit,
  "status" | "translatedText" | "reviewerId" | "approvedAt"
> & { readonly translatedText?: string }): StudioLocalizationUnit {
  if (
    !validId(input.id)
    || !validLocale(input.sourceLocale)
    || !validLocale(input.targetLocale)
    || input.sourceLocale.toLowerCase() === input.targetLocale.toLowerCase()
    || !isStudioLocalizationUnitKind(input.kind)
    || !input.sourceText.trim()
    || !validDate(input.updatedAt)
  ) {
    throw new Error("Localization unit metadata is invalid.");
  }
  if (input.balloonFit) validateFit(input.balloonFit);
  return Object.freeze({
    ...input,
    sourceText: input.sourceText.trim(),
    translatedText: input.translatedText?.trim() ?? "",
    status: input.translatedText?.trim() ? "translating" : "untranslated",
    glossary: Object.freeze([...input.glossary]),
  });
}

export function evaluateStudioLocalizationQa(
  unit: StudioLocalizationUnit,
): readonly StudioLocalizationQaFinding[] {
  const findings: StudioLocalizationQaFinding[] = [];
  if (!unit.translatedText.trim()) {
    findings.push(finding("missing-translation", "error", "번역문이 없습니다.", "The translation is missing."));
  }
  for (const match of unit.glossary) {
    if (match.required && match.actualTarget !== match.expectedTarget) {
      findings.push(finding(
        `glossary:${match.sourceTerm}`,
        "error",
        `필수 용어 ‘${match.sourceTerm}’의 번역을 확인하세요.`,
        `Check the required translation for “${match.sourceTerm}”.`,
      ));
    } else if (!match.required && match.actualTarget !== match.expectedTarget) {
      findings.push(finding(
        `glossary:${match.sourceTerm}`,
        "warning",
        `권장 용어 ‘${match.sourceTerm}’가 다르게 번역되었습니다.`,
        `The recommended translation for “${match.sourceTerm}” differs.`,
      ));
    }
  }
  if (!unit.readingOrderAssigned) {
    findings.push(finding("reading-order", "error", "읽기 순서가 지정되지 않았습니다.", "Reading order has not been assigned."));
  }
  if (!unit.fontAvailable) {
    findings.push(finding("font-missing", "error", "대상 언어를 지원하는 글꼴이 없습니다.", "No available font supports the target locale."));
  }
  if (unit.kind !== "title" && !unit.sourceRemoved) {
    findings.push(finding("source-not-removed", "error", "원문이 아직 원고에 남아 있습니다.", "Source text remains on the artwork."));
  }
  if (unit.kind !== "title" && !unit.backgroundRestored) {
    findings.push(finding("background-not-restored", "warning", "원문 제거 영역의 배경 복원을 확인하세요.", "Review background restoration behind removed text."));
  }
  if (!unit.letteringApplied) {
    findings.push(finding("lettering-missing", "error", "번역문 레터링이 적용되지 않았습니다.", "Translated lettering has not been applied."));
  }
  if (unit.balloonFit) {
    if (
      unit.balloonFit.renderedWidth > unit.balloonFit.availableWidth
      || unit.balloonFit.renderedHeight > unit.balloonFit.availableHeight
      || unit.balloonFit.lineCount > unit.balloonFit.maxLineCount
    ) {
      findings.push(finding("balloon-overflow", "error", "말풍선에서 글자가 넘칩니다.", "Text overflows the balloon."));
    }
    if (unit.balloonFit.actualFontSize < unit.balloonFit.minimumFontSize) {
      findings.push(finding("font-too-small", "error", "최소 글자 크기보다 작습니다.", "Text is smaller than the minimum font size."));
    }
  }
  return Object.freeze(findings);
}

export function transitionStudioLocalizationUnit(
  unit: StudioLocalizationUnit,
  event: StudioLocalizationEvent,
): StudioLocalizationUnit {
  if (!validDate(event.at)) throw new Error("Localization transitions require a valid timestamp.");
  switch (event.type) {
    case "start-ai-draft": {
      assertStatus(unit, ["untranslated", "translating", "review-required"], event.type);
      return Object.freeze({
        ...unit,
        translatedText: requireTranslation(event.translatedText),
        status: "ai-draft",
        reviewerId: undefined,
        approvedAt: undefined,
        updatedAt: event.at,
      });
    }
    case "start-translation": {
      assertStatus(unit, ["untranslated", "ai-draft", "review-required"], event.type);
      return Object.freeze({
        ...unit,
        status: "translating",
        reviewerId: undefined,
        approvedAt: undefined,
        updatedAt: event.at,
      });
    }
    case "update-translation": {
      assertStatus(unit, ["ai-draft", "translating", "review-required"], event.type);
      return Object.freeze({
        ...unit,
        translatedText: requireTranslation(event.translatedText),
        status: "translating",
        reviewerId: undefined,
        approvedAt: undefined,
        updatedAt: event.at,
      });
    }
    case "request-review": {
      assertStatus(unit, ["ai-draft", "translating"], event.type);
      requireTranslation(unit.translatedText);
      return Object.freeze({ ...unit, status: "review-required", updatedAt: event.at });
    }
    case "approve": {
      assertStatus(unit, ["review-required"], event.type);
      if (!validId(event.reviewerId)) throw new Error("Localization approval requires a reviewer.");
      const translationFindings = evaluateStudioLocalizationQa({
        ...unit,
        sourceRemoved: true,
        backgroundRestored: true,
        letteringApplied: true,
        readingOrderAssigned: true,
        fontAvailable: true,
        balloonFit: undefined,
      });
      if (translationFindings.some((item) => item.code === "missing-translation" || item.code.startsWith("glossary:"))) {
        throw new Error("Localization approval is blocked by translation QA.");
      }
      return Object.freeze({
        ...unit,
        status: "approved",
        reviewerId: event.reviewerId,
        approvedAt: event.at,
        updatedAt: event.at,
      });
    }
    case "request-changes": {
      assertStatus(unit, ["review-required", "approved", "layout-check"], event.type);
      return Object.freeze({
        ...unit,
        status: "translating",
        reviewerId: undefined,
        approvedAt: undefined,
        updatedAt: event.at,
      });
    }
    case "prepare-layout": {
      assertStatus(unit, ["approved", "layout-check"], event.type);
      if (event.balloonFit) validateFit(event.balloonFit);
      return Object.freeze({
        ...unit,
        status: "layout-check",
        sourceRemoved: event.sourceRemoved,
        backgroundRestored: event.backgroundRestored,
        letteringApplied: event.letteringApplied,
        readingOrderAssigned: event.readingOrderAssigned,
        fontAvailable: event.fontAvailable,
        balloonFit: event.balloonFit,
        updatedAt: event.at,
      });
    }
    case "complete": {
      assertStatus(unit, ["layout-check"], event.type);
      const findings = evaluateStudioLocalizationQa(unit);
      if (findings.some((item) => item.severity === "error")) {
        throw new Error("Localization completion is blocked by QA findings.");
      }
      return Object.freeze({ ...unit, status: "complete", updatedAt: event.at });
    }
    case "reopen": {
      assertStatus(unit, ["complete"], event.type);
      return Object.freeze({
        ...unit,
        status: "review-required",
        reviewerId: undefined,
        approvedAt: undefined,
        updatedAt: event.at,
      });
    }
  }
}

const STATUS_PROGRESS: Readonly<Record<StudioLocalizationStatus, number>> = Object.freeze({
  untranslated: 0,
  "ai-draft": 0.2,
  translating: 0.35,
  "review-required": 0.55,
  approved: 0.7,
  "layout-check": 0.9,
  complete: 1,
});

export function summarizeStudioLocalization(
  units: readonly StudioLocalizationUnit[],
): StudioLocalizationSummary {
  const byStatus: Record<StudioLocalizationStatus, number> = {
    untranslated: 0,
    "ai-draft": 0,
    translating: 0,
    "review-required": 0,
    approved: 0,
    "layout-check": 0,
    complete: 0,
  };
  let blocking = 0;
  let warnings = 0;
  let progressTotal = 0;
  for (const unit of units) {
    byStatus[unit.status] += 1;
    progressTotal += STATUS_PROGRESS[unit.status];
    for (const qa of evaluateStudioLocalizationQa(unit)) {
      if (qa.severity === "error") blocking += 1;
      else if (qa.severity === "warning") warnings += 1;
    }
  }
  return Object.freeze({
    total: units.length,
    completed: byStatus.complete,
    blocking,
    warnings,
    progress: units.length === 0 ? 0 : Math.round((progressTotal / units.length) * 1000) / 1000,
    byStatus: Object.freeze(byStatus),
  });
}
