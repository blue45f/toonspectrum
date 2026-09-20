import { BoxGeometry } from "three";
import { WebIO } from "@gltf-transform/core";
import { geometryDocument } from "./specialist-geometry";
import type { Document } from "@gltf-transform/core";

/** Synthetic solids for real WASM/browser regression, not product catalog assets. */
export function createCompoundFixture(options: {
  offsets: readonly number[];
  split?: boolean;
  open?: boolean;
  transformed?: boolean;
}): Document {
  const box = new BoxGeometry(2, 2, 2);
  let document: Document;
  try { document = geometryDocument(box, "part"); } finally { box.dispose(); }
  const root = document.getRoot();
  const mesh = root.listMeshes()[0]!;
  const primitive = mesh.listPrimitives()[0]!;
  const buffer = root.listBuffers()[0]!;
  if (options.split || options.open) {
    const indices = Uint32Array.from(primitive.getIndices()!.getArray()!);
    mesh.removePrimitive(primitive);
    const count = options.open ? indices.length - 6 : indices.length;
    for (let i = 0; i < count; i += 6) {
      const material = document.createMaterial("face-" + i).setBaseColorFactor([i / 36, 0.5, 0.5, 1]);
      mesh.addPrimitive(document.createPrimitive()
        .setAttribute("POSITION", primitive.getAttribute("POSITION")!)
        .setAttribute("NORMAL", primitive.getAttribute("NORMAL")!)
        .setIndices(document.createAccessor().setBuffer(buffer).setType("SCALAR").setArray(indices.slice(i, i + 6)))
        .setMaterial(material));
    }
    primitive.dispose();
  }
  const scene = root.listScenes()[0]!;
  const original = scene.listChildren()[0]!;
  scene.removeChild(original);
  original.dispose();
  const parent = document.createNode("assembly");
  if (options.transformed) parent.setTranslation([10, 2, -3])
    .setRotation([0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)]).setScale([-1, 2, 1]);
  scene.addChild(parent);
  for (const [i, offset] of options.offsets.entries()) {
    parent.addChild(document.createNode("part-" + i).setMesh(mesh).setTranslation([offset, 0, 0]));
  }
  return document;
}

export async function compoundFixtureBytes(options: Parameters<typeof createCompoundFixture>[0]) {
  return new Uint8Array(await new WebIO().writeBinary(createCompoundFixture(options)));
}

/** Independent signed-volume measurement from an exported triangle mesh. */
export function compoundFixtureVolume(document: Document): number {
  let volume = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const p = primitive.getAttribute("POSITION")!;
    const index = primitive.getIndices()!;
    for (let i = 0; i < index.getCount(); i += 3) {
      const a = p.getElement(index.getScalar(i), []);
      const b = p.getElement(index.getScalar(i + 1), []);
      const c = p.getElement(index.getScalar(i + 2), []);
      volume += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!)
        - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!)
        + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
    }
  }
  return volume;
}
