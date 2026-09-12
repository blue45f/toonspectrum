import { Boxes, Library, Palette, Search, ShieldCheck, Store } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { MarketBrowsePage } from "@/domains/market/pages/MarketBrowsePage";
import { MarketLibraryPage } from "@/domains/market/pages/MarketCloudLibraryPage";
import { MarketManagePage } from "@/domains/market/pages/MarketOwnedResourcesPage";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { StudioAssetGovernancePanel } from "./StudioAssetGovernancePanel";
import { StudioAssetsPage } from "./StudioFrontDoorPages";
import { StudioSeriesKitPanel } from "./StudioSeriesKitPanel";
import {
  ASSET_HUB_VIEWS,
  resolveStudioAssetHubView,
  type AssetHubView,
} from "./studio-asset-hub-view";

type Locale = "ko" | "en";

const VIEW_LABELS: Readonly<Record<AssetHubView, Readonly<Record<Locale, string>>>> = {
  overview: { ko: "에셋 홈", en: "Asset home" },
  "series-kit": { ko: "Series Kit", en: "Series Kit" },
  library: { ko: "내 에셋", en: "My assets" },
  market: { ko: "마켓에서 찾기", en: "Browse market" },
  safety: { ko: "사용 권리·안전", en: "Rights & safety" },
  seller: { ko: "판매자 센터", en: "Seller center" },
};

const VIEW_ICONS = {
  overview: Boxes,
  "series-kit": Palette,
  library: Library,
  market: Search,
  safety: ShieldCheck,
  seller: Store,
} as const;

/** Convert an application language tag into the locales supported by this shell. */
function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

/** Build a canonical link while preserving the optional project context. */
function assetHubHref(view: AssetHubView, projectId: string | null): string {
  const query = new URLSearchParams();
  if (view !== "overview") query.set("view", view);
  if (projectId?.trim()) query.set("project", projectId.trim());
  query.sort();
  const serialized = query.toString();
  return serialized ? `/studio/assets?${serialized}` : "/studio/assets";
}

function MissingProjectView({
  locale,
  view,
}: {
  readonly locale: Locale;
  readonly view: "safety" | "series-kit";
}) {
  const seriesKit = view === "series-kit";
  return (
    <Container size="wide" className="py-8 sm:py-12">
      <section className="rounded-3xl border border-line bg-card p-6 text-center shadow-sm sm:p-10">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          {seriesKit ? <Palette size={21} aria-hidden="true" /> : <ShieldCheck size={21} aria-hidden="true" />}
        </span>
        <h2 className="mt-4 text-xl font-black text-fg">
          {seriesKit
            ? (locale === "ko" ? "프로젝트에서 Series Kit를 열어 주세요" : "Open Series Kit from a project")
            : (locale === "ko" ? "확인할 프로젝트를 먼저 선택해 주세요" : "Choose a project to check")}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-2">
          {seriesKit
            ? (locale === "ko"
              ? "Series Kit는 작품별 색상·글꼴·말풍선·출력 규칙을 관리합니다. 내 작업에서 프로젝트를 선택한 뒤 에셋의 Series Kit를 열면 됩니다."
              : "Series Kit manages project colors, typography, balloons and export defaults. Choose a project from My work, then open its Series Kit.")
            : (locale === "ko"
              ? "사용 목적, 구매 내역, 팀 좌석, 글꼴, AI 출처와 확장 기능 권한은 프로젝트마다 달라집니다. 내 작업에서 프로젝트를 선택하면 한 번에 확인할 수 있습니다."
              : "Usage purpose, purchases, team seats, fonts, AI provenance and extension permissions differ per project. Choose a project from My work to review them together.")}
        </p>
        <Link href="/studio" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-on-accent">
          {locale === "ko" ? "내 작업으로" : "Go to My work"}
        </Link>
      </section>
    </Container>
  );
}

/** Render the one canonical Studio asset destination over existing server-backed capabilities. */
export function StudioAssetHubPage() {
  const [searchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const view = resolveStudioAssetHubView(searchParams.get("view"));
  const projectId = searchParams.get("project")?.trim() || null;
  const CurrentViewIcon = VIEW_ICONS[view];

  const currentLabel = useMemo(() => VIEW_LABELS[view][locale], [locale, view]);
  const visibleViews = projectId
    ? ASSET_HUB_VIEWS
    : ASSET_HUB_VIEWS.filter((candidate) => candidate !== "series-kit" && candidate !== "safety");

  return (
    <div data-studio-asset-hub={view}>
      <div className="border-b border-line bg-panel/75 backdrop-blur">
        <Container size="wide" className="py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <CurrentViewIcon size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">TOONSTUDIO ASSETS</p>
                <p className="text-sm font-bold text-fg">{currentLabel}</p>
                {projectId ? (
                  <p className="mt-0.5 text-xs text-fg-3">
                    {locale === "ko" ? `프로젝트 ${projectId}에 연결` : `Connected to project ${projectId}`}
                  </p>
                ) : null}
              </div>
            </div>

            <nav aria-label={locale === "ko" ? "에셋 화면" : "Asset views"} className="overflow-x-auto">
              <div className="flex min-w-max gap-1 rounded-2xl border border-line bg-card p-1">
                {visibleViews.map((candidate) => {
                  const active = candidate === view;
                  const Icon = VIEW_ICONS[candidate];
                  return (
                    <Link
                      key={candidate}
                      href={assetHubHref(candidate, projectId)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                        active
                          ? "bg-accent text-on-accent"
                          : "text-fg-2 hover:bg-raised hover:text-fg",
                      )}
                    >
                      <Icon size={15} aria-hidden="true" />
                      {VIEW_LABELS[candidate][locale]}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        </Container>
      </div>

      {view === "overview" ? <StudioAssetsPage /> : null}
      {view === "series-kit" && projectId ? (
        <Container size="wide" className="py-7 sm:py-10">
          <StudioSeriesKitPanel projectId={projectId} locale={locale} />
        </Container>
      ) : null}
      {view === "series-kit" && !projectId ? <MissingProjectView locale={locale} view="series-kit" /> : null}
      {view === "library" ? <MarketLibraryPage /> : null}
      {view === "market" ? <MarketBrowsePage /> : null}
      {view === "safety" && projectId ? (
        <Container size="wide" className="py-7 sm:py-10">
          <StudioAssetGovernancePanel projectId={projectId} locale={locale} />
        </Container>
      ) : null}
      {view === "safety" && !projectId ? <MissingProjectView locale={locale} view="safety" /> : null}
      {view === "seller" ? <MarketManagePage /> : null}
    </div>
  );
}
