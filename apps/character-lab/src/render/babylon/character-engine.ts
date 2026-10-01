/**
 * BabylonCharacterEngine — contracts/engine.ts `CharacterEngine` 포트 구현 본체. WebGPU/WebGL2/NullEngine 어느 `AbstractEngine`이든
 * 생성자 주입으로 받아 같은 클래스가 돈다. 엔진 생성(WebGPUEngine·Engine, DOM 의존)은 `render/babylon-character-engine.ts`
 * 진입점이 `engine-factory.ts`로 하므로 이 파일은 DOM 전용 Babylon 모듈을 import하지 않는다 — NullEngine 하네스
 * (`render/testing/null-engine-harness.ts`)가 Node에서 이 파일만 import해 같은 클래스를 검증한다.
 *
 * 책임 분담: 장면(scene-builder) · 리그(mesh-binding/package-loader/character-rig) · 재질(material-factory/toon-shader) ·
 * IBL(lighting/ibl) · 후처리(postprocess) · 캡처(capture) · 피킹/페인트(pick-and-paint) · 물리(physics-bridge) · HUD(hud) ·
 * GLB(glb-exporter). 이 파일은 그것들을 포트 메서드로 묶고 상태(현재 리그·셰이딩·프레이밍·마지막 플랜)만 가진다.
 *
 * 레인별 정직성: readback이 없는 NullEngine 레인은 `renderPasses().provenance.synthetic = true`, `provenance.backend = "null"`,
 * HUD `adapterLabel = "NullEngine"`로 표시한다. 브라우저 레인(WebGPU/WebGL2)은 이 컨테이너에서 실행하지 못했다(docs/parity/render.md).
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";

import { DEFAULT_FRAMING, DEFAULT_SHADING, failVisible, isHumanoidBoneName, isLabFailure } from "../../contracts";
import { hexToSrgb01 } from "../../shared/color";
import { fnv1a64Hex, sha256Hex } from "../../shared/hash";
import { qConjugate, qMultiply, qRotateVec3, v3Cross, v3Length, v3Normalize, v3Sub } from "../../shared/math";
import { stableStringify } from "../../shared/stable-json";
import { faceSdfUniforms, generateFaceSdf } from "../face-sdf";
import { createFrameStats } from "../frame-stats";
import { toonShadeTint } from "../material-presets";
import { createFeatureReport, featureActive, featureOff, featureUnavailable } from "../scene-features";

import { BABYLON_SIDE_EFFECTS_LOADED } from "./babylon-side-effects";
import { capturePasses, captureThumbnail } from "./capture";
import { applyRigPlan, computeRigBounds, inspectRig, restoreRig, rigBoneWorld, rigPoseSkeleton, rigVisibleMeshes, setRigPartVisible, snapshotRig } from "./character-rig";
import { fromQuaternion, fromVector3, toVector3 } from "./convert";
import { exportRigGlb } from "./glb-exporter";
import { createHudProbe } from "./hud";
import { createProceduralIbl } from "./lighting/ibl";
import { adaptLoadedMaterial, applyPresetParams, createPresetMaterial, setMaterialAlbedo } from "./materials/material-factory";
import { createPassMaterial, setDepthUniform, setFlatTextures, setFlatUniforms, setIdUniform, setToonTextures, setToonUniforms, shaderLanguageFor } from "./materials/toon-shader";
import { bindProceduralModel, RigBindError } from "./mesh-binding";
import { loadPackageRig } from "./package-loader";
import { createPhysicsBridge } from "./physics-bridge";
import { attachDecalToMesh, createPaintTextures, pickRig } from "./pick-and-paint";
import { createPostProcessStack } from "./postprocess";
import { createCharacterScene, inspectCharacterScene } from "./scene-builder";

import type { CaptureDeps, PassMaterialSet } from "./capture";
import type { CharacterRig, RigMaterialHooks, RigPart } from "./character-rig";
import type {
  ApplyPlan,
  ApplyReceipt,
  AuthoredPackagePlan,
  CameraFraming,
  CaptureRequest,
  CaptureResult,
  CapturedRaster,
  CharacterEngine,
  CharacterSource,
  EngineBackend,
  EngineDiagnostics,
  HudSample,
  JointDragHandle,
  PaintLayer,
  PartRole,
  PhysicsProviderFactory,
  PhysicsProviderId,
  PhysicsStatus,
  PickHit,
  Quat,
  SettleReceipt,
  ShadingProfile,
  SkeletonData,
  SourceCapabilities,
  ThumbnailRequest,
  Vec3,
} from "../../contracts";
import type { MaterialFactoryOptions } from "./materials/material-factory";
import type { ToonUniformValues } from "./materials/toon-shader";
import type { PhysicsBridge, PhysicsReceiptLike } from "./physics-bridge";
import type { CharacterScene } from "./scene-builder";
import type { ReadbackLane } from "../readback";
import type { PaintInspection, RigInspection, SceneInspection } from "../rig-inspection";
import type { SceneFeatureReport, SceneFeatureSource } from "../scene-features";
import type { ViewportCameraInfo, ViewportCameraSource } from "../viewport-camera";
import type { ProceduralIbl } from "./lighting/ibl";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";

export type { ReadbackLane } from "../readback";

/**
 * 썸네일 임시 리그 전용 레이어 마스크. 메인 카메라(기본 0x0fffffff)가 그리지 않으므로 캡처 중 비동기 구간에도
 * 뷰포트에 임시 리그가 보이지 않는다. 캡처 RTT는 `renderList`를 쓰므로 레이어 마스크를 검사하지 않는다.
 */
export const THUMBNAIL_LAYER_MASK = 0x10000000;

/** 얼굴 SDF 임계 맵 해상도 */
export const FACE_SDF_SIZE = 128;
/** 툰 외곽선(hull) 폭(월드 단위, m) */
export const TOON_OUTLINE_WIDTH = 0.004;
/** 엣지 외곽선 각도 임계(cos) */
export const TOON_EDGE_EPSILON = 0.95;

/** `readBone` 결과 */
export interface BoneReading {
  readonly name: string;
  readonly humanoid: string | null;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly localRotation: Quat;
  readonly auxiliary: boolean;
}

export interface BabylonCharacterEngineDeps {
  /** 이미 초기화된 Babylon 엔진(WebGPUEngine·Engine·NullEngine) */
  readonly engine: AbstractEngine;
  readonly lane: ReadbackLane;
  readonly diagnostics: EngineDiagnostics;
  readonly physicsProviders: PhysicsProviderFactory;
  /** 제작 패키지 GLB 바이트 로더. 기본은 `fetch`(브라우저). 테스트는 node:fs로 주입한다. */
  readonly fetchBytes?: (url: string) => Promise<Uint8Array>;
  /** 패키지 SHA-256을 플랜과 대조한다(기본 true). */
  readonly verifyPackageSha?: boolean;
  /** 캡처 전에 패스 셰이더 컴파일을 기다릴지(기본: lane !== "null"). NullEngine은 컴파일하지 않으므로 하네스가 끈다. */
  readonly awaitShaderCompile?: boolean;
  /** `engine.runRenderLoop` 구동 여부(기본: lane !== "null") */
  readonly runRenderLoop?: boolean;
  /** 엔진 핸들 해제(기본 engine.dispose) */
  readonly disposeEngine?: () => void;
  readonly now?: () => number;
}

async function fetchBytesDefault(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw failVisible("package-fetch-failed", `제작 패키지 GLB를 받지 못했습니다(HTTP ${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

function srgb(hex: string): readonly [number, number, number] {
  return hexToSrgb01(hex) ?? [0.5, 0.5, 0.5];
}

function toFailure(error: unknown, code: string, reasonKo: string, now: number): never {
  if (error instanceof RigBindError) throw error.failure;
  if (isLabFailure(error)) throw error;
  throw failVisible(code, reasonKo, error, now);
}

export class BabylonCharacterEngine implements CharacterEngine, SceneFeatureSource, ViewportCameraSource {
  readonly backend: EngineBackend;
  readonly diagnostics: EngineDiagnostics;
  readonly lane: ReadbackLane;
  /** `ThumbnailRequest.source`(지오메트리 프리셋의 임시 소스)를 처리한다: 주 리그를 건드리지 않고 임시 리그로 그린 뒤 해제. */
  readonly thumbnailSources = true;

  private readonly engine: AbstractEngine;
  private readonly deps: BabylonCharacterEngineDeps;
  private readonly now: () => number;
  private readonly character: CharacterScene;
  private readonly physics: PhysicsBridge;
  private readonly hud: ReturnType<typeof createHudProbe>;
  private readonly frameStats = createFrameStats(240);
  private readonly paintTextures: ReturnType<typeof createPaintTextures>;
  private readonly postfx: ReturnType<typeof createPostProcessStack>;
  private readonly ibl: ProceduralIbl;
  private readonly whiteTexture: RawTexture;
  private readonly clearTexture: RawTexture;
  private readonly sdfTexture: RawTexture;
  private readonly flatMaterials = new Map<number, ShaderMaterial>();
  private readonly idMaterials = new Map<number, ShaderMaterial>();
  private normalMaterial: ShaderMaterial | null = null;
  private depthMaterial: ShaderMaterial | null = null;
  private rig: CharacterRig | null = null;
  private shading: ShadingProfile = DEFAULT_SHADING;
  private framing: CameraFraming = DEFAULT_FRAMING;
  private lastPlan: ApplyPlan | null = null;
  private disposed = false;
  private loopRunning = false;
  /** 캡처(썸네일·멀티패스)는 캡처 카메라·RTT·플랜 상태를 공유하므로 한 번에 하나만 실행한다. */
  private captureChain: Promise<unknown> = Promise.resolve();

  private constructor(deps: BabylonCharacterEngineDeps, ibl: ProceduralIbl) {
    if (!BABYLON_SIDE_EFFECTS_LOADED) throw new Error("babylon-side-effects가 로드되지 않았습니다.");
    this.deps = deps;
    this.engine = deps.engine;
    this.lane = deps.lane;
    this.backend = deps.diagnostics.backend;
    this.diagnostics = deps.diagnostics;
    this.now = deps.now ?? (() => Date.now());
    this.character = createCharacterScene(this.engine);
    const scene = this.character.scene;
    this.ibl = ibl;
    if (ibl.texture) scene.environmentTexture = ibl.texture;
    this.postfx = createPostProcessStack(scene, this.character.camera);
    this.hud = createHudProbe(scene, this.engine);
    this.physics = createPhysicsBridge({ factory: deps.physicsProviders, now: this.now });
    this.paintTextures = createPaintTextures(scene);
    this.whiteTexture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    this.whiteTexture.name = "default:white";
    this.clearTexture = RawTexture.CreateRGBATexture(new Uint8Array([0, 0, 0, 0]), 1, 1, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    this.clearTexture.name = "default:clear";
    const sdf = generateFaceSdf(FACE_SDF_SIZE);
    // 얼굴 SDF 임계 맵: R8, 선형 보간, invertY=false(생성 행 0 = v 0)
    this.sdfTexture = RawTexture.CreateRTexture(sdf.data, sdf.size, sdf.size, scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this.sdfTexture.name = "default:face-sdf";
    this.sdfTexture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    this.sdfTexture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    this.applyShadingToScene();
    if (deps.runRenderLoop ?? deps.lane !== "null") {
      this.loopRunning = true;
      this.engine.runRenderLoop(() => this.renderFrame());
    }
  }

  /** 장면·IBL까지 준비된 엔진을 만든다(IBL 프리필터가 비동기). */
  static async create(deps: BabylonCharacterEngineDeps): Promise<BabylonCharacterEngine> {
    const probeScene = createCharacterScene(deps.engine);
    let ibl: ProceduralIbl;
    try {
      ibl = await createProceduralIbl(probeScene.scene);
    } finally {
      // IBL 텍스처는 엔진 소유라 장면을 바꿔도 유효하다. 프로브 장면은 조명·카메라만 있어 바로 버린다.
      probeScene.dispose();
    }
    return new BabylonCharacterEngine(deps, ibl);
  }

  // ---------------------------------------------------------------- 프레임

  /** 물리 1스텝 + 장면 1프레임 렌더(렌더 루프와 테스트가 공유) */
  renderFrame(): void {
    if (this.disposed) return;
    this.physics.step();
    this.character.scene.render();
    this.frameStats.push(this.engine.getDeltaTime());
  }

  /** 뷰포트 카메라 조작(ArcRotate 포인터·휠)을 캔버스에 붙인다. 드로잉 모드는 ViewportPane이 오버레이로 가로챈다. */
  attachCameraControl(canvas: HTMLCanvasElement): void {
    this.character.camera.attachControl(canvas, true);
  }

  // ---------------------------------------------------------------- 소스

  async loadSource(source: CharacterSource): Promise<SourceCapabilities> {
    this.assertAlive();
    this.unloadRig();
    let rig: CharacterRig;
    try {
      rig = await this.buildRig(source, this.materialHooks(() => this.rig, true));
    } catch (error) {
      return toFailure(error, "source-load-failed", "캐릭터 소스를 엔진에 바인딩하지 못했습니다.", this.now());
    }
    if (this.disposed) {
      // 로드 중 엔진이 해제됐다: 장면은 이미 정리됐으므로 리그 객체만 해제하고 실패로 알린다.
      rig.dispose();
      throw failVisible("engine-disposed", "소스를 올리는 도중 엔진이 해제됐습니다. 엔진을 다시 선택하세요.", undefined, this.now());
    }
    this.rig = rig;
    this.character.addShadowCasters(rigVisibleMeshes(rig, { includeOutlines: false }));
    this.physics.bindRig(rig);
    this.reattachPaint(rig);
    this.applyMaterialsForMode(rig);
    this.setCamera(this.framing);
    return {
      capabilities: rig.capabilities,
      morphNames: rig.morphNames,
      boneNames: [...rig.bones.keys()],
      partIdPalette: rig.partIdPalette,
    };
  }

  /** 소스(절차·패키지)에서 리그를 만든다. 주 리그와 썸네일 임시 리그가 공유한다. */
  private async buildRig(source: CharacterSource, hooks: RigMaterialHooks): Promise<CharacterRig> {
    const materialOptions = this.materialOptions();
    if (source.kind === "procedural") {
      return bindProceduralModel(source.model, {
        scene: this.character.scene,
        createMaterial: (part, colorHex) => createPresetMaterial(materialOptions, `mat:${part.id}`, part.materialPreset, colorHex),
        materials: hooks,
        now: this.now(),
      });
    }
    return this.loadPackage(source.plan, materialOptions, hooks);
  }

  /** 소스 로드 중 발견한 비치명 사항(규약 밖 메시·본 링크 없음 등, 한글) */
  sourceNotes(): readonly string[] {
    return this.rig?.notes ?? [];
  }

  /** 리그 평문 보고(파츠·메시 이름·morph 수·본 수). 소스가 없으면 null. Babylon 객체는 노출하지 않는다. */
  inspectRig(): RigInspection | null {
    return this.rig ? inspectRig(this.rig) : null;
  }

  private async loadPackage(plan: AuthoredPackagePlan, materialOptions: MaterialFactoryOptions, hooks: RigMaterialHooks): Promise<CharacterRig> {
    const bytes = await (this.deps.fetchBytes ?? fetchBytesDefault)(plan.glbUrl);
    if (this.deps.verifyPackageSha ?? true) {
      const digest = await sha256Hex(bytes);
      if (digest !== plan.glbSha256) {
        throw failVisible("package-sha-mismatch", `제작 패키지 GLB의 SHA-256이 플랜과 다릅니다(${digest.slice(0, 8)}… ≠ ${plan.glbSha256.slice(0, 8)}…). 파일이 바뀌었거나 손상됐습니다.`, undefined, this.now());
      }
    }
    return loadPackageRig(plan, bytes, {
      scene: this.character.scene,
      adaptMaterial: (role, mesh) => adaptLoadedMaterial(materialOptions, mesh.material, role, `mat:${mesh.name}`).material,
      materials: hooks,
      now: this.now(),
    });
  }

  private unloadRig(): void {
    const rig = this.rig;
    if (!rig) return;
    this.rig = null;
    this.lastPlan = null;
    this.physics.bindRig(null);
    this.character.clearShadowCasters();
    // 패스 재질이 참조하는 텍스처는 공유(white·clear·SDF·알베도·페인트)이므로 재질만 해제한다(forceDisposeTextures=false).
    for (const material of this.flatMaterials.values()) material.dispose(true, false);
    for (const material of this.idMaterials.values()) material.dispose(true, false);
    this.flatMaterials.clear();
    this.idMaterials.clear();
    rig.dispose();
  }

  // ---------------------------------------------------------------- 플랜·셰이딩·카메라

  applyPlan(plan: ApplyPlan): ApplyReceipt {
    this.assertAlive();
    const rig = this.requireRig("apply-plan-no-source", "플랜을 적용할 캐릭터 소스가 없습니다. loadSource 뒤에 호출하세요.");
    const receipt = applyRigPlan(rig, plan, { outlinesVisible: this.outlinesVisible() });
    this.lastPlan = plan;
    this.refreshToonUniforms(rig);
    return receipt;
  }

  setShading(profile: ShadingProfile): void {
    this.assertAlive();
    this.shading = profile;
    this.applyShadingToScene();
    this.applyMaterialsForMode(this.rig);
  }

  setCamera(framing: CameraFraming): void {
    this.assertAlive();
    this.framing = framing;
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const bounds = this.rig ? computeRigBounds(this.rig) : null;
    this.character.applyFraming(this.character.camera, framing, bounds, height > 0 ? width / height : 1);
  }

  currentFraming(): CameraFraming {
    return this.framing;
  }

  currentShading(): ShadingProfile {
    return this.shading;
  }

  private applyShadingToScene(): void {
    const profile = this.shading;
    this.character.setToneMapping(profile.toneMapping);
    this.character.applyShadowProfile(profile.shadows);
    this.postfx.apply(profile.postfx);
    this.character.scene.environmentIntensity = profile.ibl.enabled ? profile.ibl.intensity : 0;
  }

  private outlinesVisible(): boolean {
    return this.shading.mode === "toon" && this.shading.toon.outline === "hull";
  }

  /** 모드(PBR/툰)에 맞춰 파츠 재질·외곽선·outline 셸 가시성을 바꾼다. */
  private applyMaterialsForMode(rig: CharacterRig | null): void {
    if (!rig) return;
    const toon = this.shading.mode === "toon";
    const outline = toon ? this.shading.toon.outline : "none";
    for (const part of rig.parts) {
      const material = toon ? this.ensureToonMaterial(part, rig) : part.pbr;
      for (const mesh of part.meshes) {
        mesh.material = material;
        mesh.renderOutline = outline === "hull";
        if (outline === "hull") {
          mesh.outlineWidth = TOON_OUTLINE_WIDTH;
          mesh.outlineColor.set(0.05, 0.04, 0.06);
        }
        if (outline === "edge") {
          mesh.enableEdgesRendering(TOON_EDGE_EPSILON);
          mesh.edgesWidth = 1.5;
          mesh.edgesColor.set(0.05, 0.04, 0.06, 1);
        } else if (mesh.edgesRenderer) {
          mesh.disableEdgesRendering();
        }
      }
      setRigPartVisible(part, part.visible, this.outlinesVisible());
    }
  }

  private ensureToonMaterial(part: RigPart, rig: CharacterRig): ShaderMaterial {
    if (!part.toon) {
      part.toon = createPassMaterial({ scene: this.character.scene, language: shaderLanguageFor(this.engine) }, "toon", `toon:${part.id}`);
      part.toon.backFaceCulling = part.pbr.backFaceCulling;
    }
    setToonUniforms(part.toon, this.toonValues(part, rig));
    setToonTextures(part.toon, { albedo: this.albedoTexture(part), paint: this.paintTextures.get(part.role) ?? this.clearTexture, sdf: this.sdfTexture });
    return part.toon;
  }

  private refreshToonUniforms(rig: CharacterRig | null): void {
    if (!rig || this.shading.mode !== "toon") return;
    for (const part of rig.parts) if (part.toon) setToonUniforms(part.toon, this.toonValues(part, rig));
  }

  private albedoTexture(part: RigPart): BaseTexture {
    return part.hasAlbedoTexture && part.pbr.albedoTexture ? part.pbr.albedoTexture : this.whiteTexture;
  }

  /** 머리 본의 rest 대비 회전으로 얼굴 forward(+Z)·right(+X)를 구한다(패키지의 비항등 rest도 동일). */
  private headAxes(rig: CharacterRig | null): { readonly forward: Vec3; readonly right: Vec3 } {
    const head = rig?.humanoid.get("head");
    if (!head) return { forward: [0, 0, 1], right: [1, 0, 0] };
    const delta = qMultiply(rigBoneWorld(head).rotation, qConjugate(head.restWorld));
    return { forward: qRotateVec3(delta, [0, 0, 1]), right: qRotateVec3(delta, [1, 0, 0]) };
  }

  private toonValues(part: RigPart, rig: CharacterRig | null): ToonUniformValues {
    const toon = this.shading.toon;
    const ibl = this.shading.ibl;
    const key = this.character.keyLight;
    const lightScale = Math.min(1, key.intensity / 2.4);
    const ambientScale = (ibl.enabled ? ibl.intensity : 0) * 0.5 + this.character.fillLight.intensity * 0.5;
    const average = this.ibl.averageColor;
    const axes = this.headAxes(rig);
    const face = faceSdfUniforms(axes.forward, axes.right, this.character.sunDirection);
    const useFaceSdf = toon.faceSdfShadow && part.role === "head";
    return {
      baseColor: srgb(part.colorHex),
      shadeTint: toonShadeTint(part.role),
      lightColor: [key.diffuse.r * lightScale, key.diffuse.g * lightScale, key.diffuse.b * lightScale],
      ambientColor: [Math.min(1, average[0] * ambientScale), Math.min(1, average[1] * ambientScale), Math.min(1, average[2] * ambientScale)],
      toLight: this.character.sunDirection,
      rimColor: [0.35, 0.35, 0.4],
      rampSteps: toon.rampSteps,
      rim: toon.rim,
      faceSdf: useFaceSdf,
      hasPaint: this.paintTextures.get(part.role) !== null,
      faceThreshold: face.threshold,
      flipU: face.flipU,
      sdfOffset: 0,
      hasAlbedo: part.hasAlbedoTexture,
    };
  }

  private materialOptions(): MaterialFactoryOptions {
    return { scene: this.character.scene, sssAvailable: this.character.sssAvailable };
  }

  /**
   * 리그 재질 훅. `rigOf`는 훅이 호출될 때의 리그를 돌려준다(주 리그는 `this.rig`, 임시 리그는 자기 자신 — 툰 얼굴 SDF 축이 리그별이다).
   * `trackFlatPass`가 true면(주 리그만) 색 변경을 밑색 패스 재질 캐시에도 반영한다. 임시 리그는 패스 재질 캐시(partId 키)를
   * 공유하면 주 리그와 충돌하므로 건드리지 않는다.
   */
  private materialHooks(rigOf: () => CharacterRig | null, trackFlatPass: boolean): RigMaterialHooks {
    const options = this.materialOptions();
    return {
      applyPreset: (part, preset) => {
        applyPresetParams(options, part.pbr, preset, part.hasAlbedoTexture ? null : part.colorHex);
        if (part.toon) {
          part.toon.backFaceCulling = part.pbr.backFaceCulling;
          setToonUniforms(part.toon, this.toonValues(part, rigOf()));
        }
      },
      applyColor: (part, hex) => {
        if (!part.hasAlbedoTexture) setMaterialAlbedo(part.pbr, part.materialPreset, hex);
        if (part.toon) setToonUniforms(part.toon, this.toonValues(part, rigOf()));
        if (!trackFlatPass) return;
        const flat = this.flatMaterials.get(part.partId);
        if (flat) setFlatUniforms(flat, { baseColor: srgb(hex), hasPaint: this.paintTextures.get(part.role) !== null, hasAlbedo: part.hasAlbedoTexture });
      },
    };
  }

  // ---------------------------------------------------------------- 물리

  async setPhysicsProvider(id: PhysicsProviderId): Promise<PhysicsStatus> {
    this.assertAlive();
    return this.physics.setProvider(id);
  }

  settle(maxSteps: number): Promise<SettleReceipt> {
    this.assertAlive();
    return this.physics.settle(maxSteps);
  }

  /** 결정성 영수증(provider가 포트를 주면). poseHash는 호출자(export)가 레시피에서 만든다. */
  physicsReceipt(poseHash: string): Promise<PhysicsReceiptLike | null> {
    return this.physics.receipt(poseHash);
  }

  /** 월드 변환이 없어 비활성인 충돌 캡슐 본(진단) */
  pendingColliderBones(): readonly string[] {
    return this.physics.pendingColliderBones();
  }

  // ---------------------------------------------------------------- 캡처

  /**
   * 캡처 계열 작업을 직렬화한다: 캡처 카메라·RTT·(현재 리그의 일시 플랜 적용)을 공유하므로 겹치면 서로의 프레이밍·플랜을 오염시킨다.
   * 앞선 작업이 실패해도 다음 작업은 실행된다.
   */
  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.captureChain.then(task);
    this.captureChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async renderThumbnail(req: ThumbnailRequest): Promise<CapturedRaster> {
    this.assertAlive();
    return this.runExclusive(() => (req.source ? this.renderTemporaryThumbnail(req, req.source) : this.renderCurrentThumbnail(req)));
  }

  /**
   * 현재 리그에 플랜을 일시 적용해 그리고 정확히 되돌린다(스냅샷 복원: 마지막 플랜 유무와 무관).
   * 적용·렌더·readPixels 호출·복원은 한 번의 동기 구간이라(capture.ts `around`) readback을 기다리는 동안 뷰포트는 원래 상태를 그린다.
   */
  private async renderCurrentThumbnail(req: ThumbnailRequest): Promise<CapturedRaster> {
    this.assertAlive();
    const rig = this.requireRig("thumbnail-no-source", "썸네일을 그릴 캐릭터 소스가 없습니다.");
    const snapshot = snapshotRig(rig);
    let applied = false;
    const restore = (): void => {
      if (!applied || this.disposed) return;
      applied = false;
      restoreRig(rig, snapshot, { outlinesVisible: this.outlinesVisible() });
      this.refreshToonUniforms(rig);
    };
    return captureThumbnail(this.captureDeps(rig), req.size, req.framing, {
      before: () => {
        applied = true;
        applyRigPlan(rig, req.plan, { outlinesVisible: this.outlinesVisible() });
        this.refreshToonUniforms(rig);
      },
      after: restore,
    });
  }

  /**
   * 지오메트리 프리셋 카드: `req.source`로 **임시 리그**를 만들어 `req.plan`을 적용해 그린 뒤 해제한다. 주 리그·마지막 플랜·
   * 그림자 캐스터·물리 바인딩은 건드리지 않는다. 임시 메시는 전용 레이어 마스크로 메인 카메라에서 숨기고 그림자를 받지 않는다
   * (주 리그의 그림자 맵이 섞이지 않도록 그림자 맵 갱신도 하지 않는다).
   */
  private async renderTemporaryThumbnail(req: ThumbnailRequest, source: CharacterSource): Promise<CapturedRaster> {
    this.assertAlive();
    const holder: { rig: CharacterRig | null } = { rig: null };
    try {
      try {
        holder.rig = await this.buildRig(source, this.materialHooks(() => holder.rig, false));
      } catch (error) {
        return toFailure(error, "thumbnail-source-failed", "썸네일용 임시 소스를 만들지 못했습니다.", this.now());
      }
      const rig = holder.rig;
      this.assertAlive();
      this.isolateTemporaryRig(rig);
      this.applyMaterialsForMode(rig);
      applyRigPlan(rig, req.plan, { outlinesVisible: this.outlinesVisible() });
      this.refreshToonUniforms(rig);
      return await captureThumbnail({ ...this.captureDeps(rig), shadow: null }, req.size, req.framing);
    } finally {
      // 엔진이 해제됐으면 scene.dispose가 모든 객체를 정리했으므로 다시 해제하지 않는다.
      if (holder.rig && !this.disposed) holder.rig.dispose();
    }
  }

  /** 임시 리그 메시를 메인 카메라에서 숨기고(레이어 마스크) 그림자를 받지 않게 한다. */
  private isolateTemporaryRig(rig: CharacterRig): void {
    for (const part of rig.parts) {
      for (const mesh of [...part.meshes, ...part.outlineMeshes]) {
        mesh.layerMask = THUMBNAIL_LAYER_MASK;
        mesh.receiveShadows = false;
      }
    }
  }

  async renderPasses(req: CaptureRequest): Promise<CaptureResult> {
    this.assertAlive();
    return this.runExclusive(async () => {
      this.assertAlive();
      const rig = this.requireRig("capture-no-source", "캡처할 캐릭터 소스가 없습니다.");
      if (req.settleSteps > 0) await this.physics.settle(req.settleSteps);
      return capturePasses(this.captureDeps(rig), req, req.camera ?? this.framing);
    });
  }

  private captureDeps(rig: CharacterRig): CaptureDeps {
    return {
      scene: this.character.scene,
      character: this.character,
      lane: this.lane,
      rig,
      passMaterials: this.passMaterials(),
      shadow: this.character.shadow,
      includeOutlines: this.outlinesVisible(),
      waitForShaders: this.deps.awaitShaderCompile ?? this.lane !== "null",
      provenance: { physicsProvider: this.physics.currentId(), settleSteps: 0, recipeDigest: this.planDigest() },
      now: this.now(),
    };
  }

  /** 마지막 플랜의 결정적 digest(없으면 "no-plan"). 레시피 digest는 export 측이 레시피에서 만든다. */
  planDigest(): string {
    const plan = this.lastPlan;
    if (!plan) return "no-plan";
    return `plan-${plan.revision}-${fnv1a64Hex(stableStringify({ morphWeights: plan.morphWeights, boneRotations: plan.boneRotations, parts: plan.parts, colors: plan.colors }))}`;
  }

  private passMaterials(): PassMaterialSet {
    const deps = { scene: this.character.scene, language: shaderLanguageFor(this.engine) };
    return {
      flat: (part) => {
        let material = this.flatMaterials.get(part.partId);
        if (!material) {
          material = createPassMaterial(deps, "flat", `flat:${part.id}`);
          this.flatMaterials.set(part.partId, material);
        }
        material.backFaceCulling = part.pbr.backFaceCulling;
        setFlatUniforms(material, { baseColor: srgb(part.colorHex), hasPaint: this.paintTextures.get(part.role) !== null, hasAlbedo: part.hasAlbedoTexture });
        setFlatTextures(material, { albedo: this.albedoTexture(part), paint: this.paintTextures.get(part.role) ?? this.clearTexture });
        return material;
      },
      id: (part) => {
        let material = this.idMaterials.get(part.partId);
        if (!material) {
          material = createPassMaterial(deps, "id", `id:${part.id}`);
          this.idMaterials.set(part.partId, material);
        }
        material.backFaceCulling = part.pbr.backFaceCulling;
        setIdUniform(material, part.partId, part.materialId);
        return material;
      },
      normal: () => {
        this.normalMaterial ??= createPassMaterial(deps, "normal", "pass:normal");
        return this.normalMaterial;
      },
      depth: (near, far) => {
        this.depthMaterial ??= createPassMaterial(deps, "depth", "pass:depth");
        setDepthUniform(this.depthMaterial, near, far);
        return this.depthMaterial;
      },
    };
  }

  // ---------------------------------------------------------------- 피킹·핸들·페인트

  pick(ndcX: number, ndcY: number): PickHit | null {
    if (this.disposed || !this.rig) return null;
    return pickRig(this.character.scene, this.character.camera, this.rig, ndcX, ndcY);
  }

  jointHandles(): readonly JointDragHandle[] {
    const rig = this.rig;
    if (this.disposed || !rig) return [];
    const camera = this.character.camera;
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const viewProjection = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
    const viewport = new Viewport(0, 0, width, height);
    const handles: JointDragHandle[] = [];
    for (const [bone, rb] of rig.humanoid) {
      const world = rigBoneWorld(rb).position;
      const projected = Vector3.Project(toVector3(world), Matrix.IdentityReadOnly, viewProjection, viewport);
      handles.push({ bone, screen: [projected.x, projected.y], world });
    }
    return handles;
  }

  viewportCamera(): ViewportCameraInfo {
    const camera = this.character.camera;
    // 위치는 구면 좌표에서 직접 계산한다(ArcRotateCamera의 globalPosition은 다음 렌더 전까지 이전 값일 수 있다).
    const target = fromVector3(camera.target);
    const sinBeta = Math.sin(camera.beta);
    const position: Vec3 = [
      target[0] + camera.radius * Math.cos(camera.alpha) * sinBeta,
      target[1] + camera.radius * Math.cos(camera.beta),
      target[2] + camera.radius * Math.sin(camera.alpha) * sinBeta,
    ];
    const direction = v3Sub(target, position);
    const forward: Vec3 = v3Length(direction) < 1e-9 ? [0, 0, -1] : v3Normalize(direction);
    // 우수 좌표 카메라 기저: right = forward × worldUp (forward가 world up과 평행이면 +X로 대체), up = right × forward
    const crossUp = v3Cross(forward, [0, 1, 0]);
    const right: Vec3 = v3Length(crossUp) < 1e-6 ? [1, 0, 0] : v3Normalize(crossUp);
    const up: Vec3 = v3Cross(right, forward);
    return { position, forward, right, up, fovY: camera.fov, width: this.engine.getRenderWidth(), height: this.engine.getRenderHeight() };
  }

  /** 관절 드래그·IK용 포즈 프레임 스켈레톤(휴머노이드 이름, 포즈 규약별 rest). 본이 없으면 null. */
  poseSkeleton(): SkeletonData | null {
    return this.rig ? rigPoseSkeleton(this.rig) : null;
  }

  /** 본의 현재 월드 변환·로컬 회전(진단·테스트). 이름은 소스 이름 또는 휴머노이드 이름. */
  readBone(name: string): BoneReading | null {
    const rig = this.rig;
    if (!rig) return null;
    const rb = rig.bones.get(name) ?? (isHumanoidBoneName(name) ? rig.humanoid.get(name) : undefined);
    if (!rb) return null;
    const world = rigBoneWorld(rb);
    return { name: rb.name, humanoid: rb.humanoid, position: world.position, rotation: world.rotation, localRotation: fromQuaternion(rb.node.rotationQuaternion), auxiliary: rb.auxiliary };
  }

  /** 부위별 페인트 텍스처 점검(크기·revision·invertY·decal 연결). 텍스처가 없으면 빈 배열. */
  inspectPaint(): readonly PaintInspection[] {
    const rig = this.rig;
    return this.paintTextures.describe().map((info) => {
      const texture = this.paintTextures.get(info.part);
      const parts = rig ? rig.parts.filter((part) => part.role === info.part) : [];
      const decalMeshes = parts.reduce((sum, part) => sum + part.meshes.filter((mesh) => texture !== null && mesh.decalMap?.texture === texture).length, 0);
      return { ...info, decalMeshes, decalEnabled: parts.length > 0 && parts.every((part) => part.pbr.decalMap?.isEnabled === true) };
    });
  }

  /** 장면 설정 평문 보고(우수 좌표·clear 알파·톤맵·광원·그림자 생성기 등). Babylon 객체는 노출하지 않는다. */
  inspectScene(): SceneInspection {
    return inspectCharacterScene(this.character);
  }

  updatePaintTexture(layer: PaintLayer): void {
    this.assertAlive();
    const texture = this.paintTextures.upload(layer);
    const rig = this.rig;
    if (!rig) return;
    this.bindPaint(rig, layer.part, texture);
  }

  /** 새 리그에 기존 페인트 텍스처(부위별)를 다시 붙인다(소스 재로드·device lost 복원). */
  private reattachPaint(rig: CharacterRig): void {
    const roles = new Set<PartRole>(rig.parts.map((part) => part.role));
    for (const role of roles) {
      const texture = this.paintTextures.get(role);
      if (texture) this.bindPaint(rig, role, texture);
    }
  }

  private bindPaint(rig: CharacterRig, role: PartRole, texture: RawTexture): void {
    for (const part of rig.parts) {
      if (part.role !== role) continue;
      for (const mesh of part.meshes) attachDecalToMesh(this.character.scene, mesh, texture);
      // PBR decalMap 플러그인 getter가 지연 생성하므로 런타임에는 null이 아니다(타입만 Nullable).
      const decal = part.pbr.decalMap;
      if (decal) decal.isEnabled = true;
      if (part.toon) {
        setToonTextures(part.toon, { albedo: this.albedoTexture(part), paint: texture, sdf: this.sdfTexture });
        setToonUniforms(part.toon, this.toonValues(part, rig));
      }
      const flat = this.flatMaterials.get(part.partId);
      if (flat) setFlatTextures(flat, { albedo: this.albedoTexture(part), paint: texture });
    }
  }

  // ---------------------------------------------------------------- export·HUD·크기

  async exportGlb(): Promise<Uint8Array> {
    this.assertAlive();
    const rig = this.requireRig("glb-no-source", "GLB로 내보낼 캐릭터 소스가 없습니다.");
    return exportRigGlb(this.character.scene, rig, "character", this.now());
  }

  readHud(): HudSample {
    const scene = this.character.scene;
    const adapter = this.diagnostics.adapter;
    const adapterLabel = this.lane === "null" ? "NullEngine" : [adapter?.vendor, adapter?.device ?? adapter?.description].filter((value): value is string => Boolean(value)).join(" ") || (this.diagnostics.renderer ?? "어댑터 정보 없음");
    return {
      frameMs: this.frameStats.last(),
      frameMsP95: this.frameStats.p95(),
      gpuFrameMs: this.hud.gpuFrameMs(),
      drawCalls: this.hud.drawCalls(),
      activeMeshes: scene.getActiveMeshes().length,
      triangles: Math.floor(scene.getActiveIndices() / 3),
      backend: this.backend,
      adapterLabel,
      physicsProvider: this.physics.currentId(),
      shadingMode: this.shading.mode,
    };
  }

  sceneFeatures(): SceneFeatureReport {
    const post = this.postfx.states();
    const rig = this.rig;
    const morphManagers = rig ? rig.parts.flatMap((part) => part.meshes.map((mesh) => mesh.morphTargetManager).filter((manager) => manager !== null)) : [];
    const morphTexture = morphManagers.length === 0 ? featureOff(rig ? "morph 타깃이 있는 파츠가 없습니다." : "소스가 없습니다.") : morphManagers.every((manager) => manager.isUsingTextureForTargets) ? featureActive(`${morphManagers.length}개 매니저`) : featureUnavailable("엔진이 morph 텍스처 저장을 지원하지 않아 attribute 모드(동시 타깃 수 제한)로 동작합니다.");
    const boneTexture = !rig?.skeleton ? featureOff(rig ? "스켈레톤이 없습니다." : "소스가 없습니다.") : rig.skeleton.isUsingTextureForMatrices ? featureActive(`${rig.skeleton.bones.length}본`) : featureUnavailable("엔진이 본 행렬 텍스처를 지원하지 않아 uniform 배열 모드로 동작합니다.");
    return createFeatureReport({
      cascadedShadows: this.character.shadowState(),
      subsurfaceScattering: this.character.sssState(),
      imageBasedLighting: this.shading.ibl.enabled ? this.ibl.state : featureOff("프로파일에서 IBL을 껐습니다."),
      taa: post.taa,
      ssao: post.ssao,
      msaa: post.msaa,
      gpuTimer: this.hud.gpuTimerState(),
      morphTextureMode: morphTexture,
      boneTextureMode: boneTexture,
    });
  }

  resize(width: number, height: number): void {
    if (this.disposed) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    this.engine.setSize(w, h);
    this.setCamera(this.framing);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.loopRunning) this.engine.stopRenderLoop();
    this.unloadRig();
    this.normalMaterial?.dispose(true, false);
    this.depthMaterial?.dispose(true, false);
    this.paintTextures.dispose();
    this.whiteTexture.dispose();
    this.clearTexture.dispose();
    this.sdfTexture.dispose();
    this.postfx.dispose();
    this.hud.dispose();
    this.physics.dispose();
    this.ibl.dispose();
    this.character.dispose();
    if (this.deps.disposeEngine) this.deps.disposeEngine();
    else this.engine.dispose();
  }

  // ---------------------------------------------------------------- 내부

  private assertAlive(): void {
    if (this.disposed) throw failVisible("engine-disposed", "이미 해제된 엔진입니다. 엔진을 다시 선택하세요.", undefined, this.now());
  }

  private requireRig(code: string, reasonKo: string): CharacterRig {
    if (!this.rig) throw failVisible(code, reasonKo, undefined, this.now());
    return this.rig;
  }
}
