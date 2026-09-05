import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { resolveStudioBrushRenderFamily } from "../studio-brush";

import {
  brushLabCanCompose,
  brushLabSnapshotFromSource,
  composeBrushLabSnapshot,
  loadBrushLabSources,
  readBrushLabDraft,
  writeBrushLabDraft,
  type BrushLabSource,
} from "./studio-brush-lab-model";
import {
  BRUSH_LAB_SLOTS,
  createBrushLabRevisionGate,
  editBrushLabHistory,
  enumerateBrushLabVariants,
  redoBrushLabHistory,
  undoBrushLabHistory,
  type BrushLabHistory,
  type BrushLabRecipe,
  type BrushLabSlot,
} from "./studio-brush-lab-transaction";
import { sanitizeBrushSnapshot, type StudioBrushSnapshot, type StudioSavedBrush } from "./studio-brush-library";
import { StudioBrushEngineProgramControls } from "./StudioBrushEngineProgramControls";
import { StudioBrushEngineStackPanel, StudioBrushSaveAsCustomControls, StudioBrushWatercolorProgramControls } from "./StudioBrushEngineMixer";
import { StudioBrushLabAdvanced } from "./StudioBrushLabAdvanced";
import { StudioBrushLibraryPanel } from "./StudioBrushLibraryPanel";
import { StudioBrushDynamicsPreview } from "./StudioBrushStudio";

interface BrushLabVariant {
  readonly sourceName: string;
  readonly recipe: BrushLabRecipe;
  readonly snapshot: StudioBrushSnapshot;
}

const controlClass = "min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const buttonClass = "min-h-11 rounded-xl border border-line bg-card px-4 py-2 text-sm font-semibold text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const panelClass = "min-w-0 rounded-2xl border border-line bg-card/55 p-4";

function readInitialDraft(key: string): StudioBrushSnapshot {
  try { return readBrushLabDraft(globalThis.sessionStorage.getItem(key)); }
  catch { return readBrushLabDraft(null); }
}

function BrushLabPreview({ snapshot, label }: { snapshot: StudioBrushSnapshot; label: string }) {
  return (
    <section className="min-w-0" aria-label={label}>
      <h3 className="mb-2 text-sm font-bold text-fg">{label}</h3>
      {brushLabCanCompose(snapshot) ? (
        <div style={{ opacity: snapshot.brushOpacity }}>
          <StudioBrushDynamicsPreview settings={snapshot.brushDynamics} strokeWidth={snapshot.strokeWidth} color={snapshot.color} />
        </div>
      ) : (
        <p className="rounded-xl border border-line p-5 text-sm leading-relaxed text-fg-3">
          이 계열의 전체 물성 미리보기는 아직 이 제작실에 연결하지 않았습니다.
          저장 후 편집 캔버스의 내 브러시에서 확인하세요.
        </p>
      )}
    </section>
  );
}

/** Independent authoring surface: no document runtime, autosave owner, or second brush repository. */
export function StudioBrushLabPage({ editorHref, lifecycleKey }: {
  editorHref: string;
  lifecycleKey: string;
}) {
  const draftKey = `toonstudio-brush-lab:${lifecycleKey}`;
  const [history, setHistory] = useState<BrushLabHistory<StudioBrushSnapshot>>(() => ({
    past: [], present: readInitialDraft(draftKey), future: [],
  }));
  const snapshot = history.present;
  const [baseline, setBaseline] = useState(snapshot);
  const [savedBaseline, setSavedBaseline] = useState<StudioSavedBrush | null>(null);
  const [sources, setSources] = useState<readonly BrushLabSource[]>([]);
  const [catalogStatus, setCatalogStatus] = useState("브러시 카탈로그를 불러오는 중입니다.");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [recipe, setRecipe] = useState<BrushLabRecipe>({});
  const [variantSlot, setVariantSlot] = useState<BrushLabSlot>("tip");
  const [variants, setVariants] = useState<readonly BrushLabVariant[]>([]);
  const [brushes, setBrushes] = useState<StudioSavedBrush[]>([]);
  const [tab, setTab] = useState<"compose" | "library">("compose");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [draftWarning, setDraftWarning] = useState("");
  const gate = useRef(createBrushLabRevisionGate());

  useEffect(() => {
    const controller = gate.current;
    const previousTitle = document.title;
    document.title = "브러시 제작실 · ToonStudio";
    return () => { controller.invalidate(); document.title = previousTitle; };
  }, []);

  useEffect(() => {
    let active = true;
    void loadBrushLabSources().then((result) => {
      if (!active) return;
      setSources(result.sources);
      setCatalogStatus(`${result.sources.length}개 기반 프리셋 · ${result.unavailable}개 로딩 불가`);
    }).catch(() => {
      if (active) setCatalogStatus("카탈로그를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.");
    });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const draft = writeBrushLabDraft(snapshot);
        if (!draft) {
          setDraftWarning("초안 용량이 커 임시 복구를 중단했습니다. 내 브러시에 저장해 주세요.");
          return;
        }
        globalThis.sessionStorage.setItem(draftKey, draft);
        setDraftWarning("");
      } catch {
        setDraftWarning("이 브라우저에서는 초안 복구를 사용할 수 없습니다. 저장 또는 파일 내보내기를 이용해 주세요.");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftKey, snapshot]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ko-KR");
    return sources.filter((source) => `${source.name} ${source.id} ${source.mediaGroup}`.toLocaleLowerCase("ko-KR").includes(term));
  }, [sources, query]);
  const donors = filtered.filter((source) => source.selection.brushDynamics !== null);
  const family = resolveStudioBrushRenderFamily(snapshot.brushId);
  const canCompose = brushLabCanCompose(snapshot);
  const currentName = snapshot.sourcePresetName ?? snapshot.brushId;

  function cancelPending() {
    gate.current.invalidate();
    setBusy(false);
    setVariants([]);
  }

  function commit(next: StudioBrushSnapshot, expected?: StudioBrushSnapshot) {
    cancelPending();
    const normalized = sanitizeBrushSnapshot(next).snapshot;
    setHistory((current) => editBrushLabHistory(current, normalized, expected));
    setStatus("");
  }

  function selectSource(id: string) {
    const source = sources.find((item) => item.id === id);
    if (!source) return;
    commit(brushLabSnapshotFromSource(snapshot, source.selection));
    setSavedBaseline(null);
    setRecipe({});
    setStatus("기반 프리셋을 바꿨습니다. 이전 조합은 되돌리기로 복구할 수 있습니다.");
  }

  function changeRecipe(slot: BrushLabSlot, id: string) {
    cancelPending();
    setRecipe((current) => ({ ...current, [slot]: id }));
    setStatus("");
  }

  async function applyRecipe() {
    const ticket = gate.current.begin();
    setBusy(true);
    setStatus("");
    setVariants([]);
    const result = await composeBrushLabSnapshot(snapshot, recipe, sources, () => gate.current.isCurrent(ticket));
    if (!gate.current.isCurrent(ticket)) return;
    setBusy(false);
    if (result.ok) {
      commit(result.snapshot);
      setStatus("선택한 특성을 한 번에 적용했습니다. 원래 기반 엔진과 시드는 유지됩니다.");
    } else {
      setStatus("조합을 적용하지 않았습니다. 호환되는 기반과 소스를 확인해 주세요. 현재 브러시는 바뀌지 않았습니다.");
    }
  }

  async function exploreVariants() {
    const ticket = gate.current.begin();
    setBusy(true);
    setStatus("");
    setVariants([]);
    const plans = enumerateBrushLabVariants(recipe, variantSlot, donors.map((source) => source.id));
    const unique = new Map<string, BrushLabVariant>();
    const original = JSON.stringify(snapshot.brushDynamics);
    for (const plan of plans) {
      const result = await composeBrushLabSnapshot(snapshot, plan, sources, () => gate.current.isCurrent(ticket));
      if (!gate.current.isCurrent(ticket)) return;
      if (!result.ok) continue;
      const signature = JSON.stringify(result.snapshot.brushDynamics);
      if (signature === original || unique.has(signature)) continue;
      unique.set(signature, {
        sourceName: sources.find((source) => source.id === plan[variantSlot])?.name ?? "변형",
        recipe: plan, snapshot: result.snapshot,
      });
    }
    setVariants([...unique.values()]);
    setBusy(false);
    setStatus(`${plans.length}개 후보에서 서로 다른 설정 ${unique.size}개를 만들었습니다. 시각적 차이의 보장은 아니며, 선택 후 비교해 주세요.`);
  }

  return (
    <main className="min-h-screen bg-bg p-3 text-fg sm:p-6" data-testid="studio-brush-lab">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-xs font-semibold tracking-widest text-accent">TOONSTUDIO / BRUSH LAB</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">나만의 브러시를 조합하세요</h1>
            <p className="mt-2 text-sm text-fg-3">기반 엔진은 유지하고, 서로 다른 브러시의 촉·질감·반응을 가져옵니다.</p>
          </div>
          <Link to={editorHref} target="_blank" rel="noopener noreferrer" className={buttonClass}>편집 캔버스 열기 ↗</Link>
        </header>
        <div className="flex flex-wrap gap-2" aria-label="제작실 보기">
          <button type="button" className={buttonClass} aria-pressed={tab === "compose"} onClick={() => setTab("compose")}>조합 작업대</button>
          <button type="button" className={buttonClass} aria-pressed={tab === "library"} onClick={() => setTab("library")}>내 브러시 · 가져오기 / 내보내기</button>
        </div>
        {draftWarning && <p role="status" className="rounded-xl border border-warn p-3 text-sm text-warn">{draftWarning}</p>}
        {tab === "library" ? (
          <section className={panelClass} aria-label="공유 브러시 라이브러리">
            <h2 className="mb-3 text-lg font-bold">편집기와 같은 내 브러시</h2>
            <StudioBrushLibraryPanel currentSnapshot={snapshot} brushes={brushes} onBrushesChange={setBrushes}
              activeBrushId={savedBaseline?.id ?? null}
              onApplyBrush={(brush) => { commit(brush); setSavedBaseline(brush); setRecipe({}); setTab("compose"); }}
              onBrushDeleted={(deleted) => { if (savedBaseline?.id === deleted.brush.id) setSavedBaseline(null); }} />
          </section>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
            <aside className={`${panelClass} space-y-4`} aria-label="기반 엔진 선택">
              <h2 className="text-base font-bold">01 · 기반 프리셋</h2>
              <p className="text-xs leading-relaxed text-fg-3">프리셋 이름과 실제 렌더 계열은 다릅니다. 같은 계열의 별칭을 독립 엔진 수로 세지 않습니다.</p>
              <label className="block text-sm">프리셋 · 소스 검색
                <input className={`${controlClass} mt-2`} value={query} onChange={(event) => { cancelPending(); setQuery(event.currentTarget.value); }} placeholder="이름, 재질, 식별자" />
              </label>
              <label className="block text-sm">기반 브러시
                <select className={`${controlClass} mt-2`} value={snapshot.sourcePresetId ?? snapshot.brushId} onChange={(event) => selectSource(event.currentTarget.value)}>
                  <option value={snapshot.sourcePresetId ?? snapshot.brushId}>현재: {currentName}</option>
                  {filtered.filter((source) => source.id !== (snapshot.sourcePresetId ?? snapshot.brushId)).map((source) => <option key={source.id} value={source.id}>{source.name} · {source.mediaGroup}</option>)}
                </select>
              </label>
              <p className="text-xs text-fg-3" role="status">{catalogStatus}</p>
              <button className={buttonClass} type="button" onClick={() => setReload((value) => value + 1)}>다시 불러오기</button>
              <div className="rounded-xl border border-line p-3 text-sm">
                <p>실행 계열: <strong>{family}</strong></p>
                <p className="mt-1 text-xs text-fg-3">기반 변경 시 해당 프리셋 기본값을 복원합니다.</p>
              </div>
              {!canCompose && <button className={buttonClass} type="button" disabled={!sources.some((source) => source.id === "ink-particle")} onClick={() => selectSource("ink-particle")}>특성 합성: 잉크 입자로 시작</button>}
              <StudioBrushLabAdvanced snapshot={snapshot} baseline={savedBaseline} onChange={commit} />
            </aside>
            <div className="min-w-0 space-y-4">
              <section className={`${panelClass} space-y-4`} aria-label="브러시 비교">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold">02 · 설정 비교</h2>
                  <div className="flex flex-wrap gap-2">
                    <button className={buttonClass} type="button" disabled={!history.past.length} onClick={() => { cancelPending(); setHistory(undoBrushLabHistory); }}>되돌리기</button>
                    <button className={buttonClass} type="button" disabled={!history.future.length} onClick={() => { cancelPending(); setHistory(redoBrushLabHistory); }}>다시 실행</button>
                    <button className={buttonClass} type="button" onClick={() => setBaseline(snapshot)}>현재를 A로 고정</button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <BrushLabPreview snapshot={baseline} label="A · 고정한 기준" />
                  <BrushLabPreview snapshot={snapshot} label="B · 현재 설정" />
                </div>
                <p className="text-xs leading-relaxed text-fg-3">동적 팁의 고정 입력 샘플이며 표시 굵기는 최대 28px로 제한합니다. 전체 물성·입력 보정·최종 캔버스 출력과의 픽셀 일치를 의미하지 않습니다. 성능 점수는 측정값이 아닌 추정입니다.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm">굵기 · {snapshot.strokeWidth}px<input className="mt-2 h-11 w-full accent-accent" type="range" min="1" max="80" value={snapshot.strokeWidth} onChange={(event) => commit({ ...snapshot, strokeWidth: Number(event.currentTarget.value) })} /></label>
                  <label className="text-sm">불투명도 · {Math.round(snapshot.brushOpacity * 100)}%<input className="mt-2 h-11 w-full accent-accent" type="range" min="0.05" max="1" step="0.01" value={snapshot.brushOpacity} onChange={(event) => commit({ ...snapshot, brushOpacity: Number(event.currentTarget.value) })} /></label>
                  <label className="text-sm">색상<input className={`${controlClass} mt-2`} type="color" value={snapshot.color} onChange={(event) => commit({ ...snapshot, color: event.currentTarget.value })} /></label>
                </div>
              </section>
              <section className={`${panelClass} space-y-4`} aria-label="특성 조합">
                <h2 className="text-base font-bold">03 · 특성 가져오기 계획</h2>
                <p className="text-xs leading-relaxed text-fg-3">빈 슬롯은 현재 설정을 유지합니다. 필압·종이·촉을 서로 다른 소스에서 가져올 수 있습니다. 겹치는 묶음 설정은 제외했습니다.</p>
                <fieldset disabled={!canCompose} className="grid min-w-0 gap-3 md:grid-cols-2">
                  <legend className="sr-only">8개 독립 특성 슬롯</legend>
                  {BRUSH_LAB_SLOTS.map((slot) => <label className="min-w-0 text-sm" key={slot.id}>{slot.label}<span className="ml-2 text-xs text-fg-3">{slot.description}</span>
                    <select className={`${controlClass} mt-2`} value={recipe[slot.id] ?? ""} onChange={(event) => changeRecipe(slot.id, event.currentTarget.value)}>
                      <option value="">현재 설정 유지</option>
                      {recipe[slot.id] && !donors.some((source) => source.id === recipe[slot.id]) && <option value={recipe[slot.id]}>{sources.find((source) => source.id === recipe[slot.id])?.name ?? recipe[slot.id]}</option>}
                      {donors.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                    </select>
                  </label>)}
                </fieldset>
                {!canCompose && <p role="status" className="text-sm text-warn">이 기반은 8슬롯 합성 대상이 아닙니다. 잉크 입자·에어브러시·드라이 미디어 계열을 선택하세요. 유화·수채 프로그램은 별도로 편집할 수 있습니다.</p>}
                <button className={buttonClass} type="button" disabled={!canCompose || busy || !Object.values(recipe).some(Boolean)} onClick={() => void applyRecipe()}>특성 조합 적용</button>
                <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
                  <label className="min-w-40 flex-1 text-sm">한 가지 특성만 바꿔 탐색
                    <select className={`${controlClass} mt-2`} value={variantSlot} onChange={(event) => { cancelPending(); setVariantSlot(event.currentTarget.value as BrushLabSlot); }}>{BRUSH_LAB_SLOTS.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select>
                  </label>
                  <button className={buttonClass} type="button" disabled={!canCompose || busy || !donors.length} onClick={() => void exploreVariants()}>변형 후보 만들기 · 최대 12개</button>
                </div>
                <p className="text-xs text-fg-3">검색 결과의 앞쪽 소스를 사용합니다. 다른 재질을 검색해 탐색 범위를 바꿀 수 있습니다. 설정 중복은 제거하지만 비슷하게 보일 수 있습니다.</p>
                {variants.length > 0 && <div className="grid gap-2 sm:grid-cols-2" aria-label="생성한 변형 후보">{variants.map((variant, index) => <button className={`${buttonClass} text-left`} key={`${index}-${variant.sourceName}`} type="button" onClick={() => { commit(variant.snapshot); setRecipe(variant.recipe); }}>{index + 1}. {variant.sourceName} · 비교하기</button>)}</div>}
                <p role="status" aria-live="polite" className="min-h-5 text-sm text-fg-2">{busy ? "조합 소스를 확인하고 있습니다." : status}</p>
              </section>
            </div>
            <aside className="min-w-0 space-y-4" aria-label="프로그램과 저장">
              <StudioBrushEngineStackPanel brushId={snapshot.brushId} settings={snapshot.brushDynamics} enginePrograms={snapshot.enginePrograms} />
              {family === "oil" && <StudioBrushEngineProgramControls brushId={snapshot.brushId} programSet={snapshot.enginePrograms} onChange={(enginePrograms) => commit({ ...snapshot, enginePrograms })} />}
              {family === "watercolor" && <StudioBrushWatercolorProgramControls brushId={snapshot.brushId} programSet={snapshot.enginePrograms} onChange={(enginePrograms) => commit({ ...snapshot, enginePrograms })} />}
              <StudioBrushSaveAsCustomControls snapshot={snapshot} baseBrushName={currentName} />
              <p className="px-2 text-xs leading-relaxed text-fg-3">이 제작실의 초안은 탭 임시 보관입니다. 저장한 브러시는 기존 라이브러리를 사용합니다. 저장소가 세션 모드이면 파일로 내보내 주세요. 외부 라이브러리를 선택하는 실행 백엔드 UI는 아직 연결하지 않았습니다.</p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
