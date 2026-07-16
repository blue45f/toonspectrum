import { createContext, useContext } from "react";

import type {
  StudioLiveChatMessage,
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
  chatMessages: StudioLiveChatMessage[];
  /** UX gate only. The server rejects chat from roles without comment/edit capability anyway. */
  canChat: boolean;
  error: string | null;
  serverAvailable: boolean;
  localFallbackAllowed: boolean;
  usingLocalFallback: boolean;
  sendChatMessage: (text: string) => boolean;
  retryServer: () => void;
  useLocalFallback: () => void;
}

export const EMPTY_STUDIO_LIVE_CONTEXT: StudioLiveCollaborationContextValue = {
  room: null,
  availability: "idle",
  mode: null,
  peers: [],
  locks: [],
  chatMessages: [],
  canChat: false,
  error: null,
  serverAvailable: false,
  localFallbackAllowed: false,
  usingLocalFallback: false,
  sendChatMessage: () => false,
  retryServer: () => undefined,
  useLocalFallback: () => undefined,
};

export const StudioLiveCollaborationContext =
  createContext<StudioLiveCollaborationContextValue>(EMPTY_STUDIO_LIVE_CONTEXT);

export function useStudioLiveCollaboration(): StudioLiveCollaborationContextValue {
  return useContext(StudioLiveCollaborationContext);
}
