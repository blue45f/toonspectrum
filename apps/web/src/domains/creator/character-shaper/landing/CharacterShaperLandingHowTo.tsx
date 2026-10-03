import { ChevronDown, Lightbulb } from "lucide-react";

import { HOW_TO_STEPS } from "./character-shaper-landing-copy";

import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 첫 캐릭터를 만드는 다섯 단계. 제목만 한 줄로 보이고 누르면 설명과 팁이 펼쳐진다
 * (`name`이 같은 묶음은 지원 브라우저에서 하나만 열려 화면이 길어지지 않는다).
 * 첫 단계는 처음부터 열어 "여기서 시작"을 보여 준다.
 */
export function CharacterShaperLandingHowTo() {
  const bt = useBilingual("CharacterShaperLandingPage");
  const localize = useBilingualLocalizer("CharacterShaperLandingPage");
  const steps = localize(HOW_TO_STEPS.ko, HOW_TO_STEPS.en);

  return (
    <ol
      aria-label={bt("다섯 단계 사용법", "Five-step guide")}
      data-character-shaper-howto="true"
      className="grid gap-2.5 md:grid-cols-2"
    >
      {steps.map((step, index) => (
        <li key={step.title}>
          <details
            name="character-shaper-howto"
            open={index === 0}
            className="group rounded-2xl border border-line bg-card/40 open:border-line-strong open:bg-card/70"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-3.5 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent"
              >
                {index + 1}
              </span>
              <h3 className="min-w-0 flex-1 text-base font-bold text-fg [word-break:keep-all]">{step.title}</h3>
              <ChevronDown
                size={18}
                aria-hidden
                className="shrink-0 text-fg-3 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div className="border-t border-line/70 px-3.5 pb-3.5 pt-3">
              <p className="text-sm leading-relaxed text-fg-2 [word-break:keep-all]">{step.body}</p>
              <p className="mt-3 flex gap-2 rounded-xl border border-accent/20 bg-accent-soft px-3 py-2 text-sm leading-relaxed text-fg-2 [word-break:keep-all]">
                <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" />
                <span>
                  <span className="font-semibold text-accent">{bt("팁", "Tip")}</span> {step.tip}
                </span>
              </p>
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}
