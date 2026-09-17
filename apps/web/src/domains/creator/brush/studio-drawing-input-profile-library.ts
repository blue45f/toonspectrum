import {
  normalizeStudioDrawingInputSnapshot,
  type StudioDrawingInputSnapshot,
} from "./studio-drawing-input-deck-model";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

export const STUDIO_DRAWING_INPUT_PROFILE_LIBRARY_NAMESPACE =
  "studio-drawing-input-profile-library-v1";
export const STUDIO_DRAWING_INPUT_PROFILE_LIBRARY_KEY = "profiles";
export const STUDIO_DRAWING_INPUT_PROFILE_LIBRARY_LOCK =
  "toonspectrum-studio-drawing-input-profile-library-v1";
export const STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_LIMIT = 12;
export const STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_NAME_LIMIT = 40;

const ENVELOPE_VERSION = 1;
const PROFILE_ID_LIMIT = 96;

export interface StudioDrawingInputCustomProfile {
  readonly id: string;
  readonly name: string;
  readonly snapshot: StudioDrawingInputSnapshot;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface StudioDrawingInputProfileLibrarySnapshot {
  readonly revision: number;
  readonly profiles: readonly StudioDrawingInputCustomProfile[];
  readonly malformed: boolean;
}

export interface StudioDrawingInputCustomProfileInput {
  readonly id?: string;
  readonly name: string;
  readonly snapshot: StudioDrawingInputSnapshot;
  readonly now?: number;
}

export interface StudioDrawingInputProfileLibraryRepository {
  load(): Promise<StudioDrawingInputProfileLibrarySnapshot>;
  saveProfile(
    input: StudioDrawingInputCustomProfileInput,
  ): Promise<StudioDrawingInputProfileLibrarySnapshot>;
  deleteProfile(id: string): Promise<StudioDrawingInputProfileLibrarySnapshot>;
}

export type StudioDrawingInputProfileLibraryExclusiveRunner = <T>(
  operation: () => Promise<T>,
) => Promise<T>;

function finiteTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function boundedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= PROFILE_ID_LIMIT ? trimmed : null;
}

export function normalizeStudioDrawingInputProfileName(value: unknown): string {
  if (typeof value !== "string") return "";
  let result = "";
  let previousWhitespace = false;
  for (const char of value.trim()) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    const whitespace = /\s/u.test(char);
    if (whitespace) {
      if (previousWhitespace || result.length === 0) continue;
      if (result.length + 1 > STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_NAME_LIMIT) break;
      result += " ";
      previousWhitespace = true;
      continue;
    }
    if (result.length + char.length > STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_NAME_LIMIT) break;
    result += char;
    previousWhitespace = false;
  }
  return result.trim();
}

function immutableProfile(
  input: StudioDrawingInputCustomProfile,
): StudioDrawingInputCustomProfile {
  return Object.freeze({
    id: input.id,
    name: input.name,
    snapshot: Object.freeze(normalizeStudioDrawingInputSnapshot(input.snapshot)),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

function normalizeProfile(value: unknown, fallbackNow: number): StudioDrawingInputCustomProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = boundedId(record.id);
  const name = normalizeStudioDrawingInputProfileName(record.name);
  if (!id || !name || !record.snapshot || typeof record.snapshot !== "object") return null;
  const createdAt = finiteTimestamp(record.createdAt, fallbackNow);
  const updatedAt = Math.max(createdAt, finiteTimestamp(record.updatedAt, createdAt));
  return immutableProfile({
    id,
    name,
    snapshot: normalizeStudioDrawingInputSnapshot(
      record.snapshot as StudioDrawingInputSnapshot,
    ),
    createdAt,
    updatedAt,
  });
}

function immutableSnapshot(
  revision: number,
  profiles: readonly StudioDrawingInputCustomProfile[],
  malformed = false,
): StudioDrawingInputProfileLibrarySnapshot {
  return Object.freeze({
    revision,
    profiles: Object.freeze(profiles.map(immutableProfile)),
    malformed,
  });
}

export function parseStudioDrawingInputProfileLibrary(
  raw: string | null,
  now = Date.now(),
): StudioDrawingInputProfileLibrarySnapshot {
  if (raw === null) return immutableSnapshot(0, []);
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return immutableSnapshot(0, [], true);
    const record = value as Record<string, unknown>;
    if (record.v !== ENVELOPE_VERSION || !Number.isSafeInteger(record.revision) || Number(record.revision) < 0) {
      return immutableSnapshot(0, [], true);
    }
    const input = Array.isArray(record.profiles) ? record.profiles : [];
    const profiles: StudioDrawingInputCustomProfile[] = [];
    const seen = new Set<string>();
    for (const candidate of input) {
      const profile = normalizeProfile(candidate, now);
      if (!profile || seen.has(profile.id)) continue;
      seen.add(profile.id);
      profiles.push(profile);
      if (profiles.length >= STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_LIMIT) break;
    }
    profiles.sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
    return immutableSnapshot(Number(record.revision), profiles, false);
  } catch {
    return immutableSnapshot(0, [], true);
  }
}

function serializeStudioDrawingInputProfileLibrary(
  snapshot: StudioDrawingInputProfileLibrarySnapshot,
): string {
  return JSON.stringify({
    v: ENVELOPE_VERSION,
    revision: snapshot.revision,
    profiles: snapshot.profiles,
  });
}

function profileId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `input:${random}`;
  return `input:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

async function defaultExclusiveRunner<T>(operation: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return operation();
  return locks.request(
    STUDIO_DRAWING_INPUT_PROFILE_LIBRARY_LOCK,
    { mode: "exclusive" },
    operation,
  );
}

export function createStudioDrawingInputProfileLibraryRepository(
  store: StudioAsyncKeyValueStore,
  runExclusive: StudioDrawingInputProfileLibraryExclusiveRunner = defaultExclusiveRunner,
): StudioDrawingInputProfileLibraryRepository {
  const load = async (): Promise<StudioDrawingInputProfileLibrarySnapshot> =>
    parseStudioDrawingInputProfileLibrary(
      await store.get(STUDIO_DRAWING_INPUT_PROFILE_LIBRARY_KEY),
    );

  return Object.freeze({
    load,
    saveProfile(input) {
      return runExclusive(async () => {
        const current = await load();
        const name = normalizeStudioDrawingInputProfileName(input.name);
        if (!name) throw new RangeError("drawing input profile name must not be empty");
        const now = finiteTimestamp(input.now, Date.now());
        const requestedId = boundedId(input.id);
        const existing = requestedId
          ? current.profiles.find((profile) => profile.id === requestedId)
          : undefined;
        const id = existing?.id ?? requestedId ?? profileId();
        const nextProfile = immutableProfile({
          id,
          name,
          snapshot: normalizeStudioDrawingInputSnapshot(input.snapshot),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        const profiles = [
          nextProfile,
          ...current.profiles.filter((profile) => profile.id !== id),
        ].slice(0, STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_LIMIT);
        const next = immutableSnapshot(current.revision + 1, profiles);
        await store.set(
          STUDIO_DRAWING_INPUT_PROFILE_LIBRARY_KEY,
          serializeStudioDrawingInputProfileLibrary(next),
        );
        return next;
      });
    },
    deleteProfile(id) {
      return runExclusive(async () => {
        const current = await load();
        const normalizedId = boundedId(id);
        if (!normalizedId) return current;
        const profiles = current.profiles.filter((profile) => profile.id !== normalizedId);
        if (profiles.length === current.profiles.length) return current;
        const next = immutableSnapshot(current.revision + 1, profiles);
        await store.set(
          STUDIO_DRAWING_INPUT_PROFILE_LIBRARY_KEY,
          serializeStudioDrawingInputProfileLibrary(next),
        );
        return next;
      });
    },
  });
}

let sharedRepository: Promise<StudioDrawingInputProfileLibraryRepository> | null = null;

export async function acquireProductStudioDrawingInputProfileLibrary(): Promise<
  StudioDrawingInputProfileLibraryRepository
> {
  sharedRepository ??= import("../studio-local-database-runtime")
    .then(({ acquireStudioLocalDatabase }) => acquireStudioLocalDatabase())
    .then((database) => createStudioDrawingInputProfileLibraryRepository(
      database.asAsyncKeyValueStore(STUDIO_DRAWING_INPUT_PROFILE_LIBRARY_NAMESPACE),
    ));
  try {
    return await sharedRepository;
  } catch (cause) {
    sharedRepository = null;
    throw cause;
  }
}

export function resetStudioDrawingInputProfileLibraryForTests(): void {
  sharedRepository = null;
}
