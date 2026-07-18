import { ChevronDown, LayoutPanelTop } from "lucide-react";
import { Suspense, useState, type ComponentType } from "react";

import { createStudioIntentLazyLoader } from "./studio-intent-lazy-loader";
import {
  isStudioWorkspaceDirty,
  resolveStudioWorkspace,
  updateStudioWorkspaceLiveLayout,
} from "./studio-workspaces";

import type { StudioWorkspaceMenuProps } from "./StudioWorkspaceMenu";

import { lazyRetry } from "@/lib/lazy-retry";

type StudioWorkspaceMenuModule = {
  default: ComponentType<StudioWorkspaceMenuProps>;
};

const studioWorkspaceMenuLoader = createStudioIntentLazyLoader<StudioWorkspaceMenuModule>(() =>
  import("./StudioWorkspaceMenu").then((module) => ({ default: module.StudioWorkspaceMenu }))
);

const LazyStudioWorkspaceMenu = lazyRetry(
  studioWorkspaceMenuLoader.load,
  "StudioWorkspaceMenu"
);

/** Warms the optional workspace manager without activating or moving focus. */
function preloadStudioWorkspaceMenu(): void {
  studioWorkspaceMenuLoader.preload();
}

type StudioWorkspaceMenuGateProps = Omit<
  StudioWorkspaceMenuProps,
  "initialOpen" | "onInitialOpenReady"
>;

function StudioWorkspaceMenuTrigger({
  state,
  liveLayout,
  persistence,
  busy,
  onActivate,
}: Pick<
  StudioWorkspaceMenuGateProps,
  "state" | "liveLayout" | "persistence"
> & {
  busy: boolean;
  onActivate: () => void;
}) {
  const syncedState = updateStudioWorkspaceLiveLayout(state, liveLayout);
  const activeWorkspace = resolveStudioWorkspace(
    syncedState,
    syncedState.activeWorkspaceId
  );
  const dirty = isStudioWorkspaceDirty(syncedState);
  const sessionOnly = persistence.status === "session-only";

  return (
    <span
      className="relative inline-flex"
      data-testid="studio-workspace-menu-gate"
      data-studio-shortcut-boundary="true"
    >
      <button
        type="button"
        onClick={onActivate}
        onPointerEnter={preloadStudioWorkspaceMenu}
        onPointerDown={preloadStudioWorkspaceMenu}
        onFocus={preloadStudioWorkspaceMenu}
        aria-haspopup="dialog"
        aria-expanded={false}
        aria-busy={busy || undefined}
        aria-label={`작업공간: ${activeWorkspace?.name ?? "알 수 없음"}${dirty ? ", 저장되지 않은 배치 변경 있음" : ""}${sessionOnly ? ", 변경은 이 세션에서만 유지" : ", 이 기기 저장 확인됨"}`}
        className="inline-flex min-h-11 max-w-52 items-center gap-2 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-panel pointer-coarse:min-h-11 lg:min-h-8"
      >
        <LayoutPanelTop size={15} aria-hidden className="shrink-0" />
        <span className="min-w-0 truncate">
          {activeWorkspace?.name ?? "작업공간"}
        </span>
        {dirty ? (
          <span className="shrink-0 rounded-full bg-warn/15 px-1.5 py-0.5 text-[0.6875rem] font-bold text-warn">
            변경됨
          </span>
        ) : null}
        {sessionOnly ? (
          <span className="shrink-0 rounded-full bg-cool/15 px-1.5 py-0.5 text-[0.6875rem] font-bold text-cool">
            세션
          </span>
        ) : null}
        <ChevronDown size={13} aria-hidden className="ml-auto shrink-0" />
      </button>
      {busy ? (
        <span
          className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-line"
          aria-hidden
        >
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
        </span>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? "작업공간 메뉴를 여는 중입니다." : ""}
      </span>
    </span>
  );
}

/**
 * Keeps the 1,800-line workspace manager out of the drawing route until the
 * creator shows intent. Hover/focus warms the chunk; click mounts it already
 * open so mouse, touch, and keyboard all keep the original one-action flow.
 */
export function StudioWorkspaceMenuGate(
  props: StudioWorkspaceMenuGateProps
) {
  const [activationAttempt, setActivationAttempt] = useState(0);
  const [managerReady, setManagerReady] = useState(false);
  const activated = activationAttempt > 0;

  return (
    <>
      {!managerReady ? (
        <StudioWorkspaceMenuTrigger
          state={props.state}
          liveLayout={props.liveLayout}
          persistence={props.persistence}
          busy={activated}
          onActivate={() => setActivationAttempt((attempt) => attempt + 1)}
        />
      ) : null}
      {activated ? (
        <Suspense fallback={null}>
          <LazyStudioWorkspaceMenu
            key={activationAttempt}
            {...props}
            initialOpen
            onInitialOpenReady={setManagerReady}
          />
        </Suspense>
      ) : null}
    </>
  );
}
