import { createContext, useContext } from "react";

import type {
  StudioLiveLock,
  StudioLivePeer,
  StudioLiveRoom,
} from "./studio-live-collaboration-room";
import type { StudioLiveTransportMode } from "./studio-live-collaboration-transport";

export type StudioLiveAvailability = "idle" | "connecting" | "ready" | "unsupported" | "error";

export interface StudioLiveCollaborationContextValue {
  room: StudioLiveRoom | null;
  availability: StudioLiveAvailability;
  mode: StudioLiveTransportMode | null;
  peers: StudioLivePeer[];
  locks: StudioLiveLock[];
  error: string | null;
  serverAvailable: boolean;
  localFallbackAllowed: boolean;
  usingLocalFallback: boolean;
  retryServer: () => void;
  useLocalFallback: () => void;
}

export const EMPTY_STUDIO_LIVE_CONTEXT: StudioLiveCollaborationContextValue = {
  room: null,
  availability: "idle",
  mode: null,
  peers: [],
  locks: [],
  error: null,
  serverAvailable: false,
  localFallbackAllowed: false,
  usingLocalFallback: false,
  retryServer: () => undefined,
  useLocalFallback: () => undefined,
};

export const StudioLiveCollaborationContext =
  createContext<StudioLiveCollaborationContextValue>(EMPTY_STUDIO_LIVE_CONTEXT);

export function useStudioLiveCollaboration(): StudioLiveCollaborationContextValue {
  return useContext(StudioLiveCollaborationContext);
}
