import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioBrushV5Composer } from "./StudioBrushV5Composer";
import {
  BRUSH_QUALITY_CATALOG,
  BRUSH_QUALITY_PROVIDERS,
  analyzeBrushQualityPolicy,
  brushQualityCatalogGroups,
  createBrushQualityPolicy,
  normalizeBrushQualityPolicy,
  optimizeBrushQualityPolicy,
  toggleBrushQualityPhysics,
  toggleBrushQualityProvider,
  type BrushPhysicsId,
  type BrushQualityPolicy,
} from "./brush-studio-v5-quality";

const CARD = "rounded-2xl border border-line bg-card/55 p-4 shadow-sm";
const SUB = "rounded-xl border border-line bg-bg-2/45 p-3";
const INPUT = `min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg ${STUDIO_FOCUS_RING}`;
const BUTTON = `inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-fg hover:border-line-strong hover:bg-raised ${STUDIO_FOCUS_RING}`;
const PRIMARY = `inline-flex min-h-11 items-center justify-center rounded-xl border border-accent/40 bg-accent px-3 py-2 text-sm font-bold text-on-accent hover:opacity-90 ${STUDIO_FOCUS_RING}`;

type Tab = "compose" | "input" | "physics" | "pigment" | "pattern" | "engines" | "catalog";
type MaterialKey = keyof BrushQualityPolicy["material"];
type SimulationKey = Exclude<keyof BrushQualityPolicy["simulation"], "physics">;

const PHYSICS: readonly { id: BrushPhysicsId; label: string; detail: string }[] = [
  { id: "dry-contact", label: "건식 접촉", detail: "종이 이빨·마찰·마모·가루" },
  { id: "porous-paper", label: "다공성 종이", detail: "흡수·섬유·모세관 확산" },
  { id: "wet-flow", label: "Inkwash Wet Flow", detail: "수분·유속·이동/고정 안료" },
  { id: "thin-film", label: "Thin-film", detail: "중력 드립과 페인트 런" },
  { id: "bristle", label: "강모 역학", detail: "털 접촉·벌어짐·고갈" },
  { id: "pickup-reservoir", label: "Pickup Reservoir", detail: "아래색 픽업·촉 내부 색 기억" },
  { id: "particle-ballistics", label: "입자 탄도", detail: "중력·충돌·비말" },
  { id: "reaction-diffusion", label: "반응 확산", detail: "덴드라이트·녹·균열" },
  { id: "height-field", label: "높이 필드", detail: "임파스토·노멀·광택" },
];

const MATERIAL_CONTROLS: readonly { key: MaterialKey; label: string }[] = [
  { key: "surfaceTooth", label: "표면 이빨" }, { key: "friction", label: "마찰" },
  { key: "compression", label: "압축" }, { key: "absorbency", label: "흡수" },
  { key: "capillary", label: "모세관" }, { key: "fiberAnisotropy", label: "섬유 방향성" },
  { key: "deposit", label: "도포량" }, { key: "pickup", label: "픽업" },
  { key: "reactivation", label: "재활성" }, { key: "solvent", label: "용제" },
  { key: "granulation", label: "과립" }, { key: "edgeDarkening", label: "엣지 농축" },
  { key: "dryingRate", label: "건조 속도" }, { key: "viscosity", label: "점도" },
  { key: "plasticity", label: "소성" }, { key: "gloss", label: "광택" },
];

const SIMULATION_CONTROLS: readonly { key: SimulationKey; label: string; min: number; max: number; step: number }[] = [
  { key: "wetResolution", label: "Wet 해상도", min: 0.25, max: 1.5, step: 0.01 },
  { key: "pressureIterations", label: "압력 반복", min: 4, max: 40, step: 1 },
  { key: "diffusion", label: "확산", min: 0, max: 1, step: 0.01 },
  { key: "advection", label: "이류", min: 0, max: 1, step: 0.01 },
  { key: "evaporation", label: "증발", min: 0, max: 1, step: 0.01 },
  { key: "settleRate", label: "정착률", min: 0, max: 1, step: 0.01 },
  { key: "gravity", label: "중력", min: -1, max: 1, step: 0.01 },
  { key: "bristleStrands", label: "강모 수", min: 8, max: 256, step: 8 },
  { key: "bristleContactIterations", label: "강모 접촉 반복", min: 1, max: 12, step: 1 },
  { key: "reservoirCapacity", label: "Reservoir 용량", min: 0, max: 1, step: 0.01 },
  { key: "particleCount", label: "입자 수", min: 16, max: 4096, step: 16 },
];

function readPolicy(key: string): BrushQualityPolicy {
  try {
    const text = globalThis.localStorage?.getItem(key);
    return text ? normalizeBrushQualityPolicy(JSON.parse(text)) : createBrushQualityPolicy();
  } catch {
    return createBrushQualityPolicy();
  }
}

function downloadPolicy(policy: BrushQualityPolicy): void {
  const blob = new Blob([JSON.stringify({ kind: "toonspectrum.brush-quality-v1", policy }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "brush-quality-policy.json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

function Panel({ title, detail, children }: { readonly title: string; readonly detail: string; readonly children: ReactNode }) {
  return <section className={CARD}><h2 className="text-sm font-black text-fg">{title}</h2><p className="mt-1 text-xs leading-relaxed text-fg-3">{detail}</p><div className="mt-4">{children}</div></section>;
}

function Slider({ label, value, min = 0, max = 1, step = 0.01, onChange }: {
  readonly label: string; readonly value: number; readonly min?: number; readonly max?: number; readonly step?: number; readonly onChange: (value: number) => void;
}) {
  const id = `quality-${label.replace(/[^a-z0-9가-힣]+/giu, "-").toLowerCase()}`;
  return <label htmlFor={id} className={SUB}><span className="flex justify-between gap-2 text-xs font-semibold text-fg-2"><span>{label}</span><span className="tabular-nums text-fg">{value.toFixed(step < 0.1 ? 2 : 0)}</span></span><input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.valueAsNumber)} className="mt-2 min-h-8 w-full accent-accent" /></label>;
}

function Toggle({ label, detail, checked, onChange }: { readonly label: string; readonly detail: string; readonly checked: boolean; readonly onChange: () => void }) {
  return <button type="button" aria-pressed={checked} onClick={onChange} className={`${SUB} min-h-[76px] text-left ${checked ? "border-accent/55 bg-accent-soft" : "hover:border-line-strong"} ${STUDIO_FOCUS_RING}`}><span className="flex justify-between gap-2 text-sm font-bold text-fg"><span>{label}</span><span className="text-[0.62rem] text-accent">{checked ? "사용" : "꺼짐"}</span></span><span className="mt-1 block text-xs leading-relaxed text-fg-3">{detail}</span></button>;
}

function SelectField<T extends string>({ label, value, options, onChange }: { readonly label: string; readonly value: T; readonly options: readonly { id: T; label: string }[]; readonly onChange: (value: T) => void }) {
  return <label className="text-xs font-bold text-fg-2">{label}<select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value as T)} className={`${INPUT} mt-1.5`}>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return <div className={SUB}><div className="flex justify-between text-xs font-semibold text-fg-3"><span>{label}</span><span className="text-fg">{value}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} /></div></div>;
}

export function StudioBrushV5QualityWorkbench({ scope }: { readonly scope: string }) {
  const storageKey = `toonspectrum.brush-quality-v1:${encodeURIComponent(scope)}`;
  const [policy, setPolicy] = useState<BrushQualityPolicy>(() => readPolicy(storageKey));
  const [tab, setTab] = useState<Tab>("compose");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("전체");
  const [message, setMessage] = useState("고유한 질감은 유지하고 동등한 결과는 WebGPU 우승 경로로 압축합니다.");
  const importRef = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => analyzeBrushQualityPolicy(policy), [policy]);
  const groups = useMemo(() => ["전체", ...brushQualityCatalogGroups()], []);
  const catalog = useMemo(() => BRUSH_QUALITY_CATALOG.filter((entry) => {
    const search = query.trim().toLocaleLowerCase("ko-KR");
    return (group === "전체" || entry.group === group) && (!search || `${entry.name} ${entry.signature} ${entry.engine}`.toLocaleLowerCase("ko-KR").includes(search));
  }), [group, query]);

  useEffect(() => {
    try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(policy)); } catch { /* optional */ }
    globalThis.dispatchEvent?.(new CustomEvent("toonspectrum:brush-quality-policy", { detail: policy }));
  }, [policy, storageKey]);

  function replace(next: BrushQualityPolicy, status?: string) { setPolicy(normalizeBrushQualityPolicy(next)); if (status) setMessage(status); }
  function patch<K extends keyof BrushQualityPolicy>(key: K, value: BrushQualityPolicy[K]) { replace({ ...policy, [key]: value }); }
  function patchInput(value: Partial<BrushQualityPolicy["input"]>) { patch("input", { ...policy.input, ...value }); }
  function patchMaterial(key: MaterialKey, value: number) { patch("material", { ...policy.material, [key]: value }); }
  function patchSimulation(key: SimulationKey, value: number) { patch("simulation", { ...policy.simulation, [key]: value }); }

  async function importPolicy(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const source = parsed && typeof parsed === "object" && "policy" in parsed ? (parsed as { policy: unknown }).policy : parsed;
      replace(normalizeBrushQualityPolicy(source), `“${file.name}” 품질 정책을 가져왔습니다.`);
    } catch { setMessage("품질 정책 JSON을 읽을 수 없습니다."); }
  }

  const tabs: readonly { id: Tab; label: string }[] = [
    { id: "compose", label: "Composer" }, { id: "input", label: "Input·Device" }, { id: "physics", label: "Material·Physics" },
    { id: "pigment", label: "Pigment" }, { id: "pattern", label: "Pattern" }, { id: "engines", label: "Engine Compare" }, { id: "catalog", label: `브러시 ${BRUSH_QUALITY_CATALOG.length}` },
  ];

  return <section className="space-y-4">
    <div className={CARD}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">Quality Authority</p><h2 className="mt-1 text-lg font-black text-fg">브러시 품질·물성 컴파일러</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-3">입력 교정, 표면, 습식·강모·입자, 안료와 패턴, commit/export 품질을 독립 authority로 검증합니다.</p></div><div className="flex flex-wrap gap-2"><button type="button" className={PRIMARY} onClick={() => replace(optimizeBrushQualityPolicy(policy), "목표 품질에 맞춰 provider와 LOD를 최적화했습니다.")}>품질 최적화</button><button type="button" className={BUTTON} onClick={() => downloadPolicy(policy)}>내보내기</button><button type="button" className={BUTTON} onClick={() => importRef.current?.click()}>가져오기</button><input ref={importRef} type="file" accept="application/json,.json" className="sr-only" onChange={importPolicy} /></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-4"><SelectField label="품질 목표" value={policy.goal} options={[{ id: "responsive", label: "최저 지연" }, { id: "balanced", label: "균형" }, { id: "material", label: "재료 충실도" }, { id: "cinematic", label: "출력 품질" }]} onChange={(goal) => patch("goal", goal)} /><SelectField label="대상 장치" value={policy.device} options={[{ id: "desktop-pen", label: "데스크톱 펜" }, { id: "tablet-pen", label: "태블릿 펜" }, { id: "touch-hybrid", label: "펜+터치" }, { id: "mouse", label: "마우스" }]} onChange={(device) => patch("device", device)} /><div className={SUB}><p className="text-xs font-bold text-fg-2">실행 예산</p><p className="mt-1 text-sm font-black text-fg">{analysis.estimatedInputLatencyMs}ms 입력 · {analysis.estimatedFrameCostMs}ms 프레임</p></div><div className={SUB}><p className="text-xs font-bold text-fg-2">권리 closure</p><p className="mt-1 text-sm font-black text-fg">{analysis.rightsProfile}</p></div></div>
      <p role="status" className="mt-3 rounded-xl border border-line bg-bg-2/45 px-3 py-2 text-xs text-fg-2">{message}</p><div className="mt-4 flex gap-2 overflow-x-auto">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold ${tab === item.id ? "border-accent/55 bg-accent-soft" : "border-line bg-card text-fg-2"} ${STUDIO_FOCUS_RING}`}>{item.label}</button>)}</div></div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">{Object.entries(analysis.metrics).map(([key, value]) => <Metric key={key} label={key} value={value} />)}</div>
    {analysis.issues.length ? <div className="grid gap-2 md:grid-cols-2">{analysis.issues.map((entry) => <div key={entry.id} className={`${SUB} ${entry.severity === "error" ? "border-danger/45" : entry.severity === "warning" ? "border-warn/45" : ""}`}><p className={`text-sm font-bold ${entry.severity === "error" ? "text-danger" : entry.severity === "warning" ? "text-warn" : "text-fg"}`}>{entry.title}</p><p className="mt-1 text-xs text-fg-3">{entry.detail}</p>{entry.fix ? <p className="mt-1 text-xs font-semibold text-accent">해결: {entry.fix}</p> : null}</div>)}</div> : null}

    {tab === "compose" ? <StudioBrushV5Composer scope={scope} /> : null}
    {tab === "input" ? <div className="grid gap-4 xl:grid-cols-2"><Panel title="입력 전송·보조" detail="예측은 preview에만 사용하고 물리 상태에는 수락된 샘플만 전달합니다."><div className="grid gap-3 sm:grid-cols-2"><SelectField label="전송" value={policy.input.transport} options={[{ id: "raw-coalesced", label: "raw + coalesced" }, { id: "move-coalesced", label: "move + coalesced" }, { id: "move-basic", label: "기본 move" }]} onChange={(transport) => patchInput({ transport })} /><Toggle label="예측 프리뷰 전용" detail="수분·안료·히스토리 반영 차단" checked={policy.input.predictionPreviewOnly} onChange={() => patchInput({ predictionPreviewOnly: !policy.input.predictionPreviewOnly })} /><Toggle label="호버 촉" detail="압력·틸트·회전 예상 접촉면" checked={policy.input.hoverPreview} onChange={() => patchInput({ hoverPreview: !policy.input.hoverPreview })} /><Toggle label="팜 리젝션" detail="펜 권위 우선·터치 중재" checked={policy.input.palmRejection} onChange={() => patchInput({ palmRejection: !policy.input.palmRejection })} /><Toggle label="손가락 물붓" detail="Wet Flow에서 손가락을 물붓으로 사용" checked={policy.input.fingerWaterBrush} onChange={() => patchInput({ fingerWaterBrush: !policy.input.fingerWaterBrush })} /></div></Panel><Panel title="필압·틸트 교정" detail="장치 보정과 브러시 반응을 분리합니다."><div className="grid gap-2 sm:grid-cols-2"><Slider label="필압 onset" value={policy.input.pressureOnset} max={0.4} onChange={(pressureOnset) => patchInput({ pressureOnset })} /><Slider label="필압 saturation" value={policy.input.pressureSaturation} min={0.5} onChange={(pressureSaturation) => patchInput({ pressureSaturation })} /><Slider label="필압 gamma" value={policy.input.pressureGamma} min={0.2} max={3} onChange={(pressureGamma) => patchInput({ pressureGamma })} /><Slider label="히스테리시스" value={policy.input.pressureHysteresis} max={0.2} onChange={(pressureHysteresis) => patchInput({ pressureHysteresis })} /><Slider label="틸트 dead zone" value={policy.input.tiltDeadZoneDeg} max={20} step={1} onChange={(tiltDeadZoneDeg) => patchInput({ tiltDeadZoneDeg })} /><Slider label="틸트 smoothing" value={policy.input.tiltSmoothing} onChange={(tiltSmoothing) => patchInput({ tiltSmoothing })} /><Slider label="twist smoothing" value={policy.input.twistSmoothing} onChange={(twistSmoothing) => patchInput({ twistSmoothing })} /></div></Panel></div> : null}

    {tab === "physics" ? <div className="space-y-4"><Panel title="물리 authority" detail="Wet·Pickup·Pigment authority 충돌은 컴파일 단계에서 차단합니다."><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{PHYSICS.map((item) => <Toggle key={item.id} label={item.label} detail={item.detail} checked={policy.simulation.physics.includes(item.id)} onChange={() => replace(toggleBrushQualityPhysics(policy, item.id))} />)}</div></Panel><div className="grid gap-4 xl:grid-cols-2"><Panel title="표면·도포" detail="요철, 흡수, 픽업과 물감막을 독립적으로 조절합니다."><div className="grid gap-2 sm:grid-cols-2">{MATERIAL_CONTROLS.map((control) => <Slider key={control.key} label={control.label} value={policy.material[control.key]} onChange={(value) => patchMaterial(control.key, value)} />)}</div></Panel><Panel title="시뮬레이션 LOD" detail="라이브와 commit/export 품질을 분리합니다."><div className="grid gap-2 sm:grid-cols-2">{SIMULATION_CONTROLS.map((control) => <Slider key={control.key} label={control.label} value={policy.simulation[control.key]} min={control.min} max={control.max} step={control.step} onChange={(value) => patchSimulation(control.key, value)} />)}<Slider label="정착 frame 예산" value={policy.output.settleBudgetMs} min={1} max={12} step={0.5} onChange={(settleBudgetMs) => patch("output", { ...policy.output, settleBudgetMs })} /></div></Panel></div></div> : null}

    {tab === "pigment" ? <div className="grid gap-4 xl:grid-cols-2"><Panel title="안료 authority" detail="Spectral 기본, 측정 K/S·LUT 확장, Mixbox는 대체 불가능성 통과 후 사용합니다."><div className="grid gap-3 sm:grid-cols-2"><SelectField label="안료 provider" value={policy.pigment.provider} options={[{ id: "rgb", label: "RGB / OKLab" }, { id: "spectral", label: "Spectral WGSL" }, { id: "open-km", label: "Open K/S WGSL" }, { id: "pigment-painter", label: "pigment-painter LUT" }, { id: "mixbox", label: "Mixbox 조건부" }, { id: "inkwash-density", label: "Inkwash 밀도" }]} onChange={(provider) => patch("pigment", { ...policy.pigment, provider })} /><Toggle label="Mixbox 게이트 승인" detail="A/B 색 경로·선호·성능 영수증 필요" checked={policy.pigment.allowMixboxWhenDistinct} onChange={() => patch("pigment", { ...policy.pigment, allowMixboxWhenDistinct: !policy.pigment.allowMixboxWhenDistinct })} /></div></Panel><Panel title="광학·혼색" detail="두께·바탕·혼색 강도를 조절합니다."><div className="grid gap-2 sm:grid-cols-2"><Slider label="물감 두께" value={policy.pigment.thickness} min={0.02} onChange={(thickness) => patch("pigment", { ...policy.pigment, thickness })} /><Slider label="바탕 밝기" value={policy.pigment.substrateBrightness} onChange={(substrateBrightness) => patch("pigment", { ...policy.pigment, substrateBrightness })} /><Slider label="혼색 강도" value={policy.pigment.mixingStrength} onChange={(mixingStrength) => patch("pigment", { ...policy.pigment, mixingStrength })} /><Toggle label="래스터 영수증" detail="복합 GPU 결과를 commit 타일로 보존" checked={policy.output.rasterReceipt} onChange={() => patch("output", { ...policy.output, rasterReceipt: !policy.output.rasterReceipt })} /></div></Panel></div> : null}

    {tab === "pattern" ? <div className="grid gap-4 xl:grid-cols-2"><Panel title="패턴 문법·위상" detail="토폴로지와 좌표계가 다르면 독립 브러시로 유지합니다."><div className="grid gap-3 sm:grid-cols-2"><SelectField label="좌표계" value={policy.pattern.space} options={[{ id: "stroke", label: "Stroke" }, { id: "document", label: "Document locked" }, { id: "screen", label: "Screen" }, { id: "radial", label: "Radial" }, { id: "flow-field", label: "Flow field" }]} onChange={(space) => patch("pattern", { ...policy.pattern, space })} /><SelectField label="반복 문법" value={policy.pattern.grammar} options={["continuous", "grid", "brick", "along-path", "radial", "blue-noise", "flow-field", "l-system", "reaction-mask"].map((id) => ({ id: id as BrushQualityPolicy["pattern"]["grammar"], label: id }))} onChange={(grammar) => patch("pattern", { ...policy.pattern, grammar })} /><SelectField label="모티프" value={policy.pattern.motif} options={["none", "dot", "line", "hatch", "weave", "brick", "leaf", "stitch", "chain", "hair", "star", "glyph", "custom"].map((id) => ({ id: id as BrushQualityPolicy["pattern"]["motif"], label: id }))} onChange={(motif) => patch("pattern", { ...policy.pattern, motif })} /><Toggle label="결정적 배치" detail="시드·위상·내보내기 위치 고정" checked={policy.pattern.deterministic} onChange={() => patch("pattern", { ...policy.pattern, deterministic: !policy.pattern.deterministic })} /></div></Panel><Panel title="배치·반복 억제" detail="Blue-noise와 jitter로 타일링 흔적을 줄입니다."><div className="grid gap-2 sm:grid-cols-2">{(["density", "spacing", "rotationJitter", "scaleJitter", "collisionAvoidance"] as const).map((key) => <Slider key={key} label={key} value={policy.pattern[key]} min={key === "spacing" ? 0.02 : 0} max={key === "spacing" ? 4 : 1} onChange={(value) => patch("pattern", { ...policy.pattern, [key]: value })} />)}</div></Panel></div> : null}

    {tab === "engines" ? <div className="grid gap-4 xl:grid-cols-2"><Panel title="Provider 선택" detail="동등 결과는 WebGPU로 압축하고 고유 물성만 유지합니다."><div className="grid gap-2 sm:grid-cols-2">{BRUSH_QUALITY_PROVIDERS.map((provider) => <Toggle key={provider.id} label={provider.label} detail={`${provider.role} · ${provider.rights} · ${provider.status}`} checked={policy.providers.includes(provider.id)} onChange={() => replace(toggleBrushQualityProvider(policy, provider.id))} />)}</div></Panel><div className="space-y-4"><Panel title="A/B 후보 순위" detail="지연·충실도·결정성·메모리 가중 순위입니다."><div className="space-y-2">{analysis.providers.slice(0, 12).map((candidate, index) => <div key={candidate.id} className={SUB}><div className="flex justify-between gap-2"><span className="text-sm font-bold text-fg">{index + 1}. {candidate.label}</span><span className="text-xs font-black text-accent">{candidate.score}</span></div><p className="mt-1 text-xs text-fg-3">{candidate.reason}{candidate.selected ? " · 선택됨" : ""}</p></div>)}</div></Panel><Panel title="컴파일 실행 계획" detail="hover·prediction은 비권위, live·settle·commit은 canonical입니다."><div className="space-y-2">{analysis.executionPlan.map((pass, index) => <div key={`${pass.phase}-${pass.provider}-${index}`} className={SUB}><div className="flex justify-between gap-2 text-xs"><span className="font-black uppercase text-accent">{pass.phase} · {pass.domain}</span><span className="text-fg-3">{pass.budgetMs.toFixed(2)}ms</span></div><p className="mt-1 text-sm font-bold text-fg">{pass.label}</p><p className="mt-1 text-xs text-fg-3">{pass.provider} · {pass.canonical ? "canonical" : "preview-only"}</p></div>)}</div></Panel></div></div> : null}

    {tab === "catalog" ? <Panel title="품질 기준 기본 브러시 72종" detail="질감·물리·패턴·색 경로가 분명한 렌디션은 보존합니다."><div className="grid gap-3 md:grid-cols-[1fr_240px]"><input className={INPUT} value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)} placeholder="브러시·질감·엔진 검색" /><select className={INPUT} value={group} onChange={(event: ChangeEvent<HTMLSelectElement>) => setGroup(event.currentTarget.value)}>{groups.map((item) => <option key={item}>{item}</option>)}</select></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{catalog.map((entry) => <article key={entry.id} className={`${SUB} ${entry.quick ? "border-accent/35" : ""}`}><div className="flex justify-between gap-2"><h3 className="text-sm font-black text-fg">{entry.name}</h3>{entry.quick ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.6rem] font-bold text-accent">빠른</span> : null}</div><p className="mt-1 text-xs text-fg-3">{entry.signature}</p><p className="mt-2 text-[0.64rem] font-bold text-accent">{entry.engine}</p><p className="mt-1 text-[0.62rem] text-fg-3">{entry.group}</p></article>)}</div></Panel> : null}
  </section>;
}
