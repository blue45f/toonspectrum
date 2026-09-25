import {
  formatI18nTemplate,
  translateBilingualValueForLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowUpRight, Heart, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  filterSiteDirectory,
  siteDirectoryEntryMetadata,
  type SiteDirectoryEntry,
} from "./site-directory-search";
import "./site-directory-search.css";

import Link from "@/shared/navigation/router-link";
import { siteNavigationText, type SiteNavigationLocale } from "@/shared/components/site-navigation";
import {
  readFavoriteSiteRoutes,
  setFavoriteSiteRoute,
  SITE_ROUTE_PREFERENCES_EVENT,
} from "@/shared/lib/site-route-history";
import type {
  SiteRouteAccess,
  SiteRouteDevice,
  SiteRouteMaturity,
  SiteRouteProduct,
  SiteRoutePurpose,
} from "@/shared/lib/site-route-metadata";


const PRODUCT_VALUES = ["studio", "spectrum", "docs"] as const satisfies readonly SiteRouteProduct[];
const PURPOSE_VALUES = ["create", "discover", "learn", "connect", "manage", "trust"] as const satisfies readonly SiteRoutePurpose[];
const MATURITY_VALUES = ["stable", "beta", "experimental"] as const satisfies readonly SiteRouteMaturity[];
const ACCESS_VALUES = ["public", "sign-in", "project"] as const satisfies readonly SiteRouteAccess[];
const DEVICE_VALUES = ["responsive", "desktop-first"] as const satisfies readonly SiteRouteDevice[];

type FilterName = "product" | "purpose" | "maturity" | "access" | "device";

const FILTER_COPY = {
  ko: {
    all: "전체",
    product: "제품",
    purpose: "목적",
    maturity: "안정성",
    access: "사용 조건",
    device: "환경",
    favorites: "즐겨찾기만",
    reset: "필터 초기화",
    showFilters: "조건으로 좁혀 찾기",
    productValues: { studio: "Studio", spectrum: "작품 탐색", docs: "도움·정책" },
    purposeValues: { create: "만들기", discover: "발견", learn: "배우기", connect: "함께하기", manage: "관리", trust: "신뢰·정책" },
    maturityValues: { stable: "안정", beta: "베타", experimental: "실험" },
    accessValues: { public: "바로 사용", "sign-in": "로그인 필요", project: "프로젝트 필요" },
    deviceValues: { responsive: "모든 기기", "desktop-first": "데스크톱 권장" },
    addFavorite: "즐겨찾기에 추가",
    removeFavorite: "즐겨찾기에서 제거",
  },
  en: {
    all: "All",
    product: "Product",
    purpose: "Purpose",
    maturity: "Readiness",
    access: "Access",
    device: "Device",
    favorites: "Favorites only",
    reset: "Reset filters",
    showFilters: "Narrow by conditions",
    productValues: { studio: "Studio", spectrum: "Story discovery", docs: "Help & policy" },
    purposeValues: { create: "Create", discover: "Discover", learn: "Learn", connect: "Connect", manage: "Manage", trust: "Trust & policy" },
    maturityValues: { stable: "Stable", beta: "Beta", experimental: "Experimental" },
    accessValues: { public: "Open now", "sign-in": "Sign-in required", project: "Project required" },
    deviceValues: { responsive: "All devices", "desktop-first": "Desktop recommended" },
    addFavorite: "Add to favorites",
    removeFavorite: "Remove from favorites",
  },
} as const;

function allowedParam<T extends string>(value: string | null, allowed: readonly T[]): T | "all" {
  return value && allowed.includes(value as T) ? value as T : "all";
}

export function SiteDirectorySearch({ entries, locale }: { entries: readonly SiteDirectoryEntry[]; locale: SiteNavigationLocale }) {
  useBilingualI18nRevision();
  const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
    translateBilingualValueForLocale(locale, "SiteDirectorySearch", ko, en);
  const [params, setParams] = useSearchParams();
  const [favorites, setFavorites] = useState<string[]>(() => readFavoriteSiteRoutes());
  const query = (params.get("menu") ?? "").slice(0, 160);
  const product = allowedParam(params.get("product"), PRODUCT_VALUES);
  const purpose = allowedParam(params.get("purpose"), PURPOSE_VALUES);
  const maturity = allowedParam(params.get("maturity"), MATURITY_VALUES);
  const access = allowedParam(params.get("access"), ACCESS_VALUES);
  const device = allowedParam(params.get("device"), DEVICE_VALUES);
  const favoritesOnly = params.get("saved") === "1";
  const copy = bi((FILTER_COPY).ko, (FILTER_COPY).en);
  const activeFilters = product !== "all" || purpose !== "all" || maturity !== "all" || access !== "all" || device !== "all" || favoritesOnly;
  const results = useMemo(() => filterSiteDirectory(entries, query, {
    product,
    purpose,
    maturity,
    access,
    device,
    favorites,
    favoritesOnly,
  }), [access, device, entries, favorites, favoritesOnly, maturity, product, purpose, query]);
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLUListElement>(null);


  useEffect(() => {
    const sync = () => setFavorites(readFavoriteSiteRoutes());
    window.addEventListener(SITE_ROUTE_PREFERENCES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SITE_ROUTE_PREFERENCES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const updateParam = (name: string, value: string, emptyValue = "all") => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (!value || value === emptyValue) next.delete(name);
      else next.set(name, value.slice(0, 160));
      return next;
    }, { replace: true, preventScrollReset: true });
  };
  const setQuery = (value: string) => updateParam("menu", value, "");
  const reset = () => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const key of ["menu", "product", "purpose", "maturity", "access", "device", "saved"]) next.delete(key);
      return next;
    }, { replace: true, preventScrollReset: true });
    inputRef.current?.focus();
  };
  const toggleFavorite = (path: string) => {
    const nextFavorite = !favorites.includes(path);
    setFavorites(setFavoriteSiteRoute(path, nextFavorite));
  };
  const visibleResults = query.trim() || activeFilters;

  const select = <T extends string>(
    name: FilterName,
    label: string,
    value: T | "all",
    values: readonly T[],
    labels: Readonly<Record<T, string>>,
  ) => (
    <label className="directory-search__filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => updateParam(name, event.target.value)}>
        <option value="all">{copy.all}</option>
        {values.map((option) => <option key={option} value={option}>{labels[option]}</option>)}
      </select>
    </label>
  );

  return (
    <section className="directory-search" aria-labelledby={`${id}-label`}>
      <form role="search" aria-labelledby={`${id}-label`} onSubmit={(event) => {
        event.preventDefault();
        resultRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
      }}>
        <label id={`${id}-label`} htmlFor={`${id}-query`}>{bi("메뉴·도구 바로 찾기", "Find a page or tool")}</label>
        <p id={`${id}-hint`}>{bi("이름, 하고 싶은 일, 제품 상태를 검색하세요. 예: 학습 기록, 베타 3D, 로그인 필요", "Search a name, task or product state: learning records, beta 3D, sign-in required.")}</p>
        <div className="directory-search__field">
          <Search size={20} aria-hidden="true" />
          <input ref={inputRef} id={`${id}-query`} type="search" value={query} maxLength={160} onChange={(event) => setQuery(event.target.value)} aria-describedby={`${id}-hint`} autoComplete="off" enterKeyHint="search" placeholder={bi("어떤 공간을 찾으세요?", "Where would you like to go?")} />
          {query && <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label={bi("메뉴 검색 지우기", "Clear page search")}><X size={18} aria-hidden="true" /></button>}
        </div>
        <details className="directory-search__filters" open={activeFilters || undefined}>
          <summary><SlidersHorizontal size={16} aria-hidden="true" />{copy.showFilters}</summary>
          <div className="directory-search__filter-grid">
            {select("product", copy.product, product, PRODUCT_VALUES, copy.productValues)}
            {select("purpose", copy.purpose, purpose, PURPOSE_VALUES, copy.purposeValues)}
            {select("maturity", copy.maturity, maturity, MATURITY_VALUES, copy.maturityValues)}
            {select("access", copy.access, access, ACCESS_VALUES, copy.accessValues)}
            {select("device", copy.device, device, DEVICE_VALUES, copy.deviceValues)}
            <button
              type="button"
              className="directory-search__saved-filter"
              data-active={favoritesOnly || undefined}
              aria-pressed={favoritesOnly}
              aria-label={`${copy.favorites}: ${favorites.length}`}
              onClick={() => updateParam("saved", favoritesOnly ? "" : "1", "")}
            >
              <Heart size={16} fill={favoritesOnly ? "currentColor" : "none"} aria-hidden="true" />{copy.favorites}
              <span>{favorites.length}</span>
            </button>
          </div>
          {activeFilters ? <button type="button" className="directory-search__reset" onClick={reset}>{copy.reset}</button> : null}
        </details>
      </form>
      <p className="directory-search__status" role="status" aria-live="polite" aria-atomic="true">
        {visibleResults
          ? (formatI18nTemplate(String(bi("{value0}개의 목적지를 찾았습니다.", "{value0} destinations found.")), { value0: results.length }))
          : (formatI18nTemplate(String(bi("전체 {value0}개 목적지에서 검색하거나 조건을 선택하세요.", "Search or filter {value0} destinations.")), { value0: filterSiteDirectory(entries, "").length }))}
      </p>
      {visibleResults && (results.length ? (
        <ul ref={resultRef} className="directory-search__results" aria-label={bi("메뉴 검색 결과", "Page search results")}>
          {results.map((entry) => {
            const metadata = siteDirectoryEntryMetadata(entry);
            const favorite = favorites.includes(metadata.canonicalPath);
            return <li key={metadata.canonicalPath} className="directory-search__result">
              <Link href={metadata.canonicalPath}>
                <strong>{siteNavigationText(entry.label, locale)}</strong>
                <span>{siteNavigationText(entry.description, locale)}</span>
                <span className="directory-search__badges" aria-label={bi("페이지 상태", "Page status")}>
                  <small data-kind={metadata.product}>{copy.productValues[metadata.product]}</small>
                  <small data-kind={metadata.maturity}>{copy.maturityValues[metadata.maturity]}</small>
                  {metadata.access !== "public" ? <small data-kind={metadata.access}>{copy.accessValues[metadata.access]}</small> : null}
                  {metadata.device === "desktop-first" ? <small data-kind="desktop">{copy.deviceValues[metadata.device]}</small> : null}
                </span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              <button
                type="button"
                className="directory-search__favorite"
                aria-label={`${siteNavigationText(entry.label, locale)} · ${favorite ? copy.removeFavorite : copy.addFavorite}`}
                aria-pressed={favorite}
                onClick={() => toggleFavorite(metadata.canonicalPath)}
              >
                <Heart size={17} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
              </button>
            </li>;
          })}
        </ul>
      ) : <div className="directory-search__empty">
        <p>{bi("조건에 맞는 목적지가 없습니다. 검색어 또는 필터를 줄여보세요.", "No destination matches these conditions. Try fewer words or filters.")}</p>
        <button type="button" onClick={reset}>{activeFilters ? copy.reset : (bi("검색 초기화", "Reset search"))}</button>
      </div>)}
    </section>
  );
}
