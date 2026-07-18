import type { AdvancedFillDiagnostics } from "./studio-advanced-fill";

export type StudioAdvancedFillPreview = {
  targetId: string;
  originalSrc: string;
  historyIndex: number;
  resultSrc: string;
  diagnostics: AdvancedFillDiagnostics;
  message: string;
  paintedPixelCount: number;
  regionCount: number;
};
