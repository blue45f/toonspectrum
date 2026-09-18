import { studioEntityIdSchema } from "@toonspectrum/studio-project-model";

import { newStudioProjectGraphId } from "./studio-project-graph-client";

export const STUDIO_PROJECT_GRAPH_DEVICE_ID_KEY = "toonstudio:project-graph-device:v1";

export interface StudioProjectGraphDeviceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function getStudioProjectGraphDeviceId(
  storage: StudioProjectGraphDeviceStorage | null,
): string {
  if (storage) {
    try {
      const existing = studioEntityIdSchema.safeParse(
        storage.getItem(STUDIO_PROJECT_GRAPH_DEVICE_ID_KEY),
      );
      if (existing.success) return existing.data;
    } catch {
      // Fall through to a new bounded identifier.
    }
  }
  const generated = newStudioProjectGraphId("web-device");
  if (storage) {
    try {
      storage.setItem(STUDIO_PROJECT_GRAPH_DEVICE_ID_KEY, generated);
      const persisted = studioEntityIdSchema.safeParse(
        storage.getItem(STUDIO_PROJECT_GRAPH_DEVICE_ID_KEY),
      );
      if (persisted.success) return persisted.data;
    } catch {
      // The mutation remains valid with an ephemeral identifier.
    }
  }
  return generated;
}
