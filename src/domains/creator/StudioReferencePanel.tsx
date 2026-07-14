import { AlertTriangle, FlipHorizontal2, Image as ImageIcon, ImagePlus, Loader2, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { listAssets, type StudioAsset } from "./studio-asset-library";
import {
  clampReferencePanelRect,
  defaultReferencePanelSettings,
  deserializeReferencePanelSettings,
  dragReferencePanelRect,
  filterReferenceAssetsByName,
  REFERENCE_PANEL_STORAGE_KEY,
  resetReferencePanelSize,
  resizeReferencePanelRect,
  resolvePinnedAsset,
  serializeReferencePanelSettings,
  type ReferencePanelSettings,
} from "./studio-reference-panel";

export interface StudioReferencePanelProps {
  open: boolean;
  onClose: () => void;
}

type DragKind = "move" | "resize";
type DragSession = {
  kind: DragKind;
  startRect: { x: number; y: number; width: number; height: number };
  startPointer: { x: number; y: number };
};
type LibraryStatus = "idle" | "loading" | "ready" | "error";

const CONTROL_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON =
  "inline-grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function readViewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

export function StudioReferencePanel({ open, onClose }: StudioReferencePanelProps) {
  const [settings, setSettings] = useState<ReferencePanelSettings>(() => {
    if (typeof window === "undefined") return defaultReferencePanelSettings(1280, 800);
    const { w, h } = readViewport();
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(REFERENCE_PANEL_STORAGE_KEY);
    } catch {
      raw = null; // 시크릿 모드 등 저장소 차단 — 기본 위치로 시작
    }
    return deserializeReferencePanelSettings(raw, w, h);
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>("idle");
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragKind | null>(null);
  // "다시 시도" 버튼이 새 요청을 트리거하는 수단 — 이 값을 증가시키면 아래 effect가 재실행된다.
  const [refreshNonce, setRefreshNonce] = useState(0);

  const dragSessionRef = useRef<DragSession | null>(null);
  const dragListenersRef = useRef<{ onMove: (ev: PointerEvent) => void; onEnd: () => void } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // 라이브러리 목록 로드 — 패널이 열릴 때(핀 해석용), 피커를 열 때(최신화), "다시 시도" 클릭 시
  // (refreshNonce 증가)마다 재실행된다. 응답 순서 역전 방지를 위해 requestId 토큰으로 최신 호출만
  // 반영한다 — effect가 짧은 간격으로 여러 번 재실행될 수 있어(피커 토글 연타 등) 단순
  // studio-vrm-creator식 effect-local `cancelled` 불리언만으로는 "이전 실행의 늦은 응답이 최신 상태를
  // 덮어쓰는" 경우를 못 막는다.
  useEffect(() => {
    if (!open) return;
    const requestId = ++requestIdRef.current;
    setLibraryStatus("loading");
    setLibraryError(null);
    listAssets()
      .then((list) => {
        if (requestIdRef.current !== requestId) return;
        setAssets(list);
        setLibraryStatus("ready");
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setLibraryStatus("error");
        setLibraryError("에셋 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
  }, [open, pickerOpen, refreshNonce]);

  function retryLoadAssets() {
    setRefreshNonce((n) => n + 1);
  }

  // 위치/크기/핀/반전 변경 → localStorage 저장(짧게 디바운스).
  // cleanup에서 무조건 flush()까지 호출하면 안 된다 — effect cleanup은 "언마운트 시"뿐 아니라
  // settings가 바뀔 때마다(다음 effect 실행 직전)도 실행되므로, 그러면 매 변경마다 200ms를 기다리지
  // 않고 즉시 저장돼 디바운스가 사실상 무효화된다. 여기서는 타이머만 정리하고, "진짜 언마운트 시
  // 마지막 값 flush"는 별도의 빈-deps effect(아래)로 분리한다.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(REFERENCE_PANEL_STORAGE_KEY, serializeReferencePanelSettings(settingsRef.current));
      } catch {
        // 저장소 차단 환경 — 위치 영속은 포기하되 패널 동작 자체는 계속 유지.
      }
    }, 200);
    saveTimerRef.current = t;
    return () => clearTimeout(t);
  }, [open, settings]);

  // 언마운트(패널이 완전히 닫힘) 시에만 마지막 200ms 안의 드래그 결과를 즉시 flush한다.
  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      try {
        window.localStorage.setItem(REFERENCE_PANEL_STORAGE_KEY, serializeReferencePanelSettings(settingsRef.current));
      } catch {
        // 저장소 차단 환경 — 무시(위와 동일 정책).
      }
    };
  }, []);

  // 브라우저 창 리사이즈 시 화면 밖으로 나가지 않게 재클램프.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const { w, h } = readViewport();
      setSettings((prev) => ({ ...prev, ...clampReferencePanelRect(prev, w, h) }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // 드래그/리사이즈 중 커서·텍스트 선택 잠금(components/use-resizable.ts와 동일 패턴).
  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = dragging === "resize" ? "nwse-resize" : "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  function beginDrag(kind: DragKind, e: React.PointerEvent) {
    e.preventDefault();
    dragSessionRef.current = {
      kind,
      startRect: { x: settings.x, y: settings.y, width: settings.width, height: settings.height },
      startPointer: { x: e.clientX, y: e.clientY },
    };
    setDragging(kind);
    const onMove = (ev: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      const { w, h } = readViewport();
      const pointer = { x: ev.clientX, y: ev.clientY };
      const nextRect =
        session.kind === "move"
          ? dragReferencePanelRect(session.startRect, session.startPointer, pointer, w, h)
          : resizeReferencePanelRect(session.startRect, session.startPointer, pointer, w, h);
      setSettings((prev) => ({ ...prev, ...nextRect }));
    };
    const onEnd = () => {
      dragSessionRef.current = null;
      setDragging(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      dragListenersRef.current = null;
    };
    dragListenersRef.current = { onMove, onEnd };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    // 탭 전환·터치 취소 등으로 pointerup 없이 제스처가 끊기는 경우도 정리한다 — 안 그러면
    // 리스너가 영원히 남아 다음 드래그와 겹쳐 좌표가 튄다.
    window.addEventListener("pointercancel", onEnd);
  }

  // 언마운트 시(패널이 닫히는 등) 진행 중 드래그 리스너가 있으면 정리한다.
  useEffect(() => {
    return () => {
      const listeners = dragListenersRef.current;
      if (!listeners) return;
      window.removeEventListener("pointermove", listeners.onMove);
      window.removeEventListener("pointerup", listeners.onEnd);
      window.removeEventListener("pointercancel", listeners.onEnd);
    };
  }, []);

  function resizeByKeyboard(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 32 : 16;
    const { w, h } = readViewport();
    let dw = 0;
    let dh = 0;
    if (e.key === "ArrowRight") dw = step;
    else if (e.key === "ArrowLeft") dw = -step;
    else if (e.key === "ArrowDown") dh = step;
    else if (e.key === "ArrowUp") dh = -step;
    else return;
    e.preventDefault();
    // clampReferencePanelRect 로 width/height 만 바꾸면 x/y 도 함께 재클램프되어(뷰포트 중앙 기준)
    // 크기를 조절할 때마다 패널 위치가 튄다 — resizeReferencePanelRect 는 앵커(x/y)를 고정한 채
    // width/height 만 바꾸므로 그걸 재사용한다. 이 함수는 포인터 델타만 보므로 (0,0)→(dw,dh) 를
    // "가짜 포인터 이동"으로 넘기면 키보드 리사이즈에도 그대로 쓸 수 있다.
    setSettings((prev) => ({
      ...prev,
      ...resizeReferencePanelRect(prev, { x: 0, y: 0 }, { x: dw, y: dh }, w, h),
    }));
  }

  function pickAsset(asset: StudioAsset) {
    setSettings((prev) => ({ ...prev, assetId: asset.id }));
    setPickerOpen(false);
    setPickerQuery("");
  }

  function unpin() {
    setSettings((prev) => ({ ...prev, assetId: null }));
  }

  function toggleFlip() {
    setSettings((prev) => ({ ...prev, flipped: !prev.flipped }));
  }

  if (!open) return null;

  const pinnedAsset = resolvePinnedAsset(assets, settings.assetId);
  const pinDangling = settings.assetId !== null && libraryStatus === "ready" && !pinnedAsset;
  const filteredAssets = filterReferenceAssetsByName(assets, pickerQuery);
  const bodyMode: "empty" | "image" | "picking" | "resolving" = pickerOpen
    ? "picking"
    : pinnedAsset
      ? "image"
      : settings.assetId && (libraryStatus === "idle" || libraryStatus === "loading")
        ? "resolving"
        : "empty";

  return (
    <div
      role="region"
      aria-label="참고 이미지 패널"
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_12px_36px_oklch(0.05_0.01_70/0.4)]"
      style={{ left: settings.x, top: settings.y, width: settings.width, height: settings.height }}
    >
      <header
        className="flex shrink-0 cursor-grab items-center justify-between gap-1 border-b border-line bg-card px-2 py-1.5 active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => beginDrag("move", e)}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-fg">
          <ImageIcon size={13} className="shrink-0 text-accent" aria-hidden />
          <span className="truncate">참고 이미지</span>
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {pinnedAsset ? (
            <button
              type="button"
              aria-label="좌우 반전"
              title="좌우 반전"
              aria-pressed={settings.flipped}
              className={cx(ICON_BUTTON, "size-8", settings.flipped && "border-accent/60 bg-accent-soft/50 text-accent")}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleFlip}
            >
              <FlipHorizontal2 size={13} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={pinnedAsset ? "다른 이미지로 바꾸기" : "이미지 선택"}
            title={pinnedAsset ? "다른 이미지로 바꾸기" : "이미지 선택"}
            aria-pressed={pickerOpen}
            className={cx(ICON_BUTTON, "size-8", pickerOpen && "border-accent/60 bg-accent-soft/50 text-accent")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPickerOpen((v) => !v)}
          >
            <ImagePlus size={13} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="닫기"
            title="닫기"
            className={cx(ICON_BUTTON, "size-8")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => (pickerOpen ? setPickerOpen(false) : onClose())}
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[oklch(0.14_0_0)]">
        {bodyMode === "picking" ? (
          <div className="absolute inset-0 flex flex-col overflow-hidden bg-panel p-2">
            {settings.assetId ? (
              <button type="button" className="mb-1.5 self-start text-[0.68rem] font-semibold text-accent hover:underline" onClick={unpin}>
                참고 이미지 고정 해제
              </button>
            ) : null}
            <label className="relative mb-1.5 block shrink-0">
              <Search size={11} aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-3" />
              <input
                type="text"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder={`이름으로 찾기 (${assets.length}개)`}
                aria-label="에셋 이름 검색"
                className="h-7 w-full rounded-lg border border-line bg-card pl-6 pr-2 text-[0.7rem] text-fg outline-none focus:border-accent/50"
              />
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {libraryStatus === "loading" ? (
                <div className="grid place-items-center py-6">
                  <Loader2 className="animate-spin text-accent" size={18} aria-hidden />
                </div>
              ) : libraryStatus === "error" ? (
                <div className="flex flex-col items-center gap-1.5 px-2 py-6 text-center">
                  <AlertTriangle className="text-accent" size={16} aria-hidden />
                  <p className="text-[0.68rem] text-fg-3">{libraryError}</p>
                  <button type="button" className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised")} onClick={retryLoadAssets}>
                    다시 시도
                  </button>
                </div>
              ) : assets.length === 0 ? (
                <p className="px-2 py-6 text-center text-[0.68rem] leading-relaxed text-fg-3">
                  아직 저장된 에셋이 없어요. 상단 &lsquo;에셋&rsquo; 메뉴에서 이미지를 업로드하거나 생성해 보세요.
                </p>
              ) : filteredAssets.length === 0 ? (
                <p className="px-2 py-6 text-center text-[0.68rem] text-fg-3">&ldquo;{pickerQuery}&rdquo;와(과) 일치하는 에셋이 없어요.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {filteredAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      className={cx(
                        "relative flex h-14 items-center justify-center overflow-hidden rounded-lg border bg-card",
                        asset.id === settings.assetId ? "border-accent" : "border-line hover:border-accent/50"
                      )}
                      title={asset.name}
                      onClick={() => pickAsset(asset)}
                    >
                      <img src={asset.dataUrl} alt={asset.name} className="max-h-full max-w-full object-contain" />
                      {asset.kind === "ai" ? (
                        <span className="pointer-events-none absolute left-0.5 top-0.5 inline-flex items-center gap-0.5 rounded bg-accent px-1 py-px text-[0.45rem] font-bold uppercase text-white">
                          <Sparkles size={6} aria-hidden /> AI
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : bodyMode === "resolving" ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="animate-spin text-accent" size={20} aria-hidden />
          </div>
        ) : bodyMode === "image" && pinnedAsset ? (
          <>
            <img
              src={pinnedAsset.dataUrl}
              alt={pinnedAsset.name}
              className="h-full w-full object-contain"
              style={{ transform: settings.flipped ? "scaleX(-1)" : undefined }}
              draggable={false}
            />
            {pinnedAsset.kind === "ai" ? (
              <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-white shadow">
                <Sparkles size={9} aria-hidden /> AI
              </span>
            ) : null}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
            <ImageIcon className="text-fg-3" size={22} aria-hidden />
            <p className="text-[0.7rem] font-semibold text-fg">참고할 이미지가 없어요</p>
            <p className="text-[0.65rem] leading-relaxed text-fg-3">내 에셋 라이브러리에서 이미지를 골라 그리는 동안 옆에 띄워두세요.</p>
            {pinDangling ? (
              <p className="rounded-lg border border-line bg-card px-2 py-1 text-[0.6rem] text-fg-3">
                핀 고정했던 이미지를 찾을 수 없어요 (삭제된 에셋). 다시 골라주세요.
              </p>
            ) : null}
            <button type="button" className={cx(CONTROL_BUTTON, "border-accent/60 bg-accent text-on-accent hover:bg-accent/90")} onClick={() => setPickerOpen(true)}>
              이미지 선택
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="패널 크기 조절 (방향키로도 조절 가능, 더블클릭으로 기본 크기)"
        title="드래그해서 크기 조절 (더블클릭: 기본 크기)"
        className="absolute bottom-0 right-0 size-4 cursor-nwse-resize border-none bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        style={{ touchAction: "none", clipPath: "polygon(100% 0, 100% 100%, 0 100%)", backgroundColor: "oklch(0.55 0.01 70 / 0.35)" }}
        onPointerDown={(e) => beginDrag("resize", e)}
        onKeyDown={resizeByKeyboard}
        onDoubleClick={() => {
          const { w, h } = readViewport();
          setSettings((prev) => ({ ...prev, ...resetReferencePanelSize(prev, w, h) }));
        }}
      />
    </div>
  );
}
