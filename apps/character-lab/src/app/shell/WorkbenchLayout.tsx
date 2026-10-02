/**
 * 워크벤치 3열 레이아웃: 좌측(슬롯 레일 15칸 + SlotPanel) · 중앙(뷰포트) · 우측(InspectorTabs).
 * 뷰포트 호스트 요소를 viewport-registry에 붙여 TopBar가 캔버스를 찾을 수 있게 한다.
 * ViewportPane(render)이 없으면 기본 캔버스를 두되 그 사실을 화면에 적는다.
 */
import { useEffect, useRef } from "react";

import { InspectorTabs } from "./InspectorTabs";
import { useEngineSession, useViewportRegistry } from "./lab-store-context";
import { SlotRail } from "./SlotRail";

import type { LabPanels } from "./lab-runtime";

/** 기본 캔버스의 장치 픽셀비 상한(과도한 해상도로 fill-rate를 잡아먹지 않게) */
export const FALLBACK_MAX_PIXEL_RATIO = 2;

export function ViewportFallback() {
  const viewport = useViewportRegistry();
  const engineSession = useEngineSession();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 캔버스를 등록하고, 표시 크기가 바뀌면 렌더 버퍼 크기(CSS 크기 × 픽셀비)를 맞춘 뒤 엔진에 알린다.
  // ViewportPane(render)이 조립되면 이 폴백은 쓰이지 않는다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const unregister = viewport.register(canvas);
    const fit = (): void => {
      const ratio = Math.min(FALLBACK_MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (width < 1 || height < 1 || (canvas.width === width && canvas.height === height)) return;
      canvas.width = width;
      canvas.height = height;
      engineSession.engine()?.resize(width, height);
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(canvas);
    return () => {
      observer?.disconnect();
      unregister();
    };
  }, [viewport, engineSession]);

  return (
    <div className="cl-viewport-fallback">
      <canvas className="cl-viewport-canvas" aria-label="캐릭터 뷰포트(기본 캔버스)" ref={canvasRef} />
      <p className="cl-notice">
        ViewportPane(render 작업자)이 아직 조립되지 않아 기본 캔버스만 있습니다. 엔진 선택은 동작하지만 HUD·관절 핸들·드로잉 오버레이는 없습니다.
      </p>
    </div>
  );
}

export interface WorkbenchLayoutProps {
  readonly panels: LabPanels;
}

export function WorkbenchLayout({ panels }: WorkbenchLayoutProps) {
  const viewport = useViewportRegistry();
  const { SlotPanel, ViewportPane } = panels;
  return (
    <div className="cl-workbench">
      <aside className="cl-workbench-left" aria-label="슬롯">
        <SlotRail />
        {SlotPanel ? (
          <SlotPanel />
        ) : (
          <p className="cl-notice" data-missing-panel="SlotPanel">
            SlotPanel(state-presets 작업자)이 아직 조립되지 않았습니다 — 프리셋 카드 그리드 없음.
          </p>
        )}
      </aside>
      <main className="cl-workbench-main" aria-label="뷰포트" ref={(node) => (node ? viewport.attachHost(node) : undefined)}>
        {ViewportPane ? <ViewportPane /> : <ViewportFallback />}
      </main>
      <aside className="cl-workbench-right" aria-label="인스펙터">
        <InspectorTabs panels={panels} />
      </aside>
    </div>
  );
}
