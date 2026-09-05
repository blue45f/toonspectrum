import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { normalizeStudioBrushDynamicsSettings } from "../brush/studio-brush-dynamics";
import { STUDIO_BRUSH_MIX_TRAIT_SECTIONS, stabilizeStudioBrushMixQuality } from "../brush/studio-brush-engine-mix";
import { sanitizeBrushSnapshot } from "../brush/studio-brush-library";
import { materializeStudioBrushCatalogSelection } from "../brush/studio-brush-selection";
import {
  StudioBrushEngineStackPanel, StudioBrushSaveAsCustomControls, StudioBrushWatercolorProgramControls,
} from "../brush/StudioBrushEngineMixer";
import { StudioBrushEngineProgramControls } from "../brush/StudioBrushEngineProgramControls";
import { StudioBrushDynamicsPreview, StudioBrushStudio } from "../brush/StudioBrushStudio";
import { BRUSH_PRESETS, resolveStudioBrushRenderFamily } from "../studio-brush";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  BRUSH_LAB_SLOT_IDS, commitBrushLabHistory, createBrushLabRecipe, generateBrushLabVariants,
  moveBrushLabHistory, updateBrushLabSlot,
} from "./brush-lab-recipe";
import {
  BRUSH_LAB_MAX_IMPORT_BYTES, brushLabDocumentFromSelection, brushLabSnapshotKey,
  canComposeBrushLabTraits, compileBrushLabRecipe, createInitialBrushLabDocument,
  readBrushLabJson, writeBrushLabJson,
} from "./brush-lab-runtime";

import type { BrushLabHistory, BrushLabRecipe } from "./brush-lab-recipe";
import type { BrushLabDocument } from "./brush-lab-runtime";
import type { NormalizedStudioBrushDynamicsSettings } from "../brush/studio-brush-dynamics";
import type { StudioBrushSnapshot } from "../brush/studio-brush-library";

const BUTTON = `min-h-11 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${STUDIO_FOCUS_RING}`;
const INPUT = `min-h-11 w-full min-w-0 rounded-xl border border-line bg-card px-3 text-sm text-fg ${STUDIO_FOCUS_RING}`;
const CARD = "min-w-0 rounded-2xl border border-line bg-card/45 p-4";
interface CatalogItem { id: string; name: string }
interface Candidate { recipe: BrushLabRecipe; document: BrushLabDocument }
const CORE_ITEMS: CatalogItem[] = BRUSH_PRESETS.filter((item) => item.operation === "paint").map(({ id, name }) => ({ id, name }));

export function StudioBrushLabPage() {
  const [history, setHistory] = useState<BrushLabHistory<BrushLabDocument>>(() => ({
    past: [], present: createInitialBrushLabDocument(), future: [],
  }));
  const document = history.present;
  const snapshot = document.snapshot;
  const [reference, setReference] = useState(document);
  const [recipe, setRecipe] = useState(() => createBrushLabRecipe(document.carrierId));
  const [items, setItems] = useState(CORE_ITEMS);
  const [query, setQuery] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [mutationCount, setMutationCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("소스를 선택하지 않은 속성은 현재 설정을 유지합니다.");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const request = useRef(0);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const portable = canComposeBrushLabTraits(document);
  const family = resolveStudioBrushRenderFamily(snapshot.brushId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = items.filter((item) => `${item.name} ${item.id}`.toLocaleLowerCase().includes(normalizedQuery));

  useEffect(() => {
    mounted.current = true;
    const currentUrls = urls.current;
    const currentTimers = timers.current;
    const reqRef = request;
    return () => {
      mounted.current = false;
      reqRef.current++;
      for (const url of currentUrls) URL.revokeObjectURL(url);
      for (const timer of currentTimers) clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError("");
    void import("../brush/studio-brush-catalog").then((catalog) => {
      if (!active) return;
      const merged = new Map(CORE_ITEMS.map((item) => [item.id, item]));
      for (const item of catalog.STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS) merged.set(item.id, { id: item.id, name: item.name });
      setItems([...merged.values()]);
    }).catch(() => {
      if (active) setCatalogError("확장 카탈로그를 불러오지 못했습니다. 기본 브러시는 계속 사용할 수 있습니다.");
    }).finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [catalogRevision]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function invalidate() {
    request.current++;
    setBusy(false);
    setCandidates([]);
    setError("");
  }
  function commit(next: BrushLabDocument) {
    invalidate();
    setHistory((current) => commitBrushLabHistory(current, next));
    // Manual edits become the new baseline. A locked slot with no donor freezes that value.
    setRecipe((current) => ({
      ...createBrushLabRecipe(next.carrierId, current.seed),
      slots: current.slots.map((slot) => ({ ...slot, sourceId: null, locked: next.carrierId === current.carrierId && slot.locked })),
    }));
    setDirty(true);
  }
  function patch(values: Partial<StudioBrushSnapshot>) {
    commit({ ...document, snapshot: sanitizeBrushSnapshot({ ...snapshot, ...values }).snapshot });
  }
  function changeRecipe(next: BrushLabRecipe) { invalidate(); setRecipe(next); }
  function move(direction: "undo" | "redo") {
    invalidate();
    const next = moveBrushLabHistory(history, direction);
    setHistory(next);
    setRecipe(createBrushLabRecipe(next.present.carrierId, recipe.seed));
    setDirty(true);
    setMessage(direction === "undo" ? "이전 브러시로 되돌렸습니다." : "브러시 변경을 다시 적용했습니다.");
  }
  async function run(task: (token: number) => Promise<void>) {
    const token = ++request.current;
    setBusy(true);
    setError("");
    try { await task(token); }
    catch (reason) {
      if (mounted.current && token === request.current) setError(reason instanceof Error ? reason.message : "작업을 완료하지 못했습니다.");
    } finally { if (mounted.current && token === request.current) setBusy(false); }
  }
  function active(token: number) { return mounted.current && token === request.current; }
  async function selectCarrier(id: string, dynamics?: NormalizedStudioBrushDynamicsSettings) {
    await run(async (token) => {
      const selection = await materializeStudioBrushCatalogSelection(id);
      if (!selection) throw new Error("선택한 캐리어를 찾을 수 없습니다.");
      const next = brushLabDocumentFromSelection(selection, snapshot);
      if (!active(token)) return;
      commit(dynamics ? { ...next, snapshot: { ...next.snapshot, brushDynamics: dynamics } } : next);
      setMessage("캐리어 기본값을 불러왔습니다. 이전 엔진 오버라이드는 초기화했습니다. 되돌리기로 복구할 수 있습니다.");
    });
  }
  async function applyRecipe() {
    await run(async (token) => {
      const next = await compileBrushLabRecipe(recipe, document);
      if (!active(token)) return;
      if (brushLabSnapshotKey(next) === brushLabSnapshotKey(document)) { setMessage("현재 설정과 동일한 조합입니다."); return; }
      commit(next);
      setMessage("속성 조합을 적용했습니다. 소스 선택은 비워졌으며, 결과 설정이 다음 조합의 기준이 됩니다.");
    });
  }
  async function generate() {
    await run(async (token) => {
      const plans = generateBrushLabVariants(recipe, filtered.map((item) => item.id), 8, mutationCount);
      const seen = new Set([brushLabSnapshotKey(document)]);
      const next: Candidate[] = [];
      let rejected = 0;
      let firstRejection = "";
      for (const plan of plans) {
        if (!active(token)) return;
        try {
          const candidate = await compileBrushLabRecipe(plan, document);
          const key = brushLabSnapshotKey(candidate);
          if (!seen.has(key)) { seen.add(key); next.push({ recipe: plan, document: candidate }); }
        } catch (reason) { rejected++; firstRejection ||= reason instanceof Error ? reason.message : "소스 로딩 실패"; }
      }
      if (!active(token)) return;
      setCandidates(next);
      setMessage(next.length
        ? `${next.length}개의 서로 다른 설정 후보를 만들었습니다.${rejected ? ` 사용할 수 없는 후보 ${rejected}개는 제외했습니다.` : ""} 시각적 차이는 비교 후 확인하세요.`
        : `새 후보가 없습니다. 잠금을 풀거나 소스 검색 범위를 넓혀 보세요.${firstRejection ? ` 확인 내용: ${firstRejection}` : ""}`);
    });
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    await run(async (token) => {
      if (file.size > BRUSH_LAB_MAX_IMPORT_BYTES) throw new Error("1MB 이하의 브러시 JSON만 가져올 수 있습니다.");
      const result = readBrushLabJson(await file.text());
      if (!active(token)) return;
      commit(result.document);
      setMessage(result.adjustedFields.length ? `브러시를 가져왔습니다. 보정된 필드: ${result.adjustedFields.join(", ")}` : "브러시와 엔진 프로그램을 가져왔습니다. 아직 내 브러시에 저장되지 않았습니다.");
    });
  }
  function exportFile() {
    try {
      const text = writeBrushLabJson(document);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      urls.current.add(url);
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = "toonstudio-custom-brush.json";
      window.document.body.append(anchor); anchor.click(); anchor.remove();
      const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); timers.current.delete(timer); }, 10000);
      timers.current.add(timer);
      setDirty(false);
      setMessage("엔진 프로그램이 포함된 JSON 다운로드를 요청했습니다. 파일 저장 여부는 브라우저에서 확인하세요.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "내보내기에 실패했습니다."); }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] bg-bg-2 px-4 py-6 text-fg sm:px-6" data-testid="studio-brush-lab">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-widest text-accent">TOONSTUDIO / BRUSH LAB</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">브러시 스튜디오</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-3">캐리어를 고르고, 서로 다른 브러시의 촉·질감·반응을 조합하세요. 마음에 드는 속성은 잠그고 새로운 변형만 탐색할 수 있습니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} disabled={busy} onClick={() => fileInput.current?.click()}>JSON 가져오기</button>
          <button type="button" className={BUTTON} disabled={busy} onClick={exportFile}>결과 내보내기</button>
          <a className={BUTTON} href="/studio" target="_blank" rel="noopener noreferrer">캔버스 열기 ↗</a>
          <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" aria-label="브러시 JSON 파일" onChange={(event) => void importFile(event)} />
        </div>
      </header>
      <p className="mb-4 text-xs leading-relaxed text-fg-3">독립 제작 공간입니다. 화면을 떠나기 전에 내 브러시에 저장하거나 JSON으로 내보내세요. 최종 물성은 새 탭의 캔버스에서 저장한 브러시를 선택해 확인하세요.</p>
      <div className="mb-4 rounded-xl border border-line bg-card p-3 text-sm" role="status" aria-live="polite">{busy ? "조합을 확인하고 있습니다…" : message}</div>
      {error ? <p role="alert" className="mb-4 rounded-xl border border-warn/40 p-3 text-sm text-warn">{error}</p> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className={CARD} aria-label="캐리어와 탐색 조건">
          <h2 className="text-base font-bold">01 / 기본 캐리어</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">실제 도포 엔진을 결정합니다. 캐리어 변경은 명시적인 기본값 교체이며 되돌릴 수 있습니다.</p>
          <label className="mt-4 block text-xs font-semibold">카탈로그 검색
            <input className={`${INPUT} mt-2`} value={query} disabled={busy} onChange={(event) => { invalidate(); setQuery(event.currentTarget.value); }} placeholder="수채, 잉크, 연필…" />
          </label>
          <label className="mt-3 block text-xs font-semibold">캐리어 선택
            <select className={`${INPUT} mt-2`} value={document.carrierId} disabled={busy} onChange={(event) => void selectCarrier(event.currentTarget.value)}>
              {!filtered.some((item) => item.id === document.carrierId) ? <option value={document.carrierId}>{document.name} (현재)</option> : null}
              {filtered.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs text-fg-3">검색 결과 {filtered.length}개 / 현재 카탈로그 {items.length}개{catalogLoading ? " · 확장 목록 로딩 중" : ""}</p>
          {catalogError ? <div className="mt-3 text-xs text-warn" role="alert"><p>{catalogError}</p><button type="button" className={`${BUTTON} mt-2`} onClick={() => setCatalogRevision((value) => value + 1)}>확장 목록 다시 불러오기</button></div> : null}
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-sm font-bold">변형 탐색</h3>
            <label className="mt-3 block text-xs font-semibold">재현 시드
              <input type="number" min={0} max={4294967295} step={1} className={`${INPUT} mt-2`} disabled={busy} value={recipe.seed} onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) changeRecipe({ ...recipe, seed: value });
              }} />
            </label>
            <label className="mt-3 block text-xs font-semibold">후보당 바꿀 속성 수
              <select className={`${INPUT} mt-2`} value={mutationCount} disabled={busy} onChange={(event) => { invalidate(); setMutationCount(Number(event.currentTarget.value)); }}>
                {[1, 2, 3, 4, 6, 8].map((count) => <option key={count} value={count}>{count}개</option>)}
              </select>
            </label>
            <p className="mt-3 text-xs leading-relaxed text-fg-3">현재 검색 결과 안에서 최대 8개 후보를 만듭니다. 같은 기준 설정·카탈로그·시드는 같은 결과를 냅니다. 잠근 속성은 바꾸지 않습니다.</p>
            <button type="button" className={`${BUTTON} mt-3 w-full`} disabled={busy || !portable || !filtered.length || recipe.slots.every((slot) => slot.locked)} onClick={() => void generate()}>잠금 유지 · 변형 생성</button>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <section className={CARD} aria-labelledby="brush-lab-composition-heading">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="brush-lab-composition-heading" className="text-base font-bold">02 / 속성 조합</h2><span className="text-xs text-fg-3">{recipe.slots.filter((slot) => slot.locked).length}/8 잠금</span></div>
            <p className="mt-2 text-xs leading-relaxed text-fg-3">각 행에서 다른 브러시의 속성만 가져옵니다. 잠금은 변형 생성에서 해당 행의 소스 선택을 고정합니다. 선택만으로 현재 브러시를 덮어쓰지 않습니다.</p>
            {!portable ? <p role="status" className="mt-3 rounded-xl border border-warn/40 p-3 text-xs text-warn">이 캐리어에서는 입자 속성 조합을 활성화하지 않습니다. 유화·수채는 지원되는 물성 프로그램을 사용하고, 입자 조합은 잉크 입자·에어브러시·드라이 미디어 등의 호환 캐리어를 선택하세요.</p> : null}
            <fieldset disabled={busy || !portable} className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2"><legend className="sr-only">브러시 속성별 소스</legend>
              {BRUSH_LAB_SLOT_IDS.map((id) => {
                const slot = recipe.slots.find((item) => item.id === id)!;
                const definition = STUDIO_BRUSH_MIX_TRAIT_SECTIONS.find((item) => item.id === id)!;
                return <div key={id} className="min-w-0 rounded-xl border border-line bg-bg-2/50 p-3">
                  <div className="flex items-center justify-between gap-2"><label htmlFor={`brush-lab-${id}`} className="text-xs font-bold">{definition.label}</label><button type="button" className="min-h-11 min-w-11 rounded-lg border border-line px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-label={`${definition.label} 잠금`} aria-pressed={slot.locked} onClick={() => changeRecipe(updateBrushLabSlot(recipe, id, { locked: !slot.locked }))}>{slot.locked ? "잠김" : "잠금"}</button></div>
                  <select id={`brush-lab-${id}`} className={`${INPUT} mt-2`} value={slot.sourceId ?? ""} onChange={(event) => changeRecipe(updateBrushLabSlot(recipe, id, { sourceId: event.currentTarget.value || null }))}>
                    <option value="">현재 설정 유지</option>
                    {slot.sourceId && !filtered.some((item) => item.id === slot.sourceId) ? <option value={slot.sourceId}>{items.find((item) => item.id === slot.sourceId)?.name ?? slot.sourceId} (선택됨)</option> : null}
                    {filtered.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select><p className="mt-2 text-xs leading-relaxed text-fg-3">{definition.description}</p>
                </div>;
              })}
            </fieldset>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={busy || !portable || recipe.slots.every((slot) => slot.sourceId === null)} onClick={() => void applyRecipe()}>선택한 속성 적용</button><button type="button" className={BUTTON} disabled={busy} onClick={() => changeRecipe(createBrushLabRecipe(document.carrierId, recipe.seed))}>소스·잠금 초기화</button></div>
          </section>
          <section className={CARD} aria-labelledby="brush-lab-preview-heading">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="brush-lab-preview-heading" className="text-base font-bold">03 / 설정 비교</h2><button type="button" className={BUTTON} disabled={busy} onClick={() => setReference(document)}>현재 설정을 A로 고정</button></div>
            <p className="my-3 text-xs leading-relaxed text-fg-3">아래는 공통 도장·펜촉·동역학 비교입니다. 전체 불투명도, 유화 릴리프, 수채 정착 및 캐리어별 최종 합성은 포함하지 않습니다.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><h3 className="mb-2 text-xs font-semibold">A · {reference.name}</h3><StudioBrushDynamicsPreview settings={reference.snapshot.brushDynamics} strokeWidth={reference.snapshot.strokeWidth} color={reference.snapshot.color} /></div>
              <div><h3 className="mb-2 text-xs font-semibold">B · {document.name}</h3><StudioBrushDynamicsPreview settings={snapshot.brushDynamics} strokeWidth={snapshot.strokeWidth} color={snapshot.color} /></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={busy || !history.past.length} onClick={() => move("undo")}>되돌리기</button><button type="button" className={BUTTON} disabled={busy || !history.future.length} onClick={() => move("redo")}>다시 적용</button><button type="button" className={BUTTON} disabled={busy} onClick={() => { commit(reference); setMessage("비교 기준 A를 복원했습니다."); }}>A 복원</button></div>
          </section>
          {candidates.length ? <section className={CARD} aria-labelledby="brush-lab-candidates-heading"><h2 id="brush-lab-candidates-heading" className="text-base font-bold">변형 후보 · 선택 전에는 적용하지 않음</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{candidates.map((candidate, index) => <article className="min-w-0 rounded-xl border border-line p-3" key={index}><h3 className="mb-2 text-sm font-semibold">후보 {index + 1}</h3><StudioBrushDynamicsPreview settings={candidate.document.snapshot.brushDynamics} strokeWidth={snapshot.strokeWidth} color={snapshot.color} /><p className="my-2 text-xs text-fg-3">{candidate.recipe.slots.filter((slot) => slot.sourceId).map((slot) => STUDIO_BRUSH_MIX_TRAIT_SECTIONS.find((item) => item.id === slot.id)?.label).join(" · ")}</p><button type="button" className={`${BUTTON} w-full`} disabled={busy} onClick={() => { commit(candidate.document); setMessage(`후보 ${index + 1}을 적용했습니다. 되돌리기로 이전 설정을 복구할 수 있습니다.`); }}>이 후보 사용</button></article>)}</div></section> : null}
        </div>

        <aside className="min-w-0 space-y-4 lg:col-span-2 xl:col-span-1" aria-label="물성 프로그램과 저장">
          <section className={CARD}><h2 className="text-base font-bold">상세 편집</h2><fieldset disabled={busy} className="mt-3 space-y-3"><legend className="sr-only">현재 브러시 설정</legend>
            <label className="block text-xs font-semibold">표시·내보내기 이름<input className={`${INPUT} mt-2`} maxLength={120} value={document.name} onChange={(event) => commit({ ...document, name: event.currentTarget.value })} /></label>
            <label className="block text-xs font-semibold">굵기 · {snapshot.strokeWidth}px<input className="mt-2 min-h-11 w-full accent-accent" type="range" min={1} max={80} step={1} value={snapshot.strokeWidth} onChange={(event) => patch({ strokeWidth: Number(event.currentTarget.value) })} /></label>
            <label className="flex min-h-11 items-center justify-between gap-3 text-xs font-semibold">색상<input type="color" className="h-11 w-16 rounded-lg" value={snapshot.color} onChange={(event) => patch({ color: event.currentTarget.value })} /></label>
            <StudioBrushStudio brushId={snapshot.brushId} strokeWidth={snapshot.strokeWidth} color={snapshot.color} currentSnapshot={snapshot} settings={snapshot.brushDynamics}
              onSettingsChange={(settings) => patch({ brushDynamics: settings })}
              onSelectDynamicsPreset={(id, settings) => void selectCarrier(id, settings)}
              useVelocityPressure={snapshot.useVelocityPressure} onUseVelocityPressureChange={(value) => patch({ useVelocityPressure: value })}
              velocitySensitivity={snapshot.velocitySensitivity} onVelocitySensitivityChange={(value) => patch({ velocitySensitivity: value })}
              pressureCurve={snapshot.pressureCurve} onPressureCurveChange={(value) => patch({ pressureCurve: value })}
              pressureMinSize={snapshot.pressureMinSize} onPressureMinSizeChange={(value) => patch({ pressureMinSize: value })}
              tiltEnabled={snapshot.tiltEnabled} onTiltEnabledChange={(value) => patch({ tiltEnabled: value })}
              tipAngle={snapshot.tipAngle} onTipAngleChange={(value) => patch({ tipAngle: value })}
              tipRoundness={snapshot.tipRoundness} onTipRoundnessChange={(value) => patch({ tipRoundness: value })}
              onEngineProgramsChange={(enginePrograms) => patch({ enginePrograms })}
              onRestoreDefaults={(transaction, direction) => patch(direction === "undo" ? transaction.before : transaction.after)} />
            {family === "oil" ? <StudioBrushEngineProgramControls brushId={snapshot.brushId} programSet={snapshot.enginePrograms} onChange={(enginePrograms) => patch({ enginePrograms })} /> : null}
            <StudioBrushWatercolorProgramControls brushId={snapshot.brushId} programSet={snapshot.enginePrograms} onChange={(enginePrograms) => patch({ enginePrograms })} />
          </fieldset></section>
          <section className={CARD}><h2 className="mb-3 text-base font-bold">실행 구성과 비용</h2><p className="mb-3 text-xs leading-relaxed text-fg-3">품질 점수와 작업량은 설정 기반 추정치입니다. 기기별 프레임 시간이나 실제 화질을 측정한 벤치마크가 아닙니다.</p><StudioBrushEngineStackPanel brushId={snapshot.brushId} settings={snapshot.brushDynamics} enginePrograms={snapshot.enginePrograms} /><button type="button" className={`${BUTTON} mt-3 w-full`} disabled={busy || !portable} onClick={() => { patch({ brushDynamics: normalizeStudioBrushDynamicsSettings(stabilizeStudioBrushMixQuality(snapshot.brushDynamics)) }); setMessage("보수적 안정화를 적용했습니다. 원래 표현은 되돌리기로 복구할 수 있습니다."); }}>보수적 안정화 적용</button></section>
          <StudioBrushSaveAsCustomControls key={document.carrierId} snapshot={snapshot} baseBrushName={document.name} />
          <p className="px-2 text-xs leading-relaxed text-fg-3">내 브러시 저장은 기존 제품 저장소를 사용합니다. 영구 저장소를 쓸 수 없으면 저장 카드가 세션 보관 여부를 안내합니다. 이동 가능한 백업은 이 화면의 결과 내보내기를 사용하세요.</p>
        </aside>
      </div>
    </main>
  );
}
