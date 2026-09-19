import { BoxGeometry, PlaneGeometry, SphereGeometry } from "three";
import { WebIO } from "@gltf-transform/core";
import { geometryDocument } from "./specialist-geometry";

/** Synthetic, redistributable test assets: never shipped as catalog entries. */
export async function createSpecialistFixture(
  kind: "sphere" | "cube" | "offset-cube" | "floor" | "animated" | "rig",
): Promise<Uint8Array<ArrayBuffer>> {
  const geometry =
    kind === "sphere"
      ? new SphereGeometry(2, 32, 24)
      : kind === "floor"
        ? new PlaneGeometry(10, 10, 8, 8).rotateX(-Math.PI / 2)
        : new BoxGeometry(2, 2, 2);
  if (kind === "offset-cube") geometry.translate(0.8, 0.2, 0.3);
  try {
    const document = geometryDocument(geometry, kind);
    const buffer = document.getRoot().listBuffers()[0]!;
    const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    const uv = geometry.getAttribute("uv");
    primitive.setAttribute(
      "TEXCOORD_0",
      document
        .createAccessor()
        .setBuffer(buffer)
        .setType("VEC2")
        .setArray(new Float32Array(uv.array)),
    );
    if (kind === "rig") {
      const base = document.getRoot().listNodes()[0]!.setName("upper-arm");
      const elbow = document.createNode("elbow").setTranslation([0, 1, 0]);
      const hand = document.createNode("hand").setTranslation([0, 1, 0]);
      base.addChild(elbow);
      elbow.addChild(hand);
    }
    if (kind === "animated") {
      const input = document
        .createAccessor()
        .setBuffer(buffer)
        .setType("SCALAR")
        .setArray(new Float32Array([0, 1, 2, 3]));
      const output = document
        .createAccessor()
        .setBuffer(buffer)
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]));
      const sampler = document
        .createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation("LINEAR");
      const channel = document
        .createAnimationChannel()
        .setTargetNode(document.getRoot().listNodes()[0]!)
        .setTargetPath("translation")
        .setSampler(sampler);
      document.createAnimation("walk").addSampler(sampler).addChannel(channel);
    }
    return new Uint8Array(await new WebIO().writeBinary(document));
  } finally {
    geometry.dispose();
  }
}
