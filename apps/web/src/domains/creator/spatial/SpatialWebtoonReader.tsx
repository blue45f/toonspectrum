import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { StudioWebXrSessionError, studioWebXrSessionErrorMessage } from "../studio-webxr-session";
import {
  resolveSpatialReaderImageSource, loadSpatialReaderPreferences, moveSpatialReaderCursor,
  normalizeSpatialReaderSettings, resolveSpatialReaderCursor, saveSpatialReaderPreferences,
  spatialReaderCrops, spatialReaderKeyCommand, validateSpatialReaderFiles, SPATIAL_READER_DEFAULTS,
} from "./spatial-reader-model";
import "./spatial-reader.css";
import type { StudioWebXrMode, StudioWebXrSessionState, StudioWebXrSupportSnapshot } from "../studio-webxr-session";
import type { SpatialImageSize, SpatialReaderCommand, SpatialReaderCursor, SpatialReaderDirection, SpatialReaderSettings } from "./spatial-reader-model";
import type { SpatialReaderRuntime } from "./spatial-reader-runtime";

export interface SpatialWebtoonReaderProps {
  pages?: readonly string[];
  workId?: string;
  title?: string;
  direction?: SpatialReaderDirection;
  onClose: () => void;
}
const EMPTY_PAGES: readonly string[] = [];
function initialPreferences(id: string, direction?: SpatialReaderDirection) {
  try {
    const state = loadSpatialReaderPreferences(window.localStorage, id);
    return { ...state, settings: { ...state.settings, ...(direction ? { direction } : {}) } };
  } catch { return { cursor: { page: 0, segment: 0 }, settings: { ...SPATIAL_READER_DEFAULTS, ...(direction ? { direction } : {}) } }; }
}
const UNSUPPORTED = { kind: "toonspectrum.studio-webxr-support", version: 1, immersiveAr: "unsupported", immersiveVr: "unsupported" } as const;
export default function SpatialWebtoonReader({ pages: initialPages = EMPTY_PAGES, workId = "local:spatial-preview", title = "나의 공간 웹툰", direction, onClose }: SpatialWebtoonReaderProps) {
  const [initial] = useState(() => initialPreferences(workId, direction));
  const [settings, setSettings] = useState<SpatialReaderSettings>(initial.settings);
  const [cursor, setCursor] = useState<SpatialReaderCursor>(initial.cursor);
  const [localPages, setLocalPages] = useState<string[] | null>(null);
  const [localTitle, setLocalTitle] = useState("");
  const [sizes, setSizes] = useState<Record<number, SpatialImageSize>>({});
  const [support, setSupport] = useState<StudioWebXrSupportSnapshot | null>(null);
  const [state, setState] = useState<StudioWebXrSessionState>({ status: "idle" });
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("기기 지원을 확인합니다. 2D 읽기는 카메라·로그인 없이 사용할 수 있습니다.");
  const [error, setError] = useState("");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SpatialReaderRuntime | null>(null);
  const closeStarted = useRef(false);
  const titleId = useId();
  const helpId = useId();
  const pages = localPages ?? initialPages;
  const documentId = localPages ? "local:imported" : workId;
  const displayTitle = localTitle || title;
  const current = resolveSpatialReaderCursor(cursor, pages.length, sizes, settings.segments);
  const crops = spatialReaderCrops(sizes[current.page], settings.segments);
  const crop = crops[current.segment]!;
  const first = current.page === 0 && current.segment === 0;
  const last = current.page === pages.length - 1 && current.segment === crops.length - 1;
  const imageReady = !!sizes[current.page];
  const transitioning = state.status === "requesting" || state.status === "ending";
  const presenting = state.status === "presenting" || state.status === "ending";
  const edit = (patch: Partial<SpatialReaderSettings>) => setSettings((value) => normalizeSpatialReaderSettings({ ...value, ...patch }));
  const close = async () => {
    if (closeStarted.current) return;
    closeStarted.current = true; setClosing(true);
    try { await runtimeRef.current?.dispose(); } finally { onClose(); }
  };
  const command = (action: SpatialReaderCommand) => {
    if (action === "exit") { void runtimeRef.current?.end(); return; }
    if (action === "recenter") { runtimeRef.current?.recenter(); return; }
    if (action === "nearer" || action === "farther") { edit({ distance: settings.distance + (action === "nearer" ? -0.25 : 0.25) }); return; }
    if (action === "smaller" || action === "larger") { edit({ scale: settings.scale + (action === "smaller" ? -0.1 : 0.1) }); return; }
    setError(""); setCursor((value) => moveSpatialReaderCursor(value, action, pages.length, sizes, settings.segments));
  };
  const receiveCommand = useEffectEvent(command);
  const receiveSize = useEffectEvent((page: number, size: SpatialImageSize, source: string) => {
    if (pages[page] !== source) return;
    setSizes((old) => old[page]?.width === size.width && old[page]?.height === size.height ? old : { ...old, [page]: size });
  });
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    return () => { if (typeof dialog.close === "function" && dialog.open) dialog.close(); };
  }, []);
  useEffect(() => () => { localPages?.forEach((url) => URL.revokeObjectURL(url)); }, [localPages]);
  useEffect(() => {
    let stopped = false;
    let owned: SpatialReaderRuntime | null = null;
    if (!navigator.xr || globalThis.isSecureContext !== true) {
      setSupport({ ...UNSUPPORTED, secureContext: globalThis.isSecureContext === true });
      setMessage(globalThis.isSecureContext !== true ? "AR/VR에는 HTTPS 보안 연결이 필요합니다. 여기서는 2D로 읽을 수 있습니다." : "이 브라우저에는 몰입형 WebXR이 없습니다. 헤드셋 없이 2D 읽기·구간 이동·설정 저장을 사용할 수 있습니다.");
      return;
    }
    void import("./spatial-reader-runtime").then(async ({ createSpatialReaderRuntime }) => {
      if (stopped || !canvasRef.current || !overlayRef.current) return;
      owned = createSpatialReaderRuntime({
        canvas: canvasRef.current, overlayRoot: overlayRef.current,
        onCommand: (action) => { if (!stopped) receiveCommand(action); },
        onState: (next) => { if (!stopped) { setState(next); if (next.status === "error") setError(studioWebXrSessionErrorMessage(next.code)); } },
        onSize: (page, size, source) => { if (!stopped) receiveSize(page, size, source); },
        onMessage: (next) => { if (!stopped) setMessage(next); },
        onError: (next) => { if (!stopped) setError(next); },
      });
      runtimeRef.current = owned;
      const capabilities = await owned.inspectSupport();
      if (stopped) return;
      setSupport(capabilities); setReady(true);
      setMessage(capabilities.immersiveAr === "unsupported" && capabilities.immersiveVr === "unsupported" ? "현재 연결된 기기에서 AR/VR을 시작할 수 없습니다. 2D 읽기는 그대로 사용할 수 있습니다." : "준비됐습니다. AR/VR 버튼을 눌러야 기기 권한을 요청합니다. 불편함이 느껴지면 즉시 종료하세요.");
    }).catch((cause: unknown) => {
      if (!stopped) setError(cause instanceof Error ? cause.message : "공간 그래픽을 준비하지 못했습니다. 2D 읽기를 이용해 주세요.");
    });
    return () => {
      stopped = true; runtimeRef.current = null;
      if (owned) void owned.dispose();
    };
  }, []);
  useEffect(() => { runtimeRef.current?.update({ pages, cursor, sizes, settings }); }, [pages, cursor, sizes, settings, ready]);
  useEffect(() => {
    if (!pages.length || !sizes[current.page]) return;
    try { setStorageUnavailable(!saveSpatialReaderPreferences(window.localStorage, documentId, settings, { page: current.page, segment: current.segment })); }
    catch { setStorageUnavailable(true); }
  }, [documentId, settings, current.page, current.segment, sizes, pages.length]);
  const start = (mode: StudioWebXrMode) => {
    setError(""); const runtime = runtimeRef.current;
    if (!runtime || !ready) return;
    // Invoke immediately from the button; the runtime loaded before user activation.
    void runtime.start(mode).catch((cause: unknown) => setError(cause instanceof StudioWebXrSessionError ? studioWebXrSessionErrorMessage(cause.code) : cause instanceof Error ? cause.message : "기기 세션을 시작하지 못했습니다."));
  };
  const importFiles = (files: FileList | null) => {
    if (!files || presenting || transitioning) return;
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
    const validation = validateSpatialReaderFiles(sorted);
    if (validation) { setError(validation); return; }
    const urls: string[] = [];
    try { for (const file of sorted) urls.push(URL.createObjectURL(file)); }
    catch {
      urls.forEach((url) => URL.revokeObjectURL(url));
      setError("로컬 이미지를 열지 못했습니다. 기존 읽기는 유지합니다."); return;
    }
    setSizes({}); setCursor({ page: 0, segment: 0 });
    setLocalTitle(`${sorted.length}장의 로컬 원고`); setLocalPages(urls); setError("");
    setMessage("파일명 숫자 순서로 열었습니다. 이미지는 서버로 업로드하지 않으며 닫으면 임시 주소를 해제합니다.");
  };
  const onReaderKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const action = spatialReaderKeyCommand(event.key, settings.direction);
    if (action && imageReady) { event.preventDefault(); command(action); }
  };
  const imageSource = resolveSpatialReaderImageSource(pages[current.page], document.baseURI);
  return (
    <dialog ref={dialogRef} className="spatial-reader" aria-labelledby={titleId} aria-describedby={helpId}
      data-theme={settings.theme} onCancel={(event) => { event.preventDefault(); void close(); }}>
      <header className="spatial-reader-header">
        <div><p className="spatial-reader-eyebrow">TOONSTUDIO · SPATIAL READER</p><h2 id={titleId}>{displayTitle}</h2></div>
        <button type="button" className="spatial-reader-close" disabled={closing} onClick={() => { void close(); }} aria-label="공간 리더 닫기">{closing ? "종료 중" : "닫기 ×"}</button>
      </header>
      <p id={helpId} className="spatial-reader-intro">집중해서 한 구간씩, 또는 공간에 펼쳐 읽으세요. 원고는 수정하지 않습니다.</p>
      <div className="spatial-reader-layout">
        <main className="spatial-reader-main">
          <section className="spatial-reader-preview" aria-label="공간 웹툰 2D 읽기">
            {pages.length === 0 ? <div className="spatial-reader-empty"><span aria-hidden>▤</span><h3>원고를 공간에 펼쳐 보세요</h3><p>이미지를 선택하면 바로 읽을 수 있습니다.<br />계정·API 키·유료 변환은 필요하지 않습니다.</p></div>
              : !imageSource ? <p role="alert">지원하지 않는 이미지 주소입니다. 원본 보기로 돌아가 주세요.</p>
              : <div className="spatial-reader-crop" style={{ aspectRatio: `${crop.width} / ${crop.height}`, width: `min(100%, ${480 * settings.scale}px)` }}>
                <img key={`${current.page}:${pages[current.page]}`} src={imageSource} referrerPolicy="no-referrer" alt={`${displayTitle} ${current.page + 1}페이지 · ${current.segment + 1}구간`}
                  style={{ transform: `translateY(-${crop.y / (sizes[current.page]?.height ?? crop.height) * 100}%)` }}
                  onLoad={(event) => { const img = event.currentTarget; setSizes((old) => old[current.page]?.width === img.naturalWidth && old[current.page]?.height === img.naturalHeight ? old : { ...old, [current.page]: { width: img.naturalWidth, height: img.naturalHeight } }); }}
                  onError={() => setError("원본 이미지를 불러오지 못했습니다. 네트워크 또는 이미지 파일을 확인해 주세요.")} />
              </div>}
          </section>
          <canvas ref={canvasRef} className="spatial-reader-xr-canvas" aria-hidden="true" />
          <div ref={overlayRef} className="spatial-reader-overlay">
            <div className="spatial-reader-toolbar" data-spatial-xr-controls>
              <nav aria-label="공간 웹툰 읽기 조작" className="spatial-reader-navigation">
                <button type="button" onKeyDown={onReaderKeyDown} disabled={!imageReady || first || closing} onClick={() => command("previous")}>이전 구간</button>
                <span role="status" aria-live="polite">{pages.length ? `${current.page + 1} / ${pages.length} 페이지 · ${current.segment + 1} / ${crops.length} 구간` : "이미지 없음"}</span>
                <button type="button" onKeyDown={onReaderKeyDown} disabled={!imageReady || last || closing} onClick={() => command("next")}>다음 구간</button>
              </nav>
              <div className="spatial-reader-mode-buttons">
                {presenting ? <>
                  <button type="button" onClick={() => command("recenter")} disabled={transitioning}>중앙 정렬 / 다시 배치</button>
                  <button type="button" onClick={() => command("smaller")} disabled={transitioning}>축소</button>
                  <button type="button" onClick={() => command("larger")} disabled={transitioning}>확대</button>
                  <button type="button" className="spatial-reader-primary" onClick={() => { void runtimeRef.current?.end().catch(() => setError("기기 시스템 메뉴에서 XR을 종료해 주세요.")); }} disabled={transitioning}>XR 종료 · 2D로 돌아가기</button>
                </> : <>
                  <button type="button" className="spatial-reader-primary" onClick={() => start("immersive-ar")} disabled={!ready || !pages.length || transitioning || closing || support?.immersiveAr === "unsupported"}>AR로 읽기</button>
                  <button type="button" className="spatial-reader-primary" onClick={() => start("immersive-vr")} disabled={!ready || !pages.length || transitioning || closing || support?.immersiveVr === "unsupported"}>VR로 읽기</button>
                  <span className="spatial-reader-quiet">{transitioning ? "기기 권한 확인 중…" : "현재 화면: 2D 읽기"}</span>
                </>}
              </div>
              <p className="spatial-reader-message" role="status">{message}</p>
              {error && <p className="spatial-reader-error" role="alert">{error}</p>}
            </div>
          </div>
          {pages.length > 1 && <label className="spatial-reader-page-jump">페이지 바로가기 <output>{current.page + 1} / {pages.length}</output>
            <input aria-label="공간 리더 페이지 바로가기" type="range" min={0} max={pages.length - 1} value={current.page} onChange={(event) => { setError(""); setCursor({ page: Number(event.target.value), segment: 0 }); }} />
          </label>}
          {crops.length > 1 && <label className="spatial-reader-page-jump">긴 원고 구간 <output>{current.segment + 1} / {crops.length}</output>
            <input aria-label="공간 리더 구간 바로가기" type="range" min={0} max={crops.length - 1} value={current.segment} onChange={(event) => setCursor({ page: current.page, segment: Number(event.target.value) })} />
          </label>}
        </main>
        <aside className="spatial-reader-settings" aria-label="공간 읽기 설정">
          <h3>나에게 맞는 읽기 공간</h3>
          <fieldset><legend>XR 배치</legend><div className="spatial-reader-presets">
            {[["focus", "집중", "한 구간"], ["arc", "곡면", "앞뒤 구간"], ["wall", "벽면", "나란히"]].map(([value, label, note]) =>
              <button key={value} type="button" aria-pressed={settings.layout === value} onClick={() => edit({ layout: value as SpatialReaderSettings["layout"] })}><strong>{label}</strong><small>{note}</small></button>)}
          </div></fieldset>
          {settings.layout !== "focus" && settings.distance < settings.scale * 1.35 && <p className="spatial-reader-quiet">가까운 거리·큰 원고에서는 겹침을 피하기 위해 앞뒤 구간을 숨깁니다. 거리를 늘리거나 크기를 줄이면 다시 펼쳐집니다.</p>}
          <label className="spatial-reader-check"><input type="checkbox" checked={settings.segments} onChange={(event) => { edit({ segments: event.target.checked }); setCursor({ page: current.page, segment: 0 }); }} />긴 세로 원고를 읽기 구간으로 나누기</label>
          <p className="spatial-reader-quiet">내용이 잘리지 않도록 구간을 겹칩니다. AI 컷 인식이 아닌 읽기 창 분할입니다.</p>
          <label>읽기 방향<select value={settings.direction} onChange={(event) => edit({ direction: event.target.value as SpatialReaderDirection })}>
            <option value="ltr">왼쪽 → 오른쪽</option><option value="rtl">오른쪽 → 왼쪽 (만화)</option>
          </select></label>
          <label>관람 거리 <output>{settings.distance.toFixed(2)}m</output><input aria-label="XR 관람 거리" type="range" min={1} max={5} step={0.25} value={settings.distance} onChange={(event) => edit({ distance: Number(event.target.value) })} /></label>
          <label>원고 크기 <output>{Math.round(settings.scale * 100)}%</output><input aria-label="공간 원고 크기" type="range" min={0.5} max={1.8} step={0.1} value={settings.scale} onChange={(event) => edit({ scale: Number(event.target.value) })} /></label>
          <label>읽기 배경<select value={settings.theme} onChange={(event) => edit({ theme: event.target.value as SpatialReaderSettings["theme"] })}>
            <option value="night">야간 상영관</option><option value="paper">밝은 갤러리</option><option value="sepia">따뜻한 서재</option>
          </select></label>
          <label>XR 화질<select value={settings.quality} disabled={presenting || transitioning} onChange={(event) => edit({ quality: event.target.value as SpatialReaderSettings["quality"] })}>
            <option value="battery">절전 · 1K 텍스처</option><option value="balanced">균형 · 1.5K 텍스처</option><option value="sharp">선명 · 2K 텍스처</option>
          </select></label>
          <label className="spatial-reader-check"><input type="checkbox" checked={settings.dwell} onChange={(event) => edit({ dwell: event.target.checked })} />고개 방향으로 버튼 1.4초 바라봐 선택</label>
          <p className="spatial-reader-quiet">기본은 꺼짐입니다. 눈 추적이 아니라 머리가 향하는 방향을 사용하며, 자동 카메라 이동은 없습니다.</p>
          <div className="spatial-reader-import">
            <label>내 원고 이미지 열기<input type="file" aria-label="공간 리더 원고 이미지 선택" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" multiple disabled={presenting || transitioning || closing} onChange={(event) => { importFiles(event.target.files); event.currentTarget.value = ""; }} /></label>
            <p className="spatial-reader-quiet">최대 64장 · 파일당 16MB · 합계 64MB<br />파일명 숫자 순서 · 서버 업로드 없음<br />XR에서 움직이는 GIF·WebP는 정지 이미지로 검토합니다.</p>
          </div>
          <details><summary>기기 지원과 조작 안내</summary><p>AR·VR 지원은 브라우저가 모드별로 판정합니다. 미지원 환경에서는 2D로 읽으세요. 지원 기기에서도 권한·정책에 따라 시작이 거절될 수 있습니다.</p><p>헤드셋 안의 버튼을 컨트롤러 또는 기기가 제공하는 손가락 집기로 선택합니다. 스틱은 한 번 기울일 때 한 구간씩 이동합니다. AR 표면 배치가 불가능하면 시점 앞 배치로 전환합니다.</p><p>2D 키보드: 이전·다음 버튼에 초점을 두고 방향키·PageUp/Down·Home/End. 실공간을 확보하고 앉은 자세부터 검토하세요. 불편하면 즉시 종료하세요. 이 설정은 기기 안전 인증을 의미하지 않습니다.</p></details>
          <button type="button" onClick={() => setSettings({ ...SPATIAL_READER_DEFAULTS, ...(direction ? { direction } : {}) })}>읽기 설정 초기화</button>
          <p className="spatial-reader-quiet">{storageUnavailable ? "브라우저 저장이 차단돼 이번 읽기 동안만 설정을 유지합니다." : localPages || workId.startsWith("local:") ? "설정만 이 브라우저에 저장합니다. 로컬 원고의 파일명·읽기 위치는 저장하지 않습니다." : "읽기 설정과 페이지·구간만 이 브라우저에 저장합니다. 카메라·방·기기 좌표는 저장하지 않습니다."}</p>
        </aside>
      </div>
    </dialog>
  );
}
