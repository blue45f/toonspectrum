import { Check, Headphones, Link2, SlidersHorizontal, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { jumpToMusicSection } from "./music-section-jump";

import type { MusicOstStep, MusicOstStepId } from "./music-ost-flow";

const STEP_COPY: Readonly<Record<MusicOstStepId, { readonly icon: LucideIcon; readonly ko: string; readonly en: string; readonly detailKo: string; readonly detailEn: string }>> = {
  brief: { icon: SlidersHorizontal, ko: "장르·분위기·길이", en: "Genre, mood, length", detailKo: "스타터·테마로 한 번에 채우기", detailEn: "Fill it with a starter or theme" },
  create: { icon: Sparkles, ko: "생성 또는 가져오기", en: "Generate or import", detailKo: "AI 생성 · 외부 음원 가져오기", detailEn: "AI generation or an external file" },
  listen: { icon: Headphones, ko: "미리듣기·보관", en: "Preview & keep", detailKo: "나의 사운드트랙에서 듣고 MP3 저장", detailEn: "Listen in My soundtracks and save MP3" },
  connect: { icon: Link2, ko: "작품에 연결", en: "Link to your work", detailKo: "HTTPS MP3를 독자용 BGM으로", detailEn: "Use an HTTPS MP3 as reader BGM" },
};

/** OST 만들기 4단계 진행 표시. 각 단계를 누르면 해당 영역으로 이동한다. */
export function MusicOstFlow({ steps, workLinked }: { readonly steps: readonly MusicOstStep[]; readonly workLinked: boolean }) {
  const bt = useBilingual("MusicOstFlow");
  return (
    <nav aria-label={bt("OST 만들기 순서", "Soundtrack steps")} className="relative mt-6">
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const copy = STEP_COPY[step.id];
          const Icon = copy.icon;
          const detail = step.id === "connect" && !workLinked
            ? bt("작품 화면에서 ‘음악 만들기’로 열면 연결돼요", "Open from a work to link it")
            : bt(copy.detailKo, copy.detailEn);
          return (
            <li key={step.id} aria-current={step.state === "current" ? "step" : undefined}>
              <a
                href={`#${step.anchor}`}
                onClick={(event) => jumpToMusicSection(event, step.anchor)}
                className={cn(
                  "flex h-full min-h-16 items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  step.state === "done"
                    ? "border-good/40 bg-good/10"
                    : step.state === "current"
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-card/60 hover:border-line-strong",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-sm font-black",
                    step.state === "done" ? "bg-good text-canvas" : step.state === "current" ? "bg-accent text-on-accent" : "bg-raised text-fg-3",
                  )}
                >
                  {step.state === "done" ? <Check size={16} /> : <Icon size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.68rem] font-black uppercase tracking-[0.12em] text-fg-3">
                    {bt(`${index + 1}단계`, `Step ${index + 1}`)}
                    <span className="sr-only">
                      {step.state === "done" ? bt(" · 완료", " · done") : step.state === "current" ? bt(" · 지금 할 일", " · current") : bt(" · 다음", " · next")}
                    </span>
                  </span>
                  <span className="block text-sm font-bold text-fg">{bt(copy.ko, copy.en)}</span>
                  <span className="block text-xs leading-5 text-fg-3">{detail}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
