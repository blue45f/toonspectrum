import { useEffect, useRef, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { BRUSH_STUDIO_V6_NODES, type BrushStudioV6Program } from "./brush-studio-v6-engine";
import {
  brushStudioV6ExperimentFields,
  compareBrushStudioV6Programs,
  createBrushStudioV6ExperimentSamples,
  type BrushStudioV6NumericTuning,
} from "./brush-studio-v6-experiments";
import { renderBrushStudioV6Preview } from "./brush-studio-v6-preview";

const BUTTON = `min-h-11 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 ${STUDIO_FOCUS_RING}`;
const LABELS: Readonly<Record<string, string>> = {
  name: "이름", description: "설명", id: "시작 레시피", seed: "개성 시드", qualityGoal: "품질 목표", deviceProfile: "대상 장치",
  "slots.motion": "필기감", "slots.carrier": "획 구조", "slots.tip": "촉", "slots.surface": "종이·표면",
  "slots.deposition": "도포", "slots.pickup": "아래색 픽업", "slots.pigment": "색 혼합", "slots.physics": "물리",
  "slots.pattern": "패턴", "slots.finish": "마감", "slots.output": "출력",
  "tuning.size": "크기", "tuning.opacity": "불투명도", "tuning.flow": "유량", "tuning.spacing": "다브 간격",
  "tuning.stabilization": "안정화", "tuning.surfaceTooth": "종이 요철", "tuning.friction": "마찰", "tuning.absorbency": "흡수율",
  "tuning.granulation": "과립", "tuning.edgeDarkening": "가장자리 농축", "tuning.pickup": "아래색 픽업", "tuning.reservoir": "안료 저장량",
  "tuning.wetness": "수분", "tuning.diffusion": "확산", "tuning.advection": "이류", "tuning.evaporation": "증발",
  "tuning.viscosity": "점도", "tuning.plasticity": "소성", "tuning.gravity": "중력", "tuning.bristleStrands": "강모 수",
  "tuning.bristleIterations": "강모 반복", "tuning.particleCount": "입자 수", "tuning.reactionRate": "반응 성장",
  "tuning.patternDensity": "패턴 밀도", "tuning.patternScale": "패턴 크기", "tuning.patternJitter": "불규칙성",
  "tuning.relief": "물감 높이", "tuning.gloss": "광택", "tuning.primaryColor": "기본 색", "tuning.secondaryColor": "혼합 색",
  "input.transport": "입력 전송", "input.predictionPreviewOnly": "입력 예측", "input.touchPolicy": "터치 정책",
  "input.palmRejection": "팜 차단", "input.hoverPreview": "호버", "input.pressureOnset": "필압 시작", "input.pressureSaturation": "필압 포화",
  "input.pressureGamma": "필압 감마", "input.pressureHysteresis": "필압 히스테리시스", "input.tiltEnabled": "틸트",
  "input.tiltDeadZoneDeg": "틸트 데드존", "input.tiltSmoothing": "틸트 완화", "input.twistSmoothing": "회전 완화",
  "input.film": "화면 필름", "input.audioFeedback": "소리 피드백", "input.hapticFeedback": "진동 피드백",
  "proofs.deterministicPatternSeed": "패턴 시드 고정", "proofs.rasterReceipt": "출력 결과 보존",
  "proofs.mixboxDistinctiveness.verified": "색 혼합 검증", "proofs.mixboxDistinctiveness.spectralReproductionFailed": "색 혼합 재현 비교",
  "proofs.mixboxDistinctiveness.blindPreference": "색 혼합 선호도", "proofs.mixboxDistinctiveness.blindDistinguishability": "색 혼합 구분도",
  "proofs.mixboxDistinctiveness.meanPathDeltaE": "색 혼합 색차",
};

function displayValue(path: string, value: string): string {
  if (path.startsWith("slots.")) return value.split(", ").map((id) => BRUSH_STUDIO_V6_NODES.find((node) => node.id === id)?.label ?? id).join(" + ");
  if (value === "true") return "켜짐";
  if (value === "false") return "꺼짐";
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? String(Number(number.toFixed(3))) : value;
}

function Sample({ program, label, compact = false }: {
  readonly program: BrushStudioV6Program;
  readonly label: string;
  readonly compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const render = () => renderBrushStudioV6Preview(canvas, program);
    render();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(render);
    observer?.observe(canvas);
    return () => observer?.disconnect();
  }, [program]);
  return <canvas ref={canvasRef} role="img" aria-label={label} className={`${compact ? "h-40" : "h-56"} w-full rounded-xl border border-line bg-white`} />;
}

export function StudioBrushV6Experiments({ program, reference, onPin, onRestore, onChange }: {
  readonly program: BrushStudioV6Program;
  readonly reference: BrushStudioV6Program;
  readonly onPin: () => void;
  readonly onRestore: () => void;
  readonly onChange: (program: BrushStudioV6Program, message: string) => void;
}) {
  const [requestedField, setRequestedField] = useState<BrushStudioV6NumericTuning>("flow");
  const fields = brushStudioV6ExperimentFields(program);
  const field = fields.find((candidate) => candidate.key === requestedField) ?? fields[0]!;
  const samples = createBrushStudioV6ExperimentSamples(program, field);
  const differences = compareBrushStudioV6Programs(reference, program);
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card/60 p-4 shadow-sm" aria-labelledby="brush-v6-comparison-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="brush-v6-comparison-title" className="text-sm font-black text-fg">기준 브러시와 비교</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">좋았던 설정을 기준으로 고정한 뒤 자유롭게 실험하세요. 기준 복원도 실행 취소할 수 있습니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} onClick={onPin}>현재를 기준으로 고정</button>
            <button type="button" className={BUTTON} disabled={differences.length === 0} onClick={onRestore}>기준 설정 복원</button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <figure className="min-w-0">
            <figcaption className="mb-2 flex items-center justify-between gap-2 text-xs text-fg-2"><strong>A · 기준</strong><span className="truncate">{reference.name}</span></figcaption>
            <Sample program={reference} label="A 기준 브러시 비교 획" />
          </figure>
          <figure className="min-w-0">
            <figcaption className="mb-2 flex items-center justify-between gap-2 text-xs text-fg-2"><strong>B · 현재</strong><span className="truncate">{program.name}</span></figcaption>
            <Sample program={program} label="B 현재 브러시 비교 획" />
          </figure>
        </div>
        <p className="mt-3 text-xs text-fg-3">같은 궤적·필압으로 비교합니다.{reference.seed !== program.seed ? " 개성 시드도 달라졌으므로 질감 배치가 함께 바뀝니다." : " 질감 시드도 동일합니다."}</p>
        {differences.length ? <details className="mt-3 rounded-xl border border-line bg-bg-2/55 p-3">
          <summary className={`cursor-pointer text-xs font-bold text-fg-2 ${STUDIO_FOCUS_RING}`}>기준에서 바뀐 설정 {differences.length}개</summary>
          <dl className="mt-3 space-y-2">
            {differences.map((difference) => <div key={difference.path} className="grid gap-1 text-xs sm:grid-cols-[7.5rem_minmax(0,1fr)]">
              <dt className="font-bold text-fg-2">{LABELS[difference.path] ?? "추가 설정"}</dt>
              <dd className="break-words text-fg-3"><span>{displayValue(difference.path, difference.before)}</span><span aria-label="변경 후"> → </span><span className="font-semibold text-fg">{displayValue(difference.path, difference.after)}</span></dd>
            </div>)}
          </dl>
        </details> : <p className="mt-3 text-xs text-fg-3">현재 설정과 기준이 같습니다.</p>}
      </section>

      <section className="rounded-2xl border border-line bg-card/60 p-4 shadow-sm" aria-labelledby="brush-v6-sweep-title">
        <h2 id="brush-v6-sweep-title" className="text-sm font-black text-fg">한 가지 속성만 바꿔보기</h2>
        <p className="mt-1 text-xs leading-5 text-fg-3">같은 색·시드·물리 조합에서 한 설정만 바꿉니다. 원하는 획을 고르면 현재 브러시에 적용됩니다.</p>
        <label htmlFor="brush-v6-experiment-field" className="mt-4 block text-xs font-bold text-fg-2">비교할 속성
          <select id="brush-v6-experiment-field" value={field.key} onChange={(event) => setRequestedField(event.currentTarget.value as BrushStudioV6NumericTuning)} className={`mt-1.5 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg ${STUDIO_FOCUS_RING}`}>
            {fields.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
          </select>
        </label>
        <p className="mt-2 text-xs leading-5 text-fg-3">{field.description}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {samples.map((sample, index) => <figure key={sample.label} className="min-w-0">
            <figcaption className="mb-2 flex justify-between gap-2 text-xs text-fg-2"><strong>{sample.label}</strong><span className="tabular-nums">{sample.value}</span></figcaption>
            <Sample program={sample.program} label={`${field.label} ${sample.label} 비교 획`} compact />
            <button type="button" className={`${BUTTON} mt-2 w-full`} disabled={index === 1 || sample.value === program.tuning[field.key]} onClick={() => onChange(sample.program, `${field.label} ${sample.value} 비교안을 적용했습니다.`)}>{index === 1 ? "현재 설정" : `${sample.label} 적용`}</button>
          </figure>)}
        </div>
      </section>
    </div>
  );
}
