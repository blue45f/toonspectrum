/** Product Creator Pack orchestration with SQLite authority for brush/filter/palette assets. */

import {
  sanitizeBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";
import {
  notifyStudioBrushLibraryChanged,
  openProductBrushLibraryRepository,
  type ProductBrushLibraryRepository,
} from "./studio-brush-library-sqlite-repository";
import {
  browserStudioCreatorPackStorage,
  inspectStudioCreatorPackInstallState,
  installStudioCreatorPack,
  uninstallStudioCreatorPack,
  validateStudioCreatorPack,
  type StudioCreatorPackInstallResult,
  type StudioCreatorPackInstallState,
  type StudioCreatorPackStorage,
} from "./studio-creator-pack-runtime";
import {
  acquireProductFilterLibraryRepository,
  notifyStudioFilterLibraryChanged,
  normalizeStudioFilterLibraryPreset,
  type ProductFilterLibraryRepository,
  type StudioFilterLibraryPreset,
} from "./studio-filter-library-sqlite-repository";
import {
  normalizeStudioFilterPackValues,
  type StudioFilterPackKind,
  type StudioFilterPackValues,
} from "./studio-filter-pack";
import { acquireStudioLocalDatabase } from "./studio-local-database-runtime";
import { compareStudioMarketplaceVersions } from "./studio-marketplace-packages";
import {
  getProductStudioPaletteSqliteRepository,
  StudioPaletteSqliteRepositoryError,
  type StudioPaletteSqliteRepository,
} from "./studio-palette-sqlite-repository";

import type { StudioCreatorPackDefinition } from "./studio-creator-pack-catalog";
import type { StudioLocalDatabase } from "./studio-local-database";
import type { StudioNamedPalette } from "./studio-palette-library";

export const STUDIO_CREATOR_PACK_SQLITE_NAMESPACE = "studio-creator-pack-v12";

export interface StudioCreatorPackProductRuntimeOptions {
  readonly storage?: StudioCreatorPackStorage | null;
  readonly acquireFilterRepository?: () => Promise<ProductFilterLibraryRepository>;
  readonly acquireBrushRepository?: () => Promise<ProductBrushLibraryRepository>;
  readonly acquirePaletteRepository?: () =>
    | StudioPaletteSqliteRepository
    | Promise<StudioPaletteSqliteRepository>;
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
  readonly now?: () => number;
}

interface StudioCreatorPackSqliteReceipt {
  readonly version: 1;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly packageFingerprint: string;
  readonly kind: "brush" | "palette";
  readonly updatedAt: number;
}

function runtimeItemId(packageId: string, entryId: string): string {
  return `creator-pack:${packageId}:${entryId}`;
}

function optionsStorage(options: StudioCreatorPackProductRuntimeOptions) {
  return options.storage === undefined
    ? browserStudioCreatorPackStorage()
    : options.storage;
}

async function filterRepository(options: StudioCreatorPackProductRuntimeOptions) {
  return (options.acquireFilterRepository ?? acquireProductFilterLibraryRepository)();
}

async function brushRepository(options: StudioCreatorPackProductRuntimeOptions) {
  return (options.acquireBrushRepository ?? openProductBrushLibraryRepository)();
}

async function paletteRepository(options: StudioCreatorPackProductRuntimeOptions) {
  return await (
    options.acquirePaletteRepository
    ?? getProductStudioPaletteSqliteRepository
  )();
}

async function localDatabase(options: StudioCreatorPackProductRuntimeOptions) {
  return (options.acquireDatabase ?? acquireStudioLocalDatabase)();
}

function receiptKey(kind: StudioCreatorPackSqliteReceipt["kind"], packageId: string): string {
  return `${kind}:${packageId}`;
}

function parseReceipt(
  raw: string | null,
  kind: StudioCreatorPackSqliteReceipt["kind"],
): StudioCreatorPackSqliteReceipt | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error("Creator Pack SQLite receipt is corrupt", { cause: error });
  }
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
  ) {
    throw new Error("Creator Pack SQLite receipt is corrupt");
  }
  const receipt = value as Partial<StudioCreatorPackSqliteReceipt>;
  if (
    receipt.version !== 1
    || typeof receipt.packageId !== "string"
    || typeof receipt.packageVersion !== "string"
    || typeof receipt.packageFingerprint !== "string"
    || receipt.kind !== kind
    || typeof receipt.updatedAt !== "number"
    || !Number.isFinite(receipt.updatedAt)
  ) {
    throw new Error("Creator Pack SQLite receipt has an unsupported shape");
  }
  return receipt as StudioCreatorPackSqliteReceipt;
}

async function loadBrushReceipt(
  packageId: string,
  options: StudioCreatorPackProductRuntimeOptions,
): Promise<StudioCreatorPackSqliteReceipt | null> {
  const database = await localDatabase(options);
  const receipt = parseReceipt(await database.kvGet(
    STUDIO_CREATOR_PACK_SQLITE_NAMESPACE,
    receiptKey("brush", packageId),
  ), "brush");
  if (receipt && receipt.packageId !== packageId) {
    throw new Error("Creator Pack SQLite receipt package does not match its key");
  }
  return receipt;
}

async function saveBrushReceipt(
  pack: StudioCreatorPackDefinition,
  now: number,
  options: StudioCreatorPackProductRuntimeOptions,
): Promise<void> {
  const database = await localDatabase(options);
  const receipt: StudioCreatorPackSqliteReceipt = {
    version: 1,
    packageId: pack.metadata.id,
    packageVersion: pack.metadata.version,
    packageFingerprint: pack.metadata.packageFingerprint,
    kind: "brush",
    updatedAt: now,
  };
  await database.kvSet(
    STUDIO_CREATOR_PACK_SQLITE_NAMESPACE,
    receiptKey("brush", pack.metadata.id),
    JSON.stringify(receipt),
  );
}

function paletteReceipt(pack: StudioCreatorPackDefinition, now: number): string {
  return JSON.stringify({
    version: 1,
    packageId: pack.metadata.id,
    packageVersion: pack.metadata.version,
    packageFingerprint: pack.metadata.packageFingerprint,
    kind: "palette",
    updatedAt: now,
  } satisfies StudioCreatorPackSqliteReceipt);
}

async function loadPaletteReceipt(
  pack: StudioCreatorPackDefinition,
  repository: StudioPaletteSqliteRepository,
): Promise<StudioCreatorPackSqliteReceipt | null> {
  const receipt = parseReceipt(await repository.readSidecar(
    STUDIO_CREATOR_PACK_SQLITE_NAMESPACE,
    receiptKey("palette", pack.metadata.id),
  ), "palette");
  if (receipt && receipt.packageId !== pack.metadata.id) {
    throw new Error("Creator Pack SQLite receipt package does not match its key");
  }
  return receipt;
}

async function currentFilterPresets(
  pack: StudioCreatorPackDefinition,
  options: StudioCreatorPackProductRuntimeOptions,
): Promise<(StudioFilterLibraryPreset | null)[]> {
  const product = await filterRepository(options);
  return Promise.all(
    pack.entries.map((entry) =>
      product.repository.getById(runtimeItemId(pack.metadata.id, entry.id)),
    ),
  );
}

async function currentBrushes(
  pack: StudioCreatorPackDefinition,
  options: StudioCreatorPackProductRuntimeOptions,
): Promise<(StudioSavedBrush | null)[]> {
  const product = await brushRepository(options);
  return Promise.all(
    pack.entries.map((entry) =>
      product.repository.getById(runtimeItemId(pack.metadata.id, entry.id)),
    ),
  );
}

async function currentPalettes(
  pack: StudioCreatorPackDefinition,
  repository: StudioPaletteSqliteRepository,
): Promise<(StudioNamedPalette | null)[]> {
  const byId = new Map(
    (await repository.list()).map((palette) => [palette.id, palette]),
  );
  return pack.entries.map((entry) =>
    byId.get(runtimeItemId(pack.metadata.id, entry.id)) ?? null);
}

function paletteMatchesEntry(
  palette: StudioNamedPalette,
  pack: StudioCreatorPackDefinition,
  entryIndex: number,
): boolean {
  const entry = pack.entries[entryIndex]!;
  if (entry.delivery.mode !== "portable-json") return false;
  const colors = entry.delivery.definition.colors;
  return entry.name === palette.name
    && Array.isArray(colors)
    && colors.length === palette.colors.length
    && colors.every((color, index) => color === palette.colors[index]);
}

/**
 * Product install state. Brush, filter and palette packs are inferred from actual SQLite rows,
 * never from the legacy localStorage package marker. Other resource kinds retain their existing
 * builtin-reference runtime.
 */
export async function inspectStudioCreatorPackInstallStateProduct(
  pack: StudioCreatorPackDefinition,
  options: StudioCreatorPackProductRuntimeOptions = {},
): Promise<StudioCreatorPackInstallState> {
  if (
    pack.metadata.kind !== "filter"
    && pack.metadata.kind !== "brush"
    && pack.metadata.kind !== "palette"
  ) {
    return inspectStudioCreatorPackInstallState(pack, optionsStorage(options));
  }
  if (!validateStudioCreatorPack(pack).valid) return "invalid";
  if (pack.entries.every((entry) => entry.delivery.mode === "builtin-ref")) return "bundled";
  if (pack.metadata.kind === "brush") {
    const current = await currentBrushes(pack, options);
    const installedCount = current.filter((brush) => brush !== null).length;
    if (installedCount === 0) return "available";
    if (installedCount !== pack.entries.length) return "repair-required";
    const receipt = await loadBrushReceipt(pack.metadata.id, options);
    if (!receipt) return "repair-required";
    const versionOrder = compareStudioMarketplaceVersions(
      receipt.packageVersion,
      pack.metadata.version,
    );
    if (versionOrder > 0) return "downgrade-blocked";
    if (
      receipt.packageVersion === pack.metadata.version
      && receipt.packageFingerprint !== pack.metadata.packageFingerprint
    ) {
      return "conflict";
    }
    return receipt.packageVersion === pack.metadata.version
      && receipt.packageFingerprint === pack.metadata.packageFingerprint
      ? "installed"
      : "update";
  }
  if (pack.metadata.kind === "palette") {
    const product = await paletteRepository(options);
    const current = await currentPalettes(pack, product);
    const installedCount = current.filter((palette) => palette !== null).length;
    const receipt = await loadPaletteReceipt(pack, product);
    if (installedCount === 0) return receipt ? "repair-required" : "available";
    if (installedCount !== pack.entries.length || !receipt) return "repair-required";
    const versionOrder = compareStudioMarketplaceVersions(
      receipt.packageVersion,
      pack.metadata.version,
    );
    if (versionOrder > 0) return "downgrade-blocked";
    if (
      receipt.packageVersion === pack.metadata.version
      && receipt.packageFingerprint !== pack.metadata.packageFingerprint
    ) {
      return "conflict";
    }
    if (
      receipt.packageVersion !== pack.metadata.version
      || receipt.packageFingerprint !== pack.metadata.packageFingerprint
    ) {
      return "update";
    }
    return current.every((palette, index) =>
      palette !== null && paletteMatchesEntry(palette, pack, index))
      ? "installed"
      : "repair-required";
  }
  const current = await currentFilterPresets(pack, options);
  const installedCount = current.filter((preset) => preset !== null).length;
  if (installedCount === 0) return "available";
  if (installedCount !== pack.entries.length) return "repair-required";
  const records = current.filter(
    (preset): preset is StudioFilterLibraryPreset => preset !== null,
  );
  if (records.every((preset) =>
    preset.packageVersion === "legacy"
    || (
      preset.packageVersion === pack.metadata.version
      && preset.packageFingerprint === pack.metadata.packageFingerprint
    ),
  )) {
    return "installed";
  }
  if (records.some((preset) =>
    compareStudioMarketplaceVersions(preset.packageVersion, pack.metadata.version) > 0,
  )) {
    return "downgrade-blocked";
  }
  if (records.some((preset) =>
    preset.packageVersion === pack.metadata.version
    && preset.packageFingerprint !== pack.metadata.packageFingerprint,
  )) {
    return "conflict";
  }
  return "update";
}

function filterPresetFromEntry(
  pack: StudioCreatorPackDefinition,
  entryIndex: number,
  previous: StudioFilterLibraryPreset | null,
  now: number,
): StudioFilterLibraryPreset {
  const entry = pack.entries[entryIndex]!;
  if (entry.delivery.mode !== "portable-json") {
    throw new Error(`Filter pack entry ${entry.id} is not portable JSON`);
  }
  const definition = entry.delivery.definition;
  const engine = definition.engine as StudioFilterPackKind;
  return normalizeStudioFilterLibraryPreset({
    id: runtimeItemId(pack.metadata.id, entry.id),
    packageId: pack.metadata.id,
    entryId: entry.id,
    name: entry.name,
    engine,
    values: normalizeStudioFilterPackValues(
      engine,
      definition.values as StudioFilterPackValues,
    ),
    installedAt: previous?.installedAt ?? now,
    updatedAt: now,
    category: pack.metadata.category,
    favorite: previous?.favorite ?? false,
    sortOrder: previous?.sortOrder ?? entryIndex,
    packageVersion: pack.metadata.version,
    packageFingerprint: pack.metadata.packageFingerprint,
  });
}

function brushFromEntry(
  pack: StudioCreatorPackDefinition,
  entryIndex: number,
  previous: StudioSavedBrush | null,
  now: number,
): StudioSavedBrush {
  const entry = pack.entries[entryIndex]!;
  if (entry.delivery.mode !== "portable-json") {
    throw new Error(`Brush pack entry ${entry.id} is not portable JSON`);
  }
  const snapshot = sanitizeBrushSnapshot(entry.delivery.definition.snapshot).snapshot;
  return {
    ...snapshot,
    id: runtimeItemId(pack.metadata.id, entry.id),
    name: entry.name,
    sourcePresetId: runtimeItemId(pack.metadata.id, entry.id),
    sourcePresetName: entry.name,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    pinned: previous?.pinned ?? false,
    lastUsedAt: previous?.lastUsedAt ?? null,
  };
}

function paletteFromEntry(
  pack: StudioCreatorPackDefinition,
  entryIndex: number,
  previous: StudioNamedPalette | null,
  now: number,
): StudioNamedPalette {
  const entry = pack.entries[entryIndex]!;
  if (entry.delivery.mode !== "portable-json") {
    throw new Error(`Palette pack entry ${entry.id} is not portable JSON`);
  }
  return {
    id: runtimeItemId(pack.metadata.id, entry.id),
    name: entry.name,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    colors: [...entry.delivery.definition.colors as string[]],
  };
}

function errorResult(action: string, error: unknown): StudioCreatorPackInstallResult {
  if (
    error instanceof StudioPaletteSqliteRepositoryError
    && error.code === "limit"
  ) {
    return {
      status: "full",
      installedCount: 0,
      message: `${action}에 실패했습니다. 팔레트 라이브러리가 가득 찼습니다.`,
    };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return {
    status: "storage-error",
    installedCount: 0,
    message: `${action}에 실패했습니다. SQLite 오류: ${detail}`,
  };
}

export async function installStudioCreatorPackProduct(
  pack: StudioCreatorPackDefinition,
  options: StudioCreatorPackProductRuntimeOptions = {},
): Promise<StudioCreatorPackInstallResult> {
  if (
    pack.metadata.kind !== "filter"
    && pack.metadata.kind !== "brush"
    && pack.metadata.kind !== "palette"
  ) {
    return installStudioCreatorPack(
      pack,
      optionsStorage(options),
      (options.now ?? Date.now)(),
    );
  }
  const validation = validateStudioCreatorPack(pack);
  if (!validation.valid) {
    return {
      status: "invalid",
      installedCount: 0,
      message: validation.issues[0] ?? "팩 검증에 실패했습니다.",
    };
  }
  if (pack.entries.every((entry) => entry.delivery.mode === "builtin-ref")) {
    return {
      status: "bundled",
      installedCount: pack.entries.length,
      message: "이미 Studio에 내장된 안정적인 참조입니다.",
    };
  }
  if (pack.metadata.kind === "brush") {
    try {
      const state = await inspectStudioCreatorPackInstallStateProduct(pack, options);
      if (state === "installed") {
        return {
          status: "already-installed",
          installedCount: pack.entries.length,
          message: "동일한 브러시 팩이 로컬 SQL 카탈로그에 이미 설치되어 있습니다.",
        };
      }
      if (state === "conflict" || state === "downgrade-blocked") {
        return {
          status: "conflict",
          installedCount: 0,
          message: state === "downgrade-blocked"
            ? "설치된 버전보다 오래된 브러시 팩은 SQL 레코드를 덮어쓰지 않습니다."
            : "같은 버전에 다른 브러시 팩 내용이 있어 덮어쓰지 않았습니다.",
        };
      }
      const product = await brushRepository(options);
      const current = await currentBrushes(pack, options);
      const now = (options.now ?? Date.now)();
      const incoming = pack.entries.map((_, index) =>
        brushFromEntry(pack, index, current[index] ?? null, now),
      );
      const saved = await product.repository.putMany(incoming);
      await saveBrushReceipt(pack, now, options);
      notifyStudioBrushLibraryChanged();
      return {
        status: "installed",
        installedCount: saved.savedCount,
        message: `${saved.savedCount}개 브러시를 무제한 ${
          product.authority === "sqlite" ? "OPFS SQLite" : "호환 저장소"
        } 카탈로그에 설치했습니다.`,
      };
    } catch (error) {
      return errorResult("브러시 팩 설치", error);
    }
  }
  if (pack.metadata.kind === "palette") {
    try {
      const state = await inspectStudioCreatorPackInstallStateProduct(pack, options);
      if (state === "installed") {
        return {
          status: "already-installed",
          installedCount: pack.entries.length,
          message: "동일한 팔레트 팩이 로컬 SQL 카탈로그에 이미 설치되어 있습니다.",
        };
      }
      if (state === "conflict" || state === "downgrade-blocked") {
        return {
          status: "conflict",
          installedCount: 0,
          message: state === "downgrade-blocked"
            ? "설치된 버전보다 오래된 팔레트 팩은 SQL 레코드를 덮어쓰지 않습니다."
            : "같은 버전에 다른 팔레트 팩 내용이 있어 덮어쓰지 않았습니다.",
        };
      }
      const product = await paletteRepository(options);
      const current = await currentPalettes(pack, product);
      const now = (options.now ?? Date.now)();
      const incoming = pack.entries.map((_, index) =>
        paletteFromEntry(pack, index, current[index] ?? null, now),
      );
      const committed = await product.commitBatch({
        upsert: incoming,
        sidecars: [{
          namespace: STUDIO_CREATOR_PACK_SQLITE_NAMESPACE,
          key: receiptKey("palette", pack.metadata.id),
          value: paletteReceipt(pack, now),
        }],
      });
      return {
        status: "installed",
        installedCount: committed.upsertedCount,
        message: `${committed.upsertedCount}개 팔레트를 무제한 OPFS SQLite 카탈로그에 설치했습니다.`,
      };
    } catch (error) {
      return errorResult("팔레트 팩 설치", error);
    }
  }
  try {
    const state = await inspectStudioCreatorPackInstallStateProduct(pack, options);
    if (state === "installed") {
      return {
        status: "already-installed",
        installedCount: pack.entries.length,
        message: "동일한 필터 팩이 로컬 SQL 카탈로그에 이미 설치되어 있습니다.",
      };
    }
    if (state === "conflict" || state === "downgrade-blocked") {
      return {
        status: "conflict",
        installedCount: 0,
        message: state === "downgrade-blocked"
          ? "설치된 버전보다 오래된 필터 팩은 SQL 레코드를 덮어쓰지 않습니다."
          : "같은 버전에 다른 필터 팩 내용이 있어 덮어쓰지 않았습니다.",
      };
    }
    const product = await filterRepository(options);
    const current = await Promise.all(
      pack.entries.map((entry) =>
        product.repository.getById(runtimeItemId(pack.metadata.id, entry.id)),
      ),
    );
    const now = (options.now ?? Date.now)();
    const incoming = pack.entries.map((_, index) =>
      filterPresetFromEntry(pack, index, current[index] ?? null, now),
    );
    const installedCount = await product.repository.putMany(incoming);
    notifyStudioFilterLibraryChanged();
    return {
      status: "installed",
      installedCount,
      message: `${installedCount}개 필터를 무제한 ${
        product.authority === "sqlite" ? "OPFS SQLite" : "호환 저장소"
      } 카탈로그에 설치했습니다.`,
    };
  } catch (error) {
    return errorResult("필터 팩 설치", error);
  }
}

export async function uninstallStudioCreatorPackProduct(
  pack: StudioCreatorPackDefinition,
  options: StudioCreatorPackProductRuntimeOptions = {},
): Promise<StudioCreatorPackInstallResult> {
  if (
    pack.metadata.kind !== "filter"
    && pack.metadata.kind !== "brush"
    && pack.metadata.kind !== "palette"
  ) {
    return uninstallStudioCreatorPack(pack, optionsStorage(options));
  }
  const validation = validateStudioCreatorPack(pack);
  if (!validation.valid) {
    return {
      status: "invalid",
      installedCount: 0,
      message: validation.issues[0] ?? "팩 검증에 실패했습니다.",
    };
  }
  if (pack.metadata.kind === "brush") {
    try {
      const product = await brushRepository(options);
      const deleted = await Promise.all(
        pack.entries.map((entry) =>
          product.repository.delete(runtimeItemId(pack.metadata.id, entry.id)),
        ),
      );
      const database = await localDatabase(options);
      await database.kvDelete(
        STUDIO_CREATOR_PACK_SQLITE_NAMESPACE,
        receiptKey("brush", pack.metadata.id),
      );
      const deletedCount = deleted.filter((record) => record !== null).length;
      if (deletedCount === 0) {
        return {
          status: "already-uninstalled",
          installedCount: 0,
          message: "제거할 브러시 프리셋이 없습니다.",
        };
      }
      notifyStudioBrushLibraryChanged();
      return {
        status: "uninstalled",
        installedCount: deletedCount,
        message: `${deletedCount}개 브러시를 로컬 SQL 카탈로그에서 제거했습니다.`,
      };
    } catch (error) {
      return errorResult("브러시 팩 제거", error);
    }
  }
  if (pack.metadata.kind === "palette") {
    try {
      const product = await paletteRepository(options);
      const committed = await product.commitBatch({
        deleteIds: pack.entries.map((entry) =>
          runtimeItemId(pack.metadata.id, entry.id)),
        sidecars: [{
          namespace: STUDIO_CREATOR_PACK_SQLITE_NAMESPACE,
          key: receiptKey("palette", pack.metadata.id),
          value: null,
        }],
      });
      if (committed.deletedCount === 0) {
        return {
          status: "already-uninstalled",
          installedCount: 0,
          message: "제거할 팔레트가 없습니다.",
        };
      }
      return {
        status: "uninstalled",
        installedCount: committed.deletedCount,
        message: `${committed.deletedCount}개 팔레트를 로컬 SQL 카탈로그에서 제거했습니다.`,
      };
    } catch (error) {
      return errorResult("팔레트 팩 제거", error);
    }
  }
  try {
    const product = await filterRepository(options);
    const ids = pack.entries.map((entry) => runtimeItemId(pack.metadata.id, entry.id));
    const deletedCount = await product.repository.deleteMany(ids);
    if (deletedCount === 0) {
      return {
        status: "already-uninstalled",
        installedCount: 0,
        message: "제거할 필터 프리셋이 없습니다.",
      };
    }
    notifyStudioFilterLibraryChanged();
    return {
      status: "uninstalled",
      installedCount: deletedCount,
      message: `${deletedCount}개 필터를 로컬 SQL 카탈로그에서 제거했습니다.`,
    };
  } catch (error) {
    return errorResult("필터 팩 제거", error);
  }
}
