import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  createStudioCc0ImageRecord, filterStudioCc0Assets, loadStudioCc0Catalog,
  STUDIO_CC0_CATEGORY_LABELS, studioCc0AssetUrl,
  type StudioCc0Asset, type StudioCc0AssetKind,
} from "./studio-cc0-asset-delivery";
import {
  curateStudioCc0Selection, isStudioCc0AssemblyComponent, isStudioCc0EligibleForNewSelection,
  studioCc0ReviewLabel, studioCc0StyleLabel,
  type StudioCc0StyleFilter,
} from "./studio-cc0-curation";
import { useStudioModalSheet } from "./useStudioModalSheet";

import type { StudioAsset } from "./studio-asset-library";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

const PAGE_SIZE = 24;
const CONTROL = "min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";
const KINDS: readonly {id: "all" | StudioCc0AssetKind; label: string}[] = [
  {id: "all", label: "전체"}, {id: "model", label: "3D 소품"},
  {id: "background", label: "2D 배경"}, {id: "prop-image", label: "2D 투명 소품"},
  {id: "effect-mask", label: "효과 마스크"}, {id: "surface-texture", label: "표면 재질"},
];
function categoryLabel(asset: StudioCc0Asset): string {
  return asset.category === "pbr-detailed-prop" ? "디테일 가구 · 생활 소품" : STUDIO_CC0_CATEGORY_LABELS[asset.category] ?? asset.category;
}
function imageClass(asset: StudioCc0Asset): string {
  return asset.kind === "effect-mask" ? "bg-slate-600" : "bg-slate-200";
}

export function StudioCc0AssetLibraryPanel({onUseAsset}: {readonly onUseAsset: (asset: StudioAsset) => boolean}) {
  const searchId = useId();
  const previewTitleId = useId();
  const rootRef = useRef<HTMLDetailsElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<readonly StudioCc0Asset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | StudioCc0AssetKind>("all");
  const [style, setStyle] = useState<StudioCc0StyleFilter>("all");
  const [includeComponents, setIncludeComponents] = useState(false);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<StudioCc0Asset | null>(null);
  const [inserting, setInserting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const insertController = useRef<AbortController | null>(null);
  const debouncedQuery = useDebouncedValue(query, 140);

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
  useEffect(() => () => {
    insertController.current?.abort();
    insertController.current = null;
  }, []);

  function dismissPreview(): void {
    // Closing a retained panel does not unmount this component. Cancel its pending work explicitly
    // so a late download cannot modify the canvas after the artist has left the preview/library.
    const pending = insertController.current;
    insertController.current = null;
    pending?.abort();
    setInserting(null);
    if (pending) setNotice("에셋 삽입을 취소했습니다.");
    setPreview(null);
  }

  useStudioModalSheet({
    activeKey: preview ? `cc0-asset-preview:${preview.id}` : null,
    dialogRef: previewRef, rootRef,
    onDismiss: dismissPreview,
    resolveInitialFocus: dialog => dialog.querySelector<HTMLElement>("[data-autofocus='true']"),
  });
  const filtered = useMemo(() => curateStudioCc0Selection(
    filterStudioCc0Assets(catalog ?? [], debouncedQuery, kind === "all" ? undefined : kind),
    {style, includeComponents},
  ), [catalog, debouncedQuery, kind, style, includeComponents]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectableCount = catalog?.filter(isStudioCc0EligibleForNewSelection).length;

  async function insert(asset: StudioCc0Asset): Promise<void> {
    insertController.current?.abort();
    const controller = new AbortController();
    insertController.current = controller;
    setInserting(asset.id); setNotice("");
    try {
      const item = await createStudioCc0ImageRecord(asset, controller.signal);
      if (controller.signal.aborted || insertController.current !== controller) return;
      const added = onUseAsset(item);
      setNotice(added ? `${asset.name} 에셋을 삽입했습니다.` : "캔버스에 삽입하지 못했습니다. 편집 가능한 컷을 선택해 주세요.");
      if (added) setPreview(null);
    } catch (error: unknown) {
      if (!controller.signal.aborted && insertController.current === controller) {
        setNotice(error instanceof Error ? error.message : "에셋 삽입에 실패했습니다.");
      }
    } finally {
      // A cancelled predecessor must not clear the loading state of a newer insertion.
      if (insertController.current === controller) {
        insertController.current = null;
        setInserting(null);
      }
    }
  }
  function renderUseButton(asset: StudioCc0Asset) {
    if (asset.kind !== "model") {
      return <button className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "{v0} mt-2 w-full"), { v0: String(CONTROL) })} type="button" disabled={inserting !== null} onClick={() => {void insert(asset);}}>{inserting === asset.id ? translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "검증·삽입 중…") : translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "캔버스에 삽입")}</button>;
    }
    if (!asset.original) {
      return <a className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "{v0} mt-2 flex items-center justify-center"), { v0: String(CONTROL) })} href={studioCc0AssetUrl(asset.path)} download={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "{v0}.glb"), { v0: String(asset.id) })}>{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "GLB 받기")}</a>;
    }
    const original = asset.original;
    const originalTextureMiB = Math.ceil(original.estimatedDecodedImageBytes / (1024 * 1024));
    return <div className="mt-2 space-y-2">
      <a className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "{v0} flex items-center justify-center text-center"), { v0: String(CONTROL) })} href={studioCc0AssetUrl(asset.path)} download={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "{v0}.glb"), { v0: String(asset.id) })}>{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "경량본 받기")}</a>
      <a className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "{v0} flex items-center justify-center text-center"), { v0: String(CONTROL) })} href={studioCc0AssetUrl(original.path)} download={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "{v0}-original.glb"), { v0: String(asset.id) })}>{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "고품질 원본 받기")}</a>
      <p className="text-[0.65rem] leading-relaxed text-fg-3">{original.visuallyEquivalentToDefault
        ? translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "두 파일의 화질은 같습니다. 원본은 중복 텍스처 때문에 메모리를 더 사용합니다.")
        : translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "경량본은 색상·노멀·형상을 유지하고 ORM 텍스처만 줄였습니다. 경량은 GPU 메모리 기준이며 다운로드 크기는 더 클 수 있습니다.")}</p>
      <p className="text-[0.65rem] leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "원본 텍스처는 약 ")}{originalTextureMiB}{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "MiB입니다. 배경 3D 모델 탭에서 고품질 모드를 선택한 뒤 원본 GLB를 가져오세요. 다운로드만으로 모드가 바뀌지는 않습니다.")}</p>
    </div>;
  }
  return (
    <details ref={rootRef} className="mb-3 rounded-xl border border-line bg-card/70 p-3" data-studio-cc0-library="true" onToggle={event => {setOpen(event.currentTarget.open); if (!event.currentTarget.open) dismissPreview();}}>
      <summary className="min-h-11 cursor-pointer rounded-md text-sm font-bold text-fg-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "CC0 에셋 라이브러리 ")}{selectableCount === undefined ? "" : formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "· {v0}종"), { v0: String(selectableCount) })}</summary>
      {open && <div className="mt-2 space-y-3">
        <p className="text-xs leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "배경·투명 소품·PBR 모델·재질을 종류별로 찾습니다. 2D 배경과 소품은 캔버스에 바로 삽입하고, 3D는 GLB를 받은 뒤 모델 가져오기를 사용하세요. 실사 배경은 사진 레퍼런스이며, 투명 소품은 표시된 3D 원본에서 렌더한 파생 소재입니다.")}</p>
        <label htmlFor={searchId} className="block text-xs font-semibold text-fg-2">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "에셋 검색")}</label>
        <input id={searchId} type="search" value={query} placeholder={translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "골목, 정원, 실내, 의자, 조명, chair…")} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "{v0} w-full"), { v0: String(CONTROL) })} onChange={event => {setQuery(event.target.value); setPage(0);}} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "에셋 종류")}>{KINDS.map(item => <button key={item.id} type="button" className={`${CONTROL} ${kind === item.id ? "border-accent font-bold text-accent" : ""}`} aria-pressed={kind === item.id} onClick={() => {setKind(item.id); setPage(0);}}>{item.label}</button>)}</div>
        <label className="block text-xs font-semibold text-fg-2">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "표현 스타일")}<select aria-label={translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "에셋 표현 스타일")} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "{v0} mt-1 w-full"), { v0: String(CONTROL) })} value={style} onChange={event => {setStyle(event.target.value as StudioCc0StyleFilter); setPage(0);}}><option value="all">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "전체 · 디테일 원본 우선")}</option><option value="detailed">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "디테일 PBR 모델 · 재질")}</option><option value="stylized">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "스타일라이즈 · 로우폴리 모델")}</option></select></label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-fg-2"><input type="checkbox" checked={includeComponents} onChange={event => {setIncludeComponents(event.target.checked); setPage(0);}} />{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "조립부품 포함 · 벽/도로/지형 타일")}</label>
        {loadError ? <div role="alert" className="space-y-2 text-xs text-fg-2"><p>{loadError}</p><button type="button" className={CONTROL} onClick={() => setRevision(value => value + 1)}>{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "다시 불러오기")}</button></div>
          : !catalog ? <p role="status" className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "에셋 목록을 불러오는 중입니다.")}</p>
          : <>
            <p role="status" className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "검색 결과 ")}{filtered.length}{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "종 · ")}{currentPage + 1}/{pages}{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "페이지")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{visible.map(asset => <article key={asset.id} className="min-w-0 rounded-lg border border-line bg-panel p-2" data-cc0-asset-id={asset.id}>
              <button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "block aspect-square w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent {v0}"), { v0: String(imageClass(asset)) })} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "{v0} 확대 미리보기"), { v0: String(asset.name) })} onClick={() => setPreview(asset)}><img src={studioCc0AssetUrl(asset.previewPath ?? asset.path)} alt="" loading="lazy" decoding="async" width={384} height={384} className="aspect-square w-full rounded-md object-contain" /></button>
              <p className="mt-1 break-words text-xs font-semibold text-fg-1">{asset.name}</p><p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">{categoryLabel(asset)}<br />{studioCc0StyleLabel(asset)}{isStudioCc0AssemblyComponent(asset) ? translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", " · 조립부품") : ""}<br />{asset.kind === "model" && <>{studioCc0ReviewLabel(asset)}<br /></>}{asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}<a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{asset.provider}</a> {translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "· CC0")}</p>{renderUseButton(asset)}
            </article>)}</div>
            {filtered.length === 0 && <p className="py-4 text-center text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "검색 결과가 없습니다. 검색어나 스타일을 바꾸거나 조립부품 포함을 선택해 주세요.")}</p>}
            {pages > 1 && <nav className="flex items-center justify-between gap-2" aria-label={translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "에셋 페이지")}><button type="button" className={CONTROL} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "이전")}</button><span className="text-xs text-fg-3">{currentPage + 1} / {pages}</span><button type="button" className={CONTROL} disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "다음")}</button></nav>}
          </>}
        <p role="status" aria-live="polite" className="text-xs leading-relaxed text-fg-2">{notice}</p>
        <p className="text-[0.65rem] leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "3D 소품은 실제 렌더와 미리보기 검수 기록이 있는 항목을 제공합니다. 미검수·제외 판정 모델은 새 선택 목록에서 제외하며, 미리보기 검수는 모든 각도와 확대 상태의 검수를 뜻하지 않습니다. 조립부품은 별도로 표시하고 기존 작품의 원본은 보존합니다.")}</p>
      </div>}
      {preview && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3"><div ref={previewRef} role="dialog" aria-modal="true" aria-labelledby={previewTitleId} tabIndex={-1} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-panel p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3"><h3 id={previewTitleId} className="text-sm font-bold text-fg-1">{preview.name}</h3><button type="button" data-autofocus="true" className={CONTROL} onClick={dismissPreview}>{translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "닫기")}</button></div>
        <img src={studioCc0AssetUrl(preview.kind === "model" ? preview.previewPath ?? preview.path : preview.path)} alt={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "{v0} 실제 파일 미리보기"), { v0: String(preview.name) })} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "mt-3 max-h-[60dvh] w-full rounded-lg object-contain {v0}"), { v0: String(imageClass(preview)) })} />
        <p className="mt-2 text-xs leading-relaxed text-fg-2">{studioCc0StyleLabel(preview)} · {categoryLabel(preview)} · {preview.provider} {translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "en", "· CC0")}<br />{preview.kind === "model" ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "{v0} · 이 이미지는 해당 GLB의 렌더입니다. 실제 모델은 회전·확대하여 사용할 수 있습니다."), { v0: String(studioCc0ReviewLabel(preview)) }) : formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioCc0AssetLibraryPanel", "ko", "원본 {v0}×{v1}px. 표시 크기는 화면에 맞춰 축소됩니다."), { v0: String(preview.width), v1: String(preview.height) })}</p>{renderUseButton(preview)}
        <p role="status" aria-live="polite" className="mt-2 text-xs leading-relaxed text-fg-2">{notice}</p>
      </div></div>}
    </details>
  );
}
