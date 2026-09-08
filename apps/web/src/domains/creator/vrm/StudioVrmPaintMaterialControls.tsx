import type { StudioVrmTexturePaintRuntime, StudioVrmTexturePaintRuntimeSnapshot } from "./studio-vrm-texture-paint-runtime";

export function StudioVrmPaintMaterialControls({ runtime, snapshot, disabled }: {
  readonly runtime: StudioVrmTexturePaintRuntime | null;
  readonly snapshot: StudioVrmTexturePaintRuntimeSnapshot | null;
  readonly disabled: boolean;
}) {
  const materials = snapshot?.materials ?? [];
  const selected = materials.find((material) => material.id === snapshot?.selectedMaterialId);
  if (!runtime || materials.length === 0) return null;
  return <fieldset disabled={disabled} className="min-w-0 space-y-2 disabled:opacity-50">
    <legend className="mb-1 text-xs font-bold">편집 재질</legend>
    <select aria-label="표면 페인트 재질" value={snapshot?.selectedMaterialId ?? ""}
      className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs"
      onChange={(event) => runtime.selectMaterial(event.currentTarget.value || null)}>
      <option value="">누른 표면의 재질</option>
      {materials.map((material) => <option key={material.id} value={material.id}>{material.label}{material.visible ? "" : " (숨김)"}</option>)}
    </select>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!selected} aria-pressed={snapshot?.soloMaterialId != null}
        className="min-h-11 rounded-lg border border-line px-3 text-xs disabled:opacity-50"
        onClick={() => runtime.setMaterialSolo(snapshot?.soloMaterialId === null)}>선택 재질만 보기</button>
      <button type="button" disabled={!selected} aria-pressed={selected ? !selected.visible : false}
        className="min-h-11 rounded-lg border border-line px-3 text-xs disabled:opacity-50"
        onClick={() => { if (selected) runtime.setMaterialVisible(selected.id, !selected.visible); }}>
        {selected?.visible === false ? "선택 재질 표시" : "선택 재질 숨기기"}
      </button>
    </div>
    {selected ? <p className="text-[0.65rem] leading-relaxed text-fg-3">선택한 재질에만 그립니다. 같은 텍스처를 공유하는 재질에는 변경이 함께 반영됩니다.</p> : null}
  </fieldset>;
}
