import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const SIZE = 768;
const BACKGROUND = "#596773";
const MODELS = {
  "mega-angel": { url: "/vrm/MegaAngel.vrm", crop: 0.20, fitWings: true },
  alicia: { url: "/vrm/AliciaSolid.vrm", crop: 0.38, fitWings: false },
  rubin: { url: "/vrm/Victoria_Rubin.vrm", crop: 0.38, fitWings: false },
  "unicorn-person": { url: "/vrm/UnicornPerson.vrm", crop: 0.34, fitWings: false },
  vivi: { url: "/vrm/Vivi.vrm", crop: 0.38, fitWings: false },
} as const;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(BACKGROUND, 1);
document.body.appendChild(renderer.domElement);
const context = renderer.getContext();
const debug = context.getExtension("WEBGL_debug_renderer_info");
const gpu = {
  vendor: String(context.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR)),
  renderer: String(context.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER)),
  version: String(context.getParameter(context.VERSION)),
};
if (!/apple/iu.test(`${gpu.vendor} ${gpu.renderer}`) || !/metal/iu.test(gpu.renderer)) {
  throw new Error(`Expected the declared Apple/Metal renderer: ${JSON.stringify(gpu)}`);
}
const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND);
scene.add(new THREE.AmbientLight(0xffffff, 0.42));
for (const [intensity, x, y, z] of [[1.35, 2.8, 4.2, 3.6], [0.48, -3.2, 2.6, 2.1], [0.6, -1.6, 3.4, -3.2]]) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(x, y, z);
  scene.add(light);
}
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function renderAvatar(id: keyof typeof MODELS) {
  const profile = MODELS[id];
  if (!profile) throw new Error(`Unknown thumbnail source ${id}`);
  const gltf = await loader.loadAsync(profile.url);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`${id}: source is not a VRM`);
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  try {
    // A neutral presentation pose only; source geometry, expressions, textures and MToon stay intact.
    vrm.humanoid.setNormalizedPose({
      leftUpperArm: { rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 1.05)).toArray() },
      rightUpperArm: { rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.05)).toArray() },
    });
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    vrm.scene.traverse((object) => { object.frustumCulled = false; });
    const bounds = new THREE.Box3().setFromObject(vrm.scene, true);
    const size = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0 || size.y > 100) throw new Error(`${id}: invalid model bounds`);
    const head = vrm.humanoid.getNormalizedBoneNode("head")?.getWorldPosition(new THREE.Vector3());
    if (!head) throw new Error(`${id}: missing humanoid head`);
    const top = bounds.max.y + size.y * 0.035;
    const bottom = bounds.min.y + size.y * profile.crop;
    const span = Math.max((top - bottom) / 0.90, profile.fitWings ? size.x / 0.92 : 0);
    const center = new THREE.Vector3(head.x, (top + bottom) / 2, head.z);
    const camera = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.01, 100);
    camera.position.set(center.x, center.y, center.z + Math.max(4, size.z * 3));
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    await nextFrame();
    vrm.update(0);
    renderer.render(scene, camera);
    if (context.isContextLost() || context.getError() !== context.NO_ERROR) throw new Error(`${id}: WebGL capture failed`);
    const probe = document.createElement("canvas");
    probe.width = SIZE;
    probe.height = SIZE;
    const probeContext = probe.getContext("2d", { willReadFrequently: true });
    if (!probeContext) throw new Error("Pixel validation canvas is unavailable");
    probeContext.drawImage(renderer.domElement, 0, 0);
    const pixels = probeContext.getImageData(0, 0, SIZE, SIZE).data;
    let foregroundPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (Math.abs(pixels[offset] - 89) + Math.abs(pixels[offset + 1] - 103) + Math.abs(pixels[offset + 2] - 115) > 36) foregroundPixels += 1;
    }
    if (foregroundPixels < SIZE * SIZE * 0.035) throw new Error(`${id}: thumbnail contains no readable model`);
    return {
      id,
      sourceUrl: profile.url,
      width: SIZE,
      height: SIZE,
      pngBase64: renderer.domElement.toDataURL("image/png").slice("data:image/png;base64,".length),
      gpu,
      background: BACKGROUND,
      toneMapping: "none",
      colorSpace: "srgb",
      pose: "neutral-arms-lowered",
      modelBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      camera: { projection: "orthographic", span, position: camera.position.toArray(), target: center.toArray() },
      foregroundPixels,
      renderedTriangles: renderer.info.render.triangles,
      sourceImages: gltf.parser.json.images?.length ?? 0,
      sourceMaterials: gltf.parser.json.materials?.length ?? 0,
    };
  } finally {
    scene.remove(vrm.scene);
    VRMUtils.deepDispose(vrm.scene);
    renderer.renderLists.dispose();
  }
}

export type RefinedAvatarThumbnailRuntime = { render: typeof renderAvatar; ready: boolean; gpu: typeof gpu };

Object.assign(window, { __refinedAvatarThumbnails: { render: renderAvatar, ready: true, gpu } });
