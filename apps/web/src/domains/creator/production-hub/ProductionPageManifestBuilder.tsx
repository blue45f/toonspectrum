import {
  ArrowDown,
  ArrowUp,
  Check,
  CopyPlus,
  FileArchive,
  FilePlus2,
  Import,
  LoaderCircle,
  LockKeyhole,
  PackagePlus,
  RefreshCcw,
  Replace,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { registerStudioImportHandoff, STUDIO_IMPORT_HANDOFF_QUERY_KEY } from "../studio-import-handoff";
import { StudioReviewImage } from "../virtual-space/StudioPinnedReviewPreview";
import { useStudioPinnedReviewPreviews } from "../virtual-space/use-studio-pinned-review-previews";
import {
  appendProductionManifestPages,
  manifestPageFromPreview,
  moveProductionManifestPage,
  productionManifestPageState,
  removeProductionManifestPage,
  replaceProductionManifestPage,
  summarizeProductionManifestPages,
  type ProductionManifestPage,
  type ProductionReviewCandidate,
} from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import {
  buildProductionPageManifestArchive,
  collectProductionReviewManifestPages,
  downloadProductionPageManifestArchive,
  type ProductionPageManifestArchiveResult,
} from "./production-page-manifest-archive";

const STATE_LABELS = {
  reused: "재사용",
  changed: "변경",
  new: "신규",
  duplicate: "중복",
  missing: "누락",
} as const;

function stateClass(state: keyof typeof STATE_LABELS): string {
  if (state === "reused") return "border-good/35 bg-good/10 text-good";
  if (state === "changed") return "border-warn/35 bg-warn/10 text-warn";
  if (state === "new") return "border-accent/35 bg-accent-soft text-accent";
  if (state === "duplicate" || state === "missing") return "border-bad/35 bg-bad/10 text-bad";
  return "border-line bg-raised text-fg-2";
}

function openImportHandoff(editorHref: string, file: File): void {
  const handoff = registerStudioImportHandoff(file, "cbz");
  const url = new URL(editorHref, window.location.origin);
  url.searchParams.set(STUDIO_IMPORT_HANDOFF_QUERY_KEY, handoff.token);
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

export function ProductionPageManifestBuilder({
  projectId,
  workId,
  targetProcess,
  editorHref,
  candidates,
  canEdit,
}: {
  readonly projectId: string;
  readonly workId: string;
  readonly targetProcess: ProductionManuscriptProcess | null;
  readonly editorHref: string | null;
  readonly candidates: readonly ProductionReviewCandidate[];
  readonly canEdit: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const explicitSource = params.get("builderSourceReview");
  const compatibleCandidates = useMemo(() => candidates.filter((candidate) => candidate.processType === "image"), [candidates]);
  const preferred = targetProcess
    ? compatibleCandidates.find((candidate) => candidate.artifactId === targetProcess.artifact.id) ?? compatibleCandidates[0] ?? null
    : compatibleCandidates[0] ?? null;
  const source = explicitSource
    ? compatibleCandidates.find((candidate) => candidate.id === explicitSource) ?? null
    : preferred;
  const invalidExplicitSource = Boolean(explicitSource && !source);
  const preview = useStudioPinnedReviewPreviews(source?.subject ?? null, () => undefined);
  const [pages, setPages] = useState<readonly ProductionManifestPage[]>([]);
  const [baseline, setBaseline] = useState<readonly ProductionManifestPage[]>([]);
  const requestedSlot = Number(params.get("builderSlot"));
  const [selectedIndex, setSelectedIndex] = useState(Number.isInteger(requestedSlot) && requestedSlot >= 0 ? requestedSlot : 0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"load" | "download" | "import" | null>(null);
  const [progress, setProgress] = useState(0);
  const [lastArchive, setLastArchive] = useState<ProductionPageManifestArchiveResult | null>(null);

  useEffect(() => {
    if (selectedIndex >= pages.length && pages.length > 0) setSelectedIndex(pages.length - 1);
    if (pages.length === 0 && selectedIndex !== 0) setSelectedIndex(0);
  }, [pages.length, selectedIndex]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (source) next.set("builderSourceReview", source.id);
    else if (!explicitSource) next.delete("builderSourceReview");
    if (pages.length > 0) next.set("builderSlot", String(selectedIndex));
    else next.delete("builderSlot");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [explicitSource, pages.length, params, selectedIndex, setParams, source]);

  const loadedPages = preview.result?.ok && source
    ? preview.result.previews.map((page) => manifestPageFromPreview(source, page))
    : [];
  const summary = useMemo(() => summarizeProductionManifestPages(pages, baseline), [baseline, pages]);

  const append = (incoming: readonly ProductionManifestPage[]) => {
    const result = appendProductionManifestPages(pages, incoming);
    setPages(result.pages);
    if (baseline.length === 0 && pages.length === 0 && result.pages.length > 0) setBaseline(result.pages);
    setNotice(result.skippedDuplicateCount > 0
      ? `${incoming.length - result.skippedDuplicateCount}장을 추가하고 동일 원본 ${result.skippedDuplicateCount}장은 생략했습니다.`
      : `${incoming.length}장을 버전 구성에 추가했습니다.`);
  };

  const replace = (page: ProductionManifestPage) => {
    if (pages.length === 0) {
      append([page]);
      return;
    }
    setPages(replaceProductionManifestPage(pages, selectedIndex, page));
    setNotice(`${selectedIndex + 1}번째 페이지를 ${source?.review.title ?? "선택 검수본"}의 ${page.sourceOrdinal + 1}페이지로 교체했습니다.`);
  };

  const loadAllPages = async () => {
    if (!source || busy) return;
    setBusy("load");
    setProgress(0);
    setNotice("");
    try {
      const all = await collectProductionReviewManifestPages(source);
      setPages(all);
      setBaseline(all);
      setSelectedIndex(0);
      setLastArchive(null);
      setNotice(`${all.length}페이지 전체를 불러왔습니다. 이후 교체·삽입·제거한 차이를 페이지별로 표시합니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "전체 페이지 목록을 불러오지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const build = async (mode: "download" | "import") => {
    if (!targetProcess || pages.length === 0 || busy) return;
    setBusy(mode);
    setProgress(0);
    setNotice("");
    try {
      const result = await buildProductionPageManifestArchive({
        projectId,
        workId,
        artifactId: targetProcess.artifact.id,
        title: targetProcess.artifact.title,
        pages,
        onProgress: ({ completedFiles, totalFiles }) => setProgress(Math.round((completedFiles / Math.max(1, totalFiles)) * 100)),
      });
      setLastArchive(result);
      if (mode === "download") {
        downloadProductionPageManifestArchive(result);
        setNotice(`${pages.length}페이지 CBZ를 만들었습니다. 원본 검수본과 source manifest가 함께 보존됩니다.`);
      } else if (editorHref) {
        const file = new File([result.blob], result.fileName, { type: result.blob.type, lastModified: Date.now() });
        setNotice("편집기로 전달합니다. 가져온 페이지를 확인한 뒤 기존 저장·revision 흐름으로 저장하세요.");
        openImportHandoff(editorHref, file);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "페이지 버전 패키지를 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  if (!targetProcess) {
    return <section className="rounded-3xl border border-dashed border-line bg-card p-8 text-center"><FileArchive className="mx-auto size-8 text-fg-3" aria-hidden="true" /><h2 className="mt-3 text-lg font-black text-fg">버전을 구성할 원고를 먼저 선택하세요</h2><p className="mt-1 text-sm text-fg-2">공정·원고에서 이미지 원고를 선택하면 고정 검수 페이지를 조립할 수 있습니다.</p></section>;
  }

  return <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="page-manifest-title" data-page-manifest-builder="">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div><p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">PAGE MANIFEST VERSION BUILDER</p><h2 id="page-manifest-title" className="mt-2 text-xl font-black text-fg">수정한 페이지만 바꾸어 새 원고 버전을 구성합니다</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">기존 고정 검수 페이지를 재사용하고 변경 페이지를 삽입·교체·정렬합니다. 결과는 CBZ로 검증한 뒤 기존 Studio 가져오기·저장 흐름에 전달합니다.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!pages.length || Boolean(busy)} onClick={() => void build("download")} className={buttonClass({ variant: "outline", size: "sm" })}>{busy === "download" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FileArchive className="size-4" aria-hidden="true" />} CBZ 빠른 출력</button>
        <button type="button" disabled={!canEdit || !editorHref || !pages.length || Boolean(busy)} onClick={() => void build("import")} className={buttonClass({ size: "sm" })}>{busy === "import" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Import className="size-4" aria-hidden="true" />} 편집기로 가져와 새 버전 만들기</button>
      </div>
    </div>

    {invalidExplicitSource ? <div className="mt-4 rounded-xl border border-warn/35 bg-warn/10 p-4" role="alert"><div className="flex items-center gap-2 font-bold text-fg"><LockKeyhole className="size-4 text-warn" aria-hidden="true" /> 요청한 페이지 원본 검수본을 찾을 수 없습니다</div><p className="mt-1 text-xs text-fg-2">다른 검수본으로 자동 대체하지 않았습니다.</p><button type="button" onClick={() => { const next = new URLSearchParams(params); next.delete("builderSourceReview"); setParams(next, { replace: true }); }} className={buttonClass({ variant: "outline", size: "sm", className: "mt-3" })}>원본 다시 선택</button></div> : null}

    <div className="mt-5 grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="min-w-0 rounded-2xl border border-line bg-panel p-3">
        <label className="text-xs font-bold text-fg-2">페이지를 가져올 고정 검수본
          <select value={source?.id ?? ""} disabled={invalidExplicitSource} onChange={(event) => { const next = new URLSearchParams(params); next.set("builderSourceReview", event.target.value); setParams(next, { replace: true }); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg">
            <option value="" disabled>검수본 선택</option>
            {compatibleCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.episodeLabel} · {candidate.processLabel} · {candidate.review.title}</option>)}
          </select>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!source || Boolean(busy)} onClick={() => void loadAllPages()} className={buttonClass({ variant: "outline", size: "sm" })}>{busy === "load" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <PackagePlus className="size-4" aria-hidden="true" />} 전체 페이지 불러오기</button>
          <button type="button" disabled={!loadedPages.length || Boolean(busy)} onClick={() => append(loadedPages)} className={buttonClass({ variant: "outline", size: "sm" })}><PackagePlus className="size-4" aria-hidden="true" /> 현재 목록 모두 추가</button>
          {preview.result?.ok && preview.result.nextCursor ? <button type="button" onClick={() => preview.setCursor(preview.result?.ok ? preview.result.nextCursor : null)} className={buttonClass({ variant: "quiet", size: "sm" })}>다음 페이지 목록</button> : null}
          {preview.cursor ? <button type="button" onClick={() => preview.setCursor(null)} className={buttonClass({ variant: "quiet", size: "sm" })}>처음 목록</button> : null}
          <button type="button" onClick={preview.refresh} disabled={!source} className={buttonClass({ variant: "quiet", size: "sm" })}><RefreshCcw className="size-4" aria-hidden="true" /> 갱신</button>
        </div>
        {!preview.result && source && !invalidExplicitSource ? <p className="mt-4 text-xs text-fg-2" role="status"><LoaderCircle className="mr-2 inline size-4 animate-spin" aria-hidden="true" /> 고정 페이지를 확인 중…</p> : null}
        {preview.result?.ok ? <div className="mt-4 grid grid-cols-2 gap-2">
          {preview.result.previews.map((item, index) => {
            const page = loadedPages[index];
            if (!page) return null;
            return <article key={item.sha256} className="rounded-xl border border-line bg-card p-2">
              <StudioReviewImage preview={item} label={`${item.ordinal + 1}페이지`} className="block h-32 w-full rounded-lg object-contain" figureClassName="" />
              <p className="mt-2 text-xs font-bold text-fg">{item.ordinal + 1}페이지</p>
              <div className="mt-2 flex flex-wrap gap-1"><button type="button" onClick={() => append([page])} className="inline-flex min-h-9 items-center rounded-lg border border-line px-2 text-[0.625rem] font-bold text-fg-2"><FilePlus2 className="mr-1 size-3.5" aria-hidden="true" /> 추가</button><button type="button" onClick={() => replace(page)} className="inline-flex min-h-9 items-center rounded-lg border border-line px-2 text-[0.625rem] font-bold text-fg-2"><Replace className="mr-1 size-3.5" aria-hidden="true" /> 선택 위치 교체</button></div>
            </article>;
          })}
        </div> : preview.result && !preview.result.ok ? <p className="mt-4 rounded-xl border border-warn/35 bg-warn/10 p-3 text-xs text-fg-2" role="alert">현재 계정에서 이 고정 검수본의 페이지를 사용할 수 없습니다.</p> : null}
      </div>

      <div className="min-w-0 rounded-2xl border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-black text-fg">새 페이지 구성 · {pages.length}장</h3><p className="mt-1 text-xs text-fg-3">선택 위치 {pages.length ? `${selectedIndex + 1}번째` : "없음"}</p></div>{pages.length ? <button type="button" onClick={() => { setPages([]); setBaseline([]); setLastArchive(null); setNotice("구성을 비웠습니다."); }} className={buttonClass({ variant: "quiet", size: "sm" })}><Trash2 className="size-4" aria-hidden="true" /> 전체 비우기</button> : null}</div>
        {baseline.length > 0 ? <div className="mt-3 flex flex-wrap gap-2" aria-label="페이지 구성 변경 요약">
          {(["reused", "changed", "new", "duplicate", "missing"] as const).map((state) => <span key={state} className={cn("inline-flex min-h-7 items-center rounded-full border px-2 text-[0.625rem] font-bold", stateClass(state))}>{STATE_LABELS[state]} {summary[state]}</span>)}
        </div> : null}
        {summary.missing > 0 ? <p className="mt-3 rounded-xl border border-bad/35 bg-bad/10 p-3 text-xs font-bold text-bad" role="alert">기준 버전에서 빠진 페이지가 {summary.missing}장 있습니다. 출력하거나 편집기로 넘기기 전에 의도한 제거인지 확인하세요.</p> : null}
        {pages.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-line p-8 text-center"><CopyPlus className="mx-auto size-7 text-fg-3" aria-hidden="true" /><p className="mt-2 text-sm font-bold text-fg">왼쪽의 고정 검수 페이지를 추가하세요</p><p className="mt-1 text-xs text-fg-2">첫 구성은 비교 기준으로 보존되고 이후 교체·삽입 결과를 신규/변경/재사용으로 표시합니다.</p></div> : <ol className="mt-4 space-y-2" aria-label="새 버전 페이지 순서">
          {pages.map((page, index) => {
            const state = productionManifestPageState(page, index, baseline, pages);
            return <li key={`${page.id}:${index}`}><button type="button" onClick={() => setSelectedIndex(index)} className={cn("flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", selectedIndex === index ? "border-accent bg-accent-soft/20" : "border-line bg-card")}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel text-xs font-black text-fg">{index + 1}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-fg">원본 {page.sourceOrdinal + 1}페이지 · {page.sourceReviewId}</span><span className="mt-0.5 block truncate text-[0.625rem] text-fg-3">{page.sha256.slice(0, 12)}… · {(page.byteLength / 1024).toFixed(1)} KB</span></span>
              <span className={cn("inline-flex min-h-7 shrink-0 items-center rounded-full border px-2 text-[0.625rem] font-bold", stateClass(state))}>{state === "reused" ? <Check className="mr-1 size-3" aria-hidden="true" /> : null}{STATE_LABELS[state]}</span>
            </button><div className="mt-1 flex justify-end gap-1"><button type="button" disabled={index === 0} onClick={() => setPages(moveProductionManifestPage(pages, index, index - 1))} aria-label={`${index + 1}페이지 위로`} className="grid size-10 place-items-center rounded-lg border border-line bg-card text-fg-2 disabled:opacity-40"><ArrowUp className="size-4" aria-hidden="true" /></button><button type="button" disabled={index === pages.length - 1} onClick={() => setPages(moveProductionManifestPage(pages, index, index + 1))} aria-label={`${index + 1}페이지 아래로`} className="grid size-10 place-items-center rounded-lg border border-line bg-card text-fg-2 disabled:opacity-40"><ArrowDown className="size-4" aria-hidden="true" /></button><button type="button" onClick={() => setPages(removeProductionManifestPage(pages, index))} aria-label={`${index + 1}페이지 제거`} className="grid size-10 place-items-center rounded-lg border border-line bg-card text-bad"><Trash2 className="size-4" aria-hidden="true" /></button></div></li>;
          })}
        </ol>}
        {busy ? <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft/20 p-3 text-xs text-fg-2" role="status"><LoaderCircle className="mr-2 inline size-4 animate-spin text-accent" aria-hidden="true" /> {busy === "load" ? "고정 검수본의 전체 페이지 목록을 확인하는 중…" : `페이지 바이트·SHA-256 검증 및 archive 구성 중 · ${progress}%`}</div> : null}
        {notice ? <p className="mt-4 rounded-xl border border-line bg-card p-3 text-xs text-fg-2" role="status">{notice}</p> : null}
        {lastArchive ? <p className="mt-2 text-[0.625rem] text-fg-3">최근 생성: {lastArchive.fileName} · {lastArchive.manifest.pageCount}페이지 · {(lastArchive.blob.size / 1024).toFixed(1)} KB</p> : null}
      </div>
    </div>
  </section>;
}
