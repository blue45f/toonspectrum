import { useId } from "react";
import { normalizeBrushStudioV6Program, replaceBrushStudioV6Slot } from "../brush-lab/brush-studio-v6-engine";
import { normalizeBrushStudioV6MaterialConfig, type BrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import { BRUSH_STUDIO_V6_TOPOLOGIES, brushStudioV6Topology } from "../brush-lab/brush-studio-v6-topology-catalog";

const SELECT = "mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const DEPOSITION = [["deposit-ink", "잉크"], ["deposit-marker", "마커"], ["deposit-dry", "건식 안료"], ["deposit-wet", "번짐 도포"], ["deposit-oil", "두꺼운 물감"]] as const;
const SURFACES = [["surface-smooth", "매끈한 표면"], ["surface-kent", "켄트지"], ["surface-coldpress", "수채지"], ["surface-printmaking", "판화지"], ["surface-linen", "린넨"], ["surface-porous", "섬유지"]] as const;

/** The same canonical graph controls are available without leaving the drawing canvas. */
export function StudioBrushTopologyControls({ material, onChange }: {
  readonly material: BrushStudioV6MaterialConfig;
  readonly onChange: (material: BrushStudioV6MaterialConfig) => void;
}) {
  const id = useId();
  const topology = brushStudioV6Topology(material.slots.carrier);
  function updateSlot(slot: "carrier" | "deposition" | "surface", value: string) {
    const program = normalizeBrushStudioV6Program({ ...material, schemaVersion: 6 });
    const next = normalizeBrushStudioV6MaterialConfig(replaceBrushStudioV6Slot(program, slot, value));
    if (next) onChange(next);
  }
  return <section aria-label="획 구조와 재료 결합" className="space-y-3 rounded-xl border border-accent/25 bg-accent-soft/20 p-3">
    <label htmlFor={`${id}-carrier`} className="block text-xs font-bold text-fg">획 구조 엔진
      <select id={`${id}-carrier`} className={SELECT} value={topology?.id ?? ""}
        onChange={(event) => updateSlot("carrier", event.currentTarget.value || "carrier-webgpu-centerline")}>
        <option value="">기존 재료 접촉</option>
        {BRUSH_STUDIO_V6_TOPOLOGIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select>
    </label>
    <p className="text-xs leading-5 text-fg-3">{topology?.description ?? "서로 다른 획 구조와 현재 재료를 결합하세요."} 구조 전환 시 미지원 물리·패턴은 해제됩니다.</p>
    {topology ? <>
      {(["deposition", "surface"] as const).map((slot) => <label key={slot} htmlFor={`${id}-${slot}`} className="block text-xs font-bold text-fg">
        {slot === "deposition" ? "도포 재료" : "종이 표면"}
        <select id={`${id}-${slot}`} className={SELECT} value={material.slots[slot]} onChange={(event) => updateSlot(slot, event.currentTarget.value)}>
          {(slot === "deposition" ? DEPOSITION : SURFACES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>)}
      <label className="flex min-h-11 items-center gap-2 text-xs font-bold text-fg">
        <input type="checkbox" checked={material.slots.finish.includes("finish-neon")} onChange={(event) => {
          const next = normalizeBrushStudioV6MaterialConfig({ ...material, slots: { ...material.slots, finish: event.currentTarget.checked ? ["finish-neon"] : [] } });
          if (next) onChange(next);
        }} /> 발광 마감 결합
      </label>
      <p className="text-[0.65rem] leading-4 text-fg-3">서버·외부 엔진 없이 CPU에서 실행됩니다. 번짐은 도포 근사이며 유체 격자나 아래색 픽업은 아닙니다.</p>
    </> : null}
  </section>;
}
