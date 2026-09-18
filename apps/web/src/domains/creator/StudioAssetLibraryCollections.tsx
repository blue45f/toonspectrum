import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { lazy, Suspense, useState, type ReactNode } from "react";

import { StudioLocalAssetManager } from "./StudioLocalAssetManager";
import { StudioSceneAssetLibrary } from "./StudioSceneAssetLibrary";

import type { StudioAsset } from "./studio-asset-library";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const LazyCc0Library = lazy(() => import("./StudioCc0AssetLibraryPanel").then((module) => ({ default: module.StudioCc0AssetLibraryPanel })));
const CONTROL = "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const VIEWS = [
  { id: "explore", label: "삽입 탐색" },
  { id: "scenes", label: "템플릿 · 배경" },
  { id: "public", label: "고품질 공용" },
  { id: "mine", label: "내 에셋 관리" },
  { id: "sources", label: "소재 출처" },
] as const;
type View = typeof VIEWS[number]["id"];
const SOURCES = [
  { name: "Poly Haven", url: "https://polyhaven.com/", description: "실사 PBR 모델 · 재질 · HDRI", rights: "CC0" },
  { name: "ambientCG", url: "https://ambientcg.com/", description: "고해상도 재질 · 환경 소재", rights: "CC0" },
  { name: "Kenney", url: "https://kenney.nl/assets", description: "스타일라이즈 도시 · 실내 · 소품", rights: "CC0 · 에셋 페이지 확인" },
  { name: "CLIP STUDIO ASSETS", url: "https://assets.clip-studio.com/en-us/", description: "만화 배경 · 소재 · 포즈 · 3D", rights: "무료·유료 혼합 · 항목별 조건 확인" },
  { name: "BlenderKit", url: "https://www.blenderkit.com/", description: "가구 · 건축 · 실내 · 소재 탐색", rights: "무료·유료 혼합 · 항목별 조건 확인" },
] as const;

export interface StudioAssetLibraryCollectionsProps {
  readonly children: ReactNode;
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly assets: readonly StudioAsset[];
  readonly loading: boolean;
  readonly onDeleteAsset: (id: string) => Promise<void>;
  readonly onUseAsset: (asset: StudioAsset) => boolean;
  readonly onUseItem: (item: StudioUnifiedAssetItem) => boolean | void | Promise<boolean | void>;
  readonly onOpen3d: () => void;
  readonly initialView?: View;
}

export function StudioAssetLibraryCollections({ children, items, assets, loading, onDeleteAsset, onUseAsset, onUseItem, onOpen3d, initialView = "explore" }: StudioAssetLibraryCollectionsProps) {
  const [view, setView] = useState<View>(initialView);
  return <div className="space-y-3" data-studio-asset-library-collections="true">
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.StudioAssetLibraryCollections", "ko", "에셋 라이브러리 보기")}>{VIEWS.map((option) => <button key={option.id} type="button" className={`${CONTROL} ${view === option.id ? "border-accent bg-accent-soft text-accent" : ""}`} aria-pressed={view === option.id} onClick={() => setView(option.id)}>{option.label}{option.id === "mine" ? ` ${assets.length}` : ""}</button>)}</div>
    {view === "explore" && children}
    {view === "scenes" && <StudioSceneAssetLibrary items={items} onUseItem={onUseItem} />}
    {view === "public" && <section aria-label={translateCurrentStaticSourceText("domains.creator.StudioAssetLibraryCollections", "ko", "고품질 공용 에셋")} className="space-y-3"><p className="text-xs leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioAssetLibraryCollections", "ko", "아래 CC0 라이브러리를 펼쳐 배경·투명 소품·PBR 모델·표면 재질을 찾아보세요. 원본 출처와 해상도, 검수 상태를 함께 확인할 수 있습니다.")}</p><Suspense fallback={<p role="status" className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioAssetLibraryCollections", "ko", "공용 에셋 라이브러리를 여는 중입니다.")}</p>}><LazyCc0Library onUseAsset={onUseAsset} /></Suspense><button type="button" className={CONTROL} onClick={onOpen3d}>{translateCurrentStaticSourceText("domains.creator.StudioAssetLibraryCollections", "ko", "다운로드한 GLB를 3D 모델로 가져오기")}</button></section>}
    {view === "mine" && <StudioLocalAssetManager assets={assets} loading={loading} onDeleteAsset={onDeleteAsset} onUseAsset={onUseAsset} onOpen3d={onOpen3d} />}
    {view === "sources" && <section aria-label={translateCurrentStaticSourceText("domains.creator.StudioAssetLibraryCollections", "ko", "외부 소재 출처")} className="space-y-2"><p className="text-xs leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.StudioAssetLibraryCollections", "ko", "외부 사이트에서 소재를 찾는 바로가기입니다. 등록된 내 에셋이나 기본 제공 소재 수에 포함하지 않습니다. 외부 소재의 사용권과 재배포 조건은 각 항목에서 확인해 주세요.")}</p>{SOURCES.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-line bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><span className="block text-xs font-bold text-fg">{source.name} {translateCurrentStaticSourceText("domains.creator.StudioAssetLibraryCollections", "ko", "· 새 탭에서 열기")}</span><span className="mt-1 block text-xs text-fg-3">{source.description}</span><span className="mt-1 block text-[0.65rem] text-fg-3">{source.rights}</span></a>)}</section>}
  </div>;
}
