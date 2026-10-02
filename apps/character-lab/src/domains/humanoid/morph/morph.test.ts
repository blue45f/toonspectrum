import { describe, expect, it } from "vitest";

import { ALL_FACS_MORPH_NAMES, BODY_PARAM_KEYS, FACE_PARAM_KEYS, FACS_UNITS, allParamMorphNames, paramMorphName } from "../../../contracts";
import { buildBodyCage } from "../geometry/cage";
import { buildEyeball, eyeCenter } from "../geometry/eye-builder";
import { buildHeadCage } from "../geometry/head-cage";
import { buildTeeth, buildTongue } from "../geometry/mouth-builder";
import { mirrorMapX } from "../geometry/quad-mesh";
import { buildSubdivisionPlan, liftAttribute } from "../geometry/subdivision";
import { triMeshBounds } from "../geometry/tri-mesh";
import { HEAD_LANDMARKS, headLocalToWorld } from "../proportions";

import { buildBodyMorphs, headAttachedBodyDelta } from "./body-morphs";
import { FACE_PARAM_FIELDS, FACS_FIELDS } from "./face-fields";
import { buildFaceParamDeltas, evaluateFaceField } from "./face-morphs";
import { buildFacsMorphs } from "./facs-morphs";
import { isNegligibleDelta, isOppositeDelta, maxAbs, mirrorSymmetryError } from "./morph-utils";

const bodyCage = buildBodyCage({});
const headCage = buildHeadCage({});
const bodyPlan = buildSubdivisionPlan(bodyCage.mesh, 1);
const headPlan = buildSubdivisionPlan(headCage.mesh, 1);
const headPositions = liftAttribute(headPlan, headCage.mesh.positions, 3);
const bodyPositions = liftAttribute(bodyPlan, bodyCage.mesh.positions, 3);
const headMirror = mirrorMapX(headPositions, 1e-5);
const bodyMirror = mirrorMapX(bodyPositions, 1e-5);
const frame = headCage.frame;

describe("체형 morph(body-morphs)", () => {
  const set = buildBodyMorphs({ baseParams: {}, bodyCage, headCage, bodyPlan, headPlan });

  it("이름이 contracts 규약과 일치하고 18개다", () => {
    expect(set.targets.map((t) => t.name)).toEqual([...allParamMorphNames(BODY_PARAM_KEYS)]);
    expect(set.targets).toHaveLength(18);
  });

  it("모든 체형 델타가 비영이고 좌우 대칭이며 +/−가 반대 방향(선형 구간)이다", () => {
    for (const key of BODY_PARAM_KEYS) {
      const plus = set.targets.find((t) => t.key === key && t.sign === "+");
      const minus = set.targets.find((t) => t.key === key && t.sign === "-");
      expect(plus && minus).toBeTruthy();
      if (!plus || !minus) continue;
      // headSize는 머리 케이지만 움직이고 몸 케이지는 그대로이므로 몸·머리 중 하나라도 비영이면 된다
      expect(isNegligibleDelta(plus.bodyDelta) && isNegligibleDelta(plus.headDelta)).toBe(false);
      expect(mirrorSymmetryError(plus.bodyDelta, bodyMirror)).toBeLessThan(1e-4);
      expect(mirrorSymmetryError(plus.headDelta, headMirror)).toBeLessThan(1e-4);
      // 비례는 파라미터에 선형이므로 ± 델타는 정확히 반대다
      expect(isOppositeDelta(plus.bodyDelta, minus.bodyDelta, 1e-5)).toBe(true);
      expect(isOppositeDelta(plus.headDelta, minus.headDelta, 1e-5)).toBe(true);
    }
  });

  it("팔 길이 +1은 손목·손가락 관절을 바깥으로 옮기고 키 +1은 머리 본을 올린다", () => {
    const arm = set.jointOffsets.armLength.plus;
    expect(arm.leftHand?.[0]).toBeGreaterThan(0.01);
    expect(arm.rightHand?.[0]).toBeLessThan(-0.01);
    expect(set.jointOffsets.armLength.minus.leftHand?.[0]).toBeLessThan(-0.01);
    expect(set.jointOffsets.height.plus.hips?.[1]).toBeGreaterThan(0);
    expect(set.jointOffsets.neckLength.plus.head?.[1]).toBeGreaterThan(0);
    expect(set.jointOffsets.shoulderWidth.plus.leftUpperArm?.[0]).toBeGreaterThan(0);
    // 허리 파라미터는 관절을 옮기지 않는다
    expect(Object.keys(set.jointOffsets.waist.plus)).toHaveLength(0);
  });

  it("머리 크기 +1 델타는 머리 프레임 유사 변환과 일치하고 몸 델타는 목 위에서만 비영이다", () => {
    const target = set.targets.find((t) => t.key === "headSize" && t.sign === "+");
    expect(target).toBeTruthy();
    if (!target) return;
    const predicted = headAttachedBodyDelta(headPositions, frame, target.headFrame);
    for (let i = 0; i < predicted.length; i += 1) expect(Math.abs(predicted[i] - target.headDelta[i])).toBeLessThan(1e-5);
    const eyeball = buildEyeball(frame, "left", "almond");
    const eyeDelta = headAttachedBodyDelta(eyeball.positions, frame, target.headFrame);
    expect(maxAbs(eyeDelta)).toBeGreaterThan(0);
    // 몸 케이지는 headSize에 영향받지 않는다(머리는 별도 케이지)
    expect(isNegligibleDelta(target.bodyDelta, 1e-7)).toBe(true);
  });
});

describe("얼굴 파라미터 morph(face-morphs)", () => {
  const deltas = buildFaceParamDeltas(headPositions, frame, "surface");

  it("30개 이름이 규약과 같고 각 델타가 비영·대칭이며 ±가 반대다", () => {
    expect(deltas.map((d) => d.name)).toEqual([...allParamMorphNames(FACE_PARAM_KEYS)]);
    for (const key of FACE_PARAM_KEYS) {
      const plus = deltas.find((d) => d.name === paramMorphName(key, "+"));
      const minus = deltas.find((d) => d.name === paramMorphName(key, "-"));
      expect(plus && minus).toBeTruthy();
      if (!plus || !minus) continue;
      expect(isNegligibleDelta(plus.deltaPositions)).toBe(false);
      expect(mirrorSymmetryError(plus.deltaPositions, headMirror)).toBeLessThan(1e-4);
      expect(isOppositeDelta(plus.deltaPositions, minus.deltaPositions)).toBe(true);
    }
  });

  it("파라미터 0(기준)에서는 델타가 적용되지 않고 마스크 밖(뒤통수)은 0이다", () => {
    const back = headLocalToWorld(frame, [0, 0.2, -0.95]);
    for (const key of ["eyeSize", "noseDepth", "mouthWidth", "chinLength", "lipFullness"] as const) {
      const d = evaluateFaceField(FACE_PARAM_FIELDS[key], new Float32Array(back), frame, "surface");
      expect(maxAbs(d)).toBeLessThan(1e-4);
    }
  });

  it("코 깊이 +는 코끝을 앞으로, 턱 길이 +는 턱을 아래로, 눈 크기 +는 안구를 키운다", () => {
    const noseTip = new Float32Array(headLocalToWorld(frame, HEAD_LANDMARKS.noseTip));
    const nose = evaluateFaceField(FACE_PARAM_FIELDS.noseDepth, noseTip, frame, "surface");
    expect(nose[2]).toBeGreaterThan(0.005);
    const chin = evaluateFaceField(FACE_PARAM_FIELDS.chinLength, new Float32Array(headLocalToWorld(frame, HEAD_LANDMARKS.chin)), frame, "surface");
    expect(chin[1]).toBeLessThan(-0.005);
    const eyeball = buildEyeball(frame, "left", "almond");
    const grow = evaluateFaceField(FACE_PARAM_FIELDS.eyeSize, eyeball.positions, frame, "eye-left");
    const before = triMeshBounds(eyeball.positions);
    const moved = new Float32Array(eyeball.positions.length);
    for (let i = 0; i < moved.length; i += 1) moved[i] = eyeball.positions[i] + grow[i];
    const after = triMeshBounds(moved);
    expect(after.max[0] - after.min[0]).toBeGreaterThan((before.max[0] - before.min[0]) * 1.15);
    const spacing = evaluateFaceField(FACE_PARAM_FIELDS.eyeSpacing, new Float32Array(eyeCenter(frame, "right")), frame, "eye-right");
    expect(spacing[0]).toBeLessThan(0);
  });
});

describe("FACS morph(facs-morphs)", () => {
  const facs = buildFacsMorphs(headPositions, frame, "surface");

  it("16개 이름이 contracts와 같고 머리 표면에서 전부 비영이다", () => {
    expect(facs.map((d) => d.name)).toEqual([...ALL_FACS_MORPH_NAMES]);
    expect(facs).toHaveLength(FACS_UNITS.length);
    for (const d of facs) expect(isNegligibleDelta(d.deltaPositions)).toBe(false);
  });

  it("좌우 대칭 유닛은 거울 대칭이고 왼눈 감기는 오른쪽 정점을 움직이지 않는다", () => {
    for (const d of facs) {
      if (d.name === "facs:eyeBlinkLeft" || d.name === "facs:eyeBlinkRight") continue;
      expect(mirrorSymmetryError(d.deltaPositions, headMirror)).toBeLessThan(1e-4);
    }
    const blinkLeft = facs.find((d) => d.name === "facs:eyeBlinkLeft");
    expect(blinkLeft).toBeTruthy();
    if (!blinkLeft) return;
    for (let v = 0; v < headPositions.length / 3; v += 1) {
      if (headPositions[v * 3] < frame.center[0]) expect(Math.abs(blinkLeft.deltaPositions[v * 3 + 1])).toBe(0);
    }
    // 왼눈 감기 + 오른눈 감기 = 좌우 대칭
    const blinkRight = facs.find((d) => d.name === "facs:eyeBlinkRight");
    if (!blinkRight) return;
    const both = new Float32Array(blinkLeft.deltaPositions.length);
    for (let i = 0; i < both.length; i += 1) both[i] = blinkLeft.deltaPositions[i] + blinkRight.deltaPositions[i];
    expect(mirrorSymmetryError(both, headMirror)).toBeLessThan(1e-4);
  });

  it("턱 열림은 아랫니·혀를 내리고 윗니는 두지 않으며 혀 내밀기는 혀를 앞으로 보낸다", () => {
    const teeth = buildTeeth(frame);
    const jaw = evaluateFaceField(FACS_FIELDS.jawOpen, teeth.positions, frame, "teeth");
    let lowerMoved = 0;
    let upperMoved = 0;
    const mid = frame.center[1] + -0.42 * frame.scale;
    for (let v = 0; v < teeth.positions.length / 3; v += 1) {
      const dy = jaw[v * 3 + 1];
      if (teeth.positions[v * 3 + 1] < mid) {
        if (dy < -1e-4) lowerMoved += 1;
      } else if (Math.abs(dy) > 1e-9) upperMoved += 1;
    }
    expect(lowerMoved).toBeGreaterThan(0);
    expect(upperMoved).toBe(0);
    const tongue = buildTongue(frame);
    const out = evaluateFaceField(FACS_FIELDS.tongueOut, tongue.positions, frame, "tongue");
    expect(out[2]).toBeGreaterThan(0.01);
    const tongueJaw = evaluateFaceField(FACS_FIELDS.jawOpen, tongue.positions, frame, "tongue");
    expect(tongueJaw[1]).toBeLessThan(0);
    // 안구는 FACS에 반응하지 않는다
    const eyeball = buildEyeball(frame, "left", "almond");
    for (const unit of FACS_UNITS) expect(isNegligibleDelta(evaluateFaceField(FACS_FIELDS[unit], eyeball.positions, frame, "eye-left"))).toBe(true);
  });
});
