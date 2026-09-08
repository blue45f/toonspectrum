/**
 * Legacy public seam for the Studio scenario surface.
 *
 * The implementation now lives in the focused AI comic director domain while the existing lazy
 * registry and parent-owned scenario orchestration keep the same component and prop contract.
 *
 * The old host applies every entry in `item.bubbles` as a normal Studio element after its frame.
 * Until every legacy host is migrated, this seam injects reviewed foreground/background image
 * layers into that apply-only decoration stream. The preview is restored immediately when a commit
 * is rejected, while a successful commit clears the scenario result as before. This keeps actual
 * PNG layers and native balloons in one existing undo transaction without silently flattening art.
 */
import { useRef } from "react";
import { flushSync } from "react-dom";

import { StudioAiComicDirectorPanel } from "./ai/StudioAiComicDirectorPanel";
import { loadStudioAiSessionSettings } from "./ai/studio-ai-client";

import type { StudioAiComicDirectorPanelProps } from "./ai/StudioAiComicDirectorPanel";
import type { DialogueBubbleSeed } from "./studio-dialogue";
import type { El } from "./studio-element-model";
import type { ScenarioPreviewItem } from "./studio-scenario-layout";
import type { ReactElement } from "react";

export type StudioScenarioAutoLayoutPanelProps = StudioAiComicDirectorPanelProps;

const TRANSPARENT_FRAME_BACKGROUND =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lDFQAAAAAElFTkSuQmCC";

type LegacyScenarioApplyDecoration = DialogueBubbleSeed | Extract<El, { type: "image" }>;

function nativeBubbles(item: ScenarioPreviewItem): DialogueBubbleSeed[] {
  return item.bubbles.filter(
    (candidate): candidate is DialogueBubbleSeed => candidate.type === "bubble",
  );
}

function layerApplyDecorations(item: ScenarioPreviewItem): LegacyScenarioApplyDecoration[] {
  const manifest = item.layerManifest;
  if (!manifest?.editable || manifest.layers.length === 0) return nativeBubbles(item);
  const layerElements: Extract<El, { type: "image" }>[] = manifest.layers.map((layer) => ({
    id: layer.id,
    type: "image",
    src: layer.imageDataUrl,
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: 0,
    lockAspect: true,
    name: layer.name,
    ...(item.imageProvenance ? { aiProvenance: item.imageProvenance } : {}),
  }));
  return [...layerElements, ...nativeBubbles(item)];
}

export function StudioScenarioAutoLayoutPanel(
  props: StudioScenarioAutoLayoutPanelProps,
): ReactElement | null {
  const applyRef = useRef(props.onApply);
  const previewRef = useRef(props.preview);
  const changeSceneRef = useRef(props.onChangeScene);
  applyRef.current = props.onApply;
  previewRef.current = props.preview;
  changeSceneRef.current = props.onChangeScene;

  const configuredSettings = props.aiSettings
    ?? (typeof window === "undefined"
      ? undefined
      : loadStudioAiSessionSettings(
          globalThis.sessionStorage,
          globalThis.localStorage,
        ));

  const applyWithEditableLayers = () => {
    const sourceItems = previewRef.current;
    if (!sourceItems?.some((item) => item.layerManifest?.editable)) {
      applyRef.current();
      return;
    }

    const restore = sourceItems.map((item) => ({
      bubbles: item.bubbles,
      imageDataUrl: item.imageDataUrl,
    }));
    flushSync(() => {
      sourceItems.forEach((item, index) => {
        if (!item.layerManifest?.editable) return;
        changeSceneRef.current(index, {
          // Keep the frame slot truthful but transparent; the actual artwork follows as ordinary
          // Studio image elements in background → foreground order.
          imageDataUrl: TRANSPARENT_FRAME_BACKGROUND,
          bubbles: layerApplyDecorations(item) as unknown as ScenarioPreviewItem["bubbles"],
        });
      });
    });

    // flushSync rerenders the wrapper, so this ref now points at the host closure that sees the
    // apply-only decorations rather than the stale pre-transform preview.
    applyRef.current();

    queueMicrotask(() => {
      // Successful legacy apply clears the preview. Restore only when it remained mounted because
      // review lock, persistence or another document guard rejected the commit.
      if (!previewRef.current) return;
      restore.forEach((snapshot, index) => {
        changeSceneRef.current(index, snapshot);
      });
    });
  };

  return (
    <StudioAiComicDirectorPanel
      {...props}
      aiSettings={configuredSettings}
      onApply={applyWithEditableLayers}
    />
  );
}
