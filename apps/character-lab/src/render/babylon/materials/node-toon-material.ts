/**
 * NodeMaterial 툰(베타): 기본 경로(`shader-sources.ts`의 GLSL·WGSL ShaderMaterial)와 **같은 `ToonParams` 의미**의 툰 셰이딩을
 * Babylon NodeMaterial 블록 그래프로 코드에서 구성한다(NME 에디터·JSON 없음). 정점 단계는 인스턴스 → 스키닝(BonesBlock) →
 * morph(MorphTargetsBlock, 텍스처 모드 포함) → 월드·뷰프로젝션 변환이고, 프래그먼트 단계는 `render/toon-reference.ts`(CPU 기준)와 같은 식이다:
 * 알베도(밑색 × 알베도 텍스처 + 페인트) → 얼굴 SDF 또는 램버트 음영 → 램프(smoothstep 항 최대 3개, fwidth 안티에일리어싱)
 * → shadeTint↔albedo 혼합 × 광원색 + 환경색 + 림.
 *
 * 입력 이름(= uniform 이름)은 `NODE_TOON_INPUTS`이고 `setNodeToonParams`가 `ToonParams`를 그대로 값으로 넣는다. 텍스처 3장(알베도·페인트·SDF)은
 * `setNodeToonTextures`가 TextureBlock에 꽂는다. 외곽선은 재질과 무관한 `mesh.renderOutline`·EdgesRenderer가 그대로 담당한다.
 *
 * 이 모듈은 NodeMaterial 블록 수십 개를 정적으로 import하므로 엔진 본체가 **동적 import**로만 불러온다(베타를 켤 때만 청크 로드).
 * NullEngine에서는 그래프 구성·`build()`(GLSL/WGSL 문자열 생성)·그래프 해석 일치까지만 검증한다 — 셰이더 컴파일·렌더 결과는 브라우저 미검증이다.
 */
import { AddBlock } from "@babylonjs/core/Materials/Node/Blocks/addBlock.js";
import { DivideBlock } from "@babylonjs/core/Materials/Node/Blocks/divideBlock.js";
import { DotBlock } from "@babylonjs/core/Materials/Node/Blocks/dotBlock.js";
import { TextureBlock } from "@babylonjs/core/Materials/Node/Blocks/Dual/textureBlock.js";
import { DerivativeBlock } from "@babylonjs/core/Materials/Node/Blocks/Fragment/derivativeBlock.js";
import { FragmentOutputBlock } from "@babylonjs/core/Materials/Node/Blocks/Fragment/fragmentOutputBlock.js";
import { InputBlock } from "@babylonjs/core/Materials/Node/Blocks/Input/inputBlock.js";
import { LerpBlock } from "@babylonjs/core/Materials/Node/Blocks/lerpBlock.js";
import { MaxBlock } from "@babylonjs/core/Materials/Node/Blocks/maxBlock.js";
import { MultiplyBlock } from "@babylonjs/core/Materials/Node/Blocks/multiplyBlock.js";
import { NormalizeBlock } from "@babylonjs/core/Materials/Node/Blocks/normalizeBlock.js";
import { OneMinusBlock } from "@babylonjs/core/Materials/Node/Blocks/oneMinusBlock.js";
import { PowBlock } from "@babylonjs/core/Materials/Node/Blocks/powBlock.js";
import { SmoothStepBlock } from "@babylonjs/core/Materials/Node/Blocks/smoothStepBlock.js";
import { StepBlock } from "@babylonjs/core/Materials/Node/Blocks/stepBlock.js";
import { SubtractBlock } from "@babylonjs/core/Materials/Node/Blocks/subtractBlock.js";
import { TransformBlock } from "@babylonjs/core/Materials/Node/Blocks/transformBlock.js";
import { TrigonometryBlock, TrigonometryBlockOperations } from "@babylonjs/core/Materials/Node/Blocks/trigonometryBlock.js";
import { VectorMergerBlock } from "@babylonjs/core/Materials/Node/Blocks/vectorMergerBlock.js";
import { VectorSplitterBlock } from "@babylonjs/core/Materials/Node/Blocks/vectorSplitterBlock.js";
import { BonesBlock } from "@babylonjs/core/Materials/Node/Blocks/Vertex/bonesBlock.js";
import { InstancesBlock } from "@babylonjs/core/Materials/Node/Blocks/Vertex/instancesBlock.js";
import { MorphTargetsBlock } from "@babylonjs/core/Materials/Node/Blocks/Vertex/morphTargetsBlock.js";
import { VertexOutputBlock } from "@babylonjs/core/Materials/Node/Blocks/Vertex/vertexOutputBlock.js";
import { NodeMaterialBlockConnectionPointTypes } from "@babylonjs/core/Materials/Node/Enums/nodeMaterialBlockConnectionPointTypes.js";
import { NodeMaterialBlockTargets } from "@babylonjs/core/Materials/Node/Enums/nodeMaterialBlockTargets.js";
import { NodeMaterialSystemValues } from "@babylonjs/core/Materials/Node/Enums/nodeMaterialSystemValues.js";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { TOON_BAND_EPSILON, TOON_FACE_DARK_SHADE, TOON_FACE_LIT_SHADE, TOON_FRESNEL_POWER, TOON_MAX_BOUNDARIES, TOON_RIM_EDGE0, TOON_RIM_EDGE1 } from "../../toon-reference";

import type { ToonParams } from "../../toon-reference";
import type { NodeMaterialBlock } from "@babylonjs/core/Materials/Node/nodeMaterialBlock.js";
import type { NodeMaterialConnectionPoint } from "@babylonjs/core/Materials/Node/nodeMaterialBlockConnectionPoint.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 값을 매 프레임 갱신하는 uniform 입력 이름(= `ToonParams` 필드) */
export const NODE_TOON_INPUTS = ["baseColor", "shadeTint", "lightColor", "ambientColor", "toLight", "rimColor", "rampSteps", "rimFlag", "faceSdfFlag", "hasPaintFlag", "faceThreshold", "flipUFlag", "sdfOffset", "hasAlbedoFlag"] as const;
export type NodeToonInputName = (typeof NODE_TOON_INPUTS)[number];

/** 텍스처 블록 이름 */
export const NODE_TOON_TEXTURE_BLOCKS = ["albedoTexture", "paintTexture", "sdfTexture"] as const;

export interface NodeToonTextures {
  readonly albedo: BaseTexture;
  readonly paint: BaseTexture;
  readonly sdf: BaseTexture;
}

export interface NodeToon {
  readonly material: NodeMaterial;
  readonly language: ShaderLanguage;
  /** 그래프의 블록 수(보고·테스트용) */
  readonly blockCount: number;
  /**
   * 그래프 빌드(GLSL/WGSL 코드 생성) 완료. 정점 블록(스키닝·morph)이 셰이더 include를 비동기로 불러오므로 `build()`는 바로 끝나지 않는다.
   * 빌드 오류(블록 연결·include 누락)는 이 Promise가 한글 사유와 함께 reject한다 — 완료 전에 메시에 꽂지 않는다.
   */
  readonly ready: Promise<void>;
  setParams(params: ToonParams): void;
  setTextures(textures: NodeToonTextures): void;
  dispose(): void;
}

type Point = NodeMaterialConnectionPoint;
const T = NodeMaterialBlockConnectionPointTypes;

function connect(from: Point, to: Point): void {
  from.connectTo(to);
}

/** 그래프 구성 보조: 블록을 만들고 수집한다. */
class GraphBuilder {
  readonly blocks: NodeMaterialBlock[] = [];

  add<B extends NodeMaterialBlock>(block: B): B {
    this.blocks.push(block);
    return block;
  }

  /** 프래그먼트 상수 */
  constant(name: string, value: number): Point {
    const block = this.add(new InputBlock(name, NodeMaterialBlockTargets.Neutral, T.Float));
    block.value = value;
    block.isConstant = true;
    return block.output;
  }

  uniform(name: string, type: NodeMaterialBlockConnectionPointTypes, value: number | Color3 | Vector3): InputBlock {
    const block = this.add(new InputBlock(name, NodeMaterialBlockTargets.Fragment, type));
    block.value = value;
    return block;
  }

  attribute(name: string, attribute: string): Point {
    const block = this.add(new InputBlock(name));
    block.setAsAttribute(attribute);
    return block.output;
  }

  system(name: string, value: NodeMaterialSystemValues): Point {
    const block = this.add(new InputBlock(name));
    block.setAsSystemValue(value);
    return block.output;
  }

  binary<B extends AddBlock | SubtractBlock | MultiplyBlock | DivideBlock | MaxBlock>(block: B, left: Point, right: Point): Point {
    this.add(block);
    connect(left, block.left);
    connect(right, block.right);
    return block.output;
  }

  add2(name: string, left: Point, right: Point): Point {
    return this.binary(new AddBlock(name), left, right);
  }

  sub(name: string, left: Point, right: Point): Point {
    return this.binary(new SubtractBlock(name), left, right);
  }

  mul(name: string, left: Point, right: Point): Point {
    return this.binary(new MultiplyBlock(name), left, right);
  }

  div(name: string, left: Point, right: Point): Point {
    return this.binary(new DivideBlock(name), left, right);
  }

  max(name: string, left: Point, right: Point): Point {
    return this.binary(new MaxBlock(name), left, right);
  }

  dot(name: string, left: Point, right: Point): Point {
    const block = this.add(new DotBlock(name));
    connect(left, block.left);
    connect(right, block.right);
    return block.output;
  }

  normalize(name: string, input: Point): Point {
    const block = this.add(new NormalizeBlock(name));
    connect(input, block.input);
    return block.output;
  }

  oneMinus(name: string, input: Point): Point {
    const block = this.add(new OneMinusBlock(name));
    connect(input, block.input);
    return block.output;
  }

  abs(name: string, input: Point): Point {
    const block = this.add(new TrigonometryBlock(name));
    block.operation = TrigonometryBlockOperations.Abs;
    connect(input, block.input);
    return block.output;
  }

  pow(name: string, value: Point, power: Point): Point {
    const block = this.add(new PowBlock(name));
    connect(value, block.value);
    connect(power, block.power);
    return block.output;
  }

  /** GLSL step(edge, value) */
  step(name: string, edge: Point, value: Point): Point {
    const block = this.add(new StepBlock(name));
    connect(value, block.value);
    connect(edge, block.edge);
    return block.output;
  }

  smoothstep(name: string, edge0: Point, edge1: Point, value: Point): Point {
    const block = this.add(new SmoothStepBlock(name));
    connect(value, block.value);
    connect(edge0, block.edge0);
    connect(edge1, block.edge1);
    return block.output;
  }

  /** GLSL mix(left, right, gradient) */
  mix(name: string, left: Point, right: Point, gradient: Point): Point {
    const block = this.add(new LerpBlock(name));
    connect(left, block.left);
    connect(right, block.right);
    connect(gradient, block.gradient);
    return block.output;
  }

  texture(name: string, uv: Point): TextureBlock {
    const block = this.add(new TextureBlock(name, true));
    connect(uv, block.uv);
    return block;
  }
}

/** NodeMaterial이 쓰는 셰이더 언어(WebGPU = WGSL, 그 외 = GLSL) */
export function nodeLanguageFor(isWebGPU: boolean): ShaderLanguage {
  return isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL;
}

/**
 * 툰 NodeMaterial을 만든다. 그래프를 구성하고 `build()`를 시작하며(비동기), 완료·실패는 `ready`로 알린다. 블록 연결 오류는 구성 중 throw한다.
 * 텍스처·uniform 값은 호출자가 `setTextures`·`setParams`로 채운다.
 */
export function createNodeToon(scene: Scene, language: ShaderLanguage, name: string): NodeToon {
  const material = new NodeMaterial(name, scene, { shaderLanguage: language, emitComments: false });
  const g = new GraphBuilder();

  // ================= 정점 단계: 인스턴스 → 스키닝 → morph → 월드/뷰프로젝션
  const position = g.attribute("position", "position");
  const normal = g.attribute("normal", "normal");
  const uv = g.attribute("uv", "uv");
  const world = g.system("world", NodeMaterialSystemValues.World);
  const viewProjection = g.system("viewProjection", NodeMaterialSystemValues.ViewProjection);

  const morph = g.add(new MorphTargetsBlock("morphTargets"));
  connect(position, morph.position);
  connect(normal, morph.normal);
  connect(uv, morph.uv);

  const instances = g.add(new InstancesBlock("instances"));
  connect(g.attribute("world0", "world0"), instances.world0);
  connect(g.attribute("world1", "world1"), instances.world1);
  connect(g.attribute("world2", "world2"), instances.world2);
  connect(g.attribute("world3", "world3"), instances.world3);
  connect(world, instances.world);

  const bones = g.add(new BonesBlock("bones"));
  connect(g.attribute("matricesIndices", "matricesIndices"), bones.matricesIndices);
  connect(g.attribute("matricesWeights", "matricesWeights"), bones.matricesWeights);
  connect(g.attribute("matricesIndicesExtra", "matricesIndicesExtra"), bones.matricesIndicesExtra);
  connect(g.attribute("matricesWeightsExtra", "matricesWeightsExtra"), bones.matricesWeightsExtra);
  connect(instances.output, bones.world);

  const worldPosition = g.add(new TransformBlock("worldPosition"));
  connect(morph.positionOutput, worldPosition.vector);
  connect(bones.output, worldPosition.transform);

  const worldNormal = g.add(new TransformBlock("worldNormal"));
  worldNormal.transformAsDirection = true;
  connect(morph.normalOutput, worldNormal.vector);
  connect(bones.output, worldNormal.transform);

  const clip = g.add(new TransformBlock("clipPosition"));
  connect(worldPosition.output, clip.vector);
  connect(viewProjection, clip.transform);
  const vertexOutput = g.add(new VertexOutputBlock("vertexOutput"));
  connect(clip.output, vertexOutput.vector);

  // ================= 프래그먼트 단계(toon-reference.ts와 같은 식)
  const baseColor = g.uniform("baseColor", T.Color3, new Color3(1, 1, 1));
  const shadeTint = g.uniform("shadeTint", T.Color3, new Color3(0.7, 0.7, 0.8));
  const lightColor = g.uniform("lightColor", T.Color3, new Color3(1, 1, 1));
  const ambientColor = g.uniform("ambientColor", T.Color3, new Color3(0.2, 0.2, 0.2));
  const toLight = g.uniform("toLight", T.Vector3, new Vector3(0, 1, 0));
  const rimColor = g.uniform("rimColor", T.Color3, new Color3(0.35, 0.35, 0.4));
  const rampSteps = g.uniform("rampSteps", T.Float, 3);
  const rimFlag = g.uniform("rimFlag", T.Float, 1);
  const faceSdfFlag = g.uniform("faceSdfFlag", T.Float, 0);
  const hasPaintFlag = g.uniform("hasPaintFlag", T.Float, 0);
  const faceThreshold = g.uniform("faceThreshold", T.Float, 0.5);
  const flipUFlag = g.uniform("flipUFlag", T.Float, 0);
  const sdfOffset = g.uniform("sdfOffset", T.Float, 0);
  const hasAlbedoFlag = g.uniform("hasAlbedoFlag", T.Float, 0);

  const half = g.constant("half", 0.5);
  const one = g.constant("one", 1);
  const two = g.constant("two", 2);
  const zero = g.constant("zero", 0);

  const n = g.normalize("normalW", worldNormal.xyz);

  // 알베도: base = mix(baseColor, baseColor·albedoTex, step(0.5, hasAlbedo)), albedo = mix(base, mix(base, paint, paint.a), step(0.5, hasPaint))
  const albedoTexture = g.texture("albedoTexture", uv);
  const paintTexture = g.texture("paintTexture", uv);
  const tinted = g.mul("tintedBase", baseColor.output, albedoTexture.rgb);
  const base = g.mix("base", baseColor.output, tinted, g.step("hasAlbedoGate", half, hasAlbedoFlag.output));
  const painted = g.mix("painted", base, paintTexture.rgb, paintTexture.a);
  const albedo = g.mix("albedo", base, painted, g.step("hasPaintGate", half, hasPaintFlag.output));

  // 램버트·얼굴 SDF
  const toLightN = g.normalize("toLightN", toLight.output);
  const lambert = g.add2("lambert", g.mul("lambertHalf", g.dot("nDotL", n, toLightN), half), half);
  const uvSplit = g.add(new VectorSplitterBlock("uvSplit"));
  connect(uv, uvSplit.xyIn);
  const sdfU = g.mix("sdfU", uvSplit.x, g.oneMinus("flippedU", uvSplit.x), g.step("flipGate", half, flipUFlag.output));
  const sdfUv = g.add(new VectorMergerBlock("sdfUv"));
  connect(sdfU, sdfUv.x);
  connect(uvSplit.y, sdfUv.y);
  const sdfTexture = g.texture("sdfTexture", sdfUv.xy);
  const faceLit = g.step("faceLit", faceThreshold.output, g.add2("sdfBiased", sdfTexture.r, sdfOffset.output));
  const faceShading = g.mix("faceShading", g.constant("faceDark", TOON_FACE_DARK_SHADE), g.constant("faceBright", TOON_FACE_LIT_SHADE), faceLit);
  const shading = g.mix("shading", lambert, faceShading, g.step("faceSdfGate", half, faceSdfFlag.output));

  // 램프: Σ [j < steps] smoothstep(j/steps − w, j/steps + w, shading) / (steps − 1)
  const steps = g.max("steps", two, rampSteps.output);
  const derivative = g.add(new DerivativeBlock("shadingDerivative"));
  connect(shading, derivative.input);
  const width = g.add2("bandWidth", g.add2("fwidth", g.abs("absDx", derivative.dx), g.abs("absDy", derivative.dy)), g.constant("bandEpsilon", TOON_BAND_EPSILON));
  let acc: Point | null = null;
  for (let j = 1; j <= TOON_MAX_BOUNDARIES; j += 1) {
    const threshold = g.div(`threshold${j}`, g.constant(`boundary${j}`, j), steps);
    const lo = g.sub(`edgeLo${j}`, threshold, width);
    const hi = g.add2(`edgeHi${j}`, threshold, width);
    const smooth = g.smoothstep(`rampTerm${j}`, lo, hi, shading);
    // j < steps ⟺ steps ≥ j + ½ (steps는 정수 2..4)
    const gate = g.step(`rampGate${j}`, g.constant(`gateEdge${j}`, j + 0.5), steps);
    const term = g.mul(`rampGated${j}`, smooth, gate);
    acc = acc ? g.add2(`rampSum${j}`, acc, term) : term;
  }
  if (!acc) throw new Error("램프 항이 비어 있습니다.");
  const band = g.div("band", acc, g.sub("stepsMinusOne", steps, one));

  // 색
  const shadeColor = g.mul("shadeColor", albedo, shadeTint.output);
  const lit = g.mul("litColor", g.mix("litMix", shadeColor, albedo, band), lightColor.output);
  const ambient = g.mul("ambientTerm", albedo, ambientColor.output);

  // 림: smoothstep(0.55, 0.65, (1 − max(N·V, 0))³)·[rim]
  const cameraPosition = g.system("cameraPosition", NodeMaterialSystemValues.CameraPosition);
  const toCamera = g.normalize("viewDir", g.sub("toCamera", cameraPosition, worldPosition.xyz));
  const nDotV = g.max("nDotV", g.dot("nDotVRaw", n, toCamera), zero);
  const fresnel = g.pow("fresnel", g.oneMinus("oneMinusNDotV", nDotV), g.constant("fresnelPower", TOON_FRESNEL_POWER));
  const rim = g.mul("rimAmount", g.smoothstep("rimBand", g.constant("rimEdge0", TOON_RIM_EDGE0), g.constant("rimEdge1", TOON_RIM_EDGE1), fresnel), g.step("rimGate", half, rimFlag.output));
  const rimLight = g.mul("rimLight", rimColor.output, rim);

  const color = g.add2("finalColor", g.add2("litPlusAmbient", lit, ambient), rimLight);
  const fragmentOutput = g.add(new FragmentOutputBlock("fragmentOutput"));
  connect(color, fragmentOutput.rgb);

  material.addOutputNode(vertexOutput);
  material.addOutputNode(fragmentOutput);
  material.backFaceCulling = true;
  const ready = new Promise<void>((resolve, reject) => {
    material.onBuildObservable.addOnce(() => resolve());
    material.onBuildErrorObservable.addOnce((message) => reject(new Error(message)));
  });
  material.build(false);

  const inputs = new Map<NodeToonInputName, InputBlock>([
    ["baseColor", baseColor],
    ["shadeTint", shadeTint],
    ["lightColor", lightColor],
    ["ambientColor", ambientColor],
    ["toLight", toLight],
    ["rimColor", rimColor],
    ["rampSteps", rampSteps],
    ["rimFlag", rimFlag],
    ["faceSdfFlag", faceSdfFlag],
    ["hasPaintFlag", hasPaintFlag],
    ["faceThreshold", faceThreshold],
    ["flipUFlag", flipUFlag],
    ["sdfOffset", sdfOffset],
    ["hasAlbedoFlag", hasAlbedoFlag],
  ]);
  const textureBlocks = { albedo: albedoTexture, paint: paintTexture, sdf: sdfTexture };

  const setInput = (inputName: NodeToonInputName, value: number | Color3 | Vector3): void => {
    const block = inputs.get(inputName);
    if (!block) throw new Error(`NodeMaterial 툰 입력 ${inputName}이 없습니다.`);
    block.value = value;
  };
  const asTexture = (texture: BaseTexture, label: string): Texture => {
    if (!(texture instanceof Texture)) throw new Error(`NodeMaterial 툰 ${label} 텍스처는 2D Texture여야 합니다(${texture.getClassName()}).`);
    return texture;
  };

  return {
    material,
    language,
    blockCount: g.blocks.length,
    ready,
    setParams(params) {
      setInput("baseColor", new Color3(...params.baseColor));
      setInput("shadeTint", new Color3(...params.shadeTint));
      setInput("lightColor", new Color3(...params.lightColor));
      setInput("ambientColor", new Color3(...params.ambientColor));
      setInput("toLight", new Vector3(...params.toLight));
      setInput("rimColor", new Color3(...params.rimColor));
      setInput("rampSteps", params.rampSteps);
      setInput("rimFlag", params.rim ? 1 : 0);
      setInput("faceSdfFlag", params.faceSdf ? 1 : 0);
      setInput("hasPaintFlag", params.hasPaint ? 1 : 0);
      setInput("faceThreshold", params.faceThreshold);
      setInput("flipUFlag", params.flipU);
      setInput("sdfOffset", params.sdfOffset);
      setInput("hasAlbedoFlag", params.hasAlbedo ? 1 : 0);
    },
    setTextures(textures) {
      textureBlocks.albedo.texture = asTexture(textures.albedo, "알베도");
      textureBlocks.paint.texture = asTexture(textures.paint, "페인트");
      textureBlocks.sdf.texture = asTexture(textures.sdf, "SDF");
    },
    dispose() {
      // 텍스처는 엔진이 소유하므로 함께 해제하지 않는다(forceDisposeTextures=false).
      material.dispose(true, false);
    },
  };
}
