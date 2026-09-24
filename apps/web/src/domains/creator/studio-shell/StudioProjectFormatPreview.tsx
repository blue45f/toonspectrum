import { CheckCircle2, PackageCheck } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import type { StudioProjectFormatProfile, StudioProjectFormatVisual } from "../studio-project-format-catalog";

function VisualFrame({ visual }: { readonly visual: StudioProjectFormatVisual }) {
  if (visual === "vertical-scroll") {
    return (
      <div className="mx-auto flex h-36 w-20 flex-col gap-1.5 rounded-[1.1rem] border-2 border-line-strong bg-card p-2 shadow-sm" aria-hidden="true">
        <span className="mx-auto h-1 w-6 rounded-full bg-line-strong" />
        <span className="h-8 rounded-md border border-line bg-raised" />
        <span className="h-12 rounded-md border border-line bg-panel" />
        <span className="h-6 rounded-md border border-line bg-raised" />
      </div>
    );
  }
  if (visual === "card-sequence") {
    return (
      <div className="grid h-36 grid-cols-2 gap-2 p-2" aria-hidden="true">
        {[1, 2, 3, 4].map((number) => (
          <span key={number} className="relative rounded-lg border border-line-strong bg-card shadow-sm">
            <span className="absolute left-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-accent-soft text-[0.5rem] font-black text-accent">{number}</span>
            <span className="absolute inset-x-2 bottom-2 h-2 rounded bg-raised" />
          </span>
        ))}
      </div>
    );
  }
  if (visual === "page-spread") {
    return (
      <div className="flex h-36 items-center justify-center gap-1.5 p-2" aria-hidden="true">
        {["left", "right"].map((side) => (
          <span key={side} className="relative h-28 w-20 rounded-md border border-line-strong bg-card p-2 shadow-sm">
            <span className="block h-10 rounded border border-line bg-raised" />
            <span className="mt-2 block h-4 rounded border border-line bg-panel" />
            <span className="mt-2 block h-8 rounded border border-line bg-raised" />
            <span className={cn("absolute inset-y-1 w-px bg-line", side === "left" ? "right-1" : "left-1")} />
          </span>
        ))}
      </div>
    );
  }
  if (visual === "timeline") {
    return (
      <div className="flex h-36 flex-col gap-2 p-2" aria-hidden="true">
        <span className="grid flex-1 place-items-center rounded-lg border border-line-strong bg-canvas">
          <span className="grid size-10 place-items-center rounded-full border border-line bg-card text-xs font-black text-accent">▶</span>
        </span>
        <span className="space-y-1 rounded-md border border-line bg-card p-1.5">
          <span className="flex gap-1"><i className="h-2 w-8 rounded bg-accent-soft" /><i className="h-2 flex-1 rounded bg-raised" /></span>
          <span className="flex gap-1"><i className="h-2 w-12 rounded bg-raised" /><i className="h-2 flex-1 rounded bg-panel" /></span>
          <span className="flex gap-1"><i className="h-2 w-6 rounded bg-raised" /><i className="h-2 flex-1 rounded bg-accent-soft" /></span>
        </span>
      </div>
    );
  }
  return (
    <div className="grid h-36 grid-cols-[1fr_3.5rem] gap-2 p-2" aria-hidden="true">
      <span className="relative rounded-lg border border-line-strong bg-canvas shadow-inner">
        <span className="absolute inset-[16%] rounded-full border-2 border-accent/40 bg-accent-soft/30" />
      </span>
      <span className="space-y-2 rounded-lg border border-line bg-card p-2">
        <i className="block h-5 rounded bg-raised" />
        <i className="block h-5 rounded bg-panel" />
        <i className="block h-5 rounded bg-raised" />
        <i className="block h-5 rounded bg-panel" />
      </span>
    </div>
  );
}

export function StudioProjectFormatVisual({
  profile,
  active = false,
  className,
}: {
  readonly profile: StudioProjectFormatProfile;
  readonly active?: boolean;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-panel/55",
        active ? "border-accent/60 bg-accent-soft/25" : "border-line",
        className,
      )}
      data-studio-format-visual={profile.id}
    >
      <VisualFrame visual={profile.visual} />
    </div>
  );
}

export function StudioProjectFormatPreview({
  profile,
  locale,
}: {
  readonly profile: StudioProjectFormatProfile;
  readonly locale: "ko" | "en";
}) {
  const hierarchy = locale === "ko" ? profile.hierarchyKo : profile.hierarchyEn;
  const workflow = locale === "ko" ? profile.workflowKo : profile.workflowEn;
  const checks = locale === "ko" ? profile.checksKo : profile.checksEn;
  const outputs = locale === "ko" ? profile.outputsKo : profile.outputsEn;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel/45" data-studio-format-preview={profile.id}>
      <div className="grid gap-4 p-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-5">
        <StudioProjectFormatVisual profile={profile} active className="min-h-40" />
        <div className="min-w-0">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            {locale === "ko" ? "선택한 결과물" : "Selected outcome"}
          </p>
          <h3 className="mt-1 text-lg font-black text-fg">
            {locale === "ko" ? profile.titleKo : profile.titleEn}
          </h3>
          <p className="mt-1 text-sm leading-6 text-fg-3">
            {locale === "ko" ? profile.descriptionKo : profile.descriptionEn}
          </p>

          <div className="mt-3">
            <p className="text-[0.65rem] font-black uppercase tracking-wide text-fg-3">
              {locale === "ko" ? "작품 구조" : "Content structure"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {hierarchy.map((item, index) => (
                <span key={item} className="contents">
                  <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.68rem] font-bold text-fg-2">{item}</span>
                  {index < hierarchy.length - 1 ? <span className="text-xs text-fg-3">›</span> : null}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[0.65rem] font-black uppercase tracking-wide text-fg-3">
              {locale === "ko" ? "제작 흐름" : "Production flow"}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-fg-2">{workflow.join(" → ")}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-line bg-card/55 p-4 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-black text-fg-2">
            <CheckCircle2 size={14} className="text-accent" aria-hidden="true" />
            {locale === "ko" ? "형식별 자동 검사" : "Format-specific checks"}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-fg-3">{checks.join(" · ")}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-black text-fg-2">
            <PackageCheck size={14} className="text-accent" aria-hidden="true" />
            {locale === "ko" ? "최종 출력" : "Final outputs"}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-fg-3">{outputs.join(" · ")}</p>
        </div>
      </div>
    </section>
  );
}
