import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Layer, Stage } from "react-konva";

import { resolveStudioBrushRuntimeProgramSet } from "../../src/domains/creator/brush/studio-brush-composition-runtime";
import { normalizeStudioBrushEngineProgramSet } from "../../src/domains/creator/brush/studio-brush-engine-program-set";
import { DEFAULT_STUDIO_BRUSH_SNAPSHOT } from "../../src/domains/creator/brush/studio-brush-library";
import { studioBrushCatalogSelectionSnapshot, studioBrushSlotSelectionSnapshot } from "../../src/domains/creator/brush/studio-brush-selection-snapshot";
import { StudioBrushLibrarySheet } from "../../src/domains/creator/brush/StudioBrushLibrarySheet";
import { StudioDrawNode } from "../../src/domains/creator/brush/StudioDrawNode";

import type { StudioBrushSnapshot } from "../../src/domains/creator/brush/studio-brush-library";
import type { StudioBrushCatalogSelection } from "../../src/domains/creator/brush/studio-brush-selection";
import type { DrawEl } from "../../src/domains/creator/studio-element-model";
import type { Stage as KonvaStage } from "konva/lib/Stage";

const previousPrograms = normalizeStudioBrushEngineProgramSet({ version: 1,
  oil: { bristlePhysics: false, bristleLoadDynamics: false, impastoRelief: false },
  watercolor: { wetEdgeBloomProgramId: "fiber-feather" },
  composition: { physics: "no-physics", pickup: "no-pickup", deposition: "loaded-paint" },
})!;
const initial: StudioBrushSnapshot = { ...DEFAULT_STUDIO_BRUSH_SNAPSHOT, color: "#365baf" };
const points = Array.from({ length: 48 }, (_, i) => [25 + i * 7, 100 + 36 * Math.sin(i / 7)]).flat();
const pressures = Array.from({ length: 48 }, (_, i) => 0.15 + 0.75 * Math.sin(Math.PI * i / 47));
const twoFrames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function App() {
  const [snapshot, setSnapshot] = useState(initial);
  const current = useRef(snapshot); current.current = snapshot;
  const stage = useRef<KonvaStage | null>(null);
  function apply(selection: StudioBrushCatalogSelection) {
    setSnapshot((before) => studioBrushCatalogSelectionSnapshot(before, selection, {
      brushId: selection.runtimeBrushId, strokeWidth: selection.defaultWidth,
      brushOpacity: selection.defaultOpacity, color: before.color,
    }));
  }
  const el: DrawEl = { id: "selection-isolation", type: "draw", kind: "freehand", mode: "pen",
    points, pressures, brush: snapshot.brushId, stroke: snapshot.color,
    strokeWidth: snapshot.strokeWidth, opacity: snapshot.brushOpacity,
    brushDynamics: snapshot.brushDynamics ?? undefined,
    brushEnginePrograms: snapshot.enginePrograms ?? undefined,
  };
  window.__brushIsolation = {
    seed(dirty) { flushSync(() => setSnapshot({ ...initial, enginePrograms: dirty ? previousPrograms : null })); },
    restoreSlot(explicit) { flushSync(() => setSnapshot((before) => studioBrushSlotSelectionSnapshot(before, {
      brushId: "oil", strokeWidth: 24, brushOpacity: 0.7,
      ...(explicit ? { enginePrograms: previousPrograms } : {}),
    }))); },
    async capture() {
      await twoFrames();
      stage.current!.draw();
      const canvas = stage.current!.toCanvas({ pixelRatio: 1 });
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      const digest = await crypto.subtle.digest("SHA-256", pixels);
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      let inkPixels = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) inkPixels++;
      return { hash, inkPixels, snapshot: current.current,
        runtime: resolveStudioBrushRuntimeProgramSet(current.current.brushId, current.current.enginePrograms) };
    },
  };
  return <main>
    <h1>Brush selection execution isolation</h1>
    <output data-selected={snapshot.brushId}>{snapshot.brushId}</output>
    <Stage ref={stage} width={420} height={210}><Layer><StudioDrawNode el={el} /></Layer></Stage>
    <StudioBrushLibrarySheet open embedded closeOnSelection={false} dismissOnOutsidePointer={false}
      activeBrushId={snapshot.sourcePresetId ?? snapshot.brushId} onSelect={apply} onClose={() => undefined} />
  </main>;
}

declare global {
  interface Window {
    __brushIsolation: {
      seed(dirty: boolean): void;
      restoreSlot(explicit: boolean): void;
      capture(): Promise<{ hash: string; inkPixels: number; snapshot: StudioBrushSnapshot;
        runtime: ReturnType<typeof resolveStudioBrushRuntimeProgramSet> }>;
    };
  }
}
const host = document.createElement("div"); document.body.append(host);
createRoot(host).render(<App />);
