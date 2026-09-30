/**
 * XR 웹툰 스튜디오 호스트 — 패널과 실제 WebXR 세션·3D 무대를 연결한다.
 *
 * - 마운트 시 WebXR 지원을 실제 프로브(navigator.xr)하고,
 * - AR/VR 시작 시에만 three.js 프리젠터를 만들어 세션을 건다.
 *   (클릭 전까지 WebGL 비용 없음)
 * - 3D→컷은 프리젠터 렌더로 PNG를 뽑아 다운로드하고,
 *   VRM 스테이징은 프리젠터 캐릭터에 즉시 반영한다.
 * - WebGL이 없으면 2D 미리보기만 제공하고 시작 시 안내한다.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type {
  StudioWebXrMode,
  StudioWebXrSessionController,
  StudioWebXrSessionState,
  StudioWebXrSupportSnapshot,
} from "../studio-webxr-session";
import { XrWebtoonStudioPanel } from "./XrWebtoonStudioPanel";
import type { XrPresenterHandle } from "./xr-webtoon-presenter";
import { XR_SAMPLE_CUTS } from "./xr-webtoon-sample-cuts";
import { xrCutCaptureFilename, type XrCutCaptureJob } from "./xr-webtoon-cut-capture";
import type { XrVrmStagingDescriptor } from "./xr-webtoon-vrm-staging";
import type { XrDepthCut } from "./xr-webtoon-depth-model";

export interface XrStudioHostDeps {
  readonly loadSessionRuntime: () => Promise<{
    readonly createStudioWebXrSessionController: (
      options: import("../studio-webxr-session").CreateStudioWebXrSessionControllerOptions,
    ) => StudioWebXrSessionController;
    readonly studioWebXrSessionErrorMessage: (
      code: import("../studio-webxr-session").StudioWebXrSessionErrorCode,
    ) => string;
  }>;
  readonly createPresenter: (cuts: readonly XrDepthCut[]) => Promise<XrPresenterHandle>;
}

const defaultDeps: XrStudioHostDeps = {
  loadSessionRuntime: () =>
    import("../studio-webxr-session").then((m) => ({
      createStudioWebXrSessionController: m.createStudioWebXrSessionController,
      studioWebXrSessionErrorMessage: m.studioWebXrSessionErrorMessage,
    })),
  createPresenter: (cuts) =>
    import("./xr-webtoon-presenter").then((m) => m.createXrWebtoonPresenter({ cuts })),
};

export interface XrWebtoonStudioHostProps {
  readonly cuts?: readonly XrDepthCut[];
  readonly className?: string;
  readonly deps?: XrStudioHostDeps;
}

type HostPhase = "probing" | "ready" | "failed";

export function XrWebtoonStudioHost({
  cuts = XR_SAMPLE_CUTS,
  className,
  deps = defaultDeps,
}: XrWebtoonStudioHostProps): React.JSX.Element {
  const t = useBilingual("xr-webtoon-studio-host");
  const [phase, setPhase] = useState<HostPhase>("probing");
  const [support, setSupport] = useState<StudioWebXrSupportSnapshot | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);

  const runtimeRef = useRef<XrStudioHostDeps["loadSessionRuntime"] | null>(null);
  const presenterRef = useRef<XrPresenterHandle | null>(null);
  const controllerRef = useRef<StudioWebXrSessionController | null>(null);
  const errorMessageRef = useRef<((code: never) => string) | null>(null);
  const liveRef = useRef(true);

  // 마운트: 지원 프로브만 수행 (WebGL은 건드리지 않음).
  useEffect(() => {
    liveRef.current = true;
    let probeController: StudioWebXrSessionController | null = null;
    void deps
      .loadSessionRuntime()
      .then(async (runtime) => {
        runtimeRef.current = deps.loadSessionRuntime;
        errorMessageRef.current = runtime.studioWebXrSessionErrorMessage as (code: never) => string;
        probeController = runtime.createStudioWebXrSessionController({
          renderer: {
            get enabled() {
              return false;
            },
            set enabled(_value: boolean) {
              /* probe-only */
            },
            get isPresenting() {
              return false;
            },
            setReferenceSpaceType() {
              /* probe-only */
            },
            setSession() {
              return Promise.resolve();
            },
            getSession() {
              return null;
            },
          },
          onStateChange: () => {
            /* probe 단계에서는 세션을 열지 않는다 */
          },
        });
        const snapshot = await probeController.inspectSupport();
        if (!liveRef.current) return;
        setSupport(snapshot);
        setPhase("ready");
      })
      .catch(() => {
        if (!liveRef.current) return;
        setPhase("failed");
      });
    return () => {
      liveRef.current = false;
      if (probeController) void probeController.dispose().catch(() => undefined);
      if (controllerRef.current) void controllerRef.current.dispose().catch(() => undefined);
      controllerRef.current = null;
      if (presenterRef.current) presenterRef.current.dispose();
      presenterRef.current = null;
    };
  }, [deps]);

  // 실제 3D 무대 + 세션 컨트롤러를 필요할 때 만든다.
  const ensureSession = useCallback(async (): Promise<{
    presenter: XrPresenterHandle;
    controller: StudioWebXrSessionController;
  }> => {
    const runtimeLoader = runtimeRef.current ?? deps.loadSessionRuntime;
    const runtime = await runtimeLoader();
    errorMessageRef.current = runtime.studioWebXrSessionErrorMessage as (code: never) => string;
    if (!presenterRef.current) {
      presenterRef.current = await deps.createPresenter(cuts);
    }
    if (!controllerRef.current || controllerRef.current.requiresRendererRecreation) {
      if (controllerRef.current) {
        await controllerRef.current.dispose().catch(() => undefined);
      }
      controllerRef.current = runtime.createStudioWebXrSessionController({
        renderer: presenterRef.current.port,
        onStateChange: (state: StudioWebXrSessionState) => {
          if (!liveRef.current) return;
          if (state.status === "presenting") {
            setSessionActive(true);
            setSessionError(null);
          } else if (state.status === "error") {
            setSessionActive(false);
            const message = errorMessageRef.current;
            setSessionError(
              message ? message(state.code as never) : t("XR 세션을 시작하지 못했습니다.", "Could not start the XR session."),
            );
          } else if (state.status === "idle") {
            setSessionActive(false);
          }
        },
      });
    }
    return { presenter: presenterRef.current, controller: controllerRef.current };
  }, [cuts, deps, t]);

  const startSession = useCallback(
    (mode: StudioWebXrMode) => {
      setSessionError(null);
      setNotice(null);
      void ensureSession()
        .then(({ controller }) => controller.start(mode))
        .catch((cause: unknown) => {
          if (!liveRef.current) return;
          setSessionActive(false);
          setSessionError(
            cause instanceof Error && cause.message === "webgl-unavailable"
              ? t(
                  "이 브라우저에서는 3D 렌더러를 만들 수 없어 2D 미리보기만 제공됩니다.",
                  "This browser can't create the 3D renderer, so only 2D previews are available.",
                )
              : cause instanceof Error
                ? cause.message
                : t("XR 세션을 시작하지 못했습니다.", "Could not start the XR session."),
          );
        });
    },
    [ensureSession, t],
  );

  const endSession = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) {
      setSessionActive(false);
      return;
    }
    void controller
      .end()
      .catch(() => undefined)
      .finally(() => {
        if (liveRef.current) setSessionActive(false);
      });
  }, []);

  const handleCapture = useCallback(
    (job: XrCutCaptureJob) => {
      setCaptureBusy(true);
      setNotice(null);
      void ensureSession()
        .then(({ presenter }) => presenter.captureCut(job))
        .then((url) => {
          if (!liveRef.current) return;
          const fileName = xrCutCaptureFilename(job);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setNotice(
            t(
              `${fileName} 렌더가 끝났습니다. 다운로드 폴더를 확인해 주세요.`,
              `${fileName} rendered. Check your downloads folder.`,
            ),
          );
        })
        .catch(() => {
          if (!liveRef.current) return;
          setNotice(
            t(
              "컷 렌더에 실패했습니다. 이 브라우저에서 WebGL이 막혀 있을 수 있어요.",
              "Cut rendering failed. WebGL may be blocked in this browser.",
            ),
          );
        })
        .finally(() => {
          if (liveRef.current) setCaptureBusy(false);
        });
    },
    [ensureSession, t],
  );

  const handleVrmStage = useCallback(
    (spec: XrVrmStagingDescriptor) => {
      setNotice(null);
      void ensureSession()
        .then(({ presenter }) => {
          presenter.applyVrmStaging(spec);
          if (liveRef.current) {
            setNotice(
              t(
                "캐릭터 배치가 3D 무대에 반영됐습니다. AR/VR에서 확인해 보세요.",
                "Character staging applied to the 3D stage. Check it in AR/VR.",
              ),
            );
          }
        })
        .catch(() => {
          if (liveRef.current) {
            setNotice(
              t(
                "배치 반영에 실패했습니다. 이 브라우저에서 WebGL이 막혀 있을 수 있어요.",
                "Staging failed. WebGL may be blocked in this browser.",
              ),
            );
          }
        });
    },
    [ensureSession, t],
  );

  return (
    <div className={className}>
      {phase === "failed" ? (
        <p
          role="alert"
          style={{
            fontSize: 14,
            color: "rgba(226,232,255,0.75)",
            background: "rgba(251,113,133,0.08)",
            border: "1px solid rgba(251,113,133,0.3)",
            borderRadius: 12,
            padding: "12px 16px",
            margin: "0 0 12px",
          }}
        >
          {t(
            "XR 지원을 확인하지 못했습니다. 2D 미리보기는 그대로 사용할 수 있어요.",
            "Couldn't check XR support. 2D previews still work.",
          )}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          aria-live="polite"
          style={{
            fontSize: 14,
            color: "#a7f3d0",
            background: "rgba(52,211,153,0.08)",
            border: "1px solid rgba(52,211,153,0.3)",
            borderRadius: 12,
            padding: "12px 16px",
            margin: "0 0 12px",
          }}
        >
          {notice}
        </p>
      ) : null}
      {captureBusy ? (
        <p role="status" aria-live="polite" style={{ fontSize: 13, color: "rgba(226,232,255,0.6)", margin: "0 0 12px" }}>
          {t("3D 장면을 렌더하고 있어요…", "Rendering the 3D scene…")}
        </p>
      ) : null}
      <XrWebtoonStudioPanel
        cuts={cuts}
        support={support}
        supportPending={phase === "probing"}
        onStartAr={() => startSession("immersive-ar")}
        onStartVr={() => startSession("immersive-vr")}
        onEndSession={endSession}
        sessionActive={sessionActive}
        sessionError={sessionError}
        onCutCapture={handleCapture}
        onVrmStage={handleVrmStage}
      />
    </div>
  );
}
