import {
  readStudioSaveProfiles,
  writeStudioSaveProfiles,
  type StudioSaveProfileEventTarget,
  type StudioSaveProfileState,
  type StudioSaveProfileStorage,
} from "./studio-save-profile";

export function removeStudioSaveProfilesBulk(
  storage: StudioSaveProfileStorage,
  projectIds: readonly string[],
  options: {
    readonly now?: string;
    readonly target?: StudioSaveProfileEventTarget;
  } = {},
): StudioSaveProfileState {
  const ids = new Set(projectIds.filter((projectId) => projectId.length > 0));
  const current = readStudioSaveProfiles(storage);
  if (ids.size === 0) return current;

  const profiles = { ...current.profiles };
  let changed = false;
  for (const projectId of ids) {
    if (!Object.hasOwn(profiles, projectId)) continue;
    delete profiles[projectId];
    changed = true;
  }
  if (!changed) return current;

  const now = options.now ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) throw new Error("A valid save profile timestamp is required.");
  return writeStudioSaveProfiles(storage, Object.freeze({
    schemaVersion: 1,
    profiles: Object.freeze(profiles),
    updatedAt: now,
  }), options.target);
}
