// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { poseLimitViolations } from "../../../animation/joint-limits";
import { findHandPosePreset, findPosePreset } from "../../../animation/presets";
import { createReferenceSkeleton } from "../../../animation/reference-skeleton";
import { computeWorldTransforms } from "../../../animation/skeleton-fk";
import { ALL_AVAILABLE_CAPABILITIES, createDefaultRecipe } from "../../../contracts";
import { degToRad, qFromAxisAngle, v3Distance } from "../../../shared/math";
import { MockLabProvider } from "../../../testing/mock-store";

import { PosePanel, describeIkOutcome, ikEndPosition, ikStatusTone, parseCoords } from "./PosePanel";

import type { CharacterRecipe, LabCommand, SlotCapabilityMap } from "../../../contracts";

afterEach(cleanup);

const skeleton = createReferenceSkeleton();

function setup(options: { recipe?: CharacterRecipe; capabilities?: SlotCapabilityMap } = {}): LabCommand[] {
  const dispatched: LabCommand[] = [];
  render(
    <MockLabProvider initialState={{ capabilities: options.capabilities ?? ALL_AVAILABLE_CAPABILITIES, ...(options.recipe ? { recipe: options.recipe } : {}) }} dispatchSpy={(command) => dispatched.push(command)}>
      <PosePanel />
    </MockLabProvider>,
  );
  return dispatched;
}

function card(group: string, name: string): HTMLButtonElement {
  return within(screen.getByRole("group", { name: group })).getByRole("button", { name: new RegExp(`^${name}`, "u") });
}

function setTarget(x: string, y: string, z: string): void {
  fireEvent.change(screen.getByLabelText("목표 X"), { target: { value: x } });
  fireEvent.change(screen.getByLabelText("목표 Y"), { target: { value: y } });
  fireEvent.change(screen.getByLabelText("목표 Z"), { target: { value: z } });
}

describe("PosePanel 프리셋", () => {
  it("포즈 10·손 포즈 8 카드를 보여주고 전신 범위 카드 클릭은 slot/apply 1회", () => {
    const dispatched = setup();
    const poses = within(screen.getByRole("group", { name: "포즈 프리셋" })).getAllByRole("button");
    expect(poses).toHaveLength(10);
    expect(within(screen.getByRole("group", { name: "손 포즈 프리셋" })).getAllByRole("button")).toHaveLength(8);
    expect(card("포즈 프리셋", "A 포즈").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card("포즈 프리셋", "서기"));
    expect(dispatched).toEqual([{ type: "slot/apply", slot: "pose", presetId: "pose/idle" }]);
  });

  it("범위를 상체로 바꾸면 카드 클릭이 pose/set(스코프 병합)이 되고 선택 표시가 꺼진다", () => {
    const dispatched = setup();
    fireEvent.click(screen.getByLabelText("상체"));
    expect(card("포즈 프리셋", "A 포즈").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(card("포즈 프리셋", "손 흔들기"));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({ type: "pose/set", pose: findPosePreset("wave").pose, scope: "upper", labelKo: "포즈 손 흔들기 (상체)" });
    fireEvent.click(screen.getByLabelText("하체"));
    fireEvent.click(card("포즈 프리셋", "앉기"));
    expect(dispatched[1]).toMatchObject({ type: "pose/set", scope: "lower" });
  });

  it("손 포즈: 양손은 slot/apply, 왼손/오른손은 hand-pose/set", () => {
    const dispatched = setup();
    fireEvent.click(card("손 포즈 프리셋", "주먹"));
    expect(dispatched[0]).toEqual({ type: "slot/apply", slot: "hand-pose", presetId: "hand-pose/fist" });
    fireEvent.click(screen.getByLabelText("왼손"));
    fireEvent.click(card("손 포즈 프리셋", "브이"));
    expect(dispatched[1]).toEqual({ type: "hand-pose/set", side: "left", presetId: "hand-pose/peace" });
    fireEvent.click(screen.getByLabelText("오른손"));
    fireEvent.click(card("손 포즈 프리셋", "엄지 척"));
    expect(dispatched[2]).toEqual({ type: "hand-pose/set", side: "right", presetId: findHandPosePreset("thumbs-up").id });
    expect(card("손 포즈 프리셋", "편안한 손").getAttribute("aria-pressed")).toBe("true");
  });

  it("미지원 슬롯은 카드가 disabled이고 사유를 보여주며 클릭해도 dispatch하지 않는다", () => {
    const reason = "제작 패키지에 휴머노이드 본이 없습니다.";
    const dispatched = setup({ capabilities: { ...ALL_AVAILABLE_CAPABILITIES, pose: { status: "unavailable", reasonKo: reason }, "hand-pose": { status: "partial", reasonKo: "손가락 본 일부 없음" } } });
    const idle = card("포즈 프리셋", "서기");
    expect(idle.disabled).toBe(true);
    expect(idle.title).toBe(reason);
    fireEvent.click(idle);
    expect(screen.getByText(new RegExp(reason, "u"))).toBeTruthy();
    expect(screen.getByText(/손가락 본 일부 없음/u)).toBeTruthy();
    expect(card("손 포즈 프리셋", "주먹").disabled).toBe(false);
    expect((screen.getByRole("button", { name: "IK 적용" }) as HTMLButtonElement).disabled).toBe(true);
    expect(dispatched).toEqual([]);
  });
});

describe("PosePanel IK", () => {
  it("도달 가능한 왼손 목표는 pose/set(전신)으로 기록되고 FK 말단이 목표와 일치하며 '도달'을 표시한다", () => {
    const dispatched = setup();
    setTarget("0.35", "1.1", "0.3");
    fireEvent.click(screen.getByRole("button", { name: "IK 적용" }));
    expect(dispatched).toHaveLength(1);
    const command = dispatched[0];
    expect(command?.type).toBe("pose/set");
    if (command?.type !== "pose/set") return;
    expect(command.scope).toBe("full");
    expect(command.labelKo).toBe("IK 왼손 → (0.35, 1.10, 0.30)");
    const hand = computeWorldTransforms(skeleton, command.pose).get("leftHand")?.position ?? [0, 0, 0];
    expect(v3Distance(hand, [0.35, 1.1, 0.3])).toBeLessThanOrEqual(1e-4);
    expect(poseLimitViolations(command.pose, skeleton)).toEqual([]);
    const status = screen.getByText(/왼손 목표 도달 \(오차 0\.0 mm\)/u);
    expect(status.getAttribute("data-status")).toBe("reached");
  });

  it("폴 벡터를 지정하면 팔꿈치가 폴 쪽으로 가고, 좌표가 비수치면 dispatch 없이 사유를 보여준다", () => {
    const dispatched = setup();
    setTarget("0.3", "1.2", "0.25");
    fireEvent.click(screen.getByLabelText(/폴 벡터 지정/u));
    fireEvent.change(screen.getByLabelText("폴 X"), { target: { value: "0.3" } });
    fireEvent.change(screen.getByLabelText("폴 Y"), { target: { value: "0.6" } });
    fireEvent.change(screen.getByLabelText("폴 Z"), { target: { value: "0.1" } });
    fireEvent.click(screen.getByRole("button", { name: "IK 적용" }));
    const down = dispatched[0];
    if (down?.type !== "pose/set") throw new Error("pose/set 기대");
    const elbowDown = computeWorldTransforms(skeleton, down.pose).get("leftLowerArm")?.position ?? [0, 0, 0];
    fireEvent.change(screen.getByLabelText("폴 Y"), { target: { value: "1.9" } });
    fireEvent.click(screen.getByRole("button", { name: "IK 적용" }));
    const up = dispatched[1];
    if (up?.type !== "pose/set") throw new Error("pose/set 기대");
    const elbowUp = computeWorldTransforms(skeleton, up.pose).get("leftLowerArm")?.position ?? [0, 0, 0];
    expect(elbowUp[1]).toBeGreaterThan(elbowDown[1]);

    fireEvent.change(screen.getByLabelText("폴 Z"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "IK 적용" }));
    expect(dispatched).toHaveLength(2);
    expect(screen.getByText("폴 벡터 좌표가 숫자가 아닙니다.").getAttribute("data-status")).toBeNull();
    fireEvent.change(screen.getByLabelText("목표 X"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "IK 적용" }));
    expect(dispatched).toHaveLength(2);
    expect(screen.getByText("목표 좌표가 숫자가 아닙니다.")).toBeTruthy();
  });

  it("도달 불가 목표는 최대 신장 포즈를 기록하고 사유를 표시한다", () => {
    const dispatched = setup();
    fireEvent.change(screen.getByLabelText("부위"), { target: { value: "rightLeg" } });
    setTarget("-2", "-2", "2");
    fireEvent.click(screen.getByRole("button", { name: "IK 적용" }));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({ type: "pose/set", scope: "full", labelKo: "IK 오른발 → (-2.00, -2.00, 2.00)" });
    expect(screen.getByText(/오른발 목표 미도달\(max-reach\): 목표가 체인 최대 신장/u).getAttribute("data-status")).toBe("unreachable");
  });

  it("머리(척추 체인) 목표는 FABRIK으로 풀어 머리 위치를 맞춘다", () => {
    const dispatched = setup();
    fireEvent.change(screen.getByLabelText("부위"), { target: { value: "head" } });
    expect(screen.queryByLabelText(/폴 벡터 지정/u)).toBeNull();
    const rest = ikEndPosition({}, "head");
    expect(screen.getByLabelText("목표 Y")).toHaveProperty("value", rest[1].toFixed(3));
    const target = [rest[0] + 0.02, rest[1] - 0.04, rest[2] + 0.14] as const;
    setTarget(target[0].toFixed(3), target[1].toFixed(3), target[2].toFixed(3));
    fireEvent.click(screen.getByRole("button", { name: "IK 적용" }));
    const command = dispatched[0];
    if (command?.type !== "pose/set") throw new Error("pose/set 기대");
    const head = computeWorldTransforms(skeleton, command.pose).get("head")?.position ?? [0, 0, 0];
    expect(v3Distance(head, target)).toBeLessThanOrEqual(2e-3);
    expect(screen.getByText(/머리\(척추 체인\) 목표 (도달|미도달)/u)).toBeTruthy();
  });

  it("'현재 위치 읽기'는 현재 레시피 포즈의 말단 위치를 입력에 채운다", () => {
    const recipe = createDefaultRecipe();
    recipe.pose = { leftUpperArm: qFromAxisAngle([0, 0, 1], degToRad(-60)) };
    setup({ recipe });
    setTarget("9", "9", "9");
    fireEvent.click(screen.getByRole("button", { name: "현재 위치 읽기" }));
    const expected = ikEndPosition(recipe.pose, "leftArm");
    expect(screen.getByLabelText("목표 X")).toHaveProperty("value", expected[0].toFixed(3));
    expect(screen.getByLabelText("목표 Y")).toHaveProperty("value", expected[1].toFixed(3));
    expect(expected[1]).toBeLessThan(1.2);
  });
});

describe("PosePanel 관절 제한·초기화", () => {
  it("초기화는 빈 포즈 전신 pose/set, 클램프는 위반이 있을 때만 활성이며 결과는 제한 안이다", () => {
    const spy = vi.fn();
    const recipe = createDefaultRecipe();
    recipe.pose = { leftUpperArm: qFromAxisAngle([0, 0, 1], degToRad(-170)), head: qFromAxisAngle([0, 1, 0], degToRad(20)) };
    render(
      <MockLabProvider initialState={{ capabilities: ALL_AVAILABLE_CAPABILITIES, recipe }} dispatchSpy={spy}>
        <PosePanel />
      </MockLabProvider>,
    );
    expect(screen.getByText(/포즈 본 2개 · 관절 제한 위반 1건: leftUpperArm/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "관절 제한으로 클램프" }));
    expect(spy).toHaveBeenCalledTimes(1);
    const command = spy.mock.calls[0]?.[0] as LabCommand;
    if (command.type !== "pose/set") throw new Error("pose/set 기대");
    expect(command.scope).toBe("full");
    expect(poseLimitViolations(command.pose, skeleton)).toEqual([]);
    expect(command.pose.head).toEqual(recipe.pose.head);
    fireEvent.click(screen.getByRole("button", { name: "포즈 초기화" }));
    expect(spy).toHaveBeenLastCalledWith({ type: "pose/set", pose: {}, scope: "full", labelKo: "포즈 초기화(rest)" });
  });

  it("rest 포즈에서는 클램프 버튼이 비활성이다", () => {
    setup();
    expect((screen.getByRole("button", { name: "관절 제한으로 클램프" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/포즈 본 0개 · 관절 제한 위반 0건/u)).toBeTruthy();
  });
});

describe("PosePanel 헬퍼", () => {
  it("parseCoords는 빈 칸·비수치를 null로, describeIkOutcome은 도달/미도달 문장을 만든다", () => {
    expect(parseCoords({ x: "1", y: "-0.5", z: "2e-1" })).toEqual([1, -0.5, 0.2]);
    expect(parseCoords({ x: "", y: "0", z: "0" })).toBeNull();
    expect(parseCoords({ x: "x", y: "0", z: "0" })).toBeNull();
    expect(describeIkOutcome("왼손", { reached: true, error: 0.00004, status: "reached" })).toBe("왼손 목표 도달 (오차 0.0 mm)");
    expect(describeIkOutcome("왼발", { reached: false, error: 0.0123, status: "clamped", reasonKo: "관절 제한" })).toBe("왼발 목표 미도달(clamped): 관절 제한 · 오차 12.3 mm");
    expect(ikStatusTone({ reached: true, error: 0, status: "reached" })).toBe("reached");
    expect(ikStatusTone({ reached: false, error: 0.01, status: "clamped" })).toBe("clamped");
    for (const status of ["max-reach", "min-fold", "limited", "unconverged", "degenerate"]) {
      expect(ikStatusTone({ reached: false, error: 0.1, status })).toBe("unreachable");
    }
  });
});
