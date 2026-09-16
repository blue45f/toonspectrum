import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/lib/utils";
import { useI18n } from "@/shared/lib/i18n";

const COPY = {
  ko: {
    title: "표시 방식을 직접 확인하세요",
    body: "이 체험은 아래 미리보기에만 적용되며 계정이나 운영체제 설정을 바꾸지 않습니다.",
    textSize: "미리보기 글자 크기",
    contrast: "강한 대비",
    motion: "모션 감소",
    reset: "체험 초기화",
    previewTitle: "접근 가능한 작업 상태",
    previewBody: "저장 완료처럼 중요한 상태는 색상뿐 아니라 아이콘과 텍스트로 함께 전달합니다. 키보드 포커스도 항상 보입니다.",
    previewAction: "포커스 확인 버튼",
    limitationsTitle: "현재 알려진 지원 범위",
    review: "접근성 지원 기준 검토일: 2026년 9월 16일",
  },
  en: {
    title: "Test display choices",
    body: "This preview only affects the card below. It does not change account or operating-system preferences.",
    textSize: "Preview text size",
    contrast: "Stronger contrast",
    motion: "Reduce motion",
    reset: "Reset preview",
    previewTitle: "An accessible work state",
    previewBody: "Important states such as save completion use icons and text as well as color. Keyboard focus stays visible.",
    previewAction: "Check focus button",
    limitationsTitle: "Known support boundaries",
    review: "Accessibility support criteria reviewed: September 16, 2026",
  },
} as const;

const LIMITATIONS = {
  ko: [
    ["캔버스 직접 조작", "드로잉과 3D 관절 조작은 포인터 중심 기능이 남아 있으며 키보드 대체 경로를 확대하고 있습니다."],
    ["복잡한 그래프·3D", "동등한 설명을 기능별로 보강 중이며 핵심 상태와 오류는 텍스트로 제공합니다."],
    ["외부 에셋", "마켓 이미지·영상의 대체 텍스트 품질은 제작자 입력에 따라 달라질 수 있습니다."],
  ],
  en: [
    ["Direct canvas input", "Drawing and 3D joint manipulation still include pointer-first operations; keyboard alternatives continue to expand."],
    ["Complex graphs and 3D", "Equivalent descriptions are being improved while essential status and errors remain available as text."],
    ["External assets", "Alternative text quality for marketplace media can depend on creator-provided metadata."],
  ],
} as const;

export function AccessibilityLab() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const copy = COPY[locale];
  const [textScale, setTextScale] = useState(100);
  const [strongContrast, setStrongContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const reset = () => {
    setTextScale(100);
    setStrongContrast(false);
    setReducedMotion(false);
  };

  return (
    <>
      <section className="mt-8 rounded-3xl border border-line bg-panel/55 p-5 sm:p-7" aria-labelledby="accessibility-lab-title">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            <SlidersHorizontal size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id="accessibility-lab-title" className="font-display text-xl font-bold text-fg">{copy.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-3">{copy.body}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="space-y-4 rounded-2xl border border-line bg-card/70 p-4">
            <label className="block text-xs font-bold text-fg-2" htmlFor="accessibility-text-scale">
              {copy.textSize}: <output htmlFor="accessibility-text-scale">{textScale}%</output>
            </label>
            <input
              id="accessibility-text-scale"
              type="range"
              min="100"
              max="160"
              step="10"
              value={textScale}
              onChange={(event) => setTextScale(Number(event.target.value))}
              className="min-h-11 w-full accent-[var(--color-accent)]"
            />
            <PreferenceToggle
              label={copy.contrast}
              pressed={strongContrast}
              onToggle={() => setStrongContrast((value) => !value)}
            />
            <PreferenceToggle
              label={copy.motion}
              pressed={reducedMotion}
              onToggle={() => setReducedMotion((value) => !value)}
            />
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-fg-3 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <RotateCcw size={15} aria-hidden="true" />{copy.reset}
            </button>
          </div>
          <div
            data-accessibility-preview=""
            data-strong-contrast={strongContrast || undefined}
            data-reduced-motion={reducedMotion || undefined}
            className={cn(
              "group relative overflow-hidden rounded-2xl border border-line bg-card p-6 transition-all duration-500 data-[strong-contrast]:border-fg data-[strong-contrast]:bg-canvas data-[reduced-motion]:transition-none",
              !reducedMotion && "hover:-translate-y-1 hover:shadow-lg",
            )}
            style={{ fontSize: `${textScale}%` }}
          >
            <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-good/40 bg-good/10 px-3 text-[0.75em] font-bold text-good">
              <CheckCircle2 size="1em" aria-hidden="true" />SAVE COMPLETE
            </span>
            <h3 className="mt-5 text-[1.2em] font-bold text-fg">{copy.previewTitle}</h3>
            <p className="mt-2 max-w-2xl text-[0.9em] leading-7 text-fg-2">{copy.previewBody}</p>
            <button
              type="button"
              className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-fg bg-fg px-4 text-[0.78em] font-bold text-canvas focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/70 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
            >
              {copy.previewAction}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-amber-500/25 bg-amber-500/5 p-5 sm:p-7" aria-labelledby="accessibility-limitations-title">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="accessibility-limitations-title" className="font-display text-lg font-bold text-fg">{copy.limitationsTitle}</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {LIMITATIONS[locale].map(([title, body]) => (
                <article key={title} className="rounded-2xl border border-line bg-card/75 p-4">
                  <h3 className="text-sm font-bold text-fg">{title}</h3>
                  <p className="mt-2 text-xs leading-6 text-fg-3">{body}</p>
                </article>
              ))}
            </div>
            <p className="mt-4 text-xs font-medium text-fg-3">{copy.review}</p>
          </div>
        </div>
      </section>
    </>
  );
}

function PreferenceToggle({
  label,
  pressed,
  onToggle,
}: {
  readonly label: string;
  readonly pressed: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          "h-6 w-11 rounded-full border p-0.5 transition",
          pressed ? "border-accent bg-accent" : "border-line-strong bg-canvas",
        )}
      >
        <span
          className={cn(
            "block size-4 rounded-full bg-fg transition-transform",
            pressed && "translate-x-5 bg-on-accent",
          )}
        />
      </span>
    </button>
  );
}
