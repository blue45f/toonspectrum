import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { Clock3, Heart, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { siteDirectoryEntryMetadata, type SiteDirectoryEntry } from "./site-directory-search";

import Link from "@/shared/navigation/router-link";
import { siteNavigationText, type SiteNavigationLocale } from "@/shared/components/site-navigation";
import {
  readFavoriteSiteRoutes,
  readRecentSiteRoutes,
  setFavoriteSiteRoute,
  SITE_ROUTE_PREFERENCES_EVENT,
  type RecentSiteRoute,
} from "@/shared/lib/site-route-history";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("SiteDirectoryPersonalized", ko, en);

interface PersonalizedState {
  readonly favorites: readonly string[];
  readonly recent: readonly RecentSiteRoute[];
}

function readState(): PersonalizedState {
  return { favorites: readFavoriteSiteRoutes(), recent: readRecentSiteRoutes() };
}

export function SiteDirectoryPersonalized({ entries, locale }: {
  readonly entries: readonly SiteDirectoryEntry[];
  readonly locale: SiteNavigationLocale;
}) {
  useBilingualI18nRevision();
  const [state, setState] = useState<PersonalizedState>({ favorites: [], recent: [] });
  const byPath = useMemo(() => new Map(entries.map((entry) => [siteDirectoryEntryMetadata(entry).canonicalPath, entry])), [entries]);
  const favorites = state.favorites.flatMap((path) => byPath.get(path) ?? []).slice(0, 6);
  const recent = state.recent
    .filter(({ path }) => path !== "/sitemap" && !state.favorites.includes(path))
    .flatMap(({ path }) => byPath.get(path) ?? [])
    .slice(0, 6);


  useEffect(() => {
    const sync = () => setState(readState());
    sync();
    window.addEventListener(SITE_ROUTE_PREFERENCES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SITE_ROUTE_PREFERENCES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (favorites.length === 0 && recent.length === 0) return null;

  const renderSection = (
    id: string,
    title: string,
    Icon: typeof Heart,
    items: readonly SiteDirectoryEntry[],
    favoriteSection: boolean,
  ) => items.length ? (
    <section aria-labelledby={id} className="directory-personalized__section">
      <h3 id={id}><Icon size={16} aria-hidden="true" />{title}</h3>
      <ul>
        {items.map((entry) => {
          const metadata = siteDirectoryEntryMetadata(entry);
          return <li key={metadata.canonicalPath}>
            <Link href={metadata.canonicalPath}>
              <strong>{siteNavigationText(entry.label, locale)}</strong>
              <span>{siteNavigationText(entry.description, locale)}</span>
            </Link>
            {favoriteSection ? <button
              type="button"
              aria-label={`${siteNavigationText(entry.label, locale)} · ${bi("즐겨찾기에서 제거", "Remove from favorites")}`}
              onClick={() => setFavoriteSiteRoute(metadata.canonicalPath, false)}
            ><Heart size={16} fill="currentColor" aria-hidden="true" /></button> : null}
          </li>;
        })}
      </ul>
    </section>
  ) : null;

  return (
    <section className="directory-personalized" aria-labelledby="directory-personalized-title">
      <div className="directory-personalized__heading">
        <Star size={18} aria-hidden="true" />
        <div>
          <h2 id="directory-personalized-title">{bi("내가 자주 쓰는 공간", "Your quick destinations")}</h2>
          <p>{bi("즐겨찾기와 최근 방문을 이 기기에만 저장합니다.", "Favorites and recent visits stay on this device.")}</p>
        </div>
      </div>
      <div className="directory-personalized__grid">
        {renderSection("directory-favorites-title", bi("즐겨찾기", "Favorites"), Heart, favorites, true)}
        {renderSection("directory-recent-title", bi("최근 방문", "Recently visited"), Clock3, recent, false)}
      </div>
    </section>
  );
}
