import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName, type VRMPose } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { collectStudioVrmCostumeMeshes, applyStudioVrmCostumeState } from "../../src/domains/creator/vrm/studio-vrm-costume-runtime";
import { mergeWardrobeCostumeVisibility } from "../../src/domains/creator/vrm/studio-vrm-wardrobe";
import { measureStudioVrmWardrobeMetrics } from "../../src/domains/creator/vrm/StudioVrmWardrobePropsProjection";
import {
  createStudioVrmXpbdSkirtAttachmentRuntime,
  planStudioVrmXpbdSkirtDeviceTier,
  type StudioVrmXpbdSkirtAttachmentRuntime,
} from "../../src/domains/creator/vrm/StudioVrmXpbdSkirtAttachment";

const MODELS = ["sample.vrm", "AvatarSample_B.vrm"] as const;
const POSES = ["standing", "sitting", "stride"] as const;
type PoseName = typeof POSES[number];
const invariant = (condition: boolean, message: string): void => { if (!condition) throw new Error(message); };
interface QualityReport {
  status: string; gpu?: { renderer: string; vendor: string }; cases: unknown[]; runtimes: unknown[];
  expectedCases: number; expectedPngs: number; pngs: string[]; failures: string[];
  qualityRejections: unknown[];
  contextLosses: number; cleanupComplete: boolean; scope: string;
}
declare global {
  interface Window {
    __studioSkirtQuality: QualityReport;
    __saveSkirtEvidence: (id: string, png: string) => Promise<void>;
    runStudioSkirtQuality: (expectedRenderer: string) => Promise<void>;
  }
}
function rotation(x: number, y = 0, z = 0): [number, number, number, number] {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
}
function commit(vrm: VRM, scene: THREE.Scene) {
  vrm.update(0);
  scene.updateMatrixWorld(true);
  scene.traverse((object) => { const mesh = object as THREE.SkinnedMesh; if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
}
const standingDirections = new WeakMap<VRM, THREE.Vector3[]>();
function applyPose(vrm: VRM, name: PoseName, scene: THREE.Scene) {
  vrm.humanoid.resetNormalizedPose();
  // Keep the imported normalized arm rest; a fixed Z rotation can lift a differently oriented rig.
  const pose: VRMPose = {};
  if (name === "sitting") {
    pose.leftUpperLeg = { rotation: rotation(-Math.PI / 2) };
    pose.rightUpperLeg = { rotation: rotation(-Math.PI / 2) };
    pose.leftLowerLeg = { rotation: rotation(Math.PI / 2) };
    pose.rightLowerLeg = { rotation: rotation(Math.PI / 2) };
  } else if (name === "stride") {
    pose.leftUpperLeg = { rotation: rotation(-Math.PI * 0.25) };
    pose.rightUpperLeg = { rotation: rotation(Math.PI / 6) };
    pose.leftLowerLeg = { rotation: rotation(Math.PI / 12) };
    pose.rightLowerLeg = { rotation: rotation(Math.PI / 5) };
  }
  vrm.humanoid.setNormalizedPose(pose);
  commit(vrm, scene);
  if (name === "standing") standingDirections.set(vrm, thighVectors(vrm));
  const authoredThighDegrees = name === "sitting" ? [90, 90] : name === "stride" ? [45, -30] : [0, 0];
  if (name === "sitting") {
    const rest = standingDirections.get(vrm);
    invariant(Boolean(rest), "Sitting calibration requires the standing raw-bone reference");
    // VRM rest legs can have a lateral component: a normalized X90 rotation need not move
    // their actual bone segments by 90 degrees. Calibrate the fixture, not the physics gate.
    const lower = [Math.PI / 2 - 0.08, Math.PI / 2 - 0.08];
    const upper = [Math.PI / 2 + 0.08, Math.PI / 2 + 0.08];
    for (let iteration = 0; iteration < 18; iteration += 1) {
      const angles = lower.map((value, index) => (value + upper[index]) / 2);
      pose.leftUpperLeg = { rotation: rotation(-angles[0]) };
      pose.rightUpperLeg = { rotation: rotation(-angles[1]) };
      vrm.humanoid.setNormalizedPose(pose);
      commit(vrm, scene);
      const actual = thighVectors(vrm);
      for (let index = 0; index < 2; index += 1) {
        if (actual[index].angleTo(rest![index]) < Math.PI / 2) lower[index] = angles[index];
        else upper[index] = angles[index];
        authoredThighDegrees[index] = THREE.MathUtils.radToDeg(angles[index]);
      }
    }
  }
  return authoredThighDegrees;
}
function world(vrm: VRM, bone: VRMHumanBoneName) {
  const node = vrm.humanoid.getRawBoneNode(bone);
  invariant(Boolean(node), `Required raw bone unavailable: ${bone}`);
  return node!.getWorldPosition(new THREE.Vector3());
}
function thighVectors(vrm: VRM) {
  return [world(vrm, "leftLowerLeg").sub(world(vrm, "leftUpperLeg")).normalize(),
    world(vrm, "rightLowerLeg").sub(world(vrm, "rightUpperLeg")).normalize()];
}
function inspectGeometry(runtime: StudioVrmXpbdSkirtAttachmentRuntime) {
  const geometry = runtime.surface.geometry;
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const indices = geometry.index;
  invariant(positions.count === runtime.topology.particleCount && normals.count === positions.count,
    "Geometry particle/normal counts differ from authoritative topology");
  invariant(Boolean(indices) && indices!.count === runtime.topology.triangleCount * 3, "Incomplete triangle index buffer");
  invariant(Array.from(positions.array).every(Number.isFinite) && Array.from(normals.array).every(Number.isFinite), "Non-finite geometry");
  invariant(Array.from(indices!.array).every((value) => Number.isInteger(value) && value >= 0 && value < positions.count), "Triangle index out of range");
  let maxPinErrorM = 0;
  for (const index of runtime.topology.waistParticleIndices) {
    const offset = index * 3;
    maxPinErrorM = Math.max(maxPinErrorM, Math.hypot(
      positions.array[offset] - runtime.topology.restPositions[offset],
      positions.array[offset + 1] - runtime.topology.restPositions[offset + 1],
      positions.array[offset + 2] - runtime.topology.restPositions[offset + 2],
    ));
  }
  // These three poses rotate only limb joints; their hips/spine frame stays at its rest frame.
  invariant(maxPinErrorM <= 0.000001, `Pinned waist moved in an unchanged hips frame: ${maxPinErrorM}`);
  return { maxPinErrorM, vertexCount: positions.count, indexCount: indices!.count };
}

window.runStudioSkirtQuality = async (expectedRenderer) => {
  const report: QualityReport = { status: "initializing", cases: [], runtimes: [], expectedCases: 48,
    expectedPngs: 24, pngs: [], failures: [], qualityRejections: [], contextLosses: 0, cleanupComplete: false,
    scope: "Native desktop GPU, actual VRMs and product attachment/wardrobe/pose APIs; mobile solver plan only. Capsule residual does not prove zero skin-mesh penetration. Self-collision is unsupported. Source harness, not product editor UI.",
  };
  window.__studioSkirtQuality = report;
  let renderer: THREE.WebGLRenderer | undefined;
  let loadedScene: THREE.Scene | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(800, 900);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.addEventListener("webglcontextlost", () => { report.contextLosses += 1; });
    document.body.appendChild(renderer.domElement);
    const gl = renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    invariant(Boolean(debug), "Actual GPU fingerprint unavailable");
    report.gpu = { renderer: String(gl.getParameter(debug!.UNMASKED_RENDERER_WEBGL)),
      vendor: String(gl.getParameter(debug!.UNMASKED_VENDOR_WEBGL)) };
    invariant(!/swiftshader|llvmpipe|software/iu.test(report.gpu.renderer)
      && new RegExp(expectedRenderer, "iu").test(report.gpu.renderer), `Native GPU mismatch: ${report.gpu.renderer}`);
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    let topologyGeneration = 0;
    for (const model of MODELS) {
      const scene = new THREE.Scene();
      loadedScene = scene;
      scene.background = new THREE.Color(0xe6ebef);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x72849a, 2));
      const key = new THREE.DirectionalLight(0xffffff, 2.5);
      key.position.set(2, 4, 5); scene.add(key);
      const asset = await loader.loadAsync(`/vrm/${model}`);
      const vrm = asset.userData.vrm as VRM;
      invariant(Boolean(vrm?.humanoid), `${model}: actual VRM humanoid unavailable`);
      scene.add(vrm.scene); VRMUtils.rotateVRM0(vrm);
      applyPose(vrm, "standing", scene);
      const metrics = measureStudioVrmWardrobeMetrics(vrm);
      const costumes = collectStudioVrmCostumeMeshes(vrm);
      const originalVisibility = new Map<THREE.Object3D, boolean>();
      vrm.scene.traverse((object) => originalVisibility.set(object, object.visible));
      const hips = world(vrm, "hips"), head = world(vrm, "head");
      const right = world(vrm, "leftUpperLeg").sub(world(vrm, "rightUpperLeg")).normalize();
      const up = world(vrm, "spine").sub(hips).normalize();
      const forward = right.clone().cross(up).normalize();
      const cameraTarget = hips.clone().addScaledVector(up, -metrics.upperLeg.left.len * 0.3);
      const height = Math.max(1, head.distanceTo(world(vrm, "leftFoot")) * 1.25);
      const camera = new THREE.OrthographicCamera(-height * 800 / 900 / 2, height * 800 / 900 / 2,
        height / 2, -height / 2, 0.01, 50);
      const aim = (side: boolean) => {
        camera.position.copy(cameraTarget).addScaledVector(side ? right : forward, 4);
        camera.up.copy(up); camera.lookAt(cameraTarget); camera.updateMatrixWorld(true);
      };
      aim(false);
      const profileByKind = new Map<string, string>();
      for (const tier of ["desktop", "mobile"] as const) {
        const plan = planStudioVrmXpbdSkirtDeviceTier(tier === "desktop"
          ? { hardwareConcurrency: 8, deviceMemoryGb: 8 } : { mobileUserAgent: true });
        for (const kind of ["pleated", "longskirt"] as const) {
          for (const fit of tier === "desktop" ? [0.75, 1, 1.35] : [1]) {
            for (const [object, visible] of originalVisibility) object.visible = visible;
            applyPose(vrm, "standing", scene);
            const effectiveCostume = mergeWardrobeCostumeVisibility({ hidden: [], recolor: {} }, {
              bottom: { itemId: kind, color: "#a8394b", fit, fitMode: "manual", fabricId: "satin" },
            }, costumes, true);
            applyStudioVrmCostumeState(costumes, effectiveCostume);
            commit(vrm, scene);
            const created = createStudioVrmXpbdSkirtAttachmentRuntime({ vrm, kind, metrics, effectiveFit: fit,
              topologyGeneration: topologyGeneration++, devicePlan: plan, color: "#a8394b", fabricId: "satin" });
            invariant(created.ok, `${model}/${kind}/${fit}/${tier}: ${JSON.stringify(created.ok ? null : created)}`);
            if (!created.ok) continue;
            const runtime = created.runtime;
            invariant(runtime.retain(), "Could not acquire runtime owner lease");
            vrm.scene.add(runtime.surface.mesh);
            const geometry = runtime.surface.geometry;
            const positionBuffer = geometry.getAttribute("position");
            const normalBuffer = geometry.getAttribute("normal");
            const indexBuffer = geometry.index;
            let uploadedPositionVersion = "version" in positionBuffer ? positionBuffer.version : positionBuffer.data.version;
            const bodyProfile = JSON.stringify(runtime.bodyProfile);
            const profileKey = `${kind}/${tier}`;

            const restThighs = thighVectors(vrm);
            const restHipMatrix = vrm.humanoid.getRawBoneNode("hips")!.matrixWorld.clone();
            let standingPositionsHash = "";
            let resetPositionsHash = "";
            try {
              if (profileByKind.has(profileKey)) invariant(profileByKind.get(profileKey) === bodyProfile, "Physical body profile changed with garment fit");
              else profileByKind.set(profileKey, bodyProfile);
              for (const [poseGeneration, pose] of [...POSES, "standing" as const].entries()) {
                const authoredThighDegrees = applyPose(vrm, pose, scene);
                invariant(vrm.humanoid.getRawBoneNode("hips")!.matrixWorld.equals(restHipMatrix), "Pose unexpectedly moved the waist frame");
                const beforePositions = new Float32Array(positionBuffer.array);
                const beforeGeneration = runtime.lastPoseGeneration;
                const solveStarted = performance.now();
                const stepped = runtime.step(runtime.topologyGeneration, poseGeneration);
                const solveMs = performance.now() - solveStarted;
                if (!stepped.ok && stepped.code === "solver-unavailable" && stepped.detail.includes("collision-unresolved")
                  && poseGeneration < 3 && pose !== "standing") {
                  invariant(runtime.lastPoseGeneration === beforeGeneration
                    && beforePositions.every((value, index) => value === positionBuffer.array[index]),
                  "Rejected cloth published partial or stale-generation geometry");
                  const rejection = { model, kind, fit, tier, pose, status: "quality-rejected", reason: stepped.detail,
                    partialGeometryPublished: false, solveMs };
                  report.qualityRejections.push(rejection); report.cases.push(rejection);
                  continue;
                }
                invariant(stepped.ok, `${model}/${kind}/${fit}/${tier}/${pose}: ${JSON.stringify(stepped)}`);
                if (!stepped.ok) continue;
                commit(vrm, scene);
                const geometryCheck = inspectGeometry(runtime);
                const position = geometry.getAttribute("position");
                const positionBytes = new Uint8Array(4 + position.count * 3 * 4);
                const positionView = new DataView(positionBytes.buffer);
                positionView.setUint32(0, position.count * 3, true);
                for (let vertex = 0; vertex < position.count; vertex += 1) {
                  for (let axis = 0; axis < 3; axis += 1) positionView.setFloat32(4 + (vertex * 3 + axis) * 4,
                    position.getComponent(vertex, axis), true);
                }
                const publishedPositionSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", positionBytes)))
                  .map((byte) => byte.toString(16).padStart(2, "0")).join("");
                invariant(publishedPositionSha256 === stepped.solve.outputPositionsSha256,
                  "Published geometry positions differ from the solved cloth receipt");
                const nextPositionVersion = "version" in position ? position.version : position.data.version;
                invariant(nextPositionVersion > uploadedPositionVersion, "Updated geometry was not marked for GPU upload");
                uploadedPositionVersion = nextPositionVersion;
                invariant(runtime.surface.geometry === geometry && geometry.getAttribute("position") === positionBuffer
                  && geometry.getAttribute("normal") === normalBuffer && geometry.index === indexBuffer, "Pose replaced the GPU geometry/attribute objects");
                const maxResidualM = Math.max(stepped.solve.diagnostics.finalTrianglePenetrationM,
                  ...Object.values(stepped.solve.diagnostics.finalCapsulePenetrationById));
                invariant(Number.isFinite(maxResidualM) && maxResidualM <= 0.001, `Capsule residual exceeds 1mm: ${maxResidualM}`);
                invariant(stepped.solve.selfCollisionEnabled === false && stepped.solve.diagnostics.nonFiniteCount === 0, "Unexpected collision/finite contract");
                const thighAnglesDegrees = thighVectors(vrm).map((vector, index) => THREE.MathUtils.radToDeg(vector.angleTo(restThighs[index])));
                if (pose === "sitting") invariant(thighAnglesDegrees.every((angle) => Math.abs(angle - 90) <= 0.05),
                  `Normalized pose did not create actual 90-degree thighs: ${thighAnglesDegrees}`);
                if (poseGeneration === 0) standingPositionsHash = stepped.solve.outputPositionsSha256;
                if (pose !== "standing") invariant(stepped.solve.outputPositionsSha256 !== standingPositionsHash,
                  "Moved thighs did not change the authoritative cloth positions");
                if (poseGeneration === 3) { resetPositionsHash = stepped.solve.outputPositionsSha256; continue; }
                aim(false);
                renderer.render(scene, camera);
                const withSkirt = new Uint8Array(800 * 900 * 4);
                gl.readPixels(0, 0, 800, 900, gl.RGBA, gl.UNSIGNED_BYTE, withSkirt);
                runtime.surface.mesh.visible = false;
                renderer.render(scene, camera);
                const withoutSkirt = new Uint8Array(withSkirt.length);
                gl.readPixels(0, 0, 800, 900, gl.RGBA, gl.UNSIGNED_BYTE, withoutSkirt);
                runtime.surface.mesh.visible = true;
                let changedPixels = 0;
                for (let offset = 0; offset < withSkirt.length; offset += 4) {
                  if ([0, 1, 2].some((channel) => Math.abs(withSkirt[offset + channel] - withoutSkirt[offset + channel]) > 4)) changedPixels += 1;
                }
                invariant(changedPixels >= 100, `Garment has no meaningful visible pixel contribution: ${changedPixels}`);
                renderer.render(scene, camera);
                if (tier === "desktop" && fit === 1) {
                  for (const view of ["front", "side"] as const) {
                    aim(view === "side"); renderer.render(scene, camera);
                    const id = `${model.replace(".vrm", "")}-${kind}-${pose}-${view}`;
                    await window.__saveSkirtEvidence(id, renderer.domElement.toDataURL("image/png"));
                    report.pngs.push(id);
                  }
                }
                invariant(!gl.isContextLost() && gl.getError() === gl.NO_ERROR, "GPU error while rendering skirt");
                report.cases.push({ model, kind, fit, devicePlan: plan, pose, authoredThighDegrees, thighAnglesDegrees,
                  metricsSource: metrics.source, bodyProfile: runtime.bodyProfile,
                  hiddenOriginal: costumes.filter((entry) => effectiveCostume.hidden.includes(entry.key)).map(({ key, slot }) => ({ key, slot })),
                  geometryCheck, publishedPositionSha256, changedPixels, maxResidualM, solveMs, surface: stepped.surface, solve: stepped.solve });
                report.status = "running";
              }
              invariant(standingPositionsHash === resetPositionsHash, "Standing reset changed deterministic output positions");
              const stale = runtime.step(runtime.topologyGeneration, 3);
              invariant(!stale.ok && stale.code === "stale-pose-generation", "Stale pose was accepted");
              report.runtimes.push({ model, kind, fit, tier, standingPositionsHash, resetPositionsHash,
                geometryReused: true, ownerLease: true, stalePoseRejected: true, solveCount: runtime.solveCount });
            } finally {
              vrm.scene.remove(runtime.surface.mesh);
              runtime.release();
              await Promise.resolve();
              invariant(runtime.surface.disposed, "Released runtime did not perform deferred GPU disposal");
            }
          }
        }
      }
      for (const [object, visible] of originalVisibility) object.visible = visible;
      VRMUtils.deepDispose(scene); loadedScene = undefined;
    }
    invariant(report.cases.length === report.expectedCases && report.pngs.length === report.expectedPngs, "Incomplete matrix or screenshots");
    invariant(report.contextLosses === 0, "Unexpected WebGL context loss");
    report.status = report.qualityRejections.length > 0 ? "completed-with-quality-rejections" : "passed";
  } catch (error) {
    report.status = "failed";
    report.failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
  } finally {
    if (loadedScene) VRMUtils.deepDispose(loadedScene);
    renderer?.dispose();
    report.cleanupComplete = true;
  }
};
