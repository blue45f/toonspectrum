import { useEffect, useRef } from "react";

import { lowerStudioElementsToRenderScene } from "./studio-document-scene-lower";
import { buildStudioDocumentPresentScene } from "./studio-document-scene-present";
import { StudioFrameGraphCompositor } from "./studio-frame-graph-compositor";
import { buildStudioPixiSelectableOverlaysForSelection } from "./studio-pixi-scene-host-admission";
import {
  createStudioVelloHub,
  lowerStudioSceneOverlaysToVelloIsland,
  resolveStudioVelloHubProductCapability,
  type StudioVelloHub,
  type StudioVelloHubBackendId,
  type StudioVelloHubDecision,
} from "./studio-vello-hub";
import {
  createStudioVelloHubCanvasTarget,
  type StudioVelloHubCanvasTarget,
} from "./studio-vello-hub-canvas-target";

import type { El } from "../studio-element-model";
import type { StudioPixiHostElementLike } from "./studio-pixi-scene-host-admission";
import type { StudioSceneDocumentTransform } from "../studio-scene-provider";

export type StudioRenderSurfaceAuthorityStatus =
  | "disabled"
  | "idle"
  | "starting"
  | "active"
  | "fallback";

export interface StudioRenderSurfaceAuthority {
  readonly status: StudioRenderSurfaceAuthorityStatus;
  readonly backendId: StudioVelloHubBackendId | null;
  readonly decision: StudioVelloHubDecision | null;
  readonly reason: string | null;
  readonly ownedDocumentIds: readonly string[];
  readonly visibleCanvasCount: 1 | 0;
}

export interface StudioRenderSurfaceProps {
  readonly enabled?: boolean;
  readonly mountParent: HTMLElement | null;
  readonly width: number;
  readonly height: number;
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly dpr?: number;
  readonly elements: readonly El[];
  readonly selectedIds: readonly string[];
  readonly documentTransform?: StudioSceneDocumentTransform;
  readonly isPenDown?: () => boolean;
  readonly onAuthorityChange?: (authority: StudioRenderSurfaceAuthority) => void;
}

const DISABLED_AUTHORITY: StudioRenderSurfaceAuthority = Object.freeze({
  status: "disabled",
  backendId: null,
  decision: null,
  reason: "product capability disabled",
  ownedDocumentIds: [],
  visibleCanvasCount: 0,
});

/**
 * Single WebGPU document + overlay surface. Konva may keep pointer routing
 * until InteractionCore lands; it is no longer the pixel authority.
 */
export function StudioRenderSurface({
  enabled,
  mountParent,
  width,
  height,
  documentWidth,
  documentHeight,
  dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  elements,
  selectedIds,
  documentTransform,
  isPenDown,
  onAuthorityChange,
}: StudioRenderSurfaceProps) {
  const authoritySinkRef = useRef(onAuthorityChange);
  authoritySinkRef.current = onAuthorityChange;
  const hubRef = useRef<StudioVelloHub | null>(null);
  const targetRef = useRef<StudioVelloHubCanvasTarget | null>(null);
  const compositorRef = useRef<StudioFrameGraphCompositor | null>(null);
  const generationRef = useRef(0);
  const renderGenerationRef = useRef(0);
  const capability = resolveStudioVelloHubProductCapability({ enabled });

  useEffect(() => {
    if (!capability.enabled) {
      authoritySinkRef.current?.(DISABLED_AUTHORITY);
      return undefined;
    }
    if (!mountParent) {
      authoritySinkRef.current?.({
        status: "starting",
        backendId: null,
        decision: null,
        reason: "awaiting-canvas-mount",
        ownedDocumentIds: [],
        visibleCanvasCount: 0,
      });
      return undefined;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const target = createStudioVelloHubCanvasTarget(
      mountParent.ownerDocument,
      mountParent,
    );
    const compositor = new StudioFrameGraphCompositor();
    let hub: StudioVelloHub | null = null;
    const fallBack = (reason: string) => {
      if (generationRef.current !== generation) return;
      renderGenerationRef.current += 1;
      hub?.dispose();
      compositor.dispose();
      target.destroy();
      if (hubRef.current === hub) hubRef.current = null;
      if (targetRef.current === target) targetRef.current = null;
      if (compositorRef.current === compositor) compositorRef.current = null;
      authoritySinkRef.current?.({
        status: "fallback",
        backendId: null,
        decision: null,
        reason,
        ownedDocumentIds: [],
        visibleCanvasCount: 0,
      });
    };
    hub = createStudioVelloHub({
      target,
      isPenDown,
      onUnrecoverableFallback(failure) {
        fallBack(`${failure.source}:${failure.reason}`);
      },
    });
    targetRef.current = target;
    hubRef.current = hub;
    compositorRef.current = compositor;
    authoritySinkRef.current?.({
      status: "starting",
      backendId: null,
      decision: null,
      reason: null,
      ownedDocumentIds: [],
      visibleCanvasCount: 0,
    });

    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
      renderGenerationRef.current += 1;
      if (hubRef.current === hub) hubRef.current = null;
      if (targetRef.current === target) targetRef.current = null;
      if (compositorRef.current === compositor) compositorRef.current = null;
      hub.dispose();
      compositor.dispose();
      target.destroy();
    };
  }, [capability.enabled, isPenDown, mountParent]);

  useEffect(() => {
    if (!capability.enabled) return;
    const hub = hubRef.current;
    const target = targetRef.current;
    const compositor = compositorRef.current;
    if (!hub || !target || !compositor) return;

    const overlays = buildStudioPixiSelectableOverlaysForSelection(
      elements as readonly StudioPixiHostElementLike[],
      selectedIds,
      { documentWidth, documentHeight },
    );
    const admission = lowerStudioSceneOverlaysToVelloIsland(overlays, {
      width,
      height,
      dpr,
      ...(documentTransform ? { documentTransform } : {}),
    });
    const documentScene = lowerStudioElementsToRenderScene(elements, {
      width: Math.max(1, Math.round(documentWidth)),
      height: Math.max(1, Math.round(documentHeight)),
    });
    const presented = buildStudioDocumentPresentScene({
      elements,
      documentWidth,
      documentHeight,
      viewportWidth: width,
      viewportHeight: height,
      dpr,
      documentTransform,
      overlayNodes: admission.admitted ? admission.island.scene.nodes : [],
      overlayOffsetCss: admission.admitted
        ? { left: admission.island.placement.left, top: admission.island.placement.top }
        : undefined,
    });
    target.setIsland({
      id: "document-frame-graph",
      scene: presented.scene,
      placement: { left: 0, top: 0, width, height, dpr },
      documentIds: presented.ownedDocumentIds,
    });

    if (presented.scene.nodes.length === 0) {
      target.park?.();
      authoritySinkRef.current?.({
        status: "active",
        backendId: null,
        decision: null,
        reason: "konva-document-pixels",
        ownedDocumentIds: presented.ownedDocumentIds,
        visibleCanvasCount: 0,
      });
      return undefined;
    }

    const generation = generationRef.current;
    const renderGeneration = renderGenerationRef.current + 1;
    renderGenerationRef.current = renderGeneration;
    void compositor.execute(hub, {
      document: documentScene,
      presentScene: presented.scene,
      ownedDocumentIds: presented.ownedDocumentIds,
      dpr,
      penDown: isPenDown?.() ?? false,
    }).then(
      (receipt) => {
        if (
          generation !== generationRef.current
          || renderGeneration !== renderGenerationRef.current
          || hubRef.current !== hub
        ) return;
        const last = receipt.velloReceipts.at(-1);
        authoritySinkRef.current?.({
          status: "active",
          backendId: last?.backendId ?? null,
          decision: last?.decision ?? null,
          reason: last?.fallback?.reason ?? null,
          ownedDocumentIds: receipt.ownedDocumentIds,
          visibleCanvasCount: 1,
        });
      },
      (error: unknown) => {
        if (
          generation !== generationRef.current
          || renderGeneration !== renderGenerationRef.current
          || hubRef.current !== hub
        ) return;
        authoritySinkRef.current?.({
          status: "fallback",
          backendId: null,
          decision: null,
          reason: error instanceof Error ? error.message : String(error),
          ownedDocumentIds: [],
          visibleCanvasCount: 0,
        });
      },
    );
    return () => {
      if (renderGenerationRef.current === renderGeneration) {
        renderGenerationRef.current += 1;
      }
    };
  }, [
    capability.enabled,
    documentHeight,
    documentTransform,
    documentWidth,
    dpr,
    elements,
    height,
    isPenDown,
    selectedIds,
    width,
  ]);

  return null;
}
