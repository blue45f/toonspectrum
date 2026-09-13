import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CatalogResearchNotebook } from "./CatalogResearchNotebook";
import { downloadResearchFile, loadCatalogResearch } from "./catalog-research-data";
import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { ResourceLayout } from "./ResourceLayout";
import { countResearchFacets, readResearchFilters, readResearchSelection, RESEARCH_LIMIT, RESEARCH_PAGE_SIZE, RESEARCH_STATUSES, RESEARCH_STATUS_LABELS, researchCsv, selectResearchWorks } from "@/shared/lib/catalog-research";
import { PLATFORM_LIST } from "@/shared/lib/platforms";
import type { LoadedResearch } from "./catalog-research-data";
import type { ResearchCount, ResearchWork } from "@/shared/lib/catalog-research";

const platformName = (id: string): string => PLATFORM_LIST.find((platform) => platform.id === id)?.name ?? id;
const count = (value: number): string => value.toLocaleString("ko-KR");
const collected = (value: string | null): string => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "기록 없음";
const BOX = "rounded-2xl border border-line bg-panel p-5 sm:p-6";
function Distribution({ title, rows, total, onSelect, platform = false }: { title: string; rows: ResearchCount[]; total: number; onSelect: (value: string) => void; platform?: boolean }) {
  return <section className={BOX} aria-label={title}><h2 className="text-lg font-bold">{title}</h2>
    <p className="mt-2 text-xs leading-6 text-fg-3">현재 조건 {count(total)}편이 분모입니다. 중복 분류로 합계가 100%를 넘을 수 있습니다. 상위 8개 표시.</p>
    <div className="mt-4 space-y-2">{rows.slice(0, 8).map((row) => <button type="button" key={row.name} onClick={() => onSelect(row.name)} className="block min-h-14 w-full rounded-lg p-2 text-left hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent">
      <span className="flex justify-between gap-3 text-sm"><span>{platform ? platformName(row.name) : row.name}</span><span className="shrink-0 tabular-nums">{count(row.count)}편 · {row.share.toFixed(1)}%</span></span>
      <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-raised"><span className="block h-full rounded-full bg-accent" style={{ width: `${row.share}%` }} /></span></button>)}</div>
    {!rows.length && <p className="mt-4 text-sm text-fg-2">이 조건에서 집계할 분류가 없습니다.</p>}</section>;
}
function WorkMetadata({ work }: { work: ResearchWork }) {
  return <dl className="mt-3 space-y-2 text-sm leading-6 text-fg-2"><div><dt className="inline text-fg-3">작가 </dt><dd className="inline">{work.author || "미상"}</dd></div>
    <div><dt className="inline text-fg-3">형식·상태 </dt><dd className="inline">{work.type === "webtoon" ? "웹툰" : "웹소설"} · {RESEARCH_STATUS_LABELS[work.status] ?? "상태 미상"} · {work.year ? `${work.year}년 기록` : "연도 미상"}</dd></div>
    <div><dt className="inline text-fg-3">장르 </dt><dd className="inline">{work.genres.join(" · ") || "미상"}</dd></div>
    <div><dt className="inline text-fg-3">플랫폼 </dt><dd className="inline">{work.platforms.map(platformName).join(" · ") || "미상"}</dd></div></dl>;
}
export function CatalogResearchPage() {
  const [params, setParams] = useSearchParams(); const { pathname } = useLocation(); const notebookView = pathname.endsWith("/notebook");
  const [state, setState] = useState<{ data: LoadedResearch | null; error: string; loading: boolean }>({ data: null, error: "", loading: true });
  const [attempt, setAttempt] = useState(0); const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void loadCatalogResearch(attempt > 0).then((data) => { if (active) setState({ data, error: "", loading: false }); })
      .catch((error: unknown) => { if (active) setState({ data: null, error: error instanceof Error ? error.message : "색인을 읽지 못했습니다.", loading: false }); });
    return () => { active = false; };
  }, [attempt]);
  function update(key: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== "page") next.delete("page"); setParams(next); }
  function setSelection(ids: string[]) { update("compare", [...new Set(ids)].slice(0, RESEARCH_LIMIT).join(",")); }
  function retry() { setState({ ...state, loading: true, error: "" }); setAttempt((value) => value + 1); }
  const filters = readResearchFilters(params); const ids = readResearchSelection(params);
  const works = state.data?.dataset.works ?? []; const snapshot = state.data?.dataset.snapshot;
  const selected = ids.map((id) => works.find((work) => work.id === id)).filter((work): work is ResearchWork => Boolean(work && (filters.mature || !work.mature)));
  const filtered = selectResearchWorks(works, filters);
  const sorted = filters.sort === "year" ? [...filtered].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title, "ko")) : filtered;
  const pages = Math.max(1, Math.ceil(sorted.length / RESEARCH_PAGE_SIZE)); const rawPage = Number(params.get("page"));
  const page = Number.isSafeInteger(rawPage) ? Math.max(1, Math.min(pages, rawPage)) : 1;
  const displayed = sorted.slice((page - 1) * RESEARCH_PAGE_SIZE, page * RESEARCH_PAGE_SIZE);
  const genres = countResearchFacets(filtered, "genres"); const platforms = countResearchFacets(filtered, "platforms"); const tags = countResearchFacets(filtered, "tags");
  const allGenres = countResearchFacets(works, "genres"); const allPlatforms = countResearchFacets(works, "platforms");
  function toggle(work: ResearchWork) { setSelection(ids.includes(work.id) ? ids.filter((id) => id !== work.id) : [...ids, work.id]); }
  async function share() { try { const safe = new URLSearchParams(); for (const key of ["q", "genre", "tag", "platform", "type", "status", "sort", "mature", "compare"]) { const value = params.get(key); if (value) safe.set(key, value); }
    await navigator.clipboard.writeText(`${window.location.origin}${pathname}?${safe}`); setMessage("검색 조건과 비교 작품 링크를 복사했습니다. 기획 노트는 포함되지 않습니다.");
  } catch { setMessage("링크를 복사하지 못했습니다. 주소 표시줄에서 검색 주소를 복사하세요."); } }
  function exportSelected() { try { downloadResearchFile("toonstudio-comparison.csv", researchCsv(selected), "text/csv;charset=utf-8"); setMessage("선택한 작품의 메타데이터를 CSV로 내보냈습니다."); } catch { setMessage("파일을 내보내지 못했습니다. 일반 브라우저에서 다시 시도하세요."); } }
  const suffix = params.size ? `?${params}` : "";
  return <ResourceLayout width="wide" title={notebookView ? "작품 비교·기획 노트" : "작품 리서치 랩"} intro="수집된 작품 메타데이터에서 장르와 소재를 조사하고, 비교한 관찰을 나만의 첫 화 기획으로 연결하세요. 작품 본문이나 이미지를 복제하지 않습니다.">
    <nav aria-label="작품 리서치 도구" className="flex flex-wrap gap-2"><Link to={`/research/catalog${suffix}`} aria-current={!notebookView ? "page" : undefined} className={RESOURCE_BUTTON}>작품 탐색·분포</Link>
      <Link to={`/research/catalog/notebook${suffix}`} aria-current={notebookView ? "page" : undefined} className={RESOURCE_BUTTON}>비교·기획 노트 ({selected.length}/4)</Link></nav>
    {state.loading && <p role="status" className={BOX}>작품 리서치 색인을 불러오고 있습니다…</p>}
    {state.error && <div role="alert" className={BOX}><p>{state.error}</p><button type="button" className={`${RESOURCE_BUTTON} mt-4`} onClick={retry}>색인 다시 불러오기</button></div>}
    {snapshot && <>
      <section className={BOX} aria-label="리서치 데이터 출처"><p className="eyebrow text-accent">CATALOG SNAPSHOT · NOT LIVE RANKING</p>
        <p className="mt-3 text-sm leading-7 text-fg-2">원본 전체 수집 기록: <strong className="text-fg">{collected(snapshot.collectedAt)} (한국 시간)</strong>. 일부 KMAS 정보 보강: {collected(snapshot.enrichedAt)}.</p>
        <p className="mt-1 text-sm leading-7 text-fg-2">이 화면은 카탈로그 수록 표본입니다. 오늘의 인기, 시장점유율, 매출 또는 흥행 예측이 아닙니다. 플랫폼의 현재 정보는 작품 상세에서 원문을 확인하세요.</p>
        <p className="mt-2 text-xs leading-6 text-fg-3">색인 {snapshot.sourceHash} · 수록 {count(works.length)}편 · 중복·형식 오류로 제외 {count(snapshot.excludedCount)}건 · {state.data?.mode === "saved" ? "연결 실패로 이전에 저장한 색인을 표시합니다." : "배포된 정적 색인을 읽었습니다."}</p>
        <p className="mt-1 text-xs leading-6 text-fg-3">{state.data?.offlineReady ? "이 기기에 저장된 색인은 연결 실패 시 다시 활용합니다. 사이트 자체를 처음 여는 오프라인 접속까지 보장하지는 않습니다." : "이 환경에서는 색인 오프라인 보관을 확인하지 못했습니다."}</p>
        <button type="button" onClick={retry} disabled={state.loading} className={`${RESOURCE_BUTTON} mt-3`}>배포 색인 다시 확인</button></section>
      {!notebookView && <>
        <section className={BOX} aria-label="작품 검색 조건"><form key={filters.q} className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); update("q", String(new FormData(event.currentTarget).get("q") ?? "").trim().slice(0, 100)); }}>
          <label className="flex-1 text-sm font-semibold">작품명·작가·장르·태그 검색<input name="q" type="search" maxLength={100} defaultValue={filters.q} placeholder="예: 회귀 학원, 작가명, 작품명" className={`${RESOURCE_INPUT} mt-2`} /></label>
          <button type="submit" className={`${RESOURCE_BUTTON} self-end bg-accent text-on-accent`}>작품 검색</button></form>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-semibold">장르<select value={filters.genre} onChange={(event) => update("genre", event.target.value)} className={`${RESOURCE_INPUT} mt-2`}><option value="">모든 장르</option>{filters.genre && !allGenres.some((row) => row.name === filters.genre) && <option value={filters.genre}>{filters.genre} (수록 없음)</option>}{allGenres.map((row) => <option key={row.name}>{row.name}</option>)}</select></label>
            <label className="text-sm font-semibold">플랫폼<select value={filters.platform} onChange={(event) => update("platform", event.target.value)} className={`${RESOURCE_INPUT} mt-2`}><option value="">모든 플랫폼</option>{filters.platform && !allPlatforms.some((row) => row.name === filters.platform) && <option value={filters.platform}>{filters.platform} (수록 없음)</option>}{allPlatforms.map((row) => <option key={row.name} value={row.name}>{platformName(row.name)}</option>)}</select></label>
            <label className="text-sm font-semibold">작품 형식<select value={filters.type} onChange={(event) => update("type", event.target.value)} className={`${RESOURCE_INPUT} mt-2`}><option value="">전체 형식</option><option value="webtoon">웹툰</option><option value="webnovel">웹소설</option></select></label>
            <label className="text-sm font-semibold">연재 상태<select value={filters.status} onChange={(event) => update("status", event.target.value)} className={`${RESOURCE_INPUT} mt-2`}><option value="">전체 상태</option>{RESEARCH_STATUSES.map((status) => <option key={status} value={status}>{RESEARCH_STATUS_LABELS[status]}</option>)}</select></label>
            <label className="text-sm font-semibold">정렬<select value={filters.sort} onChange={(event) => update("sort", event.target.value)} className={`${RESOURCE_INPUT} mt-2`}><option value="title">작품명 순</option><option value="year">기록 연도 내림차순</option></select></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={filters.mature} onChange={(event) => update("mature", event.target.checked ? "true" : "")} />19세 작품 메타데이터 포함</label>
            {filters.tag && <button type="button" className={RESOURCE_BUTTON} onClick={() => update("tag", "")}>태그: {filters.tag} 해제</button>}<button type="button" className={RESOURCE_BUTTON} onClick={() => setParams(ids.length ? { compare: ids.join(",") } : {})}>검색 조건 초기화</button></div>
        </section>
        <section aria-label="검색 결과 요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
          ["현재 조건의 작품", `${count(filtered.length)}편`], ["기록된 장르", `${count(genres.length)}개`], ["기록된 플랫폼", `${count(platforms.length)}개`], ["장르 정보 미상", `${count(filtered.filter((work) => !work.genres.length).length)}편`],
        ].map(([label, value]) => <div key={label} className={BOX}><p className="text-xs text-fg-3">{label}</p><p className="mt-3 text-2xl font-bold tabular-nums">{value}</p></div>)}</section>
        <div className="grid gap-4 lg:grid-cols-2"><Distribution title="장르별 수록 분포" rows={genres} total={filtered.length} onSelect={(value) => update("genre", value)} />
          <Distribution title="플랫폼별 수록 분포" rows={platforms} total={filtered.length} onSelect={(value) => update("platform", value)} platform /></div>
        <section className={BOX}><h2 className="text-lg font-bold">함께 조사할 소재 태그</h2><p className="mt-2 text-sm leading-7 text-fg-2">현재 검색 결과에 기록된 태그입니다. 실제 줄거리 분석이나 인기 순위가 아닙니다. 상위 16개를 표시합니다.</p>
          <div className="mt-4 flex flex-wrap gap-2">{tags.slice(0, 16).map((tag) => <button type="button" key={tag.name} className={RESOURCE_BUTTON} onClick={() => update("tag", tag.name)}>{tag.name} · {count(tag.count)}</button>)}{!tags.length && <p className="text-sm text-fg-2">기록된 태그가 없습니다.</p>}</div></section>
        <section aria-labelledby="research-results-title"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="research-results-title" className="text-2xl font-bold">비교할 작품 찾기</h2><p role="status" className="text-sm text-fg-2">{count(filtered.length)}편 · {page}/{pages}페이지 · 최대 4편 비교</p></div>
          {!displayed.length && <p className={BOX}>조건에 맞는 작품이 없습니다. 검색어를 줄이거나 장르·태그 조건을 해제해 보세요.</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{displayed.map((work) => <article key={work.id} className={`${BOX} flex flex-col`}>
            <h3 className="break-words text-lg font-bold"><Link to={`/title/${encodeURIComponent(work.slug)}`} className="hover:underline">{work.title}</Link></h3><WorkMetadata work={work} />
            <div className="my-4 flex flex-wrap gap-2">{work.tags.slice(0, 6).map((tag) => <button type="button" key={tag} className="min-h-11 rounded-lg border border-line px-3 text-xs hover:bg-raised" onClick={() => update("tag", tag)}>#{tag}</button>)}</div>
            <button type="button" className={`${RESOURCE_BUTTON} mt-auto ${ids.includes(work.id) ? "bg-accent-soft text-accent" : ""}`} aria-label={`${work.title} 비교 선택`} aria-pressed={ids.includes(work.id)} onClick={() => toggle(work)} disabled={!ids.includes(work.id) && ids.length >= RESEARCH_LIMIT}>{ids.includes(work.id) ? "비교에서 빼기" : "비교에 담기"}</button>
          </article>)}</div>
          <nav aria-label="작품 결과 페이지" className="mt-6 flex items-center justify-center gap-4"><button type="button" className={RESOURCE_BUTTON} disabled={page <= 1} onClick={() => update("page", String(page - 1))}>이전 결과</button><span className="text-sm">{page} / {pages}</span><button type="button" className={RESOURCE_BUTTON} disabled={page >= pages} onClick={() => update("page", String(page + 1))}>다음 결과</button></nav>
        </section>
      </>}
      <section className={BOX} aria-labelledby="research-compare-title"><h2 id="research-compare-title" className="text-2xl font-bold">내 비교 보드 <span className="text-fg-3">{selected.length}/4</span></h2>
        <p className="mt-3 text-sm leading-7 text-fg-2">공통 장르와 서로 다른 태그를 비교하고, 작품 상세에서 원문을 확인하세요. 선택 작품은 검색 조건이 바뀌어도 유지됩니다.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{selected.map((work) => <article key={work.id} className="min-w-0 rounded-xl border border-line p-4"><h3 className="break-words font-bold"><Link to={`/title/${encodeURIComponent(work.slug)}`} className="hover:underline">{work.title}</Link></h3><WorkMetadata work={work} /><p className="mt-3 break-words text-sm leading-7 text-fg-2">{work.tags.join(" · ") || "태그 미상"}</p><button type="button" className={`${RESOURCE_BUTTON} mt-4`} aria-label={`${work.title} 비교에서 제거`} onClick={() => toggle(work)}>선택 해제</button></article>)}</div>
        {!selected.length && <p className="mt-5 text-sm text-fg-2">작품 탐색에서 비교에 담기를 누르세요. 작품을 선택하지 않고도 기획 노트를 작성할 수 있습니다.</p>}
        {ids.length > selected.length && <p role="status" className="mt-4 text-sm text-fg-2">선택 중 {ids.length - selected.length}편은 현재 색인에 없거나 연령 필터로 숨겨져 있습니다. 선택 비우기로 정리하거나 검색 화면에서 연령 필터를 확인하세요.</p>}
        <div className="mt-5 flex flex-wrap gap-2"><button type="button" className={RESOURCE_BUTTON} onClick={() => void share()}>검색·비교 링크 복사</button><button type="button" className={RESOURCE_BUTTON} disabled={!selected.length} onClick={exportSelected}>비교 목록 CSV 내보내기</button><button type="button" className={RESOURCE_BUTTON} disabled={!ids.length} onClick={() => setSelection([])}>선택 비우기</button>{!notebookView && <Link to={`/research/catalog/notebook${suffix}`} className={`${RESOURCE_BUTTON} bg-accent text-on-accent`}>비교로 기획 시작</Link>}</div>
        {message && <p role="status" className="mt-4 text-sm leading-7">{message}</p>}
      </section>
      {notebookView && <CatalogResearchNotebook works={selected} snapshot={snapshot} onRestore={setSelection} />}
      <details className={BOX}><summary className="min-h-8 cursor-pointer text-lg font-bold">집계 방법·데이터 이용 원칙</summary><div className="mt-4 space-y-3 text-sm leading-7 text-fg-2"><p>단위는 중복 ID를 제거한 수록 작품 1편입니다. 장르·태그·플랫폼은 한 작품 안에서 중복을 제거하고, 현재 검색 결과 전체를 분모로 집계합니다. 미상 값은 새로 추정하지 않습니다.</p><p>기록 연도는 원본 메타데이터의 값이며 실제 첫 연재일로 검증한 값이 아닙니다. 서로 다른 플랫폼에 실린 작품이나 판본은 별개 ID일 수 있습니다. 현재 서비스 중인지, 이용 조건이 바뀌었는지는 원문에서 확인하세요.</p><p>이 기능은 기존 수집 스냅샷의 메타데이터만 가공합니다. 외부 사이트에 새 수집 요청을 보내지 않고, 표지·본문·평점·조회수·추정 트렌드 점수를 이 색인에 포함하지 않습니다. 출처 링크는 작품 내용의 복제·학습·상업 이용 허락이 아닙니다.</p><div className="flex flex-wrap gap-2"><Link className={RESOURCE_BUTTON} to="/about/data">데이터 출처</Link><Link className={RESOURCE_BUTTON} to="/about/crawler">수집 정책</Link><Link className={RESOURCE_BUTTON} to="/insights/resources">공개 API 안내</Link></div></div></details>
    </>}
  </ResourceLayout>;
}
