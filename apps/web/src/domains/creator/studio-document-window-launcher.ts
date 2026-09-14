import type { StudioDocumentWorkspaceId } from "./studio-document-workspace";
import { studioDocumentWindowScopeToken } from "./studio-document-window-coordination";

export type StudioDocumentWindowLaunchMode = "tab" | "window";
export type StudioDocumentWindowOpenStatus = "opened" | "blocked";

export interface StudioDocumentWindowScreen {
  readonly availWidth: number;
  readonly availHeight: number;
  readonly availLeft?: number;
  readonly availTop?: number;
}

export interface OpenStudioDocumentWorkspaceInput {
  readonly href: string;
  readonly documentKey: string;
  readonly workspace: StudioDocumentWorkspaceId;
  readonly mode: StudioDocumentWindowLaunchMode;
  readonly index?: number;
  readonly total?: number;
  readonly screen?: StudioDocumentWindowScreen | null;
  readonly openWindow?: (
    url: string,
    target: string,
    features: string,
  ) => Window | null;
}
function fallbackScreen(): StudioDocumentWindowScreen {
  if (typeof window === "undefined") {
    return { availWidth: 1440, availHeight: 900, availLeft: 0, availTop: 0 };
  }
  return {
    availWidth: window.screen.availWidth || 1440,
    availHeight: window.screen.availHeight || 900,
    availLeft: "availLeft" in window.screen
      ? (window.screen as Screen & { availLeft?: number }).availLeft
      : 0,
    availTop: "availTop" in window.screen
      ? (window.screen as Screen & { availTop?: number }).availTop
      : 0,
  };
}

function positiveDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function studioDocumentWindowName(
  documentKey: string,
  workspace: StudioDocumentWorkspaceId,
): string {
  return `toonspectrum-studio-${studioDocumentWindowScopeToken(documentKey)}-${workspace}`;
}
export function studioDocumentWindowFeatures(input: {
  readonly index?: number;
  readonly total?: number;
  readonly screen?: StudioDocumentWindowScreen | null;
} = {}): string {
  const bounds = input.screen ?? fallbackScreen();
  const availableWidth = positiveDimension(bounds.availWidth, 1440);
  const availableHeight = positiveDimension(bounds.availHeight, 900);
  const originLeft = Number.isFinite(bounds.availLeft) ? Math.floor(bounds.availLeft ?? 0) : 0;
  const originTop = Number.isFinite(bounds.availTop) ? Math.floor(bounds.availTop ?? 0) : 0;
  const total = Math.min(4, Math.max(1, Math.floor(input.total ?? 1)));
  const index = Math.min(total - 1, Math.max(0, Math.floor(input.index ?? 0)));
  const columns = total === 1 ? 1 : 2;
  const rows = Math.ceil(total / columns);
  const gap = 12;
  const width = total === 1
    ? Math.min(1180, Math.max(640, availableWidth - 96))
    : Math.max(520, Math.floor((availableWidth - gap * (columns + 1)) / columns));
  const height = total === 1
    ? Math.min(900, Math.max(620, availableHeight - 80))
    : Math.max(560, Math.floor((availableHeight - gap * (rows + 1)) / rows));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const left = total === 1
    ? originLeft + Math.max(gap, Math.floor((availableWidth - width) / 2))
    : originLeft + gap + column * (width + gap);
  const top = total === 1
    ? originTop + Math.max(gap, Math.floor((availableHeight - height) / 2))
    : originTop + gap + row * (height + gap);
  return [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "menubar=no",
    "toolbar=no",
    "location=yes",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
}

function defaultOpenWindow(url: string, target: string, features: string): Window | null {
  return window.open(url, target, features);
}
export function openStudioDocumentWorkspace(
  input: OpenStudioDocumentWorkspaceInput,
): StudioDocumentWindowOpenStatus {
  const openWindow = input.openWindow ?? defaultOpenWindow;
  const target = input.mode === "tab"
    ? "_blank"
    : studioDocumentWindowName(input.documentKey, input.workspace);
  const features = input.mode === "tab"
    ? "noopener,noreferrer"
    : studioDocumentWindowFeatures({
        index: input.index,
        total: input.total,
        screen: input.screen,
      });
  let opened: Window | null;
  try {
    opened = openWindow(input.href, target, features);
  } catch {
    return "blocked";
  }
  if (!opened) return "blocked";
  try {
    opened.opener = null;
  } catch {
    // Cross-browser popup implementations can expose a read-only opener.
  }
  try {
    opened.focus();
  } catch {
    // Opening succeeded even when the browser refuses foreground focus.
  }
  return "opened";
}
