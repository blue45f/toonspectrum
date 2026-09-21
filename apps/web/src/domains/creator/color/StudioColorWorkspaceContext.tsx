/* eslint-disable react-refresh/only-export-components -- paired provider and hooks share a scoped UI contract */
import { rememberSharedStudioRecentColor } from "../studio-recent-colors-bridge";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collectStudioDocumentColors } from "../studio-document-colors";
import type { El } from "../studio-element-model";
import type { StudioColorPopoverPurpose } from "../studio-color-popover-hints";

type ColorTarget = "primary" | "secondary";
export interface StudioColorWorkspaceInputs {
  readonly ownerKey: string;
  readonly selectionKey: string;
  readonly primary: string;
  readonly secondary: string;
  readonly elements: readonly El[];
  readonly pinned: boolean;
  readonly isMobile: boolean;
  readonly onPrimaryChange: (color: string) => void;
  readonly onSecondaryChange: (color: string) => void;
  readonly onPinnedChange: (pinned: boolean) => void;
  readonly onRevealDock: () => void;
  readonly onBeforePopupOpen: () => void;
  readonly onRequestSample?: (apply: (color: string) => void) => void;
}

interface StudioColorWorkspaceValue extends StudioColorWorkspaceInputs {
  readonly target: ColorTarget;
  readonly documentColors: readonly string[];
  readonly focusToken: number;
  readonly setTarget: (target: ColorTarget) => void;
  readonly requestDock: (target: ColorTarget) => boolean;
  readonly pinDock: (target: ColorTarget) => void;
  readonly sampleColor: (target: ColorTarget) => void;
}

const Context = createContext<StudioColorWorkspaceValue | null>(null);

export function StudioColorWorkspaceProvider({ value, children }: { value: StudioColorWorkspaceInputs; children: ReactNode }) {
  const [target, setTarget] = useState<ColorTarget>("primary");
  const [focusToken, setFocusToken] = useState(0);
  const ownerRef = useRef(value.ownerKey);
  const authorityRef = useRef(value);
  const mountedRef = useRef(true);
  useLayoutEffect(() => { authorityRef.current = value; });
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const documentColors = useMemo(() => collectStudioDocumentColors(value.elements), [value.elements]);
  useEffect(() => {
    if (ownerRef.current === value.ownerKey) return;
    ownerRef.current = value.ownerKey;
    setTarget("primary"); setFocusToken(0);
  }, [value.ownerKey]);
  const requestDock = useCallback((next: ColorTarget): boolean => {
    if (!value.pinned || value.isMobile) return false;
    setTarget(next); setFocusToken((token) => token + 1); value.onRevealDock();
    return true;
  }, [value]);
  const pinDock = useCallback((next: ColorTarget) => {
    setTarget(next); setFocusToken((token) => token + 1);
    value.onPinnedChange(true); value.onRevealDock();
  }, [value]);
  const sampleColor = useCallback((target: ColorTarget) => {
    const current = authorityRef.current;
    const original = current[target];
    current.onRequestSample?.((color) => {
      if (!mountedRef.current || authorityRef.current.ownerKey !== current.ownerKey || authorityRef.current[target] !== original) return;
      if (target === "primary") current.onPrimaryChange(color); else current.onSecondaryChange(color);
      rememberSharedStudioRecentColor(color);
    });
  }, []);
  return <Context.Provider value={{ ...value, target, setTarget, documentColors, focusToken, requestDock, pinDock, sampleColor }}>{children}</Context.Provider>;
}

export function useStudioColorWorkspace() { return useContext(Context); }

export function useStudioColorTargetKey(purpose: StudioColorPopoverPurpose, controlId?: string, explicitKey?: string): string {
  const workspace = useStudioColorWorkspace();
  return [workspace?.ownerKey ?? "standalone", purpose === "brush-shape" ? "brush" : workspace?.selectionKey ?? "selection", explicitKey ?? controlId ?? purpose].join(":");
}
