import { Loader2 } from "lucide-react";
import {
  cloneElement,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  releaseStudioBg3dRetainedOwnerLease,
  reportStudioBg3dRetainedOwnerCleanup,
  type StudioBg3dRetainedElement,
  studioBg3dRetainedOwnerSource,
} from "./studio-bg3d-retained-owner";

export const BG3D_RETAINED_OWNER_STALE_RELEASE_MS = 250;

function Bg3DRetainedLoadingOverlay() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const engineTimer = window.setTimeout(() => setStage(1), 900);
    const assetsTimer = window.setTimeout(() => setStage(2), 2_800);
    return () => {
      window.clearTimeout(engineTimer);
      window.clearTimeout(assetsTimer);
    };
  }, []);
  const stages = ["작업공간 준비", "3D 엔진 연결", "에셋 목록 준비"] as const;
  return (
    <div aria-live="polite" aria-busy="true" className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[oklch(0.08_0.01_70/0.84)] p-3 text-fg backdrop-blur-md sm:p-5">
      <div aria-hidden="true" className="absolute inset-4 grid grid-cols-[minmax(10rem,0.26fr)_minmax(0,1fr)_minmax(12rem,0.3fr)] gap-2 opacity-35 sm:inset-8 sm:gap-3">
        <div className="rounded-2xl border border-line bg-panel/70 p-3"><div className="h-7 rounded-lg bg-raised" /><div className="mt-3 h-12 rounded-xl bg-card" /><div className="mt-2 h-12 rounded-xl bg-card" /><div className="mt-2 h-12 rounded-xl bg-card" /></div>
        <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-panel to-raised"><div className="absolute inset-x-0 bottom-0 h-2/3 bg-[linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:42px_42px] [transform:perspective(480px)_rotateX(62deg)_scale(1.45)]" /></div>
        <div className="rounded-2xl border border-line bg-panel/70 p-3"><div className="h-8 rounded-lg bg-raised" /><div className="mt-3 h-24 rounded-xl bg-card" /><div className="mt-2 h-24 rounded-xl bg-card" /></div>
      </div>
      <section className="relative w-[min(31rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-accent/30 bg-panel/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
        <span aria-hidden="true" className="absolute -right-16 -top-20 size-56 rounded-full border border-accent/20" />
        <div className="relative flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent"><Loader2 className="animate-spin motion-reduce:animate-none" size={19} aria-hidden /></span>
          <div className="min-w-0">
            <p className="text-[0.64rem] font-black uppercase tracking-[0.15em] text-accent">3D SCENE STARTUP</p>
            <h2 className="mt-1 text-base font-black text-fg sm:text-lg">3D 배경 도구를 여는 중</h2>
            <p className="mt-1 text-xs leading-5 text-fg-2">빈 장면과 기본 카메라를 먼저 준비하고, 무거운 엔진과 에셋은 단계적으로 연결합니다.</p>
          </div>
        </div>
        <ol className="relative mt-5 grid gap-2 sm:grid-cols-3">
          {stages.map((label, index) => (
            <li key={label} className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${index <= stage ? "border-accent/35 bg-accent-soft text-accent" : "border-line bg-card text-fg-3"}`}>
              <span className="mr-1.5 font-black">{index + 1}</span>{label}
              <span className="mt-1 block text-[0.62rem] font-medium opacity-75">{index < stage ? "준비됨" : index === stage ? "준비 중" : "대기"}</span>
            </li>
          ))}
        </ol>
        {stage >= 2 ? <p className="relative mt-4 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2 text-[0.68rem] leading-5 text-fg-2">첫 실행은 브라우저와 그래픽 장치에 따라 조금 더 걸릴 수 있습니다. 화면이 열리면 간편 모드에서 샘플 장소를 바로 선택할 수 있습니다.</p> : null}
      </section>
    </div>
  );
}

interface HostedBg3dRetainedElementProps {
  readonly element: StudioBg3dRetainedElement;
  readonly generation: number;
  readonly logicalOpen: boolean;
  readonly onHostMounted: (generation: number) => void;
  readonly onHostUnmounted: (generation: number) => void;
  readonly onWebXrCleanupPendingChange: (generation: number, pending: boolean) => void;
}

function HostedBg3dRetainedElement({
  element,
  generation,
  logicalOpen,
  onHostMounted,
  onHostUnmounted,
  onWebXrCleanupPendingChange,
}: HostedBg3dRetainedElementProps) {
  useLayoutEffect(() => {
    onHostMounted(generation);
    return () => {
      onHostUnmounted(generation);
    };
  }, [generation, onHostMounted, onHostUnmounted]);

  return cloneElement(element, {
    open: logicalOpen,
    onWebXrCleanupPendingChange: (pending: boolean) => {
      onWebXrCleanupPendingChange(generation, pending);
    },
  });
}

/**
 * Lives in AppShell's chrome layer, outside RouteStage. This is the sole render site for the BG3D
 * editor, so a route teardown can retain the same R3F Canvas without constructing a second
 * renderer. Normal route changes still show nothing; only an in-flight cleanup lease remains.
 */
export function StudioBg3dRetainedOwnerHost() {
  const hostMountedGenerationRef = useRef(0);
  const staleReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStaleReleaseTimer = useCallback(() => {
    if (staleReleaseTimerRef.current === null) return;
    clearTimeout(staleReleaseTimerRef.current);
    staleReleaseTimerRef.current = null;
  }, []);

  const markHostMounted = useCallback(
    (generation: number) => {
      hostMountedGenerationRef.current = generation;
      clearStaleReleaseTimer();
    },
    [clearStaleReleaseTimer],
  );

  const markHostUnmounted = useCallback((generation: number) => {
    if (hostMountedGenerationRef.current === generation) {
      hostMountedGenerationRef.current = 0;
    }
  }, []);

  const lease = useSyncExternalStore(
    studioBg3dRetainedOwnerSource.subscribe,
    studioBg3dRetainedOwnerSource.getSnapshot,
    studioBg3dRetainedOwnerSource.getSnapshot,
  );

  useEffect(() => {
    clearStaleReleaseTimer();
    if (
      lease.element === null
      || lease.routeAttached
      || !lease.cleanupPending
      || lease.logicalOpen
      || hostMountedGenerationRef.current === lease.generation
    ) {
      return;
    }

    staleReleaseTimerRef.current = setTimeout(() => {
      const latestLease = studioBg3dRetainedOwnerSource.getSnapshot();
      if (
        latestLease.generation !== lease.generation
        || latestLease.routeAttached
        || latestLease.element === null
        || !latestLease.cleanupPending
        || hostMountedGenerationRef.current === latestLease.generation
      ) {
        return;
      }
      releaseStudioBg3dRetainedOwnerLease(latestLease.generation);
    }, BG3D_RETAINED_OWNER_STALE_RELEASE_MS);

    return clearStaleReleaseTimer;
  }, [lease, clearStaleReleaseTimer]);

  if (!lease.element) return null;
  return (
    <Suspense fallback={lease.logicalOpen ? <Bg3DRetainedLoadingOverlay /> : null}>
      <HostedBg3dRetainedElement
        element={lease.element}
        generation={lease.generation}
        logicalOpen={lease.logicalOpen}
        onHostMounted={markHostMounted}
        onHostUnmounted={markHostUnmounted}
        onWebXrCleanupPendingChange={(generation, pending) => {
          reportStudioBg3dRetainedOwnerCleanup(generation, pending);
        }}
      />
    </Suspense>
  );
}
