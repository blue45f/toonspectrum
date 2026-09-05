// Engine guard kept out of StudioSmartFilterUnionControls.tsx so that file only
// exports components (react-refresh/only-export-components).

import {
  STUDIO_FILTER_UNION_WAVE_KINDS,
  type StudioFilterUnionWaveKind,
} from "./studio-filter-pack-registry";

const UNION_ENGINE_SET: ReadonlySet<string> = new Set(STUDIO_FILTER_UNION_WAVE_KINDS);

export function isStudioSmartFilterUnionEngine(
  value: string,
): value is StudioFilterUnionWaveKind {
  return UNION_ENGINE_SET.has(value);
}
