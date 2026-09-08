import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { applyStudioBg3dRuntimeAssetQuality } from "../../src/domains/creator/bg3d/studio-bg3d-runtime-asset-quality";
import { propDefById } from "../../src/domains/creator/vrm/studio-vrm-props";

const SIZE = 640;
const BACKGROUND = "#667078";
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const debug = gl.getExtension("WEBGL_debug_renderer_info");
const gpu = {
  vendor: String(gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
  renderer: String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
  version: String(gl.getParameter(gl.VERSION)),
};
if (!/Apple.*Metal/iu.test(gpu.renderer)) throw new Error(`Expected Apple/Metal: ${JSON.stringify(gpu)}`);
const loader = new GLTFLoader();
const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND);
const room = new RoomEnvironment();
const environmentGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = environmentGenerator.fromScene(room, 0.04).texture;
room.dispose();
environmentGenerator.dispose();
scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.0));
for (const [intensity, x, y, z] of [[2.2, 4, 7, 5], [0.85, -5, 3, 2], [1.15, -3, 5, -5]]) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(x, y, z);
  scene.add(light);
}
const VIEWS = [
  { id: "front", direction: [0, 0.38, 1] },
  { id: "three-quarter", direction: [1, 0.64, 1.35] },
  { id: "back", direction: [0, 0.38, -1] },
] as const;
const ANCHOR_ASSETS = new Set(["ice_cream_cone", "bubble_tea", "fox_mask"]);

function inspectAnchor(root: THREE.Object3D, id: string, bounds: THREE.Box3) {
  if (!ANCHOR_ASSETS.has(id)) return null;
  const definition = propDefById(`blender_${id}_v8`);
  const anchor = definition?.anchors.find((candidate) => candidate.role === "primary" || candidate.role === "surface");
  if (!anchor || !definition) throw new Error(`${id}: missing production attachment metadata`);
  const radius = anchor.gripRadius ?? definition.grip?.radius ?? definition.fit.designReference * 0.25;
  const point = new THREE.Vector3(...anchor.position);
  const triangle = new THREE.Triangle();
  const closest = new THREE.Vector3();
  const nearest = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let distance = Number.POSITIVE_INFINITY;
  let meshName = "";
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute("position");
    if (!positions) return;
    const count = geometry.index?.count ?? positions.count;
    for (let offset = 0; offset + 2 < count; offset += 3) {
      mesh.getVertexPosition(geometry.index?.getX(offset) ?? offset, triangle.a).applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(geometry.index?.getX(offset + 1) ?? offset + 1, triangle.b).applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(geometry.index?.getX(offset + 2) ?? offset + 2, triangle.c).applyMatrix4(mesh.matrixWorld);
      triangle.closestPointToPoint(point, closest);
      const candidate = point.distanceTo(closest);
      if (candidate >= distance) continue;
      distance = candidate;
      nearest.copy(closest);
      triangle.getNormal(normal);
      meshName = mesh.name;
    }
  });
  return {
    type: anchor.role === "surface" ? "face-surface" : "hand-grip",
    point: [...anchor.position],
    radius,
    insideModelBounds: bounds.containsPoint(point),
    insideExpandedBounds: bounds.clone().expandByScalar(radius).containsPoint(point),
    nearestSurfacePoint: nearest.toArray(),
    nearestSurfaceNormal: normal.toArray(),
    nearestSurfaceDistance: distance,
    nearestMesh: meshName,
    withinRadiusTolerance: Number.isFinite(distance) && distance <= radius * 1.5,
  };
}

function materialTextures(material: THREE.Material): THREE.Texture[] {
  const textures = Object.values(material).filter((value): value is THREE.Texture => value instanceof THREE.Texture);
  if ((material as THREE.ShaderMaterial).isShaderMaterial) {
    for (const uniform of Object.values((material as THREE.ShaderMaterial).uniforms)) {
      if (uniform.value instanceof THREE.Texture) textures.push(uniform.value);
    }
  }
  return textures;
}

function inspectTexture(texture: THREE.Texture) {
  const image = texture.source?.data ?? texture.image;
  const source = image as { width?: number; height?: number; complete?: boolean; naturalWidth?: number } | undefined;
  const width = source?.width ?? 0;
  const height = source?.height ?? 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || source?.complete === false || source?.naturalWidth === 0) {
    throw new Error(`Undecoded texture ${texture.name || texture.uuid}: ${width}x${height}`);
  }
  return { name: texture.name, width, height, colorSpace: texture.colorSpace, minFilter: texture.minFilter, mipLevels: texture.mipmaps.length };
}

async function verifyAsset(input: { id: string; url: string; diagnosticOnly?: boolean }) {
  const gltf = await loader.loadAsync(input.url);
  const root = gltf.scene;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.add(root);
  try {
    if (gltf.parser.json.asset?.version !== "2.0") throw new Error("Expected a glTF 2.0 source");
    applyStudioBg3dRuntimeAssetQuality(root, { castShadow: true, receiveShadow: true, renderer, qualityBudget: 1 });
    root.updateMatrixWorld(true);
    let meshes = 0;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const texture of materialTextures(material)) textures.add(texture);
      }
    });
    if (meshes === 0) throw new Error("Source contains no model meshes");
    const textureEvidence = [...textures].map(inspectTexture);
    const bounds = new THREE.Box3().setFromObject(root, true);
    const size = bounds.getSize(new THREE.Vector3());
    if (![...bounds.min.toArray(), ...bounds.max.toArray(), ...size.toArray()].every(Number.isFinite)
      || Math.max(...size.toArray()) <= 0 || Math.max(...size.toArray()) > 100_000) {
      throw new Error("Source has invalid or empty finite bounds");
    }
    const anchor = inspectAnchor(root, input.id, bounds);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = size.length() / 2;
    const camera = new THREE.PerspectiveCamera(36, 1, Math.max(0.0001, radius / 1000), Math.max(10, radius * 30));
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.06;
    const frames = [];
    const probe = document.createElement("canvas");
    probe.width = SIZE;
    probe.height = SIZE;
    const probeContext = probe.getContext("2d", { willReadFrequently: true });
    if (!probeContext) throw new Error("Pixel verifier is unavailable");
    for (const view of VIEWS) {
      camera.position.copy(center).addScaledVector(new THREE.Vector3(...view.direction).normalize(), distance);
      camera.lookAt(center);
      camera.updateMatrixWorld(true);
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      renderer.render(scene, camera);
      if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error(`${view.id}: WebGL render failed`);
      probeContext.drawImage(renderer.domElement, 0, 0);
      const pixels = probeContext.getImageData(0, 0, SIZE, SIZE).data;
      const background = [pixels[0], pixels[1], pixels[2]];
      let foreground = 0;
      let dark = 0;
      let bright = 0;
      let colored = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        if (Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) <= 36) continue;
        foreground += 1;
        if (Math.max(r, g, b) < 8) dark += 1;
        if (Math.min(r, g, b) > 247) bright += 1;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 20) colored += 1;
      }
      const blankRender = foreground < SIZE * SIZE * 0.015 || renderer.info.render.triangles === 0;
      const uniformRender = dark / foreground > 0.98 || bright / foreground > 0.98;
      if (!input.diagnosticOnly && blankRender) throw new Error(`${view.id}: blank model render`);
      if (!input.diagnosticOnly && uniformRender) throw new Error(`${view.id}: uniformly black or white model render`);
      frames.push({
        view: view.id,
        width: SIZE,
        height: SIZE,
        pngBase64: renderer.domElement.toDataURL("image/png").slice("data:image/png;base64,".length),
        foregroundPixels: foreground,
        pixelGatePassed: !blankRender && !uniformRender,
        darkFraction: dark / foreground,
        brightFraction: bright / foreground,
        coloredFraction: colored / foreground,
        renderedTriangles: renderer.info.render.triangles,
        renderCalls: renderer.info.render.calls,
        cameraPosition: camera.position.toArray(),
      });
    }
    return { id: input.id, url: input.url, gpu, diagnosticOnly: input.diagnosticOnly === true, lighting: "RoomEnvironment PMREM IBL + hemisphere + three directional lights; authored materials preserved", meshes, materialCount: materials.size, sourceImages: gltf.parser.json.images?.length ?? 0,
      textures: textureEvidence, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, anchor, frames };
  } finally {
    scene.remove(root);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    renderer.renderLists.dispose();
  }
}

export type RefinedAssetVerifierRuntime = { verify: typeof verifyAsset; ready: boolean; gpu: typeof gpu };
Object.assign(window, { __refinedAssetVerifier: { verify: verifyAsset, ready: true, gpu } });
