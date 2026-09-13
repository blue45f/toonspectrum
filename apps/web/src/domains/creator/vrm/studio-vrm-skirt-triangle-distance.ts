import { Ray, Triangle, Vector3 } from "three";

/** Reused scratch for the exact segment/triangle minimum, including interior intersections. */
export class StudioVrmSkirtTriangleDistance {
  readonly triangle = new Triangle();
  readonly head = new Vector3();
  readonly tail = new Vector3();
  readonly point = new Vector3();
  readonly axisPoint = new Vector3();
  readonly barycentric = new Vector3();
  distance = Infinity;
  private readonly ray = new Ray();
  private readonly candidate = new Vector3();
  private readonly axisCandidate = new Vector3();
  private readonly baryCandidate = new Vector3();
  private readonly edge = new Vector3();
  private readonly axis = new Vector3();
  private readonly separation = new Vector3();
  private readonly endpoints = [this.head, this.tail];
  private readonly vertices = [this.triangle.a, this.triangle.b, this.triangle.c];

  private accept(): void {
    const distance = this.candidate.distanceTo(this.axisCandidate);
    if (distance >= this.distance) return;
    this.distance = distance;
    this.point.copy(this.candidate);
    this.axisPoint.copy(this.axisCandidate);
    this.barycentric.copy(this.baryCandidate);
  }

  evaluate(): this {
    const { triangle, head, tail } = this;
    this.distance = Infinity;
    this.axis.subVectors(tail, head);
    const axisLengthSquared = this.axis.lengthSq();
    if (axisLengthSquared > 1e-20) {
      this.ray.origin.copy(head);
      this.ray.direction.copy(this.axis).normalize();
      if (this.ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, this.candidate)
        && this.candidate.distanceToSquared(head) <= axisLengthSquared + 1e-14) {
        this.axisCandidate.copy(this.candidate);
        triangle.getBarycoord(this.candidate, this.baryCandidate);
        this.accept();
        return this;
      }
    }
    // Endpoint/face candidates and edge/edge candidates together cover the convex minimum.
    for (const endpoint of this.endpoints) {
      triangle.closestPointToPoint(endpoint, this.candidate);
      if (!triangle.getBarycoord(this.candidate, this.baryCandidate)) continue;
      if (!Number.isFinite(this.baryCandidate.x) || this.baryCandidate.x < -0.5) continue;
      this.axisCandidate.copy(endpoint);
      this.accept();
    }
    const vertices = this.vertices;
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const start = vertices[edgeIndex], end = vertices[(edgeIndex + 1) % 3];
      this.edge.subVectors(end, start);
      this.separation.subVectors(head, start);
      const a = axisLengthSquared, e = this.edge.lengthSq();
      const b = this.axis.dot(this.edge), c = this.axis.dot(this.separation);
      const f = this.edge.dot(this.separation);
      let s = 0, t = 0;
      if (a <= 1e-20) t = e > 1e-20 ? Math.max(0, Math.min(1, f / e)) : 0;
      else if (e <= 1e-20) s = Math.max(0, Math.min(1, -c / a));
      else {
        const denominator = a * e - b * b;
        s = denominator > 1e-20 ? Math.max(0, Math.min(1, (b * f - c * e) / denominator)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
        else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
      }
      this.axisCandidate.copy(head).addScaledVector(this.axis, s);
      this.candidate.copy(start).addScaledVector(this.edge, t);
      this.baryCandidate.set(0, 0, 0).setComponent(edgeIndex, 1 - t).setComponent((edgeIndex + 1) % 3, t);
      this.accept();
    }
    return this;
  }
}
