import { useEffect, useEffectEvent, useRef } from "react";

import { loadStudioBrushLibrarySqliteRepository } from "../studio-page-editor-runtime-loaders";

import type { StudioSavedBrush } from "./studio-brush-library";

/** Apply only after the library has read the committed recipe back successfully. */
export function useStudioMaterialBrushRequest(
  search: string,
  onApply: (brush: StudioSavedBrush) => void,
  onError: (message: string) => void,
): void {
  const id = new URLSearchParams(search).get("materialBrush");
  const applied = useRef<string | null>(null);
  const apply = useEffectEvent(onApply);
  const report = useEffectEvent(onError);
  useEffect(() => {
    if (!id || id.length > 128 || applied.current === id) return;
    let active = true;
    void loadStudioBrushLibrarySqliteRepository()
      .then(({ openProductBrushLibraryRepository }) => openProductBrushLibraryRepository())
      .then((product) => product.repository.getById(id))
      .then((brush) => {
        if (!active) return;
        if (!brush?.enginePrograms?.material) {
          report("저장된 커스텀 재질 브러시를 찾지 못했어요. Brush Editor에서 다시 저장해주세요.");
          return;
        }
        applied.current = id;
        apply(brush);
      })
      .catch(() => {
        if (active) report("커스텀 브러시를 열지 못했어요. 브러시 라이브러리 저장소를 확인해주세요.");
      });
    return () => { active = false; };
  }, [id]);
}
