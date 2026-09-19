import { preflightSpecialistGlb } from "./specialist-glb-preflight";
import { inspectSpecialistGlbImages } from "./specialist-image-budget";
import { SpecialistError } from "./specialist-contract";
import { ARTIFACT_REVIEW_LIMITS } from "./artifact-review-contract";
import type { SpecialistArtifact } from "./specialist-contract";
import type { ArtifactReviewSource } from "./artifact-review-contract";
import type { GLTF } from "@gltf-transform/core";

// Exact capabilities of the pinned Three 0.184 GLTFLoader, not every glTF Transform extension.
const SUPPORTED = new Set([
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
  "KHR_texture_basisu",
  "KHR_texture_transform",
  "EXT_mesh_gpu_instancing",
  "EXT_texture_webp",
  "KHR_lights_punctual",
  "KHR_materials_unlit",
  "KHR_materials_clearcoat",
  "KHR_materials_sheen",
  "KHR_materials_transmission",
  "KHR_materials_volume",
  "KHR_materials_ior",
  "KHR_materials_specular",
  "KHR_materials_iridescence",
  "KHR_materials_anisotropy",
  "KHR_materials_emissive_strength",
  "KHR_materials_dispersion",
]);
const HASH = /^sha256:[0-9a-f]{64}$/;
const COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
} as const;
export function artifactReviewAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new SpecialistError("cancelled", "Preview cancelled.");
}
export interface AdmittedReviewModel {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly sha256: string;
  readonly encodedBytes: number;
  readonly decodedEstimateBytes: number;
  readonly imageEstimateBytes: number;
  readonly usesKtx2: boolean;
  readonly meshTriangles: number;
}
function inspect(
  bytes: Uint8Array<ArrayBuffer>,
  sha256: string,
): AdmittedReviewModel {
  const json = preflightSpecialistGlb(bytes);
  for (const required of json.extensionsRequired ?? []) {
    if (!SUPPORTED.has(required))
      throw new SpecialistError(
        "unsupported",
        "This required extension is not admitted by the reference preview.",
      );
  }
  // Encoding two disjoint states side by side must not hide a second scene's baked transforms.
  let meshTriangles = 0;
  for (const mesh of json.meshes ?? [])
    for (const primitive of mesh.primitives) {
      const position = json.accessors?.[primitive.attributes.POSITION!];
      if (!position || position.type !== "VEC3")
        throw new SpecialistError(
          "invalid-input",
          "Invalid preview positions.",
        );
      if ((primitive.mode ?? 4) === 4)
        meshTriangles += Math.floor(
          (primitive.indices !== undefined
            ? (json.accessors?.[primitive.indices]?.count ?? 0)
            : position.count) / 3,
        );
    }
  if (meshTriangles > ARTIFACT_REVIEW_LIMITS.triangles)
    throw new SpecialistError("budget", "Preview triangle budget exceeded.");
  const geometryEstimate =
    (json.accessors ?? []).reduce(
      (total, accessor) =>
        total + accessor.count * COMPONENTS[accessor.type] * 4,
      0,
    ) +
    (json.buffers ?? []).reduce(
      (total, buffer) => total + buffer.byteLength,
      0,
    ) +
    (json.bufferViews ?? []).reduce(
      (total, view) => total + view.byteLength,
      0,
    );
  const images = inspectSpecialistGlbImages(bytes, json as GLTF.IGLTF);
  const imageEstimateBytes = images.reduce(
    (total, image) => total + image.decodedBytes,
    0,
  );
  return Object.freeze({
    bytes,
    sha256,
    encodedBytes: bytes.length,
    decodedEstimateBytes: geometryEstimate + imageEstimateBytes,
    imageEstimateBytes,
    usesKtx2: images.some(({ mime }) => mime === "image/ktx2"),
    meshTriangles,
  });
}
/** Freeze and attest BOTH inputs before creating a renderer, loading a model or decoding an image. */
export async function admitArtifactReviewPair(
  artifact: SpecialistArtifact,
  source?: ArtifactReviewSource,
  signal?: AbortSignal,
): Promise<{
  readonly result: AdmittedReviewModel;
  readonly source?: AdmittedReviewModel;
}> {
  artifactReviewAborted(signal);
  const inputs = [artifact, ...(source ? [source] : [])];
  if (
    artifact.mime !== "model/gltf-binary" ||
    inputs.some(
      (input) =>
        !(input.bytes instanceof Uint8Array) ||
        !(input.bytes.buffer instanceof ArrayBuffer) ||
        input.bytes.length < 20 ||
        !HASH.test(input.sha256),
    )
  ) {
    throw new SpecialistError(
      "invalid-input",
      "A preview requires bounded, hashed GLB data.",
    );
  }
  if (
    inputs.reduce((total, input) => total + input.bytes.length, 0) >
    ARTIFACT_REVIEW_LIMITS.encodedBytes
  ) {
    throw new SpecialistError(
      "budget",
      "The preview pair exceeds the 128 MiB encoded input budget.",
    );
  }
  const inspected = inputs.map((input) =>
    inspect(input.bytes.slice(), input.sha256),
  );
  if (
    inspected.reduce((sum, item) => sum + item.decodedEstimateBytes, 0) >
      ARTIFACT_REVIEW_LIMITS.decodedEstimateBytes ||
    inspected.reduce((sum, item) => sum + item.imageEstimateBytes, 0) >
      ARTIFACT_REVIEW_LIMITS.imageEstimateBytes
  ) {
    throw new SpecialistError(
      "budget",
      "The preview pair exceeds its decoded geometry/texture estimate budget.",
    );
  }
  for (const item of inspected) {
    artifactReviewAborted(signal);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", item.bytes);
    const actual =
      "sha256:" +
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    if (actual !== item.sha256)
      throw new SpecialistError(
        "invalid-input",
        "Preview data differs from its recorded digest. No model was loaded.",
      );
  }
  artifactReviewAborted(signal);
  return Object.freeze({
    result: inspected[0]!,
    ...(source ? { source: inspected[1]! } : {}),
  });
}
