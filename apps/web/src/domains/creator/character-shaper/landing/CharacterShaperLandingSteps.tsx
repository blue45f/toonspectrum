import { ImagePlus, LayoutGrid, PersonStanding } from "lucide-react";

import { QUICK_STEP_ORDER, QUICK_STEPS } from "./character-shaper-landing-copy";

import type { QuickStepId } from "./character-shaper-landing-copy";
import type { LucideIcon } from "lucide-react";

import { Container } from "@/shared/components/section";
import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

const STEP_ICONS: Readonly<Record<QuickStepId, LucideIcon>> = {
  pick: LayoutGrid,
  pose: PersonStanding,
  place: ImagePlus,
};

/**
 * 한눈에 보는 세 단계. 처음 온 사람이 "무엇을 하는 도구인지"를 아래로 스크롤하기 전에 알 수 있게,
 * 휴대폰에서도 세 칸을 나란히 둔다(가로 스크롤 없음).
 */
export function CharacterShaperLandingSteps() {
  const bt = useBilingual("CharacterShaperLandingPage");
  const localize = useBilingualLocalizer("CharacterShaperLandingPage");
  const copy = localize(QUICK_STEPS.ko, QUICK_STEPS.en);

  return (
    <Container size="wide" className="studio-character-guide__section pb-2 pt-6 sm:pt-8">
      <ol
        aria-label={bt("세 단계로 끝나는 작업 흐름", "A three-step workflow")}
        data-character-shaper-quick-steps="true"
        className="grid grid-cols-3 gap-2 sm:gap-4"
      >
        {QUICK_STEP_ORDER.map((id, index) => {
          const Icon = STEP_ICONS[id];
          const step = copy[id];
          return (
            <li
              key={id}
              className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-line bg-card/50 px-2 py-3 text-center sm:flex-row sm:items-start sm:gap-3 sm:px-4 sm:py-4 sm:text-left"
            >
              <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Icon size={20} aria-hidden />
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-accent text-[0.6875rem] font-bold text-on-accent"
                >
                  {index + 1}
                </span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg [word-break:keep-all] sm:text-base">{step.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-fg-2 [word-break:keep-all]">{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Container>
  );
}
