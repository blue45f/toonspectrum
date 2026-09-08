import { Group, Mesh, PerspectiveCamera, PlaneGeometry, Scene, Bone, BufferGeometry, DoubleSide, Float32BufferAttribute, MeshBasicMaterial, Raycaster, Skeleton, SkinnedMesh, Triangle, Uint16BufferAttribute, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { characterSurfaceAnchorFromIntersection, characterSurfacePointerIntersection } from "./character-surface-ink-pointer";
import { characterSurfaceTriangle, characterSurfaceTopologyRevision } from "./character-surface-ink-three-mesh";

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
    const bindRevision = characterSurfaceTopologyRevision("posed-model", mesh);
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
    expect(anchor?.topologyRevision).toBe(bindRevision);
    // Ribbon construction still needs bind-pose vertices: its SkinnedMesh applies the pose once.
    expect(characterSurfaceTriangle(mesh, 0)?.positions).toEqual(indices.map((index) => [[0, 0, 0], [2, 0, 0], [0, 2, 0]][index]));
    geometry.dispose();
    mesh.material.dispose();
    mesh.skeleton.dispose();
  });
});

describe("surface ink raycast ownership", () => {
  function fixture() {
    const scene = new Scene(); const root = new Group(); scene.add(root);
    const body = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ side: DoubleSide })); root.add(body);
    const floor = new Mesh(new PlaneGeometry(20, 20), new MeshBasicMaterial({ side: DoubleSide })); floor.position.z = 1; scene.add(floor);
    const camera = new PerspectiveCamera(60, 1, 0.1, 100); camera.position.z = 4; camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } as HTMLCanvasElement;
    const event = (x = 50) => ({ clientX: x, clientY: 50 } as PointerEvent);
    return { scene, root, body, floor, camera, canvas, event };
  }
  it("hits the active character instead of closer environment geometry", () => {
    const f = fixture(); expect(characterSurfacePointerIntersection(f.event(), f.canvas, f.scene, f.camera, f.root)?.object).toBe(f.body);
  });
  it("does not paint the environment when the pointer misses the character", () => {
    const f = fixture(); expect(characterSurfacePointerIntersection(f.event(95), f.canvas, f.scene, f.camera, f.root)).toBeNull();
  });
  it("includes visible nested clothing but excludes hidden ancestors and ink overlays", () => {
    const f = fixture(); const clothing = new Group(); f.root.add(clothing);
    const shirt = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ side: DoubleSide })); shirt.position.z = 0.5; clothing.add(shirt); f.scene.updateMatrixWorld(true);
    expect(characterSurfacePointerIntersection(f.event(), f.canvas, f.scene, f.camera, f.root)?.object).toBe(shirt);
    shirt.userData.toonstudioSurfaceInk = true;
    expect(characterSurfacePointerIntersection(f.event(), f.canvas, f.scene, f.camera, f.root)?.object).toBe(f.body);
    shirt.userData.toonstudioSurfaceInk = false; clothing.visible = false;
    expect(characterSurfacePointerIntersection(f.event(), f.canvas, f.scene, f.camera, f.root)?.object).toBe(f.body);
    f.root.visible = false;
    expect(characterSurfacePointerIntersection(f.event(), f.canvas, f.scene, f.camera, f.root)).toBeNull();
  });
  it("rejects missing or detached active roots without falling back to scene meshes", () => {
    const f = fixture(); expect(characterSurfacePointerIntersection(f.event(), f.canvas, f.scene, f.camera, null)).toBeNull();
    f.root.removeFromParent(); expect(characterSurfacePointerIntersection(f.event(), f.canvas, f.scene, f.camera, f.root)).toBeNull();
  });
});
