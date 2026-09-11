import { Boxes, Library, Search, Store } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { MarketBrowsePage } from "@/domains/market/pages/MarketBrowsePage";
import { MarketLibraryPage } from "@/domains/market/pages/MarketCloudLibraryPage";
import { MarketManagePage } from "@/domains/market/pages/MarketOwnedResourcesPage";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { StudioAssetsPage } from "./StudioFrontDoorPages";

const ASSET_HUB_VIEWS = ["overview", "library", "market", "seller"] as const;

type AssetHubView = (typeof ASSET_HUB_VIEWS)[number];
type Locale = "ko" | "en";

const VIEW_LABELS: Readonly<Record<AssetHubView, Readonly<Record<Locale, string>>>> = {
  overview: { ko: "에셋 홈", en: "Asset home" },
  library: { ko: "내 에셋", en: "My assets" },
  market: { ko: "마켓에서 찾기", en: "Browse market" },
  seller: { ko: "판매자 센터", en: "Seller center" },
};

const VIEW_ICONS = {
  overview: Boxes,
  library: Library,
  market: Search,
  seller: Store,
} as const;

/** Convert an application language tag into the locales supported by this shell. */
function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

/** Resolve a user-supplied query value without allowing unknown asset-hub surfaces. */
export function resolveStudioAssetHubView(value: string | null): AssetHubView {
  return ASSET_HUB_VIEWS.includes(value as AssetHubView) ? value as AssetHubView : "overview";
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

/** Render the one canonical Studio asset destination over existing server-backed capabilities. */
export function StudioAssetHubPage() {
  const [searchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const view = resolveStudioAssetHubView(searchParams.get("view"));
  const projectId = searchParams.get("project");
  const CurrentViewIcon = VIEW_ICONS[view];

  const currentLabel = useMemo(() => VIEW_LABELS[view][locale], [locale, view]);

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
                {ASSET_HUB_VIEWS.map((candidate) => {
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
      {view === "library" ? <MarketLibraryPage /> : null}
      {view === "market" ? <MarketBrowsePage /> : null}
      {view === "seller" ? <MarketManagePage /> : null}
    </div>
  );
}
