import { Bone, BufferGeometry, DoubleSide, Float32BufferAttribute, MeshBasicMaterial, Raycaster, Skeleton, SkinnedMesh, Triangle, Uint16BufferAttribute, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { characterSurfaceAnchorFromIntersection } from "./character-surface-ink-pointer";
import { characterSurfaceTriangle } from "./character-surface-ink-three-mesh";

describe("posed surface ink anchors", () => {
  it.each([true, false])("keeps the raycast barycentrics on a posed mesh (indexed: %s)", (indexed) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3));
    if (indexed) geometry.setIndex([2, 0, 1]);
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
    const root = new Bone();
    const joint = new Bone();
    root.add(joint);
    mesh.add(root);
    mesh.bind(new Skeleton([root, joint]));
    joint.rotation.set(0.4, 0.3, 0.6);
    joint.position.set(0.4, 0.2, 0.5);
    mesh.position.set(3, -2, 1);
    mesh.rotation.set(0.2, 0.1, -0.4);
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
    const indices = indexed ? [2, 0, 1] : [0, 1, 2];
    const vertices = indices.map((index) => mesh.getVertexPosition(index, new Vector3()));
    const expected = [0.2, 0.3, 0.5];
    const local = vertices.reduce((point, vertex, index) => point.addScaledVector(vertex, expected[index]!), new Vector3());
    const world = mesh.localToWorld(local.clone());
    const normal = new Triangle(vertices[0]!, vertices[1]!, vertices[2]!).getNormal(new Vector3()).transformDirection(mesh.matrixWorld);
    const hit = new Raycaster(world.clone().addScaledVector(normal, 5), normal.negate()).intersectObject(mesh, false)[0];
    expect(hit).toBeDefined();
    const anchor = characterSurfaceAnchorFromIntersection(hit!, "posed-model", 0.7);
    expected.forEach((value, index) => expect(anchor?.barycentric[index]).toBeCloseTo(value, 6));
    expect(anchor?.pressure).toBe(0.7);
    // Ribbon construction still needs bind-pose vertices: its SkinnedMesh applies the pose once.
    expect(characterSurfaceTriangle(mesh, 0)?.positions).toEqual(indices.map((index) => [[0, 0, 0], [2, 0, 0], [0, 2, 0]][index]));
    geometry.dispose();
    mesh.material.dispose();
    mesh.skeleton.dispose();
  });
});
