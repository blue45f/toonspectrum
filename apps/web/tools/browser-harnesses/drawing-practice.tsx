import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { Layer, Line, Rect, Stage } from "react-konva/lib/ReactKonvaCore";

import { StudioDrawingPracticeGuide } from "../../src/domains/creator/canvas/StudioDrawingPracticeGuide";
import {
  completeStudioDrawingPracticeDocument,
  createStudioDrawingPracticeDocument,
  patchStudioDrawingPracticeDocument,
  resetStudioDrawingPracticePlacement,
  retryStudioDrawingPracticeDocument,
  type StudioDrawingPracticeDocument,
  type StudioDrawingPracticeView,
} from "../../src/domains/creator/studio-drawing-practice-document";
import { shouldRenderStudioDrawingPracticeGuide } from "../../src/domains/creator/studio-drawing-practice-runtime";
import { StudioDrawingPracticeBar } from "../../src/domains/creator/StudioDrawingPracticeBar";
import "../../src/app/styles/globals.css";

const SHA = `sha256:${"a".repeat(64)}` as const;
const SOURCE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
    <rect width="640" height="480" fill="#fff"/>
    <circle cx="320" cy="108" r="60" fill="none" stroke="#5b21b6" stroke-width="12"/>
    <path d="M320 168 L320 310 M320 210 L220 280 M320 210 L430 260 M320 310 L250 430 M320 310 L410 430" fill="none" stroke="#5b21b6" stroke-linecap="round" stroke-width="15"/>
  </svg>
`)}`;
function initialDocument(width: number, height: number): StudioDrawingPracticeDocument {
  return createStudioDrawingPracticeDocument({
    attemptId: "attempt-1",
    targetGroupId: "practice-group-1",
    source: {
      sha256: SHA,
      assetId: "practice-source",
      name: "pose-guide.svg",
      mimeType: "image/svg+xml",
      width: 640,
      height: 480,
    },
    viewport: { canvasWidth: width, canvasHeight: height },
  });
}

function Harness() {
  const [dimensions] = useState(() => ({
    width: Math.max(320, Math.min(800, innerWidth - 24)),
    height: Math.max(420, Math.min(600, innerHeight - 48)),
  }));
  const viewport = { canvasWidth: dimensions.width, canvasHeight: dimensions.height };
  const [practice, setPractice] = useState<StudioDrawingPracticeDocument>(() =>
    initialDocument(dimensions.width, dimensions.height));
  const [compareActive, setCompareActive] = useState(false);
  const [sourceState, setSourceState] = useState<"ready" | "missing">("ready");
  const [lastAction, setLastAction] = useState("ready");
  const sourceDataUrl = sourceState === "ready" ? SOURCE : null;
  const guideVisible = shouldRenderStudioDrawingPracticeGuide({
    document: practice,
    sourceDataUrl,
    compareActive,
    exporting: false,
    saving: false,
    timelapseCapturing: false,
  });
  const commitView = (patch: Partial<StudioDrawingPracticeView>) => {
    setPractice((current) => patchStudioDrawingPracticeDocument(
      current,
      { view: patch },
      viewport,
    ));
    setLastAction(`view:${Object.keys(patch).join(",")}`);
  };
  const finish = () => {
    setPractice((current) => {
      const completed = completeStudioDrawingPracticeDocument(current);
      return { ...completed, view: { ...completed.view, visible: false, locked: true } };
    });
    setLastAction("finish");
  };
  const retry = () => {
    setPractice((current) => retryStudioDrawingPracticeDocument(
      current,
      `attempt-${current.attemptIndex + 1}`,
      `practice-group-${current.attemptIndex + 1}`,
    ));
    setLastAction("retry");
  };
  const resetPlacement = () => {
    setPractice((current) => resetStudioDrawingPracticePlacement(current, viewport));
    setLastAction("reset");
  };
  const guide = guideVisible && sourceDataUrl ? (
    <StudioDrawingPracticeGuide
      document={practice}
      sourceDataUrl={sourceDataUrl}
      effectiveScale={1}
      interactionBlocked={false}
      onCommitView={commitView}
    />
  ) : null;
  const shellStyle = {
    "--studio-canvas-bottom-inset": "112px",
  } as CSSProperties;

  return (
    <main
      data-testid="practice-fixture"
      data-guide-visible={String(guideVisible)}
      data-mode={practice.view.mode}
      data-visible={String(practice.view.visible)}
      data-locked={String(practice.view.locked)}
      data-status={practice.status}
      data-attempt={String(practice.attemptIndex)}
      data-target-group={practice.targetGroupId ?? ""}
      className="min-h-[100dvh] bg-canvas p-3 text-fg"
    >
      <header className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3 text-xs">
        <strong>따라 그리기 통합 검증</strong>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line bg-card px-3"
          onClick={() => {
            setSourceState((state) => state === "ready" ? "missing" : "ready");
            setLastAction("source-toggle");
          }}
        >
          원본 누락 전환
        </button>
        <output data-testid="mode">{practice.view.mode}</output>
        <output data-testid="opacity">{Math.round(practice.view.opacity * 100)}%</output>
        <output data-testid="attempt">{practice.attemptIndex}</output>
        <output data-testid="target-group">{practice.targetGroupId}</output>
        <output data-testid="action">{lastAction}</output>
      </header>
      {practice.view.mode === "reference-window" && sourceDataUrl ? (
        <aside
          aria-label="옆 참고 이미지"
          className="mb-3 ml-auto w-40 rounded-xl border border-line bg-panel p-2"
        >
          <img src={sourceDataUrl} alt="옆에 표시한 따라 그리기 원본" />
        </aside>
      ) : null}
      <section
        data-testid="canvas-shell"
        style={shellStyle}
        className="relative mx-auto overflow-hidden rounded-2xl border border-line bg-panel"
      >
        <Stage width={dimensions.width} height={dimensions.height}>
          <Layer listening={false}>
            <Rect width={dimensions.width} height={dimensions.height} fill="#ffffff" />
          </Layer>
          {practice.view.placement === "below-artwork" ? <Layer>{guide}</Layer> : null}
          <Layer listening={false}>
            <Line
              points={[48, dimensions.height - 100, dimensions.width / 2, 80, dimensions.width - 48, dimensions.height - 100]}
              stroke="#111827"
              strokeWidth={7}
              lineCap="round"
              lineJoin="round"
            />
          </Layer>
          {practice.view.placement === "above-artwork" ? <Layer>{guide}</Layer> : null}
        </Stage>
        <StudioDrawingPracticeBar
          document={practice}
          sourceState={sourceState}
          compareActive={compareActive}
          onPreviewView={commitView}
          onCommitView={commitView}
          onCancelPreview={() => setLastAction("cancel-preview")}
          onCompareChange={(active) => {
            setCompareActive(active);
            setLastAction(`compare:${String(active)}`);
          }}
          onOpenReferencePanel={() => {
            setSourceState("ready");
            setLastAction("relink");
          }}
          onFinish={finish}
          onRetry={retry}
          onResetPlacement={resetPlacement}
          onRemove={() => {
            setPractice((current) => patchStudioDrawingPracticeDocument(
              current,
              { view: { visible: false } },
              viewport,
            ));
            setLastAction("remove");
          }}
        />
        <div
          data-testid="mobile-dock"
          className="absolute inset-x-0 bottom-0 flex h-28 items-center justify-center border-t border-line bg-panel/95 text-xs lg:hidden"
        >
          모바일 편집 도크
        </div>
      </section>
    </main>
  );
}

const root = document.getElementById("test-root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Harness />);
