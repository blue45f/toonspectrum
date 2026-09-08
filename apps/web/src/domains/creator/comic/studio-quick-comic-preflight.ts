import { parseDialogueScript, type DialogueLine } from "../studio-dialogue";
import { PANEL_LAYOUTS, type PanelLayoutPreset } from "../studio-panel-layouts";

export const QUICK_COMIC_LONG_DIALOGUE_CHARACTERS = 52;
export const QUICK_COMIC_SPLIT_TARGET_CHARACTERS = 42;

export type QuickComicPreflightSeverity = "blocker" | "warning" | "info";
export type QuickComicPreflightStatus = "blocked" | "review" | "ready";
export type QuickComicPreflightAction =
  | "apply-recommended-layout"
  | "normalize-dialogue"
  | "split-long-dialogue";

export type QuickComicPreflightIssueCode =
  | "assembly-overlap"
  | "empty-page"
  | "layout-dialogue-collision"
  | "long-dialogue"
  | "missing-scene-anchor"
  | "mixed-speaker-labels"
  | "panel-density"
  | "unlabeled-dialogue";

export interface QuickComicPreflightIssue {
  id: string;
  code: QuickComicPreflightIssueCode;
  severity: QuickComicPreflightSeverity;
  title: string;
  detail: string;
  action?: QuickComicPreflightAction;
}

export interface QuickComicDialogueMetrics {
  total: number;
  speech: number;
  narration: number;
  speakerCount: number;
  unlabeledSpeech: number;
  longDialogueCount: number;
  averageCharacters: number;
  maxCharacters: number;
}

export interface QuickComicLayoutRecommendation {
  layoutId: string;
  label: string;
  frameCount: number;
  score: number;
  reason: string;
}

export interface QuickComicPreflightMetrics extends QuickComicDialogueMetrics {
  panelCount: number;
  dialoguePerPanel: number;
  maxDialogueInPanel: number;
}

export interface QuickComicPreflightReport {
  score: number;
  status: QuickComicPreflightStatus;
  statusLabel: string;
  summary: string;
  layoutFitScore: number;
  metrics: QuickComicPreflightMetrics;
  recommendation: QuickComicLayoutRecommendation;
  issues: readonly QuickComicPreflightIssue[];
}

export interface QuickComicPreflightInput {
  layoutId: string;
  sceneTemplateId: string | null;
  dialogueScript: string;
  assemblyComposable?: boolean | null;
}

interface DialogueAnalysis extends QuickComicDialogueMetrics {
  lines: readonly DialogueLine[];
}

const SPEAKER_PREFIX_RE = /^([^:：]{1,16})[:：]\s*(.+)$/u;
const NARRATION_RE = /^[([](.*)[)\]]$/u;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function analyzeDialogue(script: string): DialogueAnalysis {
  const lines = parseDialogueScript(script);
  const speech = lines.filter((line) => line.kind === "speech");
  const narration = lines.length - speech.length;
  const speakers = new Set(
    speech.map((line) => line.speaker.trim()).filter((speaker) => speaker.length > 0),
  );
  const lengths = lines.map((line) => Array.from(line.text.trim()).length);
  const totalCharacters = lengths.reduce((sum, length) => sum + length, 0);

  return {
    lines,
    total: lines.length,
    speech: speech.length,
    narration,
    speakerCount: speakers.size,
    unlabeledSpeech: speech.filter((line) => line.speaker.trim().length === 0).length,
    longDialogueCount: lengths.filter(
      (length) => length > QUICK_COMIC_LONG_DIALOGUE_CHARACTERS,
    ).length,
    averageCharacters:
      lengths.length === 0 ? 0 : Math.round(totalCharacters / lengths.length),
    maxCharacters: lengths.length === 0 ? 0 : Math.max(...lengths),
  };
}

function idealPanelCount(dialogue: DialogueAnalysis): number {
  if (dialogue.total === 0) return 2;
  if (dialogue.total === 1) return 1;
  if (dialogue.total === 2) return 2;
  if (dialogue.total === 3) return 3;
  if (dialogue.total === 4) return 4;
  return 5;
}

function layoutFitScore(
  layout: PanelLayoutPreset,
  dialogue: DialogueAnalysis,
  sceneTemplateId: string | null,
): number {
  const frameCount = Math.max(1, layout.frames.length);
  const targetCount = idealPanelCount(dialogue);
  const maxDialogueInPanel = Math.ceil(dialogue.total / frameCount);
  const minFrameWidth = layout.frames.length === 0
    ? 0
    : Math.min(...layout.frames.map((frame) => frame.width));

  let score = 100 - Math.abs(frameCount - targetCount) * 16;
  score -= Math.max(0, maxDialogueInPanel - 1) * 12;

  if (dialogue.total > 0 && (layout.bubbles?.length ?? 0) > 0) score -= 30;
  if (dialogue.maxCharacters > QUICK_COMIC_LONG_DIALOGUE_CHARACTERS && minFrameWidth < 500) {
    score -= 18;
  }
  if (
    dialogue.maxCharacters >= 36
    && (layout.id === "layout_spread_2" || layout.id === "layout_vertical_2col")
  ) {
    score -= 12;
  }
  if (dialogue.narration > 0 && layout.id === "layout_title_intro") score += 12;
  if (dialogue.total === 1 && layout.id === "layout_single_hero") score += 12;
  if (dialogue.speakerCount >= 2 && dialogue.total <= 3 && layout.id === "layout_two_rows") {
    score += 8;
  }
  if (dialogue.total >= 3 && frameCount >= 3) score += 4;
  if (sceneTemplateId && dialogue.total > 2 && frameCount === 1) score -= 16;
  if (dialogue.narration === 0 && layout.id === "layout_yonkoma_titled") score -= 6;
  if (dialogue.narration === 0 && layout.id === "layout_title_intro") score -= 8;

  return clamp(Math.round(score), 0, 100);
}

function recommendationReason(
  dialogue: DialogueAnalysis,
  recommendation: PanelLayoutPreset,
): string {
  const frameCount = Math.max(1, recommendation.frames.length);
  const maxPerPanel = Math.ceil(dialogue.total / frameCount);

  if (dialogue.total === 0) {
    return "상황과 반응을 이어 붙이기 쉬운 기본 2단 흐름을 유지합니다.";
  }
  if (dialogue.total === 1) {
    return "한 대사의 감정과 장면을 넓게 보여 줄 수 있는 단일 강조 컷입니다.";
  }
  if (dialogue.maxCharacters > QUICK_COMIC_LONG_DIALOGUE_CHARACTERS) {
    return `긴 대사를 ${frameCount}컷에 최대 ${maxPerPanel}개씩 분산하고 좁은 컷을 피합니다.`;
  }
  if (dialogue.narration > dialogue.speech) {
    return `나레이션 ${dialogue.narration}개와 장면 흐름을 함께 읽기 쉬운 ${frameCount}컷 구성입니다.`;
  }
  return `${dialogue.total}개 대사를 ${frameCount}컷에 최대 ${maxPerPanel}개씩 나눠 읽는 리듬을 만듭니다.`;
}

export function recommendQuickComicLayout(
  input: Pick<QuickComicPreflightInput, "dialogueScript" | "sceneTemplateId">,
): QuickComicLayoutRecommendation {
  const dialogue = analyzeDialogue(input.dialogueScript);
  let best = PANEL_LAYOUTS[0]!;
  let bestScore = layoutFitScore(best, dialogue, input.sceneTemplateId);

  for (const layout of PANEL_LAYOUTS.slice(1)) {
    const candidateScore = layoutFitScore(layout, dialogue, input.sceneTemplateId);
    if (candidateScore > bestScore) {
      best = layout;
      bestScore = candidateScore;
    }
  }

  return {
    layoutId: best.id,
    label: best.label,
    frameCount: best.frames.length,
    score: bestScore,
    reason: recommendationReason(dialogue, best),
  };
}

function issuePenalty(severity: QuickComicPreflightSeverity): number {
  if (severity === "blocker") return 38;
  if (severity === "warning") return 12;
  return 3;
}

function reportStatus(
  issues: readonly QuickComicPreflightIssue[],
  score: number,
): QuickComicPreflightStatus {
  if (issues.some((issue) => issue.severity === "blocker")) return "blocked";
  if (issues.some((issue) => issue.severity === "warning") || score < 85) return "review";
  return "ready";
}

function statusCopy(status: QuickComicPreflightStatus): {
  label: string;
  summary: string;
} {
  if (status === "blocked") {
    return {
      label: "적용 전 수정 필요",
      summary: "겹침 위험을 먼저 해결해야 페이지에 안전하게 적용할 수 있습니다.",
    };
  }
  if (status === "review") {
    return {
      label: "검토 권장",
      summary: "페이지는 만들 수 있지만 대사 밀도나 읽기 흐름을 한 번 더 확인해 주세요.",
    };
  }
  return {
    label: "적용 준비 완료",
    summary: "현재 구성은 컷 흐름과 대사 가독성 기준을 통과했습니다.",
  };
}

export function createQuickComicPreflightReport(
  input: QuickComicPreflightInput,
): QuickComicPreflightReport {
  const dialogue = analyzeDialogue(input.dialogueScript);
  const layout = PANEL_LAYOUTS.find((candidate) => candidate.id === input.layoutId)
    ?? PANEL_LAYOUTS[0]!;
  const panelCount = Math.max(1, layout.frames.length);
  const maxDialogueInPanel = Math.ceil(dialogue.total / panelCount);
  const recommendation = recommendQuickComicLayout(input);
  const currentLayoutFit = layoutFitScore(layout, dialogue, input.sceneTemplateId);
  const issues: QuickComicPreflightIssue[] = [];

  if (input.assemblyComposable === false) {
    issues.push({
      id: "assembly-overlap",
      code: "assembly-overlap",
      severity: "blocker",
      title: "컷 안에서 요소가 겹칠 수 있어요",
      detail: "현재 장면·말풍선 조합은 안전 배치를 만들지 못했습니다. 추천 레이아웃을 적용하거나 장면 대상 컷과 대사 길이를 조정하세요.",
      ...(recommendation.layoutId !== layout.id
        ? { action: "apply-recommended-layout" as const }
        : {}),
    });
  }

  if (dialogue.total === 0 && input.sceneTemplateId === null) {
    issues.push({
      id: "empty-page",
      code: "empty-page",
      severity: "info",
      title: "빈 컷으로 시작합니다",
      detail: "레이아웃만 만든 뒤 캔버스에서 직접 장면과 말풍선을 추가할 수 있습니다.",
    });
  }

  if (dialogue.total > 0 && (layout.bubbles?.length ?? 0) > 0) {
    issues.push({
      id: "layout-dialogue-collision",
      code: "layout-dialogue-collision",
      severity: "warning",
      title: "기본 말풍선과 입력 대사가 함께 배치돼요",
      detail: "말풍선이 포함된 프리셋은 입력 대사와 공간을 경쟁합니다. 빈 컷 기반 추천 레이아웃이 더 안전합니다.",
      action: "apply-recommended-layout",
    });
  }

  if (maxDialogueInPanel >= 3) {
    issues.push({
      id: "panel-density",
      code: "panel-density",
      severity: "warning",
      title: "한 컷에 대사가 몰립니다",
      detail: `${dialogue.total}개 대사가 ${panelCount}컷에 최대 ${maxDialogueInPanel}개씩 들어갑니다. 컷을 늘리면 시선 흐름이 안정됩니다.`,
      ...(recommendation.layoutId !== layout.id
        ? { action: "apply-recommended-layout" as const }
        : {}),
    });
  }

  if (dialogue.longDialogueCount > 0) {
    issues.push({
      id: "long-dialogue",
      code: "long-dialogue",
      severity: "warning",
      title: "긴 말풍선이 있어요",
      detail: `${QUICK_COMIC_LONG_DIALOGUE_CHARACTERS}자를 넘는 대사 ${dialogue.longDialogueCount}개가 있습니다. 가장 긴 대사는 ${dialogue.maxCharacters}자입니다.`,
      action: "split-long-dialogue",
    });
  }

  if (dialogue.speakerCount > 0 && dialogue.unlabeledSpeech > 0) {
    issues.push({
      id: "mixed-speaker-labels",
      code: "mixed-speaker-labels",
      severity: "warning",
      title: "화자 표기가 섞여 있어요",
      detail: `화자 미지정 대사 ${dialogue.unlabeledSpeech}개는 직전 말풍선 반대편에 놓입니다. 같은 인물의 좌우를 유지하려면 이름을 붙이세요.`,
    });
  } else if (dialogue.speakerCount === 0 && dialogue.speech >= 3) {
    issues.push({
      id: "unlabeled-dialogue",
      code: "unlabeled-dialogue",
      severity: "info",
      title: "대사가 좌우로 번갈아 배치됩니다",
      detail: "화자 이름이 없으므로 말풍선이 자동으로 좌우 교차됩니다. 인물별 위치를 고정하려면 ‘이름: 대사’ 형식을 사용하세요.",
    });
  }

  if (input.sceneTemplateId === null && dialogue.total >= 4) {
    issues.push({
      id: "missing-scene-anchor",
      code: "missing-scene-anchor",
      severity: "info",
      title: "대사 중심 페이지입니다",
      detail: "장면 연출 없이 말풍선만 배치됩니다. 강조 컷이 필요하면 이전 단계에서 장면 템플릿을 선택하세요.",
    });
  }

  const issueScore = issues.reduce((score, issue) => score - issuePenalty(issue.severity), 100);
  const recommendationGap = Math.max(0, recommendation.score - currentLayoutFit);
  const score = clamp(Math.round(issueScore - Math.min(18, recommendationGap / 2)), 0, 100);
  const status = reportStatus(issues, score);
  const copy = statusCopy(status);

  return {
    score,
    status,
    statusLabel: copy.label,
    summary: copy.summary,
    layoutFitScore: currentLayoutFit,
    metrics: {
      total: dialogue.total,
      speech: dialogue.speech,
      narration: dialogue.narration,
      speakerCount: dialogue.speakerCount,
      unlabeledSpeech: dialogue.unlabeledSpeech,
      longDialogueCount: dialogue.longDialogueCount,
      averageCharacters: dialogue.averageCharacters,
      maxCharacters: dialogue.maxCharacters,
      panelCount,
      dialoguePerPanel:
        dialogue.total === 0 ? 0 : Math.round((dialogue.total / panelCount) * 10) / 10,
      maxDialogueInPanel,
    },
    recommendation,
    issues,
  };
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function normalizeQuickComicDialogueScript(script: string): string {
  const normalized: string[] = [];

  for (const raw of script.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const narration = NARRATION_RE.exec(line);
    if (narration) {
      normalized.push(`[${normalizedText(narration[1] ?? "")}]`);
      continue;
    }
    const speaker = SPEAKER_PREFIX_RE.exec(line);
    if (speaker) {
      normalized.push(`${normalizedText(speaker[1] ?? "")}: ${normalizedText(speaker[2] ?? "")}`);
      continue;
    }
    normalized.push(normalizedText(line));
  }

  return normalized.join("\n");
}

function splitTextAtNaturalBoundary(text: string, maxCharacters: number): string[] {
  const chunks: string[] = [];
  let rest = normalizedText(text);
  const minimumSoftCut = Math.max(8, Math.floor(maxCharacters * 0.55));

  while (Array.from(rest).length > maxCharacters) {
    const characters = Array.from(rest);
    let cut = maxCharacters;
    for (let index = maxCharacters; index >= minimumSoftCut; index -= 1) {
      if (/[\s,.!?…。！？]/u.test(characters[index - 1] ?? "")) {
        cut = index;
        break;
      }
    }
    const chunk = characters.slice(0, cut).join("").trim();
    rest = characters.slice(cut).join("").trim();
    if (chunk) chunks.push(chunk);
  }

  if (rest) chunks.push(rest);
  return chunks;
}

export function splitLongQuickComicDialogueScript(
  script: string,
  maxCharacters = QUICK_COMIC_SPLIT_TARGET_CHARACTERS,
): string {
  const normalized = normalizeQuickComicDialogueScript(script);
  if (!normalized) return "";
  const safeMax = clamp(Math.trunc(maxCharacters), 18, 80);
  const splitLines: string[] = [];

  for (const line of normalized.split("\n")) {
    const narration = NARRATION_RE.exec(line);
    if (narration) {
      for (const chunk of splitTextAtNaturalBoundary(narration[1] ?? "", safeMax)) {
        splitLines.push(`[${chunk}]`);
      }
      continue;
    }
    const speaker = SPEAKER_PREFIX_RE.exec(line);
    if (speaker) {
      const name = normalizedText(speaker[1] ?? "");
      for (const chunk of splitTextAtNaturalBoundary(speaker[2] ?? "", safeMax)) {
        splitLines.push(`${name}: ${chunk}`);
      }
      continue;
    }
    splitLines.push(...splitTextAtNaturalBoundary(line, safeMax));
  }

  return splitLines.join("\n");
}
