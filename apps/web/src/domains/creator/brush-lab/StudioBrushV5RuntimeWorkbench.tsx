import { useEffect, useMemo, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  createBrushQualityPolicy,
  normalizeBrushQualityPolicy,
  type BrushQualityPolicy,
} from "./brush-studio-v5-quality";
import {
  benchmarkBrushRuntime,
  detectSynchronousBrushRuntimeCapabilities,
  isBrushRuntimeBenchmarkReceipt,
  scanBrushRuntimeCapabilities,
} from "./brush-studio-v5-runtime-benchmark";
import {
  brushRuntimeCapabilityFingerprint,
  brushRuntimePassesByPhase,
  compileBrushRuntimeProgram,
} from "./brush-studio-v5-runtime-compiler";
import type {
  BrushRuntimeBenchmarkReceipt,
  BrushRuntimeCapabilities,
  BrushRuntimeCertification,
  BrushRuntimePhase,
  BrushRuntimeProviderReadiness,
} from "./brush-studio-v5-runtime-types";

const CARD = "rounded-2xl border border-line bg-card/55 p-4 shadow-sm";
const SUB = "rounded-xl border border-line bg-bg-2/45 p-3";
const BUTTON = `inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-fg hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${STUDIO_FOCUS_RING}`;
const PRIMARY = `inline-flex min-h-11 items-center justify-center rounded-xl border border-accent/40 bg-accent px-3 py-2 text-sm font-bold text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${STUDIO_FOCUS_RING}`;
const CERT: Readonly<Record<BrushRuntimeCertification, string>> = Object.freeze({ certified: "제품 인증", conditional: "조건부", "design-only": "설계 전용", blocked: "차단" });
const READY: Readonly<Record<BrushRuntimeProviderReadiness, string>> = Object.freeze({ "wired-product": "제품 배선", "wired-conditional": "조건부", "bridge-ready": "브리지", "descriptor-only": "설계만", "reference-only": "참고" });
const PHASE: readonly BrushRuntimePhase[] = ["preview", "live", "settle", "commit", "export"];

function loadPolicy(key: string): BrushQualityPolicy {
  try { const value = globalThis.localStorage?.getItem(key); return value ? normalizeBrushQualityPolicy(JSON.parse(value)) : createBrushQualityPolicy(); }
  catch { return createBrushQualityPolicy(); }
}
function loadReceipt(key: string): BrushRuntimeBenchmarkReceipt | null {
  try { const value: unknown = JSON.parse(globalThis.localStorage?.getItem(key) ?? "null"); return isBrushRuntimeBenchmarkReceipt(value) ? value : null; }
  catch { return null; }
}
function badge(certification: BrushRuntimeCertification): string {
  if (certification === "certified") return "border-success/40 bg-success/10 text-success";
  if (certification === "conditional") return "border-warning/40 bg-warning/10 text-warning";
  if (certification === "design-only") return "border-accent/40 bg-accent-soft text-accent";
  return "border-danger/40 bg-danger/10 text-danger";
}
function capabilityRows(value: BrushRuntimeCapabilities) {
  return [
    ["WebGPU adapter", value.webgpu && value.webgpuAdapter],
    ["WebGL2", value.webgl2],
    ["OffscreenCanvas", value.offscreenCanvas],
    ["SAB / COOP·COEP", value.sharedArrayBuffer && value.crossOriginIsolated],
    ["pointerrawupdate", value.pointerRawUpdate],
    ["coalesced events", value.coalescedEvents],
    ["predicted events", value.predictedEvents],
    ["hover", value.hover],
  ] as const;
}
function download(program: ReturnType<typeof compileBrushRuntimeProgram>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: "toonspectrum.brush-runtime-program-v2", program }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `${program.programKey}.json`; document.body.append(link); link.click(); link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function StudioBrushV5RuntimeWorkbench({ scope }: { readonly scope: string }) {
  const policyKey = `toonspectrum.brush-quality-v1:${encodeURIComponent(scope)}`;
  const receiptKey = `toonspectrum.brush-runtime-benchmark-v1:${encodeURIComponent(scope)}`;
  const [policy, setPolicy] = useState<BrushQualityPolicy>(() => loadPolicy(policyKey));
  const [capabilities, setCapabilities] = useState<BrushRuntimeCapabilities>(() => detectSynchronousBrushRuntimeCapabilities());
  const [receipt, setReceipt] = useState<BrushRuntimeBenchmarkReceipt | null>(() => loadReceipt(receiptKey));
  const [busy, setBusy] = useState<"scan" | "bench" | null>(null);
  const [message, setMessage] = useState("실제 커널·브라우저 능력·실측 영수증을 모두 확인합니다.");
  const program = useMemo(() => compileBrushRuntimeProgram(policy, { capabilities, benchmark: receipt, strictProduct: true }), [policy, capabilities, receipt]);
  const phases = useMemo(() => brushRuntimePassesByPhase(program), [program]);
  const errors = program.gates.filter((item) => item.severity === "error");
  const warnings = program.gates.filter((item) => item.severity === "warning");

  useEffect(() => {
    let cancelled = false; setBusy("scan");
    scanBrushRuntimeCapabilities().then((next) => { if (!cancelled) { setCapabilities(next); setMessage(next.webgpuAdapter ? "WebGPU와 입력 경로를 검사했습니다." : "WebGPU adapter가 없어 제품 인증이 차단됩니다."); } }).finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const listener = (event: Event) => setPolicy(normalizeBrushQualityPolicy((event as CustomEvent<unknown>).detail));
    globalThis.addEventListener?.("toonspectrum:brush-quality-policy", listener);
    return () => globalThis.removeEventListener?.("toonspectrum:brush-quality-policy", listener);
  }, []);
  useEffect(() => {
    if (typeof CustomEvent !== "undefined") globalThis.dispatchEvent?.(new CustomEvent("toonspectrum:brush-runtime-program-v2", { detail: program }));
  }, [program]);
  useEffect(() => { if (receipt) { try { globalThis.localStorage?.setItem(receiptKey, JSON.stringify(receipt)); } catch { /* local evidence is optional */ } } }, [receipt, receiptKey]);

  async function scan() {
    setBusy("scan");
    try { const next = await scanBrushRuntimeCapabilities(); setCapabilities(next); if (receipt?.capabilityFingerprint !== brushRuntimeCapabilityFingerprint(next)) setReceipt(null); setMessage("브라우저 capability를 갱신했습니다."); }
    finally { setBusy(null); }
  }
  async function benchmark() {
    setBusy("bench"); setMessage("CPU 다브·이벤트 루프·실제 WebGPU compute를 반복 측정합니다.");
    try { const next = await scanBrushRuntimeCapabilities(); setCapabilities(next); const measured = await benchmarkBrushRuntime(next); setReceipt(measured); setMessage(measured.stable ? "실측 영수증을 저장했습니다." : "측정 변동성이 커 인증할 수 없습니다."); }
    catch (error) { setMessage(error instanceof Error ? `벤치마크 실패: ${error.message}` : "벤치마크 실패"); }
    finally { setBusy(null); }
  }

  return <section className="space-y-4" aria-labelledby="runtime-certification-title">
    <div className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">Runtime Quality Authority</p><h2 id="runtime-certification-title" className="mt-1 text-lg font-black text-fg">실행 그래프·제품 배선·실측 인증</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-3">설정 목록이 아니라 실제 필드와 pass DAG를 컴파일합니다. 미배선 엔진, 예측 입력 누수, 장치 능력 부족, 메모리·프레임 예산 초과는 fail-closed로 차단합니다.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" className={BUTTON} onClick={scan} disabled={busy !== null}>{busy === "scan" ? "검사 중" : "능력 재검사"}</button><button type="button" className={PRIMARY} onClick={benchmark} disabled={busy !== null}>{busy === "bench" ? "실측 중" : "브라우저 실측"}</button><button type="button" className={BUTTON} onClick={() => download(program)}>Manifest</button></div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <div className={`${SUB} border ${badge(program.certification)}`}><p className="text-[0.65rem] font-black uppercase">Certification</p><p className="mt-1 text-lg font-black">{CERT[program.certification]}</p><p className="mt-1 text-[0.68rem]">{errors.length} 오류 · {warnings.length} 주의</p></div>
        <div className={SUB}><p className="text-xs text-fg-3">Live</p><p className="mt-1 text-base font-black text-fg">{program.budget.estimatedLiveMs} / {program.budget.liveBudgetMs}ms</p></div>
        <div className={SUB}><p className="text-xs text-fg-3">Settle</p><p className="mt-1 text-base font-black text-fg">{program.budget.estimatedSettleMs}ms</p></div>
        <div className={SUB}><p className="text-xs text-fg-3">Field memory</p><p className="mt-1 text-base font-black text-fg">{program.budget.estimatedMemoryMb}MB</p></div>
        <div className={SUB}><p className="text-xs text-fg-3">Wired providers</p><p className="mt-1 text-base font-black text-fg">{Math.round(program.budget.wiredProviderFraction * 100)}%</p></div>
      </div>
      <p role="status" className="mt-3 rounded-xl border border-line bg-bg-2/45 px-3 py-2 text-xs text-fg-2">{message}</p>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <section className={CARD}><h3 className="text-sm font-black text-fg">브라우저 입력·GPU 능력</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{capabilityRows(capabilities).map(([label, supported]) => <div key={label} className={SUB}><div className="flex justify-between gap-2"><span className="text-xs font-bold text-fg">{label}</span><span className={`text-[0.68rem] font-black ${supported ? "text-success" : "text-danger"}`}>{supported ? "지원" : "미지원"}</span></div></div>)}</div><p className="mt-3 text-[0.68rem] text-fg-3">CPU {capabilities.hardwareConcurrency} threads · memory {capabilities.deviceMemoryGb ?? "unknown"}GB</p></section>
      <section className={CARD}><h3 className="text-sm font-black text-fg">실브라우저 영수증</h3>{receipt ? <div className="mt-3 grid gap-2 sm:grid-cols-4"><div className={SUB}><p className="text-xs text-fg-3">CPU</p><p className="font-black text-fg">{receipt.cpuDabMillionMarksPerSecond}M/s</p></div><div className={SUB}><p className="text-xs text-fg-3">Loop p95</p><p className="font-black text-fg">{receipt.eventLoopP95Ms}ms</p></div><div className={SUB}><p className="text-xs text-fg-3">GPU p95</p><p className="font-black text-fg">{receipt.webgpuDispatchP95Ms ?? "—"}ms</p></div><div className={SUB}><p className="text-xs text-fg-3">Stable</p><p className={`font-black ${receipt.stable ? "text-success" : "text-danger"}`}>{receipt.stable ? "통과" : "실패"}</p></div></div> : <p className="mt-3 rounded-xl border border-warning/35 bg-warning/5 p-4 text-sm font-semibold text-warning">이 장치의 실측 영수증이 없습니다.</p>}</section>
    </div>

    <section className={CARD}><div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-sm font-black text-fg">Canonical authority와 provider 근거</h3><p className="mt-1 text-xs text-fg-3">같은 물리 역할은 하나의 provider만 소유합니다.</p></div><code className="rounded-lg bg-bg-2 px-2 py-1 text-[0.65rem] text-fg-3">{program.programKey}</code></div><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{program.authorities.map((item) => <div key={item.authority} className={SUB}><p className="text-[0.65rem] font-black uppercase text-accent">{item.authority}</p><p className="mt-1 text-xs font-bold text-fg">{item.provider}</p><p className="mt-1 text-[0.68rem] text-fg-3">{item.reason}</p></div>)}</div><div className="mt-4 overflow-x-auto rounded-xl border border-line"><table className="min-w-full text-left text-xs"><thead className="bg-bg-2/80 text-fg-3"><tr><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Readiness</th><th className="px-3 py-2">Kernel</th><th className="px-3 py-2">Gate / evidence</th></tr></thead><tbody>{program.providers.map((item) => <tr key={item.id} className="border-t border-line align-top"><td className="px-3 py-2 font-bold text-fg">{item.label}</td><td className="px-3 py-2 text-fg-2">{READY[item.readiness]}</td><td className={`px-3 py-2 font-bold ${item.productKernel ? "text-success" : "text-danger"}`}>{item.productKernel ? "wired" : "missing"}</td><td className="max-w-xl px-3 py-2 text-fg-3">{item.qualityGate}<br/><span className="font-mono text-[0.62rem]">{item.evidencePaths[0] ?? "no runtime evidence"}</span></td></tr>)}</tbody></table></div></section>

    <section className={CARD}><h3 className="text-sm font-black text-fg">필드·active tile 계획</h3><p className="mt-1 text-xs text-fg-3">{program.tilePlan.tileSize}px · active {program.tilePlan.activeTileCount} · live {program.tilePlan.liveTileLimit} · settle {program.tilePlan.settleTileLimit} · halo {program.tilePlan.maxHaloPx}px</p><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{program.fields.map((item) => <div key={item.id} className={SUB}><p className="font-mono text-[0.68rem] font-bold text-fg">{item.id}</p><p className="mt-1 text-[0.66rem] text-fg-3">{item.format} · {item.scale}× · {item.activeTileMode}{item.pingPong ? " · ping-pong" : ""}</p><p className="mt-1 text-[0.66rem] text-fg-3">{(item.estimatedBytes / 1048576).toFixed(2)}MB · {item.lifetime}</p></div>)}</div></section>

    <section className={CARD}><h3 className="text-sm font-black text-fg">Pass DAG·solver·fusion</h3><div className="mt-3 space-y-3">{PHASE.map((phase) => phases[phase].length > 0 ? <details key={phase} open={phase === "live" || phase === "settle"} className="rounded-xl border border-line bg-bg-2/35 p-3"><summary className="cursor-pointer text-sm font-black text-fg">{phase} · {phases[phase].length} passes</summary><div className="mt-3 space-y-2">{phases[phase].map((item) => <div key={item.id} className={SUB}><div className="flex flex-wrap justify-between gap-2"><code className="text-[0.68rem] font-bold text-accent">{item.id}</code><span className="text-[0.68rem] text-fg-3">{item.provider} · {item.domain} · {item.budgetMs}ms{item.repeat > 1 ? ` ×${item.repeat}` : ""}</span></div><p className="mt-1 text-xs font-semibold text-fg">{item.label}</p><p className="mt-1 break-all text-[0.64rem] text-fg-3">[{item.reads.join(", ") || "—"}] → [{item.writes.join(", ") || "—"}]</p></div>)}</div></details> : null)}</div><div className="mt-3 grid gap-2 md:grid-cols-3">{program.fusedGroups.filter((item) => item.passIds.length > 1).map((item) => <div key={item.id} className={SUB}><p className="text-[0.65rem] font-black uppercase text-accent">Fused {item.phase}</p><p className="mt-1 text-xs font-bold text-fg">{item.passIds.join(" + ")}</p></div>)}</div></section>

    <section className={CARD}><h3 className="text-sm font-black text-fg">품질·배선 게이트</h3><div className="mt-3 grid gap-2 lg:grid-cols-2">{program.gates.length === 0 ? <p className="rounded-xl border border-success/35 bg-success/5 p-4 text-sm font-bold text-success">모든 제품 게이트를 통과했습니다.</p> : program.gates.map((item) => <article key={item.id} className={`rounded-xl border p-3 ${item.severity === "error" ? "border-danger/35 bg-danger/5" : item.severity === "warning" ? "border-warning/35 bg-warning/5" : "border-line bg-bg-2/40"}`}><div className="flex justify-between gap-2"><p className="text-sm font-black text-fg">{item.title}</p><span className="text-[0.65rem] font-black text-fg-3">{item.severity}</span></div><p className="mt-1 text-xs text-fg-2">{item.detail}</p>{item.fix ? <p className="mt-2 text-[0.68rem] text-fg-3">조치: {item.fix}</p> : null}</article>)}</div></section>
  </section>;
}
