/**
 * ExportPanel: 투명 PNG(해상도 입력) · 레시피 저장/불러오기 · GLB · 레이어 PSD(ID 마스크·참조 패스 옵션) · 진행/실패 표시.
 * 엔진은 useEngineSession().engine()으로 클릭 시점에 ref 접근하고, 출력 크기는 입력값만 쓴다(뷰포트 크기 유도 금지).
 * 저장은 export/download.browser `saveBytes`(Blob URL revoke 보장)이며 테스트는 deps.save를 주입한다.
 */
import { useCallback, useId, useState, useSyncExternalStore } from "react";

import { CAMERA_FRAMING_MODES, DEFAULT_FRAMING, failVisible } from "../../../contracts";
import { saveBytes } from "../../../export/download.browser";
import { MAX_PNG_EXPORT_DIMENSION, MAX_PSD_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportGlb, exportLayeredPsd, exportRecipe, exportTransparentPng } from "../../../export/export-session";
import { installPsdBrowserCanvas } from "../../../export/psd-canvas.browser";
import { RECIPE_FILE_SUFFIX, extractPaintLayers, parseRecipeFile } from "../../../export/recipe-file";
import { uploadReplacedLayers } from "../../../paint/paint-bridge";
import { getDefaultPaintSession } from "../../../paint/paint-session";
import { useDispatch, useEngineSession, useLabState } from "../lab-store-context";

import type { CameraFramingMode, EngineStatus, LabFailure } from "../../../contracts";
import type { ExportKind, ExportReceipt } from "../../../export/export-session";
import type { SaveBytesFn } from "../../../export/save-bytes";
import type { PaintSession } from "../../../paint/paint-session";

export interface ExportPanelDeps {
  readonly save?: SaveBytesFn;
  readonly now?: () => number;
  readonly readFile?: (file: File) => Promise<string>;
  /** PSD 조립 전 ag-psd 캔버스 팩토리 등록(기본: psd-canvas.browser, 멱등). 테스트는 스텁을 주입한다. */
  readonly preparePsd?: () => void;
}

export interface ExportPanelProps {
  readonly session?: PaintSession;
  readonly deps?: ExportPanelDeps;
}

const FRAMING_LABELS_KO: Record<CameraFramingMode, string> = { "full-body": "전신", bust: "상반신", face: "얼굴", custom: "현재 카메라" };

/** File → 텍스트(Blob.text가 없는 환경은 FileReader) */
export function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽을 수 없습니다."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

function useEngineStatus(): EngineStatus {
  const engineSession = useEngineSession();
  return useSyncExternalStore(
    (listener) => engineSession.subscribe(() => listener()),
    () => engineSession.status(),
    () => engineSession.status(),
  );
}

function describeReceipt(receipt: ExportReceipt): string {
  const size = receipt.width && receipt.height ? ` · ${receipt.width}×${receipt.height}` : "";
  const psd = receipt.psd ? ` · 레이어 ${receipt.psd.layerCount}(그룹 ${receipt.psd.groupCount}) · 재합성 MAE ${receipt.psd.recomposeMae.toFixed(2)}` : "";
  return `${receipt.fileName} (${receipt.bytes.toLocaleString("ko-KR")} B${size}${psd} · ${receipt.durationMs} ms)`;
}

export function ExportPanel({ session = getDefaultPaintSession(), deps = {} }: ExportPanelProps) {
  const save = deps.save ?? saveBytes;
  const now = deps.now ?? (() => Date.now());
  const readFile = deps.readFile ?? readTextFile;
  const preparePsd = deps.preparePsd ?? installPsdBrowserCanvas;
  const ids = useId();
  const labState = useLabState();
  const dispatch = useDispatch();
  const engineSession = useEngineSession();
  const engineStatus = useEngineStatus();
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [framing, setFraming] = useState<CameraFramingMode>("full-body");
  const [settleSteps, setSettleSteps] = useState(0);
  const [includeIdMasks, setIncludeIdMasks] = useState(true);
  const [includeReferencePasses, setIncludeReferencePasses] = useState(false);
  const [busy, setBusy] = useState<ExportKind | "import" | null>(null);
  const [receipt, setReceipt] = useState<ExportReceipt | null>(null);
  const [failure, setFailure] = useState<LabFailure | null>(null);

  const engineReady = engineStatus.phase === "ready";
  const framingValue = { ...DEFAULT_FRAMING, mode: framing };

  const finish = useCallback(
    (outcome: { ok: true; bytes: Uint8Array; receipt: ExportReceipt } | { ok: false; failure: LabFailure }): void => {
      if (!outcome.ok) {
        setFailure(outcome.failure);
        return;
      }
      const saved = save(outcome.receipt.fileName, outcome.bytes, outcome.receipt.mime);
      if (!saved.ok) {
        setFailure(saved.failure);
        return;
      }
      setFailure(null);
      setReceipt(outcome.receipt);
    },
    [save],
  );

  const requireEngine = useCallback(() => {
    const engine = engineSession.engine();
    if (!engine) setFailure(failVisible("export-no-engine", "엔진이 준비되지 않아 내보낼 수 없습니다. 먼저 렌더 backend를 선택하세요.", undefined, now()));
    return engine;
  }, [engineSession, now]);

  const run = useCallback(
    async (kind: ExportKind | "import", task: () => Promise<void>): Promise<void> => {
      if (busy) return;
      setBusy(kind);
      try {
        await task();
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

  const onPng = (): void => {
    void run("png", async () => {
      const engine = requireEngine();
      if (!engine) return;
      finish(await exportTransparentPng(engine, { width, height, framing: framingValue, settleSteps }, { now }));
    });
  };

  const onPsd = (): void => {
    void run("psd", async () => {
      const engine = requireEngine();
      if (!engine) return;
      try {
        preparePsd();
      } catch (error) {
        setFailure(failVisible("export-psd-canvas", "PSD 캔버스 팩토리를 등록할 수 없어 PSD를 만들 수 없습니다.", error, now()));
        return;
      }
      finish(await exportLayeredPsd(engine, session.layersForExport(), { width, height, framing: framingValue, settleSteps, includeIdMasks, includeReferencePasses }, { now }));
    });
  };

  const onGlb = (): void => {
    void run("glb", async () => {
      const engine = requireEngine();
      if (!engine) return;
      finish(await exportGlb(engine, labState.recipe, { now }));
    });
  };

  const onRecipeSave = (): void => {
    void run("recipe", async () => {
      finish(await exportRecipe(labState.recipe, session.layersForExport(), { now }));
    });
  };

  const onRecipeFile = (file: File | undefined): void => {
    if (!file) return;
    void run("import", async () => {
      let text: string;
      try {
        text = await readFile(file);
      } catch (error) {
        setFailure(failVisible("recipe-file-read", `${file.name}: 파일을 읽을 수 없습니다.`, error, now()));
        return;
      }
      const parsed = parseRecipeFile(text, now());
      if (!parsed.ok) {
        setFailure(parsed.failure);
        return;
      }
      const paint = await extractPaintLayers(parsed.recipe, now());
      // recipe/load는 스토어가 이전 레이어를 가리키는 페인트 undo 이력을 비운다. 엔진 텍스처는 여기서 새 세션과 맞춘다.
      dispatch({ type: "recipe/load", recipe: parsed.recipe });
      const previousLayers = session.layersForExport();
      session.replaceLayers(paint.layers);
      const engine = engineSession.engine();
      // 새 파일에 없는 부위의 이전 칠이 뷰포트에 남지 않도록 사라진 부위는 빈 레이어로 비운다(엔진 페인트 텍스처에는 제거 API가 없다).
      if (engine) uploadReplacedLayers(previousLayers, session.layersForExport(), (layer) => engine.updatePaintTexture(layer));
      const firstFailure = paint.failures[0];
      setFailure(firstFailure ?? null);
      setReceipt({ kind: "recipe", fileName: file.name, mime: "application/json", bytes: text.length, durationMs: 0 });
    });
  };

  const clampInt = (value: string, min: number, max: number, fallback: number): number => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };

  return (
    <section className="cl-export-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>내보내기</h2>
      {!engineReady ? (
        <p className="cl-export-hint" role="status">
          엔진 상태: {engineStatus.phase} — PNG·PSD·GLB는 엔진이 준비된 뒤 사용할 수 있습니다. 레시피 저장/불러오기는 가능합니다.
        </p>
      ) : null}
      <div className="cl-export-row">
        <label htmlFor={`${ids}-width`}>너비(px)</label>
        <input id={`${ids}-width`} type="number" min={MIN_EXPORT_DIMENSION} max={MAX_PNG_EXPORT_DIMENSION} value={width} onChange={(event) => setWidth(clampInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, width))} />
        <label htmlFor={`${ids}-height`}>높이(px)</label>
        <input id={`${ids}-height`} type="number" min={MIN_EXPORT_DIMENSION} max={MAX_PNG_EXPORT_DIMENSION} value={height} onChange={(event) => setHeight(clampInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, height))} />
      </div>
      <div className="cl-export-row">
        <label htmlFor={`${ids}-framing`}>프레이밍</label>
        <select id={`${ids}-framing`} value={framing} onChange={(event) => setFraming(event.target.value as CameraFramingMode)}>
          {CAMERA_FRAMING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {FRAMING_LABELS_KO[mode]}
            </option>
          ))}
        </select>
        <label htmlFor={`${ids}-settle`}>물리 settle 스텝</label>
        <input id={`${ids}-settle`} type="number" min={0} max={MAX_SETTLE_STEPS} value={settleSteps} onChange={(event) => setSettleSteps(clampInt(event.target.value, 0, MAX_SETTLE_STEPS, 0))} />
      </div>
      <div className="cl-export-actions">
        <button type="button" onClick={onPng} disabled={!engineReady || busy !== null}>
          투명 PNG 저장
        </button>
        <button type="button" onClick={onGlb} disabled={!engineReady || busy !== null}>
          GLB 저장
        </button>
        <button type="button" onClick={onRecipeSave} disabled={busy !== null}>
          레시피 저장
        </button>
        <label className="cl-export-file" htmlFor={`${ids}-file`}>
          레시피 불러오기
          <input id={`${ids}-file`} type="file" accept={`${RECIPE_FILE_SUFFIX},.json,application/json`} disabled={busy !== null} onChange={(event) => onRecipeFile(event.target.files?.[0])} />
        </label>
      </div>
      <fieldset className="cl-export-psd">
        <legend>레이어 PSD (최대 {MAX_PSD_EXPORT_DIMENSION}px)</legend>
        <label htmlFor={`${ids}-idmask`}>
          <input id={`${ids}-idmask`} type="checkbox" checked={includeIdMasks} onChange={(event) => setIncludeIdMasks(event.target.checked)} /> 부위 ID 마스크 포함
        </label>
        <label htmlFor={`${ids}-ref`}>
          <input id={`${ids}-ref`} type="checkbox" checked={includeReferencePasses} onChange={(event) => setIncludeReferencePasses(event.target.checked)} /> 참조 패스(깊이·법선) 포함
        </label>
        <button type="button" onClick={onPsd} disabled={!engineReady || busy !== null}>
          레이어 PSD 저장
        </button>
      </fieldset>
      {busy ? (
        <p className="cl-export-progress" role="status" aria-live="polite">
          {busy === "import" ? "레시피 불러오는 중…" : `${busy.toUpperCase()} 내보내는 중…`}
        </p>
      ) : null}
      {receipt ? (
        <p className="cl-export-receipt" role="status">
          저장됨: {describeReceipt(receipt)}
        </p>
      ) : null}
      {failure ? (
        <p className="cl-export-failure" role="alert">
          실패({failure.code}): {failure.reasonKo}
        </p>
      ) : null}
    </section>
  );
}
