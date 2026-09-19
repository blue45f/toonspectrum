import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { createStudioBg3dKtx2RendererRuntime } from "../../src/domains/creator/bg3d/studio-bg3d-ktx2-renderer-runtime";
import { createArtifactPreviewResourceOwner } from "../../src/domains/creator/scene3d/specialists/artifact-preview-resource-owner";

export async function verifySpecialistTexturePixels(
  source: Uint8Array<ArrayBuffer>,
  derivative: Uint8Array<ArrayBuffer>,
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
  });
  renderer.setSize(32, 32);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const runtime = await createStudioBg3dKtx2RendererRuntime({ renderer });
  const roots: THREE.Object3D[] = [];
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshBasicMaterial({ toneMapped: false });
  try {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .setKTX2Loader(runtime.loader);
    const original = await loader.parseAsync(source.slice().buffer, "");
    roots.push(...original.scenes);
    const processed = await loader.parseAsync(derivative.slice().buffer, "");
    roots.push(...processed.scenes);
    if (runtime.hasDecodeFailure())
      throw new Error(
        "KTX2 pixel proof did not decode the actual Basis payload.",
      );
    const findMaterial = (root: THREE.Object3D) => {
      let found: THREE.MeshStandardMaterial | undefined;
      root.traverse((child) => {
        const m = child as THREE.Mesh;
        if (m.isMesh && !found)
          found = (
            Array.isArray(m.material) ? m.material[0] : m.material
          ) as THREE.MeshStandardMaterial;
      });
      if (!found) throw new Error("No texture material.");
      return found;
    };
    const before = findMaterial(original.scene);
    const after = findMaterial(processed.scene);
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    const render = (texture: THREE.Texture) => {
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.needsUpdate = true;
      material.map = texture;
      material.needsUpdate = true;
      renderer.render(scene, camera);
      const bytes = new Uint8Array(32 * 32 * 4);
      const gl = renderer.getContext();
      gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      if (gl.getError() !== gl.NO_ERROR)
        throw new Error("Texture pixel readback failed.");
      return bytes;
    };
    const metrics: Record<string, unknown> = {};
    for (const slot of ["map", "normalMap"] as const) {
      const a = before[slot],
        b = after[slot];
      if (!a && !b) continue;
      if (!a || !b || !(b as THREE.CompressedTexture).isCompressedTexture)
        throw new Error("Texture slot did not survive real GPU transcode.");
      const left = render(a),
        right = render(b);
      let maxDelta = 0;
      const samples = [];
      for (const [x, y] of [
        [8, 8],
        [24, 8],
        [8, 24],
        [24, 24],
      ]) {
        const start = (y! * 32 + x!) * 4;
        const original = Array.from(left.subarray(start, start + 4));
        const encoded = Array.from(right.subarray(start, start + 4));
        samples.push({ original, encoded });
        for (let c = 0; c < 4; c++)
          maxDelta = Math.max(maxDelta, Math.abs(original[c]! - encoded[c]!));
      }
      if (maxDelta > 24)
        throw new Error(
          `KTX2 ${slot} orientation/alpha/color parity failed: ${maxDelta}`,
        );
      metrics[slot] = {
        maxDelta,
        mips: b.mipmaps.length,
        colorSpace: b.colorSpace,
        samples,
      };
    }
    return metrics;
  } finally {
    createArtifactPreviewResourceOwner(roots).dispose();
    runtime.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }
}
