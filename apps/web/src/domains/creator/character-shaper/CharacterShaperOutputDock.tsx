/**
 * Character Shaper — output dock.
 *
 * Left: the three reference tools (each button owns the drawer it opens). Middle: 표면 드로잉.
 * Right: transparent background, "캔버스에 추가" (the host's own insert path), a transparent PNG
 * download and the semantic PSD export. The PSD run reports progress while it renders and then a
 * receipt that names the layer count and every skipped pass — nothing is ever silently dropped.
 *
 * On mobile the dock collapses to icon buttons (labels move into `aria-label`) plus a "더 보기"
 * sheet that carries the background and the two file exports.
 */
import { Camera, Ellipsis, FileImage, ImageDown, Images, Layers, Paintbrush, Video } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { roundExportSize } from "../vrm/studio-vrm-poser-helpers";
import { encodeStudioVrmCapturePngBlob, captureStudioVrmRgba } from "../vrm/studio-vrm-raster-capture";

import { acquireCharacterExportSession, CHARACTER_EXPORT_EDGES, characterExportSize } from "./character-shaper-export";
import { boundCharacterSemanticCaptureSize, exportCharacterSemanticPsd } from "./character-shaper-semantic-psd";
import { pushCharacterShaperKeyLayer } from "./character-shaper-ui-model";

import type { CharacterExportEdge, CharacterExportSession } from "./character-shaper-export";
import type { CharacterShaperDrawerMode, CharacterShaperOutputDockProps } from "./character-shaper-ui-contract";
import type { VrmLibraryEntry } from "../vrm/vrm-library";
import type { ReactNode } from "react";
import type { Camera as ThreeCamera } from "three";

import { cn } from "@/shared/lib/utils";

type DrawerMode = Exclude<CharacterShaperDrawerMode, null>;
type ExportKind = "png" | "psd";

interface DockNotice {
  readonly tone: "info" | "good" | "bad";
  readonly text: string;
  readonly detail?: string;
}

const DRAWER_BUTTONS: readonly { readonly id: DrawerMode; readonly label: string; readonly icon: typeof Images }[] = [
  { id: "reference", label: "참고 이미지 AI 추천", icon: Images },
  { id: "photo", label: "사진 포즈", icon: Camera },
  { id: "webcam", label: "웹캠", icon: Video },
];

const NOTICE_MS = 9000;

const BUTTON = cn(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.74rem] font-semibold text-fg-2",
  "transition-colors duration-150 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

const ICON_BUTTON = cn(
  "grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-2",
  "transition-colors duration-150 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

const ACTIVE_BUTTON = "border-accent/60 bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent";

const PRIMARY_BUTTON = cn(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-accent/60 bg-accent px-3 text-[0.74rem] font-semibold text-on-accent",
  "transition-colors duration-150 hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

function safeFileStem(name: string): string {
  const cleaned = name.normalize("NFKC").replace(/[\\/:*?"<>|\s]+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
  return cleaned.length > 0 ? cleaned.slice(0, 48) : "character";
}

function timestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Anchor click download; blocked or unsupported environments report instead of failing silently. */
function downloadBlob(blob: Blob, fileName: string): boolean {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || typeof document === "undefined") {
    return false;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function CharacterShaperOutputDock({
  h,
  binding,
  drawer,
  onOpenDrawer,
  paintActive,
  onTogglePaint,
  compact,
}: CharacterShaperOutputDockProps) {
  const sheetId = useId();
  const aliveRef = useRef(true);
  const hostRef = useRef(h);
  const exportRef = useRef<CharacterExportSession | null>(null);
  const helperLeaseRef = useRef<(() => void) | null>(null);
  const [exportEdge, setExportEdge] = useState<CharacterExportEdge>(2048);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const [running, setRunning] = useState<ExportKind | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [notice, setNotice] = useState<DockNotice | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => { hostRef.current = h; });
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      exportRef.current?.cancel();
      helperLeaseRef.current?.();
      helperLeaseRef.current = null;
    };
  }, []);
  useEffect(() => () => {
    exportRef.current?.cancel();
    helperLeaseRef.current?.();
    helperLeaseRef.current = null;
  }, [h.vrm, h.activeModelId]);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!sheetOpen) return;
    const panel = sheetRef.current;
    panel?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel?.contains(target) || sheetTriggerRef.current?.contains(target)) return;
      setSheetOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    const release = pushCharacterShaperKeyLayer((event) => {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSheetOpen(false);
      sheetTriggerRef.current?.focus({ preventScroll: true });
      return true;
    }, window);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      release();
    };
  }, [sheetOpen]);

  const capturing = Boolean(h.isCapturing || h.isSharingPose || h.isThumbnailCapturing);
  const modelReady = h.status === "ready";
  const transparent = Boolean(h.transparentBackground);
  const insertBackgroundColor: string =
    typeof h.insertBackgroundColor === "string" ? h.insertBackgroundColor : "#ffffff";
  const paintDisabledReason: string =
    typeof h.texturePaintDisabledReason === "string" ? h.texturePaintDisabledReason : "";
  const paintBlocked = paintDisabledReason.length > 0;
  const entries: readonly VrmLibraryEntry[] = Array.isArray(h.libraryEntries) ? h.libraryEntries : [];
  const modelName = entries.find((entry) => entry.id === h.activeModelId)?.name ?? "character";
  const exportBusy = running !== null;
  const auditionActive = binding.previewEntryId != null;
  const exportBlocked = capturing || !modelReady || exportBusy || binding.busyReason !== null || auditionActive;

  const fail = (text: string, detail?: string) => {
    if (!aliveRef.current) return;
    setNotice({ tone: "bad", text, detail });
  };

  const readCapture = (): { gl: unknown; scene: unknown; camera: unknown } | null => {
    const capture = h.captureRef?.current ?? null;
    if (!capture || !capture.gl || !capture.scene || !capture.camera) return null;
    return capture;
  };

  const runExport = (kind: ExportKind) => {
    if (exportBlocked || exportRef.current !== null) return;
    const capture = readCapture();
    if (!capture) { fail("캡처할 3D 장면이 아직 준비되지 않았습니다."); return; }
    if (!h.vrm) { fail("내보낼 캐릭터가 없습니다."); return; }
    let session: CharacterExportSession;
    try {
      session = acquireCharacterExportSession(h, () => hostRef.current);
    } catch (error) {
      fail(error instanceof Error ? error.message : "캡처를 시작하지 못했습니다.");
      return;
    }
    exportRef.current = session;
    setRunning(kind);
    setNotice(null);
    setProgress(kind === "png" ? "PNG로 굽는 중" : "레이어를 나누는 중 · 밑색 · 음영 · 하이라이트 · 주선");
    void (async () => {
      let releaseHelpers: (() => void) | undefined;
      try {
        // Let the host commit the capture lock so camera, animation and paint are frozen.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        session.assertCurrent();
        // Finish the frozen raw-bone pose and cloth solve before taking the first layer.
        h.vrm.update?.(0);
        for (const sync of h.wardrobeXpbdCaptureSyncRef?.current?.values() ?? []) {
          if (!sync().ok) throw new Error("의상 천 물리를 현재 포즈에 맞추지 못했습니다. 다시 시도해 주세요.");
        }
        const sourceCamera = capture.camera as ThreeCamera;
        const exportCamera = sourceCamera.clone?.() ?? sourceCamera;
        const gl = capture.gl as { domElement: HTMLCanvasElement };
        const display = roundExportSize(gl.domElement);
        const requested = characterExportSize(display.width, display.height, exportEdge);
        const size = kind === "psd" ? boundCharacterSemanticCaptureSize(requested.width, requested.height) : requested;
        releaseHelpers = h.acquireVrmCaptureHelperLease({ subjectOnly: kind === "psd" || transparent });
        helperLeaseRef.current = releaseHelpers ?? null;
        let blob: Blob;
        let receipt: DockNotice;
        if (kind === "png") {
          const rgba = captureStudioVrmRgba(capture.gl as never, capture.scene as never, exportCamera,
            size, transparent ? { alpha: 0 } : { color: insertBackgroundColor, alpha: 1 });
          // PNG owns immutable pixels now; restore helpers during worker encoding.
          releaseHelpers?.();
          releaseHelpers = undefined;
          helperLeaseRef.current = null;
          blob = await encodeStudioVrmCapturePngBlob(rgba, size, { signal: session.signal });
          receipt = { tone: "good", text: `PNG를 저장했습니다 · ${size.width}×${size.height}${transparent ? " · 투명 배경" : ""}` };
        } else {
          const result = await exportCharacterSemanticPsd({
            capture: { gl: capture.gl as never, scene: capture.scene as never, camera: exportCamera },
            vrm: h.vrm, width: size.width, height: size.height, title: modelName,
            signal: session.signal, assertCurrent: session.assertCurrent,
          });
          blob = result.blob;
          const skipped = result.receipt.skipped;
          receipt = {
            tone: skipped.length > 0 ? "info" : "good",
            text: `PSD 레이어 ${result.receipt.layerNames.length}개 저장 · ${size.width}×${size.height}${skipped.length > 0 ? ` · 건너뛴 패스 ${skipped.length}개` : ""}`,
            detail: skipped.length > 0 ? skipped.map((entry) => `${entry.pass}: ${entry.reason}`).join(" · ") : undefined,
          };
        }
        session.assertCurrent();
        if (!aliveRef.current) return;
        if (!downloadBlob(blob, `${safeFileStem(modelName)}-${timestamp()}.${kind}`)) {
          fail("이 브라우저에서는 파일을 내려받을 수 없습니다.");
          return;
        }
        setNotice(receipt);
      } catch (error) {
        if (session.signal.aborted) {
          if (aliveRef.current) setNotice({ tone: "info", text: "내보내기를 취소했습니다." });
        } else {
          fail(kind === "png" ? "PNG를 저장하지 못했습니다." : "PSD를 내보내지 못했습니다.",
            error instanceof Error ? error.message : undefined);
        }
      } finally {
        releaseHelpers?.();
        if (helperLeaseRef.current === releaseHelpers) helperLeaseRef.current = null;
        session.release();
        if (exportRef.current === session) {
          exportRef.current = null;
          if (aliveRef.current) { setRunning(null); setProgress(null); }
        }
      }
    })();
  };

  const savePng = () => runExport("png");
  const exportPsd = () => runExport("psd");

  const insert = () => {
    if (exportBlocked) return;
    h.handleInsert();
  };

  const transparentSwitch = (
    <button
      type="button"
      role="switch"
      aria-checked={transparent}
      disabled={capturing || exportBusy || auditionActive}
      title={
        transparent
          ? "투명 배경 · 캔버스와 PNG에 캐릭터만 남습니다"
          : `배경색 ${insertBackgroundColor.toUpperCase()}로 채웁니다`
      }
      onClick={() => h.setTransparentBackground(!transparent)}
      className={cn(BUTTON, transparent && ACTIVE_BUTTON)}
    >
      <span
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 rounded-sm border border-line-strong/70",
          transparent &&
            "[background-image:linear-gradient(45deg,oklch(0.75_0.01_80/0.5)_25%,transparent_25%),linear-gradient(-45deg,oklch(0.75_0.01_80/0.5)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,oklch(0.75_0.01_80/0.5)_75%),linear-gradient(-45deg,transparent_75%,oklch(0.75_0.01_80/0.5)_75%)] [background-position:0_0,0_3px,3px_-3px,-3px_0] [background-size:6px_6px]",
        )}
        style={transparent ? undefined : { backgroundColor: insertBackgroundColor }}
      />
      투명 배경
    </button>
  );

  const backgroundColorField = transparent ? null : (
    <label className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-2 text-[0.7rem] font-semibold text-fg-2">
      배경색
      <input
        type="color"
        value={insertBackgroundColor}
        disabled={capturing || exportBusy || auditionActive}
        aria-label="삽입 배경색"
        className="size-8 cursor-pointer rounded-md border border-line bg-panel p-0.5 disabled:cursor-not-allowed disabled:opacity-45"
        onChange={(event) => h.setInsertBackgroundColor(event.currentTarget.value)}
      />
    </label>
  );

  const pngButton = (icon: boolean): ReactNode => (
    <button
      type="button"
      disabled={exportBlocked}
      aria-label="PNG 저장"
      title={transparent ? "투명 배경 PNG로 저장" : "배경색을 포함한 PNG로 저장"}
      onClick={savePng}
      className={icon ? ICON_BUTTON : BUTTON}
    >
      <ImageDown size={16} aria-hidden />
      {icon ? null : "PNG 저장"}
    </button>
  );

  const psdButton = (icon: boolean): ReactNode => (
    <button
      type="button"
      disabled={exportBlocked}
      aria-label="PSD 내보내기"
      title="밑색 · 음영 · 하이라이트 · 주선을 레이어로 나눠 저장합니다"
      onClick={exportPsd}
      className={icon ? ICON_BUTTON : BUTTON}
    >
      <Layers size={16} aria-hidden />
      {icon ? null : "PSD 내보내기"}
    </button>
  );

  const exportSettings = (
    <label className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pb-1.5 text-[0.7rem] font-semibold text-fg-2">
      <span className="shrink-0">파일 긴 변</span>
      <select aria-label="파일 내보내기 해상도" value={exportEdge} disabled={exportBlocked}
        onChange={(event) => setExportEdge(Number(event.currentTarget.value) as CharacterExportEdge)}
        className={cn("min-h-11 shrink-0 rounded-lg border border-line bg-panel px-2 text-fg disabled:opacity-45", STUDIO_FOCUS_RING)}>
        {CHARACTER_EXPORT_EDGES.map((edge) => <option key={edge} value={edge}>{edge} px</option>)}
      </select>
      <span data-character-export-size-help="true" className={cn("min-w-0 text-fg-3", compact && "basis-full")}>비율 유지 · PSD 최대 2048 px</span>
    </label>
  );

  const statusLine = progress ?? notice?.text ?? (auditionActive
    ? "후보 미리보기 중 · 클릭해 확정하거나 Esc로 취소한 뒤 원고에 적용할 수 있습니다."
    : null);

  return (
    <div
      data-character-shaper-dock={compact ? "compact" : "wide"}
      className={cn("relative flex min-w-0 shrink-0 flex-wrap items-center border-t border-line bg-panel px-2 py-2", compact ? "gap-1" : "gap-1.5")}
    >
      {compact ? null : <div className="w-full">{exportSettings}</div>}
      <div role="group" aria-label="참고 도구" className="flex shrink-0 items-center gap-1">
        {DRAWER_BUTTONS.map((item) => {
          const Icon = item.icon;
          const open = drawer === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={open}
              aria-label={item.label}
              title={item.label}
              disabled={capturing || exportBusy}
              onClick={() => onOpenDrawer(item.id)}
              className={cn(compact ? ICON_BUTTON : BUTTON, open && ACTIVE_BUTTON)}
            >
              <Icon size={16} aria-hidden />
              {compact ? null : item.label}
            </button>
          );
        })}
      </div>

      <span aria-hidden className="mx-0.5 hidden h-6 w-px shrink-0 bg-line sm:block" />

      <button
        type="button"
        aria-pressed={paintActive}
        aria-keyshortcuts="B"
        aria-label="표면 드로잉"
        disabled={capturing || exportBusy || paintBlocked || (!paintActive && !modelReady)}
        title={paintBlocked ? paintDisabledReason : "모델 표면에 직접 그립니다 (B)"}
        onClick={onTogglePaint}
        className={cn(compact ? ICON_BUTTON : BUTTON, paintActive && ACTIVE_BUTTON)}
      >
        <Paintbrush size={16} aria-hidden />
        {compact ? null : "표면 드로잉"}
      </button>

      <div className={cn("ml-auto flex min-w-0 shrink-0 items-center", compact ? "gap-1" : "gap-1.5")}>
        {compact ? null : (
          <>
            {transparentSwitch}
            {backgroundColorField}
          </>
        )}
        <button
          type="button"
          disabled={exportBlocked}
          aria-label="캔버스에 추가"
          title={auditionActive ? "후보를 확정하거나 취소한 뒤 캔버스에 넣을 수 있습니다" : "지금 화면 그대로 현재 페이지에 넣습니다"}
          onClick={insert}
          className={compact ? cn(ICON_BUTTON, "border-accent/60 bg-accent text-on-accent hover:bg-accent-2") : PRIMARY_BUTTON}
        >
          <FileImage size={16} aria-hidden />
          {compact ? null : "캔버스에 추가"}
        </button>
        {compact ? (
          <button
            ref={sheetTriggerRef}
            type="button"
            aria-expanded={sheetOpen}
            aria-controls={sheetId}
            aria-label="내보내기 더 보기"
            title="내보내기 더 보기"
            onClick={() => setSheetOpen((open) => !open)}
            className={cn(ICON_BUTTON, sheetOpen && ACTIVE_BUTTON)}
          >
            <Ellipsis size={16} aria-hidden />
          </button>
        ) : (
          <>
            {pngButton(false)}
            {psdButton(false)}
          </>
        )}
      </div>

      {statusLine ? (
        <div className="absolute inset-x-2 bottom-full z-30 mb-2 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-lg">
          {/* Export feedback must not resize the camera between successive PNG/PSD captures. */}
          <p
            role="status"
            aria-live="polite"
            title={notice?.detail}
            className={cn(
              "min-w-0 flex-1 truncate text-[0.68rem] font-semibold leading-relaxed",
              notice?.tone === "bad" ? "text-bad" : notice?.tone === "good" ? "text-good" : "text-fg-3",
            )}
          >
            {statusLine}
            {notice?.detail ? <span className="ml-1 font-normal text-fg-3">{notice.detail}</span> : null}
          </p>
          {exportBusy ? <button type="button" onClick={() => exportRef.current?.cancel()} className={BUTTON}>내보내기 취소</button> : null}
        </div>
      ) : null}

      {compact && sheetOpen ? (
        <div
          ref={sheetRef}
          id={sheetId}
          role="group"
          aria-label="내보내기"
          data-character-export-sheet="true"
          className="absolute inset-x-2 bottom-full z-40 mb-1.5 ml-auto max-w-80 rounded-2xl border border-line bg-panel p-2 shadow-[0_-12px_40px_oklch(0.05_0.01_70/0.45)]"
        >
          {exportSettings}
          <div className="flex flex-wrap items-center gap-1.5">
            {transparentSwitch}
            {backgroundColorField}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={exportBlocked}
              onClick={savePng}
              className={BUTTON}
            >
              <ImageDown size={16} aria-hidden />
              PNG 저장
            </button>
            <button
              type="button"
              disabled={exportBlocked}
              onClick={exportPsd}
              className={BUTTON}
            >
              <Layers size={16} aria-hidden />
              PSD 내보내기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
