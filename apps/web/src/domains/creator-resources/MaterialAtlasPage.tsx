import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import catalogData from "./material-atlas/catalog.json";
import {
  filterMaterials, makeMaterialBoard, materialSelectionFromParams, materialShareUrl,
  materialSpecification, MATERIAL_KINDS, MATERIAL_PROVIDERS, MAX_MATERIAL_NOTE,
  MAX_MATERIAL_SELECTION, parseMaterialBoard, parseMaterialCatalog, toggleMaterialSelection,
} from "./material-atlas/model";
import type { MaterialAsset, MaterialCatalog } from "./material-atlas/model";
import { MATERIAL_STUDIES } from "./material-atlas/studies";
import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { ResourceLayout } from "./ResourceLayout";

const CATALOG = parseMaterialCatalog(catalogData);
const PAGE_SIZE = 24;
function downloadMaterialFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function MaterialPreview({ asset, enabled }: { asset: MaterialAsset; enabled: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-line bg-raised">
    {enabled && asset.thumbnailUrl && !failed
      ? <img className="h-full w-full object-contain" src={asset.thumbnailUrl} alt={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "{v0} 제공처 미리보기"), { v0: String(asset.title) })} width={256} height={256} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <div className="p-4 text-center"><p className="text-2xl font-bold text-accent" aria-hidden="true">{asset.kind === "texture" ? "▧" : asset.kind === "model" ? "◇" : "◐"}</p><p className="mt-2 text-sm text-fg-2">{failed ? translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "미리보기를 불러오지 못했습니다") : enabled ? translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "원문에서 이미지 확인") : MATERIAL_KINDS[asset.kind]}</p></div>}
  </div>;
}
function MaterialAtlasWorkspace({ catalog }: { catalog: MaterialCatalog }) {
  const [params, setParams] = useSearchParams();
  const [previews, setPreviews] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const query = (params.get("q") ?? "").slice(0, 80);
  const providerValue = params.get("provider") ?? "all";
  const provider = providerValue === "polyhaven" || providerValue === "ambientcg" ? providerValue : "all";
  const kindValue = params.get("kind") ?? "all";
  const kind = kindValue === "texture" || kindValue === "model" || kindValue === "hdri" ? kindValue : "all";
  const study = MATERIAL_STUDIES.find((candidate) => candidate.id === params.get("study"));
  const selectedIds = materialSelectionFromParams(params, catalog.assets);
  const selected = selectedIds.flatMap((id) => catalog.assets.find((asset) => asset.id === id) ?? []);
  const results = filterMaterials(catalog.assets, { query, provider, kind, study });
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const rawPage = Number(params.get("page") ?? 1);
  const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(rawPage) ? rawPage : 1));
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const changeParams = (changes: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) { if (value && value !== "all") next.set(key, value); else next.delete(key); }
    if (resetPage) next.delete("page");
    setParams(next, { replace: true }); setShareUrl("");
  };
  const toggleSelected = (id: string) => {
    const next = toggleMaterialSelection(selectedIds, id);
    if (next === selectedIds) { setStatus(`소재는 최대 ${MAX_MATERIAL_SELECTION}개까지 담을 수 있습니다. 먼저 담은 소재를 해제하세요.`); return; }
    changeParams({ items: next.join(",") }, false);
    setStatus(next.includes(id) ? "장면 소재 목록에 담았습니다." : "장면 소재 목록에서 해제했습니다.");
  };
  const exportFile = (format: "json" | "markdown") => {
    setError("");
    try {
      if (format === "json") downloadMaterialFile("toonstudio-material-board.json", JSON.stringify(makeMaterialBoard(selectedIds, note, study?.id ?? ""), null, 2), "application/json;charset=utf-8");
      else downloadMaterialFile("toonstudio-material-specification.md", materialSpecification(catalog, selectedIds, note, study), "text/markdown;charset=utf-8");
      setStatus(format === "json" ? "보드 JSON 내보내기를 요청했습니다. 다운로드 목록을 확인하세요." : "출처가 포함된 소재 명세서 내보내기를 요청했습니다.");
    } catch { setError("파일 내보내기를 시작하지 못했습니다. 브라우저의 다운로드 권한을 확인하세요."); }
  };
  const importFile = async (file: File) => {
    setError("");
    try {
      if (file.size > 40_000) throw new Error("40KB 이하의 소재 보드 JSON만 불러올 수 있습니다.");
      const { board, missing } = parseMaterialBoard(await file.text(), catalog.assets, MATERIAL_STUDIES);
      changeParams({ items: board.selectedIds.join(","), study: board.studyId, q: "", kind: "", provider: "" });
      setNote(board.note);
      setStatus(missing ? `보드를 불러왔습니다. 현재 카탈로그에 없는 소재 ${missing}개는 제외했습니다.` : "보드와 제작 메모를 불러왔습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "보드를 불러오지 못했습니다."); }
  };
  const share = async () => {
    const url = materialShareUrl(window.location.origin, selectedIds, study?.id ?? ""); setShareUrl(url);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url); setStatus("소재 링크를 복사했습니다. 제작 메모는 링크에 포함되지 않습니다.");
    } catch { setStatus("소재 링크를 만들었습니다. 아래 링크 입력란에서 직접 복사하세요. 제작 메모는 포함되지 않습니다."); }
  };
  return <ResourceLayout title={translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "무료 배경·소품 소재 도감")} intro={translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "Poly Haven과 ambientCG의 공개 API 자료로 만든 작은 CC0 소재 카탈로그입니다. 재질, 3D 소품, 빛과 환경을 한글로 찾아 장면별 소재 목록과 출처 명세서로 정리하세요.")}>
    <section className="grid gap-5 rounded-3xl border border-accent/30 bg-gradient-to-br from-accent-soft via-panel to-raised p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_auto]" aria-labelledby="material-free-title">
      <div className="min-w-0"><p className="text-xs font-bold tracking-widest text-accent">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "OPEN MATERIALS / API SNAPSHOT")}</p><h2 id="material-free-title" className="mt-3 text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "유료 생성 API 없이, 실제 제작 자료로")}</h2>
        <p className="mt-3 text-sm leading-7 text-fg-2">{catalog.assets.length}{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "개 소재 · 제공처 2곳 · 제작 가이드 ")}{MATERIAL_STUDIES.length}{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "종. 검색·선택·문서 내보내기는 브라우저에서 처리합니다. 실시간 전체 검색이 아닌 확인 시점의 선별 목록입니다.")}</p>
        <p className="mt-2 text-xs leading-6 text-fg-3">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "자료 확인: ")}<time dateTime={catalog.fetchedAt}>{catalog.fetchedAt.slice(0, 10)} {translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "UTC")}</time> {translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "· 신규 가입·API 키·카드 등록 불필요")}</p></div>
      <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-stretch"><a className={RESOURCE_BUTTON} href="#material-board">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "장면 소재 목록 ")}{selected.length}/{MAX_MATERIAL_SELECTION}</a><Link className={RESOURCE_BUTTON} to="/insights/resources">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "전체 출처·이용 조건")}</Link></div>
    </section>
    <section aria-labelledby="material-studies-title" className="space-y-4">
      <h2 id="material-studies-title" className="text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "소재를 콘텐츠로 바꾸는 제작 가이드")}</h2>
      <p className="text-sm leading-7 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "가이드를 선택하면 관련 소재만 모아 봅니다. 아래 내용은 ToonStudio의 고정 연습 안내이며, 이미지 분석이나 AI 생성 결과가 아닙니다.")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{MATERIAL_STUDIES.map((candidate) => <button type="button" key={candidate.id} aria-pressed={study?.id === candidate.id}
        className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "rounded-2xl border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent {v0}"), { v0: String(study?.id === candidate.id ? "border-accent bg-accent-soft" : "border-line bg-panel hover:bg-raised") })}
        onClick={() => changeParams({ study: candidate.id, q: "", provider: "", kind: "" })}>
        <span className="block font-bold">{candidate.title}</span><span className="mt-2 block text-xs leading-6 text-fg-2">{candidate.intro}</span>
      </button>)}</div>
      {study ? <article className="rounded-2xl border border-accent/30 bg-panel p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">{study.title}</h3><button type="button" className={RESOURCE_BUTTON} onClick={() => changeParams({ study: "" })}>{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "가이드 필터 해제")}</button></div>
        <ol className="mt-4 list-decimal space-y-2 pl-6 text-sm leading-7 text-fg-2">{study.steps.map((step) => <li key={step}>{step}</li>)}</ol></article> : null}
    </section>
    <section aria-labelledby="material-search-title" className="space-y-4 rounded-2xl border border-line bg-panel p-5">
      <h2 id="material-search-title" className="text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "선별 카탈로그 검색")}</h2>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr]">
        <label htmlFor="material-query" className="min-w-0 text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "검색어")}<input id="material-query" type="search" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "{v0} mt-2"), { v0: String(RESOURCE_INPUT) })} value={query} maxLength={80} placeholder={translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "나무, 벽돌, 의자, 야경…")} onChange={(event) => changeParams({ q: event.target.value })} /></label>
        <label htmlFor="material-provider" className="min-w-0 text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "제공처")}<select id="material-provider" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "{v0} mt-2"), { v0: String(RESOURCE_INPUT) })} value={provider} onChange={(event) => changeParams({ provider: event.target.value })}><option value="all">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "모든 제공처")}</option>{Object.entries(MATERIAL_PROVIDERS).map(([id, value]) => <option key={id} value={id}>{value.name}</option>)}</select></label>
        <label htmlFor="material-kind" className="min-w-0 text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "소재 종류")}<select id="material-kind" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "{v0} mt-2"), { v0: String(RESOURCE_INPUT) })} value={kind} onChange={(event) => changeParams({ kind: event.target.value })}><option value="all">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "모든 종류")}</option>{Object.entries(MATERIAL_KINDS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-2" aria-label={translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "한글 추천 검색어")}>{["나무", "벽돌", "콘크리트", "의자", "숲", "야경"].map((word) => <button key={word} type="button" className={RESOURCE_BUTTON} onClick={() => changeParams({ q: word, study: "" })}>{word}</button>)}<button type="button" className={RESOURCE_BUTTON} onClick={() => changeParams({ q: "", provider: "", kind: "", study: "" })}>{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "검색 조건 초기화")}</button></div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={previews} onChange={(event) => setPreviews(event.target.checked)} className="size-5 shrink-0" />{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "제공처 미리보기 이미지 불러오기")}</label>
      <p className="text-xs leading-6 text-fg-3">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "기본은 이미지 요청 없음입니다. 켜면 현재 보이는 소재의 작은 이미지를 제공처에서 불러와 IP 등 접속 정보가 전달될 수 있습니다. 원본 모델·텍스처·HDRI는 자동 다운로드하지 않습니다.")}</p>
    </section>
    <p role="status" className="text-sm text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "검색 결과 ")}{results.length}{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "개 · ")}{page}/{totalPages} {translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "페이지 · 표시 ")}{shown.length}{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "개")}</p>
    {shown.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label={translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "소재 검색 결과")}>{shown.map((asset) => <article key={asset.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-panel p-4">
      <MaterialPreview asset={asset} enabled={previews} /><div><p className="text-xs text-accent">{MATERIAL_PROVIDERS[asset.provider].name} · {MATERIAL_KINDS[asset.kind]} {translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "· CC0")}</p><h3 className="mt-2 break-words font-bold">{asset.title}</h3></div>
      <p className="flex-1 text-xs leading-6 text-fg-3">{asset.tags.slice(0, 6).join(" · ")}</p><p className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "크레딧: ")}{asset.authors.join(", ") || MATERIAL_PROVIDERS[asset.provider].name}</p>
      <button type="button" className={`${RESOURCE_BUTTON} ${selectedIds.includes(asset.id) ? "border-accent bg-accent-soft" : ""}`} aria-pressed={selectedIds.includes(asset.id)} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "{v0} 소재 담기"), { v0: String(asset.title) })} onClick={() => toggleSelected(asset.id)}>{selectedIds.includes(asset.id) ? translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "담은 소재 해제") : translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "소재 담기")}</button>
      <a className={RESOURCE_BUTTON} href={asset.sourceUrl} target="_blank" rel="noopener noreferrer">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "원문·다운로드 확인 ↗")}</a>
    </article>)}</div> : <div className="rounded-2xl border border-line bg-panel p-6"><h3 className="font-bold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "조건에 맞는 소재가 없습니다")}</h3><p className="mt-2 text-sm leading-7 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "이 도감은 선별된 작은 목록입니다. 검색 조건을 줄이거나 제공처 원문에서 더 많은 소재를 확인하세요.")}</p></div>}
    <nav className="flex flex-wrap items-center justify-center gap-3" aria-label={translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "소재 결과 페이지")}><button type="button" className={RESOURCE_BUTTON} disabled={page <= 1} onClick={() => changeParams({ page: String(page - 1) }, false)}>{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "이전")}</button><span className="text-sm">{page}/{totalPages}</span><button type="button" className={RESOURCE_BUTTON} disabled={page >= totalPages} onClick={() => changeParams({ page: String(page + 1) }, false)}>{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "다음")}</button></nav>
    <section id="material-board" aria-labelledby="material-board-title" className="scroll-mt-24 space-y-4 rounded-3xl border border-accent/30 bg-panel p-5 sm:p-7">
      <h2 id="material-board-title" className="text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "장면 소재 목록 ")}{selected.length}/{MAX_MATERIAL_SELECTION}</h2>
      <p className="text-sm leading-7 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "선택 목록은 주소에 유지됩니다. 메모는 현재 화면에만 있으며 새로고침·페이지 이동 시 사라집니다. 보드 JSON을 내려받아 보관하면 메모와 목록을 다시 불러올 수 있습니다. 계정·서버로 전송하지 않습니다.")}</p>
      {selected.length ? <ul className="space-y-2">{selected.map((asset) => <li key={asset.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"><div className="min-w-0"><p className="break-words font-semibold">{asset.title}</p><p className="text-xs text-fg-3">{MATERIAL_PROVIDERS[asset.provider].name} · {MATERIAL_KINDS[asset.kind]} {translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "· CC0")}</p></div><button type="button" className={RESOURCE_BUTTON} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "{v0} 목록에서 해제"), { v0: String(asset.title) })} onClick={() => toggleSelected(asset.id)}>{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "해제")}</button></li>)}</ul> : <p className="text-sm text-fg-3">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "위의 소재 담기 버튼으로 이번 장면에 필요한 자료를 모으세요.")}</p>}
      <label htmlFor="material-note" className="block text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "내 제작 메모")}<textarea id="material-note" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "{v0} mt-2 min-h-32 resize-y"), { v0: String(RESOURCE_INPUT) })} value={note} maxLength={MAX_MATERIAL_NOTE} onChange={(event) => setNote(event.target.value)} placeholder={translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "예: 3컷의 왼쪽 벽에 벽돌 질감, 7컷에는 같은 소품을 재사용")} /></label>
      <p className="text-xs text-fg-3">{note.length}/{MAX_MATERIAL_NOTE}{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "자 · 메모는 공유 링크에 포함되지 않습니다.")}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={RESOURCE_BUTTON} disabled={!selected.length && !note.trim()} onClick={() => exportFile("markdown")}>{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "출처 포함 명세서 내보내기")}</button><button type="button" className={RESOURCE_BUTTON} disabled={!selected.length && !note.trim()} onClick={() => exportFile("json")}>{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "보드 JSON 내보내기")}</button><button type="button" className={RESOURCE_BUTTON} disabled={!selected.length} onClick={() => void share()}>{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "소재 링크 복사")}</button></div>
      <label htmlFor="material-import" className="block text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "소재 보드 JSON 불러오기")}<input id="material-import" type="file" accept="application/json,.json" className="mt-2 block max-w-full text-sm" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} /></label>
      {shareUrl ? <label htmlFor="material-share" className="block text-sm font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "메모를 제외한 소재 공유 링크")}<input id="material-share" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "en", "{v0} mt-2"), { v0: String(RESOURCE_INPUT) })} readOnly value={shareUrl} onFocus={(event) => event.target.select()} /></label> : null}
      <p role="status" aria-live="polite" className="text-sm leading-7 text-fg-2">{status}</p>{error ? <p role="alert" className="text-sm leading-7 text-danger">{error}</p> : null}
    </section>
    <section aria-labelledby="material-source-title" className="space-y-4"><h2 id="material-source-title" className="text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "제공처와 무료 이용 범위")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{Object.entries(MATERIAL_PROVIDERS).map(([id, source]) => <article key={id} className="space-y-3 rounded-2xl border border-line bg-panel p-5"><h3 className="font-bold">{source.name}</h3><p className="text-sm leading-7 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "공개 API에서 확인한 선별 자산 메타데이터를 사용합니다. CC0 표기는 제공처의 공개 자산 정책을 근거로 하며, 실제 사용 시 원문과 제3자 권리를 다시 확인하세요.")}</p><div className="flex flex-wrap gap-2"><a className={RESOURCE_BUTTON} href={source.api} target="_blank" rel="noopener noreferrer">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "공식 API ↗")}</a><a className={RESOURCE_BUTTON} href={source.license} target="_blank" rel="noopener noreferrer">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "자료 라이선스 ↗")}</a><a className={RESOURCE_BUTTON} href={source.policy} target="_blank" rel="noopener noreferrer">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "API 이용 안내 ↗")}</a></div></article>)}</div>
      <p className="text-xs leading-7 text-fg-3">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "이 도감은 두 제공처의 공식·제휴 제품이 아닙니다. 추가 유료 AI, API 인증키, 데이터베이스, 예약 수집 작업은 사용하지 않습니다. 기존 사이트의 호스팅·도메인·전송량 한도까지 무제한 무료라는 뜻은 아닙니다.")}</p>
    </section>
  </ResourceLayout>;
}
export function MaterialAtlasPage() {
  if (!CATALOG) return <ResourceLayout title={translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "무료 소재 도감")} intro={translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "소재 카탈로그를 확인하지 못했습니다.")}><p role="alert">{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "잘못된 자료를 표시하지 않도록 검색을 중단했습니다. 자료 출처 페이지에서 제공처 원문을 확인하세요.")}</p><Link to="/insights/resources" className={RESOURCE_BUTTON}>{translateCurrentStaticSourceText("domains.creator.resources.MaterialAtlasPage", "ko", "자료 출처로 돌아가기")}</Link></ResourceLayout>;
  return <MaterialAtlasWorkspace catalog={CATALOG} />;
}
