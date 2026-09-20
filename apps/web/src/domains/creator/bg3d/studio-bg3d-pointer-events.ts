import { events as createPointerEvents, type EventManager, type RootStore } from "@react-three/fiber";

export type StudioBg3dPointerEvents = EventManager<HTMLElement> & {
  connect: (target: HTMLElement | null) => void;
};

/**
 * Applying a background detaches its viewport while R3F can still finish a queued onCreated.
 * Do not attach listeners to that expired source (or to R3F's detached Canvas fallback).
 * Keep the standard event manager for live targets, including its reconnect/disconnect logic.
 */
export function createStudioBg3dPointerEvents(store: RootStore): StudioBg3dPointerEvents {
  const manager = createPointerEvents(store);
  return {
    ...manager,
    connect(target) {
      if (!target?.isConnected) {
        manager.disconnect?.();
        return;
      }
      manager.connect?.(target);
    },
  };
}
