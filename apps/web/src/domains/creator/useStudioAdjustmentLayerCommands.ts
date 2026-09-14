import { createStudioLiveAdjustment } from "./studio-live-adjustment";
import type { El } from "./studio-element-model";

export function useStudioAdjustmentLayerCommands(options: {
  getElements: () => readonly El[]; prepare: () => boolean; width: number; height: number;
  canMutate: () => boolean; isDrawing: () => boolean;
  commit: (elements: El[]) => boolean; select: (id: string) => void;
  closeMenu: () => void; setError: (message: string | null) => void;
}) {
  return function createAdjustmentLayer() {
    if (!options.canMutate()) { options.setError("일반 페이지에서 잠금을 해제한 뒤 보정 레이어를 만들어 주세요."); return false; }
    if (options.isDrawing()) { options.setError("진행 중인 편집을 끝낸 뒤 보정 레이어를 만들어 주세요."); return false; }
    if (!options.prepare()) return false;
    const layer = createStudioLiveAdjustment(crypto.randomUUID(), options.width, options.height);
    if (!options.commit([...options.getElements(), layer])) return false;
    options.select(layer.id); options.closeMenu(); options.setError(null);
    return true;
  };
}
