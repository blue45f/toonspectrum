import {
  Archive,
  BadgeCheck,
  Blocks,
  ExternalLink,
  PackageCheck,
  ShieldCheck,
  Store,
} from "lucide-react";
import { Link } from "react-router-dom";

import { studioFeatureModule } from "../studio-feature-registry";
import {
  studioFeatureSurfacesForView,
  type StudioFeatureSurfaceTone,
} from "../studio-feature-surface-registry";
import type { StudioProjectSection } from "../studio-project-views";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

type Locale = "ko" | "en";

const ICON_BY_TONE = {
  asset: BadgeCheck,
  governance: ShieldCheck,
  market: Store,
  publishing: PackageCheck,
  system: Blocks,
} as const satisfies Readonly<Record<StudioFeatureSurfaceTone, typeof ShieldCheck>>;

function destinationHref(
  projectId: string,
  destination: { readonly section: StudioProjectSection; readonly view: string } | { readonly href: string },
): string {
  if ("href" in destination) return destination.href;
  const params = new URLSearchParams({ view: destination.view });
  return `/studio/p/${encodeURIComponent(projectId)}/${destination.section}?${params.toString()}`;
}

function publicOperationCount(moduleId: Parameters<typeof studioFeatureModule>[0]): number {
  const module = studioFeatureModule(moduleId) as Readonly<Record<string, unknown>>;
  return Object.values(module).filter((value) => typeof value === "function").length;
}

/**
 * Route-reachable operations for advanced modules that previously existed only
 * as domain contracts. External publishing, purchase and provider actions still
 * require their owning workflow and are never reported as completed here.
 */
export function StudioFeatureOperationsPanel({
  projectId,
  section,
  view,
  locale,
}: {
  readonly projectId: string;
  readonly section: StudioProjectSection;
  readonly view: string;
  readonly locale: Locale;
}) {
  const registrations = studioFeatureSurfacesForView(section, view);
  if (registrations.length === 0) return null;

  return (
    <section
      aria-labelledby="studio-feature-operations-title"
      className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Archive size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-accent">
            CAPABILITY OPERATIONS
          </p>
          <h2
            id="studio-feature-operations-title"
            className="mt-1 text-xl font-black tracking-tight text-fg"
          >
            {locale === "ko" ? "프로젝트 기능과 실제 작업 연결" : "Connected project operations"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "권리·품질·마켓·플러그인·게시·보관 기능을 현재 프로젝트의 정본 화면에서 실행합니다."
              : "Use rights, quality, market, plugin, publishing and archive capabilities from their canonical project surfaces."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {registrations.map((registration) => {
          const Icon = ICON_BY_TONE[registration.tone];
          const operationCount = publicOperationCount(registration.moduleId);
          const href = destinationHref(projectId, registration.destination);
          return (
            <article
              key={registration.id}
              className="flex min-h-48 flex-col rounded-2xl border border-line bg-panel p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-xl border",
                    registration.tone === "governance"
                      ? "border-success/30 bg-success-soft/20 text-success"
                      : registration.tone === "publishing"
                        ? "border-info/30 bg-info-soft/20 text-info"
                        : "border-accent/25 bg-accent-soft text-accent",
                  )}
                >
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.62rem] font-bold text-fg-3">
                  {locale === "ko"
                    ? `검증 연산 ${operationCount}개`
                    : `${operationCount} validated operations`}
                </span>
              </div>
              <h3 className="mt-4 text-base font-black text-fg">
                {locale === "ko" ? registration.titleKo : registration.titleEn}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-fg-2">
                {locale === "ko" ? registration.descriptionKo : registration.descriptionEn}
              </p>
              <Link
                to={href}
                className={buttonClass({
                  variant: "outline",
                  size: "sm",
                  className: "mt-4 w-fit gap-1.5",
                })}
              >
                {locale === "ko" ? registration.primaryActionKo : registration.primaryActionEn}
                <ExternalLink size={14} aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
