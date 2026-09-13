import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { applyStudioBg3dRuntimeAssetQuality } from "../../src/domains/creator/bg3d/studio-bg3d-runtime-asset-quality";

const size = 480;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(size, size);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const debug = gl.getExtension("WEBGL_debug_renderer_info");
const device = String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#63717d");
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, 0.04);
scene.environment = environment.texture;
room.dispose();
pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff, 0x59646b, 1.2));
for (const [x, y, z, intensity] of [[4, 7, 5, 2.2], [-5, 3, 2, 0.9], [-3, 5, -5, 1.2]]) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(x, y, z);
  scene.add(light);
}

async function verify(input: { id: string; url: string }) {
  const loaded = await new GLTFLoader().loadAsync(input.url);
  const root = loaded.scene;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.add(root);
  try {
    applyStudioBg3dRuntimeAssetQuality(root, { renderer, castShadow: true, receiveShadow: true, qualityBudget: 1 });
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });
    if (!geometries.size) throw new Error("No renderable geometry");
    const textureSizes = [...textures].map((texture) => {
      const image = (texture.source.data ?? texture.image) as { width?: number; height?: number };
      if (!image?.width || !image.height) throw new Error(`Undecoded texture: ${texture.name}`);
      return [image.width, image.height];
    });
    const box = new THREE.Box3().setFromObject(root, true);
    const extent = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (![...extent.toArray(), ...center.toArray()].every(Number.isFinite) || extent.length() <= 0) {
      throw new Error("Invalid model bounds");
    }
    const radius = extent.length() / 2;
    const camera = new THREE.PerspectiveCamera(38, 1, Math.max(0.0001, radius / 1000), radius * 30 + 10);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(19)) * 1.07;
    const probe = document.createElement("canvas");
    probe.width = probe.height = size;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas pixel inspection unavailable");
    const frames = [];
    for (const [view, direction] of [
      ["front", [0, 0.4, 1]], ["three-quarter", [1, 0.7, 1.4]], ["back", [0, 0.4, -1]],
    ] as const) {
      camera.position.copy(center).addScaledVector(new THREE.Vector3(...direction).normalize(), distance);
      camera.lookAt(center);
      camera.updateMatrixWorld(true);
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
      if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error(`${view}: WebGL error`);
      context.drawImage(renderer.domElement, 0, 0);
      const pixels = context.getImageData(0, 0, size, size).data;
      let foreground = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i] - pixels[0]) + Math.abs(pixels[i + 1] - pixels[1]) + Math.abs(pixels[i + 2] - pixels[2]) > 36) foreground++;
      }
      if (foreground < size * size * 0.008 || !renderer.info.render.triangles) throw new Error(`${view}: blank frame`);
      frames.push({ view, foregroundPixels: foreground, triangles: renderer.info.render.triangles,
        drawCalls: renderer.info.render.calls, png: renderer.domElement.toDataURL("image/png").split(",")[1] });
    }
    return { id: input.id, renderer: device, execution: /SwiftShader|llvmpipe/iu.test(device) ? "software-webgl2" : "hardware-webgl2",
      geometryCount: geometries.size, materialCount: materials.size, textureSizes, bounds: extent.toArray(), frames };
  } finally {
    scene.remove(root);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    renderer.renderLists.dispose();
  }
}

export type PremiumWorldRuntime = { verify: typeof verify; ready: true };
Object.assign(window, { premiumWorld: { verify, ready: true } });
