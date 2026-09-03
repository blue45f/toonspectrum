import type { StudioMannequinJointId } from "./studio-mannequin-model";

export type StudioMannequinSemanticPartId =
  | "head"
  | "torso"
  | "left-arm"
  | "right-arm"
  | "left-leg"
  | "right-leg";

export interface StudioMannequinSemanticPartDefinition {
  readonly id: StudioMannequinSemanticPartId;
  readonly label: string;
  readonly rgb: readonly [number, number, number];
}

/** Saturated, distant ID colours survive the display-output pass and AA blending robustly. */
export const STUDIO_MANNEQUIN_SEMANTIC_PARTS: readonly StudioMannequinSemanticPartDefinition[] =
  Object.freeze([
    { id: "head", label: "머리·목", rgb: [255, 24, 24] },
    { id: "torso", label: "몸통", rgb: [24, 255, 24] },
    { id: "left-arm", label: "왼팔", rgb: [24, 64, 255] },
    { id: "right-arm", label: "오른팔", rgb: [255, 232, 24] },
    { id: "left-leg", label: "왼다리", rgb: [255, 24, 232] },
    { id: "right-leg", label: "오른다리", rgb: [24, 232, 255] },
  ]);

const JOINT_TO_SEMANTIC_PART: Readonly<Record<StudioMannequinJointId, StudioMannequinSemanticPartId>> =
  Object.freeze({
    pelvis: "torso",
    spine: "torso",
    chest: "torso",
    neck: "head",
    head: "head",
    leftShoulder: "left-arm",
    leftUpperArm: "left-arm",
    leftLowerArm: "left-arm",
    leftHand: "left-arm",
    rightShoulder: "right-arm",
    rightUpperArm: "right-arm",
    rightLowerArm: "right-arm",
    rightHand: "right-arm",
    leftUpperLeg: "left-leg",
    leftLowerLeg: "left-leg",
    leftFoot: "left-leg",
    rightUpperLeg: "right-leg",
    rightLowerLeg: "right-leg",
    rightFoot: "right-leg",
  });

export interface StudioMannequinSemanticRgbaLayer {
  readonly id: StudioMannequinSemanticPartId;
  readonly name: string;
  readonly data: Uint8ClampedArray;
  readonly visiblePixelCount: number;
}

export interface PartitionStudioMannequinSemanticLayersInput {
  readonly width: number;
  readonly height: number;
  readonly composite: Uint8ClampedArray;
  readonly idPass: Uint8ClampedArray;
}

export function getStudioMannequinSemanticPartForJoint(
  jointId: StudioMannequinJointId,
): StudioMannequinSemanticPartId {
  return JOINT_TO_SEMANTIC_PART[jointId];
}

function assertCaptureBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  label: string,
): void {
  if (!(data instanceof Uint8ClampedArray) || data.byteLength !== width * height * 4) {
    throw new TypeError(`${label} RGBA 크기가 의미 레이어 캔버스와 일치하지 않습니다.`);
  }
}

function nearestPartIndex(red: number, green: number, blue: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < STUDIO_MANNEQUIN_SEMANTIC_PARTS.length; index += 1) {
    const [targetRed, targetGreen, targetBlue] = STUDIO_MANNEQUIN_SEMANTIC_PARTS[index]!.rgb;
    const deltaRed = red - targetRed;
    const deltaGreen = green - targetGreen;
    const deltaBlue = blue - targetBlue;
    const distance = deltaRed * deltaRed + deltaGreen * deltaGreen + deltaBlue * deltaBlue;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/**
 * Partitions the visible composite by an ID pass rendered with all body parts present. Because the
 * ID pass uses the same camera/depth test, hidden surfaces never leak into exported PSD layers.
 * Every visible composite pixel is assigned to at most one semantic layer.
 */
export function partitionStudioMannequinSemanticLayers(
  input: PartitionStudioMannequinSemanticLayersInput,
): readonly StudioMannequinSemanticRgbaLayer[] {
  const { width, height, composite, idPass } = input;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError("의미 레이어 캡처 크기가 올바르지 않습니다.");
  }
  assertCaptureBuffer(composite, width, height, "전체 렌더");
  assertCaptureBuffer(idPass, width, height, "ID 패스");

  const layers = STUDIO_MANNEQUIN_SEMANTIC_PARTS.map((part) => ({
    id: part.id,
    name: part.label,
    data: new Uint8ClampedArray(composite.length),
    visiblePixelCount: 0,
  }));

  for (let offset = 0; offset < composite.length; offset += 4) {
    const compositeAlpha = composite[offset + 3]!;
    const idAlpha = idPass[offset + 3]!;
    if (compositeAlpha < 2 || idAlpha < 2) continue;
    const layerIndex = nearestPartIndex(
      idPass[offset]!,
      idPass[offset + 1]!,
      idPass[offset + 2]!,
    );
    const layer = layers[layerIndex]!;
    layer.data[offset] = composite[offset]!;
    layer.data[offset + 1] = composite[offset + 1]!;
    layer.data[offset + 2] = composite[offset + 2]!;
    layer.data[offset + 3] = compositeAlpha;
    layer.visiblePixelCount += 1;
  }

  return Object.freeze(layers.map((layer) => Object.freeze(layer)));
}
