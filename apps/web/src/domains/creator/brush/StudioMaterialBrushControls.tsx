import { useId, useState, type MouseEvent } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { normalizeBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import {
  brushStudioV6MaterialActiveTuningKeys,
  normalizeBrushStudioV6MaterialConfig,
  type BrushStudioV6MaterialConfig,
} from "../brush-lab/brush-studio-v6-material-engine";
import type { StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";

const FIELDS = [
  { key: "flow", label: "도포 유량", min: 0.01, max: 1, step: 0.01 },
  { key: "spacing", label: "접촉 간격", min: 0.01, max: 4, step: 0.01 },
  { key: "surfaceTooth", label: "종이 요철", min: 0, max: 1, step: 0.01 },
  { key: "granulation", label: "안료 과립", min: 0, max: 1, step: 0.01 },
  { key: "reservoir", label: "안료 저장량", min: 0, max: 1, step: 0.01 },
  { key: "pickup", label: "안료 보충·혼합", min: 0, max: 1, step: 0.01 },
  { key: "viscosity", label: "점도", min: 0, max: 1, step: 0.01 },
  { key: "wetness", label: "수분", min: 0, max: 1, step: 0.01 },
  { key: "diffusion", label: "번짐", min: 0, max: 1, step: 0.01 },
  { key: "relief", label: "물감 능선", min: 0, max: 1, step: 0.01 },
  { key: "bristleStrands", label: "붓털 수", min: 8, max: 128, step: 8 },
  { key: "particleCount", label: "입자 수", min: 16, max: 3240, step: 16 },
  { key: "reactionRate", label: "가지 성장", min: 0, max: 1, step: 0.01 },
  { key: "patternDensity", label: "문양 밀도", min: 0, max: 1, step: 0.01 },
  { key: "patternScale", label: "문양 크기", min: 0.1, max: 4, step: 0.01 },
  { key: "patternJitter", label: "흩어짐", min: 0, max: 1, step: 0.01 },
] as const;

function materialLabel(material: BrushStudioV6MaterialConfig): string {
  if (material.slots.pattern !== "pattern-none") return "문양·입자 브러시";
  if (material.slots.physics.includes("physics-bristle")) return "강모·안료 소모 브러시";
  if (material.slots.deposition === "deposit-particles") return "입자·성장 브러시";
  if (material.slots.deposition === "deposit-dry") return "종이 접촉·건식 브러시";
  if (material.slots.physics.includes("physics-height")) return "물감 능선·나이프 브러시";
  if (material.slots.deposition === "deposit-wet") return "번짐·과립 브러시";
  return "커스텀 재료 브러시";
}

/** Material strokes bypass legacy oil switches; expose only fields the contact solver consumes. */
export function StudioMaterialBrushControls({ material, programSet, onChange }: {
  readonly material: BrushStudioV6MaterialConfig;
  readonly programSet: StudioBrushEngineProgramSet;
  readonly onChange: (next: StudioBrushEngineProgramSet | null) => void;
}) {
  const instanceId = useId();
  const [notice, setNotice] = useState("");
  const active = brushStudioV6MaterialActiveTuningKeys(material);
  const fields = FIELDS.filter((field) => active.has(field.key));
  const label = materialLabel(material);
  const editorId = `material-${material.seed}`;
  const editorHref = `/studio/assets/brushes/${editorId}/edit`;

  const prepareEditor = (event: MouseEvent<HTMLAnchorElement>) => {
    try {
      const program = normalizeBrushStudioV6Program({ ...material, schemaVersion: 6, id: editorId, name: label });
      window.localStorage.setItem(`toonspectrum.brush-program-v6:${encodeURIComponent(`brush:${editorId}`)}`, JSON.stringify(program));
    } catch {
      event.preventDefault();
      setNotice("브러시 편집기로 설정을 전달하지 못했습니다. 현재 원고 설정은 유지됩니다.");
    }
  };

  return <section className="space-y-3 rounded-2xl border border-line bg-card/35 p-3" aria-label="커스텀 재료 브러시 설정">
    <div className="rounded-xl border border-line bg-bg-2/60 p-3">
      <h3 className="text-sm font-bold text-fg">{label}</h3>
      <p className="mt-1 text-xs leading-5 text-fg-3">다음 획부터 반영됩니다. 크기·기본 색·불투명도는 브러시의 기본 도구 설정에서 조절하세요.</p>
    </div>
    <div className="space-y-2">
      {fields.map((field) => <div key={field.key} className="block rounded-xl border border-line bg-card/55 px-3 py-2">
        <div className="flex justify-between gap-3 text-xs font-semibold text-fg-2"><label htmlFor={`${instanceId}-${field.key}`}>{field.label}</label><span className="tabular-nums">{material.tuning[field.key]}</span></div>
        <input id={`${instanceId}-${field.key}`} type="range" min={field.min} max={field.max} step={field.step} value={material.tuning[field.key]}
          onChange={(event) => {
            const next = normalizeBrushStudioV6MaterialConfig({ ...material, tuning: { ...material.tuning, [field.key]: event.currentTarget.valueAsNumber } });
            if (next) onChange({ ...programSet, material: next });
          }} className="mt-1 min-h-8 w-full accent-accent" />
      </div>)}
    </div>
    <label htmlFor={`${instanceId}-secondary`} className="flex min-h-11 items-center justify-between gap-3 text-xs font-semibold text-fg-2">혼합·문양 색
      <input id={`${instanceId}-secondary`} type="color" value={material.tuning.secondaryColor} disabled={!active.has("secondaryColor")}
        aria-describedby={!active.has("secondaryColor") ? `${instanceId}-secondary-inactive` : undefined} className="h-9 w-16 rounded-lg disabled:opacity-55"
        onChange={(event) => {
          const next = normalizeBrushStudioV6MaterialConfig({ ...material, tuning: { ...material.tuning, secondaryColor: event.currentTarget.value } });
          if (next) onChange({ ...programSet, material: next });
        }} />
    </label>
    {!active.has("secondaryColor") ? <p id={`${instanceId}-secondary-inactive`} className="text-[0.65rem] leading-4 text-fg-3">현재 재료 조합에서 사용하지 않음</p> : null}
    <div className="flex flex-wrap gap-2">
      <a href={editorHref} onClick={prepareEditor} className={`inline-flex min-h-11 items-center rounded-xl border border-line px-3 py-2 text-xs font-semibold text-fg transition-colors hover:bg-raised ${STUDIO_FOCUS_RING}`}>브러시 편집기에서 비교·실험</a>
      <button type="button" onClick={() => onChange(null)} className={`min-h-11 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-fg-3 transition-colors hover:bg-raised ${STUDIO_FOCUS_RING}`}>기본 브러시로 전환</button>
    </div>
    {notice ? <p role="status" className="text-xs leading-5 text-fg-3">{notice}</p> : null}
  </section>;
}
