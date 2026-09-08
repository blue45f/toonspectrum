import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import { installStudioDialogFocusReturn } from "./studio-dialog-focus-return";
import { installStudioErrorJournal } from "./studio-error-journal";
import {
  requestStudioCommandSearch,
  subscribeStudioHelpCenter,
} from "./studio-help-center-channel";
import { resolveStudioHelpSurface } from "./studio-help-surface-routing";

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

const StudioGuidedHelpDialog = lazy(() =>
  import("./StudioGuidedHelpDialog").then((module) => ({
    default: module.StudioGuidedHelpDialog,
  })),
);

type StudioHelpSurface = "center" | "context" | "guided";

interface StudioHelpCenterState {
  readonly open: boolean;
  readonly surface: StudioHelpSurface;
  readonly section: StudioHelpCenterSection;
  readonly toolCommandId: string | null;
}

const CLOSED_STATE: StudioHelpCenterState = {
  open: false,
  surface: "center",
  section: "diagnostics",
  toolCommandId: null,
};

function currentToolSurface(toolCommandId: string | null): StudioHelpSurface {
  return toolCommandId ? "guided" : "context";
}

export function StudioHelpCenterHost() {
  const [state, setState] = useState<StudioHelpCenterState>(CLOSED_STATE);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => installStudioErrorJournal(), []);
  useEffect(() => installStudioDialogFocusReturn(), []);

  useEffect(
    () =>
      subscribeStudioHelpCenter((request) => {
        openerRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const route = resolveStudioHelpSurface(request);
        if (route.surface === "guided") {
          setState({
            open: true,
            surface: currentToolSurface(route.toolCommandId),
            section: "current-tool",
            toolCommandId: route.toolCommandId,
          });
          return;
        }
        setState({
          open: true,
          surface: "center",
          section: route.section,
          toolCommandId: route.toolCommandId,
        });
      }),
    [],
  );

  const close = useCallback(() => {
    setState(CLOSED_STATE);
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() =>
      openerRef.current?.focus({ preventScroll: true }),
    );
  }, []);

  const changeSection = useCallback((section: StudioHelpCenterSection) => {
    setState((current) => {
      if (section === "current-tool") {
        return {
          ...current,
          open: true,
          surface: currentToolSurface(current.toolCommandId),
          section,
        };
      }
      return {
        ...current,
        open: true,
        surface: "center",
        section,
      };
    });
  }, []);

  const openCommandSearch = useCallback(() => {
    setState(CLOSED_STATE);
    requestStudioCommandSearch();
  }, []);

  const openManual = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open("/studio/manual", "_blank", "noopener,noreferrer");
  }, []);

  if (!state.open) return null;

  return (
    <Suspense fallback={null}>
      {state.surface === "guided" ? (
        <StudioGuidedHelpDialog
          open
          initialToolCommandId={state.toolCommandId}
          onOpenSupport={changeSection}
          onOpenCommandSearch={openCommandSearch}
          onOpenManual={openManual}
          onClose={close}
        />
      ) : state.surface === "context" ? (
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
