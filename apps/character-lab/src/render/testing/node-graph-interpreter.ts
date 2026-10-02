/**
 * NodeMaterial 블록 그래프 해석기(테스트 보조). NullEngine은 셰이더를 컴파일·실행하지 못하므로, 코드로 구성한 툰 그래프의 **연결 구조**를
 * CPU에서 직접 계산해 `toon-reference.ts`(기준 구현)와 수치로 비교한다. GLSL·WGSL 코드 생성(`build()`)은 별도로 확인한다.
 *
 * 지원 블록은 툰 그래프가 쓰는 것뿐이다(Add·Subtract·Multiply·Divide·Max·Dot·Normalize·OneMinus·Trigonometry(Abs)·Pow·Step·SmoothStep·Lerp·
 * VectorSplitter·VectorMerger·Input·Texture·Derivative·Transform). 모르는 블록을 만나면 throw한다(조용히 0으로 두지 않는다).
 * 정점 단계(BonesBlock·MorphTargetsBlock 등)는 해석하지 않는다 — `Transform` 블록은 호출자가 월드 위치·법선을 주입한다.
 *
 * 이 해석기가 검증하는 것: 블록 연결(어느 값이 어느 입력에 들어가는지)·상수·uniform 입력 이름·`setParams` 값 매핑.
 * 검증하지 못하는 것: 블록 코드 생성의 정밀도, 실제 GPU 컴파일, `derivative` 대체값이 아닌 실제 화면 미분.
 */
import { TrigonometryBlockOperations } from "@babylonjs/core/Materials/Node/Blocks/trigonometryBlock.js";
import { NodeMaterialSystemValues } from "@babylonjs/core/Materials/Node/Enums/nodeMaterialSystemValues.js";

import type { NodeMaterialBlock } from "@babylonjs/core/Materials/Node/nodeMaterialBlock.js";
import type { NodeMaterialConnectionPoint } from "@babylonjs/core/Materials/Node/nodeMaterialBlockConnectionPoint.js";

export type GraphValue = number | readonly number[];

/** 해석 입력(프래그먼트 하나) */
export interface GraphContext {
  readonly uv: readonly [number, number];
  readonly cameraPosition: readonly [number, number, number];
  /** `Transform` 블록 이름 → 값 */
  readonly transforms: Readonly<Record<string, readonly [number, number, number]>>;
  /** 텍스처 블록 이름 → 샘플러(uv → RGBA) */
  readonly samplers: Readonly<Record<string, (u: number, v: number) => readonly [number, number, number, number]>>;
  /** `Derivative` 블록의 (dx, dy) 대체값을 입력 값에서 만든다 */
  readonly derivative: (input: number) => { readonly dx: number; readonly dy: number };
}

/** 블록 클래스·입력 접근에 필요한 최소 표면(Babylon 블록의 구조적 부분) */
interface InputValueBlock {
  readonly isConstant: boolean;
  readonly isAttribute: boolean;
  readonly isSystemValue: boolean;
  readonly systemValue: NodeMaterialSystemValues | null;
  readonly value: unknown;
  /** `setAsAttribute(attribute)`가 블록 이름을 attribute 이름으로 바꾼다 */
  readonly name: string;
}

interface WithPoints {
  readonly [key: string]: unknown;
}

function vec(value: GraphValue): readonly number[] {
  return typeof value === "number" ? [value] : value;
}

function pack(values: readonly number[]): GraphValue {
  return values.length === 1 ? (values[0] as number) : values;
}

/** 성분별 이항 연산(스칼라는 벡터로 퍼뜨린다) */
function zip(a: GraphValue, b: GraphValue, op: (x: number, y: number) => number): GraphValue {
  const left = vec(a);
  const right = vec(b);
  const length = Math.max(left.length, right.length);
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) out.push(op(left[left.length === 1 ? 0 : i] as number, right[right.length === 1 ? 0 : i] as number));
  return pack(out);
}

function map(a: GraphValue, op: (x: number) => number): GraphValue {
  return pack(vec(a).map(op));
}

function inputValue(block: InputValueBlock, context: GraphContext): GraphValue {
  if (block.isAttribute) {
    if (block.name === "uv") return context.uv;
    throw new Error(`해석기가 모르는 attribute입니다: ${block.name}`);
  }
  if (block.isSystemValue) {
    if (block.systemValue === NodeMaterialSystemValues.CameraPosition) return context.cameraPosition;
    throw new Error(`해석기가 모르는 시스템 값입니다: ${block.name}`);
  }
  const value = block.value as { r?: number; g?: number; b?: number; x?: number; y?: number; z?: number } | number | null;
  if (typeof value === "number") return value;
  if (value && typeof value.r === "number") return [value.r, value.g ?? 0, value.b ?? 0];
  if (value && typeof value.x === "number") return [value.x, value.y ?? 0, value.z ?? 0];
  throw new Error(`입력 블록 ${block.name}의 값을 읽을 수 없습니다.`);
}

/** 연결된 출력 지점의 값을 계산한다 */
export function evaluateGraph(output: NodeMaterialConnectionPoint, context: GraphContext): GraphValue {
  const memo = new Map<NodeMaterialConnectionPoint, GraphValue>();

  const input = (block: NodeMaterialBlock, name: string): GraphValue => {
    const point = (block as unknown as WithPoints)[name] as NodeMaterialConnectionPoint | undefined;
    if (!point) throw new Error(`${block.name}.${name} 입력이 없습니다.`);
    const connected = point.connectedPoint;
    if (!connected) throw new Error(`${block.name}.${name} 입력이 연결되지 않았습니다.`);
    return evaluate(connected);
  };

  const evaluate = (point: NodeMaterialConnectionPoint): GraphValue => {
    const cached = memo.get(point);
    if (cached !== undefined) return cached;
    const block = point.ownerBlock;
    const kind = block.getClassName();
    let result: GraphValue;
    switch (kind) {
      case "InputBlock":
        result = inputValue(block as unknown as InputValueBlock, context);
        break;
      case "AddBlock":
        result = zip(input(block, "left"), input(block, "right"), (x, y) => x + y);
        break;
      case "SubtractBlock":
        result = zip(input(block, "left"), input(block, "right"), (x, y) => x - y);
        break;
      case "MultiplyBlock":
        result = zip(input(block, "left"), input(block, "right"), (x, y) => x * y);
        break;
      case "DivideBlock":
        result = zip(input(block, "left"), input(block, "right"), (x, y) => x / y);
        break;
      case "MaxBlock":
        result = zip(input(block, "left"), input(block, "right"), Math.max);
        break;
      case "DotBlock": {
        const a = vec(input(block, "left"));
        const b = vec(input(block, "right"));
        result = a.reduce((sum, value, i) => sum + value * (b[i] as number), 0);
        break;
      }
      case "NormalizeBlock": {
        const v = vec(input(block, "input"));
        const length = Math.hypot(...v);
        result = pack(v.map((component) => component / length));
        break;
      }
      case "OneMinusBlock":
        result = map(input(block, "input"), (x) => 1 - x);
        break;
      case "TrigonometryBlock": {
        const operation = (block as unknown as { operation: TrigonometryBlockOperations }).operation;
        if (operation !== TrigonometryBlockOperations.Abs) throw new Error(`해석기는 Abs 외의 삼각 연산을 모릅니다(${String(operation)}).`);
        result = map(input(block, "input"), Math.abs);
        break;
      }
      case "PowBlock":
        result = zip(input(block, "value"), input(block, "power"), Math.pow);
        break;
      case "StepBlock":
        // GLSL step(edge, x): x < edge ? 0 : 1
        result = zip(input(block, "edge"), input(block, "value"), (edge, x) => (x < edge ? 0 : 1));
        break;
      case "SmoothStepBlock": {
        const x = input(block, "value");
        const e0 = input(block, "edge0");
        const e1 = input(block, "edge1");
        result = pack(
          vec(x).map((value, i) => {
            const a = vec(e0)[vec(e0).length === 1 ? 0 : i] as number;
            const b = vec(e1)[vec(e1).length === 1 ? 0 : i] as number;
            const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
            return t * t * (3 - 2 * t);
          }),
        );
        break;
      }
      case "LerpBlock": {
        const left = input(block, "left");
        const right = input(block, "right");
        const gradient = input(block, "gradient");
        result = zip(zip(left, right, (l, r) => r - l), gradient, (delta, g) => delta * g);
        result = zip(result, left, (scaled, l) => l + scaled);
        break;
      }
      case "VectorSplitterBlock": {
        const source = (["xyIn", "xyzIn", "xyzwIn"] as const).find((name) => ((block as unknown as WithPoints)[name] as NodeMaterialConnectionPoint | undefined)?.isConnected === true);
        if (!source) throw new Error("VectorSplitter 입력이 연결되지 않았습니다.");
        const v = vec(input(block, source));
        const index = { x: 0, y: 1, z: 2, w: 3 }[point.name as "x" | "y" | "z" | "w"];
        if (index === undefined) throw new Error(`VectorSplitter 출력 ${point.name}을 해석하지 못합니다.`);
        result = v[index] as number;
        break;
      }
      case "VectorMergerBlock": {
        const x = input(block, "x") as number;
        const y = input(block, "y") as number;
        if (point.name !== "xy" && point.name !== "xyOut") throw new Error(`VectorMerger 출력 ${point.name}을 해석하지 못합니다.`);
        result = [x, y];
        break;
      }
      case "TextureBlock": {
        const sampler = context.samplers[block.name];
        if (!sampler) throw new Error(`텍스처 블록 ${block.name}의 샘플러가 없습니다.`);
        const uv = vec(input(block, "uv"));
        const texel = sampler(uv[0] as number, uv[1] as number);
        if (point.name === "rgb") result = [texel[0], texel[1], texel[2]];
        else if (point.name === "r") result = texel[0];
        else if (point.name === "a") result = texel[3];
        else throw new Error(`텍스처 출력 ${point.name}을 해석하지 못합니다.`);
        break;
      }
      case "DerivativeBlock": {
        const d = context.derivative(input(block, "input") as number);
        if (point.name === "dx") result = d.dx;
        else if (point.name === "dy") result = d.dy;
        else throw new Error(`Derivative 출력 ${point.name}을 해석하지 못합니다.`);
        break;
      }
      case "TransformBlock": {
        const injected = context.transforms[block.name];
        if (!injected) throw new Error(`Transform 블록 ${block.name}의 값이 주입되지 않았습니다.`);
        result = injected;
        break;
      }
      default:
        throw new Error(`해석기가 모르는 블록입니다: ${kind}(${block.name})`);
    }
    memo.set(point, result);
    return result;
  };

  return evaluate(output);
}
