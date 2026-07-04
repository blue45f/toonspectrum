/**
 * Studio Scenario Auto Layout Panel — 시나리오(스토리 아이디어) 텍스트 한 줄 입력으로 장면 분할 →
 * 컷(프레임) 생성 → 이미지 생성(캐릭터 일관성 유지) → 말풍선 배치까지 자동 완성하는 전체화면 모달
 * (투닝/투툰/WeToon 벤치마크, docs/studio-competitor-features.md §4 로드맵 참고).
 *
 * StudioStoryboardGridPanel/StudioScrollPreviewPanel과 동일한 "전체화면 모달(open/onClose)" 규약을
 * 따른다 — 스토리 입력 + 여러 장면 미리보기 카드(썸네일+대사)를 동시에 보여줘야 해서, 다른 AI 기능들이
 * 쓰는 320px 폭 툴바 팝오버(AI 어시스트)에는 들어가지 않는다.
 *
 * **document.body에 포탈로 렌더한다**(components/auth/auth-modal.tsx와 동일 이유) — 이 앱의 라우트
 * 콘텐츠 래퍼(route-stage)가 `isolation:isolate`를 걸어놔서, 그 안에서 z-index를 아무리 높여도(예:
 * 기존 StoryboardGrid/ScrollPreview/Timelapse 등이 쓰는 z-[80]) 사이트 전역 고정 헤더(z-50, route-stage
 * 밖의 형제 — z-index는 같은 스태킹 컨텍스트 안에서만 비교된다) 뒤로 가려진다. 실제로 헤드리스 브라우저로
 * 검증하다가 발견한 버그: 포탈 없이 z-80으로만 렌더했을 때 이 패널의 제목표시줄이 사이트 헤더 뒤에 완전히
 * 가려졌다(다른 4개 기존 z-80 모달도 같은 결함이 있을 가능성이 높지만, 이번 스코프는 이 패널 자체 수정으로
 * 한정한다 — 문서에 별도 기록). AI 최초 사용 고지(AiAssetNotice)도 이 패널이 열린 채로 트리거되므로
 * 함께 포탈 렌더로 옮겼다(이 패널을 포탈만 하고 고지는 그대로 두면, 고지가 이 패널 뒤에 가려 확인
 * 버튼을 누를 수 없다).
 *
 * 이 컴포넌트는 상태를 소유하지 않는다(완전히 controlled) — 실제 generateScenarioScenes/
 * generateBackgroundImage/generateConsistentCharacterImage 호출·순차 오케스트레이션·AI 생성형 콘텐츠
 * 최초 사용 고지 게이팅·캔버스 커밋은 전부 부모(StudioPage.tsx)가 수행한다. 이 패널은 그 진행 상태를
 * 보여주고 사용자 입력(스토리 텍스트·장면 수 힌트)과 액션(생성/취소/적용/다시 만들기)만 전달한다.
 */
import { AlertTriangle, Clapperboard, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { dialogueExcerpt } from "./studio-dialogue-batch";
import { SCENARIO_SCENE_COUNT_MAX, SCENARIO_SCENE_COUNT_MIN } from "./studio-scenario-scenes";

import type { ScenarioPreviewItem } from "./studio-scenario-layout";

import { cn } from "@/lib/utils";

const SCENE_COUNT_OPTIONS = Array.from(
  { length: SCENARIO_SCENE_COUNT_MAX - SCENARIO_SCENE_COUNT_MIN + 1 },
  (_, i) => SCENARIO_SCENE_COUNT_MIN + i
);

const STORY_TEXT_MAX = 2000;

export interface StudioScenarioAutoLayoutPanelProps {
  open: boolean;
  onClose: () => void;
  /** AI 어시스트(BYOK) 설정 완료 여부 — StudioAiSettingsPanel과 동일 판단(isStudioAiConfigured). */
  configured: boolean;
  storyText: string;
  onStoryTextChange: (value: string) => void;
  /** 2~10 사이 유효 값이면 "정확히 N개"로 요청, undefined("자동")면 모델이 3~8개 사이로 판단. */
  sceneCountHint: number | undefined;
  onSceneCountHintChange: (value: number | undefined) => void;
  /** 장면 분할(텍스트) 또는 이미지 순차 생성 중 하나라도 진행 중이면 true. */
  busy: boolean;
  /** "장면 구성 생성 중…" / "이미지 생성 중…" 등 현재 단계 라벨(busy가 아니면 null). */
  stageLabel: string | null;
  /** 이미지 순차 생성 단계의 진행 상황(장면 분할 단계에서는 null). */
  progress: { done: number; total: number } | null;
  /** 장면 분할 실패 등 파이프라인 전체를 막는 에러(장면별 이미지 실패는 preview 항목별 imageError로). */
  error: string | null;
  /** 장면 분할이 완료되면 채워진다(이미지는 순차로 채워지는 중일 수 있음) — null이면 아직 결과 없음. */
  preview: ScenarioPreviewItem[] | null;
  onGenerate: () => void;
  /** 다음 장면부터 생성을 멈춘다(busy일 때만 노출) — 이미 생성된 장면까지는 preview에 남는다. */
  onCancel: () => void;
  /** preview를 캔버스에 커밋한다(성공한 장면은 이미지 포함, 실패한 장면은 배경 없는 빈 컷으로). */
  onApply: () => void;
  /** preview를 버리고 입력 단계로 돌아간다(캔버스는 건드리지 않는다). */
  onDiscard: () => void;
}

function StageThumbnail({ item, generating }: { item: ScenarioPreviewItem; generating: boolean }) {
  if (item.imageDataUrl) {
    return <img src={item.imageDataUrl} alt="" className="size-full object-cover" />;
  }
  if (generating) {
    return (
      <div className="grid size-full place-items-center text-fg-3">
        <Loader2 size={18} className="animate-spin" aria-hidden />
      </div>
    );
  }
  if (item.imageError) {
    return (
      <div className="grid size-full place-items-center p-1.5 text-center text-bad" title={item.imageError}>
        <AlertTriangle size={16} aria-hidden />
      </div>
    );
  }
  return <div className="size-full" aria-hidden />;
}

export function StudioScenarioAutoLayoutPanel({
  open,
  onClose,
  configured,
  storyText,
  onStoryTextChange,
  sceneCountHint,
  onSceneCountHintChange,
  busy,
  stageLabel,
  progress,
  error,
  preview,
  onGenerate,
  onCancel,
  onApply,
  onDiscard,
}: StudioScenarioAutoLayoutPanelProps) {
  // ESC로 닫기 — StudioStoryboardGridPanel/StudioScrollPreviewPanel과 동일 관례. busy 중에도 닫을 수
  // 있다(생성 상태는 이 패널이 아니라 StudioPage가 들고 있어, 닫아도 진행 중인 순차 생성은 계속되고
  // 다시 열면 그 진행 상황을 그대로 이어서 볼 수 있다 — "백그라운드 생성"이 자연스러운 부작용이다).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canGenerate = configured && !busy && storyText.trim().length > 0;
  const hasPreview = !!preview && preview.length > 0;
  const generatingIndex = busy && progress ? progress.done : -1;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="시나리오 자동 생성"
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
    >
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <Clapperboard size={16} className="text-accent" aria-hidden />
          <h2 className="text-sm font-bold text-fg">시나리오 자동 생성</h2>
          <span className="text-xs text-fg-3">스토리 → 컷 분할 → 이미지 → 말풍선까지 한 번에(첫 버전)</span>
          <button
            type="button"
            aria-label="닫기"
            title="닫기 (Esc)"
            onClick={onClose}
            className="ml-auto grid size-8 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!configured && (
            <p className="mb-3 rounded-md border border-line bg-card/70 px-2.5 py-2 text-xs leading-relaxed text-fg-3">
              위 <span className="font-semibold text-fg-2">AI 어시스트 설정</span>에서 API 키를 등록하면 이 기능을
              쓸 수 있어요.
            </p>
          )}

          <label htmlFor="scenario-story-text" className="mb-1 block text-xs font-medium text-fg-2">
            스토리 아이디어
          </label>
          <textarea
            id="scenario-story-text"
            value={storyText}
            onChange={(e) => onStoryTextChange(e.target.value.slice(0, STORY_TEXT_MAX))}
            placeholder="예: 주인공이 학교 가는 길에 오랜만에 친구를 만나 반갑게 인사를 나눈다."
            rows={4}
            disabled={busy}
            className="w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent disabled:opacity-60"
          />
          <div className="mt-1 flex items-center justify-between text-[0.65rem] text-fg-3">
            <span>{storyText.length} / {STORY_TEXT_MAX}자</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-fg-2">
              장면 수
              <select
                value={sceneCountHint ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onSceneCountHintChange(v === "" ? undefined : Number(v));
                }}
                disabled={busy}
                className="rounded-md border border-line bg-card px-2 py-1 text-xs text-fg outline-none focus:border-accent disabled:opacity-60"
              >
                <option value="">자동(3~8개)</option>
                {SCENE_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
            </label>

            {!busy ? (
              <button
                type="button"
                onClick={onGenerate}
                disabled={!canGenerate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles size={13} aria-hidden />
                자동 생성
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised"
              >
                취소
              </button>
            )}

            {busy && (
              <span className="inline-flex items-center gap-1.5 text-xs text-fg-3" role="status" aria-live="polite">
                <Loader2 size={13} className="animate-spin" aria-hidden />
                {stageLabel}
                {progress && ` (${progress.done}/${progress.total})`}
              </span>
            )}
          </div>

          {error && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md border border-bad/30 bg-bad/10 px-2.5 py-2 text-xs leading-relaxed text-bad">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {hasPreview && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-xs font-medium text-fg-2">
                미리보기 — {preview!.length}개 컷
                {!busy && preview!.some((p) => p.imageError) && (
                  <span className="ml-1 text-bad">(일부 이미지 생성 실패 — 적용 후 직접 채울 수 있어요)</span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {preview!.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1 rounded-lg border border-line bg-card/60 p-1.5">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-raised">
                      <span className="absolute left-1 top-1 z-10 grid size-4 place-items-center rounded-full bg-black/60 text-[0.6rem] font-bold text-white">
                        {idx + 1}
                      </span>
                      <StageThumbnail item={item} generating={idx === generatingIndex} />
                    </div>
                    <p className="line-clamp-2 text-[0.65rem] leading-snug text-fg-3" title={item.imagePrompt}>
                      {item.imagePrompt || "(배경 묘사 없음)"}
                    </p>
                    <p className="line-clamp-1 text-[0.65rem] font-medium text-fg-2" title={item.bubbles.map((b) => b.text).join(" / ")}>
                      {item.bubbles.length > 0 ? dialogueExcerpt(item.bubbles.map((b) => b.text).join("\n"), 30) : "대사 없음"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {hasPreview && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-4 py-3">
            <button
              type="button"
              onClick={onDiscard}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw size={13} aria-hidden />
              다시 만들기
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={busy}
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              캔버스에 적용
            </button>
          </div>
        )}

        <p className="shrink-0 border-t border-line px-4 py-2 text-[0.65rem] leading-relaxed text-fg-3">
          적용하면 현재 페이지 아래로 컷이 이어 붙어요 — 적용된 컷·말풍선은 다른 요소와 똑같은 일반
          레이어라 이후 위치·크기·이미지·대사를 자유롭게 다듬을 수 있어요. 이미지 생성에는 여러 번의 API
          호출이 필요해 시간이 걸릴 수 있어요.
        </p>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
