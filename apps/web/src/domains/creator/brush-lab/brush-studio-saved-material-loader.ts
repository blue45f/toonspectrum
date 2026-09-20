import { loadStudioBrushLibrarySqliteRepository } from "../studio-page-editor-runtime-loaders";
import { createBrushStudioV6ExactEditorProgram } from "./brush-studio-v6-authoring-document";

/** Read only: opening never rewrites the saved library entry or guesses a similar recipe. */
export async function loadBrushStudioSavedMaterial(id: string) {
  if (!id.trim() || id.length > 240) throw new Error("브러시 식별자를 읽을 수 없습니다.");
  const { openProductBrushLibraryRepository } = await loadStudioBrushLibrarySqliteRepository();
  const product = await openProductBrushLibraryRepository();
  const saved = await product.repository.getById(id);
  if (!saved || saved.id !== id) throw new Error("저장된 브러시 원본을 찾지 못했습니다. 기본 브러시로 바꾸지 않았습니다.");
  if (!saved.enginePrograms?.material) {
    throw new Error("이 브러시의 원본 엔진 편집은 아직 지원하지 않습니다. 원본은 그대로 사용할 수 있습니다.");
  }
  return {
    program: createBrushStudioV6ExactEditorProgram(saved.enginePrograms.material, saved.id, saved.name, saved),
    persistent: product.authority === "sqlite",
  };
}
