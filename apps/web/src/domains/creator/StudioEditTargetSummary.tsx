import { EyeOff, Lock, Layers, Paintbrush } from "lucide-react";
import { elementLabel } from "./studio-element-label";
import { isEffectivelyHidden, isEffectivelyLocked } from "./studio-layers";
import type { StudioInspectorAsideModel } from "./useStudioInspectorAsideModel";

export function StudioEditTargetSummary({ model }: { model: StudioInspectorAsideModel }) {
  const selected = model.selected;
  const hidden = selected ? model.localHiddenElementIds.has(selected.id) || isEffectivelyHidden(selected, model.groups) : false;
  const locked = selected ? isEffectivelyLocked(selected, model.groups) : false;
  const type = !selected ? "선택 없음" : selected.type === "image" ? "이미지" : selected.type === "draw" ? "벡터" : selected.type === "text" ? "텍스트" : selected.type === "bubble" ? "말풍선" : selected.type;
  const mask = model.layerMaskPaintActive;
  return <section aria-label="현재 편집 문맥" data-studio-edit-target="true" className="shrink-0 rounded-lg border border-line bg-panel px-3 py-2">
    <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
      {locked ? <Lock size={16} aria-hidden /> : hidden ? <EyeOff size={16} aria-hidden /> : <Paintbrush size={16} aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{mask ? "마스크 편집 중" : selected ? `선택: ${elementLabel(selected)}` : model.inspectorDrawing ? "새 획 그리기" : "편집할 대상을 선택하세요"}</span>
      <span className="text-xs font-normal text-fg-2">{type}</span>
    </div>
    {locked || hidden ? <p role="status" className="mt-1 text-xs leading-relaxed text-warn">{locked ? "선택한 레이어 또는 상위 그룹이 잠겨 있습니다." : "선택한 레이어가 숨겨져 있습니다."} 레이어에서 상태를 확인하세요.</p> : null}
    <button type="button" className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-xs text-fg-2 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11"
      onClick={() => model.changeInspectorLayout({ ...model.inspectorLayout, primary: "layers" })}><Layers size={14} aria-hidden />레이어 확인</button>
  </section>;
}
