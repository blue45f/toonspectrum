import { z } from "zod";

import {
  STUDIO_QUICK_ACCESS_DENSITIES,
  STUDIO_QUICK_ACCESS_DISPLAY_MODES,
  STUDIO_QUICK_ACCESS_MAX_COMMANDS,
  STUDIO_QUICK_ACCESS_MAX_ID_LENGTH,
  STUDIO_QUICK_ACCESS_MAX_SET_NAME_LENGTH,
  STUDIO_QUICK_ACCESS_MAX_SETS,
  normalizeStudioQuickAccessState,
  type StudioQuickAccessState,
} from "../studio-quick-access";
import {
  loadStudioServerPersonalKit,
  saveStudioServerPersonalKit,
  StudioProductionServerConflictError,
  type StudioPersonalKitDocument,
  type StudioServerPersonalKitSnapshot,
} from "./studio-production-server-client";

export const STUDIO_PERSONAL_KIT_QUICK_ACCESS_VERSION = 1 as const;

const OpaqueIdSchema = z.string()
  .min(1)
  .max(STUDIO_QUICK_ACCESS_MAX_ID_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/~-]*$/u);
const QuickAccessStateSchema = z.object({
  version: z.literal(1),
  sets: z.array(z.object({
    id: OpaqueIdSchema,
    name: z.string().trim().min(1).max(STUDIO_QUICK_ACCESS_MAX_SET_NAME_LENGTH),
    commandIds: z.array(OpaqueIdSchema).max(STUDIO_QUICK_ACCESS_MAX_COMMANDS),
  }).strict()).min(1).max(STUDIO_QUICK_ACCESS_MAX_SETS),
  activeSetId: OpaqueIdSchema,
  displayMode: z.enum(STUDIO_QUICK_ACCESS_DISPLAY_MODES),
  density: z.enum(STUDIO_QUICK_ACCESS_DENSITIES),
}).strict();

const QuickAccessEnvelopeSchema = z.object({
  schemaVersion: z.literal(STUDIO_PERSONAL_KIT_QUICK_ACCESS_VERSION),
  updatedAt: z.iso.datetime({ offset: true }),
  state: QuickAccessStateSchema,
}).strict();

export interface StudioQuickAccessPersonalKitEntry {
  readonly updatedAt: string;
  readonly state: StudioQuickAccessState;
}

export interface StudioQuickAccessPersonalKitBootstrap {
  readonly snapshot: StudioServerPersonalKitSnapshot;
  readonly state: StudioQuickAccessState;
  readonly source: "server" | "local-upload";
}
function canonicalStatePayload(state: StudioQuickAccessState): StudioQuickAccessState {
  const canonical = normalizeStudioQuickAccessState(state);
  return {
    version: canonical.version,
    sets: canonical.sets.map((set) => ({
      id: set.id,
      name: set.name,
      commandIds: [...set.commandIds],
    })),
    activeSetId: canonical.activeSetId,
    displayMode: canonical.displayMode,
    density: canonical.density,
  };
}

export function readStudioQuickAccessPersonalKit(
  document: StudioPersonalKitDocument,
): StudioQuickAccessPersonalKitEntry | null {
  const parsed = QuickAccessEnvelopeSchema.safeParse(document.quickAccess);
  if (!parsed.success) return null;
  const state = normalizeStudioQuickAccessState(parsed.data.state);
  if (!state.sets.some((set) => set.id === state.activeSetId)) return null;
  return Object.freeze({
    updatedAt: parsed.data.updatedAt,
    state,
  });
}
export function withStudioQuickAccessPersonalKit(
  document: StudioPersonalKitDocument,
  state: StudioQuickAccessState,
  now = new Date(),
): StudioPersonalKitDocument {
  if (!Number.isFinite(now.getTime())) throw new TypeError("Invalid Personal Kit timestamp.");
  const updatedAt = now.toISOString();
  return {
    ...document,
    updatedAt,
    quickAccess: {
      schemaVersion: STUDIO_PERSONAL_KIT_QUICK_ACCESS_VERSION,
      updatedAt,
      state: canonicalStatePayload(state),
    },
  };
}

export function studioQuickAccessStatesEqual(
  left: StudioQuickAccessState,
  right: StudioQuickAccessState,
): boolean {
  return JSON.stringify(canonicalStatePayload(left))
    === JSON.stringify(canonicalStatePayload(right));
}

async function retryAfterConflict(
  state: StudioQuickAccessState,
  signal?: AbortSignal,
): Promise<StudioServerPersonalKitSnapshot> {
  const current = await loadStudioServerPersonalKit(signal);
  return saveStudioServerPersonalKit(
    current.revision,
    withStudioQuickAccessPersonalKit(current.document, state),
    signal,
  );
}

export async function saveStudioQuickAccessPersonalKit(
  snapshot: StudioServerPersonalKitSnapshot,
  state: StudioQuickAccessState,
  signal?: AbortSignal,
): Promise<StudioServerPersonalKitSnapshot> {
  try {
    return await saveStudioServerPersonalKit(
      snapshot.revision,
      withStudioQuickAccessPersonalKit(snapshot.document, state),
      signal,
    );
  } catch (error) {
    if (!(error instanceof StudioProductionServerConflictError) || signal?.aborted) {
      throw error;
    }
    return retryAfterConflict(state, signal);
  }
}

export async function bootstrapStudioQuickAccessPersonalKit(
  localState: StudioQuickAccessState,
  signal?: AbortSignal,
): Promise<StudioQuickAccessPersonalKitBootstrap> {
  const snapshot = await loadStudioServerPersonalKit(signal);
  const remote = readStudioQuickAccessPersonalKit(snapshot.document);
  if (remote) {
    return Object.freeze({
      snapshot,
      state: remote.state,
      source: "server" as const,
    });
  }
  const saved = await saveStudioQuickAccessPersonalKit(snapshot, localState, signal);
  return Object.freeze({
    snapshot: saved,
    state: normalizeStudioQuickAccessState(localState),
    source: "local-upload" as const,
  });
}

export type StudioPersonalKitQuickAccessModule = typeof import(
  "./studio-personal-kit-quick-access"
);
