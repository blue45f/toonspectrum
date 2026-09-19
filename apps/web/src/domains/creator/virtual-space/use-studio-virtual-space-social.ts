import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { StudioVirtualSpaceSocialController } from "./studio-virtual-space-social";
import type { StudioSpaceSocialAction, StudioSpaceSocialRequest, StudioSpaceSocialSnapshot } from "./StudioVirtualSpaceSocialPanel";

const EMPTY: StudioSpaceSocialSnapshot = { requests: [], readyPeerIds: [], available: false };

export function useStudioVirtualSpaceSocial({ participant, port, manifest, enabled, onAccepted }: {
  readonly participant: StudioLiveParticipant | undefined;
  readonly port: StudioLiveDirectPort | null | undefined;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly enabled: boolean;
  readonly onAccepted: (request: StudioSpaceSocialRequest) => void;
}) {
  const controller = useRef<StudioVirtualSpaceSocialController | null>(null);
  const accepted = useRef(onAccepted);
  const [snapshot, setSnapshot] = useState<StudioSpaceSocialSnapshot>(EMPTY);
  useEffect(() => { accepted.current = onAccepted; }, [onAccepted]);
  useEffect(() => {
    setSnapshot(EMPTY);
    if (!enabled || !participant || !port || !globalThis.crypto?.subtle) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let owner: StudioVirtualSpaceSocialController | undefined;
    // Bind consent to the complete immutable map, including colliders, art and usage points.
    // An authoring preview never participates; stale clients cannot accept a different layout.
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(manifest))).then((digest) => {
      if (disposed) return;
      const contentRevision = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      owner = new StudioVirtualSpaceSocialController(participant, port, { worldId: manifest.id, contentRevision }, {
        onAccepted: (request) => accepted.current(request),
      });
      controller.current = owner;
      const refresh = () => { if (owner && !disposed) setSnapshot(owner.snapshot()); };
      unsubscribe = owner.subscribe(refresh);
      owner.start();
      refresh();
    }).catch(() => { if (!disposed) setSnapshot(EMPTY); });
    return () => {
      disposed = true;
      unsubscribe?.();
      owner?.close();
      if (controller.current === owner) controller.current = null;
    };
  }, [enabled, manifest, participant, port]);
  const request = useCallback((id: string, action: StudioSpaceSocialAction) => controller.current?.request(id, action) ?? null, []);
  const respond = useCallback((id: string, response: "accept" | "decline") => controller.current?.respond(id, response) ?? false, []);
  const cancel = useCallback((id: string) => controller.current?.cancel(id) ?? false, []);
  return { snapshot, request, respond, cancel };
}
