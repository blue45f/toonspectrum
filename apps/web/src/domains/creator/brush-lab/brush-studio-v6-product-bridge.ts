import {
  createBrush,
  DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  type StudioSavedBrush,
} from "../brush/studio-brush-library";
import { studioBrushEngineProgramSetFromMaterial } from "../brush/studio-brush-engine-program-set";
import { loadStudioBrushLibrarySqliteRepository } from "../studio-page-editor-runtime-loaders";
import { normalizeBrushStudioV6MaterialConfig } from "./brush-studio-v6-material-engine";

import type { BrushStudioV6Program } from "./brush-studio-v6-engine";

/** A real brush-library snapshot, consumed by the same pointer-start path as every saved brush. */
export function createBrushStudioV6ProductBrush(program: BrushStudioV6Program): StudioSavedBrush {
  const material = normalizeBrushStudioV6MaterialConfig(program);
  if (!material) throw new Error("브러시 재질 설정을 읽을 수 없어요.");
  return createBrush(program.name, {
    ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
    brushId: "brush",
    sourcePresetName: program.name,
    strokeWidth: material.tuning.size,
    brushOpacity: material.tuning.opacity,
    color: material.tuning.primaryColor,
    // The material planner owns pressure calibration. Capture raw normalized pressure once.
    pressureCurve: 1,
    pressureMinSize: 0,
    useVelocityPressure: false,
    tiltEnabled: material.input.tiltEnabled,
    stabilizer: 0,
    postCorrection: 0,
    enginePrograms: studioBrushEngineProgramSetFromMaterial(material),
  });
}

export async function saveBrushStudioV6ProductBrush(program: BrushStudioV6Program): Promise<StudioSavedBrush> {
  const brush = createBrushStudioV6ProductBrush(program);
  const { openProductBrushLibraryRepository } = await loadStudioBrushLibrarySqliteRepository();
  const product = await openProductBrushLibraryRepository();
  if (product.authority !== "sqlite") {
    throw new Error("브러시를 영구 저장할 수 있는 SQLite 저장소를 열지 못했어요. 현재 설정을 JSON으로 내보내 보관하거나 저장소를 복구한 뒤 다시 저장해주세요.");
  }
  const stored = await product.repository.put(brush);
  const verified = await product.repository.getById(stored.id);
  if (!verified?.enginePrograms?.material) throw new Error("저장된 브러시를 다시 읽지 못했어요.");
  return verified;
}

export function brushStudioV6ProductBrushHref(id: string, scope: string): string {
  const params = new URLSearchParams({ materialBrush: id });
  if (scope.startsWith("work:")) return `/studio/work/${encodeURIComponent(scope.slice(5))}/canvas?${params}`;
  if (scope.startsWith("remix:")) return `/studio/remix/${encodeURIComponent(scope.slice(6))}/canvas?${params}`;
  return `/studio/canvas?${params}`;
}
