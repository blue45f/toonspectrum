import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioBrushQualityTestSheet } from "./StudioBrushQualityTestSheet";
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
  { id: "dry-contact", label: "ê±´ì‹ ì ‘ì´‰", detail: "ì¢…ì´ ì´ë¹¨Â·ë§ˆì°°Â·ë§ˆëª¨Â·ê°€ë£¨" },
  { id: "porous-paper", label: "ë‹¤ê³µì„± ì¢…ì´", detail: "í¡ìˆ˜Â·ì„¬ìœ Â·ëª¨ì„¸ê´€ í™•ì‚°" },
  { id: "wet-flow", label: "Inkwash Wet Flow", detail: "ìˆ˜ë¶„Â·ìœ ì†Â·ì´ë™/ê³ ì • ì•ˆë£Œ" },
  { id: "thin-film", label: "Thin-film", detail: "ì¤‘ë ¥ ë“œë¦½ê³¼ í˜ì¸íŠ¸ ëŸ°" },
  { id: "bristle", label: "ê°•ëª¨ ì—­í•™", detail: "í„¸ ì ‘ì´‰Â·ë²Œì–´ì§Â·ê³ ê°ˆ" },
  { id: "pickup-reservoir", label: "Pickup Reservoir", detail: "ì•„ë˜ìƒ‰ í”½ì—…Â·ì´‰ ë‚´ë¶€ ìƒ‰ ê¸°ì–µ" },
  { id: "particle-ballistics", label: "ì…ì íƒ„ë„", detail: "ì¤‘ë ¥Â·ì¶©ëŒÂ·ë¹„ë§" },
  { id: "reaction-diffusion", label: "ë°˜ì‘ í™•ì‚°", detail: "ë´ë“œë¼ì´íŠ¸Â·ë…¹Â·ê· ì—´" },
  { id: "height-field", label: "ë†’ì´ í•„ë“œ", detail: "ì„íŒŒìŠ¤í† Â·ë…¸ë©€Â·ê´‘íƒ" },
];

const MATERIAL_CONTROLS: readonly { key: MaterialKey; label: string }[] = [
  { key: "surfaceTooth", label: "í‘œë©´ ì´ë¹¨" }, { key: "friction", label: "ë§ˆì°°" },
  { key: "compression", label: "ì••ì¶•" }, { key: "absorbency", label: "í¡ìˆ˜" },
  { key: "capillary", label: "ëª¨ì„¸ê´€" }, { key: "fiberAnisotropy", label: "ì„¬ìœ  ë°©í–¥ì„±" },
  { key: "deposit", label: "ë„í¬ëŸ‰" }, { key: "pickup", label: "í”½ì—…" },
  { key: "reactivation", label: "ì¬í™œì„±" }, { key: "solvent", label: "ìš©ì œ" },
  { key: "granulation", label: "ê³¼ë¦½" }, { key: "edgeDarkening", label: "ì—£ì§€ ë†ì¶•" },
  { key: "dryingRate", label: "ê±´ì¡° ì†ë„" }, { key: "viscosity", label: "ì ë„" },
  { key: "plasticity", label: "ì†Œì„±" }, { key: "gloss", label: "ê´‘íƒ" },
];

const SIMULATION_CONTROLS: readonly { key: SimulationKey; label: string; min: number; max: number; step: number }[] = [
  { key: "wetResolution", label: "Wet í•´ìƒë„", min: 0.25, max: 1.5, step: 0.01 },
  { key: "pressureIterations", label: "ì••ë ¥ ë°˜ë³µ", min: 4, max: 40, step: 1 },
  { key: "diffusion", label: "í™•ì‚°", min: 0, max: 1, step: 0.01 },
  { key: "advection", label: "ì´ë¥˜", min: 0, max: 1, step: 0.01 },
  { key: "evaporation", label: "ì¦ë°œ", min: 0, max: 1, step: 0.01 },
  { key: "settleRate", label: "ì •ì°©ë¥ ", min: 0, max: 1, step: 0.01 },
  { key: "gravity", label: "ì¤‘ë ¥", min: -1, max: 1, step: 0.01 },
  { key: "bristleStrands", label: "ê°•ëª¨ ìˆ˜", min: 8, max: 256, step: 8 },
  { key: "bristleContactIterations", label: "ê°•ëª¨ ì ‘ì´‰ ë°˜ë³µ", min: 1, max: 12, step: 1 },
  { key: "reservoirCapacity", label: "Reservoir ìš©ëŸ‰", min: 0, max: 1, step: 0.01 },
  { key: "particleCount", label: "ì…ì ìˆ˜", min: 16, max: 4096, step: 16 },
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
  const id = `quality-${label.replace(/[^a-z0-9ê°€-í£]+/giu, "-").toLowerCase()}`;
  return <label htmlFor={id} className={SUB}><span className="flex justify-between gap-2 text-xs font-semibold text-fg-2"><span>{label}</span><span className="tabular-nums text-fg">{value.toFixed(step < 0.1 ? 2 : 0)}</span></span><input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.valueAsNumber)} className="mt-2 min-h-8 w-full accent-accent" /></label>;
}

function Toggle({ label, detail, checked, onChange }: { readonly label: string; readonly detail: string; readonly checked: boolean; readonly onChange: () => void }) {
  return <button type="button" aria-pressed={checked} onClick={onChange} className={`${SUB} min-h-[76px] text-left ${checked ? "border-accent/55 bg-accent-soft" : "hover:border-line-strong"} ${STUDIO_FOCUS_RING}`}><span className="flex justify-between gap-2 text-sm font-bold text-fg"><span>{label}</span><span className="text-[0.62rem] text-accent">{checked ? "ì‚¬ìš©" : "êº¼ì§"}</span></span><span className="mt-1 block text-xs leading-relaxed text-fg-3">{detail}</span></button>;
}

function SelectField<T extends string>({ label, value, options, onChange }: { readonly label: string; readonly value: T; readonly options: readonly { id: T; label: string }[]; readonly onChange: (value: T) => void }) {
  return <label className="text-xs font-bold text-fg-2">{label}<select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value as T)} className={`${INPUT} mt-1.5`}>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return <div className={SUB}><div className="flex justify-between text-xs font-semibold text-fg-3"><span>{label}</span><span className="text-fg">{value}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${value}%`} /></div></div>;
}

export function StudioBrushV5QualityWorkbench({ scope }: { readonly scope: string }) {
  const storageKey = `toonspectrum.brush-quality-v1:${encodeURIComponent(scope)}`;
  const [policy, setPolicy] = useState<BrushQualityPolicy>(() => readPolicy(storageKey));
  const [tab, setTab] = useState<Tab>("compose");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("ì „ì²´");
  const [message, setMessage] = useState("ê³ ìœ í•œ ì§‘ì°¨ì€ ìœ ì§€í•˜ê³  ë™ë“±í•œ ê²°ê³¼ëŠ” WebGPU ìš°ìŠ¹ ê²½ë¡œë¡œ ì••ì¶•í•©ìŠ´ëŠ˜ë‹¤.");
  const importRef = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => analyzeBrushQualityPolicy(policy), [policy]);
  const groups = useMemo(() => ["ì „ì²´", ...brushQualityCatalogGroups()], []);
  const catalog = useMemo(() => BRUSH_QUALITY_CATALOG.filter((entry) => {
    const search = query.trim().toLocaleLowerCase("ko-KR");
    return (group === "ì „ì²´" || entry.group === group) && (!search || `${entry.name} ${entry.signature} ${entry.engine}`.toLocaleLowerCase("ko-KR").includes(search));
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
      const source = parsed && typeof parsed === "object" && "policy" in parsed ? (parsed as s policy: unknown }).policy : parsed;
      replace(normalizeBrushQualityPolicy(source), `â€œ${file.name}â€ í’ˆì§‰ ì •ì±…ì„ ê°€ì ¸ì˜¤ìŠµë‹ˆë‹¤.`);
    } catch { setMessage("í’ˆì§‰ ì •ì±… JSONì„ ì½ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤."); }
  }

  const tabs: readonly { id: Tab; label: string }[] = [
    { id: "compose", label: "Composer" }, { id: "input", label: "InputÂ·Device" }, { id: "physics", label: "MaterialÂ·Physics" },
    { id: "pigment", label: "Pigment" }, { id: "pattern", label: "Pattern" }, { id: "engines", label: "Engine Compare" }, { id: "catalog", label: `ë¸ŒëŸ¬ì‹œ ${BRUSH_QUALITY_CATALOG.length}` },
  ];

  return <section className="space-y-4">
    <div className={CARD}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">Quality Authority</p><h2 className="mt-1 text-lg font-black text-fg">ë¸ŒëŸ¬ì‹œ í’ˆì§ˆÂ·ë¬¼ì„± ì»´íŒŒì¼ë«ÚÛ\ÜÓ˜[YOH›]LHX^]ËLŞ^^ÈXY[™Ë\™[^Y^Y™ËLÈ»'¡zè)H:­d;(%K;dg:êm;"í{"çp­ú¬%zêª0­û'¡{'¤;%b:èã;c*;"®:ë.;%¤K8ÛÛ[Z]Ù^Ü;d¢;)â;'a:ãázé¯H]]Üš]{'(:èg:¬ ;)§{ejzââ:âéÜÙ]]ˆÛ\ÜÓ˜[YOH™›^›^]Ü˜\Ø\Lˆ]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YO^Ô’SPT–_HÛÛXÚÏ^Ê
HOˆ™\XÙJÜ[Z^™Pœ\Ú]X[]TÛXŞJÛXŞJK»d¢;)â:êª{dg;%ä:éç»-¥;%­›İšY\º¬ïÑ:âé;-g;( ;fe;e¢;"­zââ:âéˆŠ_O»d¢;)â;-g;( ;fe</button><button type="button" className={BUTTON} onClick={() => downloadPolicy(policy)}>ë‚´ë³´ë‚´ê¸°</button><button type="button" className={BUTTON} onClick={() => importRef.current?.click()}>ê°€ì ¸ì˜¤</button><input ref={importRef} type="file" accept="application/json,.json" className="sr-only" onChange={importPolicy} /></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-4"><SelectField label="í’ˆì§ˆ ëª¨í‘œ" value={policy.goal} options={[{id: "responsive", label: "ìµœì € ì§€ì—±" }, { id: "balanced", label: "ê» í˜•" }, { id: "material", label: "ì¬ë£Œ ì¶¨ì‹¤ë„" }, { id: "cinematic", label: "ì¶œë ¥ í’ˆì§‰" }] onChange={(goal) => patch("goal", goal)} /><SelectField label="ëŒ€ìƒ ì¤ì¹˜" value={policy.device} options={[{ id: "desktop-pen", label: "ë°ìŠ¤í¬í†° í˜" }, { id: "tablet-pen", label: "íƒœë¸”ë¦û í€" }, { id: "touch-hybrid", label: "í˜+í„°ì¹˜" }, { id: "mouse", label: "ë§ˆìš°ìŠ¤" }] onChange={(device) => patch("device", device)} /><div className={SUB}><p className="text-xs font-bold text-fg-2">ì‹¤í–‰ ì˜ˆì‚°</p><p className="mt-1 text-sm font-black text-fg">{analysis.estimatedInputLatencyMs}ms ì…ë ¥ Â· {analysis.estimatedFrameCostMs}ms í”„ë ˆì„</p></div><div className={SUB}><p className="text-xs font-bold text-fg-2">ê¶Œë¦¬ closure</p><p className="mt-1 text-sm font-black text-fg">{analysis.rightsProfile}</p></div></div>
      <p role="status" className="mt-3 rounded-xl border border-line bg-bg-2/45 px-3 py-2 text-xs text-fg-2">{message}</p><div className="mt-4 flex gap-2 overflow-x-auto">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold ${tab === item.id ? "border-accent/55 bg-accent-soft" : "border-line bg-card text-fg-2"} ${STUDIO_FOCUS_RING}`}>{item.label}</button>)}</div></div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">{Object.entries(analysis.metrics).map(([key, value]) => <Metric key={key} label={key} value={value} />)}</div>
    <StudioBrushQualityTestSheet policy={policy} />
    {analysis.issues.length ? <div className="grid gap-2 md:grid-cols-2">{analysis.issues.map((entry) => <div key={entry.id} className={`${SUB} ${entry.severity === "error" ? "border-danger/45" : entry.severity === "warning" ? "border-warn/45" : ""}`}><p className={`text-sm font-bold ${entry.severity === "error" ? "text-danger" : entry.severity === "warning" ? "text-warn" : "text-fg"}`}>{entry.title}</p><p className="mt-1 text-xs text-fg-3">{entry.detail}</p>{entry.fix ? <p className="mt-1 text-xs font-semibold text-accent">ì•´ê²°: ìentry.fix}</p> : null}</div>)}</div> : null}

    {tab === "compose" ? <StudioBrushV5Composer scope={scope} /> : null}
    {tab === "input" ? <div className="grid gap-4 xl:grid-cols-2"><Panel title="ìŸ…ë ¥ì „ì†¡Â·ºìì¡°" detail="ì˜ˆìƒì€ previewì—ë§Œ ì‚¬ìš©í•˜ê³  ë¬¼ë¦¬ ìƒíƒœì—ëŠ” ìˆ˜ë½ìœ ìƒ˜í’Œë§Œ ì „ë‹¬í•©ë‹ˆë‹¤."><div className="grid gap-3 sm:grid-cols-2"><SelectField label="ì „ì†¡" value={policy.input.transport} options={[{ id: "raw-coalesced", label: "raw + coalesced" }, { id: "move-coalesced", label: "move + coalesced" }, { id: "move-basic", label: "ê¸°ë³¸ move" }]} onChange={(transport) => patchInput({ transport })} /><Toggle label="ì˜ˆìƒ í”„ë¦¬ë·° ì „ìš”" detail="ìˆ˜ë¶„Â·ì•ˆë£ŒÂ·íˆìŠ¤í† ë¦¬ ë°˜ì˜í€ +²’®. ˆ¡•­•õíÁ½±¥ä¹¥¹ÁÕĞ¹ÁÉ•‘¥Ñ¥½¹AÉ•Ù¥•İ=¹±åô½¹¡…¹”õì ¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ìÁÉ•‘¥Ñ¥½¹AÉ•Ù¥•İ=¹±äè€…Á½±¥ä¹¥¹ÁÕĞ¹ÁÉ•‘¥Ñ¥½¹AÉ•Ù¥•İ=¹±äô¥ô€¼øñQ½±”±…‰•°ô‹¶bã®ÈĞƒ²Ò$ˆ‘•Ñ…¥°ô‹²VW®‚“
ß¶.ã¶*ã
ó¶j3²‚ƒ²b#²ƒ²‚G²ÒG²‚Ìˆ¡•­•õíÁ½±¥ä¹¥¹ÁÕĞ¹¡½Ù•ÉAÉ•Ù¥•İô½¹¡…¹”õì ¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ì¡½Ù•ÉAÉ•Ù¥•Üè€…Á½±¥ä¹¥¹ÁÕĞ¹¡½Ù•ÉAÉ•Ù¥•Üô¥ô€¼øñQ½±”±…‰•°ô‹¶2g®š°ƒ®‚£²®†pˆ‘•Ñ…¥°ô‹¶: ƒªÚ3²rƒ²jÃ²ƒ
ß¶Ã²æ`ƒ²’G²zğˆ¡•­•õíÁ½±¥ä¹¥¹ÁÕĞ¹Á…±µI•©•Ñ¥½¹ô½¹¡…¹”õì ¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ìÁ…±µI•©•Ñ¥½¸è€…Á½±¥ä¹¥¹ÁÕĞ¹Á…±µI•©•Ñ¥½¸ô¥ô€¼øñQ½±”±…‰•°ô‹²0ªÉ€ƒ®²ó®ÚLˆ‘•Ñ…¥°ô‰]•Ğ±½ß²^C²pƒ²3ªÂ®v÷²vƒ¯²ró®†pƒ²
³²j¤ˆ¡•­•õíÁ½±¥ä¹¥¹ÁÕĞ¹™¥¹•É]…Ñ•É	ÉÕÍ¡ô½¹¡…¹”õì ¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ì™¥¹•É]…Ñ•É	ÉÕÍ è€…Á½±¥ä¹¥¹ÁÕĞ¹™¥¹•É]…Ñ•É	ÉÕÍ ô¥ô€¼øğ½‘¥Øøğ½A…¹•°øñA…¹•°Ñ¥Ñ±”ô‹¶V“²VS
ß¶*ã¶*àƒªÖC²‚Tˆ‘•Ñ…¥°ô‹²z—²æ`ƒ®ÎÓ²‚WªÎğƒ®â3®~³².pƒ®Âc²vG²vƒ®Ú®š³¶V§®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÈÍ´éÉ¥µ½±Ì´ÈˆøñM±¥‘•È±…‰•°ô‹¶V“²VT½¹Í•ĞˆÙ…±Õ”õíÁ½±¥ä¹¥¹ÁÕĞ¹ÁÉ•ÍÍÕÉ•=¹Í•Ñôµ…àõìÀ¸Ñô½¹¡…¹”õì¡ÁÉ•ÍÍÕÉ•=¹Í•Ğ¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ìÁÉ•ÍÍÕÉ•=¹Í•Ğô¥ô€¼øñM±¥‘•È±…‰•°ô‹¶V²VTÍ…ÑÕÉ…Ñ¥½¸ˆÙ…±Õ”õíÁ½±¥ä¹¥¹ÁÕĞ¹ÁÉ•ÍÍÕÉ•M…ÑÕÉ…Ñ¥½¹ôµ¥¸õìÀ¸Õô½¹¡…¹”õì¡ÁÉ•ÍÍÕÉ•M…ÑÕÉ…Ñ¥½¸¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ìÁÉ•ÍÍÕÉ•M…ÑÕÉ…Ñ¥½¸ô¥ô€¼øñM±¥‘•È±…‰•°ô‹¶V²VT…µµ„ˆÙ…±Õ”õíÁ½±¥ä¹¥¹ÁÕĞ¹ÁÉ•ÍÍÕÉ•…µµ…ôµ¥¸õìÀ¸Éôµ…àõìÍô½¹¡…¹”õì¡ÁÉ•ÍÍÕÉ•…µµ„¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ìÁÉ•ÍÍÕÉ•…µµ„ô¥ô€¼øñM±¥‘•È±…‰•°ô‹¶z#²*“¶3®š³².s²*ˆÙ…±Õ”õíÁ½±¥ä¹¥¹ÁÕĞ¹ÁÉ•ÍÍÕÉ•!åÍÑ•É•Í¥Íôµ…àõìÀ¸Éô½¹¡…¹”õì¡ÁÉ•ÍÍÕÉ•!åÍÑ•É•Í¥Ì¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ìÁÉ•ÍÍÕÉ•!åÍÑ•É•Í¥Ìô¥ô€¼øñM±¥‘•È±…‰•°ô‹¶*ã¶*à‘•…é½¹”ˆÙ…±Õ”õíÁ½±¥ä¹¥¹ÁÕĞ¹Ñ¥±Ñ•…‘i½¹••ôµ…àõìÈÁôÍÑ•ÀõìÅô½¹¡…¹”õì¡Ñ¥±Ñ•…‘i½¹••œ¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ìÑ¥±Ñ•…‘i½¹••œô¥ô€¼øñM±¥‘•È±…‰•°ô‹¶*ã¶*àÍµ½½Ñ¡¥¹œˆÙ…±Õ”õíÁ½±¥ä¹¥¹ÁÕĞ¹Ñ¥±ÑMµ½½Ñ¡¥¹ô½¹¡…¹”õì¡Ñ¥±ÑMµ½½Ñ¡¥¹œ¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ìÑ¥±ÑMµ½½Ñ¡¥¹œô¥ô€¼øñM±¥‘•È±…‰•°ô‰Ñİ¥ÍĞÍµ½½Ñ¡¥¹œˆÙ…±Õ”õíÁ½±¥ä¹¥¹ÁÕĞ¹Ñİ¥ÍÑMµ½½Ñ¡¥¹ô½¹¡…¹”õì¡Ñİ¥ÍÑMµ½½Ñ¡¥¹œ¤€ôøÁ…Ñ¡%¹ÁÕĞ¡ìÑİ¥ÍÑMµ½½Ñ¡¥¹œô¥ô€¼øğ½‘¥Øøğ½A…¹•°øğ½‘¥Øø€è¹Õ±±ô((€€€íÑ…ˆ€ôôô€‰Á¡åÍ¥Ìˆ€ü€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´ĞˆøñA…¹•°Ñ¥Ñ±”ô‹®²ó®š°…ÕÑ¡½É¥Ñäˆ‘•Ñ…¥°ô‰]•Ó
İA¥­ÕÃ
İA¥µ•¹Ğ…ÕÑ¡½É¥Ñäƒ²Ú§®>3²v ƒ²îÓ¶23²vğƒ®*Ó®.£²^C²pƒ²Â£®.£¶V§®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÈÍ´éÉ¥µ½±Ì´È±œéÉ¥µ½±Ì´ÌˆùíA!eM%L¹µ…À ¡¥Ñ•´¤€ôø€ñQ½±”­•äõí¥Ñ•´¹¥‘ô±…‰•°õí¥Ñ•´¹±…‰•±ô‘•Ñ…¥°õí¥Ñ•´¹‘•Ñ…¥±ô¡•­•õíÁ½±¥ä¹Í¥µÕ±…Ñ¥½¸¹Á¡åÍ¥Ì¹¥¹±Õ‘•Ì¡¥Ñ•´¹¥¥ô½¹¡…¹”õì ¤€ôøÉ•Á±…”¡Ñ½±•	ÉÕÍ¡EÕ…±¥ÑåA¡åÍ¥Ì¡Á½±¥ä°¥Ñ•´¹¥¤¥ô€¼ø¥ôğ½‘¥Øøğ½A…¹•°øñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´Ğá°éÉ¥µ½±Ì´ÈˆøñA…¹•°Ñ¥Ñ±”ô‹¶Fs®¦Ó
ß®>¶>°ˆ‘•Ñ…¥°ô‹²j“²ÂP°ƒ¶vc²"`°ƒ¶R÷²^ªÎğƒ®²óªÂC®#²fƒ®.®š÷²‚²ró®†pƒ²†Ã²‚#¶V§®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÈÍ´éÉ¥µ½±Ì´Èˆùí5QI%1}=9QI=1L¹µ…À ¡½¹ÑÉ½°¤€ôø€ñM±¥‘•È­•äõí½¹ÑÉ½°¹­•åô±…‰•°õí½¹ÑÉ½°¹±…‰•±ôÙ…±Õ”õíÁ½±¥ä¹µ…Ñ•É¥…±m½¹ÑÉ½°¹­•åuô½¹¡…¹”õì¡Ù…±Õ”¤€ôøÁ…Ñ¡5…Ñ•É¥…°¡½¹ÑÉ½°¹­•ä°Ù…±Õ”¥ô€¼ø¥ôğ½‘¥Øøğ½A…¹•°øñA…¹•°Ñ¥Ñ±”ô‹².s®ã®²ó¶:0ƒ²2ˆUœˆ‘•Ñ…¥°ô‹®vó²vÓ®â3²f ½µµ¥Ğ½•áÁ½ÉĞƒ¶J#²#²vƒ®Ú®š³¶V§®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÈÍ´éÉ¥µ½±Ì´ÈˆùíM%5U1Q%=9}=9QI=1L¹µ…À ¡½¹ÑÉ½°¤€ôø€ñM±¥‘•È­•äõí½¹ÑÉ½°¹­•åô±…‰•°õí½¹ÑÉ½°¹±…‰•±ôÙ…±Õ”õíÁ½±¥ä¹Í¥µÕ±…Ñ¥½¹m½¹ÑÉ½°¹­•åuôµ¥¸õí½¹ÑÉ½°¹µ¥¹ôµ…àõí½¹ÑÉ½°¹µ…áôÍÑ•Àõí½¹ÑÉ½°¹ÍÑ•Áô½¹¡…¹”õì¡Ù…±Õ”¤€ôøÁ…Ñ¡M¥µÕ±…Ñ¥½¸¡½¹ÑÉ½°¹­•ä°Ù…±Õ”¥ô€¼ø¥ôñM±¥‘•È±…‰•°ô‹²‚W²Â¤™É…µ”ƒ²b#²
ÀˆÙ…±Õ”õíÁ½±¥ä¹½ÕÑÁÕĞ¹Í•ÑÑ±•	Õ‘•Ñ5Íôµ¥¸õìÅôµ…àõìÄÉôÍÑ•ÀõìÀ¸Õô½¹¡…¹”õì¡Í•ÑÑ±•	Õ‘•Ñ5Ì¤€ôøÁ…Ñ  ‰½ÕÑÁÕĞˆ°ì€¸¸¹Á½±¥ä¹½ÕÑÁÕĞ°Í•ÑÑ±•	Õ‘•Ñ5Ìô¥ô€¼øğ½‘¥Øøğ½A…¹•°øğ½‘¥Øøğ½‘¥Øø€è¹Õ±±ô((€€€íÑ…ˆ€ôôô€‰Á¥µ•¹Ğˆ€ü€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´Ğá°éÉ¥µ½±Ì´ÈˆøñA…¹•°Ñ¥Ñ±”ô‹²V#®0…ÕÑ¡½É¥Ñäˆ‘•Ñ…¥°ô‰MÁ•ÑÉ…°ƒªâÃ®Îà°ƒ²â‡²‚T,½O
İ1UPƒ¶fW²z”°5¥á‰½ã®*Pƒ®2²ÊĞƒ®Ú#ªÂ®*—²Äƒ¶×ªÎğƒ¶nƒ²
³²j§¶V§®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÌÍ´éÉ¥µ½±Ì´ÈˆøñM•±•Ñ¥•±±…‰•°ô‹²V#®0ÁÉ½Ù¥‘•ÈˆÙ…±Õ”õíÁ½±¥ä¹Á¥µ•¹Ğ¹ÁÉ½Ù¥‘•Éô½ÁÑ¥½¹Ìõímì¥è€‰Éˆˆ°±…‰•°è€‰I€¼=-1…ˆˆô°ì¥è€‰ÍÁ•ÑÉ…°ˆ°±…‰•°è€‰MÁ•ÑÉ…°]M0ˆô°ì¥è€‰½Á•¸µ­´ˆ°±…‰•°è€‰=Á•¸,½L]M0ˆô°ì¥è€‰Á¥µ•¹ĞµÁ…¥¹Ñ•Èˆ°±…‰•°è€‰Á¥µ•¹ĞµÁ…¥¹Ñ•È1UPˆô°ì¥è€‰µ¥á‰½àˆ°±…‰•°è€‰5¥á‰½àƒ²†ÃªÆÓ®Ú ˆô°ì¥è€‰¥¹­İ…Í µ‘•¹Í¥Ñäˆ°±…‰•°è€‰%¹­İ…Í ƒ®Â®>ˆõuô½¹¡…¹”õì¡ÁÉ½Ù¥‘•È¤€ôøÁ…Ñ  ‰Á¥µ•¹Ğˆ°ì€¸¸¹Á½±¥ä¹Á¥µ•¹Ğ°ÁÉ½Ù¥‘•Èô¥ô€¼øñQ½±”±…‰•°ô‰5¥á‰½àƒªÊ3²vÓ¶*àƒ²*ç²vàˆ‘•Ñ…¥°ô‰½ƒ²$ƒªÊ÷®†s
ß²ƒ¶bã
ß²Ç®*”ƒ²b²"c²štƒ¶V²jPˆ¡•­•õíÁ½±¥ä¹Á¥µ•¹Ğ¹…±±½İ5¥á‰½á]¡•¹¥ÍÑ¥¹Ñô½¹¡…¹”õì ¤€ôøÁ…Ñ  ‰Á¥µ•¹Ğˆ°ì€¸¸¹Á½±¥ä¹Á¥µ•¹Ğ°…±±½İ5¥á‰½á]¡•¹¥ÍÑ¥¹Ğè€…Á½±¥ä¹Á¥µ•¹Ğ¹…±±½İ5¥á‰½á]¡•¹¥ÍÑ¥¹Ğô¥ô€¼øğ½‘¥Øøğ½A…¹•°øñA…¹•°Ñ¥Ñ±”ô‹ªÒG¶Vg
ß¶bó²$ˆ‘•Ñ…¥°ô‹®FCªîc
ß®ÂS¶W
ß¶bó²$ƒªÂW®>®–ğƒ²†Ã²‚#¶V§®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÈÍ´éÉ¥µ½±Ì´ÈˆøñM±¥‘•È±…‰•°ô‹®²óªÂ@ƒ®FCªî`ˆÙ…±Õ”õíÁ½±¥ä¹Á¥µ•¹Ğ¹Ñ¡¥­¹•ÍÍôµ¥¸õìÀ¸ÀÉô½¹¡…¹”õì¡Ñ¡¥­¹•ÍÌ¤€ôøÁ…Ñ  ‰Á¥µ•¹Ğˆ°ì€¸¸¹Á½±¥ä¹Á¥µ•¹Ğ°Ñ¡¥­¹•ÍÌô¥ô€¼øñM±¥‘•È±…‰•°ô‹®ÂS¶Tƒ®ÂwªâÀˆÙ…±Õ”õíÁ½±¥ä¹Á¥µ•¹Ğ¹ÍÕ‰ÍÑÉ…Ñ•	É¥¡Ñ¹•ÍÍô½¹¡…¹”õì¡ÍÕ‰ÍÑÉ…Ñ•	É¥¡Ñ¹•ÍÌ¤€ôøÁ…Ñ  ‰Á¥µ•¹Ğˆ°ì€¸¸¹Á½±¥ä¹Á¥µ•¹Ğ°ÍÕ‰ÍÑÉ…Ñ•	É¥¡Ñ¹•ÍÌô¥ô€¼øñM±¥‘•È±…‰•°ô‹¶bó²$ƒªÂW®>ˆÙ…±Õ”õíÁ½±¥ä¹Á¥µ•¹Ğ¹µ¥á¥¹MÑÉ•¹Ñ¡ô½¹¡…¹”õì¡µ¥á¥¹MÑÉ•¹Ñ ¤€ôøÁ…Ñ  ‰Á¥µ•¹Ğˆ°ì€¸¸¹Á½±¥ä¹Á¥µ•¹Ğ°µ¥á¥¹MÑÉ•¹Ñ ô¥ô€¼øñQ½±”±…‰•°ô‹®zc²*“¶Àƒ²b²"c²štˆ‘•Ñ…¥°ô‹®Î×¶V¤ATƒªÊÃªÎó®–ğ½µµ¥Ğƒ¶²vó®†pƒ®ÎÓ²†Ğˆ¡•­•õíÁ½±¥ä¹½ÕÑÁÕĞ¹É…ÍÑ•ÉI••¥ÁÑô½¹¡…¹”õì ¤€ôøÁ…Ñ  ‰½ÕÑÁÕĞˆ°ì€¸¸¹Á½±¥ä¹½ÕÑÁÕĞ°É…ÍÑ•ÉI••¥ÁĞè€…Á½±¥ä¹½ÕÑÁÕĞ¹É…ÍÑ•ÉI••¥ÁĞô¥ô€¼øğ½‘¥Øøğ½A…¹•°øğ½‘¥Øø€è¹Õ±±ô((€€€íÑ…ˆ€ôôô€‰Á…ÑÑ•É¸ˆ€ü€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´Ğá°éÉ¥µ½±Ì´ÈˆøñA…¹•°Ñ¥Ñ±”ô‹¶2£¶Ğƒ®²ã®ÊW
ß²r²ˆ‘•Ñ…¥°ô‹¶ƒ¶>Ó®†s²²f ƒ²Š3¶FsªÎªÂ ƒ®.“®–Ó®¦Ğƒ®>®šôƒ®â3®~³².s®†pƒ²rƒ²¶V§®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÌÍ´éÉ¥µ½±Ì´ÈˆøñM•±•Ñ¥•±±…‰•°ô‹²Š3¶FsªÎˆÙ…±Õ”õíÁ½±¥ä¹Á…ÑÑ•É¸¹ÍÁ…•ô½ÁÑ¥½¹Ìõímì¥è€‰ÍÑÉ½­”ˆ°±…‰•°è€‰MÑÉ½­”ˆô°ì¥è€‰‘½Õµ•¹Ğˆ°±…‰•°è€‰½Õµ•¹Ğ±½­•ˆô°ì¥è€‰ÍÉ••¸ˆ°±…‰•°è€‰MÉ••¸ˆô°ì¥è€‰É…‘¥…°ˆ°±…‰•°è€‰I…‘¥…°ˆô°ì¥è€‰™±½Üµ™¥•±ˆ°±…‰•°è€‰±½Ü™¥•±ˆõuô½¹¡…¹”õì¡ÍÁ…”¤€ôøÁ…Ñ  ‰Á…ÑÑ•É¸ˆ°ì€¸¸¹Á½±¥ä¹Á…ÑÑ•É¸°ÍÁ…”ô¥ô€¼øñM•±•Ñ¥•±±…‰•°ô‹®Âc®ÎÔƒ®²ã®ÊTˆÙ…±Õ”õíÁ½±¥ä¹Á…ÑÑ•É¸¹É…µµ…Éô½ÁÑ¥½¹Ìõíl‰½¹Ñ¥¹Õ½ÕÌˆ°€‰É¥ˆ°€‰‰É¥¬ˆ°€‰…±½¹œµÁ…Ñ ˆ°€‰É…‘¥…°ˆ°€‰‰±Õ”µ¹½¥Í”ˆ°€‰™±½Üµ™¥•±ˆ°€‰°µÍåÍÑ•´ˆ°€‰É•…Ñ¥½¸µµ…Í¬‰t¹µ…À ¡¥¤€ôø€¡ì¥è¥…Ì	ÉÕÍ¡EÕ…±¥ÑåA½±¥ål‰Á…ÑÑ•É¸‰ul‰É…µµ…È‰t°±…‰•°è¥ô¤¥ô½¹¡…¹”õì¡É…µµ…È¤€ôøÁ…Ñ  ‰Á…ÑÑ•É¸ˆ°ì€¸¸¹Á½±¥ä¹Á…ÑÑ•É¸°É…µµ…Èô¥ô€¼øñM•±•Ñ¥•±±…‰•°ô‹®ª£¶.Ã¶RˆÙ…±Õ”õíÁ½±¥ä¹Á…ÑÑ•É¸¹µ½Ñ¥™ô½ÁÑ¥½¹Ìõíl‰¹½¹”ˆ°€‰‘½Ğˆ°€‰±¥¹”ˆ°€‰¡…Ñ ˆ°€‰İ•…Ù”ˆ°€‰‰É¥¬ˆ°€‰±•…˜ˆ°€‰ÍÑ¥Ñ ˆ°€‰¡…¥¸ˆ°€‰¡…¥Èˆ°€‰ÍÑ…Èˆ°€‰±åÁ ˆ°€‰ÕÍÑ½´‰t¹µ…À ¡¥¤€ôø€¡ì¥è¥…Ì	ÉÕÍ¡EÕ…±¥ÑåA½±¥ål‰Á…ÑÑ•É¸‰ul‰µ½Ñ¥˜‰t°±…‰•°è¥ô¤¥ô½¹¡…¹”õì¡µ½Ñ¥˜¤€ôøÁ…Ñ  ‰Á…ÑÑ•É¸ˆ°ì€¸¸¹Á½±¥ä¹Á…ÑÑ•É¸°µ½Ñ¥˜ô¥ô€¼øñQ½±”±…‰•°ô‹ªÊÃ²‚W²‚ƒ®ÂÃ²æ`ˆ‘•Ñ…¥°ô‹².s®Ns
ß²r²
ß®
Ó®ÎÓ®
ÓªâÀƒ²r²æ`ƒªÎƒ²‚Tˆ¡•­•õíÁ½±¥ä¹Á…ÑÑ•É¸¹‘•Ñ•Éµ¥¹¥ÍÑ¥ô½¹¡…¹”õì ¤€ôøÁ…Ñ  ‰Á…ÑÑ•É¸ˆ°ì€¸¸¹Á½±¥ä¹Á…ÑÑ•É¸°‘•Ñ•Éµ¥¹¥ÍÑ¥Œè€…Á½±¥ä¹Á…ÑÑ•É¸¹‘•Ñ•Éµ¥¹¥ÍÑ¥Œô¥ô€¼øğ½‘¥Øøğ½A…¹•°øñA…¹•°Ñ¥Ñ±”ô‹®ÂÃ²æc
ß®Âc®ÎÔƒ²Z×²‚pˆ‘•Ñ…¥°ô‰	±Õ”µ¹½¥Í—²f ©¥ÑÑ•Ë®†pƒ¶²vó®ƒ¶vS²‚²vƒ²’²z®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÈÍ´éÉ¥µ½±Ì´Èˆùì¡l‰‘•¹Í¥Ñäˆ°€‰ÍÁ…¥¹œˆ°€‰É½Ñ…Ñ¥½¹)¥ÑÑ•Èˆ°€‰Í…±•)¥ÑÑ•Èˆ°€‰½±±¥Í¥½¹Ù½¥‘…¹”‰t…Ì½¹ÍĞ¤¹µ…À ¡­•ä¤€ôø€ñM±¥‘•È­•äõí­•åô±…‰•°õí­•åôÙ…±Õ”õíÁ½±¥ä¹Á…ÑÑ•É¹m­•åuôµ¥¸õí­•ä€ôôô€‰ÍÁ…¥¹œˆ€ü€À¸ÀÈ€è€Áôµ…àõí­•ä€ôôô€‰ÍÁ…¥¹œˆ€ü€Ğ€è€Åô½¹¡…¹”õì¡Ù…±Õ”¤€ôøÁ…Ñ  ‰Á…ÑÑ•É¸ˆ°ì€¸¸¹Á½±¥ä¹Á…ÑÑ•É¸°m­•åtèÙ…±Õ”ô¥ô€¼ø¥ôğ½‘¥Øøğ½A…¹•°øğ½‘¥Øø€è¹Õ±±ô((€€€íÑ…ˆ€ôôô€‰•¹¥¹•Ìˆ€ü€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´Ğá°éÉ¥µ½±Ì´ÈˆøñA…¹•°Ñ¥Ñ±”ô‰AÉ½Ù¥‘•Èƒ²ƒ¶tˆ‘•Ñ…¥°ô‹®>g®NÄƒªÊÃªÎó®*P]•‰AW®†pƒ²VW²ÚW¶VcªÎ€ƒªÎƒ²r€ƒ®²ó²Ç®0ƒ²rƒ²¶V§®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÈÍ´éÉ¥µ½±Ì´Èˆùí	IUM!}EU1%Qe}AI=Y%IL¹µ…À ¡ÁÉ½Ù¥‘•È¤€ôø€ñQ½±”­•äõíÁÉ½Ù¥‘•È¹¥‘ô±…‰•°õíÁÉ½Ù¥‘•È¹±…‰•±ô‘•Ñ…¥°õí€‘íÁÉ½Ù¥‘•È¹É½±•ôƒ
Ü€‘íÁÉ½Ù¥‘•È¹É¥¡ÑÍôƒ
Ü€‘íÁÉ½Ù¥‘•È¹ÍÑ…ÑÕÍõô¡•­•õíÁ½±¥ä¹ÁÉ½Ù¥‘•ÉÌ¹¥¹±Õ‘•Ì¡ÁÉ½Ù¥‘•È¹¥¥ô½¹¡…¹”õì ¤€ôøÉ•Á±…”¡Ñ½±•	ÉÕÍ¡EÕ…±¥ÑåAÉ½Ù¥‘•È¡Á½±¥ä°ÁÉ½Ù¥‘•È¹¥¤¥ô€¼ø¥ôğ½‘¥Øøğ½A…¹•°øñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´ĞˆøñA…¹•°Ñ¥Ñ±”ô‰½ƒ¶n®ÎĞƒ²"s²rˆ‘•Ñ…¥°ô‹²²^Ã
ß²Ú§².“®>
ßªÊÃ²‚W²Ç
ß®¦S®ª£®š°ƒªÂ²’Dƒ²"s²r²z®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Èˆùí…¹…±åÍ¥Ì¹ÁÉ½Ù¥‘•ÉÌ¹Í±¥” À°€ÄÈ¤¹µ…À ¡…¹‘¥‘…Ñ”°¥¹‘•à¤€ôø€ñ‘¥Ø­•äõí…¹‘¥‘…Ñ”¹¥‘ô±…ÍÍ9…µ”õíMU	ôøñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à©ÕÍÑ¥™äµ‰•Ñİ••¸…À´ÈˆøñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´™½¹Ğµ‰½±Ñ•áĞµ™œˆùí¥¹‘•à€¬€Åô¸í…¹‘¥‘…Ñ”¹±…‰•±ôğ½ÍÁ…¸øñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµáÌ™½¹Ğµ‰±…¬Ñ•áĞµ…•¹Ğˆùí…¹‘¥‘…Ñ”¹Í½É•ôğ½ÍÁ…¸øğ½‘¥ØøñÀ±…ÍÍ9…µ”ô‰µĞ´ÄÑ•áĞµáÌÑ•áĞµ™œ´Ìˆùí…¹‘¥‘…Ñ”¹É•…Í½¹õí…¹‘¥‘…Ñ”¹Í•±•Ñ•€ü€ˆƒ
Üƒ²ƒ¶w®B ˆ€è€ˆ‰ôğ½Àøğ½‘¥Øø¥ôğ½‘¥Øøğ½A…¹•°øñA…¹•°Ñ¥Ñ±”ô‹²îÓ¶23²vğƒ².“¶Z$ƒªÎ¶j4ˆ‘•Ñ…¥°ô‰¡½Ù•Ë
İÁÉ•‘¥Ñ¥½»²v ƒ®æªÚ3²r°±¥Ù—
İÍ•ÑÑ±—
İ½µµ¥Ó²v …¹½¹¥…³²z®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Èˆùí…¹…±åÍ¥Ì¹•á•ÕÑ¥½¹A±…¸¹µ…À ¡Á…ÍÌ°¥¹‘•à¤€ôø€ñ‘¥Ø­•äõí€‘íÁ…ÍÌ¹Á¡…Í•ô´‘íÁ…ÍÌ¹ÁÉ½Ù¥‘•Éô´‘í¥¹‘•áõô±…ÍÍ9…µ”õíMU	ôøñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à©ÕÍÑ¥™äµ‰•Ñİ••¸…À´ÈÑ•áĞµáÌˆøñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµ‰±…¬ÕÁÁ•É…Í”Ñ•áĞµ…•¹ĞˆùíÁ…ÍÌ¹Á¡…Í•ôƒ
ÜíÁ…ÍÌ¹‘½µ…¥¹ôğ½ÍÁ…¸øñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµ™œ´ÌˆùíÁ…ÍÌ¹‰Õ‘•Ñ5Ì¹Ñ½¥á• È¥õµÌğ½ÍÁ…¸øğ½‘¥ØøñÀ±…ÍÍ9…µ”ô‰µĞ´ÄÑ•áĞµÍ´™½¹Ğµ‰½±Ñ•áĞµ™œˆùíÁ…ÍÌ¹±…‰•±ôğ½ÀøñÀ±…ÍÍ9…µ”ô‰µĞ´ÄÑ•áĞµáÌÑ•áĞµ™œ´ÌˆùíÁ…ÍÌ¹ÁÉ½Ù¥‘•Éôƒ
ÜíÁ…ÍÌ¹…¹½¹¥…°€ü€‰…¹½¹¥…°ˆ€è€‰ÁÉ•Ù¥•Üµ½¹±ä‰ôğ½Àøğ½‘¥Øø¥ôğ½‘¥Øøğ½A…¹•°øğ½‘¥Øøğ½‘¥Øø€è¹Õ±±ô((€€€íÑ…ˆ€ôôô€‰…Ñ…±½œˆ€ü€ñA…¹•°Ñ¥Ñ±”ô‹¶J#² ƒªâÃ²’ ƒªâÃ®Îàƒ®â3®~³².p€ÜË²Šˆ‘•Ñ…¥°ô‹²#ªÂC
ß®²ó®š³
ß¶2£¶Ó
ß²$ƒªÊ÷®†sªÂ ƒ®Ú®ª¶Vpƒ®‚3®RS²c²v ƒ®ÎÓ²†Ó¶V§®.#®.¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É¥…À´ÌµéÉ¥µ½±ÌµlÅ™É|ÈĞÁÁátˆøñ¥¹ÁÕĞ±…ÍÍ9…µ”õí%9AUQôÙ…±Õ”õíÅÕ•Éåô½¹¡…¹”õì¡•Ù•¹Ğè¡…¹•Ù•¹Ğñ!Q51%¹ÁÕÑ±•µ•¹Ğø¤€ôøÍ•ÑEÕ•Éä¡•Ù•¹Ğ¹ÕÉÉ•¹ÑQ…É•Ğ¹Ù…±Õ”¥ôÁ±…•¡½±‘•Èô‹®â3®~³².s
ß²#ªÂC
ß²^S²ƒªÊ²$ˆ€¼øñÍ•±•Ğ±…ÍÍ9…µ”õí%9AUQôÙ…±Õ”õíÉ½ÕÁô½¹¡…¹”õì¡•Ù•¹Ğè¡…¹•Ù•¹Ğñ!Q51M•±•Ñ±•µ•¹Ğø¤€ôøÍ•ÑÉ½ÕÀ¡•Ù•¹Ğ¹ÕÉÉ•¹ÑQ…É•Ğ¹Ù…±Õ”¥ôùíÉ½ÕÁÌ¹µ…À ¡¥Ñ•´¤€ôø€ñ½ÁÑ¥½¸­•äõí¥Ñ•µôùí¥Ñ•µôğ½½ÁÑ¥½¸ø¥ôğ½Í•±•Ğøğ½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´ĞÉ¥…À´ÈÍ´éÉ¥µ½±Ì´È±œéÉ¥µ½±Ì´Ìá°éÉ¥µ½±Ì´Ğˆùí…Ñ…±½œ¹µ…À ¡•¹ÑÉä¤€ôø€ñ…ÉÑ¥±”­•äõí•¹ÑÉä¹¥‘ô±…ÍÍ9…µ”õí€‘íMU	ô€‘í•¹ÑÉä¹ÅÕ¥¬€ü€‰‰½É‘•Èµ…•¹Ğ¼ÌÔˆ€è€ˆ‰õôøñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à©ÕÍÑ¥™äµ‰•Ñİ••¸…À´Èˆøñ Ì±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´™½¹Ğµ‰±…¬Ñ•áĞµ™œˆùí•¹ÑÉä¹¹…µ•ôğ½ Ìùí•¹ÑÉä¹ÅÕ¥¬€ü€ñÍÁ…¸±…ÍÍ9…µ”ô‰É½Õ¹‘•µ™Õ±°‰œµ…•¹ĞµÍ½™ĞÁà´ÈÁä´À¸ÔÑ•áĞµlÀ¸ÙÉ•µt™½¹Ğµ‰½±Ñ•áĞµ…•¹Ğˆû®æƒ®–àğ½ÍÁ…¸ø€è¹Õ±±ôğ½‘¥ØøñÀ±…ÍÍ9…µ”ô‰µĞ´ÄÑ•áĞµáÌÑ•áĞµ™œ´Ìˆùí•¹ÑÉä¹Í¥¹…ÑÕÉ•ôğ½ÀøñÀ±…ÍÍ9…µ”ô‰µĞ´ÈÑ•áĞµlÀ¸ØÑÉ•µt™½¹Ğµ‰½±Ñ•áĞµ…•¹Ğˆùí•¹ÑÉä¹•¹¥¹•ôğ½ÀøñÀ±…ÍÍ9…µ”ô‰µĞ´ÄÑ•áĞµlÀ¸ØÉÉ•µtÑ•áĞµ™œ´Ìˆùí•¹ÑÉä¹É½ÕÁôğ½Àøğ½…ÉÑ¥±”ø¥ôğ½‘¥Øøğ½A…¹•°ø€è¹Õ±±ô(€€ğ½Í•Ñ¥½¸øì)ô(