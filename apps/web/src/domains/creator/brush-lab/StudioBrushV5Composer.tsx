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
  BRUSH_STUDIO_V5_FINISHES,
  BRUSH_STUDIO_V5_GEOMETRIES,
  BRUSH_STUDIO_V5_MATERIALS,
  BRUSH_STUDIO_V5_MOTIONS,
  BRUSH_STUDIO_V5_PATTERNS,
  BRUSH_STUDIO_V5_PHYSICS,
  BRUSH_STUDIO_V5_PIGMENTS,
  BRUSH_STUDIO_V5_RECIPES,
  BRUSH_STUDIO_V5_STROKE_ENGINES,
  BRUSH_STUDIO_V5_SURFACES,
  BRUSH_STUDIO_V5_TIPS,
  analyzeBrushStudioV5Draft,
  applyBrushStudioV5Recipe,
  brushStudioV5OptionLabel,
  createDefaultBrushStudioV5Draft,
  normalizeBrushStudioV5Draft,
  optimizeBrushStudioV5Draft,
  parseBrushStudioV5Draft,
  randomizeBrushStudioV5Draft,
  toggleBrushStudioV5Finish,
  toggleBrushStudioV5Physics,
  type BrushStudioV5Draft,
  type BrushStudioV5DwellTarget,
  type BrushStudioV5FinishId,
  type BrushStudioV5Option,
  type BrushStudioV5PhysicsId,
  type BrushStudioV5PressureTarget,
  type BrushStudioV5SpeedTarget,
  type BrushStudioV5TiltTarget,
} from "./brush-studio-v5-model";
import { renderBrushStudioV5Preview } from "./brush-studio-v5-preview";

const CARD = "rounded-2xl border border-line bg-card/55 p-4 shadow-sm";
const INPUT = `min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg ${STUDIO_FOCUS_RING}`;
const BUTTON = `inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 ${STUDIO_FOCUS_RING}`;
const PRIMARY_BUTTON = `inline-flex min-h-11 items-center justify-center rounded-xl border border-accent/45 bg-accent px-3 py-2 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 ${STUDIO_FOCUS_RING}`;
const LIBRARY_KEY = "toonspectrum.brush-studio-v5.library";
const DRAFT_KEY_PREFIX = "toonspectrum.brush-studio-v5.draft:";

interface StoredBrushStudioV5Program {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly program: BrushStudioV5Draft;
}

interface CapabilitySnapshot {
  readonly pointerEvents: boolean;
  readonly coalescedEvents: boolean;
  readonly predictedEvents: boolean;
  readonly pointerRawUpdate: boolean;
  readonly webgpu: boolean;
}

function makeId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `brush-v5-${Date.now().toString(36)}`;
  } catch {
    return `brush-v5-${Date.now().toString(36)}`;
  }
}

function readDraft(key: string): BrushStudioV5Draft {
  try {
    const text = globalThis.localStorage?.getItem(key);
    return text ? parseBrushStudioV5Draft(text) : createDefaultBrushStudioV5Draft();
  } catch {
    return createDefaultBrushStudioV5Draft();
  }
}

function readLibrary(): readonly StoredBrushStudioV5Program[] {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(LIBRARY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return Object.freeze([]);
    return Object.freeze(
      parsed
        .filter((entry): entry is { id?: unknown; name?: unknown; updatedAt?: unknown; program?: unknown } => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          id: typeof entry.id === "string" ? entry.id : makeId(),
          name: typeof entry.name === "string" ? entry.name : "이름 없는 브러시",
          updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString(),
          program: normalizeBrushStudioV5Draft(entry.program),
        }))
        .slice(0, 40),
    );
  } catch {
    return Object.freeze([]);
  }
}

function writeLibrary(entries: readonly StoredBrushStudioV5Program[]): void {
  try {
    globalThis.localStorage?.setItem(LIBRARY_KEY, JSON.stringify(entries.slice(0, 40)));
  } catch {
    // Local persistence is optional. JSON export remains available.
  }
}

function downloadJson(program: BrushStudioV5Draft): void {
  const text = JSON.stringify({
    kind: "toonspectrum.brush-studio-v5",
    exportedAt: new Date().toISOString(),
    program,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${program.name.replace(/[^a-z0-9가-힣_-]+/giu, "-") || "brush"}.brush-v5.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

function SectionCard({ title, description, children, defaultOpen = false }: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen || undefined} className={CARD}>
      <summary className={`cursor-pointer list-none rounded-xl ${STUDIO_FOCUS_RING}`}>
        <h2 className="text-sm font-bold text-fg">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">{description}</p>
      </summary>
      <div className="mt-4 border-t border-line/60 pt-4">{children}</div>
    </details>
  );
}

function ChoiceGrid<Id extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly BrushStudioV5Option<Id>[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            type="button"
            key={option.id}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`min-h-[92px] rounded-xl border p-3 text-left transition-colors ${STUDIO_FOCUS_RING} ${
              active
                ? "border-accent/60 bg-accent-soft text-fg"
                : "border-line bg-bg-2/45 text-fg-2 hover:border-line-strong hover:bg-raised"
            }`}
          >
            <span className="block text-sm font-bold">{option.label}</span>
            <span className="mt-1 block text-[0.65rem] font-semibold text-accent">{option.provider}</span>
            <span className="mt-1.5 block text-xs leading-relaxed text-fg-3">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function MultiChoiceGrid<Id extends string>({
  options,
  selected,
  onToggle,
}: {
  options: readonly BrushStudioV5Option<Id>[];
  selected: readonly Id[];
  onToggle: (id: Id) => void;
}) {
  const activeIds = new Set(selected);
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {options.map((option) => {
        const active = activeIds.has(option.id);
        return (
          <button
            type="button"
            key={option.id}
            aria-pressed={active}
            onClick={() => onToggle(option.id)}
            className={`min-h-[96px] rounded-xl border p-3 text-left transition-colors ${STUDIO_FOCUS_RING} ${
              active
                ? "border-accent/60 bg-accent-soft text-fg"
                : "border-line bg-bg-2/45 text-fg-2 hover:border-line-strong hover:bg-raised"
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">{option.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold ${active ? "bg-accent text-on-accent" : "bg-raised text-fg-3"}`}>
                {active ? "사용" : `비용 ${option.cost}`}
              </span>
            </span>
            <span className="mt-1 block text-[0.65rem] font-semibold text-accent">{option.provider}</span>
            <span className="mt-1.5 block text-xs leading-relaxed text-fg-3">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-bg-2/55 p-3">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-fg-3">
        <span>{label}</span><span className="tabular-nums text-fg">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Slider({ label, value, minimum, maximum, step, display, onChange }: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  display?: string;
  onChange: (value: number) => void;
}) {
  const inputId = `brush-v5-slider-${label.replace(/[^a-z0-9가-힣]+/giu, "-").toLowerCase()}`;
  return (
    <div className="block rounded-xl border border-line bg-bg-2/45 p-3 text-xs font-semibold text-fg-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId}>{label}</label>
        <span className="tabular-nums text-fg-3">{display ?? value.toFixed(2)}</span>
      </div>
      <input
        id={inputId}
        aria-label={label}
        className="mt-2 min-h-8 w-full accent-accent"
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}

function capabilitySnapshot(): CapabilitySnapshot {
  if (typeof window === "undefined") {
    return { pointerEvents: false, coalescedEvents: false, predictedEvents: false, pointerRawUpdate: false, webgpu: false };
  }
  const pointerPrototype = typeof PointerEvent === "undefined" ? null : PointerEvent.prototype as PointerEvent & {
    getCoalescedEvents?: unknown;
    getPredictedEvents?: unknown;
  };
  const navigatorWithGpu = navigator as Navigator & { gpu?: unknown };
  return {
    pointerEvents: typeof PointerEvent !== "undefined",
    coalescedEvents: typeof pointerPrototype?.getCoalescedEvents === "function",
    predictedEvents: typeof pointerPrototype?.getPredictedEvents === "function",
    pointerRawUpdate: "onpointerrawupdate" in window,
    webgpu: Boolean(navigatorWithGpu.gpu),
  };
}

export function StudioBrushV5Composer({ scope }: { scope: string }) {
  const draftKey = `${DRAFT_KEY_PREFIX}${encodeURIComponent(scope)}`;
  const [draft, setDraft] = useState<BrushStudioV5Draft>(() => readDraft(draftKey));
  const [library, setLibrary] = useState<readonly StoredBrushStudioV5Program[]>(() => readLibrary());
  const [settleProgress, setSettleProgress] = useState(0.65);
  const [message, setMessage] = useState("엔진과 물리를 선택하면 조합 충돌과 예상 비용을 즉시 진단합니다.");
  const [importError, setImportError] = useState("");
  const [capabilities, setCapabilities] = useState<CapabilitySnapshot>(() => capabilitySnapshot());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => analyzeBrushStudioV5Draft(draft), [draft]);

  useEffect(() => {
    setCapabilities(capabilitySnapshot());
  }, []);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Session remains usable without persistence.
    }
  }, [draft, draftKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const render = () => renderBrushStudioV5Preview(canvas, draft, { settleProgress });
    render();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", render);
      return () => window.removeEventListener("resize", render);
    }
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draft, settleProgress]);

  function replace(next: BrushStudioV5Draft, status?: string) {
    setDraft(normalizeBrushStudioV5Draft(next));
    if (status) setMessage(status);
    setImportError("");
  }

  function patch<K extends keyof BrushStudioV5Draft>(key: K, value: BrushStudioV5Draft[K]) {
    setDraft((current) => normalizeBrushStudioV5Draft({ ...current, [key]: value }));
  }

  function patchTuning<K extends keyof BrushStudioV5Draft["tuning"]>(key: K, value: BrushStudioV5Draft["tuning"][K]) {
    setDraft((current) => normalizeBrushStudioV5Draft({ ...current, tuning: { ...current.tuning, [key]: value } }));
  }

  function patchSensor<K extends keyof BrushStudioV5Draft["sensorMapping"]>(key: K, value: BrushStudioV5Draft["sensorMapping"][K]) {
    setDraft((current) => normalizeBrushStudioV5Draft({ ...current, sensorMapping: { ...current.sensorMapping, [key]: value } }));
  }

  function saveToLibrary() {
    const now = new Date().toISOString();
    const entry: StoredBrushStudioV5Program = { id: draft.id, name: draft.name, updatedAt: now, program: draft };
    const next = [entry, ...library.filter((candidate) => candidate.id !== draft.id)].slice(0, 40);
    setLibrary(next);
    writeLibrary(next);
    setMessage(`"${draft.name}" 브러시 프로그램을 내 V5 라이브러리에 저장했습니다.`);
  }

  function duplicateProgram() {
    replace({ ...draft, id: makeId(), name: `${draft.name} 복사본`, seed: (draft.seed + 1) >>> 0 }, "새 ID로 복제했습니다.");
  }

  function deleteProgram(id: string) {
    const next = library.filter((candidate) => candidate.id !== id);
    setLibrary(next);
    writeLibrary(next);
  }

  async function importProgram(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("브러시 파일은 2MiB 이하만 가져올 수 있습니다.");
      replace(parseBrushStudioV5Draft(await file.text()), `"${file.name}"에서 V5 브러시 프로그램을 가져왔습니다.`);
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : "브러시 파일을 읽지 못했습니다.");
    }
  }

  return (
    <div className="space-y-5">
      <section className={`${CARD} overflow-hidden`} aria-labelledby="brush-v5-preview-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-accent">Brush Studio V5</p>
            <h2 id="brush-v5-preview-heading" className="mt-1 text-xl font-black text-fg">{draft.name}</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-3">실제 엔진 선택 계획과 물성 조합을 저장하는 새 브러시 프로그램입니다. 아래 캔버스는 조합을 빠르게 비교하기 위한 결정적 미리보기이며, provider 런타임의 최종 픽셀은 Engine Compare에서 검증합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} onClick={() => replace(randomizeBrushStudioV5Draft(draft), "시드 기반으로 개성 있는 조합을 생성했습니다.")}>개성 랜덤 생성</button>
            <button type="button" className={BUTTON} onClick={() => replace(optimizeBrushStudioV5Draft(draft), "동일 질감에서는 WebGPU를 우선하도록 실행 계획을 최적화했습니다.")}>성능 자동 최적화</button>
          </div>
        </div>

        <canvas ref={canvasRef} className="mt-4 h-[360px] w-full rounded-2xl border border-line bg-canvas" aria-label="현재 브러시 조합 미리보기" />
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-xl border border-line bg-bg-2/45 p-3 text-xs font-semibold text-fg-2">
            <div className="flex items-center justify-between">
              <label htmlFor="brush-v5-settle-progress">물리 정착 시간</label>
              <span className="tabular-nums text-fg-3">{Math.round(settleProgress * 100)}%</span>
            </div>
            <input
              id="brush-v5-settle-progress"
              aria-label="물리 정착 시간"
              className="mt-2 min-h-8 w-full accent-accent"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settleProgress}
              onChange={(event) => setSettleProgress(event.currentTarget.valueAsNumber)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[0.65rem] font-semibold">
            <span className={`rounded-xl border px-3 py-2 ${capabilities.webgpu ? "border-good/40 bg-good/5 text-good" : "border-warn/35 bg-warn/5 text-warn"}`}>WebGPU {capabilities.webgpu ? "지원" : "미지원"}</span>
            <span className="rounded-xl border border-line bg-bg-2/45 px-3 py-2 text-fg-3">Raw {capabilities.pointerRawUpdate ? "지원" : "대체"}</span>
            <span className="rounded-xl border border-line bg-bg-2/45 px-3 py-2 text-fg-3">Coalesced {capabilities.coalescedEvents ? "지원" : "대체"}</span>
            <span className="rounded-xl border border-line bg-bg-2/45 px-3 py-2 text-fg-3">Prediction {capabilities.predictedEvents ? "지원" : "대체"}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <SectionCard title="시그니처 레시피" description="서로 다른 엔진과 물리 시스템을 실제로 구분되는 조합으로 시작합니다." defaultOpen>
            <div className="grid gap-2 md:grid-cols-2">
              {BRUSH_STUDIO_V5_RECIPES.map((recipe) => (
                <button key={recipe.id} type="button" className={`rounded-xl border border-line bg-bg-2/45 p-3 text-left hover:border-accent/45 hover:bg-accent-soft/35 ${STUDIO_FOCUS_RING}`} onClick={() => replace(applyBrushStudioV5Recipe(draft, recipe.id), `"${recipe.name}" 레시피를 적용했습니다.`)}>
                  <span className="text-sm font-bold text-fg">{recipe.name}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-fg-3">{recipe.description}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="01 · 필기감" description="포인터를 따라오는 감각과 안정화 방식을 선택합니다." defaultOpen>
            <ChoiceGrid options={BRUSH_STUDIO_V5_MOTIONS} value={draft.motionId} onChange={(motionId) => patch("motionId", motionId)} />
          </SectionCard>
          <SectionCard title="02 · 주 스트로크 엔진" description="획의 캐리어와 기본 픽셀 권위를 선택합니다. 고유 질감이 없으면 Native WebGPU가 우선입니다." defaultOpen>
            <ChoiceGrid options={BRUSH_STUDIO_V5_STROKE_ENGINES} value={draft.strokeEngineId} onChange={(strokeEngineId) => patch("strokeEngineId", strokeEngineId)} />
          </SectionCard>
          <SectionCard title="03 · 기하와 촉" description="획 토폴로지와 실제 접촉 자국을 독립적으로 조합합니다.">
            <h3 className="mb-2 text-xs font-bold text-fg-2">획 기하</h3>
            <ChoiceGrid options={BRUSH_STUDIO_V5_GEOMETRIES} value={draft.geometryId} onChange={(geometryId) => patch("geometryId", geometryId)} />
            <h3 className="mb-2 mt-5 text-xs font-bold text-fg-2">촉</h3>
            <ChoiceGrid options={BRUSH_STUDIO_V5_TIPS} value={draft.tipId} onChange={(tipId) => patch("tipId", tipId)} />
          </SectionCard>
          <SectionCard title="04 · 표면과 재료" description="종이·캔버스·필름과 그 위에 쌓이는 매체를 선택합니다.">
            <h3 className="mb-2 text-xs font-bold text-fg-2">표면</h3>
            <ChoiceGrid options={BRUSH_STUDIO_V5_SURFACES} value={draft.surfaceId} onChange={(surfaceId) => patch("surfaceId", surfaceId)} />
            <h3 className="mb-2 mt-5 text-xs font-bold text-fg-2">재료</h3>
            <ChoiceGrid options={BRUSH_STUDIO_V5_MATERIALS} value={draft.materialId} onChange={(materialId) => patch("materialId", materialId)} />
          </SectionCard>
          <SectionCard title="05 · 안료 엔진" description="일반 색상부터 Spectral·Open K/S·Pigment LUT·Mixbox·Inkwash 광학 밀도까지 선택합니다.">
            <ChoiceGrid options={BRUSH_STUDIO_V5_PIGMENTS} value={draft.pigmentId} onChange={(pigmentId) => patch("pigmentId", pigmentId)} />
          </SectionCard>
          <SectionCard title="06 · 물리 엔진" description="건식 접촉, 흡수, 유체, 드립, 강모, 스머지, reservoir, 입자, 반응 확산, 높이를 복수 선택합니다." defaultOpen>
            <MultiChoiceGrid options={BRUSH_STUDIO_V5_PHYSICS} selected={draft.physicsIds} onToggle={(id: BrushStudioV5PhysicsId) => replace(toggleBrushStudioV5Physics(draft, id))} />
          </SectionCard>
          <SectionCard title="07 · 패턴과 문양" description="반복 문법과 좌표계가 확실히 다른 패턴은 독립된 브러시 정체성으로 유지합니다.">
            <ChoiceGrid options={BRUSH_STUDIO_V5_PATTERNS} value={draft.patternId} onChange={(patternId) => patch("patternId", patternId)} />
          </SectionCard>
          <SectionCard title="08 · 마감" description="물리 결과 위에 엣지, 광택, 릴리프, 발광, 그레인과 색분리를 복수 적용합니다.">
            <MultiChoiceGrid options={BRUSH_STUDIO_V5_FINISHES} selected={draft.finishIds} onToggle={(id: BrushStudioV5FinishId) => replace(toggleBrushStudioV5Finish(draft, id))} />
          </SectionCard>
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label="브러시 프로그램 진단과 저장">
          <section className={CARD}>
            <h2 className="text-base font-bold text-fg">프로그램</h2>
            <label className="mt-3 block text-xs font-semibold text-fg-2">이름<input className={`${INPUT} mt-2`} maxLength={120} value={draft.name} onChange={(event) => patch("name", event.currentTarget.value)} /></label>
            <label className="mt-3 block text-xs font-semibold text-fg-2">재현 시드<input className={`${INPUT} mt-2`} type="number" min={0} max={4294967295} step={1} value={draft.seed} onChange={(event) => patch("seed", Math.max(0, Math.min(0xffff_ffff, event.currentTarget.valueAsNumber || 0)))} /></label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-fg-2">주 색상<input type="color" className="mt-2 h-11 w-full rounded-xl border border-line bg-card p-1" value={draft.primaryColor} onChange={(event) => patch("primaryColor", event.currentTarget.value)} /></label>
              <label className="text-xs font-semibold text-fg-2">보조 색상<input type="color" className="mt-2 h-11 w-full rounded-xl border border-line bg-card p-1" value={draft.secondaryColor} onChange={(event) => patch("secondaryColor", event.currentTarget.value)} /></label>
            </div>
            <fieldset className="mt-4"><legend className="text-xs font-bold text-fg-2">품질</legend><div className="mt-2 grid grid-cols-3 gap-1">{(["draft", "balanced", "pro"] as const).map((quality) => <button key={quality} type="button" aria-pressed={draft.quality === quality} onClick={() => patch("quality", quality)} className={`min-h-10 rounded-lg border px-2 text-xs font-semibold ${STUDIO_FOCUS_RING} ${draft.quality === quality ? "border-accent bg-accent-soft text-fg" : "border-line bg-bg-2/45 text-fg-3"}`}>{quality}</button>)}</div></fieldset>
          </section>

          <section className={CARD}>
            <h2 className="text-base font-bold text-fg">물성 튜닝</h2>
            <div className="mt-3 space-y-2">
              <Slider label="크기" value={draft.tuning.size} minimum={1} maximum={160} step={1} display={`${Math.round(draft.tuning.size)} px`} onChange={(value) => patchTuning("size", value)} />
              <Slider label="유량" value={draft.tuning.flow} minimum={0.02} maximum={1} step={0.01} onChange={(value) => patchTuning("flow", value)} />
              <Slider label="그레인" value={draft.tuning.grain} minimum={0} maximum={1} step={0.01} onChange={(value) => patchTuning("grain", value)} />
              <Slider label="수분" value={draft.tuning.wetness} minimum={0} maximum={1} step={0.01} onChange={(value) => patchTuning("wetness", value)} />
              <Slider label="점도" value={draft.tuning.viscosity} minimum={0} maximum={1} step={0.01} onChange={(value) => patchTuning("viscosity", value)} />
              <Slider label="산포" value={draft.tuning.scatter} minimum={0} maximum={1} step={0.01} onChange={(value) => patchTuning("scatter", value)} />
              <Slider label="릴리프" value={draft.tuning.relief} minimum={0} maximum={1} step={0.01} onChange={(value) => patchTuning("relief", value)} />
              <Slider label="패턴 크기" value={draft.tuning.patternScale} minimum={0.25} maximum={4} step={0.05} display={`${draft.tuning.patternScale.toFixed(2)}×`} onChange={(value) => patchTuning("patternScale", value)} />
              <Slider label="안정화" value={draft.tuning.stabilization} minimum={0} maximum={1} step={0.01} onChange={(value) => patchTuning("stabilization", value)} />
            </div>
          </section>

          <section className={CARD}>
            <h2 className="text-base font-bold text-fg">센서 매핑</h2>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-semibold text-fg-2">필압<select className={`${INPUT} mt-2`} value={draft.sensorMapping.pressure} onChange={(event) => patchSensor("pressure", event.currentTarget.value as BrushStudioV5PressureTarget)}><option value="size">크기</option><option value="opacity">불투명도</option><option value="flow">유량</option><option value="pigment-load">안료 적재량</option><option value="wetness">수분량</option></select></label>
              <label className="block text-xs font-semibold text-fg-2">틸트·회전<select className={`${INPUT} mt-2`} value={draft.sensorMapping.tilt} onChange={(event) => patchSensor("tilt", event.currentTarget.value as BrushStudioV5TiltTarget)}><option value="none">사용 안 함</option><option value="contact-width">접촉 폭</option><option value="tip-angle">촉 각도</option><option value="bristle-spread">강모 벌어짐</option><option value="pattern-rotation">패턴 회전</option></select></label>
              <label className="block text-xs font-semibold text-fg-2">속도<select className={`${INPUT} mt-2`} value={draft.sensorMapping.speed} onChange={(event) => patchSensor("speed", event.currentTarget.value as BrushStudioV5SpeedTarget)}><option value="none">사용 안 함</option><option value="opacity">불투명도</option><option value="spacing">간격</option><option value="dryness">건조도</option><option value="particle-tail">입자 꼬리</option></select></label>
              <label className="block text-xs font-semibold text-fg-2">정지 시간<select className={`${INPUT} mt-2`} value={draft.sensorMapping.dwell} onChange={(event) => patchSensor("dwell", event.currentTarget.value as BrushStudioV5DwellTarget)}><option value="none">사용 안 함</option><option value="pooling">잉크·물 고임</option><option value="height">물감 높이</option><option value="emission">입자 방출</option><option value="reaction-growth">반응 성장</option></select></label>
            </div>
          </section>

          <section className={CARD}>
            <div className="flex items-center justify-between gap-2"><h2 className="text-base font-bold text-fg">조합 진단</h2><span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-bold ${analysis.valid ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>{analysis.valid ? "실행 가능" : "수정 필요"}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ScoreCard label="성능" value={analysis.performanceScore} />
              <ScoreCard label="사실성" value={analysis.realismScore} />
              <ScoreCard label="개성" value={analysis.uniquenessScore} />
              <ScoreCard label="복잡도" value={analysis.complexityScore} />
            </div>
            {analysis.issues.length ? <ul className="mt-3 space-y-2">{analysis.issues.map((issue) => <li key={issue.id} className={`rounded-xl border p-3 text-xs leading-relaxed ${issue.severity === "error" ? "border-warn/50 bg-warn/5 text-warn" : issue.severity === "warning" ? "border-line-strong bg-raised/55 text-fg-2" : "border-line bg-bg-2/45 text-fg-3"}`}><strong className="block text-fg">{issue.title}</strong>{issue.description}</li>)}</ul> : <p className="mt-3 rounded-xl border border-good/35 bg-good/5 p-3 text-xs font-semibold text-good">현재 조합에서 즉시 차단할 충돌이 없습니다.</p>}
          </section>

          <section className={CARD}>
            <h2 className="text-base font-bold text-fg">실행 스택 · {analysis.selectedModuleCount} 모듈</h2>
            <ol className="mt-3 space-y-1.5">{analysis.executionPlan.map((entry, index) => <li key={`${entry}-${index}`} className="flex gap-2 rounded-lg border border-line bg-bg-2/45 px-3 py-2 text-xs text-fg-2"><span className="font-bold tabular-nums text-accent">{String(index + 1).padStart(2, "0")}</span><span>{entry}</span></li>)}</ol>
          </section>

          <section className={CARD}>
            <h2 className="text-base font-bold text-fg">저장·공유</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">현재 V5 프로그램은 브라우저 로컬 라이브러리와 독립 JSON에 저장됩니다.</p>
            <div className="mt-3 grid gap-2"><button type="button" className={PRIMARY_BUTTON} disabled={!analysis.valid} onClick={saveToLibrary}>내 V5 브러시에 저장</button><button type="button" className={BUTTON} onClick={duplicateProgram}>새 ID로 복제</button><button type="button" className={BUTTON} onClick={() => downloadJson(draft)}>JSON 내보내기</button><button type="button" className={BUTTON} onClick={() => importRef.current?.click()}>JSON 가져오기</button><button type="button" className={BUTTON} onClick={() => replace(createDefaultBrushStudioV5Draft(), "새 기본 브러시로 초기화했습니다.")}>새로 만들기</button></div>
            <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void importProgram(event)} />
            {importError ? <p role="alert" className="mt-2 text-xs text-warn">{importError}</p> : null}
            <p className="mt-3 rounded-xl border border-line bg-bg-2/45 p-3 text-xs leading-relaxed text-fg-3" aria-live="polite">{message}</p>
          </section>

          {library.length ? <section className={CARD}><h2 className="text-base font-bold text-fg">내 V5 브러시 · {library.length}</h2><ul className="mt-3 space-y-2">{library.map((entry) => <li key={entry.id} className="rounded-xl border border-line bg-bg-2/45 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><strong className="block truncate text-sm text-fg">{entry.name}</strong><span className="mt-0.5 block text-[0.62rem] text-fg-3">{new Date(entry.updatedAt).toLocaleString()}</span></div><button type="button" className={`min-h-9 rounded-lg border border-line px-2 text-xs text-fg-3 hover:text-warn ${STUDIO_FOCUS_RING}`} onClick={() => deleteProgram(entry.id)}>삭제</button></div><button type="button" className={`${BUTTON} mt-2 w-full`} onClick={() => replace(entry.program, `"${entry.name}"을 불러왔습니다.`)}>불러오기</button></li>)}</ul></section> : null}

          <section className={CARD}>
            <h2 className="text-sm font-bold text-fg">현재 선택 요약</h2>
            <p className="mt-2 text-xs leading-relaxed text-fg-3">
              {brushStudioV5OptionLabel("engine", draft.strokeEngineId)} · {brushStudioV5OptionLabel("geometry", draft.geometryId)} · {brushStudioV5OptionLabel("material", draft.materialId)} · {brushStudioV5OptionLabel("pigment", draft.pigmentId)} · {brushStudioV5OptionLabel("pattern", draft.patternId)}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
