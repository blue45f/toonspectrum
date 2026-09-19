import { z } from "zod";

const point = z.tuple([
  z.number().finite().min(-10000).max(10000),
  z.number().finite().min(-10000).max(10000),
  z.number().finite().min(-10000).max(10000),
]);
export const specialistOptionsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inspect") }).strict(),
  z
    .object({
      kind: z.literal("ik"),
      rootName: z.string().min(1).max(256),
      tipName: z.string().min(1).max(256),
      target: point,
      angleLimitDegrees: z.number().min(1).max(180).default(150),
      tolerance: z.number().min(0.0001).max(0.05).default(0.005),
    })
    .strict(),
  z.object({ kind: z.literal("compress") }).strict(),
  z
    .object({
      kind: z.literal("lod"),
      error: z.number().min(0.00001).max(0.1).default(0.01),
    })
    .strict(),
  z.object({ kind: z.literal("tangents") }).strict(),
  z.object({ kind: z.literal("animation") }).strict(),
  z
    .object({
      kind: z.literal("csg"),
      operation: z.enum(["union", "subtract", "intersect"]),
      backend: z.enum(["preview", "solid"]).default("preview"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("navigation"),
      start: point,
      end: point,
      cellSize: z.number().min(0.05).max(2).default(0.2),
      agentRadius: z.number().min(0.05).max(2).default(0.3),
      agentHeight: z.number().min(0.2).max(4).default(1.8),
    })
    .strict(),
]);
export type SpecialistOptions = z.infer<typeof specialistOptionsSchema>;
export interface SpecialistRequest {
  readonly version: 1;
  readonly id: number;
  readonly source: ArrayBuffer;
  readonly secondary?: ArrayBuffer;
  readonly options: SpecialistOptions;
}
export interface SpecialistStats {
  readonly triangles: number;
  readonly vertices: number;
  readonly nodes: number;
  readonly animations: number;
  readonly animationKeys: number;
  readonly tangentPrimitives: number;
}
export interface SpecialistArtifact {
  readonly name: string;
  readonly mime: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly sha256: string;
  readonly stats?: SpecialistStats;
}
export interface SpecialistResult {
  readonly version: 1;
  readonly sourceSha256: string;
  readonly operation: SpecialistOptions["kind"];
  readonly before: SpecialistStats;
  readonly artifacts: readonly SpecialistArtifact[];
  readonly warnings: readonly string[];
  readonly provenance: Readonly<Record<string, string>>;
  readonly sourceNodeNames?: readonly string[];
}
export const SPECIALIST_LIMITS = Object.freeze({
  inputBytes: 256 * 1024 * 1024,
  jsonBytes: 8 * 1024 * 1024,
  vertices: 2_000_000,
  triangles: 2_000_000,
  decodedBytes: 256 * 1024 * 1024,
  outputBytes: 384 * 1024 * 1024,
  nodes: 4096,
  navCells: 2_000_000,
  csgTriangles: 100_000,
  timeoutMs: 120_000,
});
export class SpecialistError extends Error {
  constructor(
    readonly code:
      | "invalid-input"
      | "unsupported"
      | "budget"
      | "cancelled"
      | "timeout"
      | "runtime",
    message: string,
  ) {
    super(message);
    this.name = "SpecialistError";
  }
}
export function parseSpecialistRequest(value: unknown): SpecialistRequest {
  const request = z
    .object({
      version: z.literal(1),
      id: z.number().int().positive(),
      source: z.instanceof(ArrayBuffer),
      secondary: z.instanceof(ArrayBuffer).optional(),
      options: specialistOptionsSchema,
    })
    .strict()
    .parse(value);
  for (const bytes of [request.source, request.secondary]) {
    if (
      bytes &&
      (bytes.byteLength < 20 || bytes.byteLength > SPECIALIST_LIMITS.inputBytes)
    ) {
      throw new SpecialistError("budget", "Input GLB exceeds the file budget.");
    }
  }
  if (request.options.kind === "csg" && !request.secondary)
    throw new SpecialistError("invalid-input", "CSG requires two source GLBs.");
  return request;
}

const statsSchema = z
  .object({
    triangles: z.number().int().nonnegative(),
    vertices: z.number().int().nonnegative(),
    nodes: z.number().int().nonnegative(),
    animations: z.number().int().nonnegative(),
    animationKeys: z.number().int().nonnegative(),
    tangentPrimitives: z.number().int().nonnegative(),
  })
  .strict();
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const artifactSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,80}$/),
    mime: z.enum([
      "model/gltf-binary",
      "application/json",
      "application/octet-stream",
    ]),
    bytes: z
      .instanceof(Uint8Array)
      .refine(
        (bytes) =>
          bytes.buffer instanceof ArrayBuffer &&
          bytes.length > 0 &&
          bytes.length <= SPECIALIST_LIMITS.outputBytes,
      ),
    sha256: digest,
    stats: statsSchema.optional(),
  })
  .strict();
export function parseSpecialistResult(
  value: unknown,
  operation: SpecialistOptions["kind"],
): SpecialistResult {
  const result = z
    .object({
      version: z.literal(1),
      sourceSha256: digest,
      operation: z.literal(operation),
      before: statsSchema,
      artifacts: z.array(artifactSchema).min(1).max(8),
      warnings: z.array(z.string().max(2048)).max(32),
      provenance: z.record(z.string().max(80), z.string().max(256)),
      sourceNodeNames: z.array(z.string().max(256)).max(4096).optional(),
    })
    .strict()
    .parse(value);
  if (
    result.artifacts.reduce((sum, item) => sum + item.bytes.length, 0) >
      SPECIALIST_LIMITS.outputBytes ||
    new Set(result.artifacts.map(({ name }) => name)).size !==
      result.artifacts.length
  ) {
    throw new SpecialistError(
      "budget",
      "Invalid aggregate result budget or duplicate artifact names.",
    );
  }
  return result as SpecialistResult;
}
