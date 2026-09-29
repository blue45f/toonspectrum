/**
 * Character Shaper — floating controls over the 3D viewport.
 *
 * Desktop top-left: camera presets. Mobile camera controls occupy a separate normal-flow bar.
 * Top-right: turntable, lighting tone, transparent background, zoom.
 * Bottom-left: a status pill (model status / busy reason / hold-to-compare). Every control is a
 * labelled 44px button; the wrapper is pointer-transparent so orbiting the model keeps working.
 */
import { Eye, EyeOff, LoaderCircle, Maximize2, PenLine, RotateCw, SunMedium, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { StudioHudPill } from "../studio-chrome-ui";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  StudioLtConvertDialog,
  type StudioLtConvertDialogSource,
} from "../lt-convert/StudioLtConvertDialog";
import { createStudioLtConvertLayerPayloads, type StudioLtConvertLayerPayload } from "../lt-convert/studio-lt-convert-layer";
import { decodeStudioLtSourceFile } from "../lt-convert/studio-lt-convert-source";
import type { StudioLtConvertResult } from "../lt-convert/studio-lt-convert";
import { resolveVrmLibraryEntryDisplayName } from "../vrm/studio-vrm-display-name";
import { CAMERA_PRESETS } from "../vrm/studio-vrm-poser-catalogs";

import {
  characterLightingToneLabel,
  nextCharacterLightingTone,
} from "./character-shaper-ui-model";

import { CharacterShaperCameraControls } from "./CharacterShaperCameraControls";

import type { CharacterShaperViewportHudProps } from "./character-shaper-ui-contract";
import type { LoadStatus } from "../vrm/StudioVrmPoserTypes";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { VrmLibraryEntry } from "../vrm/vrm-library";

import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

const HUD_BUTTON = cn(
  "grid size-11 shrink-0 place-items-center rounded-xl border border-line/70 bg-panel/85 text-fg-2 shadow-sm backdrop-blur",
  "transition-colors duration-150 hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

const HUD_BUTTON_ACTIVE = "border-accent/60 bg-accent text-on-accent hover:bg-accent-2 hover:text-on-accent";

function statusText(input: {
  readonly status: LoadStatus;
  readonly compareActive: boolean;
  readonly busyReason: string | null;
  readonly cameraLabel: string;
  readonly transparent: boolean;
  readonly paintMode: boolean;
}): { readonly text: string; readonly accent: boolean } {
  if (input.compareActive) return { text: "기준 상태 보는 중", accent: true };
  if (input.busyReason) return { text: input.busyReason, accent: true };
  if (input.status === "loading") return { text: "VRM 불러오는 중", accent: false };
  if (input.status === "error") return { text: "불러오기 실패", accent: false };
  if (input.status === "empty") return { text: "모델 없음", accent: false };
  const parts = [input.cameraLabel];
  if (input.paintMode) parts.push("표면 드로잉");
  if (input.transparent) parts.push("투명 배경");
  return { text: parts.join(" · "), accent: false };
}

type StudioLtViewportCapture = () =>
  | ImageData
  | Promise<ImageData>
  | null
  | undefined;

type StudioLtLayerCommit = (
  payloads: readonly StudioLtConvertLayerPayload[],
) => void;

/**
 * 호스트가 제공하는 3D 뷰 캡처 함수(선택적, `captureViewportImageData`)를 읽는다.
 * 아직 구현되지 않은 호스트에서는 null을 반환한다.
 */
function readLtViewportCapture(
  host: StudioVrmPoserHost,
): StudioLtViewportCapture | null {
  const candidate: unknown = (
    host as { readonly captureViewportImageData?: unknown }
  ).captureViewportImageData;
  return typeof candidate === "function"
    ? (candidate as StudioLtViewportCapture)
    : null;
}

/**
 * 호스트가 제공하는 LT 레이어 커밋 함수(선택적, `commitLtConvertLayers`)를 읽는다.
 * 레이어 document authority(StudioPage) 연동 전까지는 null이다.
 */
function readLtLayerCommit(host: StudioVrmPoserHost): StudioLtLayerCommit | null {
  const candidate: unknown = (
    host as { readonly commitLtConvertLayers?: unknown }
  ).commitLtConvertLayers;
  return typeof candidate === "function"
    ? (candidate as StudioLtLayerCommit)
    : null;
}

export function CharacterShaperViewportHud({ h, binding, compact }: CharacterShaperViewportHudProps) {
  const locale = useI18n((state) => state.lang);
  const [ltOpen, setLtOpen] = useState(false);
  const [ltApplyError, setLtApplyError] = useState<string | null>(null);
  const [ltSource, setLtSource] = useState<StudioLtConvertDialogSource>({
    status: "idle",
    imageData: null,
    error: null,
    label: "3D 뷰 캡처",
  });
  const status: LoadStatus = h.status ?? "empty";
  const activeCameraId: string = typeof h.activeCameraId === "string" ? h.activeCameraId : "front";
  const turntable = Boolean(h.turntable);
  const transparent = Boolean(h.transparentBackground);
  const paintMode = Boolean(h.texturePaintModeSelected);
  const cameraLocked = Boolean(h.viewportCameraInteractionLocked || h.isCapturing || h.isSharingPose || h.isThumbnailCapturing);
  const lightingTone: string | undefined = typeof h.lightingTone === "string" ? h.lightingTone : undefined;
  const modelReady = status === "ready";
  const activePresetLabel = CAMERA_PRESETS.find((preset) => preset.id === activeCameraId)?.label ?? "정면";
  const entries: readonly VrmLibraryEntry[] = Array.isArray(h.libraryEntries) ? h.libraryEntries : [];
  const activeEntry = entries.find((entry) => entry.id === h.activeModelId) ?? null;
  const modelName = activeEntry ? resolveVrmLibraryEntryDisplayName(activeEntry, locale) : null;
  const pill = statusText({
    status,
    compareActive: binding.compareActive,
    busyReason: binding.busyReason,
    cameraLabel: activePresetLabel,
    transparent,
    paintMode,
  });
  const lightingLabel = characterLightingToneLabel(lightingTone);

  const openLtDialog = useCallback(() => {
    setLtApplyError(null);
    setLtSource({
      status: "capturing",
      imageData: null,
      error: null,
      label: "3D 뷰 캡처",
    });
    setLtOpen(true);
  }, []);

  // 다이얼로그가 열리면 3D 뷰 캡처를 시도한다. 호스트가 아직 캡처 함수를
  // 제공하지 않으면 소스 오류 상태로 두고, 다이얼로그의 이미지 파일
  // 불러오기로 대체할 수 있다.
  useEffect(() => {
    if (!ltOpen || ltSource.status !== "capturing") return;
    let cancelled = false;
    const capture = readLtViewportCapture(h);
    if (!capture) {
      setLtSource({
        status: "error",
        imageData: null,
        error: "3D 뷰 캡처를 사용할 수 없어요. 이미지 파일을 불러와 변환할 수 있습니다.",
        label: "3D 뷰 캡처",
      });
      return;
    }
    Promise.resolve()
      .then(() => capture())
      .then((imageData) => {
        if (cancelled) return;
        if (!imageData) {
          setLtSource({
            status: "error",
            imageData: null,
            error: "3D 뷰 캡처 결과가 비어 있습니다.",
            label: "3D 뷰 캡처",
          });
          return;
        }
        setLtSource({
          status: "ready",
          imageData,
          error: null,
          label: "3D 뷰 캡처",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLtSource({
          status: "error",
          imageData: null,
          error:
            error instanceof Error
              ? error.message
              : "3D 뷰 캡처에 실패했습니다.",
          label: "3D 뷰 캡처",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [ltOpen, ltSource.status, h]);

  const handleLtImportImage = useCallback((file: File) => {
    setLtSource({
      status: "capturing",
      imageData: null,
      error: null,
      label: file.name,
    });
    void decodeStudioLtSourceFile(file).then(
      (imageData) => {
        setLtSource({
          status: "ready",
          imageData,
          error: null,
          label: file.name,
        });
      },
      (error: unknown) => {
        setLtSource({
          status: "error",
          imageData: null,
          error:
            error instanceof Error
              ? error.message
              : "이미지를 불러오지 못했습니다.",
          label: file.name,
        });
      },
    );
  }, []);

  const handleLtApply = useCallback(
    (result: StudioLtConvertResult) => {
      const payloads = createStudioLtConvertLayerPayloads(result);
      const commit = readLtLayerCommit(h);
      if (!commit) {
        // 레이어 document authority(StudioPage) 연동 전까지는 페이로드까지만
        // 만들고 사용자에게 알린다. 연동 지점은 studio-lt-convert-layer.ts 참고.
        setLtApplyError(
          "레이어 저장을 아직 연결하지 못했어요. (Studio 레이어 연동 TODO)",
        );
        return;
      }
      commit(payloads);
      setLtOpen(false);
    },
    [h],
  );

  return (
    <div
      data-character-shaper-hud="true"
      className="pointer-events-none absolute inset-0 z-20"
    >
      {!compact ? <CharacterShaperCameraControls h={h} compact={false} /> : null}

      <div
        role="group"
        aria-label="뷰포트 보기 설정"
        className={cn(
          "pointer-events-auto absolute right-2 gap-1.5",
          compact ? "top-2 grid grid-cols-2" : "top-2 flex flex-col",
        )}
      >
        <button
          type="button"
          aria-pressed={turntable}
          aria-keyshortcuts="T"
          disabled={paintMode || cameraLocked || !modelReady}
          title={
            paintMode
              ? "표면 드로잉 중에는 턴테이블을 잠급니다."
              : turntable
                ? "턴테이블 정지 (T)"
                : "턴테이블 회전 (T)"
          }
          aria-label={turntable ? "턴테이블 정지" : "턴테이블 회전"}
          onClick={() => h.setTurntable((value: boolean) => !value)}
          className={cn(HUD_BUTTON, turntable && HUD_BUTTON_ACTIVE)}
        >
          <RotateCw
            size={17}
            aria-hidden
            className={turntable ? "animate-spin [animation-duration:3s] motion-reduce:animate-none" : ""}
          />
        </button>
        <button
          type="button"
          aria-label={`조명 톤 바꾸기 (현재 ${lightingLabel})`}
          title={`조명 톤: ${lightingLabel} → ${characterLightingToneLabel(nextCharacterLightingTone(lightingTone))}`}
          disabled={!modelReady}
          onClick={() => h.setLightingTone(nextCharacterLightingTone(lightingTone))}
          className={cn(HUD_BUTTON, "relative")}
        >
          <SunMedium size={17} aria-hidden />
          <span aria-hidden className="absolute inset-x-0 bottom-0.5 text-center text-[0.55rem] font-semibold leading-none">
            {lightingLabel}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={transparent}
          aria-label={transparent ? "투명 배경 끄기" : "투명 배경 켜기"}
          title={transparent ? "투명 배경 · 캔버스에 추가하면 캐릭터만 남습니다" : "배경색 포함 · 투명 배경으로 바꾸려면 누르세요"}
          onClick={() => h.setTransparentBackground(!transparent)}
          className={cn(
            HUD_BUTTON,
            transparent &&
              "border-accent/60 text-accent [background-image:linear-gradient(45deg,oklch(0.75_0.01_80/0.22)_25%,transparent_25%),linear-gradient(-45deg,oklch(0.75_0.01_80/0.22)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,oklch(0.75_0.01_80/0.22)_75%),linear-gradient(-45deg,transparent_75%,oklch(0.75_0.01_80/0.22)_75%)] [background-position:0_0,0_6px,6px_-6px,-6px_0] [background-size:12px_12px]",
          )}
        >
          {transparent ? <Eye size={17} aria-hidden /> : <EyeOff size={17} aria-hidden />}
        </button>
        <div className={cn("my-0.5 h-px w-full bg-line/70", compact && "hidden")} aria-hidden />
        <button
          type="button"
          aria-label="확대"
          title="확대"
          disabled={cameraLocked || !modelReady}
          onClick={() => h.zoomViewport(0.82)}
          className={HUD_BUTTON}
        >
          <ZoomIn size={17} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="축소"
          title="축소"
          disabled={cameraLocked || !modelReady}
          onClick={() => h.zoomViewport(1.22)}
          className={HUD_BUTTON}
        >
          <ZoomOut size={17} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="시점 초기화"
          title="시점 초기화"
          disabled={cameraLocked || !modelReady}
          onClick={() => h.handleViewReset()}
          className={HUD_BUTTON}
        >
          <Maximize2 size={17} aria-hidden />
        </button>
        <div className={cn("my-0.5 h-px w-full bg-line/70", compact && "hidden")} aria-hidden />
        <button
          type="button"
          aria-label="LT 변환"
          title="LT 변환 · 3D 뷰를 선화 + 톤 레이어로 분리"
          disabled={!modelReady}
          onClick={openLtDialog}
          className={HUD_BUTTON}
        >
          <PenLine size={17} aria-hidden />
        </button>
      </div>

      <div role="status" className="pointer-events-auto absolute bottom-2 left-2 max-w-[70%]">
        <StudioHudPill
          accent={pill.accent}
          title={modelName ? `${modelName} · ${pill.text}` : pill.text}
          className="max-w-full truncate"
        >
          {status === "loading" ? (
            <LoaderCircle size={12} aria-hidden className="animate-spin motion-reduce:animate-none" />
          ) : null}
          {pill.text}
        </StudioHudPill>
      </div>

      <StudioLtConvertDialog
        open={ltOpen}
        source={ltSource}
        applyError={ltApplyError}
        onImportImage={handleLtImportImage}
        onApply={handleLtApply}
        onCancel={() => setLtOpen(false)}
      />
    </div>
  );
}
