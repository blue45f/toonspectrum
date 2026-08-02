export type InferenceType =
  | "endpoint"
  | "midpoint"
  | "center"
  | "axis-x"
  | "axis-y"
  | "axis-z"
  | "parallel"
  | "perpendicular"
  | "grid";

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface InferenceSnapResult {
  snappedPoint: Point3D;
  type: InferenceType;
  label: string;
  distance: number;
}

export interface InferenceCandidate {
  point: Point3D;
  type: InferenceType;
  label: string;
}

export class Studio3DInferenceEngine {
  private snapTolerance: number;

  constructor(snapTolerance = 0.15) {
    this.snapTolerance = snapTolerance;
  }

  public findBestSnap(
    cursor: Point3D,
    candidates: InferenceCandidate[],
    gridSize = 0.5,
  ): InferenceSnapResult | null {
    let bestResult: InferenceSnapResult | null = null;
    let minDistance = this.snapTolerance;

    for (const cand of candidates) {
      const dist = Math.hypot(
        cursor.x - cand.point.x,
        cursor.y - cand.point.y,
        cursor.z - cand.point.z,
      );

      if (dist < minDistance) {
        minDistance = dist;
        bestResult = {
          snappedPoint: cand.point,
          type: cand.type,
          label: cand.label,
          distance: dist,
        };
      }
    }

    // Grid snap fallback if no candidate within snap tolerance
    if (!bestResult) {
      const snappedGrid: Point3D = {
        x: Math.round(cursor.x / gridSize) * gridSize,
        y: Math.round(cursor.y / gridSize) * gridSize,
        z: Math.round(cursor.z / gridSize) * gridSize,
      };

      const gridDist = Math.hypot(
        cursor.x - snappedGrid.x,
        cursor.y - snappedGrid.y,
        cursor.z - snappedGrid.z,
      );

      if (gridDist < this.snapTolerance) {
        bestResult = {
          snappedPoint: snappedGrid,
          type: "grid",
          label: `Grid (${gridSize}m)`,
          distance: gridDist,
        };
      }
    }

    return bestResult;
  }

  public computeMidpoint(p1: Point3D, p2: Point3D): Point3D {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
      z: (p1.z + p2.z) / 2,
    };
  }

  public setSnapTolerance(tolerance: number): void {
    this.snapTolerance = tolerance;
  }
}
