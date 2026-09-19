import { useCallback, useEffect, useRef, useState } from "react";

import { useStudioStableHandlers } from "../studio-stable-handlers";

import { EMPTY_STUDIO_REVIEW_CAPTURE, encodeStudioReviewCapturePng, StudioReviewCaptureBridge,
  type StudioReviewCaptureBridgeDependencies, type StudioReviewCaptureSnapshot } from "./studio-review-capture-bridge";

type HostBindings = Pick<StudioReviewCaptureBridgeDependencies,
  "getContext" | "projectRuntime" | "save" | "captureAll">;
interface CaptureOwner { readonly key: string; readonly bridge: StudioReviewCaptureBridge; readonly unsubscribe: () => void }

export function useStudioReviewCapture(scopeKey: string, bindings: HostBindings) {
  const current = useRef<CaptureOwner | null>(null);
  const [view, setView] = useState<{ key: string; open: boolean; snapshot: StudioReviewCaptureSnapshot }>(() => ({
    key: scopeKey, open: false, snapshot: EMPTY_STUDIO_REVIEW_CAPTURE,
  }));
  const handlers = useStudioStableHandlers(bindings);
  const open = useCallback(() => {
    let owner = current.current;
    if (!owner || owner.key !== scopeKey || ["completed", "cancelled"].includes(owner.bridge.getSnapshot().phase)) {
      owner?.unsubscribe(); owner?.bridge.dispose();
      // Concurrent document digests share one lazy module load. A failed chunk load can be
      // retried without creating another capture identity or retaining authentication data.
      let producer: Promise<typeof import("../virtual-space/studio-virtual-space-review-producer")> | null = null;
      const loadProducer = () => producer ??= import("../virtual-space/studio-virtual-space-review-producer")
        .catch((error: unknown) => { producer = null; throw error; });
      const bridge = new StudioReviewCaptureBridge({
        ...handlers,
        readSaved: async (id, signal) => (await import("../studio-shared-document-client")).getStudioSharedDocument(id, signal),
        digest: async (doc) => (await loadProducer()).studioReviewCaptureContentDigest(doc),
        encodePng: encodeStudioReviewCapturePng,
        makeInputId: () => `review-capture.${crypto.randomUUID()}`,
        getDeviceId: () => `review-device.${crypto.randomUUID()}`,
        now: () => new Date().toISOString(),
        prepare: async (input, signal) => (await loadProducer())
          .prepareStudioVirtualSpaceReviewCapture(input, { signal }),
        produce: async (intent, pages, signal, progress) => (await loadProducer())
          .produceStudioVirtualSpaceReviewCapture(intent, pages, { signal, onProgress: (value) => progress(value.completed) }),
        cancelRemote: async (input) => (await loadProducer())
          .cancelStudioVirtualSpaceReviewCapture(input),
      });
      owner = { key: scopeKey, bridge, unsubscribe: bridge.subscribe(() => {
        if (current.current?.bridge === bridge) setView((value) => ({
          key: scopeKey, open: value.key === scopeKey && value.open, snapshot: bridge.getSnapshot(),
        }));
      }) };
      current.current = owner;
    }
    setView({ key: scopeKey, open: true, snapshot: owner.bridge.getSnapshot() });
    if (["idle", "needs-save"].includes(owner.bridge.getSnapshot().phase)) void owner.bridge.start();
  }, [handlers, scopeKey]);
  const retry = useCallback(() => { void current.current?.bridge.retry(); }, []);
  const save = useCallback(async () => {
    const owner = current.current;
    if (!owner) return;
    // Existing save can open metadata or destination UI. Let that native flow own focus.
    setView((value) => ({ ...value, open: false }));
    await owner.bridge.saveAndStart();
    if (current.current === owner && owner.bridge.getSnapshot().phase !== "needs-save") {
      setView({ key: owner.key, open: true, snapshot: owner.bridge.getSnapshot() });
    }
  }, []);
  const close = useCallback(async () => {
    const owner = current.current;
    if (!owner) return;
    if (owner.bridge.getSnapshot().phase === "cleanup-pending") {
      setView((value) => ({ ...value, open: false })); return;
    }
    await owner.bridge.cancel();
    if (current.current === owner && ["cancelled", "completed"].includes(owner.bridge.getSnapshot().phase)) {
      setView((value) => ({ ...value, open: false }));
    }
  }, []);
  useEffect(() => () => {
    const owner = current.current;
    if (owner?.key !== scopeKey) return;
    current.current = null;
    owner.unsubscribe(); owner.bridge.dispose();
  }, [scopeKey]);
  useEffect(() => {
    // Ref-backed document/access changes can precede React publication. Fence outstanding
    // transport work as well as checking immediately before/after every capture boundary.
    const timer = window.setInterval(() => current.current?.bridge.checkScope(), 150);
    return () => window.clearInterval(timer);
  }, []);
  return { open, retry, save, close,
    visible: view.key === scopeKey && view.open,
    snapshot: view.key === scopeKey ? view.snapshot : EMPTY_STUDIO_REVIEW_CAPTURE };
}
