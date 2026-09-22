import {
  ChevronLeft,
  ChevronRight,
  Film,
  Images,
  ListPlus,
  Maximize2,
  Minus,
  Plus,
  ReceiptText,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StudioScenarioCandidateDesk } from "../StudioScenarioCandidateDesk";
import {
  approveScenarioImageCandidate,
  scenarioCandidateReviewStatus,
  selectScenarioImageCandidate,
  type StudioScenarioImageGenerationRequest,
} from "./studio-scenario-candidate-workflow";
import {
  extendStudioToonProductionScenes,
  STUDIO_TOON_PRODUCTION_MAX_EXTENSION_SCENES,
  STUDIO_TOON_PRODUCTION_MAX_SCENES,
  summarizeStudioToonProductionScenes,
} from "./studio-toon-production-board";

import type { ScenarioPreviewItem } from "../studio-scenario-layout";

export interface StudioToonProductionBoardProps {
  readonly items: readonly ScenarioPreviewItem[];
  readonly referenceSignature: string;
  readonly disabled?: boolean;
  readonly onChangeScene: (index: number, patch: Partial<ScenarioPreviewItem>) => void;
  readonly onReplaceScenes: (scenes: readonly ScenarioPreviewItem[]) => void;
  readonly onGenerate: (request: StudioScenarioImageGenerationRequest) => void;
  readonly onOpenDirector: () => void;
  readonly onOpenUsage: () => void;
  readonly onOpenAnimation: () => void;
}

const INPUT =
  "mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50";
const TEXTAREA = `${INPUT} min-h-24 resize-y py-2 leading-relaxed`;
const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45";
const PRIMARY =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45";

function boundedActiveIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, index));
}

function sceneStatus(
  item: ScenarioPreviewItem,
  referenceSignature: string,
): string {
  const status = scenarioCandidateReviewStatus(item, referenceSignature);
  if (status === "approved") return "승인됨";
  if (status === "failed") return "오류";
  if (status === "stale") return "재검토";
  if (status === "unapproved") return "검토 필요";
  return "미생성";
}
export function StudioToonProductionBoard({
  items,
  referenceSignature,
  disabled = false,
  onChangeScene,
  onReplaceScenes,
  onGenerate,
  onOpenDirector,
  onOpenUsage,
  onOpenAnimation,
}: StudioToonProductionBoardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [extensionCount, setExtensionCount] = useState(5);
  const [extensionDirection, setExtensionDirection] = useState("");
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);

  useEffect(() => {
    setActiveIndex((current) => boundedActiveIndex(current, items.length));
  }, [items.length]);

  const summary = useMemo(
    () => summarizeStudioToonProductionScenes(items, referenceSignature),
    [items, referenceSignature],
  );
  const active = items[activeIndex];
  const remainingCapacity = Math.max(0, STUDIO_TOON_PRODUCTION_MAX_SCENES - items.length);
  const canExtend = !disabled && items.length > 0 && remainingCapacity > 0;

  const patchActive = (patch: Partial<ScenarioPreviewItem>) => {
    if (!active || disabled) return;
    onChangeScene(activeIndex, patch);
  };

  const addConnectedScenes = () => {
    if (!canExtend) return;
    const result = extendStudioToonProductionScenes({
      scenes: items,
      count: extensionCount,
      direction: extensionDirection,
    });
    if (result.added <= 0) {
      setExtensionNotice("추가할 수 있는 장면이 없습니다.");
      return;
    }
    onReplaceScenes(result.scenes);
    setActiveIndex(items.length);
    setExtensionNotice(
      `${result.added}개 연결 장면을 추가했습니다. 남은 확장 가능 수는 ${result.remainingCapacity}개입니다.`,
    );
  };

  const removeActiveScene = () => {
    if (!active || disabled || items.length <= 1) return;
    const next = items.filter((_, index) => index !== activeIndex);
    onReplaceScenes(next);
    setActiveIndex((current) => boundedActiveIndex(current, next.length));
  };

  const selectCandidate = (index: number, candidateId: string) => {
    const item = items[index];
    if (!item || disabled) return;
    onChangeScene(index, selectScenarioImageCandidate(item, candidateId));
  };

  const approveCandidate = (index: number, candidateId: string) => {
    const item = items[index];
    if (!item || disabled) return;
    onChangeScene(index, approveScenarioImageCandidate(item, candidateId));
  };

  if (!active) {
    return (
      <section className="rounded-2xl border border-dashed border-line bg-panel p-6 text-center">
        <ListPlus size={28} className="mx-auto text-accent" aria-hidden />
        <h3 className="mt-3 text-base font-black text-fg">먼저 장면을 구성하세요</h3>
        <p className="mt-1 text-sm text-fg-3">
          AI 코믹 디렉터에서 시나리오를 장면으로 나누면 이곳에서 일괄 생성과 검토를 이어갑니다.
        </p>
        <button type="button" className={`${PRIMARY} mt-4`} onClick={onOpenDirector}>
          <ScanSearch size={14} aria-hidden /> AI 코믹 디렉터 열기
        </button>
      </section>
    );
  }
  return (
    <div className="space-y-4" data-studio-toon-production-board="true">
      <section className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-sm font-black text-fg">
              <Images size={16} className="text-accent" aria-hidden /> 장면 제작 보드
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">
              장면을 고치고 필요한 컷만 후보 생성 작업으로 넘긴 뒤, 결과를 비교·승인하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} onClick={onOpenUsage}>
              <ReceiptText size={14} aria-hidden /> 사용량·포인트
            </button>
            <button type="button" className={BUTTON} onClick={onOpenDirector}>
              <ScanSearch size={14} aria-hidden /> 웹툰 검토
            </button>
            <button type="button" className={BUTTON} onClick={onOpenAnimation}>
              <Film size={14} aria-hidden /> 영상 제작
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["전체 장면", summary.total],
            ["그림 있음", summary.generated],
            ["승인 완료", summary.approved],
            ["오류", summary.failed],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line bg-card p-3">
              <p className="text-[0.65rem] font-semibold text-fg-3">{label}</p>
              <p className="mt-1 text-xl font-black tabular-nums text-fg">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(21rem,0.95fr)]">
        <article className="overflow-hidden rounded-2xl border border-line bg-panel">
          <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <button
              type="button"
              aria-label="이전 장면"
              className={BUTTON}
              onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}
              disabled={activeIndex === 0}
            >
              <ChevronLeft size={14} aria-hidden />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-xs font-black text-fg">
                장면 {activeIndex + 1} / {items.length}
              </p>
              <p className="truncate text-[0.65rem] text-fg-3">{active.summary}</p>
            </div>
            <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.62rem] font-bold text-fg-2">
              {sceneStatus(active, referenceSignature)}
            </span>
            <button
              type="button"
              aria-label="다음 장면"
              className={BUTTON}
              onClick={() => setActiveIndex((value) => Math.min(items.length - 1, value + 1))}
              disabled={activeIndex >= items.length - 1}
            >
              <ChevronRight size={14} aria-hidden />
            </button>
          </header>

          <div className="border-b border-line bg-card/55 p-3">
            <div className="flex flex-wrap items-center justify-end gap-1.5 pb-2">
              <button
                type="button"
                aria-label="미리보기 축소"
                className={BUTTON}
                onClick={() => setZoom((value) => Math.max(50, value - 10))}
                disabled={zoom <= 50}
              >
                <Minus size={13} aria-hidden />
              </button>
              <span className="min-w-14 text-center text-xs font-bold tabular-nums text-fg-2">
                {zoom}%
              </span>
              <button
                type="button"
                aria-label="미리보기 확대"
                className={BUTTON}
                onClick={() => setZoom((value) => Math.min(160, value + 10))}
                disabled={zoom >= 160}
              >
                <Plus size={13} aria-hidden />
              </button>
              <button type="button" className={BUTTON} onClick={() => setZoom(100)}>
                <Maximize2 size={13} aria-hidden /> 맞춤
              </button>
            </div>
            <div className="grid min-h-80 place-items-center overflow-auto rounded-xl border border-line bg-raised p-4">
              {active.imageDataUrl ? (
                <img
                  src={active.imageDataUrl}
                  alt={`${activeIndex + 1}번 장면 생성 결과`}
                  style={{ width: `${zoom}%` }}
                  className="max-w-none rounded-lg object-contain shadow-lg"
                />
              ) : (
                <div className="max-w-sm text-center text-fg-3">
                  <Images size={32} className="mx-auto opacity-60" aria-hidden />
                  <p className="mt-2 text-sm font-bold text-fg-2">아직 생성된 이미지가 없습니다</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    아래 후보 보드에서 이 장면을 선택하고 생성 작업을 여세요.
                  </p>
                </div>
              )}
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-black text-fg">장면 속성</h4>
              <p className="mt-0.5 text-[0.66rem] text-fg-3">
                변경한 프롬프트는 기존 승인 결과를 덮어쓰지 않고 재검토 대상으로 표시됩니다.
              </p>
            </div>
            <button
              type="button"
              className={BUTTON}
              onClick={removeActiveScene}
              disabled={disabled || items.length <= 1}
            >
              <Trash2 size={13} aria-hidden /> 장면 제거
            </button>
          </div>

          <label className="mt-4 block text-xs font-semibold text-fg-2">
            장면 제목·요약
            <input
              value={active.summary}
              onChange={(event) => patchActive({ summary: event.target.value.slice(0, 500) })}
              disabled={disabled}
              className={INPUT}
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-fg-2">
            이미지 프롬프트
            <textarea
              value={active.imagePrompt}
              onChange={(event) => patchActive({ imagePrompt: event.target.value.slice(0, 8_000) })}
              disabled={disabled}
              rows={8}
              className={TEXTAREA}
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-fg-2">
            나레이션·대사
            <textarea
              value={active.dialogue}
              onChange={(event) => patchActive({ dialogue: event.target.value.slice(0, 8_000) })}
              disabled={disabled}
              rows={6}
              placeholder={'(나레이션) 비가 그쳤다.\n주인공: 이제 가자.'}
              className={TEXTAREA}
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-fg-2">
            생성 화면 비율
            <select
              value={active.aspect}
              onChange={(event) => patchActive({
                aspect: event.target.value as ScenarioPreviewItem["aspect"],
              })}
              disabled={disabled}
              className={INPUT}
            >
              <option value="portrait">세로형</option>
              <option value="landscape">가로형 16:9 계열</option>
              <option value="square">정사각형</option>
            </select>
          </label>
        </article>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-sm font-black text-fg">
              <ListPlus size={16} className="text-accent" aria-hidden /> 연결 장면 확장
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">
              마지막 장면의 인물·장소·시간 연속성을 이어받는 편집 가능한 초안을 추가합니다.
              프로젝트는 최대 {STUDIO_TOON_PRODUCTION_MAX_SCENES}컷까지 확장할 수 있습니다.
            </p>
          </div>
          <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.65rem] font-bold text-fg-2">
            남은 수 {remainingCapacity}
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)_auto]">
          <label className="text-xs font-semibold text-fg-2">
            추가 장면 수
            <input
              type="number"
              min="1"
              max={Math.min(STUDIO_TOON_PRODUCTION_MAX_EXTENSION_SCENES, remainingCapacity)}
              value={extensionCount}
              onChange={(event) => setExtensionCount(Math.max(1, Number(event.target.value) || 1))}
              disabled={!canExtend}
              className={INPUT}
            />
          </label>
          <label className="text-xs font-semibold text-fg-2">
            새 전개·연출 방향
            <input
              value={extensionDirection}
              onChange={(event) => setExtensionDirection(event.target.value.slice(0, 1_000))}
              disabled={!canExtend}
              placeholder="예: 추격이 시작되고 마지막 컷에서 정체가 드러난다"
              className={INPUT}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className={`${PRIMARY} w-full`}
              onClick={addConnectedScenes}
              disabled={!canExtend}
            >
              <Plus size={14} aria-hidden /> 연결 장면 추가
            </button>
          </div>
        </div>
        {extensionNotice ? (
          <p className="mt-2 text-xs font-semibold text-fg-2" role="status">
            {extensionNotice}
          </p>
        ) : null}
      </section>

      <StudioScenarioCandidateDesk
        items={items}
        referenceSignature={referenceSignature}
        busy={disabled}
        imageGenerationReady={items.length > 0}
        disabledReason={disabled ? "세션 저장 또는 동기화가 끝난 뒤 다시 시도하세요." : undefined}
        generationActionLabel="선택 컷 생성 작업 열기"
        onGenerate={onGenerate}
        onSelectCandidate={selectCandidate}
        onApproveCandidate={approveCandidate}
      />
    </div>
  );
}
