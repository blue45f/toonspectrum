import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { WebIO } from "@gltf-transform/core";
import { palette } from "@gltf-transform/functions";
import { createSpecialistFixture } from "./specialist-fixtures";

describe("pinned geometry dependency CSP compatibility", () => {
  it("imports glTF geometry functions with dynamic string execution disabled", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--disallow-code-generation-from-strings",
        "--input-type=module",
        "--eval",
        `
      const functions = await import('@gltf-transform/functions');
      if (typeof functions.meshopt !== 'function' || typeof functions.simplify !== 'function') throw new Error('Missing real geometry APIs.');
      console.log('geometry-import-ok');
    `,
      ],
      { encoding: "utf8", timeout: 20_000 },
    );
    expect(output.trim()).toBe("geometry-import-ok");
  });
  it("executes real Manifold WASM and JS callbacks while Function/eval are prohibited", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--disallow-code-generation-from-strings",
        "--input-type=module",
        "--eval",
        `
      import factory from 'manifold-3d';
      const module = await factory(); module.setup();
      const owned = [];
      try {
        const a = module.Manifold.cube([2,2,2], true); owned.push(a);
        const b = a.translate([1,0,0]); owned.push(b);
        const union = a.add(b), difference = a.subtract(b), intersection = a.intersect(b);
        const warped = a.warp((vertex) => { vertex[0] *= 2; });
        owned.push(union, difference, intersection, warped);
        console.log(JSON.stringify({ volumes: [union.volume(), difference.volume(), intersection.volume(), warped.volume()], triangles: union.getMesh().numTri }));
      } finally { for (const solid of owned.reverse()) solid.delete(); }
    `,
      ],
      { encoding: "utf8", timeout: 20_000 },
    );
    const result = JSON.parse(output.trim());
    for (const [index, expected] of [12, 4, 4, 16].entries())
      expect(result.volumes[index]).toBeCloseTo(expected, 10);
    expect(result.triangles).toBeGreaterThan(0);
  });

  it("retains the real optional glTF image APIs rather than replacing them with stubs", async () => {
    const document = await new WebIO().readBinary(
      await createSpecialistFixture("cube"),
    );
    const mesh = document.getRoot().listMeshes()[0]!;
    const primitive = mesh.listPrimitives()[0]!;
    primitive.setMaterial(
      document.createMaterial("red").setBaseColorFactor([1, 0, 0, 1]),
    );
    mesh.addPrimitive(
      primitive
        .clone()
        .setMaterial(
          document.createMaterial("blue").setBaseColorFactor([0, 0, 1, 1]),
        ),
    );
    await document.transform(palette({ min: 1 }));
    const textures = document.getRoot().listTextures();
    expect(textures.length).toBeGreaterThan(0);
    expect(
      textures.some(
        (texture) =>
          texture.getMimeType() === "image/png" &&
          (texture.getImage()?.byteLength ?? 0) > 32,
      ),
    ).toBe(true);
  });
});


it("encodes real Basis KTX2 while dynamic JavaScript execution is prohibited", () => {
  const output = execFileSync(process.execPath, ["--disallow-code-generation-from-strings", "--input-type=module", "--eval", `
    import { encodeToKTX2 } from 'ktx2-encoder';
    const data=new Uint8Array(16*16*4).fill(255);
    const bytes=await encodeToKTX2(data,{isUASTC:true,isKTX2File:true,isPerceptual:true,isSetKTX2SRGBTransferFunc:true,needSupercompression:false,generateMipmap:true,imageDecoder:async()=>({width:16,height:16,data})});
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    console.log('KTX2_PROOF:'+JSON.stringify({magic:Array.from(bytes.subarray(0,4)),width:view.getUint32(20,true),height:view.getUint32(24,true),levels:view.getUint32(40,true),bytes:bytes.length}));
  `], { encoding: "utf8", timeout: 20_000 });
  const line=output.split("\n").find((line)=>line.startsWith("KTX2_PROOF:"));expect(line).toBeDefined();
  expect(JSON.parse(line!.slice("KTX2_PROOF:".length))).toMatchObject({magic:[171,75,84,88],width:16,height:16,levels:5});
});
