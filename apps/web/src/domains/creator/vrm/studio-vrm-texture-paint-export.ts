import { buildStudioPackageArchiveBlob, type StudioPackageArchiveBuildOptions, type StudioPackageArchiveEntry } from "../studio-package-archive";
import { studioVrmTexturePaintChannelEncoding } from "./studio-vrm-texture-paint-channel";
import { persistStudioVrmTexturePaintRuntime, type StudioVrmTexturePaintPersistenceDependencies } from "./studio-vrm-texture-paint-persistence";
import type { StudioVrmTexturePaintRuntime } from "./studio-vrm-texture-paint-runtime";

/** Captures one immutable runtime snapshot and exports deduplicated PNGs with portable bindings. */
export async function exportStudioVrmTexturePaintArchive(
  runtime: Pick<StudioVrmTexturePaintRuntime, "exportPaintedTargets">,
  options: Pick<StudioPackageArchiveBuildOptions, "signal" | "onProgress" | "crc32ExecutionMode"> & {
    readonly encodePng?: StudioVrmTexturePaintPersistenceDependencies["encodePng"];
  } = {},
): Promise<Blob> {
  const entries: StudioPackageArchiveEntry[] = [];
  const settings = await persistStudioVrmTexturePaintRuntime(runtime, {
    signal: options.signal,
    dependencies: {
      ...(options.encodePng ? { encodePng: options.encodePng } : {}),
      // An export owns its blobs until ZIP construction completes. It does not acquire a
      // persistent library reference or change the source model and document history.
      saveArtifact: async (artifact) => {
        entries.push({ path: `textures/${artifact.metadata.contentHash.slice(7)}.png`, data: artifact.archiveEntry.data });
        return { receipt: artifact.metadata, deduplicated: false, creationReceipt: null, mutationGeneration: null };
      },
    },
  });
  if (settings.textures.length === 0) throw new Error("내보낼 표면 페인팅이 없습니다.");
  const manifest = {
    kind: "toonspectrum/surface-textures", version: 1,
    textures: settings.textures.map((texture) => ({
      ...texture, ...studioVrmTexturePaintChannelEncoding(texture.textureSlot),
      path: `textures/${texture.hash.slice(7)}.png`,
    })),
  };
  entries.unshift({ path: "manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  return buildStudioPackageArchiveBlob(entries, {
    signal: options.signal,
    onProgress: options.onProgress,
    crc32ExecutionMode: options.crc32ExecutionMode ?? "worker",
    limits: { maxFiles: 129, maxEntryBytes: 96_000_000, maxTotalBytes: 97_000_000, maxArchiveBytes: 98_000_000 },
  });
}
