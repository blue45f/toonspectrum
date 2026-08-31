import { useEffect, useRef } from "react";

import type { StudioInspectorAsideModel } from "./useStudioInspectorAsideModel";

export function StudioInspectorEmptyCoachSection({
  model,
}: {
  model: StudioInspectorAsideModel;
}) {
  const {
    activateCanvasTool,
    announceDrawingShortcut,
    changeInspectorLayout,
    disarmAllPixelTools,
    inspectorContentMode,
    inspectorLayout,
    openFeatureTutorial,
    setUnselectedImageToolsVisible,
    setEyedropperActive,
    setTool,
    unselectedImageToolsVisible,
  } = model;
  const imageEditButtonRef = useRef<HTMLButtonElement>(null);
  const previousImageToolsVisibleRef = useRef(unselectedImageToolsVisible);

  useEffect(() => {
    const wasVisible = previousImageToolsVisibleRef.current;
    previousImageToolsVisibleRef.current = unselectedImageToolsVisible;
    if (
      wasVisible &&
      !unselectedImageToolsVisible &&
      inspectorContentMode === "empty"
    ) {
      imageEditButtonRef.current?.focus({ preventScroll: true });
    }
  }, [inspectorContentMode, unselectedImageToolsVisible]);

  return (
    <>
          {inspectorContentMode === "empty" && !unselectedImageToolsVisible && (
            <div
              data-testid="studio-inspector-empty-coach"
              className="rounded-xl border border-line bg-panel/40 p-3"
            >
              <p className="text-xs font-bold tracking-tight text-fg">캔버스에서 바로 시작</p>
              <p className="mt-1 text-[0.7rem] leading-snug text-fg-3">
                빈 화면에 그려도 됩니다. 선택 후 모서리 핸들로 크기를 조절하고, 자르기는 레이어에서 바로 열 수 있어요.
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  aria-label="펜으로 그리기"
                  className="min-h-11 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg transition-colors hover:border-accent/70"
                  onClick={() => {
                    activateCanvasTool("draw", "pen");
                    setEyedropperActive(false);
                    announceDrawingShortcut("펜 · 캔버스에 바로 그려 보세요");
                  }}
                >
                  펜으로 그리기
                  <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">단축키 B</span>
                </button>
                <button
                  type="button"
                  aria-label="선택 도구"
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-fg"
                  onClick={() => {
                    disarmAllPixelTools();
                    setTool("select");
                    setEyedropperActive(false);
                    announceDrawingShortcut("선택 · 클릭하거나 드래그해 고르세요");
                  }}
                >
                  선택 도구
                  <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">단축키 V</span>
                </button>
                <button
                  type="button"
                  aria-label="레이어 패널 열기"
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-fg"
                  onClick={() => {
                    changeInspectorLayout({ ...inspectorLayout, primary: "layers" });
                  }}
                >
                  레이어 패널
                  <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">순서·표시</span>
                </button>
                <button
                  ref={imageEditButtonRef}
                  type="button"
                  aria-label="이미지 편집 · 전문 도구 열기"
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-fg"
                  onClick={() => {
                    setUnselectedImageToolsVisible(true);
                    changeInspectorLayout({
                      ...inspectorLayout,
                      primary: "properties",
                      image: "quick",
                    });
                  }}
                >
                  이미지 편집
                  <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">선택·합성본 준비</span>
                </button>
              </div>
              <button
                type="button"
                aria-label="스튜디오 사용법 따라 하기"
                className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-canvas/45 px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-fg"
                onClick={() => openFeatureTutorial(null)}
              >
                처음이라면 사용법 따라 하기
                <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">
                  핵심 도구를 화면에서 차례로 안내해요
                </span>
              </button>
            </div>
          )}
    </>
  );
}
