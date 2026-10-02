// 시리즈 탭의 "만들기" 진입 — 빠르게 만드는 간단 폼과, 기획부터 첫 발행까지 안내하는 연재 시작 마법사를 같은 자리에서 고른다.
// 마법사로 만든 뒤에는 "첫 회차 만들기·올리기"로 바로 이어 가, 시리즈를 만들고 끝나는 막다른 길을 없앤다.
import { Plus, Rocket, X } from "lucide-react";
import { Suspense, useId, useState } from "react";

import { SeriesForm } from "../creator-community-ui";
import { buildStudioHref } from "../creator-studio-links";
import { creatorSeriesHref } from "./showcase-links";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import Link from "@/shared/navigation/router-link";
import type { SeriesSummary } from "@/platform/creator-client";

// 마법사는 시리즈를 만들려는 사람만 쓰므로 갤러리 첫 로딩에 싣지 않는다.
const SeriesLaunchWizard = lazyRetry(
  () => import("../series-launch/SeriesLaunchWizard").then((module) => ({ default: module.SeriesLaunchWizard })),
  "GallerySeriesLaunchWizard",
);

type Mode = "idle" | "form" | "wizard";

function WizardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-card/60 p-4" aria-hidden>
      <span className="skeleton block h-5 w-40" />
      <span className="skeleton mt-3 block h-10 w-full" />
      <span className="skeleton mt-2 block h-24 w-full" />
    </div>
  );
}

function SeriesLaunchedNotice({ series, onDismiss }: { readonly series: SeriesSummary; readonly onDismiss: () => void }) {
  const bt = useBilingual("SeriesCreateEntry");
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-good/40 bg-good/10 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="break-keep text-base font-black text-fg">
            {formatI18nTemplate(bt("‘{title}’ 시리즈를 열었어요", "“{title}” is open"), { title: series.title })}
          </h3>
          <p className="mt-1 break-keep text-sm leading-6 text-fg-2">
            {bt("이제 첫 회차를 만들거나 완성한 이미지를 올려 발행해 보세요. 이 시리즈를 정해 둔 채로 열려요.", "Now make the first episode or upload finished images to publish. Both open with this series already chosen.")}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={bt("안내 닫기", "Dismiss")}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={buildStudioHref({ seriesId: series.id })} className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}>
          {bt("첫 회차 만들기", "Make episode 1")}
        </Link>
        <Link href={buildStudioHref({ seriesId: series.id, mode: "upload" })} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
          {bt("이미지 올려 발행", "Upload & publish")}
        </Link>
        <Link href={creatorSeriesHref(series.id)} className={buttonClass({ size: "md", variant: "ghost", className: "gap-1.5" })}>
          {bt("시리즈 페이지 보기", "View the series page")}
        </Link>
      </div>
    </section>
  );
}

export function SeriesCreateEntry({ onCreated }: { readonly onCreated: (series: SeriesSummary) => void }) {
  const bt = useBilingual("SeriesCreateEntry");
  const [mode, setMode] = useState<Mode>("idle");
  const [launched, setLaunched] = useState<SeriesSummary | null>(null);

  const finish = (series: SeriesSummary, announce: boolean) => {
    onCreated(series);
    setLaunched(announce ? series : null);
    setMode("idle");
  };

  if (mode === "form") {
    return <SeriesForm onSaved={(series) => finish(series, false)} onCancel={() => setMode("idle")} />;
  }
  if (mode === "wizard") {
    return (
      <Suspense fallback={<WizardSkeleton />}>
        <SeriesLaunchWizard onComplete={(series) => finish(series, true)} onCancel={() => setMode("idle")} />
      </Suspense>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setLaunched(null);
            setMode("wizard");
          }}
          className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}
        >
          <Rocket size={15} aria-hidden />
          {bt("연재 시작 마법사", "Series launch guide")}
        </button>
        <button
          type="button"
          onClick={() => {
            setLaunched(null);
            setMode("form");
          }}
          className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}
        >
          <Plus size={15} aria-hidden />
          {bt("새 시리즈 만들기", "New series")}
        </button>
      </div>
      <p className="break-keep text-sm leading-6 text-fg-2">
        {bt("처음이라면 마법사가 기획부터 첫 발행까지 5단계로 안내해요. 이미 정했다면 간단히 만드세요.", "New to serializing? The guide walks you from planning to your first release in 5 steps. Already decided? Create one quickly.")}
      </p>
      {launched ? <SeriesLaunchedNotice series={launched} onDismiss={() => setLaunched(null)} /> : null}
    </div>
  );
}
