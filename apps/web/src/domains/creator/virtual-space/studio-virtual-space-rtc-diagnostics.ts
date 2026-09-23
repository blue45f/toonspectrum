import type { StudioLiveCollaborationContextValue } from "../live/studio-live-collaboration-context";
import { resolveStudioHuddleAvailability, type StudioHuddleAvailability } from "../live/huddle/studio-p2p-huddle-availability";

export type StudioMediaPermission = "unsupported" | "prompt" | "granted" | "denied" | "unknown";
export interface StudioRtcDiagnostics {
  readonly secureContext: boolean;
  readonly webRtcSupported: boolean;
  readonly mediaDevicesSupported: boolean;
  readonly microphone: StudioMediaPermission;
  readonly camera: StudioMediaPermission;
  readonly live: StudioHuddleAvailability;
}

async function permission(name: "microphone" | "camera"): Promise<StudioMediaPermission> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    if (!navigator.permissions?.query) return "unknown";
    const result = await navigator.permissions.query({ name: name as PermissionName });
    return result.state;
  } catch {
    // Safari/Firefox may not expose camera/microphone through Permissions API. We intentionally do not prompt.
    return "unknown";
  }
}

export async function readStudioMediaDiagnostics(): Promise<Pick<StudioRtcDiagnostics, "secureContext" | "webRtcSupported" | "mediaDevicesSupported" | "microphone" | "camera">> {
  const [microphone, camera] = await Promise.all([permission("microphone"), permission("camera")]);
  return {
    secureContext: globalThis.isSecureContext === true,
    webRtcSupported: typeof globalThis.RTCPeerConnection === "function",
    mediaDevicesSupported: Boolean(navigator.mediaDevices?.getUserMedia),
    microphone,
    camera,
  };
}

export function studioRtcLiveStatus(live: StudioLiveCollaborationContextValue): StudioHuddleAvailability {
  return resolveStudioHuddleAvailability(live, live.room?.direct ?? null);
}
