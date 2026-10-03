import { AiAssistArt, OutputLayersArt, PresetSlotsArt, SurfacePaintArt } from "../../CharacterShaperLandingArt";
import { FEATURES } from "./character-shaper-landing-copy";

import type { FeatureId } from "./character-shaper-landing-copy";
import type { ComponentType } from "react";

import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

const FEATURE_ART: Readonly<Record<FeatureId, ComponentType<{ className?: string }>>> = {
  presets: PresetSlotsArt,
  paint: SurfacePaintArt,
  ai: AiAssistArt,
  output: OutputLayersArt,
};

/**
 * 핵심 기능 네 가지. 휴대폰에서는 다음 카드가 살짝 보이는 가로 스냅 레일(한 장씩 넘기기),
 * 태블릿 이상에서는 2열 격자로 한 번에 보여 준다. 긴 칩 목록은 접어 두어 카드 높이를 낮춘다.
 */
export function CharacterShaperLandingFeatures() {
  const bt = useBilingual("CharacterShaperLandingPage");
  const localize = useBilingualLocalizer("CharacterShaperLandingPage");
  const features = FEATURES.map((feature) => ({ ...feature, copy: localize(feature.copy.ko, feature.copy.en) }));

  return (
    <ul
      aria-label={bt("핵심 기능 네 가지", "Four core features")}
      data-character-shaper-features="true"
      className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:thin] md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0"
    >
      {features.map((feature) => {
        const Art = FEATURE_ART[feature.id];
        return (
          <li
            key={feature.id}
            data-character-shaper-feature={feature.id}
            className="studio-character-guide__feature flex w-[84%] max-w-[22rem] shrink-0 snap-start flex-col rounded-2xl border border-line bg-card/40 p-4 md:w-auto md:max-w-none md:p-5"
          >
            <div className="rounded-xl border border-line/70 bg-canvas/60 p-2.5">
              <Art className="mx-auto h-28 w-full md:h-40" />
            </div>
            <div className="mt-3 flex items-baseline gap-2.5">
              <span className="numeral text-sm text-accent">{feature.numeral}</span>
              <h3 className="text-base font-bold text-fg [word-break:keep-all] sm:text-lg">{feature.copy.title}</h3>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-2 [word-break:keep-all]">{feature.copy.body}</p>
            <details className="group mt-3 border-t border-line/70 pt-1">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                {bt("항목 전체 보기", "See all items")}
                <span aria-hidden className="text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none">
                  ▾
                </span>
              </summary>
              <ul className="mt-1 flex flex-wrap gap-1.5 pb-1">
                {feature.copy.chips.map((chip) => (
                  <li key={chip} className="rounded-full border border-line bg-raised/60 px-2.5 py-1 text-[0.8125rem] text-fg-2">
                    {chip}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
