export const STUDIO_SAVE_PROFILE_STORAGE_KEY = "toonstudio.save-profiles.v1";
export const STUDIO_SAVE_PROFILE_UPDATED_EVENT = "toonstudio:save-profile-updated";

export type StudioAccessMode =
  | "owner-only"
  | "collaborators"
  | "review-link"
  | "public";

export type StudioStorageMode =
  | "browser-local"
  | "local-file"
  | "toonstudio-cloud"
  | "external-drive"
  | "hybrid";

export type StudioDistributionState =
  | "none"
  | "exported"
  | "submitted"
  | "published";

export type StudioStorageProvider =
  | "browser"
  | "local-file"
  | "toonstudio-cloud"
  | "google-drive"
  | "dropbox"
  | "onedrive"
  | "webdav"
  | "s3";

export type StudioStorageBindingRole =
  | "working-copy"
  | "canonical"
  | "backup"
  | "export-only";

export type StudioStorageSyncState =
  | "local-only"
  | "pending"
  | "syncing"
  | "synced"
  | "error"
  | "conflict";

export interface StudioStorageBinding {
  readonly id: string;
  readonly provider: StudioStorageProvider;
  readonly role: StudioStorageBindingRole;
  readonly label: string;
  readonly syncState: StudioStorageSyncState;
  readonly connectionRequired: boolean;
  readonly remotePath: string | null;
  readonly remoteId: string | null;
  readonly remoteVersion: string | null;
  readonly contentHash: string | null;
  readonly remoteModifiedAt: string | null;
  readonly webUrl: string | null;
  readonly byteLength: number | null;
  readonly lastSyncedAt: string | null;
  readonly lastSyncedRevision: number | null;
  readonly error: string | null;
}

export interface StudioSaveProfile {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly accessMode: StudioAccessMode;
  readonly storageMode: StudioStorageMode;
  readonly distributionState: StudioDistributionState;
  readonly autoSave: boolean;
  readonly createVersions: boolean;
  readonly revision: number;
  readonly bindings: readonly StudioStorageBinding[];
  readonly lastManualSaveAt: string | null;
  readonly lastExportAt: string | null;
  readonly lastSubmissionAt: string | null;
  readonly lastPublicationAt: string | null;
  readonly updatedAt: string;
}

export interface StudioSaveProfileState {
  readonly schemaVersion: 1;
  readonly profiles: Readonly<Record<string, StudioSaveProfile>>;
  readonly updatedAt: string;
}

export interface StudioSaveProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface StudioSaveProfileEventTarget {
  dispatchEvent(event: Event): boolean;
}

export interface StudioSaveSafetySummary {
  readonly browserOnly: boolean;
  readonly hasDurableFile: boolean;
  readonly hasRemoteBackup: boolean;
  readonly hasPendingConnection: boolean;
  readonly hasConflict: boolean;
  readonly hasError: boolean;
  readonly needsBackup: boolean;
  readonly headline: string;
}

const ACCESS_MODES = new Set<StudioAccessMode>([
  "owner-only",
  "collaborators",
  "review-link",
  "public",
]);
const STORAGE_MODES = new Set<StudioStorageMode>([
  "browser-local",
  "local-file",
  "toonstudio-cloud",
  "external-drive",
  "hybrid",
]);
const DISTRIBUTION_STATES = new Set<StudioDistributionState>([
  "none",
  "exported",
  "submitted",
  "published",
]);
const PROVIDERS = new Set<StudioStorageProvider>([
  "browser",
  "local-file",
  "toonstudio-cloud",
  "google-drive",
  "dropbox",
  "onedrive",
  "webdav",
  "s3",
]);
const BINDING_ROLES = new Set<StudioStorageBindingRole>([
  "working-copy",
  "canonical",
  "backup",
  "export-only",
]);
const SYNC_STATES = new Set<StudioStorageSyncState>([
  "local-only",
  "pending",
  "syncing",
  "synced",
  "error",
  "conflict",
]);

const REMOTE_PROVIDERS = new Set<StudioStorageProvider>([
  "toonstudio-cloud",
  "google-drive",
  "dropbox",
  "onedrive",
  "webdav",
  "s3",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value: unknown): string | null {
  return validTimestamp(value) ? value : null;
}

function nullableString(value: unknown, max = 1_000): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function nullableHttpsUrl(value: unknown): string | null {
  const candidate = nullableString(value, 2_000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function providerLabel(provider: StudioStorageProvider): string {
  switch (provider) {
    case "browser": return "이 브라우저";
    case "local-file": return "파일·동기화 폴더";
    case "toonstudio-cloud": return "ToonStudio 비공개 저장소";
    case "google-drive": return "Google Drive";
    case "dropbox": return "Dropbox";
    case "onedrive": return "OneDrive";
    case "webdav": return "WebDAV";
    case "s3": return "S3 호환 저장소";
  }
}

function providerStorageMode(provider: StudioStorageProvider): StudioStorageMode {
  if (provider === "browser") return "browser-local";
  if (provider === "local-file") return "local-file";
  if (provider === "toonstudio-cloud") return "toonstudio-cloud";
  return "external-drive";
}

function providerNeedsConnection(provider: StudioStorageProvider): boolean {
  return REMOTE_PROVIDERS.has(provider);
}

export function createStudioStorageBinding(input: {
  readonly provider: StudioStorageProvider;
  readonly role?: StudioStorageBindingRole;
  readonly id?: string;
  readonly label?: string;
  readonly syncState?: StudioStorageSyncState;
  readonly connectionRequired?: boolean;
  readonly remotePath?: string | null;
  readonly remoteId?: string | null;
  readonly remoteVersion?: string | null;
  readonly contentHash?: string | null;
  readonly remoteModifiedAt?: string | null;
  readonly webUrl?: string | null;
  readonly byteLength?: number | null;
  readonly lastSyncedAt?: string | null;
  readonly lastSyncedRevision?: number | null;
  readonly error?: string | null;
}): StudioStorageBinding {
  const role = input.role ?? (input.provider === "browser" ? "working-copy" : "backup");
  const id = input.id ?? `${input.provider}:${role}`;
  if (!validId(id)) throw new Error("A valid storage binding id is required.");
  const connectedAt = nullableTimestamp(input.lastSyncedAt);
  const connectionRequired = input.connectionRequired
    ?? (providerNeedsConnection(input.provider) && connectedAt === null);
  const syncState = input.syncState
    ?? (input.provider === "browser" ? "local-only" : connectionRequired ? "pending" : "synced");
  return Object.freeze({
    id,
    provider: input.provider,
    role,
    label: input.label?.trim().slice(0, 120) || providerLabel(input.provider),
    syncState,
    connectionRequired,
    remotePath: nullableString(input.remotePath, 2_000),
    remoteId: nullableString(input.remoteId, 1_000),
    remoteVersion: nullableString(input.remoteVersion, 1_000),
    contentHash: nullableString(input.contentHash, 256),
    remoteModifiedAt: nullableTimestamp(input.remoteModifiedAt),
    webUrl: nullableHttpsUrl(input.webUrl),
    byteLength: Number.isSafeInteger(input.byteLength) && Number(input.byteLength) >= 0
      ? Number(input.byteLength)
      : null,
    lastSyncedAt: connectedAt,
    lastSyncedRevision: Number.isSafeInteger(input.lastSyncedRevision)
      && Number(input.lastSyncedRevision) >= 0
      ? Number(input.lastSyncedRevision)
      : null,
    error: nullableString(input.error, 500),
  });
}

function normalizeBinding(value: unknown): StudioStorageBinding | null {
  if (!isRecord(value)) return null;
  if (!validId(value.id)) return null;
  if (!PROVIDERS.has(value.provider as StudioStorageProvider)) return null;
  if (!BINDING_ROLES.has(value.role as StudioStorageBindingRole)) return null;
  if (!SYNC_STATES.has(value.syncState as StudioStorageSyncState)) return null;
  return createStudioStorageBinding({
    id: value.id,
    provider: value.provider as StudioStorageProvider,
    role: value.role as StudioStorageBindingRole,
    label: typeof value.label === "string" ? value.label : undefined,
    syncState: value.syncState as StudioStorageSyncState,
    connectionRequired: value.connectionRequired === true,
    remotePath: nullableString(value.remotePath, 2_000),
    remoteId: nullableString(value.remoteId, 1_000),
    remoteVersion: nullableString(value.remoteVersion, 1_000),
    contentHash: nullableString(value.contentHash, 256),
    remoteModifiedAt: nullableTimestamp(value.remoteModifiedAt),
    webUrl: nullableHttpsUrl(value.webUrl),
    byteLength: typeof value.byteLength === "number" ? value.byteLength : null,
    lastSyncedAt: nullableTimestamp(value.lastSyncedAt),
    lastSyncedRevision: typeof value.lastSyncedRevision === "number"
      ? value.lastSyncedRevision
      : null,
    error: nullableString(value.error, 500),
  });
}

export function createDefaultStudioSaveProfile(
  projectId: string,
  options: {
    readonly provider?: StudioStorageProvider;
    readonly autoSave?: boolean;
    readonly createVersions?: boolean;
    readonly now?: string;
  } = {},
): StudioSaveProfile {
  if (!validId(projectId)) throw new Error("A valid project id is required.");
  const now = options.now ?? new Date().toISOString();
  if (!validTimestamp(now)) throw new Error("A valid save profile timestamp is required.");
  const provider = options.provider ?? "browser";
  const browser = createStudioStorageBinding({ provider: "browser", role: "working-copy" });
  const bindings = provider === "browser"
    ? [browser]
    : [browser, createStudioStorageBinding({ provider, role: "canonical" })];
  return Object.freeze({
    schemaVersion: 1,
    projectId,
    accessMode: "owner-only",
    storageMode: provider === "browser" ? "browser-local" : "hybrid",
    distributionState: "none",
    autoSave: options.autoSave ?? true,
    createVersions: options.createVersions ?? true,
    revision: 0,
    bindings: Object.freeze(bindings),
    lastManualSaveAt: null,
    lastExportAt: null,
    lastSubmissionAt: null,
    lastPublicationAt: null,
    updatedAt: now,
  });
}

function normalizeProfile(value: unknown): StudioSaveProfile | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !validId(value.projectId)) return null;
  const accessMode = ACCESS_MODES.has(value.accessMode as StudioAccessMode)
    ? value.accessMode as StudioAccessMode
    : "owner-only";
  const distributionState = DISTRIBUTION_STATES.has(value.distributionState as StudioDistributionState)
    ? value.distributionState as StudioDistributionState
    : "none";
  const bindings = Array.isArray(value.bindings)
    ? value.bindings.map(normalizeBinding).filter((binding): binding is StudioStorageBinding => binding !== null)
    : [];
  if (!bindings.some((binding) => binding.provider === "browser")) {
    bindings.unshift(createStudioStorageBinding({ provider: "browser", role: "working-copy" }));
  }
  const inferredMode = bindings.length > 1
    ? "hybrid"
    : providerStorageMode(bindings[0]?.provider ?? "browser");
  const storageMode = STORAGE_MODES.has(value.storageMode as StudioStorageMode)
    ? value.storageMode as StudioStorageMode
    : inferredMode;
  const updatedAt = validTimestamp(value.updatedAt) ? value.updatedAt : new Date(0).toISOString();
  return Object.freeze({
    schemaVersion: 1,
    projectId: value.projectId,
    accessMode,
    storageMode,
    distributionState,
    autoSave: value.autoSave !== false,
    createVersions: value.createVersions !== false,
    revision: Number.isSafeInteger(value.revision) && Number(value.revision) >= 0
      ? Number(value.revision)
      : 0,
    bindings: Object.freeze(bindings),
    lastManualSaveAt: nullableTimestamp(value.lastManualSaveAt),
    lastExportAt: nullableTimestamp(value.lastExportAt),
    lastSubmissionAt: nullableTimestamp(value.lastSubmissionAt),
    lastPublicationAt: nullableTimestamp(value.lastPublicationAt),
    updatedAt,
  });
}

export function readStudioSaveProfiles(storage: StudioSaveProfileStorage): StudioSaveProfileState {
  const empty = (): StudioSaveProfileState => Object.freeze({
    schemaVersion: 1,
    profiles: Object.freeze({}),
    updatedAt: new Date(0).toISOString(),
  });
  const raw = storage.getItem(STUDIO_SAVE_PROFILE_STORAGE_KEY);
  if (!raw) return empty();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.profiles)) return empty();
    const profiles: Record<string, StudioSaveProfile> = {};
    for (const value of Object.values(parsed.profiles)) {
      const profile = normalizeProfile(value);
      if (profile) profiles[profile.projectId] = profile;
    }
    return Object.freeze({
      schemaVersion: 1,
      profiles: Object.freeze(profiles),
      updatedAt: validTimestamp(parsed.updatedAt) ? parsed.updatedAt : new Date(0).toISOString(),
    });
  } catch {
    return empty();
  }
}

export function writeStudioSaveProfiles(
  storage: StudioSaveProfileStorage,
  state: StudioSaveProfileState,
  target?: StudioSaveProfileEventTarget,
): StudioSaveProfileState {
  storage.setItem(STUDIO_SAVE_PROFILE_STORAGE_KEY, JSON.stringify(state));
  target?.dispatchEvent(new CustomEvent(STUDIO_SAVE_PROFILE_UPDATED_EVENT, { detail: state }));
  return state;
}

function updateProfile(
  storage: StudioSaveProfileStorage,
  projectId: string,
  updater: (profile: StudioSaveProfile, now: string) => StudioSaveProfile,
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  const now = options.now ?? new Date().toISOString();
  if (!validTimestamp(now)) throw new Error("A valid save profile timestamp is required.");
  const state = readStudioSaveProfiles(storage);
  const current = state.profiles[projectId] ?? createDefaultStudioSaveProfile(projectId, { now });
  const updated = updater(current, now);
  writeStudioSaveProfiles(storage, Object.freeze({
    schemaVersion: 1,
    profiles: Object.freeze({ ...state.profiles, [projectId]: updated }),
    updatedAt: now,
  }), options.target);
  return updated;
}

export function ensureStudioSaveProfile(
  storage: StudioSaveProfileStorage,
  projectId: string,
  options: {
    readonly provider?: StudioStorageProvider;
    readonly autoSave?: boolean;
    readonly createVersions?: boolean;
    readonly now?: string;
    readonly target?: StudioSaveProfileEventTarget;
  } = {},
): StudioSaveProfile {
  const current = readStudioSaveProfiles(storage).profiles[projectId];
  if (current) return current;
  const profile = createDefaultStudioSaveProfile(projectId, options);
  const state = readStudioSaveProfiles(storage);
  writeStudioSaveProfiles(storage, Object.freeze({
    schemaVersion: 1,
    profiles: Object.freeze({ ...state.profiles, [projectId]: profile }),
    updatedAt: profile.updatedAt,
  }), options.target);
  return profile;
}

export function setStudioSavePreferences(
  storage: StudioSaveProfileStorage,
  projectId: string,
  input: {
    readonly autoSave?: boolean;
    readonly createVersions?: boolean;
    readonly accessMode?: StudioAccessMode;
  },
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  return updateProfile(storage, projectId, (profile, now) => Object.freeze({
    ...profile,
    autoSave: input.autoSave ?? profile.autoSave,
    createVersions: input.createVersions ?? profile.createVersions,
    accessMode: input.accessMode ?? profile.accessMode,
    updatedAt: now,
  }), options);
}

export function upsertStudioStorageBinding(
  storage: StudioSaveProfileStorage,
  projectId: string,
  bindingInput: Parameters<typeof createStudioStorageBinding>[0],
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  const binding = createStudioStorageBinding(bindingInput);
  return updateProfile(storage, projectId, (profile, now) => {
    const bindings = [
      ...profile.bindings.filter((candidate) => candidate.id !== binding.id),
      binding,
    ];
    const modes = new Set(bindings.map((candidate) => providerStorageMode(candidate.provider)));
    const storageMode = modes.size > 1 ? "hybrid" : [...modes][0] ?? "browser-local";
    return Object.freeze({ ...profile, bindings: Object.freeze(bindings), storageMode, updatedAt: now });
  }, options);
}

export function removeStudioStorageBinding(
  storage: StudioSaveProfileStorage,
  projectId: string,
  bindingId: string,
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  return updateProfile(storage, projectId, (profile, now) => {
    const bindings = profile.bindings.filter((binding) => (
      binding.id !== bindingId || binding.provider === "browser"
    ));
    const modes = new Set(bindings.map((candidate) => providerStorageMode(candidate.provider)));
    return Object.freeze({
      ...profile,
      bindings: Object.freeze(bindings),
      storageMode: modes.size > 1 ? "hybrid" : [...modes][0] ?? "browser-local",
      updatedAt: now,
    });
  }, options);
}

export interface StudioStorageBindingStatusUpdate {
  readonly syncState: StudioStorageSyncState;
  readonly connectionRequired?: boolean;
  readonly remotePath?: string | null;
  readonly remoteId?: string | null;
  readonly remoteVersion?: string | null;
  readonly contentHash?: string | null;
  readonly remoteModifiedAt?: string | null;
  readonly webUrl?: string | null;
  readonly byteLength?: number | null;
  readonly lastSyncedAt?: string | null;
  readonly lastSyncedRevision?: number | null;
  readonly error?: string | null;
}

export function updateStudioStorageBindingStatus(
  storage: StudioSaveProfileStorage,
  projectId: string,
  bindingId: string,
  input: StudioStorageBindingStatusUpdate,
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  return updateProfile(storage, projectId, (profile, now) => Object.freeze({
    ...profile,
    bindings: Object.freeze(profile.bindings.map((binding) => binding.id === bindingId
      ? createStudioStorageBinding({
        ...binding,
        ...input,
        connectionRequired: input.connectionRequired ?? binding.connectionRequired,
        lastSyncedAt: input.lastSyncedAt === undefined ? binding.lastSyncedAt : input.lastSyncedAt,
        lastSyncedRevision: input.lastSyncedRevision === undefined
          ? binding.lastSyncedRevision
          : input.lastSyncedRevision,
        error: input.error === undefined ? binding.error : input.error,
      })
      : binding)),
    updatedAt: now,
  }), options);
}

export function markStudioStorageBindingSynced(
  storage: StudioSaveProfileStorage,
  projectId: string,
  bindingId: string,
  input: Omit<StudioStorageBindingStatusUpdate, "syncState" | "connectionRequired" | "lastSyncedAt" | "lastSyncedRevision" | "error"> & {
    readonly revision?: number;
  } = {},
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  const now = options.now ?? new Date().toISOString();
  const profile = readStudioSaveProfiles(storage).profiles[projectId]
    ?? createDefaultStudioSaveProfile(projectId, { now });
  return updateStudioStorageBindingStatus(storage, projectId, bindingId, {
    ...input,
    syncState: "synced",
    connectionRequired: false,
    lastSyncedAt: now,
    lastSyncedRevision: input.revision ?? profile.revision,
    error: null,
  }, { ...options, now });
}

export function recordStudioManualSave(
  storage: StudioSaveProfileStorage,
  projectId: string,
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  return updateProfile(storage, projectId, (profile, now) => Object.freeze({
    ...profile,
    revision: profile.revision + 1,
    lastManualSaveAt: now,
    updatedAt: now,
  }), options);
}

export function recordStudioExport(
  storage: StudioSaveProfileStorage,
  projectId: string,
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  return updateProfile(storage, projectId, (profile, now) => Object.freeze({
    ...profile,
    distributionState: profile.distributionState === "none" ? "exported" : profile.distributionState,
    lastExportAt: now,
    updatedAt: now,
  }), options);
}

export function recordStudioSubmission(
  storage: StudioSaveProfileStorage,
  projectId: string,
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  return updateProfile(storage, projectId, (profile, now) => Object.freeze({
    ...profile,
    distributionState: profile.distributionState === "published" ? "published" : "submitted",
    lastSubmissionAt: now,
    updatedAt: now,
  }), options);
}

export function recordStudioPublication(
  storage: StudioSaveProfileStorage,
  projectId: string,
  published: boolean,
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfile {
  return updateProfile(storage, projectId, (profile, now) => Object.freeze({
    ...profile,
    accessMode: published ? "public" : "owner-only",
    distributionState: published ? "published" : profile.lastSubmissionAt ? "submitted" : profile.lastExportAt ? "exported" : "none",
    lastPublicationAt: published ? now : profile.lastPublicationAt,
    updatedAt: now,
  }), options);
}

export function removeStudioSaveProfile(
  storage: StudioSaveProfileStorage,
  projectId: string,
  options: { readonly now?: string; readonly target?: StudioSaveProfileEventTarget } = {},
): StudioSaveProfileState {
  const state = readStudioSaveProfiles(storage);
  const profiles = { ...state.profiles };
  delete profiles[projectId];
  const now = options.now ?? new Date().toISOString();
  return writeStudioSaveProfiles(storage, Object.freeze({
    schemaVersion: 1,
    profiles: Object.freeze(profiles),
    updatedAt: now,
  }), options.target);
}

export function studioSaveSafetySummary(profile: StudioSaveProfile): StudioSaveSafetySummary {
  const hasDurableFile = profile.bindings.some((binding) => (
    binding.provider === "local-file" && binding.syncState === "synced" && binding.lastSyncedAt !== null
  ));
  const hasRemoteBackup = profile.bindings.some((binding) => (
    REMOTE_PROVIDERS.has(binding.provider)
    && binding.syncState === "synced"
    && binding.lastSyncedAt !== null
  ));
  const hasPendingConnection = profile.bindings.some((binding) => binding.connectionRequired);
  const hasConflict = profile.bindings.some((binding) => binding.syncState === "conflict");
  const hasError = profile.bindings.some((binding) => binding.syncState === "error");
  const browserOnly = !hasDurableFile && !hasRemoteBackup;
  const needsBackup = browserOnly || hasPendingConnection || hasConflict || hasError;
  const headline = hasConflict
    ? "저장 충돌 확인 필요"
    : hasError
      ? "저장 실패 확인 필요"
      : hasRemoteBackup
        ? "원격 백업 완료"
        : hasDurableFile
          ? "파일로 안전하게 저장됨"
          : hasPendingConnection
            ? "저장소 연결 필요"
            : "이 브라우저에만 저장됨";
  return Object.freeze({
    browserOnly,
    hasDurableFile,
    hasRemoteBackup,
    hasPendingConnection,
    hasConflict,
    hasError,
    needsBackup,
    headline,
  });
}

export function studioSaveProfileForProject(
  storage: StudioSaveProfileStorage,
  projectId: string,
): StudioSaveProfile {
  return readStudioSaveProfiles(storage).profiles[projectId]
    ?? createDefaultStudioSaveProfile(projectId, { now: new Date(0).toISOString() });
}
