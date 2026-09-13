import { Vector3 } from "three";

import { StudioVrmSkirtTriangleDistance } from "./studio-vrm-skirt-triangle-distance";
import type { StudioVrmXpbdSkirtCapsuleProxy } from "./studio-vrm-xpbd-skirt";

const CLEARANCE_M = 0.00001;

/** Bounded candidate search for a free face trapped between overlapping/end-to-end capsules. */
export class StudioVrmSkirtSurfaceEscape {
  private readonly query = new StudioVrmSkirtTriangleDistance();
  private readonly source = [new Vector3(), new Vector3(), new Vector3()];
  private readonly vertices = [this.query.triangle.a, this.query.triangle.b, this.query.triangle.c];
  private readonly directions = [new Vector3(), new Vector3(), new Vector3(1, 0, 0),
    new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)];
  private readonly correction = new Vector3();
  private readonly patch = new Set<number>();
  private readonly adjacency: number[][];

  constructor(private readonly indices: Uint32Array, particleCount: number) {
    this.adjacency = Array.from({ length: particleCount }, () => []);
    for (let offset = 0; offset < indices.length; offset += 3) {
      for (let corner = 0; corner < 3; corner += 1) this.adjacency[indices[offset + corner]].push(offset);
    }
  }

  find(
    positions: Float32Array, ids: readonly number[], radius: number,
    capsules: readonly StudioVrmXpbdSkirtCapsuleProxy[], normal: Vector3, particleRadii: Float32Array,
    original: Float32Array, maxDisplacementM: number,
  ): Vector3 | null {
    for (let corner = 0; corner < 3; corner += 1) this.source[corner].fromArray(positions, ids[corner] * 3);
    this.directions[0].copy(normal);
    this.directions[1].copy(normal).negate();
    this.patch.clear();
    for (const id of ids) for (const offset of this.adjacency[id]) this.patch.add(offset);
    const initialEnergy = this.patchEnergy(positions, ids, this.correction.set(0, 0, 0), particleRadii, capsules);
    let bestEnergy = initialEnergy, bestLength = Infinity;
    for (const direction of this.directions) {
      if (direction.lengthSq() < 0.99) continue;
      let upper = 0;
      const faceMinimum = Math.min(...this.source.map((vertex) => vertex.dot(direction)));
      // At this finite support-plane bound, the whole face is beyond every capsule on the ray.
      for (const capsule of capsules) {
        const headProjection = direction.x * capsule.currentHead[0] + direction.y * capsule.currentHead[1] + direction.z * capsule.currentHead[2];
        const tailProjection = direction.x * capsule.currentTail[0] + direction.y * capsule.currentTail[1] + direction.z * capsule.currentTail[2];
        upper = Math.max(upper, Math.max(headProjection, tailProjection) + capsule.radius + radius + CLEARANCE_M - faceMinimum);
      }
      if (!this.clearAt(direction, upper, radius, capsules)) continue;
      let lower = 0;
      for (let refinement = 0; refinement < 12; refinement += 1) {
        const middle = (lower + upper) / 2;
        if (this.clearAt(direction, middle, radius, capsules)) upper = middle;
        else lower = middle;
      }
      const shift = direction.clone().multiplyScalar(upper);
      let preservesShape = true;
      for (const id of ids) {
        const offset = id * 3;
        if (Math.hypot(positions[offset] + shift.x - original[offset],
          positions[offset + 1] + shift.y - original[offset + 1],
          positions[offset + 2] + shift.z - original[offset + 2]) > maxDisplacementM) preservesShape = false;
      }
      if (!preservesShape) continue;
      const energy = this.patchEnergy(positions, ids, shift, particleRadii, capsules);
      // A face-only escape can repeatedly launch neighbouring triangles across the legs.
      // Accept a candidate only when the entire incident patch's contact energy decreases.
      if (energy < bestEnergy - 1e-12 || (energy <= bestEnergy && upper < bestLength && energy < initialEnergy - 1e-12)) {
        bestEnergy = energy; bestLength = upper;
        this.correction.copy(shift);
      }
    }
    return Number.isFinite(bestLength) ? this.correction : null;
  }

  private patchEnergy(
    positions: Float32Array, movedIds: readonly number[], shift: Vector3, particleRadii: Float32Array,
    capsules: readonly StudioVrmXpbdSkirtCapsuleProxy[],
  ): number {
    let energy = 0;
    for (const offset of this.patch) {
      let radius = 0;
      for (let corner = 0; corner < 3; corner += 1) {
        const id = this.indices[offset + corner];
        this.vertices[corner].fromArray(positions, id * 3);
        if (movedIds.includes(id)) this.vertices[corner].add(shift);
        radius = Math.max(radius, particleRadii[id]);
      }
      for (const capsule of capsules) {
        this.query.head.fromArray(capsule.currentHead); this.query.tail.fromArray(capsule.currentTail);
        energy += Math.max(0, capsule.radius + radius - this.query.evaluate().distance) ** 2;
      }
    }
    return energy;
  }

  private clearAt(
    direction: Vector3, shift: number, radius: number,
    capsules: readonly StudioVrmXpbdSkirtCapsuleProxy[],
  ): boolean {
    for (let corner = 0; corner < 3; corner += 1) this.vertices[corner].copy(this.source[corner]).addScaledVector(direction, shift);
    for (const capsule of capsules) {
      this.query.head.fromArray(capsule.currentHead);
      this.query.tail.fromArray(capsule.currentTail);
      if (!(this.query.evaluate().distance >= capsule.radius + radius + CLEARANCE_M)) return false;
    }
    return true;
  }
}
