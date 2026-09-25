import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

import { CANVAS_W } from "./studio-assets";
import { STUDIO_RASTER_ASSETS } from "./render/studio-raster-assets";
import { BG_SCENES } from "./studio-bg-scenes";
import { BG_SCENES_EXTRA } from "./studio-bg-scenes-extra";
import { listStudioElementLibrary } from "./studio-elements-catalog";
import {
  STUDIO_GENERATED_BG_SCENES,
  STUDIO_GENERATED_ELEMENT_ITEMS,
} from "./studio-generated-2d-catalog";
import {
  canDragStudioInsertHubEntry,
  writeStudioInsertHubDragPayload,
} from "./studio-insert-hub-drag";
import { buildStudioInsertHubEntries } from "./studio-insert-hub-model";
import { SCENE_TEMPLATES } from "./studio-scene-templates";
import { buildStudioUnifiedAssetCatalog } from "./studio-unified-asset-catalog";

import type { StudioInsertHubEntry } from "./studio-insert-hub-model";
import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

export interface StudioInsertHubDirectDragBoundaryProps {
  readonly toolBelt: StudioToolBeltContentProps;
  readonly children: ReactNode;
}

function describedByWithToken(value: string | null, token: string): string {
  return [...new Set([...(value ?? "").split(/\s+/u), token])]
    .filter(Boolean)
    .join(" ");
}

function describedByWithoutToken(value: string | null, token: string): string {
  return (value ?? "")
    .split(/\s+/u)
    .filter((candidate) => candidate && candidate !== token)
    .join(" ");
}

function buildDirectDragEntries(
  toolBelt: StudioToolBeltContentProps,
): readonly StudioInsertHubEntry[] {
  const items = buildStudioUnifiedAssetCatalog({
    rasterAssets: STUDIO_RASTER_ASSETS,
    backgrounds: [
      ...STUDIO_GENERATED_BG_SCENES,
      ...BG_SCENES,
      ...BG_SCENES_EXTRA,
      ...toolBelt.studioOptionalAssets.bgSceneSections.flatMap(
        (section) => section.scenes,
      ),
    ],
    sceneTemplates: [
      ...SCENE_TEMPLATES,
      ...toolBelt.sceneTemplates.templates,
    ],
    elements: [
      ...STUDIO_GENERATED_ELEMENT_ITEMS,
      ...listStudioElementLibrary(),
    ],
    localAssets: toolBelt.assets,
  });
  return buildStudioInsertHubEntries(items);
}

function rememberOriginalTitle(button: HTMLButtonElement): void {
  if (button.dataset.studioInsertDirectDragOriginalTitle !== undefined) return;
  button.dataset.studioInsertDirectDragOriginalTitle =
    button.getAttribute("title") ?? "";
}

function restoreOriginalTitle(button: HTMLButtonElement): void {
  const originalTitle = button.dataset.studioInsertDirectDragOriginalTitle;
  if (originalTitle === undefined) return;
  if (originalTitle) button.setAttribute("title", originalTitle);
  else button.removeAttribute("title");
  delete button.dataset.studioInsertDirectDragOriginalTitle;
}

function dragHandleForCard(card: HTMLElement): HTMLButtonElement | null {
  const explicit = card.querySelector<HTMLButtonElement>(
    "button[data-studio-insert-drag-handle]",
  );
  if (explicit) return explicit;
  const buttons = card.querySelectorAll<HTMLButtonElement>("button");
  return buttons.item(buttons.length - 1);
}

function synchronizeButtons(
  root: HTMLElement,
  entriesById: ReadonlyMap<string, StudioInsertHubEntry>,
  allowed: boolean,
  helpId: string,
): void {
  for (const card of root.querySelectorAll<HTMLElement>(
    "[data-studio-insert-entry]",
  )) {
    const entryId = card.dataset.studioInsertEntry;
    const entry = entryId ? entriesById.get(entryId) : undefined;
    const button = dragHandleForCard(card);
    if (!button) continue;
    const draggable = Boolean(
      allowed && entry && canDragStudioInsertHubEntry(entry),
    );
    button.draggable = draggable;
    if (draggable && entry) {
      rememberOriginalTitle(button);
      button.dataset.studioInsertDirectDrag = "true";
      button.setAttribute(
        "aria-describedby",
        describedByWithToken(button.getAttribute("aria-describedby"), helpId),
      );
      button.title = `${entry.title} · 캔버스의 원하는 위치로 끌어 놓기`;
    } else {
      delete button.dataset.studioInsertDirectDrag;
      button.removeAttribute("draggable");
      const describedBy = describedByWithoutToken(
        button.getAttribute("aria-describedby"),
        helpId,
      );
      if (describedBy) button.setAttribute("aria-describedby", describedBy);
      else button.removeAttribute("aria-describedby");
      restoreOriginalTitle(button);
    }
  }
}

export function StudioInsertHubDirectDragBoundary({
  toolBelt,
  children,
}: StudioInsertHubDirectDragBoundaryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const allowed = !toolBelt.activeSurfaceReviewLocked;
  const entries = useMemo(
    () => buildDirectDragEntries(toolBelt),
    [toolBelt],
  );
  const entriesById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry] as const)),
    [entries],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const synchronize = () =>
      synchronizeButtons(root, entriesById, allowed, helpId);
    synchronize();
    const observer = new MutationObserver(synchronize);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-studio-insert-entry", "data-studio-insert-drag-handle"],
    });
    return () => {
      observer.disconnect();
      synchronizeButtons(root, entriesById, false, helpId);
    };
  }, [allowed, entriesById, helpId]);

  function handleDragStart(event: ReactDragEvent<HTMLDivElement>): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(
      'button[data-studio-insert-direct-drag="true"]',
    );
    if (!button || !rootRef.current?.contains(button)) return;
    const card = button.closest<HTMLElement>("[data-studio-insert-entry]");
    const entryId = card?.dataset.studioInsertEntry;
    const entry = entryId ? entriesById.get(entryId) : undefined;
    if (
      !allowed
      || !entry
      || !writeStudioInsertHubDragPayload(event.dataTransfer, {
        entry,
        canvasWidth: CANVAS_W,
        canvasHeight: toolBelt.canvasH,
      })
    ) {
      event.preventDefault();
    }
  }

  return (
    <div
      ref={rootRef}
      className="contents"
      onDragStartCapture={handleDragStart}
      data-studio-insert-direct-drag-boundary="true"
    >
      <span id={helpId} className="sr-only">
        캔버스의 원하는 위치로 끌어 놓을 수 있습니다. 클릭과 키보드 실행은
        기존 삽입 동작을 그대로 사용합니다.
      </span>
      {children}
    </div>
  );
}
