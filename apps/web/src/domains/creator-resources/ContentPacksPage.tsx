import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { buildContentBrief, CONTENT_FORMATS, CONTENT_PACKS, findContentPack, isContentFormat, MAX_BRIEF_SOURCES } from "./content-packs";
import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { ResourceCard } from "./ResourceSearchPage";
import { packProvider, usePackResourceSearch } from "./usePackResourceSearch";
import { downloadText, useCreatorWorkspace } from "./workspace";
import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import type { CreatorResource } from "@/shared/lib/creator-resources";
import { resolveReferenceQuery } from "../../../../../packages/core/src/reference-query-language";

export function ContentPacksPage() {
  const [params, setParams] = useSearchParams();
  const pack = findContentPack(params.get("pack"));
  const provider = packProvider(params.get("provider"));
  const rawFormat = params.get("format");
  const format = isContentFormat(rawFormat) ? rawFormat : "storyboard";
  const query = params.get("q") ?? "";
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 20 ? rawPage : 1;
  const [draft, setDraft] = useState(query);
  const [category, setCategory] = useState("전체");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const { workspace, update, ready, writable, saving, error } = useCreatorWorkspace();
  const search = usePackResourceSearch(provider, query, page);
  useEffect(() => { setDraft(query); }, [query]);
  const changeParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) { if (value === null) next.delete(key); else next.set(key, value); }
    setParams(next);
  };
  const sources = workspace.saved.filter((item) => selected.includes(item.id));
  const brief = buildContentBrief(pack, format, sources, notes);
  const resolution = query ? resolveReferenceQuery(query) : null;
  const toggleSaved = (item: CreatorResource) => {
    void update((value) => ({ ...value, saved: value.saved.some((saved) => saved.id === item.id)
      ? value.saved.filter((saved) => saved.id !== item.id) : [...value.saved, item] }));
  };
  const toggleSource = (id: string) => {
    setNotice("");
    if (!selected.includes(id) && sources.length >= MAX_BRIEF_SOURCES) { setNotice(`브리프에는 ${MAX_BRIEF_SOURCES}개까지 선택할 수 있습니다.`); return; }
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current.filter((value) => workspace.saved.some((item) => item.id === value)), id]);
  };
  const exportBrief = () => {
    try { downloadText(`toonstudio-${pack.id}-${format}.md`, brief); setNotice("브리프 파일 다운로드를 요청했습니다. 브라우저 다운로드 목록을 확인하세요."); }
    catch { setNotice("파일을 내보내지 못했습니다. 아래 미리보기의 내용을 복사해 보관하세요."); }
  };
  return <ResourceLayout title="오픈 콘텐츠 제작실" intro="무료 공개 자료를 내 장면의 근거로 바꾸세요. 12개 창작 팩에서 출발해 자료를 검색·저장하고, 출처를 붙인 콘티와 설정집을 만듭니다. 가입·유료 AI 호출은 필요하지 않습니다.">
    <section className="grid gap-3 sm:grid-cols-3" aria-label="무료 제작 방식">
      {["장면 팩·브리프 조합은 브라우저에서 처리", "공식 자료 검색은 선택한 제공처만 호출", "메타데이터 저장과 이미지 재사용 권한은 별도"].map((text) => <p key={text} className="rounded-xl border border-line bg-panel p-4 text-sm leading-7">{text}</p>)}
    </section>
    <section className="space-y-4" aria-labelledby="pack-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="pack-heading" className="text-2xl font-bold">어떤 장면을 만들까요?</h2><label>분야 <select className={RESOURCE_INPUT} value={category} onChange={(event) => setCategory(event.target.value)}>{["전체", ...new Set(CONTENT_PACKS.map((item) => item.category))].map((value) => <option key={value}>{value}</option>)}</select></label></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{CONTENT_PACKS.filter((item) => category === "전체" || item.category === category).map((item) => <button key={item.id} aria-pressed={pack.id === item.id} className={`${RESOURCE_BUTTON} flex-col items-start gap-2 p-5 text-left ${pack.id === item.id ? "bg-accent-soft" : "bg-panel"}`} onClick={() => changeParams({ pack: item.id, q: null, page: null })}><span className="text-xs text-accent">{item.category}</span><span className="text-lg">{item.title}</span><span className="text-sm font-normal leading-7 text-fg-2">{item.premise}</span></button>)}</div>
    </section>
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-5" aria-labelledby="pack-search-heading">
      <h2 id="pack-search-heading" className="text-2xl font-bold">공식 자료 찾기</h2>
      <p className="text-sm leading-7 text-fg-2">공개 이용 표시가 확인된 자료만 보여줍니다. 한글 검색은 제한된 미술 용어 사전으로 확장하며, 일반 번역 서비스는 아닙니다.</p>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); changeParams({ q: draft.trim(), page: "1" }); }}>
        <label className="sm:w-60">제공처<select className={RESOURCE_INPUT} value={provider} onChange={(event) => changeParams({ provider: event.target.value, q: null, page: null })}>{(["aic", "cleveland", "met"] as const).map((value) => <option key={value} value={value}>{RESOURCE_LABELS[value]}</option>)}</select></label>
        <label className="flex-1">자료 검색어<input className={RESOURCE_INPUT} type="search" minLength={2} maxLength={80} required value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="예: 갑옷, 도자기, 정원" /></label>
        <button type="submit" className={RESOURCE_BUTTON} disabled={search.loading}>자료 검색</button>
      </form>
      <div className="flex flex-wrap gap-2">{pack.keywords.map((keyword) => <button key={keyword} className={RESOURCE_BUTTON} disabled={search.loading} onClick={() => changeParams({ q: keyword, page: "1" })}>{keyword} 검색</button>)}</div>
      {resolution && <p className="text-sm text-fg-2">실제 검색어: {resolution.providerQuery}{resolution.unresolved.length ? ` · 사전에 없는 표현: ${resolution.unresolved.join(", ")}` : ""}</p>}
      {!query && <p className="text-sm text-fg-2">검색어를 선택하기 전에는 외부 자료 API를 호출하지 않습니다.</p>}
      {search.loading && <p role="status">공식 자료를 확인하고 있습니다…</p>}
      {search.error && <p role="alert">{search.error}</p>}
      {search.result && <p role="status" className="text-sm leading-7 text-fg-2">{search.result.message}{search.result.status === "unavailable" ? " 제공처 일시 이용 불가." : ` 표시 ${search.result.items.length}건.`}</p>}
      {(search.error || search.result?.status === "unavailable" || search.result?.status === "partial") && <button className={RESOURCE_BUTTON} disabled={search.loading} onClick={search.retry}>다시 시도</button>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy={search.loading}>{search.result?.items.map((item) => <ResourceCard key={item.id} item={item} saved={workspace.saved.some((saved) => saved.id === item.id)} onToggle={() => toggleSaved(item)} disabled={!ready || !writable || saving} />)}</div>
      {search.result && <nav className="flex items-center gap-3" aria-label="자료 검색 페이지"><button className={RESOURCE_BUTTON} disabled={page <= 1 || search.loading} onClick={() => changeParams({ page: String(page - 1) })}>이전</button><span>{page} 페이지</span><button className={RESOURCE_BUTTON} disabled={page >= 20 || !search.result.hasMore || search.loading} onClick={() => changeParams({ page: String(page + 1) })}>다음</button></nav>}
      <Link className={RESOURCE_BUTTON} to="/research/books">도서·작법서도 조사하기</Link>
    </section>
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-5" aria-labelledby="brief-heading">
      <h2 id="brief-heading" className="text-2xl font-bold">선택한 출처로 제작 브리프 만들기</h2>
      <p className="text-sm leading-7 text-fg-2">선택한 자료 {sources.length}/{MAX_BRIEF_SOURCES}개 · 출처 선택과 메모는 현재 화면에만 유지됩니다. 작업을 마치면 파일로 내보내세요. 검색 결과는 먼저 보드에 저장한 뒤 선택합니다.</p>
      {!workspace.saved.length && <p>저장한 자료가 없습니다. 출처 없이 창작 템플릿만 먼저 사용할 수도 있습니다.</p>}
      <div className="grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">{workspace.saved.map((item) => <label key={item.id} className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3 text-sm leading-6"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSource(item.id)} className="mt-1" /><span>{item.title}<span className="block text-xs text-fg-2">{RESOURCE_LABELS[item.provider]} · {item.license}</span></span></label>)}</div>
      <label className="block">산출물 형식<select className={RESOURCE_INPUT} value={format} onChange={(event) => changeParams({ format: event.target.value })}>{Object.entries(CONTENT_FORMATS).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
      <label className="block">나의 제작 메모<textarea className={`${RESOURCE_INPUT} min-h-28`} value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="내 장면에 적용할 아이디어를 적으세요. 서버에 보내지 않습니다." /></label>
      <div className="flex flex-wrap gap-3"><button className={RESOURCE_BUTTON} onClick={exportBrief}>브리프 Markdown 내보내기</button><Link className={RESOURCE_BUTTON} to="/research">저장 보드·백업 관리</Link><Link className={RESOURCE_BUTTON} to="/studio/new">스튜디오에서 그리기</Link></div>
      {notice && <p role="status">{notice}</p>}
      <details open><summary className="cursor-pointer py-3 font-semibold">제작 브리프 미리보기</summary><pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-raised p-4 text-sm leading-7">{brief}</pre></details>
    </section>
    <LocalSaveNotice error={error} writable={writable} saving={saving} />
    <p className="text-xs leading-6 text-fg-2">이 기능은 신규 유료 서비스·인증키·DB 저장 공간을 요구하지 않습니다. 기존 호스팅의 함수 호출·전송량 한도까지 무제한 무료라는 의미는 아닙니다. 자동 수집이나 주기적 새로고침은 사용하지 않습니다.</p>
  </ResourceLayout>;
}
