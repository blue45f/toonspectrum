// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  BODY_PARAM_KEYS,
  BODY_PARAM_LABELS_KO,
  FACE_PARAM_KEYS,
  FACE_PARAM_LABELS_KO,
  createDefaultRecipe,
  createPresetCatalog,
} from "../../../contracts";
import { HAIR_COLORS, IRIS_COLORS, SKIN_TONES } from "../../../domains/humanoid/palette";
import { createLabStore } from "../../../state/lab-store";
import { MockLabProvider } from "../../../testing/mock-store";

import { PARAM_POLES_KO, ParamPanel, describeParamValue, formatParam } from "./ParamPanel";

import type { CharacterRecipe, LabCommand, SlotCapabilityMap } from "../../../contracts";

afterEach(cleanup);

/** 실제 store의 병합 윈도우(250 ms)가 테스트 머신 부하에 흔들리지 않도록 호출마다 1 ms씩 늘어나는 결정적 시계를 쓴다. */
function steadyClock(): () => number {
  let tick = 1_000;
  return () => {
    tick += 1;
    return tick;
  };
}

function setup(options: { recipe?: CharacterRecipe; capabilities?: SlotCapabilityMap } = {}): LabCommand[] {
  const dispatched: LabCommand[] = [];
  render(
    <MockLabProvider initialState={{ capabilities: options.capabilities ?? ALL_AVAILABLE_CAPABILITIES, ...(options.recipe ? { recipe: options.recipe } : {}) }} dispatchSpy={(command) => dispatched.push(command)}>
      <ParamPanel />
    </MockLabProvider>,
  );
  return dispatched;
}

function recipeWith(patch: Partial<Pick<CharacterRecipe, "body" | "face" | "colors" | "source">>): CharacterRecipe {
  return { ...createDefaultRecipe(), ...patch };
}

function slider(labelKo: string): HTMLInputElement {
  return screen.getByLabelText(labelKo, { selector: "input[type=range]" }) as HTMLInputElement;
}

function numberInput(labelKo: string): HTMLInputElement {
  return screen.getByLabelText(`${labelKo} 숫자`) as HTMLInputElement;
}

describe("ParamPanel — 슬라이더·숫자 입력·리셋", () => {
  it("체형 9 + 얼굴 15 슬라이더를 한글 라벨로 보여주고 기본값은 0이다", () => {
    setup();
    const body = screen.getByRole("group", { name: "체형 파라미터" });
    const face = screen.getByRole("group", { name: "얼굴 파라미터" });
    expect(within(body).getAllByRole("slider")).toHaveLength(9);
    expect(within(face).getAllByRole("slider")).toHaveLength(15);
    for (const key of BODY_PARAM_KEYS) expect(slider(BODY_PARAM_LABELS_KO[key]).value).toBe("0");
    for (const key of FACE_PARAM_KEYS) expect(slider(FACE_PARAM_LABELS_KO[key]).value).toBe("0");
    for (const slide of screen.getAllByRole("slider")) {
      expect(slide.getAttribute("min")).toBe("-1");
      expect(slide.getAttribute("max")).toBe("1");
    }
    expect(numberInput("키").value).toBe("0.00");
  });

  it("레시피 값이 슬라이더·숫자·aria-valuetext에 반영된다", () => {
    setup({ recipe: recipeWith({ body: { height: 0.35, armLength: -0.5 }, face: { eyeSize: 1 } }) });
    expect(slider("키").value).toBe("0.35");
    expect(numberInput("키").value).toBe("0.35");
    expect(slider("키").getAttribute("aria-valuetext")).toBe("+0.35 · 크게");
    expect(slider("팔 길이").getAttribute("aria-valuetext")).toBe("-0.50 · 짧게");
    expect(slider("눈 크기").getAttribute("aria-valuetext")).toBe("+1.00 · 크게");
    expect(slider("어깨 너비").getAttribute("aria-valuetext")).toBe("0.00 · 기본");
  });

  it("모든 파라미터에 한글 양 끝 설명이 있다", () => {
    for (const key of [...BODY_PARAM_KEYS, ...FACE_PARAM_KEYS]) {
      const poles = PARAM_POLES_KO[key];
      expect(poles).toHaveLength(2);
      expect(poles[0]).toMatch(/[가-힣]/u);
      expect(poles[1]).toMatch(/[가-힣]/u);
      expect(poles[0]).not.toBe(poles[1]);
    }
  });

  it("슬라이더 변경은 param/set(group·key·value·coalesceKey) 1회를 보낸다", () => {
    const dispatched = setup();
    fireEvent.change(slider("키"), { target: { value: "0.4" } });
    fireEvent.change(slider("턱 길이"), { target: { value: "-0.25" } });
    expect(dispatched).toEqual([
      { type: "param/set", group: "body", key: "height", value: 0.4, coalesceKey: "body:height" },
      { type: "param/set", group: "face", key: "chinLength", value: -0.25, coalesceKey: "face:chinLength" },
    ]);
  });

  it("숫자 입력: 파싱되는 값은 즉시 반영하고 범위 밖은 클램프, 비었거나 숫자가 아니면 보내지 않으며 blur 시 실제 값으로 돌아온다", () => {
    const dispatched = setup({ recipe: recipeWith({ body: { waist: 0.5 } }) });
    const input = numberInput("허리");
    fireEvent.change(input, { target: { value: "0.8" } });
    expect(dispatched.at(-1)).toEqual({ type: "param/set", group: "body", key: "waist", value: 0.8, coalesceKey: "body:waist" });
    fireEvent.change(input, { target: { value: "2" } });
    expect(dispatched.at(-1)).toEqual({ type: "param/set", group: "body", key: "waist", value: 1, coalesceKey: "body:waist" });
    expect(input.value).toBe("2");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const before = dispatched.length;
    fireEvent.change(input, { target: { value: "" } });
    expect(dispatched).toHaveLength(before);
    fireEvent.blur(input);
    expect(input.value).toBe("0.50");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("행 리셋은 0이 아닐 때만 켜지고 병합 키 없이 param/set(0) 1회를 보낸다", () => {
    const dispatched = setup({ recipe: recipeWith({ face: { noseWidth: -0.6 } }) });
    expect((screen.getByRole("button", { name: "키 초기화" }) as HTMLButtonElement).disabled).toBe(true);
    const reset = screen.getByRole("button", { name: "코 너비 초기화" }) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(dispatched).toEqual([{ type: "param/set", group: "face", key: "noseWidth", value: 0 }]);
  });

  it("체형·얼굴·모두 초기화는 0이 아닌 파라미터만 같은 reset coalesceKey로 보내고 없으면 비활성이다", () => {
    const dispatched = setup({ recipe: recipeWith({ body: { height: 0.2, hip: -0.3 }, face: { eyeSize: 0.7 } }) });
    fireEvent.click(screen.getByRole("button", { name: "체형 초기화" }));
    expect(dispatched).toEqual([
      { type: "param/set", group: "body", key: "height", value: 0, coalesceKey: "reset:body" },
      { type: "param/set", group: "body", key: "hip", value: 0, coalesceKey: "reset:body" },
    ]);
    dispatched.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "얼굴 초기화" }));
    expect(dispatched).toEqual([{ type: "param/set", group: "face", key: "eyeSize", value: 0, coalesceKey: "reset:face" }]);
    dispatched.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "모두 초기화" }));
    expect(dispatched.map((command) => (command.type === "param/set" ? command.key : command.type))).toEqual(["height", "hip", "eyeSize"]);
    expect(new Set(dispatched.map((command) => (command.type === "param/set" ? command.coalesceKey : null)))).toEqual(new Set(["reset:all"]));
    cleanup();
    setup();
    for (const name of ["체형 초기화", "얼굴 초기화", "모두 초기화"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("실제 store에서 모두 초기화는 되돌리기 1단계이고 undo가 전부 복원한다", () => {
    const initial = recipeWith({ body: { height: 0.5, shoulderWidth: -0.4 }, face: { jawWidth: 0.9, earAngle: -0.2 } });
    const store = createLabStore({ catalog: createPresetCatalog([]), now: steadyClock(), initial: { recipe: initial, capabilities: ALL_AVAILABLE_CAPABILITIES } });
    render(
      <MockLabProvider store={store}>
        <ParamPanel />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "모두 초기화" }));
    expect(store.getState().recipe.body).toEqual({});
    expect(store.getState().recipe.face).toEqual({});
    expect(store.getState().history.depth).toBe(1);
    store.dispatch({ type: "history/undo" });
    expect(store.getState().recipe.body).toEqual({ height: 0.5, shoulderWidth: -0.4 });
    expect(store.getState().recipe.face).toEqual({ jawWidth: 0.9, earAngle: -0.2 });
  });

  it("실제 store에서 같은 슬라이더의 연속 변경은 1단계로 병합된다", () => {
    const store = createLabStore({ catalog: createPresetCatalog([]), now: steadyClock(), initial: { capabilities: ALL_AVAILABLE_CAPABILITIES } });
    render(
      <MockLabProvider store={store}>
        <ParamPanel />
      </MockLabProvider>,
    );
    for (const value of ["0.1", "0.2", "0.3", "0.45"]) fireEvent.change(slider("키"), { target: { value } });
    expect(store.getState().recipe.body.height).toBe(0.45);
    expect(store.getState().history.depth).toBe(1);
    expect((slider("키")).value).toBe("0.45");
  });
});

describe("ParamPanel — 요약·사유", () => {
  it("요약 줄이 키 파라미터에 따라 바뀐다", () => {
    setup();
    const base = screen.getByRole("status").textContent ?? "";
    expect(base).toMatch(/^키 1\.\d\d m · 약 \d\.\d등신 · 팔 0\.\d\d m · 다리 0\.\d\d m$/u);
    cleanup();
    setup({ recipe: recipeWith({ body: { height: 1, headSize: -1 } }) });
    const tall = screen.getByRole("status").textContent ?? "";
    const metersOf = (text: string): number => Number(/키 (\d\.\d\d) m/u.exec(text)?.[1]);
    const headsOf = (text: string): number => Number(/약 (\d\.\d)등신/u.exec(text)?.[1]);
    expect(metersOf(tall)).toBeGreaterThan(metersOf(base));
    expect(headsOf(tall)).toBeGreaterThan(headsOf(base));
  });

  it("체형·얼굴형 슬롯이 완전하지 않으면 사유를 보여주고, 패키지 소스는 셰이프 키 안내를 보여준다", () => {
    const capabilities: SlotCapabilityMap = {
      ...ALL_AVAILABLE_CAPABILITIES,
      body: { status: "partial", reasonKo: "패키지에 체형 셰이프 키가 일부만 있습니다." },
      "face-shape": { status: "unavailable", reasonKo: "얼굴형 셰이프 키가 없습니다." },
    };
    setup({ capabilities, recipe: recipeWith({ source: { kind: "package", characterId: "orion-cc0", sha256: "a".repeat(64) } }) });
    expect(screen.getByText(/체형 슬롯 부분 지원: 패키지에 체형 셰이프 키가 일부만 있습니다\./u)).toBeTruthy();
    expect(screen.getByText(/얼굴형 슬롯 미지원: 얼굴형 셰이프 키가 없습니다\./u)).toBeTruthy();
    expect(screen.getByText(/제작 패키지 소스에서는 패키지의 셰이프 키에 매핑된 파라미터만/u)).toBeTruthy();
  });

  it("formatParam·describeParamValue는 -0을 만들지 않고 부호를 붙인다", () => {
    expect(formatParam(-0.001)).toBe("0.00");
    expect(formatParam(0.126)).toBe("0.13");
    expect(describeParamValue(-0.004, ["작게", "크게"])).toBe("0.00 · 기본");
    expect(describeParamValue(-0.3, ["작게", "크게"])).toBe("-0.30 · 작게");
  });
});

describe("ParamPanel — 색 팔레트", () => {
  it("피부 8·홍채 10·머리 12·눈썹 12 견본을 보여주고 현재 색이 선택 표시된다", () => {
    setup();
    expect(within(screen.getByRole("group", { name: "피부색" })).getAllByRole("button")).toHaveLength(SKIN_TONES.length);
    expect(within(screen.getByRole("group", { name: "홍채색" })).getAllByRole("button")).toHaveLength(IRIS_COLORS.length);
    expect(within(screen.getByRole("group", { name: "머리색" })).getAllByRole("button")).toHaveLength(HAIR_COLORS.length);
    expect(within(screen.getByRole("group", { name: "눈썹색" })).getAllByRole("button")).toHaveLength(HAIR_COLORS.length);
    expect(screen.getByRole("button", { name: "피부색 밝은 살구" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "피부색 도자기" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "홍채색 짙은 갈색" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("밝은 살구 (#f3d3bd)")).toBeTruthy();
  });

  it("견본 클릭은 color/set 1회, 팔레트에 없는 색은 직접 지정으로 표시한다", () => {
    const dispatched = setup({ recipe: recipeWith({ colors: { ...createDefaultRecipe().colors, hair: "#123456" } }) });
    fireEvent.click(screen.getByRole("button", { name: "피부색 코코아" }));
    fireEvent.click(screen.getByRole("button", { name: "홍채색 사파이어" }));
    fireEvent.click(screen.getByRole("button", { name: "머리색 은발" }));
    fireEvent.click(screen.getByRole("button", { name: "눈썹색 흑발" }));
    expect(dispatched).toEqual([
      { type: "color/set", key: "skin", value: "#7a4b2d" },
      { type: "color/set", key: "iris", value: "#2f4fa8" },
      { type: "color/set", key: "hair", value: "#c7c9d1" },
      { type: "color/set", key: "brow", value: "#1a1618" },
    ]);
    expect(screen.getByText("직접 지정 (#123456)")).toBeTruthy();
    for (const button of within(screen.getByRole("group", { name: "머리색" })).getAllByRole("button")) expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("견본의 배경색이 hex와 같다(색 견본이 실제 색을 보여준다)", () => {
    setup();
    const swatch = screen.getByRole("button", { name: "피부색 에스프레소" });
    expect(swatch.getAttribute("data-hex")).toBe("#4a2c1b");
    expect(swatch.style.backgroundColor).toBe("rgb(74, 44, 27)");
  });
});
