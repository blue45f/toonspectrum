import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  filterStudioAssetPresentation,
  isStudioAssetAssemblyKit,
  studioAssetPresentationLabel,
  studioAssetPreviewBackground,
  type StudioAssetPresentationFilter,
} from "./studio-asset-visual-curation";
import {
  createStudioCc0ImageRecord,
  filterStudioCc0Assets,
  loadStudioCc0Catalog,
  STUDIO_CC0_CATEGORY_LABELS,
  studioCc0AssetUrl,
  type StudioCc0Asset,
  type StudioCc0AssetKind,
} from "./studio-cc0-asset-delivery";

import type { StudioAsset } from "./studio-asset-library";

const PAGE_SIZE = 24;
const CONTROL = "min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";
const KINDS: readonly { id: "all" | StudioCc0AssetKind; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "model", label: "3D 소품" },
  { id: "effect-mask", label: "효과 마스크" },
  { id: "surface-texture", label: "표면 재질" },
];

function AssetPreview({asset}: {readonly asset: StudioCc0Asset}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <div className="aspect-square w-full overflow-hidden rounded-md" style={{backgroundColor: studioAssetPreviewBackground(asset)}}>
    {failed
      ? <div className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center text-xs text-slate-900"><span>미리보기를 불러오지 못했습니다.</span><button type="button" className={CONTROL} onClick={() => {setFailed(false); setAttempt(value => value + 1);}}>다시 보기</button></div>
      : <img key={attempt} src={studioCc0AssetUrl(asset.previewPath ?? asset.path)} alt={asset.name} loading="lazy" decoding="async" width={384} height={384} onError={() => setFailed(true)} className="h-full w-full object-contain" />}
  </div>;
}

export function StudioCc0AssetLibraryPanel({onUseAsset}: {readonly onUseAsset: (asset: StudioAsset) => boolean}) {
  const searchId = useId();
  const styleId = useId();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<readonly StudioCc0Asset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | StudioCc0AssetKind>("all");
  const [style, setStyle] = useState<StudioAssetPresentationFilter>("all");
  const [includeAssembly, setIncludeAssembly] = useState(false);
  const [page, setPage] = useState(0);
  const [inserting, setInserting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const insertController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || catalog) return;
    const controller = new AbortController();
    loadStudioCc0Catalog(controller.signal).then(items => {
      if (!controller.signal.aborted) {setCatalog(items); setLoadError(null);}
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "에셋 목록을 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, [open, catalog, revision]);
  useEffect(() => () => insertController.current?.abort(), []);

  const selectable = useMemo(() => filterStudioCc0Assets(catalog ?? [], ""), [catalog]);
  const filtered = useMemo(() => {
    const matches = filterStudioCc0Assets(selectable, query, kind === "all" ? undefined : kind);
    return [...filterStudioAssetPresentation(matches, style, includeAssembly)]
      .sort((a, b) => Number(b.provider === "Poly Haven") - Number(a.provider === "Poly Haven"));
  }, [selectable, query, kind, style, includeAssembly]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  async function insert(asset: StudioCc0Asset): Promise<void> {
    insertController.current?.abort();
    const controller = new AbortController();
    insertController.current = controller;
    setInserting(asset.id);
    setNotice("");
    try {
      const item = await createStudioCc0ImageRecord(asset, controller.signal);
      if (controller.signal.aborted) return;
      setNotice(onUseAsset(item) ? `${asset.name} 에셋을 삽입했습니다.` : "캔버스에 삽입하지 못했습니다. 편집 가능한 컷을 선택해 주세요.");
    } catch (error: unknown) {
      if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "에셋 삽입에 실패했습니다.");
    } finally {
      if (!controller.signal.aborted) setInserting(null);
    }
  }

  return (
    <details className="mb-3 rounded-xl border border-line bg-card/70 p-3" data-studio-cc0-library="true" onToggle={event => {
      const nextOpen = event.currentTarget.open;
      setOpen(nextOpen);
      if (!nextOpen) {insertController.current?.abort(); setInserting(null);}
    }}>
      <summary className="min-h-11 cursor-pointer rounded-md text-sm font-bold text-fg-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        CC0 원본 에셋 라이브러리 {catalog ? `· ${selectable.length}종` : ""}
      </summary>
      {open && <div className="mt-2 space-y-3">
        <p className="text-xs leading-relaxed text-fg-3">상세 PBR 소품, 스타일 3D, 투명 효과와 표면 재질을 구분해 찾습니다. 3D는 GLB를 받은 뒤 모델 가져오기를 사용하고, 효과·재질 이미지는 캔버스에 바로 삽입하세요.</p>
        <label htmlFor={searchId} className="block text-xs font-semibold text-fg-2">에셋 검색</label>
        <input id={searchId} type="search" value={query} placeholder="가구, 음식, 나무, chair, wood…" className={`${CONTROL} w-full`} onChange={event => {setQuery(event.target.value); setPage(0);}} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="에셋 종류">
          {KINDS.map(item => <button key={item.id} type="button" className={`${CONTROL} ${kind === item.id ? "border-accent font-bold text-accent" : ""}`} aria-pressed={kind === item.id} onClick={() => {setKind(item.id); setPage(0);}}>{item.label}</button>)}
        </div>
        <label htmlFor={styleId} className="block text-xs font-semibold text-fg-2">표현 방식</label>
        <select id={styleId} value={style} className={`${CONTROL} w-full`} onChange={event => {setStyle(event.target.value as StudioAssetPresentationFilter); setPage(0);}}>
          <option value="all">모든 표현 방식</option>
          <option value="detailed-pbr">상세 PBR 3D</option>
          <option value="stylized-3d">스타일 3D · 로우폴리</option>
          <option value="raster">효과·표면 이미지</option>
        </select>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-xs text-fg-2">
          <input type="checkbox" checked={includeAssembly} onChange={event => {setIncludeAssembly(event.target.checked); setPage(0);}} className="size-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />조립 부품 포함
        </label>
        <p className="text-[0.65rem] leading-relaxed text-fg-3">벽·바닥·도로 등 조합용 부품은 기본 목록에서 분리했습니다. 전체 원본 수에는 조립 부품이 포함됩니다.</p>
        {loadError ? <div role="alert" className="space-y-2 text-xs text-fg-2"><p>{loadError}</p><button type="button" className={CONTROL} onClick={() => {setLoadError(null); setRevision(value => value + 1);}}>다시 불러오기</button></div>
          : !catalog ? <p role="status" className="text-xs text-fg-3">에셋 목록을 불러오는 중입니다.</p>
          : <>
            <p role="status" className="text-xs text-fg-3">검색 결과 {filtered.length}종 · {currentPage + 1}/{pages}페이지</p>
            <div className="grid max-h-[65vh] grid-cols-2 gap-2 overflow-y-auto overscroll-contain" data-studio-cc0-results="true">
              {visible.map(asset => <article key={asset.id} data-studio-cc0-asset={asset.id} className="min-w-0 rounded-lg border border-line bg-panel p-2">
                <AssetPreview asset={asset} />
                <p className="mt-2 break-words text-xs font-semibold text-fg-1">{asset.name}</p>
                <p className="mt-1 text-[0.65rem] font-semibold text-fg-2">{studioAssetPresentationLabel(asset)}{isStudioAssetAssemblyKit(asset) ? " · 조립 부품" : ""}</p>
                <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">{STUDIO_CC0_CATEGORY_LABELS[asset.category] ?? asset.category}<br />{asset.provider} · CC0{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : " · GLB"}</p>
                {asset.kind === "model"
                  ? <a className={`${CONTROL} mt-2 flex items-center justify-center`} href={studioCc0AssetUrl(asset.path)} download={`${asset.id}.glb`} aria-label={`${asset.name} GLB 받기`}>GLB 받기</a>
                  : <button className={`${CONTROL} mt-2 w-full`} type="button" disabled={inserting !== null} aria-label={`${asset.name} 캔버스에 삽입`} onClick={() => {void insert(asset);}}>{inserting === asset.id ? "검증·삽입 중…" : "캔버스에 삽입"}</button>}
              </article>)}
            </div>
            {filtered.length === 0 && <div className="space-y-2 py-4 text-center text-xs text-fg-3"><p>현재 검색어·종류·표현 방식에 맞는 결과가 없습니다.</p><button type="button" className={CONTROL} onClick={() => {setQuery(""); setKind("all"); setStyle("all"); setPage(0);}}>검색 조건 초기화</button></div>}
            {pages > 1 && <nav className="flex items-center justify-between gap-2" aria-label="에셋 페이지">
              <button type="button" className={CONTROL} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</button>
              <span className="text-xs text-fg-3">{currentPage + 1} / {pages}</span>
              <button type="button" className={CONTROL} disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>다음</button>
            </nav>}
          </>}
        <p role="status" aria-live="polite" className="text-xs leading-relaxed text-fg-2">{notice}</p>
        <p className="text-[0.65rem] leading-relaxed text-fg-3">출처·라이선스·파일 해시를 보관하며, 확인된 시각 결함은 신규 선택에서 제외합니다. 실제 미리보기 검수와 개별 장면의 확대·저장·복원 검증은 별도입니다.</p>
      </div>}
    </details>
  );
}
