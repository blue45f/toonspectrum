import { lazy, Suspense, useEffect, useRef, useState } from "react";
import * as studioHelpCenterChannel from "./studio-help-center-channel";
import type { StudioHelpCenterSection } from "./studio-help-center-channel";

const StudioHelpCenterDialog = lazy(() =>
  import("./StudioHelpCenterDialog").then((module) => ({
    default: module.StudioHelpCenterDialog,
  })),
);

const StudioContextHelpDialog = lazy(() =>
  import("./StudioContextHelpDialog").then((module) => ({
    default: module.StudioContextHelpDialog,
  })),
);

interface StudioHelpCenterState {
  readonly open: boolean;
  readonly section: StudioHelpCenterSection;
  readonly toolCommandId: string | null;
}

interface StudioHelpCenterRequestLike {
  readonly section: StudioHelpCenterSection;
  readonly toolCommandId?: string | null;
}

type StudioHelpCenterSubscriber = (
  listener: (request: StudioHelpCenterRequestLike) => void,
) => (() => void) | void;

const CLOSED_STATE: StudioHelpCenterState = {
  open: false,
  section: "diagnostics",
  toolCommandId: null,
};

function resolveHelpCenterSubscriber(): StudioHelpCenterSubscriber | null {
  const channel = studioHelpCenterChannel as unknown as Record<string, unknown>;
  const candidates = [
    "subscribeStudioHelpCenter",
    "subscribeStudioHelpCenterRequest",
    "subscribeStudioHelpCenterRequests",
    "onStudioHelpCenterRequest",
  ] as const;

  for (const candidate of candidates) {
    const value = channel[candidate];
    if (typeof value === "function") return value as StudioHelpCenterSubscriber;
  }
  return null;
}

export function StudioHelpCenterHost() {
  const [state, setState] = useState<StudioHelpCenterState>(CLOSED_STATE);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const subscribe = resolveHelpCenterSubscriber();
    if (!subscribe) {
      console.error("[studio-help] Help center request subscriber is unavailable.");
      return undefined;
    }

    return subscribe((request) => {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setState({
        open: true,
        section: request.section,
        toolCommandId: request.toolCommandId ?? null,
      });
    });
  }, []);

  if (!state.open) return null;

  const close = () => {
    setState(CLOSED_STATE);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };

  const changeSection = (section: StudioHelpCenterSection) => {
    setState((current) => ({ ...current, section }));
  };

  return (
    <Suspense fallback={null}>
      {state.section === "current-tool" ? (
        <StudioContextHelpDialog
          key={state.toolCommandId ?? "studio-help-home"}
          open
          toolCommandId={state.toolCommandId}
          onClose={close}
          onOpenSection={changeSection}
        />
      ) : (
        <StudioHelpCenterDialog
          open
          section={state.section}
          toolCommandId={state.toolCommandId}
          onSectionChange={changeSection}
          onClose={close}
        />
      )}
    </Suspense>
  );
}
