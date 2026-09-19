import type { SpecialistWorkerPhase } from "./specialist-job-progress";
import {
  parseSpecialistRequest,
  SPECIALIST_LIMITS,
  SpecialistError,
} from "./specialist-contract";
import {
  createSpecialistIo,
  readSpecialistDocument,
  sha256,
  specialistStats,
} from "./specialist-gltf";
import type { SpecialistResult } from "./specialist-contract";

export async function runScene3dSpecialist(
  value: unknown,
  onPhase?: (phase: SpecialistWorkerPhase) => void,
): Promise<SpecialistResult> {
  onPhase?.("validating");
  const request = parseSpecialistRequest(value);
  const source = new Uint8Array(request.source);
  onPhase?.("decoding");
  const io = await createSpecialistIo();
  const original = await readSpecialistDocument(io, source);
  const before = specialistStats(original);
  const sourceNodeNames = original
    .getRoot()
    .listNodes()
    .map((node) => node.getName().slice(0, 256));
  onPhase?.("processing");
  let processed;
  if (request.options.kind === "textures" || request.options.kind === "release") {
    const { processTextureDerivatives } = await import("./specialist-textures");
    processed = await processTextureDerivatives(io, source, request.options);
  } else if (request.options.kind === "inspect") {
    const bytes = new TextEncoder().encode(
      JSON.stringify(
        {
          sourceSha256: sha256(source),
          stats: before,
          nodes: original
            .getRoot()
            .listNodes()
            .map((node, index) => ({
              index,
              name: node.getName(),
              parent: node.getParentNode()?.getName() ?? null,
              skin: Boolean(node.getSkin()),
            })),
        },
        null,
        2,
      ),
    );
    processed = {
      artifacts: [
        {
          name: "model-structure.json",
          mime: "application/json",
          bytes,
          sha256: sha256(bytes),
        },
      ],
      warnings: ["Inspection only; no source or scene modifications."],
    };
  } else if (request.options.kind === "ik") {
    const { processIkPose } = await import("./specialist-ik");
    processed = await processIkPose(io, source, request.options);
  } else if (request.options.kind === "csg") {
    const { processBoolean } = await import("./specialist-csg");
    processed = await processBoolean(
      io,
      source,
      new Uint8Array(request.secondary!),
      request.options,
    );
  } else if (request.options.kind === "navigation") {
    const { processNavigation } = await import("./specialist-navigation");
    processed = await processNavigation(io, source, request.options);
  } else {
    const { processAssetDerivatives } = await import("./specialist-assets");
    processed = await processAssetDerivatives(io, source, request.options);
  }
  onPhase?.("verifying");
  if (
    processed.artifacts.reduce(
      (sum, artifact) => sum + artifact.bytes.length,
      0,
    ) > SPECIALIST_LIMITS.outputBytes
  )
    throw new SpecialistError(
      "budget",
      "Combined output exceeds the result budget.",
    );
  return {
    version: 1,
    sourceSha256: sha256(source),
    operation: request.options.kind,
    before,
    sourceNodeNames,
    ...processed,
    provenance: {
      gltfTransform: "4.4.2",
      meshoptimizer: "1.2.0",
      threeBvhCsg: "0.0.18",
      recastNavigation: "0.43.1",
      manifold: "3.5.1", ktx2Encoder: "0.6.0",
      closedChainIk: "0.0.3",
      tangentAlgorithm: "meshoptimizer Compatible (MikkTSpace convention)",
    },
  };
}
