import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  MapPin,
  X,
  XCircle,
} from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import type {
  StudioContinuityIssue,
  StudioContinuityIssueCode,
  StudioContinuitySeverity,
} from "./studio-continuity";

const ISSUE_LABELS: Readonly<Record<StudioContinuityIssueCode, string>> = {
  DUPLICATE_CHARACTER_NAME: "캐릭터 이름 중복",
  MISSING_CHARACTER_APPEARANCE: "외형 정보 누락",
  MISSING_CHARACTER_VOICE: "말투 정보 누락",
  MISSING_CHARACTER_GOAL: "목표 정보 누락",
  UNKNOWN_CHARACTER: "미등록 캐릭터",
  LOCATION_CONTINUITY_CONTRADICTION: "장소 전환",
  TIME_CONTINUITY_CONTRADICTION: "시간 전환",
  COSTUME_CONTINUITY_CONTRADICTION: "의상 전환",
  PROP_CONTINUITY_CONTRADICTION: "소품 상태 전환",
};

const SEVERITY_META: Readonly<
  Record<
    StudioContinuitySeverity,
    {
      label: string;
      description: string;
    }
  >
> = {
  error: {
    label: "오류",
    description: "바이블 등록이나 캐릭터 식별을 먼저 바로잡아야 합니다.",
  },
  warning: {
    label: "경고",
    description: "의도한 변화라면 장면 비트에 전환 설명을 남겨 주세요.",
  },
};

const SEVERITY_ORDER: readonly StudioContinuitySeverity[] = ["error", "warning"];

export interface StudioContinuityScene {
  id: string;
  label: string;
}

export interface StudioContinuityPanelProps {
  open: boolean;
  onClose: () => void;
  issues: readonly StudioContinuityIssue[];
  /** 장면 id를 사용자용 이름으로 바꿀 때 사용합니다. 같은 id가 scenes에도 있으면 이 값이 우선합니다. */
  sceneLabels?: Readonly<Record<string, string>>;
  /** 장면 id/이름 목록. sceneLabels 대신 전달할 수 있습니다. */
  scenes?: readonly StudioContinuityScene[];
  /** 전달하면 장면 참조가 이동 버튼으로 렌더링됩니다. */
  onSelectScene?: (sceneId: string) => void;
}

function resolveSceneLabel(
  sceneId: string,
  sceneLabels: Readonly<Record<string, string>> | undefined,
  scenes: readonly StudioContinuityScene[] | undefined
): string {
  const mapped = sceneLabels?.[sceneId]?.trim();
  if (mapped) return mapped;
  const listed = scenes?.find((scene) => scene.id === sceneId)?.label.trim();
  return listed || sceneId;
}

interface SceneReferenceProps {
  sceneId: string;
  label: string;
  onSelectScene?: (sceneId: string) => void;
}

function SceneReference({ sceneId, label, onSelectScene }: SceneReferenceProps) {
  const content = (
    <>
      <MapPin size={11} aria-hidden />
      <span className="max-w-44 truncate">{label}</span>
    </>
  );

  if (!onSelectScene) {
    return (
      <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-line bg-panel px-2.5 text-[0.68rem] font-semibold text-fg-2">
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectScene(sceneId)}
      aria-label={`${label} 장면으로 이동`}
      className="inline-flex min-h-7 items-center gap-1 rounded-full border border-line bg-panel px-2.5 text-[0.68rem] font-semibold text-fg-2 transition-colors duration-200 hover:border-accent/55 hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/65"
    >
      {content}
    </button>
  );
}

export function StudioContinuityPanel({
  open,
  onClose,
  issues,
  sceneLabels,
  scenes,
  onSelectScene,
}: StudioContinuityPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const hasIssues = issues.length > 0;
  const hasStructuredScenes = (scenes?.length ?? 0) > 0 || Object.keys(sceneLabels ?? {}).length > 0;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-continuity-title"
      aria-describedby="studio-continuity-description"
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
    >
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <ListChecks size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="studio-continuity-title" className="text-base font-bold tracking-tight text-fg">
              이야기 연속성 검사
            </h2>
            <p
              id="studio-continuity-description"
              className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-fg-2"
            >
              캐릭터 바이블과 장면 비트에 적힌 구조화 값만 정규화해 정확히 비교합니다. 자유문장의 의미를 추측하지 않아요.
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-1.5 sm:flex" aria-label="연속성 검사 요약">
            <span className="rounded-full border border-bad/35 bg-bad/10 px-2 py-1 text-[0.68rem] font-semibold text-bad">
              오류 {errorCount}
            </span>
            <span className="rounded-full border border-warning/35 bg-warning-soft/20 px-2 py-1 text-[0.68rem] font-semibold text-warning">
              경고 {warningCount}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="이야기 연속성 검사 닫기"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-2 transition-colors duration-200 hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/65"
          >
            <X size={15} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              hasIssues
                ? "border-warning/30 bg-warning-soft/15"
                : hasStructuredScenes
                  ? "border-good/35 bg-good/10"
                  : "border-line bg-card/45"
            }`}
            role="status"
          >
            {hasIssues ? (
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            ) : !hasStructuredScenes ? (
              <ListChecks size={18} className="mt-0.5 shrink-0 text-fg-2" aria-hidden />
            ) : (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-good" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-fg">
                {hasIssues
                  ? `확인할 연속성 항목이 ${issues.length}개 있어요`
                  : hasStructuredScenes
                    ? "구조화된 연속성 검사를 통과했어요"
                    : "검사할 이야기 비트가 아직 없어요"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-fg-2">
                {hasIssues
                  ? `오류 ${errorCount}개 · 경고 ${warningCount}개. ${
                      onSelectScene ? "장면 참조를 눌러 입력값을 확인하세요." : "관련 장면과 입력값을 확인하세요."
                    }`
                  : hasStructuredScenes
                    ? "현재 바이블과 장면 비트 사이에서 정확 일치 규칙에 어긋난 값이 없습니다."
                    : "AI 시나리오 초안을 적용하거나, 프레임 속성에서 이야기 메타를 추가해 주세요."}
              </p>
            </div>
          </div>

          <p className="mt-3 rounded-lg border border-line bg-card/45 px-3 py-2 text-[0.72rem] leading-relaxed text-fg-2">
            장소·시간·의상·소품이 달라지는 것이 의도라면, 바뀐 장면의 <strong className="font-semibold text-fg">전환 설명</strong>에 이유를 적어 주세요. 설명이 있는 변화는 모순으로 표시하지 않습니다.
          </p>

          {!hasIssues ? (
            <div className="grid min-h-56 place-items-center px-4 text-center">
              <div className="max-w-sm">
                {hasStructuredScenes ? (
                  <CheckCircle2 size={28} className="mx-auto text-good" aria-hidden />
                ) : (
                  <ListChecks size={28} className="mx-auto text-fg-2" aria-hidden />
                )}
                <p className="mt-3 text-sm font-semibold text-fg">
                  {hasStructuredScenes ? "장면 사이의 흐름이 이어집니다" : "구조화된 장면 정보가 필요합니다"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fg-2">
                  {hasStructuredScenes
                    ? "새 장면이나 캐릭터를 추가한 뒤 다시 검사하면, 의도하지 않은 설정 변화를 일찍 발견할 수 있어요."
                    : "프레임을 선택해 등장인물·장소·시간·의상·소품을 기록하면 장면 순서대로 비교합니다."}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              {SEVERITY_ORDER.map((severity) => {
                const severityIssues = issues.filter((issue) => issue.severity === severity);
                if (severityIssues.length === 0) return null;
                const meta = SEVERITY_META[severity];
                return (
                  <section key={severity} aria-labelledby={`studio-continuity-${severity}`}>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h3
                        id={`studio-continuity-${severity}`}
                        className={`text-sm font-bold ${severity === "error" ? "text-bad" : "text-warning"}`}
                      >
                        {meta.label} {severityIssues.length}
                      </h3>
                      <p className="text-[0.7rem] text-fg-2">{meta.description}</p>
                    </div>
                    <ol className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card/45">
                      {severityIssues.map((issue, index) => (
                        <li
                          key={`${issue.code}:${issue.sceneRefs.join(":")}:${issue.message}:${index}`}
                          className="flex items-start gap-2.5 px-3 py-3 sm:px-4"
                        >
                          {severity === "error" ? (
                            <XCircle size={15} className="mt-0.5 shrink-0 text-bad" aria-hidden />
                          ) : (
                            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[0.64rem] font-semibold text-fg-2">
                                {ISSUE_LABELS[issue.code]}
                              </span>
                              {issue.sceneRefs.length === 0 && (
                                <span className="text-[0.65rem] text-fg-2">캐릭터 바이블</span>
                              )}
                            </div>
                            <p className="mt-1.5 text-xs font-medium leading-relaxed text-fg">{issue.message}</p>
                            {issue.sceneRefs.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="관련 장면">
                                {issue.sceneRefs.map((sceneId, sceneIndex) => (
                                  <SceneReference
                                    key={`${sceneId}:${sceneIndex}`}
                                    sceneId={sceneId}
                                    label={resolveSceneLabel(sceneId, sceneLabels, scenes)}
                                    onSelectScene={onSelectScene}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <p className="mr-auto max-w-[62ch] text-[0.68rem] leading-relaxed text-fg-2">
            이 검사는 명시된 값의 불일치를 찾는 보조 도구입니다. 창작 의도와 문맥은 작가가 최종 판단합니다.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 items-center rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent transition-colors duration-200 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/65 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            확인
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
