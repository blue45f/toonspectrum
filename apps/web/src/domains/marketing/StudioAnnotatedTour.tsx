import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cx } from "@/shared/lib/cx";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { StudioWindowMock, type StudioRegionId } from "./public/intro-studio-window";
import { STUDIO_REGIONS, STUDIO_REGION_ORDER } from "./studio-tour-content";

const SCOPE = "domains.marketing.StudioAnnotatedTour";

/**
 * 작업실 둘러보기의 핵심: 예시 편집기 화면의 번호 핀(또는 아래 번호 버튼)을 누르면
 * 그 영역이 하는 일과 바로 열 수 있는 실제 작업공간을 보여 준다. 한 번에 한 영역만 읽는다.
 */
export function StudioAnnotatedTour() {
  const bi = useBilingualLocalizer(SCOPE);
  const [active, setActive] = useState<StudioRegionId>(STUDIO_REGION_ORDER[0] ?? "tools");
  const region = STUDIO_REGIONS.find((item) => item.id === active) ?? STUDIO_REGIONS[0];
  const copy = bi(region.ko, region.en);
  const Icon = region.icon;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)] lg:items-start lg:gap-8">
      <StudioWindowMock interactive={{ regions: STUDIO_REGION_ORDER, active, onSelect: setActive }} />

      <div className="grid min-w-0 gap-3">
        <div
          role="group"
          aria-label={bi("작업실 영역 고르기", "Choose a studio area")}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {STUDIO_REGIONS.map((item, index) => {
            const pressed = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => setActive(item.id)}
                className={cx(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                  pressed ? "border-accent bg-accent-soft font-bold text-accent" : "border-line bg-card/70 font-semibold text-fg-2 hover:border-accent/45 hover:text-fg",
                )}
              >
                <span aria-hidden="true" className={cx("grid size-6 place-items-center rounded-full text-xs font-black", pressed ? "bg-accent text-on-accent" : "bg-raised text-fg-2")}>{index + 1}</span>
                {bi(item.ko, item.en).label}
              </button>
            );
          })}
        </div>

        <article aria-live="polite" className="rounded-2xl border border-line/70 bg-card/65 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={19} aria-hidden="true" /></span>
            <h3 className="min-w-0 text-balance break-keep text-lg font-bold leading-snug tracking-tight text-fg sm:text-xl">{copy.title}</h3>
          </div>
          <p className="mt-3 break-keep text-base leading-7 text-fg-2">{copy.body}</p>
          <ul className="mt-3 grid gap-1.5">
            {copy.points.map((point) => (
              <li key={point} className="flex items-start gap-2 break-keep text-[0.9375rem] leading-6 text-fg-2">
                <Check size={14} className="mt-1.5 shrink-0 text-accent" aria-hidden="true" />{point}
              </li>
            ))}
          </ul>
          <Link href={region.href} className={buttonClass({ size: "lg", className: "mt-4 w-full whitespace-normal text-center sm:w-auto" })}>
            {copy.cta}<ArrowRight size={17} aria-hidden="true" />
          </Link>
        </article>
      </div>
    </div>
  );
}
