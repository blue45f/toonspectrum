import { useEffect, useRef } from "react";

import {
  matchStudioShortcut,
  type StudioAppSettings,
} from "../studio-app-settings";
import {
  isStudioPersistentHandShortcut,
  planStudioHandShortcutMigration,
  shouldDispatchStudioHandShortcut,
} from "./studio-hand-shortcut-policy";

interface StudioHandShortcutControllerOptions {
  readonly appSettings: StudioAppSettings;
  readonly settingsReady: boolean;
  readonly commitAppSettings: (next: StudioAppSettings) => void;
  readonly onToggleHandTool: () => void;
}

function isStudioTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable ||
    target.getAttribute("role") === "textbox"
  );
}

function isInsideStudioShortcutBoundary(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(
      "[data-studio-shortcut-boundary='true'], [aria-modal='true']"
    ) !== null
  );
}

function hasVisibleStudioModal() {
  if (typeof document === "undefined") return false;
  return [...document.querySelectorAll<HTMLElement>("[aria-modal='true']")].some(
    (modal) => !modal.hidden && !modal.inert && modal.getClientRects().length > 0
  );
}

/**
 * Owns the persistent Hand-tool shortcut without expanding the already large
 * page-level editor dispatcher. The capture listener runs before the legacy
 * canvas-flip binding, while typing and modal boundaries mirror the global
 * Studio shortcut safety contract.
 */
export function useStudioHandShortcutController({
  appSettings,
  settingsReady,
  commitAppSettings,
  onToggleHandTool,
}: StudioHandShortcutControllerOptions) {
  const latestRef = useRef({
    handShortcut: appSettings.shortcuts["tool-hand"],
    onToggleHandTool,
  });

  useEffect(() => {
    latestRef.current = {
      handShortcut: appSettings.shortcuts["tool-hand"],
      onToggleHandTool,
    };
  }, [appSettings.shortcuts, onToggleHandTool]);

  useEffect(() => {
    if (!settingsReady) return;
    const migration = planStudioHandShortcutMigration(appSettings.shortcuts);
    if (!migration) return;

    commitAppSettings({
      ...appSettings,
      shortcuts: {
        ...appSettings.shortcuts,
        "tool-hand": migration.handShortcut,
        "flip-canvas": migration.canvasFlipShortcut,
      },
    });
  }, [appSettings, commitAppSettings, settingsReady]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { handShortcut, onToggleHandTool: toggleHandTool } = latestRef.current;
      if (!isStudioPersistentHandShortcut(handShortcut)) return;
      if (
        !shouldDispatchStudioHandShortcut({
          defaultPrevented: event.defaultPrevented,
          isComposing: event.isComposing,
          keyCode: event.keyCode,
          repeat: event.repeat,
          typing: isStudioTypingTarget(event.target),
          insideShortcutBoundary: isInsideStudioShortcutBoundary(event.target),
          openModal: hasVisibleStudioModal(),
        })
      ) {
        return;
      }
      if (!matchStudioShortcut(handShortcut, event)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      toggleHandTool();
    };

    globalThis.addEventListener("keydown", onKeyDown, true);
    return () => globalThis.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
