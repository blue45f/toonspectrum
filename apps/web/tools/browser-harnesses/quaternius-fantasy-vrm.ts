import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { QUATERNIUS_FANTASY_VRMS } from "../../src/domains/creator/vrm/quaternius-fantasy-catalog";
import { QUATERNIUS_MODULAR_VRMS } from "../../src/domains/creator/vrm/quaternius-modular-catalog";
import { applyPoserVisualState, POSE_PRESETS } from "../../src/domains/creator/vrm/studio-vrm-poser-utils";

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(768, 768);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);
const context = renderer.getContext();
const debug = context.getExtension("WEBGL_debug_renderer_info");
const gpu = { vendor: String(context.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR)), renderer: String(context.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER)) };
if (!/apple/iu.test(`${gpu.vendor} ${gpu.renderer}`) || !/metal/iu.test(gpu.renderer)) throw new Error(`Expected Apple/Metal GPU: ${JSON.stringify(gpu)}`);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#596773");
scene.add(new THREE.HemisphereLight(0xffffff, 0x596773, 1.4));
for (const [x, y, z, intensity] of [[3, 4, 5, 3], [-3, 2, 3, 1.5], [2, 4, -3, 2]]) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(x, y, z);
  scene.add(light);
}
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

function sampledPositions(meshes: THREE.SkinnedMesh[]) {
  const points: THREE.Vector3[] = [];
  for (const mesh of meshes) {
    mesh.skeleton.update();
    const positions = mesh.geometry.getAttribute("position");
    const stride = Math.max(1, Math.floor(positions.count / 600));
    for (let i = 0; i < positions.count; i += stride) {
      const vertex = new THREE.Vector3();
      mesh.getVertexPosition(i, vertex);
      vertex.applyMatrix4(mesh.matrixWorld);
      if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) throw new Error("Nonfinite skinned vertex");
      points.push(vertex);
    }
  }
  return points;
}

async function captureModel(vrm: VRM) {
  const bounds = new THREE.Box3().setFromObject(vrm.scene, true);
  const size = bounds.getSize(new THREE.Vector3());
  if (!(size.y > 0.5 && size.y < 3)) throw new Error(`Invalid human pose height ${size.y}`);
  const center = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(size.y * 1.12, size.x * 1.12);
  const camera = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.01, 100);
  camera.position.set(center.x, center.y, center.z + 5);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  if (context.isContextLost() || context.getError() !== context.NO_ERROR) throw new Error("GPU capture error");
  const pixels = new Uint8Array(768 * 768 * 4);
  context.readPixels(0, 0, 768, 768, context.RGBA, context.UNSIGNED_BYTE, pixels);
  let foregroundPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (Math.abs(pixels[index] - pixels[0]) + Math.abs(pixels[index + 1] - pixels[1]) + Math.abs(pixels[index + 2] - pixels[2]) > 36) foregroundPixels += 1;
  }
  if (foregroundPixels < 768 * 768 * 0.02) throw new Error(`Blank/transparent model: only ${foregroundPixels} foreground pixels despite ${renderer.info.render.triangles} submitted triangles`);
  return { modelBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, renderedTriangles: renderer.info.render.triangles, foregroundPixels, pngBase64: renderer.domElement.toDataURL("image/png").split(",")[1] };
}

async function review(id: string) {
  const model = [...QUATERNIUS_FANTASY_VRMS, ...QUATERNIUS_MODULAR_VRMS].find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown candidate ${id}`);
  const gltf = await loader.loadAsync(model.url);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm || vrm.meta.metaVersion !== "1") throw new Error(`${id}: expected VRM1`);
  scene.add(vrm.scene);
  try {
    const meshes: THREE.SkinnedMesh[] = [];
    vrm.scene.traverse((object) => {
      object.frustumCulled = false;
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
    });
    if (meshes.length < 4) throw new Error(`${id}: no assembled skin`);
    vrm.humanoid.resetNormalizedPose();
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    const baseline = sampledPositions(meshes);
    const deformation: Record<string, number> = {};
    for (const [bone, angles] of [["leftUpperArm", [0, 0, 0.55]], ["rightLowerLeg", [0.65, 0, 0]], ["head", [0, 0.5, 0]]] as const) {
      if (!vrm.humanoid.getNormalizedBoneNode(bone)) throw new Error(`${id}: missing pose bone ${bone}`);
      vrm.humanoid.resetNormalizedPose();
      vrm.humanoid.setNormalizedPose({ [bone]: { rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles)).toArray() } });
      vrm.update(0);
      vrm.scene.updateMatrixWorld(true);
      const posed = sampledPositions(meshes);
      const delta = Math.max(...posed.map((point, index) => point.distanceTo(baseline[index])));
      if (!(delta > 0.008 && delta < 2)) throw new Error(`${id}: ${bone} skin deformation invalid: ${delta}`);
      deformation[bone] = delta;
    }
    const builtinPoses = [];
    const world = (bone: VRMHumanBoneName) => {
      const node = vrm.humanoid.getNormalizedBoneNode(bone);
      if (!node) throw new Error(`${id}: missing builtin pose bone ${bone}`);
      return node.getWorldPosition(new THREE.Vector3());
    };
    for (const poseId of ["default", "wave", "sit", "run"]) {
      const preset = POSE_PRESETS.find((pose) => pose.id === poseId);
      if (!preset) throw new Error(`Missing production preset ${poseId}`);
      applyPoserVisualState(vrm, { bones: preset.bones, yOffset: preset.yOffset });
      vrm.update(0);
      vrm.scene.updateMatrixWorld(true);
      const points = sampledPositions(meshes);
      const delta = Math.max(...points.map((point, index) => point.distanceTo(baseline[index])));
      if (!(delta > 0.05 && delta < 2.5)) throw new Error(`${id}: builtin ${poseId} did not safely deform skin`);
      const hand = world("rightHand");
      const shoulder = world("rightUpperArm");
      if (poseId === "default" && !(hand.y < shoulder.y - 0.25)) throw new Error(`${id}: builtin default did not lower the arm`);
      if (poseId === "wave" && !(hand.y > shoulder.y + 0.10)) throw new Error(`${id}: builtin wave did not raise the hand`);
      if (poseId === "sit" && !(world("leftLowerLeg").z > world("leftUpperLeg").z + 0.20)) throw new Error(`${id}: builtin sit did not bend the thigh forward`);
      if (poseId === "run" && !(Math.abs(world("leftFoot").z - world("rightFoot").z) > 0.20)) throw new Error(`${id}: builtin walking legs are not separated`);
      builtinPoses.push({ poseId, maxVertexDelta: delta, rightHand: hand.toArray(), rightShoulder: shoulder.toArray(), ...await captureModel(vrm) });
    }
    const neutral = POSE_PRESETS.find((pose) => pose.id === "default")!;
    applyPoserVisualState(vrm, { bones: neutral.bones, yOffset: neutral.yOffset });
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    const capture = await captureModel(vrm);
    const boneCount = Object.keys(gltf.parser.json.extensions.VRMC_vrm.humanoid.humanBones).length;
    const mappedFinger = vrm.humanoid.getNormalizedBoneNode("leftIndexProximal" as VRMHumanBoneName);
    const expectedBones = id.startsWith("quaternius-modular-male-") ? 48 : id.startsWith("quaternius-modular-female-") ? 50 : 52;
    if (boneCount !== expectedBones || !mappedFinger) throw new Error(`${id}: humanoid mapping incomplete`);
    return { id, url: model.url, gpu, humanBones: boneCount, skinnedMeshes: meshes.length, deformation, builtinPoses, images: gltf.parser.json.images?.length ?? 0, animations: gltf.animations.length, expressions: Object.keys(vrm.expressionManager?.expressionMap ?? {}).length, ...capture };
  } finally {
    scene.remove(vrm.scene);
    VRMUtils.deepDispose(vrm.scene);
    renderer.renderLists.dispose();
  }
}

export type QuaterniusFantasyRuntime = { review: typeof review; ready: boolean };
Object.assign(window, { __quaterniusFantasy: { review, ready: true } });
