import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import {
  BOARD_LIMIT, BOARD_PREFIX, KIT_FORMATS, OPEN_PROVIDERS, OPEN_TOPICS,
  buildCreationKit, fromExistingResource, openSearchQuery, openSearchUrl,
  parseOpenReferences, readOpenBoard, readOpenCache, saveOpenReference, writeOpenCache,
} from "./open-creation";
import type { KitFormat, OpenProvider, OpenReference } from "./open-creation";
import { readOpenJson } from "./open-creation-transport";
import { ResourceLayout } from "./ResourceLayout";
import { downloadText, useCreatorWorkspace } from "./workspace";

const PACKS: { title: string; query: string; format: KitFormat; description: string }[] = [
  { title: "한복에서 시작하는 주인공", query: "한복", format: "character", description: "복식의 실루엣·장식에서 캐릭터 단서 찾기" },
  { title: "갑옷 속의 비밀", query: "갑옷", format: "comic", description: "소품 하나로 구성하는 발견과 반전" },
  { title: "도자기가 사는 도시", query: "도자기", format: "world", description: "재질과 형태를 건축·생활양식으로 바꾸기" },
  { title: "작품을 소개하는 15초", query: "풍경", format: "promo", description: "배경·소품·자막을 잇는 홍보 구성안" },
  { title: "하루 한 장 관찰 드로잉", query: "꽃", format: "study", description: "20분 관찰·형태·명암·변형 과제" },
  { title: "작가의 자료 노트", query: "가구", format: "article", description: "비교 포인트와 출처가 있는 큐레이션 초안" },
];

function ReferenceTile({ item, saved, disabled, toggle }: { item: OpenReference; saved: boolean; disabled: boolean; toggle: () => void }) {
  const [failed, setFailed] = useState(false);
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
    {item.imageUrl && !failed
      ? <img src={item.imageUrl} alt={item.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-48 w-full bg-raised object-contain p-3" />
      : <div className="flex h-24 items-center justify-center bg-raised px-4 text-center text-sm text-fg-2">{failed ? "이미지를 불러오지 못했습니다 · 원문에서 확인" : "원문 링크로 확인하는 자료"}</div>}
    <div className="flex flex-1 flex-col gap-3 p-4">
      <p className="text-xs font-semibold text-accent">{OPEN_PROVIDERS.find((provider) => provider.id === item.provider)?.name ?? "기존 저장 보드"} · {item.rights}</p>
      <h3 className="break-words text-base font-bold">{item.title}</h3>
      <p className="text-xs leading-6 text-fg-2">{item.creator || "저작자 원문 확인"}{item.date ? ` · ${item.date}` : ""}</p>
      <details className="break-words text-xs leading-6 text-fg-2"><summary className="cursor-pointer py-1">출처·권리·조회일</summary>
        <p>{item.credit || "원문의 크레딧을 확인하세요."}</p><p>조회: {item.fetchedAt}</p>
        <p>{item.rights === "CC0" ? "제공처의 공개 이용 표시를 보존합니다. 제3자 권리와 최신 원문 조건은 별도 확인하세요." : "참고 링크이며 이미지·본문의 복제 또는 각색 허락을 의미하지 않습니다."}</p>
      </details>
      <div className="mt-auto flex flex-wrap gap-2"><a className={RESOURCE_BUTTON} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a><button className={RESOURCE_BUTTON} disabled={disabled} aria-pressed={saved} onClick={toggle}>{saved ? "보드에서 해제" : "재료 보드에 저장"}</button></div>
    </div>
  </article>;
}

export function OpenCreationPage() {
  const [provider, setProvider] = useState<OpenProvider>("artic");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<OpenReference[]>([]);
  const [resultKey, setResultKey] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("검색할 때만 선택한 제공처 한 곳에 연결합니다.");
  const [searchError, setSearchError] = useState("");
  const [board, setBoard] = useState<OpenReference[]>([]);
  const [boardReady, setBoardReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [tab, setTab] = useState<"results" | "board" | "existing">("results");
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<KitFormat>("comic");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [output, setOutput] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const cooldowns = useRef<Partial<Record<OpenProvider, number>>>({});
  const { workspace, ready: existingReady, error: existingError } = useCreatorWorkspace();
  useEffect(() => {
    const sync = () => {
      try { setBoard(readOpenBoard(window.localStorage)); setStorageError(""); setBoardReady(true); }
      catch { setStorageError("브라우저 저장소를 읽을 수 없거나 자료가 손상되었습니다. 기존 자료를 덮어쓰지 않습니다."); setBoardReady(false); }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key.startsWith(BOARD_PREFIX)) sync(); };
    sync(); window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("storage", onStorage); requestNumber.current += 1; controller.current?.abort(); };
  }, []);

  const invalidateSearch = () => {
    requestNumber.current += 1; controller.current?.abort(); setPending(false); setResult([]); setResultKey(""); setPage(1); setSearchError("");
    setStatus("검색 버튼을 누르면 선택한 제공처에서 검색합니다.");
  };
  const search = async (targetPage = 1) => {
    let url: string; let effectiveQuery: string;
    try { url = openSearchUrl(provider, query, targetPage); effectiveQuery = openSearchQuery(provider, query); }
    catch (cause) { setSearchError(cause instanceof Error ? cause.message : "검색어를 확인하세요."); return; }
    const key = `${provider}:${effectiveQuery}:${targetPage}`;
    const id = ++requestNumber.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 15000);
    setPending(true); setSearchError(""); setResult([]); setResultKey(""); setTab("results"); setCopyStatus("");
    let cached: ReturnType<typeof readOpenCache> = null;
    try {
      try { cached = readOpenCache(window.localStorage, key); } catch { /* Search works with storage disabled. */ }
      if (cached && !cached.stale) {
        setResult(cached.items); setResultKey(key); setPage(targetPage);
        setStatus(`저장된 검색 결과 ${cached.items.length}개 · 24시간 캐시 · 실제 검색어: ${effectiveQuery}`); return;
      }
      const until = cooldowns.current[provider] ?? 0;
      if (until > Date.now()) throw new Error(`제공처 보호를 위해 ${Math.ceil((until - Date.now()) / 1000)}초 후 다시 검색하세요.`);
      cooldowns.current[provider] = Date.now() + 1500;
      setStatus(`자료 확인 중 · 실제 검색어: ${effectiveQuery}`);
      const response = await fetch(url, { signal: abort.signal, credentials: "omit", mode: "cors", redirect: "error", headers: { Accept: "application/json" } });
      if (response.status === 429) {
        const retry = response.headers.get("Retry-After") ?? "";
        const seconds = /^\d+$/u.test(retry) ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
        cooldowns.current[provider] = Date.now() + Math.max(60, Number.isFinite(seconds) ? seconds : 60) * 1000;
        throw new Error("제공처의 호출 한도에 도달했습니다. 자동 재시도나 유료 전환은 하지 않습니다.");
      }
      if (!response.ok) throw new Error(`제공처에 연결하지 못했습니다 (HTTP ${response.status}).`);
      const payload = await readOpenJson(response, abort.signal);
      const items = parseOpenReferences(provider, payload);
      if (id !== requestNumber.current) return;
      try { writeOpenCache(window.localStorage, key, items); } catch { /* Optional cache. */ }
      setResult(items); setResultKey(key); setPage(targetPage);
      setStatus(`권리·형식 검사를 통과한 자료 ${items.length}개 · 실제 검색어: ${effectiveQuery} · 한글 사전 치환이며 AI 번역이 아닙니다.`);
    } catch (cause) {
      if (id !== requestNumber.current) return;
      const message = abort.signal.aborted ? "검색 시간이 초과되었습니다." : cause instanceof Error ? cause.message : "검색하지 못했습니다.";
      if (cached) { setResult(cached.items); setResultKey(key); setPage(targetPage); setStatus(`이전에 저장된 결과입니다 · 조회 ${new Date(cached.at).toLocaleString("ko-KR")} · 최신 결과가 아닙니다.`); }
      else setStatus("저장 보드·브리프 도구는 외부 검색 서버 없이 사용할 수 있습니다.");
      setSearchError(`${message} ${cached ? "기존 캐시를 표시합니다." : "공식 제공처 링크 또는 다른 검색어를 이용하세요."}`);
    } finally { window.clearTimeout(timeout); if (id === requestNumber.current) setPending(false); }
  };
  const exportText = (filename: string, value: string, mime?: string) => {
    try { downloadText(filename, value, mime); setCopyStatus("파일 다운로드를 요청했습니다. 브라우저 다운로드 목록을 확인하세요."); }
    catch { setCopyStatus("파일을 내보내지 못했습니다. 초안 텍스트를 선택해 복사하세요. 저장 자료는 삭제하지 않았습니다."); }
  };
  const toggleBoard = (item: OpenReference) => {
    try {
      const remove = board.some((saved) => saved.id === item.id);
      const next = saveOpenReference(window.localStorage, item, remove);
      setBoard(next); setStorageError("");
      setSelected((ids) => remove ? ids.filter((id) => id !== item.id) : ids.includes(item.id) || ids.length >= 12 ? ids : [...ids, item.id]);
    } catch (cause) { setStorageError(cause instanceof Error ? cause.message : "저장하지 못했습니다. 브라우저 저장 공간을 확인하세요."); }
  };
  const existing = workspace.saved.map(fromExistingResource).filter((item): item is OpenReference => item !== null);
  const items = tab === "board" ? board : tab === "existing" ? existing : result;
  const selectedItems = board.filter((item) => selected.includes(item.id)).slice(0, 12);
  return <ResourceLayout title="무료 창작 재료실" intro="공개 자료를 찾아 나만의 재료 보드에 모으고, 출처가 있는 콘티·설정집·연습 과제를 만드세요. API 키·유료 AI·추가 서버 없이 동작하는 로컬 제작 도구입니다.">
    <section className="rounded-2xl border border-line bg-panel p-5 text-sm leading-7 text-fg-2">
      <strong className="text-fg">검색 → 재료 보드 → 제작 브리프 → Studio</strong>
      <p>검색어만 선택한 외부 제공처로 전송합니다. 작품·작가 메모는 전송하지 않습니다. 저장 자료는 이 브라우저에만 보관되며 계정 동기화가 아닙니다.</p>
      <p>저장 메타데이터와 브리프는 페이지가 열린 상태에서 오프라인으로도 사용 가능합니다. 외부 이미지와 최초 페이지 로딩까지 오프라인을 보장하지 않습니다.</p>
      <div className="mt-3 flex flex-wrap gap-2"><Link className={RESOURCE_BUTTON} to="/research/packs">12개 장면 팩으로 연습하기</Link><Link className={RESOURCE_BUTTON} to="/insights/resources">API·출처 안내</Link><Link className={RESOURCE_BUTTON} to="/research/assets">기존 Met 자료 검색</Link><Link className={RESOURCE_BUTTON} to="/research/books">도서·판본 검색</Link><Link className={RESOURCE_BUTTON} to="/research/3d-assets">CC0 3D·HDRI 검색</Link><Link className={RESOURCE_BUTTON} to="/opportunities">지원사업 찾기</Link></div>
    </section>
    <section aria-labelledby="open-pack-title" className="space-y-3"><h2 id="open-pack-title" className="text-xl font-bold">바로 시작하는 콘텐츠 기획</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{PACKS.map((pack) => <button key={pack.title} className="rounded-2xl border border-line bg-panel p-4 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => { invalidateSearch(); setQuery(pack.query); setSubject(pack.title); setFormat(pack.format); setTab("results"); }}><span className="block font-bold">{pack.title}</span><span className="mt-2 block text-sm leading-6 text-fg-2">{pack.description}</span></button>)}</div>
    </section>
    <form className="space-y-3 rounded-2xl border border-line bg-panel p-5" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold">무료 제공처<select className={`${RESOURCE_INPUT} mt-2`} value={provider} onChange={(event) => { invalidateSearch(); setProvider(event.target.value as OpenProvider); }}>{OPEN_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-semibold sm:col-span-2">찾을 소재<input className={`${RESOURCE_INPUT} mt-2`} type="search" onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} value={query} required minLength={1} maxLength={80} placeholder="한복, 갑옷, 도자기, architecture…" onChange={(event) => { invalidateSearch(); setQuery(event.target.value); }} /></label></div>
      <p className="text-xs leading-6 text-fg-2">{OPEN_PROVIDERS.find((item) => item.id === provider)?.detail} · 한글 추천어는 공개된 로컬 사전으로 치환하며, 지원하지 않는 단어는 그대로 검색합니다.</p>
      <div className="flex flex-wrap gap-2">{OPEN_TOPICS.map((topic) => <button key={topic} className={RESOURCE_BUTTON} type="button" onClick={() => { invalidateSearch(); setQuery(topic); }}>{topic}</button>)}</div>
      <div className="flex flex-wrap gap-2"><button className={`${RESOURCE_BUTTON} bg-accent-soft`} type="submit" disabled={pending}>{pending ? "자료 확인 중…" : "무료 자료 검색"}</button><a className={RESOURCE_BUTTON} href={OPEN_PROVIDERS.find((item) => item.id === provider)?.url} target="_blank" rel="noopener noreferrer">제공처 공식 안내 ↗</a></div>
    </form>
    <div className="flex flex-wrap gap-2" aria-label="자료 보기"><button className={RESOURCE_BUTTON} aria-pressed={tab === "results"} onClick={() => setTab("results")}>검색 결과</button><button className={RESOURCE_BUTTON} aria-pressed={tab === "board"} onClick={() => setTab("board")}>재료 보드 {board.length}/{BOARD_LIMIT}</button><button className={RESOURCE_BUTTON} aria-pressed={tab === "existing"} onClick={() => setTab("existing")}>기존 저장 자료 {existing.length}</button><button className={RESOURCE_BUTTON} disabled={!board.length} onClick={() => exportText("toonstudio-material-board.json", JSON.stringify({ version: 1, items: board }, null, 2), "application/json;charset=utf-8")}>보드 JSON 백업</button></div>
    <p role="status" className="text-sm leading-6 text-fg-2">{status}</p>
    {searchError && <p role="alert" className="text-sm text-warn">{searchError}</p>}
    {storageError && <p role="alert" className="text-sm text-warn">{storageError} 성공으로 표시하지 않으며, 검색과 초안 내보내기는 계속 사용할 수 있습니다.</p>}
    {tab === "existing" && <p className="text-sm text-fg-2">{existingError || (!existingReady ? "기존 저장 보드를 읽고 있습니다…" : "기존 Met·도서·지원사업 자료를 재료 보드로 복사할 수 있습니다. 원래 보드는 변경하지 않습니다.")}</p>}
    {!pending && !items.length && <p className="rounded-xl border border-dashed border-line p-6 text-sm text-fg-2">{tab === "results" ? "표시할 자료가 없습니다. 검색어를 입력해 검색하거나 다음 페이지·공식 제공처를 확인하세요." : "저장된 자료가 없습니다. 검색 결과에서 재료 보드에 저장해 보세요."}</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={pending && tab === "results"}>{items.map((item) => <ReferenceTile key={item.id} item={item} saved={board.some((saved) => saved.id === item.id)} disabled={!boardReady} toggle={() => toggleBoard(item)} />)}</div>
    {tab === "results" && resultKey && <nav className="flex items-center justify-center gap-3" aria-label="무료 자료 검색 페이지"><button className={RESOURCE_BUTTON} disabled={pending || page <= 1} onClick={() => void search(page - 1)}>이전</button><span>{page} / 최대 10페이지</span><button className={RESOURCE_BUTTON} disabled={pending || page >= 10} onClick={() => void search(page + 1)}>다음 페이지 확인</button></nav>}
    <section aria-labelledby="creation-kit-title" className="space-y-4 rounded-2xl border border-line bg-panel p-5">
      <h2 id="creation-kit-title" className="text-xl font-bold">자료를 제작 브리프로</h2>
      <p className="text-sm leading-7 text-fg-2">유료 모델 대신 6종의 구성 규칙을 사용합니다. 사실·각색·이미지·영상 자체를 자동 생성하지 않습니다. 입력 중인 메모와 초안은 자동 저장되지 않으니 파일로 내보내세요.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{KIT_FORMATS.map((item) => <button className={`${RESOURCE_BUTTON} flex-col items-start text-left ${format === item.id ? "bg-accent-soft" : ""}`} key={item.id} aria-pressed={format === item.id} onClick={() => { setFormat(item.id); setCopyStatus(""); }}><span>{item.title}</span><span className="text-xs font-normal text-fg-2">{item.detail}</span></button>)}</div>
      <label className="block text-sm font-semibold">작품·콘텐츠 주제<input className={`${RESOURCE_INPUT} mt-2`} value={subject} maxLength={120} placeholder="예: 잊힌 도자기를 고치는 소녀" onChange={(event) => setSubject(event.target.value)} /></label>
      <label className="block text-sm font-semibold">작가 메모 (외부 전송 안 함)<textarea className={`${RESOURCE_INPUT} mt-2 min-h-24`} value={notes} maxLength={2000} placeholder="장르, 주인공의 목표, 넣고 싶은 장면…" onChange={(event) => setNotes(event.target.value)} /></label>
      <fieldset className="space-y-2"><legend className="font-semibold">브리프에 쓸 자료 {selectedItems.length}/12</legend><button className={RESOURCE_BUTTON} disabled={!board.length} onClick={() => setSelected(board.slice(0, 12).map((item) => item.id))}>앞 12개 선택</button><button className={RESOURCE_BUTTON} disabled={!selected.length} onClick={() => setSelected([])}>선택 해제</button>
        <div className="grid gap-2 sm:grid-cols-2">{board.map((item) => <label key={item.id} className="flex min-w-0 items-start gap-2 rounded-lg bg-raised p-3 text-sm"><input type="checkbox" className="mt-1" checked={selected.includes(item.id)} disabled={!selected.includes(item.id) && selectedItems.length >= 12} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids.filter((id) => id !== item.id), item.id].slice(0, 12) : ids.filter((id) => id !== item.id))} /><span className="break-words">{item.title}</span></label>)}</div>
      </fieldset>
      <button className={`${RESOURCE_BUTTON} bg-accent-soft`} onClick={() => { setOutput(buildCreationKit(format, subject, notes, selectedItems)); setCopyStatus("초안을 만들었습니다. 원문 사실과 권리를 확인한 뒤 편집하세요."); }}>무료 제작 브리프 만들기</button>
      {output && <><label className="block text-sm font-semibold">제작 브리프 (직접 수정 가능)<textarea className={`${RESOURCE_INPUT} mt-2 min-h-96 font-mono text-sm`} value={output} maxLength={60000} onChange={(event) => { setOutput(event.target.value); setCopyStatus(""); }} /></label><div className="flex flex-wrap gap-2"><button className={RESOURCE_BUTTON} onClick={() => exportText("toonstudio-creation-kit.md", output)}>출처 포함 Markdown 내보내기</button><button className={RESOURCE_BUTTON} onClick={() => { void navigator.clipboard?.writeText(output).then(() => setCopyStatus("초안을 복사했습니다."), () => setCopyStatus("복사를 허용하지 않는 환경입니다. 텍스트를 선택하거나 파일로 내보내세요.")); if (!navigator.clipboard) setCopyStatus("텍스트를 선택하거나 파일로 내보내세요."); }}>초안 복사</button><Link className={RESOURCE_BUTTON} to="/studio/new">Studio에서 새 작업</Link></div><p className="text-xs text-fg-2">Studio에는 자료가 자동 삽입되지 않습니다. 내보낸 초안을 참고해 새 작업을 시작하세요.</p></>}
      <p role="status" className="text-sm text-fg-2">{copyStatus}</p>
    </section>
    <p className="text-xs leading-6 text-fg-2">신규 외부 API 사용료와 생성형 모델 비용은 없습니다. 기존 호스팅·도메인·전송량의 비용과 무료 한도는 별도입니다. 호출 한도 초과 시 자동 업그레이드·유료 대체·우회 호출을 하지 않습니다.</p>
  </ResourceLayout>;
}
