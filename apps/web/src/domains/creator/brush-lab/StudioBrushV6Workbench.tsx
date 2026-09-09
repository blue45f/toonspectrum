import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  BRUSH_STUDIO_V6_NODES,
  BRUSH_STUDIO_V6_RECIPES,
  analyzeBrushStudioV6Program,
  brushStudioV6Node,
  brushStudioV6NodesForSlot,
  createBrushStudioV6Program,
  detectBrushStudioV6Capabilities,
  normalizeBrushStudioV6Program,
  optimizeBrushStudioV6Program,
  patchBrushStudioV6Input,
  patchBrushStudioV6Metadata,
  patchBrushStudioV6Proofs,
  patchBrushStudioV6Tuning,
  replaceBrushStudioV6Slot,
  toggleBrushStudioV6Node,
  type BrushStudioV6Capabilities,
  type BrushStudioV6InputPolicy,
  type BrushStudioV6Issue,
  type BrushStudioV6NodeDescriptor,
  type BrushStudioV6Program,
  type BrushStudioV6Slot,
  type BrushStudioV6Tuning,
} from "./brush-studio-v6-engine";
import {
  attachBrushStudioV6LivePreview,
  renderBrushStudioV6Preview,
  type BrushStudioV6LiveController,
  type BrushStudioV6Telemetry,
} from "./brush-studio-v6-preview";

const CARD = "rounded-2xl border border-line bg-card/60 p-4 shadow-sm";
const SUB = "rounded-xl border border-line bg-bg-2/55 p-3";
const INPUT = `min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg ${STUDIO_FOCUS_RING}`;
const BUTTON = `inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-card px-3 py-2 text-sm font-bold text-fg transition-colors hover:border-line-strong hover:bg-raised ${STUDIO_FOCUS_RING}`;
const PRIMARY = `inline-flex min-h-11 items-center justify-center rounded-xl border border-accent/40 bg-accent px-3 py-2 text-sm font-black text-on-accent hover:opacity-90 ${STUDIO_FOCUS_RING}`;

type Tab = "recipes" | "graph" | "input" | "material" | "physics" | "pattern" | "runtime";
type SingleSlot = Exclude<BrushStudioV6Slot, "input" | "physics" | "finish">;
type NumericKey = Exclude<keyof BrushStudioV6Tuning, "primaryColor" | "secondaryColor">;
interface SliderSpec { readonly key: NumericKey; readonly label: string; readonly min: number; readonly max: number; readonly step: number; }

const SINGLE_SLOTS: readonly { slot: SingleSlot; label: string; description: string }[] = [
  { slot: "motion", label: "필기감", description: "직접 추종, EMA, 스프링, 관성, Google Ink" },
  { slot: "carrier", label: "획 캐리어", description: "센터라인, 외곽선, 메시, 자연 다브, 강모, 입자" },
  { slot: "tip", label: "촉", description: "SDF, 치즐, 실물 grain, 듀얼팁, 노멀, 모티프" },
  { slot: "surface", label: "표면", description: "필름, 종이 이빨, 수채지, 캔버스, 실물 샘플" },
  { slot: "deposition", label: "도포", description: "잉크, 마커, 건식, 습식, 유화, 입자, 빛" },
  { slot: "pickup", label: "픽업", description: "Krita Color Smudge와 pigment-painter reservoir" },
  { slot: "pigment", label: "안료", description: "RGB, Spectral, Open K/S, LUT, Mixbox, Inkwash" },
  { slot: "pattern", label: "패턴", description: "톤, 해칭, 직조, 벽돌, 모티프, flow field" },
  { slot: "output", label: "출력 권위", description: "래스터 타일, 하이브리드, 순수 벡터" },
];

const MATERIAL: readonly SliderSpec[] = [
  { key: "size", label: "크기", min: 1, max: 180, step: 1 },
  { key: "opacity", label: "불투명도", min: 0.01, max: 1, step: 0.01 },
  { key: "flow", label: "도포 유량", min: 0.01, max: 1, step: 0.01 },
  { key: "spacing", label: "다브 간격", min: 0.01, max: 2, step: 0.01 },
  { key: "surfaceTooth", label: "표면 이빨", min: 0, max: 1, step: 0.01 },
  { key: "friction", label: "마찰", min: 0, max: 1, step: 0.01 },
  { key: "absorbency", label: "흡수율", min: 0, max: 1, step: 0.01 },
  { key: "granulation", label: "과립", min: 0, max: 1, step: 0.01 },
  { key: "edgeDarkening", label: "엣지 농축", min: 0, max: 1, step: 0.01 },
  { key: "pickup", label: "아래색 픽업", min: 0, max: 1, step: 0.01 },
  { key: "reservoir", label: "Reservoir", min: 0, max: 1, step: 0.01 },
  { key: "relief", label: "릴리프", min: 0, max: 1, step: 0.01 },
  { key: "gloss", label: "광택", min: 0, max: 1, step: 0.01 },
];
const PHYSICS: readonly SliderSpec[] = [
  { key: "wetness", label: "수분", min: 0, max: 1, step: 0.01 },
  { key: "diffusion", label: "확산", min: 0, max: 1, step: 0.01 },
  { key: "advection", label: "이류", min: 0, max: 1, step: 0.01 },
  { key: "evaporation", label: "증발", min: 0, max: 1, step: 0.01 },
  { key: "viscosity", label: "점도", min: 0, max: 1, step: 0.01 },
  { key: "plasticity", label: "소성", min: 0, max: 1, step: 0.01 },
  { key: "gravity", label: "중력", min: -1, max: 1, step: 0.01 },
  { key: "bristleStrands", label: "강모 수", min: 8, max: 256, step: 8 },
  { key: "bristleIterations", label: "강모 반복", min: 1, max: 12, step: 1 },
  { key: "particleCount", label: "입자 수", min: 16, max: 4096, step: 16 },
  { key: "reactionRate", label: "반응 성장", min: 0, max: 1, step: 0.01 },
];
const PATTERN: readonly SliderSpec[] = [
  { key: "patternDensity", label: "패턴 밀도", min: 0, max: 1, step: 0.01 },
  { key: "patternScale", label: "패턴 크기", min: 0.1, max: 4, step: 0.01 },
  { key: "patternJitter", label: "불규칙성", min: 0, max: 1, step: 0.01 },
];
const EMPTY_TELEMETRY: BrushStudioV6Telemetry = Object.freeze({ pointerType: "—", pressure: 0, tilt: 0, twist: 0, sampleRateHz: 0, rejectedPalm: false, transport: "auto" });

function readProgram(key: string): BrushStudioV6Program {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value ? normalizeBrushStudioV6Program(JSON.parse(value)) : createBrushStudioV6Program();
  } catch {
    return createBrushStudioV6Program();
  }
}

function download(program: BrushStudioV6Program): void {
  const blob = new Blob([JSON.stringify({ kind: "toonspectrum.brush-program-v6", program }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${program.id || "brush"}.brush-v6.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

function Panel({ title, description, children }: { readonly title: string; readonly description: string; readonly children: ReactNode }) {
  return <section className={CARD}><h2 className="text-sm font-black text-fg">{title}</h2><p className="mt-1 text-xs leading-relaxed text-fg-3">{description}</p><div className="mt-4">{children}</div></section>;
}

function Slider({ spec, value, onChange }: { readonly spec: SliderSpec; readonly value: number; readonly onChange: (value: number) => void }) {
  const id = `brush-v6-${spec.key}`;
  return (
    <label htmlFor={id} className={SUB}>
      <span className="flex justify-between gap-2 text-xs font-bold text-fg-2"><span>{spec.label}</span><span className="tabular-nums text-fg">{value.toFixed(spec.step < 0.1 ? 2 : 0)}</span></span>
      <input id={id} type="range" min={spec.min} max={spec.max} step={spec.step} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.valueAsNumber)} className="mt-2 min-h-8 w-full accent-accent" />
    </label>
  );
}

function Select({ id, label, value, options, onChange }: { readonly id: string; readonly label: string; readonly value: string; readonly options: readonly { id: string; label: string }[]; readonly onChange: (value: string) => void }) {
  return (
    <label htmlFor={id} className="block text-xs font-bold text-fg-2">{label}
      <select id={id} value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value)} className={`${INPUT} mt-1.5`}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ToggleNode({ node, selected, onChange }: { readonly node: BrushStudioV6NodeDescriptor; readonly selected: boolean; readonly onChange: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onChange} className={`${SUB} min-h-[92px] text-left transition-colors ${selected ? "border-accent/60 bg-accent/10" : "hover:border-line-strong"} ${STUDIO_FOCUS_RING}`}>
      <span className="flex items-start justify-between gap-2"><span className="text-sm font-black text-fg">{node.label}</span><span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[0.62rem] font-black text-accent">{node.provider}</span></span>
      <span className="mt-1 block text-xs leading-relaxed text-fg-3">{node.description}</span>
    </button>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return <div className={SUB}><div className="flex justify-between text-xs font-bold text-fg-2"><span>{label}</span><span>{value}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} /></div></div>;
}

function Issue({ issue }: { readonly issue: BrushStudioV6Issue }) {
  const tone = issue.severity === "error" ? "border-red-500/40 bg-red-500/10" : issue.severity === "warning" ? "border-amber-500/40 bg-amber-500/10" : "border-line bg-bg-2/55";
  return <article className={`rounded-xl border p-3 ${tone}`}><div className="flex justify-between gap-2"><h3 className="text-xs font-black text-fg">{issue.title}</h3><span className="text-[0.62rem] font-black uppercase text-fg-3">{issue.severity}</span></div><p className="mt-1 text-xs text-fg-3">{issue.detail}</p>{issue.fix ? <p className="mt-2 text-xs font-bold text-fg-2">해결: {issue.fix}</p> : null}</article>;
}

function nodeOptions(slot: BrushStudioV6Slot): readonly { id: string; label: string }[] {
  return brushStudioV6NodesForSlot(slot).map((node) => ({ id: node.id, label: `${node.label} · ${node.provider}` }));
}

function capabilityRows(capabilities: BrushStudioV6Capabilities): readonly { label: string; enabled: boolean }[] {
  return [
    ["WebGPU", capabilities.webgpu], ["WASM", capabilities.wasm], ["WebGL2", capabilities.webgl2], ["SharedArrayBuffer", capabilities.sharedArrayBuffer],
    ["pointerrawupdate", capabilities.pointerRawUpdate], ["Coalesced", capabilities.coalescedEvents], ["Predicted", capabilities.predictedEvents],
    ["Pressure", capabilities.pressure], ["Tilt", capabilities.tilt], ["Twist", capabilities.twist], ["Hover", capabilities.hover],
  ].map(([label, enabled]) => ({ label: String(label), enabled: Boolean(enabled) }));
}

export function StudioBrushV6Workbench({ scope }: { readonly scope: string }) {
  const storageKey = `toonspectrum.brush-program-v6:${encodeURIComponent(scope)}`;
  const [program, setProgram] = useState<BrushStudioV6Program>(() => readProgram(storageKey));
  const [tab, setTab] = useState<Tab>("recipes");
  const [settle, setSettle] = useState(0.75);
  const [status, setStatus] = useState("V6는 이전 브러시 데이터를 마이그레이션하지 않고 새 품질 권위를 저장합니다.");
  const [telemetry, setTelemetry] = useState<BrushStudioV6Telemetry>(EMPTY_TELEMETRY);
  const [capabilities, setCapabilities] = useState<BrushStudioV6Capabilities>(() => detectBrushStudioV6Capabilities());
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<BrushStudioV6LiveController | null>(null);
  const currentRef = useRef(program);
  currentRef.current = program;

  const analysis = useMemo(() => analyzeBrushStudioV6Program(program, capabilities), [program, capabilities]);
  const recipeGroups = useMemo(() => [...new Set(BRUSH_STUDIO_V6_RECIPES.map((recipe) => recipe.group))], []);
  const physicsNodes = useMemo(() => brushStudioV6NodesForSlot("physics"), []);
  const finishNodes = useMemo(() => brushStudioV6NodesForSlot("finish"), []);

  useEffect(() => setCapabilities(detectBrushStudioV6Capabilities()), []);
  useEffect(() => {
    try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(program)); } catch { /* persistence is optional */ }
    globalThis.dispatchEvent?.(new CustomEvent("toonspectrum:brush-v6-program", { detail: program }));
  }, [program, storageKey]);
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const render = () => renderBrushStudioV6Preview(canvas, program, { settleProgress: settle });
    render();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(render);
    observer?.observe(canvas);
    return () => observer?.disconnect();
  }, [program, settle]);
  useEffect(() => {
    const canvas = liveRef.current;
    if (!canvas) return;
    const controller = attachBrushStudioV6LivePreview(canvas, () => currentRef.current, setTelemetry);
    controllerRef.current = controller;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => controller.clear());
    observer?.observe(canvas);
    return () => { observer?.disconnect(); controller.destroy(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, []);
  useEffect(() => controllerRef.current?.clear(), [program.id, program.seed, program.slots.surface]);

  const replace = (next: BrushStudioV6Program, message?: string) => { setProgram(normalizeBrushStudioV6Program(next)); if (message) setStatus(message); };
  const patchInput = (delta: Partial<BrushStudioV6InputPolicy>) => replace(patchBrushStudioV6Input(program, delta));
  const patchTuning = (key: NumericKey, value: number) => replace(patchBrushStudioV6Tuning(program, { [key]: value }));
  const choose = (slot: SingleSlot, id: string) => replace(replaceBrushStudioV6Slot(program, slot, id));
  const chooseRecipe = (id: string) => { const recipe = BRUSH_STUDIO_V6_RECIPES.find((entry) => entry.id === id); if (!recipe) return; replace(recipe.create(), `${recipe.label} 레시피를 불러왔습니다.`); setTab("graph"); };
  const importProgram = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return;
    try { const parsed: unknown = JSON.parse(await file.text()); const source = parsed && typeof parsed === "object" && "program" in parsed ? (parsed as { program: unknown }).program : parsed; replace(normalizeBrushStudioV6Program(source), `${file.name}을 V6 권위로 가져왔습니다.`); } catch { setStatus("V6 브러시 JSON을 읽을 수 없습니다."); }
  };

  const tabs: readonly { id: Tab; label: string }[] = [
    { id: "recipes", label: `레시피 ${BRUSH_STUDIO_V6_RECIPES.length}` }, { id: "graph", label: "Engine Graph" }, { id: "input", label: "Input·Device" },
    { id: "material", label: "Material" }, { id: "physics", label: "Physics" }, { id: "pattern", label: "Pattern" }, { id: "runtime", label: "Runtime" },
  ];

  return (
    <section className="space-y-4">
      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.2em] text-accent">BrushGraph V6</p>
            <h2 className="mt-1 text-lg font-black text-fg">실행 가능한 물리·질감 브러시 제작기</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">72개 타입 노드를 조합하고 17개 시그니처 레시피를 실제 입력 패드에서 비교합니다. 물리·권리·장치 기능이 충돌하면 저장 전에 fail-closed로 차단합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PRIMARY} onClick={() => replace(optimizeBrushStudioV6Program(program, capabilities), "현재 장치에 맞게 WebGPU 우선으로 최적화했습니다.")}>장치 최적화</button>
            <button type="button" className={BUTTON} onClick={() => replace(patchBrushStudioV6Metadata(program, { seed: (program.seed * 1664525 + 1013904223) >>> 0 }), "결정적 개성 시드를 변경했습니다.")}>개성 시드</button>
            <button type="button" className={BUTTON} onClick={() => download(program)}>내보내기</button>
            <button type="button" className={BUTTON} onClick={() => fileRef.current?.click()}>가져오기</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={importProgram} />
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label htmlFor="brush-v6-name" className="text-xs font-bold text-fg-2">브러시 이름<input id="brush-v6-name" value={program.name} onChange={(event: ChangeEvent<HTMLInputElement>) => replace(patchBrushStudioV6Metadata(program, { name: event.currentTarget.value }))} className={`${INPUT} mt-1.5`} /></label>
          <Select id="brush-v6-goal" label="품질 목표" value={program.qualityGoal} options={[{ id: "responsive", label: "최저 지연" }, { id: "balanced", label: "균형" }, { id: "material", label: "재료 충실도" }, { id: "cinematic", label: "출력 극대화" }]} onChange={(value) => replace(patchBrushStudioV6Metadata(program, { qualityGoal: value as BrushStudioV6Program["qualityGoal"] }))} />
          <Select id="brush-v6-device" label="대상 장치" value={program.deviceProfile} options={[{ id: "desktop-pen", label: "데스크톱 펜" }, { id: "tablet-pen", label: "태블릿 펜" }, { id: "touch-hybrid", label: "펜+터치" }, { id: "mouse", label: "마우스" }]} onChange={(value) => replace(patchBrushStudioV6Metadata(program, { deviceProfile: value as BrushStudioV6Program["deviceProfile"] }))} />
          <div className={SUB}><p className="text-xs font-bold text-fg-2">실행 상태</p><p className="mt-1 text-sm font-black text-fg">{analysis.valid ? "컴파일 가능" : "차단 이슈 있음"}</p><p className="mt-1 text-[0.68rem] text-fg-3">{analysis.rightsProfile} · {analysis.resolvedTransport}</p></div>
        </div>
        <p role="status" className="mt-3 rounded-xl border border-line bg-bg-2/55 px-3 py-2 text-xs text-fg-2">{status}</p>
      </div>

      <nav aria-label="브러시 스튜디오 영역" className="flex gap-2 overflow-x-auto rounded-2xl border border-line bg-card/45 p-2">
        {tabs.map((item) => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-black ${tab === item.id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised"} ${STUDIO_FOCUS_RING}`}>{item.label}</button>)}
      </nav>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="space-y-4">
          {tab === "recipes" ? <Panel title="시그니처 레시피" description="이름만 다른 프리셋이 아니라 실제 재료·물리·패턴 결과가 다른 조합입니다."><div className="space-y-5">{recipeGroups.map((group) => <section key={group}><h3 className="mb-2 text-xs font-black text-fg-2">{group}</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{BRUSH_STUDIO_V6_RECIPES.filter((recipe) => recipe.group === group).map((recipe) => <button key={recipe.id} type="button" onClick={() => chooseRecipe(recipe.id)} className={`${SUB} min-h-[108px] text-left hover:border-accent/50 hover:bg-accent/10 ${STUDIO_FOCUS_RING}`}><span className="text-sm font-black text-fg">{recipe.label}</span><span className="mt-2 block text-xs leading-relaxed text-fg-3">{recipe.description}</span></button>)}</div></section>)}</div></Panel> : null}

          {tab === "graph" ? <Panel title="Engine Graph" description="각 단일 authority는 하나만 선택하고 물리·마감 노드는 복수 조합합니다."><div className="grid gap-4 lg:grid-cols-2">{SINGLE_SLOTS.map(({ slot, label, description }) => { const selected = program.slots[slot]; const node = brushStudioV6Node(selected); return <div key={slot} className={SUB}><Select id={`brush-v6-slot-${slot}`} label={label} value={selected} options={nodeOptions(slot)} onChange={(id) => choose(slot, id)} /><p className="mt-2 text-xs text-fg-3">{description}</p><p className="mt-1 text-[0.68rem] font-bold text-accent">{node.domain} · {node.phase} · {node.rights}</p></div>; })}</div></Panel> : null}

          {tab === "input" ? <><Panel title="입력·장치 정책" description="필압·틸트·호버·팜리젝션과 펜/손가락 권한을 브러시 데이터와 분리합니다."><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Select id="brush-v6-transport" label="입력 전송" value={program.input.transport} options={[{ id: "auto", label: "자동" }, { id: "raw-coalesced", label: "pointerrawupdate + coalesced" }, { id: "move-coalesced", label: "pointermove + coalesced" }, { id: "move-basic", label: "기본 pointermove" }]} onChange={(value) => patchInput({ transport: value as BrushStudioV6InputPolicy["transport"] })} /><Select id="brush-v6-touch" label="터치 정책" value={program.input.touchPolicy} options={[{ id: "pen-only", label: "펜 전용" }, { id: "pen-draw-finger-pan", label: "펜 그림·손가락 이동" }, { id: "pen-draw-two-finger-gesture", label: "펜 그림·두 손가락 제스처" }, { id: "pen-ink-finger-water", label: "펜 잉크·손가락 물붓" }, { id: "touch-draw", label: "터치 그리기" }]} onChange={(value) => patchInput({ touchPolicy: value as BrushStudioV6InputPolicy["touchPolicy"] })} /><Select id="brush-v6-film" label="화면 필름" value={program.input.film} options={[{ id: "glass", label: "유리" }, { id: "matte", label: "무광" }, { id: "paperlike-fine", label: "종이질감 Fine" }, { id: "paperlike-rough", label: "종이질감 Rough" }]} onChange={(value) => patchInput({ film: value as BrushStudioV6InputPolicy["film"] })} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{([[
            "예측 preview-only", "canonical 물리 상태 오염 방지", "predictionPreviewOnly"], ["팜리젝션", "큰 접촉과 펜 동시 입력 차단", "palmRejection"], ["호버 프리뷰", "촉·틸트 예상 면적 표시", "hoverPreview"], ["틸트 인식", "접촉 폭·치즐·강모 방향", "tiltEnabled"]] as const).map(([label, detail, key]) => <button key={key} type="button" aria-pressed={program.input[key]} onClick={() => patchInput({ [key]: !program.input[key] })} className={`${SUB} text-left ${program.input[key] ? "border-accent/60 bg-accent/10" : ""} ${STUDIO_FOCUS_RING}`}><span className="text-xs font-black text-fg">{label}</span><span className="mt-1 block text-[0.68rem] text-fg-3">{detail}</span></button>)}</div></Panel><Panel title="필압·방향 교정" description="장치 원시값을 canonical 센서 범위로 정규화합니다."><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[
            { key: "pressureOnset", label: "접촉 시작", min: 0, max: 0.4, step: 0.01 }, { key: "pressureSaturation", label: "포화", min: 0.5, max: 1, step: 0.01 }, { key: "pressureGamma", label: "감마", min: 0.2, max: 3, step: 0.01 }, { key: "pressureHysteresis", label: "히스테리시스", min: 0, max: 0.2, step: 0.005 }, { key: "tiltDeadZoneDeg", label: "틸트 데드존", min: 0, max: 20, step: 0.5 }, { key: "tiltSmoothing", label: "틸트 스무딩", min: 0, max: 1, step: 0.01 },
          ].map((spec) => <label key={spec.key} htmlFor={`brush-v6-input-${spec.key}`} className={SUB}><span className="flex justify-between text-xs font-bold text-fg-2"><span>{spec.label}</span><span>{Number(program.input[spec.key as keyof BrushStudioV6InputPolicy]).toFixed(2)}</span></span><input id={`brush-v6-input-${spec.key}`} type="range" min={spec.min} max={spec.max} step={spec.step} value={Number(program.input[spec.key as keyof BrushStudioV6InputPolicy])} onChange={(event: ChangeEvent<HTMLInputElement>) => patchInput({ [spec.key]: event.currentTarget.valueAsNumber })} className="mt-2 min-h-8 w-full accent-accent" /></label>)}</div></Panel></> : null}

          {tab === "material" ? <Panel title="재료·표면" description="종이 접촉, 도포, 안료 pickup과 높이 표현을 직접 조절합니다."><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{MATERIAL.map((spec) => <Slider key={spec.key} spec={spec} value={program.tuning[spec.key]} onChange={(value) => patchTuning(spec.key, value)} />)}<label htmlFor="brush-v6-primary" className={SUB}><span className="text-xs font-bold text-fg-2">기본 색</span><input id="brush-v6-primary" type="color" value={program.tuning.primaryColor} onChange={(event: ChangeEvent<HTMLInputElement>) => replace(patchBrushStudioV6Tuning(program, { primaryColor: event.currentTarget.value }))} className="mt-2 h-10 w-full rounded-lg" /></label><label htmlFor="brush-v6-secondary" className={SUB}><span className="text-xs font-bold text-fg-2">혼합·패턴 색</span><input id="brush-v6-secondary" type="color" value={program.tuning.secondaryColor} onChange={(event: ChangeEvent<HTMLInputElement>) => replace(patchBrushStudioV6Tuning(program, { secondaryColor: event.currentTarget.value }))} className="mt-2 h-10 w-full rounded-lg" /></label></div></Panel> : null}

          {tab === "physics" ? <><Panel title="물리 엔진" description="Wet, thin-film, bristle, particle, reaction, height 필드를 독립적으로 조합합니다."><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{physicsNodes.map((node) => <ToggleNode key={node.id} node={node} selected={program.slots.physics.includes(node.id)} onChange={() => replace(toggleBrushStudioV6Node(program, "physics", node.id))} />)}</div></Panel><Panel title="물리 파라미터" description="라이브 비용은 장치 최적화가 LOD를 조정하고 commit/export에서 고품질로 재평가합니다."><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{PHYSICS.map((spec) => <Slider key={spec.key} spec={spec} value={program.tuning[spec.key]} onChange={(value) => patchTuning(spec.key, value)} />)}</div></Panel><Panel title="마감 패스" description="엣지 농축, 젖은 광택, 릴리프, 네온, grain, chroma를 복수 적용합니다."><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{finishNodes.map((node) => <ToggleNode key={node.id} node={node} selected={program.slots.finish.includes(node.id)} onChange={() => replace(toggleBrushStudioV6Node(program, "finish", node.id))} />)}</div></Panel></> : null}

          {tab === "pattern" ? <><Panel title="패턴·문양" description="반복 토폴로지와 문서 위상이 다른 패턴은 독립 브러시 정체성으로 유지합니다."><Select id="brush-v6-pattern" label="패턴 프로그램" value={program.slots.pattern} options={nodeOptions("pattern")} onChange={(id) => choose("pattern", id)} /><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{PATTERN.map((spec) => <Slider key={spec.key} spec={spec} value={program.tuning[spec.key]} onChange={(value) => patchTuning(spec.key, value)} />)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" aria-pressed={program.proofs.deterministicPatternSeed} onClick={() => replace(patchBrushStudioV6Proofs(program, { deterministicPatternSeed: !program.proofs.deterministicPatternSeed }))} className={`${SUB} text-left ${program.proofs.deterministicPatternSeed ? "border-accent/60 bg-accent/10" : ""} ${STUDIO_FOCUS_RING}`}><span className="text-xs font-black text-fg">결정적 패턴 위상</span><span className="mt-1 block text-[0.68rem] text-fg-3">동일 seed에서 재생·협업·내보내기 결과를 고정합니다.</span></button><button type="button" aria-pressed={program.proofs.rasterReceipt} onClick={() => replace(patchBrushStudioV6Proofs(program, { rasterReceipt: !program.proofs.rasterReceipt }))} className={`${SUB} text-left ${program.proofs.rasterReceipt ? "border-accent/60 bg-accent/10" : ""} ${STUDIO_FOCUS_RING}`}><span className="text-xs font-black text-fg">물리 타일 영수증</span><span className="mt-1 block text-[0.68rem] text-fg-3">GPU 오차가 있는 결과를 commit 타일로 보존합니다.</span></button></div></Panel>{program.slots.pigment === "pigment-mixbox" ? <Panel title="Mixbox 대체 불가능성" description="Spectral/Open K/S로 재현되지 않는 경우에만 제품 경로로 허용합니다."><div className="grid gap-2 sm:grid-cols-2">{([[
            "verified", "A/B 검증 완료"], ["spectralReproductionFailed", "Spectral 재현 실패"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={program.proofs.mixboxDistinctiveness[key]} onClick={() => replace(patchBrushStudioV6Proofs(program, { mixboxDistinctiveness: { ...program.proofs.mixboxDistinctiveness, [key]: !program.proofs.mixboxDistinctiveness[key] } }))} className={`${SUB} text-left ${program.proofs.mixboxDistinctiveness[key] ? "border-accent/60 bg-accent/10" : ""} ${STUDIO_FOCUS_RING}`}><span className="text-xs font-black text-fg">{label}</span></button>)}</div></Panel> : null}</> : null}

          {tab === "runtime" ? <><Panel title="실행 패스" description="동일 phase의 WebGPU 노드는 fuse하고 WASM·WebGL provider는 worker 경계에 둡니다."><div className="space-y-2">{analysis.passes.map((pass) => <article key={pass.id} className={SUB}><div className="flex flex-wrap justify-between gap-2"><h3 className="text-xs font-black text-fg">{pass.label}</h3><span className="text-[0.65rem] font-black text-accent">{pass.phase} · {pass.domain} · {pass.budgetMs.toFixed(2)}ms</span></div><p className="mt-1 text-[0.68rem] text-fg-3">{pass.nodeIds.map((id) => brushStudioV6Node(id).provider).filter((value, index, values) => values.indexOf(value) === index).join(" + ")} · {pass.nodeIds.join(" → ") || "presentation"}</p></article>)}</div></Panel><Panel title="GPU·Worker 리소스" description="활성 물리 authority가 소유하는 필드와 예상 메모리입니다."><div className="grid gap-2 sm:grid-cols-2">{analysis.resources.map((resource) => <div key={resource.id} className={SUB}><div className="flex justify-between text-xs font-black text-fg"><span>{resource.id}</span><span>{resource.format}</span></div><p className="mt-1 text-xs text-fg-3">{resource.owner} · scale {resource.scale}</p><p className="mt-1 text-[0.68rem] font-bold text-fg-2">약 {resource.estimatedMb.toFixed(1)}MB</p></div>)}</div></Panel><Panel title="브라우저 능력" description="현재 환경에서 provider와 입력 전송이 실제 실행 가능한지 표시합니다."><div className="flex flex-wrap gap-2">{capabilityRows(capabilities).map((item) => <span key={item.label} className={`rounded-full border px-3 py-1.5 text-[0.68rem] font-bold ${item.enabled ? "border-accent/40 bg-accent/10 text-accent" : "border-line bg-bg-2 text-fg-3"}`}>{item.label} · {item.enabled ? "YES" : "NO"}</span>)}</div></Panel></> : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Panel title="결정적 질감 시험지" description="동일 seed로 종이·안료·입자·습식·강모·패턴 결과를 비교합니다."><canvas ref={previewRef} role="img" aria-label="현재 브러시의 결정적 질감 시험지" className="h-64 w-full rounded-xl border border-line bg-white" /><label htmlFor="brush-v6-settle" className="mt-3 block text-xs font-bold text-fg-2">정착 시간 · {Math.round(settle * 100)}%<input id="brush-v6-settle" type="range" min="0" max="1" step="0.01" value={settle} onChange={(event: ChangeEvent<HTMLInputElement>) => setSettle(event.currentTarget.valueAsNumber)} className="mt-2 min-h-8 w-full accent-accent" /></label></Panel>
          <Panel title="실제 입력 필기 패드" description="펜·마우스·허용된 터치로 필압·틸트·팜 차단과 재질 반응을 확인합니다."><canvas ref={liveRef} aria-label="브러시 스튜디오 실제 입력 필기 패드" className="h-72 w-full cursor-crosshair rounded-xl border border-line bg-white" /><div className="mt-3 grid grid-cols-3 gap-2 text-center text-[0.68rem]"><div className={SUB}><p className="font-bold text-fg-3">입력률</p><p className="mt-1 font-black text-fg">{telemetry.sampleRateHz}Hz</p></div><div className={SUB}><p className="font-bold text-fg-3">필압</p><p className="mt-1 font-black text-fg">{telemetry.pressure.toFixed(2)}</p></div><div className={SUB}><p className="font-bold text-fg-3">Tilt</p><p className="mt-1 font-black text-fg">{telemetry.tilt.toFixed(0)}°</p></div></div><div className="mt-2 flex items-center justify-between gap-2 text-[0.68rem] text-fg-3"><span>{telemetry.pointerType} · twist {telemetry.twist.toFixed(0)}° · {telemetry.rejectedPalm ? "팜 차단" : "입력 수락"}</span><button type="button" className={BUTTON} onClick={() => controllerRef.current?.clear()}>지우기</button></div></Panel>
          <Panel title="품질 진단" description="오류는 저장·배포를 차단하고 경고는 품질 또는 성능 위험을 표시합니다."><div className="grid grid-cols-2 gap-2"><Metric label="필기감" value={analysis.metrics.handFeel} /><Metric label="재료" value={analysis.metrics.materialFidelity} /><Metric label="색" value={analysis.metrics.colorFidelity} /><Metric label="시간 물리" value={analysis.metrics.temporalFidelity} /><Metric label="개성" value={analysis.metrics.uniqueness} /><Metric label="성능" value={analysis.metrics.performance} /><Metric label="결정성" value={analysis.metrics.determinism} /></div><div className="mt-3 space-y-2">{analysis.issues.length ? analysis.issues.map((entry) => <Issue key={entry.id} issue={entry} />) : <p className="rounded-xl border border-accent/35 bg-accent/10 p-3 text-xs font-black text-accent">모든 품질 authority가 유효합니다.</p>}</div></Panel>
          <Panel title="활성 엔진" description={`${analysis.nodes.length}/${BRUSH_STUDIO_V6_NODES.length}개 타입 노드가 현재 프로그램을 구성합니다.`}><div className="flex flex-wrap gap-1.5">{analysis.nodes.map((node) => <span key={node.id} title={node.description} className="rounded-full border border-line bg-bg-2 px-2.5 py-1 text-[0.65rem] font-bold text-fg-2">{node.label}</span>)}</div></Panel>
        </aside>
      </div>
    </section>
  );
}
