import { useEffect, useRef } from "react";

import { StudioLayerLiftComposeWorkerClient } from "../../layer/studio-layer-lift-compose-worker-client";
import { createStudioLayerLiftLocalForegroundProvider } from "../../layer/studio-layer-lift-local-provider";
import { loadStudioLayerLiftMediaPipeInference } from "../../layer/studio-layer-lift-mediapipe-inference";
import { createStudioLayerLiftOnnxInferenceLoader } from "../../layer/studio-layer-lift-onnx-inference";
import { StudioLayerLiftOperationRegistry } from "../../layer/studio-layer-lift-operation-context";

import type { StudioLayerLiftReviewPreviewResource } from "../../layer/studio-layer-lift-review-preview";

/** Owns document-scoped foreground inference and composition resources. */
export function useStudioLayerLiftRuntime() {
  const studioLayerLiftRegistryRef = useRef<StudioLayerLiftOperationRegistry | null>(null);
  studioLayerLiftRegistryRef.current ??= new StudioLayerLiftOperationRegistry();

  const studioLayerLiftProviderRef = useRef<ReturnType<
    typeof createStudioLayerLiftLocalForegroundProvider
  > | null>(null);
  studioLayerLiftProviderRef.current ??= createStudioLayerLiftLocalForegroundProvider({
    loadInference: loadStudioLayerLiftMediaPipeInference,
  });

  // General-subject profile on the ONNX U-2-Netp engine. The provider and
  // its loader are inert until first analysis: no runtime or model bytes
  // load while the artist stays on the person profile.
  const studioLayerLiftGeneralProviderRef = useRef<ReturnType<
    typeof createStudioLayerLiftLocalForegroundProvider
  > | null>(null);
  studioLayerLiftGeneralProviderRef.current ??= createStudioLayerLiftLocalForegroundProvider({
    subjectKind: "general-subject",
    loadInference: createStudioLayerLiftOnnxInferenceLoader(),
  });

  const studioLayerLiftCompositorRef = useRef<StudioLayerLiftComposeWorkerClient | null>(null);
  studioLayerLiftCompositorRef.current ??= new StudioLayerLiftComposeWorkerClient();

  const studioLayerLiftAbortRef = useRef<AbortController | null>(null);
  const studioLayerLiftRunIdRef = useRef(0);
  const studioLayerLiftPreviewResourceRef = useRef<StudioLayerLiftReviewPreviewResource | null>(null);

  useEffect(() => {
    return () => {
      studioLayerLiftRunIdRef.current += 1;
      studioLayerLiftAbortRef.current?.abort();
      studioLayerLiftAbortRef.current = null;
      studioLayerLiftRegistryRef.current?.invalidate();
      studioLayerLiftRegistryRef.current = null;
      studioLayerLiftCompositorRef.current?.dispose();
      studioLayerLiftCompositorRef.current = null;
      studioLayerLiftProviderRef.current = null;
      studioLayerLiftGeneralProviderRef.current = null;
      studioLayerLiftPreviewResourceRef.current?.revoke();
      studioLayerLiftPreviewResourceRef.current = null;
    };
  }, []);

  return {
    studioLayerLiftAbortRef,
    studioLayerLiftCompositorRef,
    studioLayerLiftGeneralProviderRef,
    studioLayerLiftPreviewResourceRef,
    studioLayerLiftProviderRef,
    studioLayerLiftRegistryRef,
    studioLayerLiftRunIdRef,
  } as const;
}
