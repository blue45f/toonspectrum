import type { SkiaDocumentFrame } from "@toonspectrum/studio-engine-skia";

export interface StudioSkiaCameraSource {
  read(): SkiaDocumentFrame["camera"] | null;
  subscribe(changed: () => void): () => void;
}
export interface StudioSkiaCameraStage {
  x(): number; y(): number; scaleX(): number; scaleY(): number; rotation(): number;
  on(events: string, changed: () => void): unknown;
  off(events: string, changed: () => void): unknown;
}
let sequence = 0;
/** Reads the same live Stage coordinates used for hit testing, including imperative clip scrolling. */
export function createStudioSkiaCameraSource(readStage: () => StudioSkiaCameraStage | null): StudioSkiaCameraSource {
  return {
    read() {
      const stage = readStage();
      return stage ? { scaleX: stage.scaleX(), scaleY: stage.scaleY(), rotation: stage.rotation(), offsetX: stage.x(), offsetY: stage.y() } : null;
    },
    subscribe(changed) {
      const stage = readStage();
      if (!stage) return () => undefined;
      const suffix = `.skiaCamera${++sequence}`;
      const events = ["xChange", "yChange", "scaleXChange", "scaleYChange", "rotationChange"].map((name) => name + suffix).join(" ");
      stage.on(events, changed);
      return () => { stage.off(events, changed); };
    },
  };
}
