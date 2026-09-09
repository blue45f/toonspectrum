import { ArrowRight, Brush, Images, LayoutTemplate, Palette, Sparkles } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

interface MarketSceneCompletionJourneyProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly className?: string;
}

const FAMILY_META = {
  template: { label: "장면 템플릿", description: "컷 분할과 대사 흐름부터 시작", kind: "template", icon: LayoutTemplate },
  asset: { label: "2D 에셋", description: "배경·소품·효과로 화면 채우기", kind: "asset", icon: Images },
  brush: { label: "브러시", description: "선화·채색·질감 다듬기", kind: "brush", icon: Brush },
  look: { label: "색·보정", description: "팔레트와 필터로 장면 마감", kind: "palette", icon: Palette },
} as const;

export type MarketSceneJourneyFamily = keyof typeof FAMILY_META;

export function marketSceneCompletionSequenceForKind(
  kind: CreatorMarketplaceResourceKind,
): readonly MarketSceneJourneyFamily[] {
  if (kind === "template") return ["asset", "brush", "look"];
  if (kind === "asset") return ["template", "brush", "look"];
  if (kind === "brush") return ["template", "asset", "look"];
  if (kind === "palette" || kind === "filter") return ["template", "asset", "brush"];
  return ["template", "asset", "brush"];
}

export function marketSceneCompletionBrowseHref(kind: string, tag: string | null): string {
  const params = new URLSearchParams({ kind });
  if (tag) params.set("tag", tag);
  return `/market/browse?${params.toString()}`;
}

export function MarketSceneCompletionJourney({ record, className }: MarketSceneCompletionJourneyProps) {
  const tag = record.tags[0]?.trim() || null;
  const sequence = marketSceneCompletionSequenceForKind(record.kind);

  return (
    <section className={cn("overflow-hidden rounded-2xl border border-line bg-card", className)} aria-labelledby="market-scene-completion-title">
      <div className="border-b border-line/70 bg-panel/55 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-accent">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="market-scene-completion-title" className="text-sm font-bold text-fg">이 리소스로 장면을 계속 완성해 보세요</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-fg-3">
              한 종류의 리소스에서 끝내지 않아도 됩니다. 지금 보고 있는 항목과 같은 장르·분위기의 다음 재료를 이어서 찾을 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <ol className="grid gap-px bg-line/60 md:grid-cols-3">
        {sequence.map((familyId, index) => {
          const meta = FAMILY_META[familyId];
          const Icon = meta.icon;
          return (
            <li key={familyId} className="bg-card">
              <Link
                href={marketSceneCompletionBrowseHref(meta.kind, tag)}
                className="group flex h-full min-h-32 items-start gap-3 p-4 transition-colors hover:bg-raised/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/35 group-hover:text-accent">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-[0.62rem] font-black tracking-[0.12em] text-fg-3">STEP {index + 1}</span>
                  <strong className="mt-1 block text-sm text-fg group-hover:text-accent">{meta.label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-fg-3">{meta.description}</span>
                  {tag ? <span className="mt-2 inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-[0.62rem] font-semibold text-accent">#{tag} 연계</span> : null}
                </span>
                <ArrowRight className="mt-2 size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-1 group-hover:text-accent" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
