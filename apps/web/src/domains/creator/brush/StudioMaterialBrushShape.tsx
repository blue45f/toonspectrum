import { Shape } from "react-konva/lib/ReactKonvaCore";

import { renderStudioMaterialBrush } from "./studio-material-brush-runtime";

import type { StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";
import type { DrawEl } from "../studio-element-model";

/**
 * One renderer seam for saved V6 material programs.
 * StudioDrawNode owns document layout; this component owns contact replay only.
 */
export function StudioMaterialBrushShape({
  element,
  points,
  enginePrograms,
}: {
  readonly element: DrawEl;
  readonly points: readonly number[];
  readonly enginePrograms: StudioBrushEngineProgramSet;
}) {
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(context) => {
        renderStudioMaterialBrush(context._context, {
          ...element,
          points,
          brushEnginePrograms: enginePrograms,
        });
      }}
    />
  );
}
