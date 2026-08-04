/**
 * Always-on Pixi selectable-scene overlay host.
 *
 * Mounts a dedicated transparent, pointer-inactive Pixi canvas above the Konva
 * stage. Syncs document selection bounds into Pixi; never owns brush pixels or
 * hit-test authority (pointer-events: none).
 */

import { useEffect, useRef } from "react";

import {
  buildStudioPixiSelectableOverlaysForSelection,
  planStudioPixiOverlaySync,
  studioPixiSceneHostIsAlwaysOn,
  type StudioPixiHostElementLike,
} from "./studio-pixi-scene-host-admission";
import {
  createStudioPixiSceneProvider,
} from "./studio-pixi-scene-provider";

import type { StudioSceneProvider } from "./studio-scene-provider";

export interface StudioPixiSceneOverlayHostProps {
  readonly enabled?: boolean;
  /** Stage host that already has `position: relative` (e.g. Konva stage wrap). */
  readonly mountParent: HTMLElement | null;
  readonly width: number;
  readonly height: number;
  readonly dpr?: number;
  readonly elements: readonly StudioPixiHostElementLike[];
  readonly selectedIds: readonly string[];
}

export function StudioPixiSceneOverlayHost({
  enabled = studioPixiSceneHostIsAlwaysOn(),
  mountParent,
  width,
  height,
  dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  elements,
  selectedIds,
}: StudioPixiSceneOverlayHostProps) {
  const providerRef = useRef<StudioSceneProvider | null>(null);
  const trackedIdsRef = useRef<string[]>([]);
  const generationRef = useRef(0);

  // Create / destroy provider for always-on lifecycle.
  useEffect(() => {
    if (!enabled || !mountParent || width <= 0 || height <= 0) return;

    let cancelled = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    void (async () => {
      try {
        const provider = await createStudioPixiSceneProvider({
          width,
          height,
          dpr: Math.max(1, Math.min(3, dpr)),
          ownerDocument: mountParent.ownerDocument,
        });
        if (cancelled || generation !== generationRef.current) {
          provider.destroy();
          return;
        }
        const canvas = provider.canvas;
        canvas.style.zIndex = "18";
        mountParent.appendChild(canvas);
        providerRef.current = provider;
        provider.render();
      } catch {
        // Headless / no GPU: leave Konva overlays as sole selection chrome.
        providerRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      generationRef.current += 1;
      const provider = providerRef.current;
      providerRef.current = null;
      trackedIdsRef.current = [];
      if (provider) {
        try {
          provider.destroy();
        } catch {
          /* ignore */
        }
      }
    };
  }, [enabled, mountParent, width, height, dpr]);

  // Sync selection overlays every selection/layout change.
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || provider.destroyed) return;

    const overlays = buildStudioPixiSelectableOverlaysForSelection(
      elements,
      selectedIds,
    );
    const plan = planStudioPixiOverlaySync(trackedIdsRef.current, overlays);
    for (const id of plan.removeIds) {
      provider.removeSelectableOverlay(id);
    }
    for (const overlay of plan.upsert) {
      provider.upsertSelectableOverlay(overlay);
    }
    trackedIdsRef.current = overlays.map((overlay) => overlay.documentId);
    provider.render();
  }, [elements, selectedIds]);

  // Resize when stage metrics change without remounting provider when possible.
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || provider.destroyed) return;
    if (width <= 0 || height <= 0) return;
    try {
      provider.resize({
        width,
        height,
        dpr: Math.max(1, Math.min(3, dpr)),
      });
      provider.render();
    } catch {
      /* provider may be mid-destroy */
    }
  }, [width, height, dpr]);

  return null;
}
