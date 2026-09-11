export interface StudioAccessibilityTextNode {
  readonly id: string;
  readonly text: string;
  readonly sizePx: number;
  readonly foreground: string;
  readonly background: string;
  readonly essential: boolean;
}

export interface StudioAccessibilityImageNode {
  readonly id: string;
  readonly decorative: boolean;
  readonly altText: string;
}

export interface StudioAccessibilityInteractiveNode {
  readonly id: string;
  readonly label: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly keyboardReachable: boolean;
}

export interface StudioAccessibilityAudioNode {
  readonly id: string;
  readonly hasSpeechOrMeaningfulSound: boolean;
  readonly captionsComplete: boolean;
  readonly transcriptComplete: boolean;
}

export interface StudioAccessibilitySnapshot {
  readonly textNodes: readonly StudioAccessibilityTextNode[];
  readonly imageNodes: readonly StudioAccessibilityImageNode[];
  readonly interactiveNodes: readonly StudioAccessibilityInteractiveNode[];
  readonly audioNodes: readonly StudioAccessibilityAudioNode[];
  readonly readingOrderIds: readonly string[];
  readonly requiredReadingOrderIds: readonly string[];
}

export interface StudioAccessibilityPolicy {
  readonly minimumTextPx: number;
  readonly minimumContrast: number;
  readonly minimumLargeTextContrast: number;
  readonly largeTextPx: number;
  readonly minimumTouchTargetPx: number;
  readonly requireAltText: boolean;
  readonly requireCaptions: boolean;
  readonly requireReadingOrder: boolean;
}

export interface StudioAccessibilityFinding {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly affectedIds: readonly string[];
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioAccessibilityReport {
  readonly status: "pass" | "warning" | "blocked";
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly findings: readonly StudioAccessibilityFinding[];
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/iu;

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  if (!HEX_PATTERN.test(color)) throw new Error(`Invalid accessibility color: ${color}`);
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return channel(red) * 0.2126 + channel(green) * 0.7152 + channel(blue) * 0.0722;
}

export function studioColorContrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

function finding(
  code: string,
  severity: StudioAccessibilityFinding["severity"],
  affectedIds: readonly string[],
  messageKo: string,
  messageEn: string,
): StudioAccessibilityFinding {
  return Object.freeze({
    code,
    severity,
    affectedIds: Object.freeze([...affectedIds]),
    messageKo,
    messageEn,
  });
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicateIds.add(value);
    else seen.add(value);
  }
  return [...duplicateIds].sort();
}

export function auditStudioAccessibility(
  snapshot: StudioAccessibilitySnapshot,
  policy: StudioAccessibilityPolicy,
): StudioAccessibilityReport {
  if (
    !Number.isFinite(policy.minimumTextPx)
    || policy.minimumTextPx <= 0
    || !Number.isFinite(policy.minimumContrast)
    || policy.minimumContrast <= 1
    || !Number.isFinite(policy.minimumLargeTextContrast)
    || policy.minimumLargeTextContrast <= 1
    || !Number.isFinite(policy.largeTextPx)
    || policy.largeTextPx <= 0
    || !Number.isFinite(policy.minimumTouchTargetPx)
    || policy.minimumTouchTargetPx <= 0
  ) {
    throw new Error("Accessibility policy values must be positive.");
  }
  const findings: StudioAccessibilityFinding[] = [];
  for (const text of snapshot.textNodes) {
    if (!text.id.trim() || !Number.isFinite(text.sizePx) || text.sizePx <= 0) {
      throw new Error("Accessibility text nodes require valid ids and sizes.");
    }
    if (text.essential && !text.text.trim()) {
      findings.push(finding("empty-essential-text", "error", [text.id], "필수 텍스트가 비어 있습니다.", "Essential text is empty."));
    }
    if (text.sizePx < policy.minimumTextPx) {
      findings.push(finding("text-size", "warning", [text.id], "글자가 권장 크기보다 작습니다.", "Text is smaller than the recommended size."));
    }
    const contrast = studioColorContrast(text.foreground, text.background);
    const required = text.sizePx >= policy.largeTextPx
      ? policy.minimumLargeTextContrast
      : policy.minimumContrast;
    if (contrast < required) {
      findings.push(finding("text-contrast", "error", [text.id], "글자와 배경의 대비가 부족합니다.", "Text contrast is insufficient."));
    }
  }
  if (policy.requireAltText) {
    const missing = snapshot.imageNodes
      .filter((image) => !image.decorative && !image.altText.trim())
      .map((image) => image.id);
    if (missing.length > 0) {
      findings.push(finding("alt-text", "warning", missing, "핵심 이미지에 대체 텍스트가 없습니다.", "Essential images are missing alternative text."));
    }
  }
  for (const control of snapshot.interactiveNodes) {
    if (!control.id.trim() || !control.label.trim()) {
      findings.push(finding("control-label", "error", [control.id], "조작 요소에 이름이 없습니다.", "An interactive control has no accessible label."));
    }
    if (
      !Number.isFinite(control.widthPx)
      || !Number.isFinite(control.heightPx)
      || control.widthPx < policy.minimumTouchTargetPx
      || control.heightPx < policy.minimumTouchTargetPx
    ) {
      findings.push(finding("touch-target", "warning", [control.id], "터치 영역이 너무 작습니다.", "The touch target is too small."));
    }
    if (!control.keyboardReachable) {
      findings.push(finding("keyboard", "error", [control.id], "키보드로 조작할 수 없습니다.", "The control is not keyboard reachable."));
    }
  }
  if (policy.requireCaptions) {
    for (const audio of snapshot.audioNodes) {
      if (!audio.hasSpeechOrMeaningfulSound) continue;
      if (!audio.captionsComplete) {
        findings.push(finding("captions", "error", [audio.id], "음성·효과음 자막이 필요합니다.", "Captions are required for meaningful audio."));
      }
      if (!audio.transcriptComplete) {
        findings.push(finding("transcript", "warning", [audio.id], "전체 대본 또는 설명이 필요합니다.", "A complete transcript or description is required."));
      }
    }
  }
  if (policy.requireReadingOrder) {
    const duplicateIds = duplicates(snapshot.readingOrderIds);
    if (duplicateIds.length > 0) {
      findings.push(finding("reading-order-duplicate", "error", duplicateIds, "읽기 순서에 같은 항목이 반복됩니다.", "Reading order contains duplicate items."));
    }
    const order = new Set(snapshot.readingOrderIds);
    const missing = snapshot.requiredReadingOrderIds.filter((id) => !order.has(id));
    if (missing.length > 0) {
      findings.push(finding("reading-order-missing", "error", missing, "읽기 순서에 빠진 항목이 있습니다.", "Reading order is missing required items."));
    }
  }

  const blockingCount = findings.filter((item) => item.severity === "error").length;
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  return Object.freeze({
    status: blockingCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "pass",
    blockingCount,
    warningCount,
    findings: Object.freeze(findings),
  });
}
