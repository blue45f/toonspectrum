import { memo, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { Layer } from "react-konva/lib/ReactKonvaCore";

import { resolveStudioDraftPreviewActiveLane } from "./studio-draw-rendering";
import { StudioDrawNode } from "./StudioDrawNode";

import type { StudioDraftPreviewSource } from "./studio-draft-preview-store";
import type Konva from "konva";

export interface StudioDraftPreviewLayersProps {
  store: StudioDraftPreviewSource;
  normalLayerRef?: RefObject<Konva.Layer | null>;
  dynamicLayerRef?: RefObject<Konva.Layer | null>;
}

/** 비다이렉트 초안 전용 격리 레이어 — 스토어 구독으로 페이지 본문 렌더 없이 프레임을 그린다. */
export const StudioDraftPreviewLayers = memo(function StudioDraftPreviewLayers({
  store,
  normalLayerRef,
  dynamicLayerRef,
}: StudioDraftPreviewLayersProps) {
  const { active } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const settled = store.visibleSettled;
  const fixedFxLayerRef = useRef<Konva.Layer>(null);
  const activeLane = resolveStudioDraftPreviewActiveLane(active);
  const isolatedDynamic = activeLane === "dynamic" ? active : null;
  const isolatedFixedFx = activeLane === "fixed-fx" ? active : null;
  // Non-direct specialty brushes retain their exact accepted coordinates while the pointer is
  // down. The former growing-prefix smoother recalculated already-visible points every frame.
  // Default opaque pens now use the fixed-lag two-surface causal path; specialty brushes prefer a
  // single release-time correction over visibly crawling historical geometry.
  const normalActive = activeLane === "normal" ? active : null;

  // scheduleDraft disables react-konva's deferred auto draw while publishing one pointer frame.
  // Paint only this tiny source-over surface during the same React commit; the settled FIFO below
  // remains untouched even when a luminous compound path receives thousands of active samples.
  useLayoutEffect(() => {
    if (isolatedFixedFx) fixedFxLayerRef.current?.drawScene();
  }, [isolatedFixedFx]);

  return (
    <>
      {settled.length > 0 || normalActive ? (
        <Layer
          key="normal"
          ref={normalLayerRef}
          name="studio-draft-preview-normal"
          listening={false}
        >
          {settled.map((el) => (
            <StudioDrawNode key={el.id} el={el} />
          ))}
          {normalActive ? <StudioDrawNode el={normalActive} activeDraft /> : null}
        </Layer>
      ) : null}
      {/* Source-over luminous effects do not need the settled pixels as an in-layer backdrop. */}
      {isolatedFixedFx ? (
        <Layer
          key="fixed-fx"
          ref={fixedFxLayerRef}
          name="studio-draft-preview-fixed-fx"
          listening={false}
        >
          <StudioDrawNode el={isolatedFixedFx} activeDraft />
        </Layer>
      ) : null}
      {/* 라이브 입자 획은 독립 레이어에서만 다시 그린다 — committed 입자 획이 포인터 RAF마다
          수천 개의 dab 을 재실행하지 않는다. */}
      {isolatedDynamic ? (
        <Layer
          key="dynamic"
          ref={dynamicLayerRef}
          name="studio-draft-preview-dynamic"
          listening={false}
        >
          <StudioDrawNode el={isolatedDynamic} activeDraft />
        </Layer>
      ) : null}
    </>
  );
});
