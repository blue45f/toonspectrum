import { z } from "zod";

/**
 * PathIR — engine-neutral Bézier path (matrix E05 Kurbo alignment).
 *
 * The verb list mirrors SVG/Kurbo semantics (M/L/Q/C/Z) so every adapter can
 * translate without resampling. Coordinates live in scene space (CSS px at
 * scene DPR 1); adapters apply island transforms.
 */

export const pathVerbIRSchema = z.discriminatedUnion("v", [
  z.object({ v: z.literal("M"), x: z.number(), y: z.number() }),
  z.object({ v: z.literal("L"), x: z.number(), y: z.number() }),
  z.object({
    v: z.literal("Q"),
    cx: z.number(),
    cy: z.number(),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    v: z.literal("C"),
    c1x: z.number(),
    c1y: z.number(),
    c2x: z.number(),
    c2y: z.number(),
    x: z.number(),
    y: z.number(),
  }),
  z.object({ v: z.literal("Z") }),
]);
export type PathVerbIR = z.infer<typeof pathVerbIRSchema>;

export const pathIRSchema = z.object({
  verbs: z.array(pathVerbIRSchema),
});
export type PathIR = z.infer<typeof pathIRSchema>;

export function polylineToPath(
  points: ReadonlyArray<readonly [number, number]>,
  close = false,
): PathIR {
  const verbs: PathVerbIR[] = [];
  points.forEach(([x, y], index) => {
    verbs.push(index === 0 ? { v: "M", x, y } : { v: "L", x, y });
  });
  if (close && points.length > 2) verbs.push({ v: "Z" });
  return { verbs };
}

export interface PathBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Conservative bounds: control points are included, which over-covers curves
 * but never under-covers. Sufficient for dirty-region and island planning.
 */
export function pathBounds(path: PathIR): PathBounds | null {
  let bounds: PathBounds | null = null;
  const extend = (x: number, y: number): void => {
    if (bounds === null) {
      bounds = { minX: x, minY: y, maxX: x, maxY: y };
      return;
    }
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  };
  for (const verb of path.verbs) {
    switch (verb.v) {
      case "M":
      case "L":
        extend(verb.x, verb.y);
        break;
      case "Q":
        extend(verb.cx, verb.cy);
        extend(verb.x, verb.y);
        break;
      case "C":
        extend(verb.c1x, verb.c1y);
        extend(verb.c2x, verb.c2y);
        extend(verb.x, verb.y);
        break;
      case "Z":
        break;
    }
  }
  return bounds;
}

/** Serializes to SVG path data — shared by debug HUDs and the resvg reference lane. */
export function pathToSvgData(path: PathIR): string {
  const parts: string[] = [];
  for (const verb of path.verbs) {
    switch (verb.v) {
      case "M":
        parts.push(`M ${verb.x} ${verb.y}`);
        break;
      case "L":
        parts.push(`L ${verb.x} ${verb.y}`);
        break;
      case "Q":
        parts.push(`Q ${verb.cx} ${verb.cy} ${verb.x} ${verb.y}`);
        break;
      case "C":
        parts.push(`C ${verb.c1x} ${verb.c1y} ${verb.c2x} ${verb.c2y} ${verb.x} ${verb.y}`);
        break;
      case "Z":
        parts.push("Z");
        break;
    }
  }
  return parts.join(" ");
}
