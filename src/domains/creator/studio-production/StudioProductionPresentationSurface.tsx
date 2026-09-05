import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  Maximize2,
  Pause,
  Play,
  Plus,
  Presentation,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  STUDIO_SLIDE_LAYOUTS,
  type StudioPitchSlide,
  type StudioPitchSlideLayout,
} from "./studio-production-model";
import type { StudioProductionSurfaceProps } from "./studio-production-component-types";
import {
  STUDIO_PRODUCTION_INPUT_CLASS,
  STUDIO_PRODUCTION_TEXTAREA_CLASS,
  StudioProductionCard,
  StudioProductionEmpty,
  StudioProductionField,
  StudioProductionMetric,
  StudioProductionPill,
  StudioProductionProgress,
} from "./StudioProductionUi";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

const LAYOUT_LABELS: Readonly<Record<StudioPitchSlideLayout, string>> = {
  cover: "표지",
  statement: "한 문장",
  character: "캐릭터",
  world: "세계관",
  sequence: "시퀀스",
  metrics: "제작 지표",
  cta: "제안",
};

function newSlide(index: number): StudioPitchSlide {
  return {
    id: `slide-${Date.now().toString(36)}-${index}`,
    layout: "statement",
    eyebrow: "NEW SLIDE",
    title: "새 슬라이드",
    body: "핵심 메시지를 한 문장으로 정리하세요.",
    speakerNotes: "발표자 메모",
    durationSec: 30,
    hidden: false,
    mediaHint: "이미지 또는 스크롤 컷",
  };
}

function downloadText(filename: string, text: string, type = "text/markdown"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function presentationOutline(slides: readonly StudioPitchSlide[]): string {
  return slides.map((slide, index) => [
    `## ${index + 1}. ${slide.title}`,
    slide.eyebrow ? `_${slide.eyebrow}_` : "",
    slide.body,
    `- 레이아웃: ${LAYOUT_LABELS[slide.layout]}`,
    `- 발표 시간: ${slide.durationSec}초`,
    slide.mediaHint ? `- 미디어: ${slide.mediaHint}` : "",
    slide.speakerNotes ? `\n> 발표자 메모: ${slide.speakerNotes}` : "",
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");
}

export function StudioProductionPresentationSurface({
  workspace,
  commit,
}: StudioProductionSurfaceProps) {
  const [selectedId, setSelectedId] = useState(workspace.pitchSlides[0]?.id ?? null);
  const [presenting, setPresenting] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const presentationRef = useRef<HTMLDivElement>(null);
  const visibleSlides = useMemo(
    () => workspace.pitchSlides.filter((slide) => !slide.hidden),
    [workspace.pitchSlides],
  );
  const selected = workspace.pitchSlides.find((slide) => slide.id === selectedId) ?? null;
  const current = visibleSlides[currentIndex] ?? visibleSlides[0] ?? null;
  const totalDuration = visibleSlides.reduce((sum, slide) => sum + slide.durationSec, 0);
  const completedDuration = visibleSlides.slice(0, currentIndex).reduce((sum, slide) => sum + slide.durationSec, 0) + elapsed;
  const completion = totalDuration > 0 ? (completedDuration / totalDuration) * 100 : 0;

  const patchSlide = (slideId: string, patch: Partial<StudioPitchSlide>, action = "피치 슬라이드 변경") => {
    commit(
      { action, detail: workspace.pitchSlides.find((slide) => slide.id === slideId)?.title ?? slideId },
      (currentWorkspace) => ({
        ...currentWorkspace,
        pitchSlides: currentWorkspace.pitchSlides.map((slide) => (
          slide.id === slideId ? { ...slide, ...patch } : slide
        )),
      }),
    );
  };

  const moveSlide = (slideId: string, direction: -1 | 1) => {
    const from = workspace.pitchSlides.findIndex((slide) => slide.id === slideId);
    const to = Math.max(0, Math.min(workspace.pitchSlides.length - 1, from + direction));
    if (from < 0 || from === to) return;
    commit(
      { action: "피치 슬라이드 순서 변경", detail: `${from + 1} → ${to + 1}` },
      (currentWorkspace) => {
        const slides = [...currentWorkspace.pitchSlides];
        const [slide] = slides.splice(from, 1);
        if (slide) slides.splice(to, 0, slide);
        return { ...currentWorkspace, pitchSlides: slides };
      },
    );
  };

  const addSlide = () => {
    const slide = newSlide(workspace.pitchSlides.length + 1);
    commit(
      { action: "피치 슬라이드 추가", detail: slide.title },
      (currentWorkspace) => ({ ...currentWorkspace, pitchSlides: [...currentWorkspace.pitchSlides, slide] }),
    );
    setSelectedId(slide.id);
  };

  const duplicateSlide = (slide: StudioPitchSlide) => {
    const copy = { ...slide, id: `slide-${Date.now().toString(36)}-copy`, title: `${slide.title} 복사본` };
    const index = workspace.pitchSlides.findIndex((item) => item.id === slide.id);
    commit(
      { action: "피치 슬라이드 복제", detail: slide.title },
      (currentWorkspace) => {
        const slides = [...currentWorkspace.pitchSlides];
        slides.splice(index + 1, 0, copy);
        return { ...currentWorkspace, pitchSlides: slides };
      },
    );
    setSelectedId(copy.id);
  };

  const deleteSlide = (slide: StudioPitchSlide) => {
    if (workspace.pitchSlides.length <= 1) return;
    const index = workspace.pitchSlides.findIndex((item) => item.id === slide.id);
    const nextSelection = workspace.pitchSlides[index + 1]?.id ?? workspace.pitchSlides[index - 1]?.id ?? null;
    commit(
      { action: "피치 슬라이드 삭제", detail: slide.title },
      (currentWorkspace) => ({
        ...currentWorkspace,
        pitchSlides: currentWorkspace.pitchSlides.filter((item) => item.id !== slide.id),
      }),
    );
    setSelectedId(nextSelection);
  };

  const changeSlide = useCallback((direction: -1 | 1) => {
    if (visibleSlides.length === 0) return;
    setCurrentIndex((index) => (index + direction + visibleSlides.length) % visibleSlides.length);
    setElapsed(0);
  }, [visibleSlides.length]);

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(0, visibleSlides.length - 1)));
  }, [visibleSlides.length]);

  useEffect(() => {
    if (!presenting || !autoPlay || !current) return;
    const timer = globalThis.setInterval(() => {
      setElapsed((seconds) => {
        if (seconds + 1 < current.durationSec) return seconds + 1;
        setCurrentIndex((index) => (index + 1) % Math.max(1, visibleSlides.length));
        return 0;
      });
    }, 1_000);
    return () => globalThis.clearInterval(timer);
  }, [autoPlay, current, presenting, visibleSlides.length]);

  useEffect(() => {
    if (!presenting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPresenting(false);
        return;
      }
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        changeSlide(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        changeSlide(-1);
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [changeSlide, presenting]);

  const openPresentation = () => {
    setCurrentIndex(0);
    setElapsed(0);
    setPresenting(true);
  };

  const requestFullscreen = () => {
    void presentationRef.current?.requestFullscreen?.();
  };

  return (
    <div className="space-y-4" data-studio-production-surface="present">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StudioProductionMetric label="슬라이드" value={`${workspace.pitchSlides.length}장`} detail={`공개 ${visibleSlides.length}장`} icon={<Presentation className="size-4" aria-hidden="true" />} tone="accent" />
        <StudioProductionMetric label="예상 발표" value={`${Math.floor(totalDuration / 60)}분 ${totalDuration % 60}초`} detail="슬라이드별 시간 합계" icon={<Clock3 className="size-4" aria-hidden="true" />} />
        <StudioProductionMetric label="숨김" value={`${workspace.pitchSlides.filter((slide) => slide.hidden).length}장`} detail="발표에서 건너뜀" icon={<EyeOff className="size-4" aria-hidden="true" />} />
        <StudioProductionMetric label="핵심 흐름" value={`${new Set(workspace.pitchSlides.map((slide) => slide.layout)).size}종`} detail="표지·인물·세계관·시퀀스·제안" icon={<Sparkles className="size-4" aria-hidden="true" />} tone="success" />
      </div>

      <StudioProductionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-fg">피치·프레젠테이션 모드</h2>
            <p className="mt-1 text-xs text-fg-2">슬라이드 타이밍, 발표자 메모, 자동 재생, 전체 화면을 한 흐름에서 리허설합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass({ variant: "outline" })} onClick={() => downloadText(`${workspace.title.replaceAll(/\s+/gu, "-")}-pitch.md`, presentationOutline(workspace.pitchSlides))}>
              <Download className="size-4" aria-hidden="true" /> 개요 내보내기
            </button>
            <button type="button" className={buttonClass()} onClick={openPresentation} disabled={visibleSlides.length === 0}>
              <Play className="size-4" aria-hidden="true" /> 발표 시작
            </button>
          </div>
        </div>
      </StudioProductionCard>

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(28rem,1fr)_minmax(18rem,0.58fr)]">
        <StudioProductionCard
          title="슬라이드 구성"
          description="순서·표시 여부를 즉시 조정합니다."
          action={<button type="button" className={buttonClass({ variant: "outline", size: "icon" })} onClick={addSlide} aria-label="슬라이드 추가"><Plus className="size-4" aria-hidden="true" /></button>}
        >
          <div className="space-y-2">
            {workspace.pitchSlides.map((slide, index) => (
              <article
                key={slide.id}
                className={cn(
                  "group cursor-pointer rounded-xl border p-2.5 transition-colors",
                  selectedId === slide.id ? "border-accent bg-accent-soft/55" : "border-line bg-panel hover:border-accent/50",
                  slide.hidden ? "opacity-60" : "",
                )}
                onClick={() => setSelectedId(slide.id)}
              >
                <div className="flex items-start gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-raised text-[0.6875rem] font-bold text-fg-2">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-fg-3">{slide.eyebrow || LAYOUT_LABELS[slide.layout]}</p>
                    <h3 className="mt-1 line-clamp-2 text-xs font-bold leading-snug text-fg">{slide.title}</h3>
                    <p className="mt-1 text-[0.6875rem] text-fg-3">{slide.durationSec}초 · {LAYOUT_LABELS[slide.layout]}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-end gap-1 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 xl:group-focus-within:opacity-100">
                  <button type="button" className={buttonClass({ variant: "quiet", size: "icon", className: "!size-8" })} onClick={(event) => { event.stopPropagation(); moveSlide(slide.id, -1); }} disabled={index === 0} aria-label={`${slide.title} 위로`}><ArrowUp className="size-3.5" aria-hidden="true" /></button>
                  <button type="button" className={buttonClass({ variant: "quiet", size: "icon", className: "!size-8" })} onClick={(event) => { event.stopPropagation(); moveSlide(slide.id, 1); }} disabled={index === workspace.pitchSlides.length - 1} aria-label={`${slide.title} 아래로`}><ArrowDown className="size-3.5" aria-hidden="true" /></button>
                  <button type="button" className={buttonClass({ variant: "quiet", size: "icon", className: "!size-8" })} onClick={(event) => { event.stopPropagation(); patchSlide(slide.id, { hidden: !slide.hidden }, slide.hidden ? "피치 슬라이드 표시" : "피치 슬라이드 숨김"); }} aria-label={slide.hidden ? `${slide.title} 표시` : `${slide.title} 숨김`}>{slide.hidden ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}</button>
                </div>
              </article>
            ))}
          </div>
        </StudioProductionCard>

        <StudioProductionCard title="16:9 미리보기" description="실제 발표 화면의 정보 밀도와 텍스트 길이를 확인합니다.">
          {selected ? (
            <div>
              <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-[radial-gradient(circle_at_15%_15%,var(--color-accent-soft),transparent_35%),linear-gradient(135deg,var(--color-panel),var(--color-bg))] p-[clamp(1.25rem,4vw,3.5rem)] shadow-inner">
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <p className="text-[clamp(0.55rem,1vw,0.8rem)] font-bold uppercase tracking-[0.2em] text-accent">{selected.eyebrow}</p>
                    <h2 className="mt-[clamp(0.6rem,2vw,1.5rem)] max-w-[19ch] text-balance text-[clamp(1.25rem,3.4vw,3.5rem)] font-black leading-[1.05] tracking-[-0.04em] text-fg">{selected.title}</h2>
                    <p className="mt-[clamp(0.6rem,1.6vw,1.25rem)] max-w-[48ch] text-[clamp(0.65rem,1.25vw,1.15rem)] leading-relaxed text-fg-2">{selected.body}</p>
                  </div>
                  <div className="flex items-end justify-between gap-4">
                    <StudioProductionPill>{LAYOUT_LABELS[selected.layout]}</StudioProductionPill>
                    <p className="max-w-[20ch] text-right text-[clamp(0.5rem,0.85vw,0.75rem)] text-fg-3">{selected.mediaHint}</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
                <span>예상 {selected.durationSec}초</span>
                <span>{selected.body.length}자 · 제목 {selected.title.length}자</span>
              </div>
            </div>
          ) : (
            <StudioProductionEmpty icon={<Presentation className="size-5" aria-hidden="true" />} title="슬라이드를 선택하세요" description="왼쪽 목록에서 편집할 슬라이드를 선택합니다." />
          )}
        </StudioProductionCard>

        <StudioProductionCard title="슬라이드 편집" description="텍스트 변경은 입력을 벗어날 때 버전에 기록됩니다.">
          {selected ? (
            <div className="space-y-3">
              <StudioProductionField label="레이아웃">
                <select value={selected.layout} onChange={(event) => patchSlide(selected.id, { layout: event.currentTarget.value as StudioPitchSlideLayout })} className={STUDIO_PRODUCTION_INPUT_CLASS}>
                  {STUDIO_SLIDE_LAYOUTS.map((layout) => <option key={layout} value={layout}>{LAYOUT_LABELS[layout]}</option>)}
                </select>
              </StudioProductionField>
              <StudioProductionField label="상단 레이블">
                <input key={`${selected.id}-eyebrow`} defaultValue={selected.eyebrow} onBlur={(event) => patchSlide(selected.id, { eyebrow: event.currentTarget.value })} className={STUDIO_PRODUCTION_INPUT_CLASS} />
              </StudioProductionField>
              <StudioProductionField label="제목">
                <textarea key={`${selected.id}-title`} defaultValue={selected.title} onBlur={(event) => patchSlide(selected.id, { title: event.currentTarget.value })} className={cn(STUDIO_PRODUCTION_TEXTAREA_CLASS, "min-h-20")} />
              </StudioProductionField>
              <StudioProductionField label="본문">
                <textarea key={`${selected.id}-body`} defaultValue={selected.body} onBlur={(event) => patchSlide(selected.id, { body: event.currentTarget.value })} className={STUDIO_PRODUCTION_TEXTAREA_CLASS} />
              </StudioProductionField>
              <StudioProductionField label="미디어 힌트">
                <input key={`${selected.id}-media`} defaultValue={selected.mediaHint} onBlur={(event) => patchSlide(selected.id, { mediaHint: event.currentTarget.value })} className={STUDIO_PRODUCTION_INPUT_CLASS} />
              </StudioProductionField>
              <StudioProductionField label="발표 시간" hint="초">
                <input type="number" min={5} max={900} value={selected.durationSec} onChange={(event) => patchSlide(selected.id, { durationSec: Math.max(5, Math.min(900, Number(event.currentTarget.value))) })} className={STUDIO_PRODUCTION_INPUT_CLASS} />
              </StudioProductionField>
              <StudioProductionField label="발표자 메모">
                <textarea key={`${selected.id}-notes`} defaultValue={selected.speakerNotes} onBlur={(event) => patchSlide(selected.id, { speakerNotes: event.currentTarget.value })} className={STUDIO_PRODUCTION_TEXTAREA_CLASS} />
              </StudioProductionField>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => duplicateSlide(selected)}><Copy className="size-4" aria-hidden="true" /> 복제</button>
                <button type="button" className={buttonClass({ variant: "quiet", size: "sm" })} onClick={() => deleteSlide(selected)} disabled={workspace.pitchSlides.length <= 1}><Trash2 className="size-4" aria-hidden="true" /> 삭제</button>
              </div>
            </div>
          ) : null}
        </StudioProductionCard>
      </div>

      {presenting && current ? (
        <div ref={presentationRef} className="fixed inset-0 z-[160] flex flex-col bg-bg text-fg" role="dialog" aria-modal="true" aria-label="피치 프레젠테이션">
          <div className="flex items-center gap-3 border-b border-line bg-panel/90 px-3 py-2 backdrop-blur">
            <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} onClick={() => setPresenting(false)} aria-label="발표 종료"><X className="size-5" aria-hidden="true" /></button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
                <span>{currentIndex + 1} / {visibleSlides.length}</span>
                <span>{elapsed} / {current.durationSec}초</span>
              </div>
              <StudioProductionProgress value={completion} className="mt-1" />
            </div>
            <button type="button" className={buttonClass({ variant: autoPlay ? "solid" : "outline", size: "sm" })} onClick={() => setAutoPlay((value) => !value)}>
              {autoPlay ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              {autoPlay ? "자동 일시정지" : "자동 재생"}
            </button>
            <button type="button" className={buttonClass({ variant: "outline", size: "icon" })} onClick={requestFullscreen} aria-label="전체 화면"><Maximize2 className="size-4" aria-hidden="true" /></button>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center overflow-hidden p-[clamp(1rem,4vw,4rem)]">
            <div className="aspect-video max-h-full w-full max-w-[1500px] overflow-hidden rounded-[clamp(1rem,2vw,2rem)] border border-line bg-[radial-gradient(circle_at_20%_20%,var(--color-accent-soft),transparent_38%),linear-gradient(135deg,var(--color-panel),var(--color-bg))] p-[clamp(2rem,6vw,7rem)] shadow-2xl">
              <div className="flex h-full flex-col justify-between">
                <div>
                  <p className="text-[clamp(0.7rem,1.2vw,1.15rem)] font-bold uppercase tracking-[0.22em] text-accent">{current.eyebrow}</p>
                  <h2 className="mt-[clamp(1rem,2vw,2rem)] max-w-[20ch] text-balance text-[clamp(2rem,5.2vw,6rem)] font-black leading-[1.02] tracking-[-0.05em]">{current.title}</h2>
                  <p className="mt-[clamp(1rem,2vw,2rem)] max-w-[52ch] text-[clamp(0.9rem,1.7vw,1.8rem)] leading-relaxed text-fg-2">{current.body}</p>
                </div>
                <div className="flex items-end justify-between gap-8">
                  <StudioProductionPill>{LAYOUT_LABELS[current.layout]}</StudioProductionPill>
                  <p className="max-w-[24ch] text-right text-[clamp(0.7rem,1vw,1rem)] text-fg-3">{current.mediaHint}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-2 border-t border-line bg-panel/90 px-3 py-2 md:grid-cols-[auto_1fr_auto] md:items-center">
            <button type="button" className={buttonClass({ variant: "outline" })} onClick={() => changeSlide(-1)}><ArrowLeft className="size-4" aria-hidden="true" /> 이전</button>
            <div className="min-w-0 rounded-xl bg-raised px-4 py-2 text-center">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-fg-3">발표자 메모</p>
              <p className="mt-1 line-clamp-2 text-xs text-fg-2">{current.speakerNotes || "메모 없음"}</p>
            </div>
            <button type="button" className={buttonClass()} onClick={() => changeSlide(1)}>다음 <ArrowRight className="size-4" aria-hidden="true" /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
