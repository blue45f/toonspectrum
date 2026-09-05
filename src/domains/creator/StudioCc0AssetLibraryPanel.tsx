import { useEffect, useId, useMemo, useRef, useState } from "react";

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

export function StudioCc0AssetLibraryPanel({onUseAsset}: {readonly onUseAsset: (asset: StudioAsset) => boolean}) {
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<readonly StudioCc0Asset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | StudioCc0AssetKind>("all");
  const [page, setPage] = useState(0);
  const [inserting, setInserting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const insertController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || catalog) return;
    const controller = new AbortController();
    setLoadError(null);
    loadStudioCc0Catalog(controller.signal).then(items => {
      if (!controller.signal.aborted) setCatalog(items);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "에셋 목록을 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, [open, catalog, revision]);
  useEffect(() => () => insertController.current?.abort(), []);

  const filtered = useMemo(() => filterStudioCc0Assets(catalog ?? [], query, kind === "all" ? undefined : kind), [catalog, query, kind]);
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
    <details className="mb-3 rounded-xl border border-line bg-card/70 p-3" data-studio-cc0-library="true" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer rounded-md text-sm font-bold text-fg-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        CC0 원본 에셋 라이브러리 {catalog ? `· ${catalog.length}종` : ""}
      </summary>
      {open && <div className="mt-2 space-y-3">
        <p className="text-xs leading-relaxed text-fg-3">가구·음식·자연물·건축 소품과 효과·재질을 검색합니다. 3D는 로우폴리와 정밀 PBR 소품을 함께 제공하며, GLB 파일을 받은 뒤 3D 도구의 모델 가져오기를 사용하세요. 효과와 재질은 바로 캔버스에 삽입할 수 있습니다.</p>
        <label htmlFor={searchId} className="block text-xs font-semibold text-fg-2">에셋 검색</label>
        <input id={searchId} type="search" value={query} placeholder="가구, 음식, 나무, chair, tree…" className={`${CONTROL} w-full`} onChange={event => {setQuery(event.target.value); setPage(0);}} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="에셋 종류">
          {KINDS.map(item => <button key={item.id} type="button" className={`${CONTROL} ${kind === item.id ? "border-accent font-bold text-accent" : ""}`} aria-pressed={kind === item.id} onClick={() => {setKind(item.id); setPage(0);}}>{item.label}</button>)}
        </div>
        {loadError ? <div role="alert" className="space-y-2 text-xs text-fg-2"><p>{loadError}</p><button type="button" className={CONTROL} onClick={() => setRevision(value => value + 1)}>다시 불러오기</button></div>
          : !catalog ? <p role="status" className="text-xs text-fg-3">에셋 목록을 불러오는 중입니다.</p>
          : <>
            <p role="status" className="text-xs text-fg-3">검색 결과 {filtered.length}종 · {currentPage + 1}/{pages}페이지</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visible.map(asset => <article key={asset.id} className="min-w-0 rounded-lg border border-line bg-panel p-2">
                <img src={studioCc0AssetUrl(asset.previewPath ?? asset.path)} alt={asset.name} loading="lazy" decoding="async" width={384} height={384} className="aspect-square w-full rounded-md bg-card object-contain" />
                <p className="mt-1 break-words text-xs font-semibold text-fg-1">{asset.name}</p>
                <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">{STUDIO_CC0_CATEGORY_LABELS[asset.category] ?? asset.category}<br />{asset.provider} · CC0{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : " · 3D 렌더 확인"}</p>
                {asset.kind === "model"
                  ? <a className={`${CONTROL} mt-2 flex items-center justify-center`} href={studioCc0AssetUrl(asset.path)} download={`${asset.id}.glb`}>GLB 받기</a>
                  : <button className={`${CONTROL} mt-2 w-full`} type="button" disabled={inserting !== null} onClick={() => {void insert(asset);}}>{inserting === asset.id ? "검증·삽입 중…" : "캔버스에 삽입"}</button>}
              </article>)}
            </div>
            {filtered.length === 0 && <p className="py-4 text-center text-xs text-fg-3">검색 결과가 없습니다. 다른 검색어나 종류를 선택해 주세요.</p>}
            {pages > 1 && <nav className="flex items-center justify-between gap-2" aria-label="에셋 페이지">
              <button type="button" className={CONTROL} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</button>
              <span className="text-xs text-fg-3">{currentPage + 1} / {pages}</span>
              <button type="button" className={CONTROL} disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>다음</button>
            </nav>}
          </>}
        <p role="status" aria-live="polite" className="text-xs leading-relaxed text-fg-2">{notice}</p>
        <p className="text-[0.65rem] leading-relaxed text-fg-3">출처와 라이선스, 파일 해시를 함께 보관합니다. 마스크는 원본 크기 이내 사용을 권장합니다. 기술·렌더 검증은 모든 장면의 미술 품질 승인이나 저장·복원 검증을 의미하지 않습니다.</p>
      </div>}
    </details>
  );
}
