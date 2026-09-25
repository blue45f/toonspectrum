import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { ProviderStatus } from "./ProviderStatus";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { downloadText, useCreatorWorkspace } from "./workspace";

import type { CreatorResource, ResourceSearchResult } from "@/shared/lib/creator-resources";

import { attributionMarkdown, deadlineCalendar, deadlineLabel, parseSearchResult, RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import { apiPath } from "@/platform/api";

import { RESOURCE_SEARCH_CONFIG } from "./resource-search-config";

import type { ResourceSearchProvider } from "./resource-search-config";

function resourceUsageLabel(item: CreatorResource): string {
  if (item.license === "CC0") return "공개 이용 확인";
  if (item.license === "CC-BY-4.0") return "출처표시 이용";
  if (item.license === "reference-only") return "레퍼런스 전용";
  if (item.license === "book-promotion") return "도서 소개 목적";
  return "정보·원문 링크";
}
function resourceUsageDescription(item: CreatorResource): string {
  if (item.license === "CC0") return "공식 제공처의 공개 이용 표시를 확인했습니다. 초상·상표 등 기타 권리는 별도 확인하세요.";
  if (item.license === "CC-BY-4.0") return "출처표시가 필요한 공개 데이터입니다. 결과와 함께 제공기관·라이선스·조회 시점을 보존하세요.";
  if (item.license === "reference-only") return "안전한 미리보기와 메타데이터만 저장합니다. 작품별 권리·표장·초상·제3자 조건을 확인하기 전 Studio 직접 가져오기는 허용하지 않습니다.";
  if (item.license === "book-promotion") return "도서 소개·홍보 목적의 서지정보입니다. 원본 데이터 재판매나 임의 변경은 허용 범위를 다시 확인하세요.";
  return "검색 메타데이터입니다. 이미지·본문 재배포 또는 각색 허락을 의미하지 않습니다.";
}
function GoogleFontPreview({ family }: { family: string }) {
  const safeFamily = family.replace(/["'\\]/gu, "");
  useEffect(() => {
    if (!safeFamily) return;
    const id = `toonstudio-google-font-${safeFamily.toLocaleLowerCase("en").replace(/[^a-z0-9]+/gu, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(safeFamily).replace(/%20/gu, "+")}&display=swap`;
    document.head.append(link);
  }, [safeFamily]);
  return <div className="border-b border-line bg-raised px-5 py-6" aria-label={`${family} 글꼴 미리보기`}>
    <p className="break-words text-2xl leading-relaxed text-fg" style={{ fontFamily: `"${safeFamily}", sans-serif` }}>가나다라마바사 ABC 123</p>
    <p className="mt-2 text-xs text-fg-3">실제 브라우저 렌더링 · 문구와 글리프 지원은 상세 페이지 확인</p>
  </div>;
}

export function ResourceCard({ item, saved, onToggle, disabled }: { item: CreatorResource; saved: boolean; onToggle: () => void; disabled: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
    {item.imageUrl && !imageFailed && <img src={item.imageUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="h-52 w-full bg-raised object-contain p-3" />}
    {item.provider === "googlefonts" && <GoogleFontPreview family={item.title} />}
    <div className="flex flex-1 flex-col space-y-3 p-5">
      <p className="text-xs font-semibold text-accent">{RESOURCE_LABELS[item.provider]} · {resourceUsageLabel(item)}</p>
      <h2 className="break-words text-lg font-bold">{item.title}</h2>
      <p className="text-sm text-fg-2">{item.creator || "저작자·기관 원문 확인"}{item.dateLabel ? ` · ${item.dateLabel}` : ""}</p>
      {item.description && <p className="break-words text-sm leading-6 text-fg-2">{item.description}</p>}
      {item.provider === "bizinfo" && <div className="rounded-lg bg-raised p-3 text-sm leading-6"><p className="font-semibold">{deadlineLabel(item.deadline)}</p><p>신청 대상: {item.eligibility}</p></div>}
      {item.isbn && <p className="text-xs text-fg-2">ISBN: {item.isbn}</p>}
      <details className="text-xs leading-6 text-fg-2"><summary className="cursor-pointer py-2">출처·이용조건·조회일</summary>
        <p>{item.credit || "크레딧 원문 확인"}</p><p>{resourceUsageDescription(item)}</p>
        {item.licenseUrl && <a className="underline" href={item.licenseUrl} target="_blank" rel="noopener noreferrer">이용조건 확인 ↗</a>}
        <p>조회: {item.fetchedAt}</p>
      </details>
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <a href={item.sourceUrl} className={RESOURCE_BUTTON} target="_blank" rel="noopener noreferrer">원문 확인 ↗</a>
        <button className={RESOURCE_BUTTON} aria-pressed={saved} disabled={disabled} onClick={onToggle}>{saved ? "저장 해제" : "보드에 저장"}</button>
        {item.provider === "bizinfo" && item.deadline && <button className={RESOURCE_BUTTON} onClick={() => downloadText("opportunity-deadline.ics", deadlineCalendar(item), "text/calendar;charset=utf-8")}>마감일 일정 파일</button>}
      </div>
    </div>
  </article>;
}
export function ResourceSearchPage({ provider }: { provider: ResourceSearchProvider }) {
  const config = RESOURCE_SEARCH_CONFIG[provider];
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const pageValue = Number(params.get("page") ?? 1);
  const page = Number.isInteger(pageValue) && pageValue >= 1 && pageValue <= 20 ? pageValue : 1;
  const [draft, setDraft] = useState(query);
  const [savedOnly, setSavedOnly] = useState(false);
  const [result, setResult] = useState<ResourceSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [retry, setRetry] = useState(0);
  const { workspace, update, error, ready, saving, writable } = useCreatorWorkspace();
  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => {
    setResult(null); setRequestError("");
    if (savedOnly || !query) { setLoading(false); return; }
    if (query.trim().length < 2 || query.length > 80) { setLoading(false); setRequestError("검색어를 2~80자로 입력하세요."); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 30000);
    let disposed = false;
    setLoading(true);
    const search = new URLSearchParams({ provider, q: query, page: String(page) });
    void fetch(apiPath(`/api/creator-resources/search?${search}`), { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (response.status === 429) throw new Error("요청이 많습니다. 1분 후 다시 검색하세요.");
        if (!response.ok) throw new Error("검색 서버에 연결하지 못했습니다. 공식 사이트를 이용하거나 다시 시도하세요.");
        const parsed = parseSearchResult(await response.json());
        if (!parsed || parsed.provider !== provider) throw new Error("검색 응답의 형식을 확인하지 못했습니다.");
        if (!disposed) setResult(parsed);
      }).catch((cause: unknown) => {
        if (!disposed) setRequestError(controller.signal.aborted ? "검색 시간이 초과되었습니다. 다시 시도하세요." : cause instanceof Error ? cause.message : "검색하지 못했습니다.");
      }).finally(() => { window.clearTimeout(timeout); if (!disposed) setLoading(false); });
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [provider, query, page, retry, savedOnly]);
  const savedItems = workspace.saved.filter((item) => item.provider === provider);
  const items = savedOnly ? savedItems : result?.items ?? [];
  const toggle = (item: CreatorResource) => {
    const remove = workspace.saved.some((saved) => saved.id === item.id);
    void update((value) => ({ ...value,
      saved: remove ? value.saved.filter((saved) => saved.id !== item.id)
        : value.saved.some((saved) => saved.id === item.id) ? value.saved : [...value.saved, item],
    }));
  };
  const searchFor = (q: string) => { setSavedOnly(false); setParams({ q, page: "1" }); };
  return <ResourceLayout title={config.title} intro={config.intro}>
    <ProviderStatus provider={provider} />
    <form className="space-y-3 rounded-2xl border border-line bg-panel p-5" onSubmit={(event) => { event.preventDefault(); searchFor(draft.trim()); }}>
      <label htmlFor={`resource-query-${provider}`} className="block text-sm font-semibold">{RESOURCE_LABELS[provider]} 검색</label>
      <div className="flex flex-col gap-3 sm:flex-row"><input id={`resource-query-${provider}`} className={RESOURCE_INPUT} type="search" required minLength={2} maxLength={80} value={draft} placeholder={config.hint} onChange={(event) => setDraft(event.target.value)} /><button className={`${RESOURCE_BUTTON} shrink-0 bg-accent-soft`} type="submit">검색하기</button></div>
      <div className="flex flex-wrap gap-2">{config.examples.map((value) => <button key={value} type="button" className={RESOURCE_BUTTON} onClick={() => searchFor(value)}>{value}</button>)}</div>
    </form>
    <div className="flex flex-wrap items-center gap-3">
      <button className={RESOURCE_BUTTON} aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>검색 결과</button>
      <button className={RESOURCE_BUTTON} aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}>저장한 자료 {savedItems.length}</button>
      <button className={RESOURCE_BUTTON} disabled={!savedItems.length} onClick={() => downloadText(`${provider}-sources.md`, attributionMarkdown(savedItems))}>출처 내보내기</button>
      <Link className={RESOURCE_BUTTON} to="/research">전체 저장 보드 검색·정렬</Link>
      <a href={config.url} className={RESOURCE_BUTTON} target="_blank" rel="noopener noreferrer">공식 사이트 ↗</a>
      {provider === "kakao" && <Link className={RESOURCE_BUTTON} to="/search">기존 웹툰·작품 검색</Link>}
    </div>
    <div aria-live="polite" aria-atomic="true" className="text-sm leading-6 text-fg-2">
      {!savedOnly && loading && <p role="status">공식 제공처에서 자료를 확인하고 있습니다…</p>}
      {!savedOnly && requestError && <p role="alert">{requestError}</p>}
      {!savedOnly && result && <p>{result.status === "not_configured" ? "API 연결 대기 · " : result.status === "unavailable" ? "일시적으로 이용 불가 · " : ""}{result.message}</p>}
      {!savedOnly && !query && <p>검색어를 입력하거나 추천 키워드를 선택하세요. 외부 API는 검색할 때만 호출합니다.</p>}
      {!loading && !items.length && (savedOnly || result?.status === "ready") && <p>{savedOnly ? "이 제공처에서 저장한 자료가 없습니다." : "현재 검색 범위에 표시할 자료가 없습니다. 다른 검색어 또는 다음 페이지를 확인하세요."}</p>}
    </div>
    {!savedOnly && (requestError || result?.status === "unavailable" || result?.status === "partial") && <button className={RESOURCE_BUTTON} onClick={() => setRetry((value) => value + 1)}>다시 시도</button>}
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-busy={!savedOnly && loading}>
      {items.map((item) => <ResourceCard key={item.id} item={item} saved={workspace.saved.some((saved) => saved.id === item.id)} disabled={!ready || !writable || saving} onToggle={() => toggle(item)} />)}
    </div>
    {!savedOnly && result && (result.status === "ready" || result.status === "partial") && <nav className="flex items-center justify-center gap-4" aria-label="검색 결과 페이지">
      <button className={RESOURCE_BUTTON} disabled={page <= 1 || loading} onClick={() => setParams({ q: query, page: String(page - 1) })}>이전</button><span>{page} 페이지</span>
      <button className={RESOURCE_BUTTON} disabled={!result.hasMore || loading} onClick={() => setParams({ q: query, page: String(page + 1) })}>다음</button>
    </nav>}
    <LocalSaveNotice error={error} writable={writable} saving={saving} />
  </ResourceLayout>;
}
export function ReferencesPage() { return <ResourceSearchPage provider="met" />; }
export function OpportunitiesPage() { return <ResourceSearchPage provider="bizinfo" />; }
export function WorksPage() { return <ResourceSearchPage provider="kakao" />; }
export function PolyHavenPage() { return <ResourceSearchPage provider="polyhaven" />; }
export function AmbientCgPage() { return <ResourceSearchPage provider="ambientcg" />; }
export function NasaImagesPage() { return <ResourceSearchPage provider="nasa" />; }
export function VamCollectionsPage() { return <ResourceSearchPage provider="vam" />; }
export function RijksmuseumPage() { return <ResourceSearchPage provider="rijksmuseum" />; }
export function GoogleFontsPage() { return <ResourceSearchPage provider="googlefonts" />; }
export function GbifPage() { return <ResourceSearchPage provider="gbif" />; }
export function MusicBrainzPage() { return <ResourceSearchPage provider="musicbrainz" />; }
export function InternetArchivePage() { return <ResourceSearchPage provider="internetarchive" />; }
export function MetWeatherPage() { return <ResourceSearchPage provider="metweather" />; }
export function KoreanHeritagePage() { return <ResourceSearchPage provider="kheritage" />; }
export function NeisSchoolPage() { return <ResourceSearchPage provider="neis" />; }
export function TourApiPage() { return <ResourceSearchPage provider="tourapi" />; }
export function KoreanDictionaryPage() { return <ResourceSearchPage provider="korean" />; }
export function SmithsonianPage() { return <ResourceSearchPage provider="smithsonian" />; }
export function WikimediaInterestPage() { return <ResourceSearchPage provider="wikimedia" />; }
export function EuropeanaPage() { return <ResourceSearchPage provider="europeana" />; }
export function DplaPage() { return <ResourceSearchPage provider="dpla" />; }
