import { Check, Images, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  isScenarioImageCandidateStale,
  scenarioImageCandidates,
  type StudioScenarioImageGenerationRequest,
  type StudioScenarioImageVariantCount,
} from "./ai/studio-scenario-candidate-workflow";

import type { ScenarioPreviewItem } from "./studio-scenario-layout";

export interface StudioScenarioCandidateDeskProps {
  readonly items: readonly ScenarioPreviewItem[];
  readonly referenceSignature: string;
  readonly busy: boolean;
  readonly imageGenerationReady: boolean;
  readonly disabledReason?: string;
  readonly onGenerate: (request: StudioScenarioImageGenerationRequest) => void;
  readonly onSelectCandidate: (index: number, candidateId: string) => void;
  readonly onApproveCandidate: (index: number, candidateId: string) => void;
}

const VARIANT_OPTIONS = [1, 2, 4] as const;

function preferredVariantCount(
  items: readonly ScenarioPreviewItem[],
): StudioScenarioImageVariantCount {
  return items.find((item) => item.preferredVariantCount)?.preferredVariantCount ?? 1;
}

export function StudioScenarioCandidateDesk({
  items,
  referenceSignature,
  busy,
  imageGenerationReady,
  disabledReason,
  onGenerate,
  onSelectCandidate,
  onApproveCandidate,
}: StudioScenarioCandidateDeskProps) {
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [variants, setVariants] = useState<StudioScenarioImageVariantCount>(() =>
    preferredVariantCount(items),
  );

  useEffect(() => {
    setSelectedIndexes((current) => {
      const valid = current.filter((index) => index >= 0 && index < items.length);
      if (valid.length > 0 || current.length > 0) return valid;
      return items.flatMap((item, index) => (item.imageDataUrl ? [] : [index]));
    });
  }, [items]);

  const importedVariantPreference = preferredVariantCount(items);
  useEffect(() => {
    setVariants(importedVariantPreference);
  }, [importedVariantPreference]);

  const selected = useMemo(() => new Set(selectedIndexes), [selectedIndexes]);
  const workload = selected.size * variants;
  const canGenerate = imageGenerationReady && !busy && selected.size > 0;

  const toggleIndex = (index: number) => {
    setSelectedIndexes((current) =>
      current.includes(index)
        ? current.filter((candidate) => candidate !== index)
        : [...current, index].sort((left, right) => left - right),
    );
  };

  return (
    <section
      aria-labelledby="scenario-candidate-desk-title"
      className="mb-3 rounded-xl border border-accent/25 bg-accent/5 p-3"
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3
            id="scenario-candidate-desk-title"
            className="flex items-center gap-1.5 text-xs font-bold text-fg"
          >
            <Images size={14} className="text-accent" aria-hidden />
            컷 후보 보드
          </h3>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
            필요한 컷만 골라 1·2·4개 후보를 만들고 비교한 뒤 승인하세요. 새 생성은
            기존 후보와 승인을 덮어쓰지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setSelectedIndexes(items.map((_, index) => index))}
            disabled={busy || items.length === 0}
            className="min-h-11 rounded-md border border-line bg-panel px-2 text-[0.65rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-45 sm:min-h-7"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={() => setSelectedIndexes([])}
            disabled={busy || selected.size === 0}
            className="min-h-11 rounded-md border border-line bg-panel px-2 text-[0.65rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-45 sm:min-h-7"
          >
            선택 해제
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel/70 p-2">
        <span className="text-[0.68rem] font-semibold text-fg-2">컷당 후보</span>
        <div
          role="radiogroup"
          aria-label="컷당 생성 후보 수"
          className="flex rounded-lg border border-line bg-card p-0.5"
        >
          {VARIANT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={variants === count}
              onClick={() => setVariants(count)}
              disabled={busy}
              className={`min-h-10 min-w-10 rounded-md px-2 text-xs font-bold transition-colors sm:min-h-7 ${
                variants === count
                  ? "bg-accent text-on-accent"
                  : "text-fg-3 hover:bg-raised"
              }`}
            >
              {count}
            </button>
          ))}
        </div>
        <span className="text-[0.68rem] text-fg-3" aria-live="polite">
          {selected.size}컷 × {variants}개 = 상대 작업량 {workload}
        </span>
        <button
          type="button"
          onClick={() =>
            onGenerate({ indexes: [...selected].sort((a, b) => a - b), variants })
          }
          disabled={!canGenerate}
          title={disabledReason}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-8"
        >
          <Sparkles size={13} aria-hidden />
          선택 컷 후보 {workload}개 생성
        </button>
      </div>
      <p className="mt-1.5 text-[0.62rem] leading-relaxed text-fg-3">
        작업량은 모델·요금과 무관한 요청 개수입니다. 실제 비용과 처리 시간은 연결한 이미지
        제공자에서 확인하세요.
      </p>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {items.map((item, index) => {
          const candidates = scenarioImageCandidates(item);
          const selectedCandidateId =
            item.selectedImageCandidateId ??
            candidates.find((candidate) => candidate.imageDataUrl === item.imageDataUrl)?.id ??
            candidates.at(-1)?.id;
          const selectedCandidate = candidates.find(
            (candidate) => candidate.id === selectedCandidateId,
          );
          const selectedCandidateStale = selectedCandidate
            ? isScenarioImageCandidateStale(selectedCandidate, item, referenceSignature)
            : false;
          return (
            <article
              key={index}
              className="min-w-0 rounded-lg border border-line bg-card/75 p-2"
            >
              <div className="flex items-center gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[0.7rem] font-semibold text-fg-2 sm:min-h-7">
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleIndex(index)}
                    disabled={busy}
                    aria-label={`${index + 1}번 컷 후보 생성 선택`}
                    className="size-4 accent-accent"
                  />
                  컷 {index + 1}
                </label>
                <span
                  className="min-w-0 flex-1 truncate text-[0.65rem] text-fg-3"
                  title={item.summary}
                >
                  {item.summary}
                </span>
                {item.approvedImageCandidateId ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-good/35 bg-good/10 px-2 py-0.5 text-[0.6rem] font-semibold text-good">
                    <ShieldCheck size={10} aria-hidden /> 승인됨
                  </span>
                ) : null}
              </div>

              {candidates.length > 0 ? (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {candidates.map((candidate, candidateIndex) => {
                    const active = candidate.id === selectedCandidateId;
                    const approved = candidate.id === item.approvedImageCandidateId;
                    const stale = isScenarioImageCandidateStale(
                      candidate,
                      item,
                      referenceSignature,
                    );
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => onSelectCandidate(index, candidate.id)}
                        disabled={busy}
                        aria-pressed={active}
                        aria-label={`${index + 1}번 컷 후보 ${candidateIndex + 1} 사용`}
                        className={`relative w-24 shrink-0 overflow-hidden rounded-lg border-2 bg-raised text-left transition-colors disabled:opacity-55 ${
                          active ? "border-accent" : "border-transparent hover:border-line"
                        }`}
                      >
                        <img
                          src={candidate.imageDataUrl}
                          alt=""
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <span className="flex items-center justify-between gap-1 px-1.5 py-1 text-[0.58rem] text-fg-3">
                          <span>후보 {candidateIndex + 1}</span>
                          {active ? (
                            <Check size={10} className="text-accent" aria-hidden />
                          ) : null}
                        </span>
                        {approved ? (
                          <span className="absolute left-1 top-1 rounded bg-good/90 px-1 py-0.5 text-[0.55rem] font-bold text-white">
                            승인
                          </span>
                        ) : stale ? (
                          <span className="absolute left-1 top-1 rounded bg-warn/90 px-1 py-0.5 text-[0.55rem] font-bold text-black">
                            검토 필요
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 rounded-md border border-dashed border-line px-2 py-2 text-[0.65rem] text-fg-3">
                  아직 후보가 없습니다. 이 컷을 선택해 생성하거나 기존 단일 생성 버튼을
                  사용하세요.
                </p>
              )}

              {selectedCandidate ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[0.6rem] text-fg-3">
                    {selectedCandidate.imageProvenance
                      ? `${selectedCandidate.imageProvenance.provider} / ${selectedCandidate.imageProvenance.model}`
                      : "이전 생성 결과"}
                  </span>
                  {selectedCandidateStale ? (
                    <span className="text-[0.6rem] font-semibold text-warn">
                      현재 프롬프트·참조와 다름
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onApproveCandidate(index, selectedCandidate.id)}
                    disabled={
                      busy ||
                      selectedCandidateStale ||
                      item.approvedImageCandidateId === selectedCandidate.id
                    }
                    className="inline-flex min-h-10 items-center gap-1 rounded-md border border-good/35 bg-good/10 px-2 text-[0.63rem] font-semibold text-good hover:bg-good/15 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-7"
                  >
                    <ShieldCheck size={11} aria-hidden />
                    {item.approvedImageCandidateId === selectedCandidate.id
                      ? "승인 완료"
                      : "이 후보 승인"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
