import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useId, useRef, useState } from "react";

import {
  selectStudioLocalAssetPage,
  studioLocalAssetKindLabel,
  summarizeStudioAssetDeletion,
  type StudioAssetLibrarySort,
} from "./studio-asset-library-management";

import type { StudioAsset } from "./studio-asset-library";

const CONTROL = "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

export interface StudioLocalAssetManagerProps {
  readonly assets: readonly StudioAsset[];
  readonly loading: boolean;
  readonly onDeleteAsset: (id: string) => Promise<void>;
  readonly onUseAsset: (asset: StudioAsset) => boolean;
  readonly onOpen3d: () => void;
}

export function StudioLocalAssetManager({ assets, loading, onDeleteAsset, onUseAsset, onOpen3d }: StudioLocalAssetManagerProps) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<StudioAssetLibrarySort>("recent");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [confirmation, setConfirmation] = useState<readonly string[]>([]);
  const [lastRequested, setLastRequested] = useState<readonly string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const result = selectStudioLocalAssetPage(assets, query, sort, page);
  const selectedIds = selected.filter((id) => assets.some((asset) => asset.id === id));
  const deletion = summarizeStudioAssetDeletion(lastRequested, assets);

  function requestDelete(ids: readonly string[]): void {
    if (busyRef.current) return;
    setConfirmation([...new Set(ids)]);
    setLastRequested([]);
    setError(null);
  }
  async function confirmDelete(): Promise<void> {
    if (busyRef.current || confirmation.length === 0) return;
    busyRef.current = true;
    setPending(true);
    const ids = [...confirmation];
    setConfirmation([]);
    setLastRequested(ids);
    try {
      for (const id of ids) {
        if (!mountedRef.current) break;
        try { await onDeleteAsset(id); }
        catch (cause: unknown) {
          if (mountedRef.current) setError(cause instanceof Error ? cause.message : "에셋 삭제에 실패했습니다. 남아 있는 항목을 다시 시도해 주세요.");
        }
      }
      if (mountedRef.current) setSelected([]);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  }

  return (
    <section aria-label={translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "내 에셋 관리")} className="space-y-3" data-studio-local-asset-manager="true">
      <header className="rounded-xl border border-line bg-card p-3">
        <h3 className="text-sm font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "내 에셋 관리 · ")}{assets.length}{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "개")}</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "현재 기기의 이미지 보관함입니다. 삭제에 실패한 원본은 목록에 유지합니다. 3D 렌더 이미지는 평면 이미지이며 3D 모델 원본과 별개입니다.")}</p>
        <button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "en", "{v0} mt-2"), { v0: String(CONTROL) })} onClick={onOpen3d} disabled={pending}>{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "3D 모델 원본 관리 열기")}</button>
      </header>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label htmlFor={searchId} className="sr-only">{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "내 에셋 이름 검색")}</label>
        <input id={searchId} type="search" value={query} placeholder={translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "이름, AI 이미지, 3D 렌더 이미지 검색")} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "en", "{v0} min-w-0 font-normal"), { v0: String(CONTROL) })} onChange={(event) => { setQuery(event.target.value.slice(0, 120)); setPage(0); }} />
        <select aria-label={translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "내 에셋 정렬")} value={sort} className={CONTROL} onChange={(event) => { setSort(event.target.value as StudioAssetLibrarySort); setPage(0); }}><option value="recent">{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "최신순")}</option><option value="name">{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "이름순")}</option></select>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={CONTROL} disabled={pending || result.items.length === 0} onClick={() => setSelected((current) => [...new Set([...current, ...result.items.map((asset) => asset.id)])])}>{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "현재 페이지 선택")}</button>
        <button type="button" className={CONTROL} disabled={pending || selectedIds.length === 0} onClick={() => setSelected([])}>{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "선택 해제")}</button>
        <button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "en", "{v0} text-bad"), { v0: String(CONTROL) })} disabled={pending || selectedIds.length === 0} onClick={() => requestDelete(selectedIds)}>{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "선택 ")}{selectedIds.length}{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "개 삭제")}</button>
      </div>
      {confirmation.length > 0 && <div className="space-y-2 rounded-xl border border-warn/50 bg-warn/5 p-3" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "에셋 삭제 확인")}>
        <p className="text-xs leading-relaxed text-fg">{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "선택한 ")}{confirmation.length}{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "개를 현재 기기의 보관함에서 삭제할까요? 이미 캔버스에 배치한 평면 이미지는 유지되며, 보관함 원본 삭제는 되돌릴 수 없습니다.")}</p>
        <div className="flex gap-2"><button type="button" className={CONTROL} onClick={() => setConfirmation([])}>{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "취소")}</button><button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "en", "{v0} text-bad"), { v0: String(CONTROL) })} onClick={() => void confirmDelete()}>{confirmation.length}{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "개 삭제 확인")}</button></div>
      </div>}
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      {pending ? <p role="status" className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "에셋 원본을 삭제하는 중입니다.")}</p> : lastRequested.length > 0 && <p role="status" aria-live="polite" className="text-xs text-fg-3">{deletion.removed}{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "개 삭제 완료")}{deletion.remaining > 0 ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", " · {v0}개는 보관함에 남아 있습니다. 오류 안내를 확인하고 다시 시도해 주세요."), { v0: String(deletion.remaining) }) : ""}</p>}
      {loading ? <p role="status" className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "내 에셋을 불러오는 중입니다.")}</p> : <>
        <p className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "검색 결과 ")}{result.total}{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "개 · ")}{result.page + 1}/{result.pages}{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "페이지")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{result.items.map((asset) => <article key={asset.id} className="min-w-0 rounded-xl border border-line bg-card p-2">
          <label className="flex min-h-11 items-center gap-2 text-xs text-fg-2"><input type="checkbox" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "{v0} 선택"), { v0: String(asset.name) })} disabled={pending} checked={selectedIds.includes(asset.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, asset.id])] : current.filter((id) => id !== asset.id))} /><span className="truncate">{asset.name}</span></label>
          <img src={asset.dataUrl} alt={asset.name} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-lg bg-raised object-contain" />
          <p className="my-2 text-[0.65rem] leading-relaxed text-fg-3">{studioLocalAssetKindLabel(asset)} · {asset.width}×{asset.height}</p>
          <div className="grid grid-cols-2 gap-1"><button type="button" className={CONTROL} disabled={pending} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "{v0} 삽입"), { v0: String(asset.name) })} onClick={() => {
            try { if (!onUseAsset(asset)) setError("이미지를 삽입하지 못했습니다. 편집 가능한 캔버스를 확인해 주세요."); }
            catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "이미지 삽입에 실패했습니다."); }
          }}>{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "삽입")}</button><button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "en", "{v0} text-bad"), { v0: String(CONTROL) })} disabled={pending} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "{v0} 삭제"), { v0: String(asset.name) })} onClick={() => requestDelete([asset.id])}>{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "삭제")}</button></div>
        </article>)}</div>
        {result.total === 0 && <p className="py-4 text-center text-xs text-fg-3">{assets.length === 0 ? translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "등록한 에셋이 없습니다. 탐색의 이미지 업로드로 추가해 주세요.") : translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "검색 결과가 없습니다. 다른 이름이나 종류로 검색해 주세요.")}</p>}
        {result.pages > 1 && <nav aria-label={translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "내 에셋 페이지")} className="flex justify-between gap-2"><button type="button" className={CONTROL} disabled={result.page === 0} onClick={() => setPage(result.page - 1)}>{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "이전")}</button><button type="button" className={CONTROL} disabled={result.page + 1 >= result.pages} onClick={() => setPage(result.page + 1)}>{translateCurrentStaticSourceText("domains.creator.StudioLocalAssetManager", "ko", "다음")}</button></nav>}
      </>}
    </section>
  );
}
