// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReferenceSkeleton } from "../../../animation/reference-skeleton";
import { computeWorldTransforms } from "../../../animation/skeleton-fk";
import { DEFAULT_FRAMING, failVisible } from "../../../contracts";
import { createPaintSession } from "../../../paint/paint-session";
import { projectToPixel } from "../../../render/viewport-math";
import { v3Length, v3Sub } from "../../../shared/math";
import { createMockEngine, mockDiagnostics } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";
import { applyPlanFixture } from "../../../testing/recipe-fixtures";
import { TopBar } from "../TopBar";
import { createUiStateStore } from "../ui-state";
import { createViewportRegistry } from "../viewport-registry";

import { ViewportPane } from "./ViewportPane";

import type { ApplyPlan, EngineBackend, EngineSession, EngineStatus, HudSample, JointDragHandle, LabCommand, PickHit, Pose, Vec3 } from "../../../contracts";
import type { ViewportCameraInfo } from "../../../render/viewport-camera";
import type { MockEngine } from "../../../testing/mock-engine";
import type { ApplyLoop } from "../apply-loop";
import type { UiStateStore } from "../ui-state";

const SKELETON = createReferenceSkeleton();

/** 정면(+Z)에서 몸 중심을 보는 800×800 렌더 카메라 */
const CAMERA: ViewportCameraInfo = { position: [0, 1.1, 4], forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], fovY: 0.8, width: 800, height: 800 };
/** CSS 박스는 렌더 크기의 절반(스케일 환산을 확인) */
const CSS_BOX = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) };
const READY: EngineStatus = { phase: "ready", backend: "webgpu", diagnostics: mockDiagnostics("webgpu") };

const HANDLE_BONES = ["hips", "spine", "chest", "neck", "head", "leftUpperArm", "leftLowerArm", "leftHand", "leftIndexProximal", "leftEye"] as const;

function worldOf(pose: Pose, bone: string): Vec3 {
  const world = computeWorldTransforms(SKELETON, pose).get(bone);
  if (!world) throw new Error(`본 없음: ${bone}`);
  return world.position;
}

function handlesFor(pose: Pose): JointDragHandle[] {
  return HANDLE_BONES.map((bone) => {
    const world = worldOf(pose, bone);
    const screen = projectToPixel(CAMERA, world);
    if (!screen) throw new Error("투영 불가");
    return { bone, world, screen };
  });
}

/** 렌더 픽셀 → 같은 지점의 클라이언트(CSS) 좌표 */
function toClient(render: readonly [number, number]): { clientX: number; clientY: number } {
  return { clientX: render[0] / 2, clientY: render[1] / 2 };
}

interface TestEngineOptions {
  readonly skeleton?: boolean;
  readonly handles?: boolean;
  readonly pick?: (ndcX: number, ndcY: number) => PickHit | null;
  readonly hud?: () => HudSample;
}

type TestEngine = MockEngine & { viewportCamera(): ViewportCameraInfo; poseSkeleton(): typeof SKELETON | null };

function createTestEngine(options: TestEngineOptions = {}): TestEngine {
  const base = createMockEngine({ backend: "webgpu" });
  return Object.assign(base, {
    viewportCamera: () => CAMERA,
    poseSkeleton: () => (options.skeleton === false ? null : SKELETON),
    jointHandles: (): readonly JointDragHandle[] => (options.handles === false ? [] : handlesFor(base.appliedPlans.at(-1)?.boneRotations ?? {})),
    ...(options.pick ? { pick: options.pick } : {}),
    ...(options.hud ? { readHud: options.hud } : {}),
  });
}

function fakeApplyLoop(plan: ApplyPlan | null): ApplyLoop {
  // useSyncExternalStore가 요구하는 대로 스냅샷 참조를 고정한다(실제 적용 루프도 캐시된 스냅샷을 돌려준다).
  const snapshot = { plan, receipt: null, sequence: 1 };
  return {
    start: () => () => undefined,
    flush: async () => undefined,
    settled: () => true,
    lastPlan: () => plan,
    lastReceipt: () => null,
    snapshot: () => snapshot,
    markSourceLoaded: () => undefined,
    subscribe: () => () => undefined,
  };
}

interface PaneOptions {
  readonly engine?: TestEngine | null;
  readonly status?: EngineStatus;
  readonly plan?: ApplyPlan | null;
  readonly hudIntervalMs?: number;
  readonly ui?: UiStateStore;
  readonly paintSession?: ReturnType<typeof createPaintSession>;
}

function renderPane(options: PaneOptions = {}) {
  const dispatched: LabCommand[] = [];
  const status = options.status ?? READY;
  const session = createMockEngineSession(status);
  session.setEngine(options.engine === undefined ? createTestEngine() : options.engine);
  const registry = createViewportRegistry();
  const ui = options.ui ?? createUiStateStore();
  const plan = options.plan === undefined ? applyPlanFixture({ revision: 1 }) : options.plan;
  const view = render(
    <MockLabProvider initialState={{ engine: status }} dispatchSpy={(command) => dispatched.push(command)} engineSession={session} shell={{ viewport: registry, ui, applyLoop: plan === null && options.plan === undefined ? null : fakeApplyLoop(plan) }}>
      <ViewportPane hudIntervalMs={options.hudIntervalMs ?? 0} {...(options.paintSession ? { paintSession: options.paintSession } : {})} />
    </MockLabProvider>,
  );
  return { ...view, dispatched, registry, ui, session };
}

let frames: Array<() => void> = [];

function flushFrames(): void {
  const run = frames;
  frames = [];
  act(() => {
    for (const callback of run) callback();
  });
}

beforeEach(() => {
  frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(() => callback(0));
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(CSS_BOX);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function handle(bone: string): Element {
  const element = document.querySelector(`circle[data-bone="${bone}"]`);
  if (!element) throw new Error(`핸들 없음: ${bone}`);
  return element;
}

describe("엔진 상태·캔버스 등록", () => {
  it("엔진이 없으면 상태 문구를 표시하고 캔버스를 레지스트리에 등록하며 엔진 의존 도구는 비활성이다", () => {
    const view = renderPane({ engine: null, status: { phase: "idle" }, plan: null });
    expect(view.registry.current()).toBe(screen.getByLabelText("캐릭터 뷰포트"));
    expect(screen.getByText(/엔진 미선택/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "얼굴" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "드로잉" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector("svg.cl-viewport-handles")).toBeNull();
    expect(document.querySelector("dl.cl-viewport-hud")).toBeNull();
  });

  it("언마운트하면 캔버스 등록을 해제한다", () => {
    const view = renderPane({ engine: null, status: { phase: "idle" }, plan: null });
    expect(view.registry.current()).not.toBeNull();
    view.unmount();
    expect(view.registry.current()).toBeNull();
  });

  it("백엔드를 바꿔 다시 고르면 컨텍스트가 잠긴 캔버스를 재사용하지 않고 새 캔버스를 마운트해 엔진 생성에 넘긴다", () => {
    const session = createMockEngineSession({ phase: "idle" });
    const canvases: HTMLCanvasElement[] = [];
    const recording: EngineSession = {
      ...session,
      select: async (backend: EngineBackend, canvas: HTMLCanvasElement) => {
        canvases.push(canvas);
        await session.select(backend, canvas);
      },
    };
    const registry = createViewportRegistry();
    render(
      <MockLabProvider engineSession={recording} shell={{ viewport: registry, ui: createUiStateStore(), applyLoop: null }}>
        <TopBar />
        <ViewportPane hudIntervalMs={0} />
      </MockLabProvider>,
    );
    const mounted = (): HTMLElement => screen.getByLabelText("캐릭터 뷰포트");
    const original = mounted();
    fireEvent.click(screen.getByRole("button", { name: "WebGPU" }));
    // 첫 선택: 마운트된 캔버스 그대로
    expect(canvases).toEqual([original]);
    // WebGPU 컨텍스트를 쥔 캔버스에 WebGL2 getContext는 null이므로, 다음 선택은 새 캔버스여야 한다
    fireEvent.click(screen.getByRole("button", { name: "WebGL2" }));
    expect(canvases).toHaveLength(2);
    const second = canvases[1];
    expect(second).not.toBe(original);
    expect(second).toBe(mounted());
    expect(second?.isConnected).toBe(true);
    expect(original.isConnected).toBe(false);
    expect(registry.current()).toBe(second);
    // 반대 방향(WebGL2 → WebGPU)도 매번 새 캔버스
    fireEvent.click(screen.getByRole("button", { name: "WebGPU" }));
    const third = canvases[2];
    expect(third).not.toBe(second);
    expect(third).not.toBe(original);
    expect(third).toBe(mounted());
    expect(registry.current()).toBe(third);
    expect(document.querySelectorAll("canvas.cl-viewport-canvas")).toHaveLength(1);
  });

  it("초기화 실패·장치 손실은 코드와 한글 사유를 그대로 보인다(빈 캔버스로 숨기지 않는다)", () => {
    const failure = failVisible("webgpu-no-adapter", "WebGPU 어댑터를 얻지 못했습니다.", undefined, 1);
    renderPane({ engine: null, status: { phase: "failed", backend: "webgpu", failure }, plan: null });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("webgpu-no-adapter");
    expect(status.textContent).toContain("WebGPU 어댑터를 얻지 못했습니다.");
    expect(status.getAttribute("data-tone")).toBe("error");
    cleanup();
    renderPane({ engine: null, status: { phase: "lost", backend: "webgl2", failure: failVisible("webgl2-context-lost", "컨텍스트 손실", undefined, 2) }, plan: null });
    expect(screen.getByRole("status").textContent).toContain("webgl2-context-lost");
  });

  it("엔진이 준비되면 컨테이너 크기×devicePixelRatio로 resize한다", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const engine = createTestEngine();
    renderPane({ engine });
    expect(engine.calls.filter((call) => call.method === "resize").map((call) => call.args)).toEqual([[800, 800]]);
    vi.unstubAllGlobals();
  });
});

describe("HUD", () => {
  it("backend·어댑터·물리·프레임 수치를 한글 표로 보이고 GPU 시간이 없으면 '미지원'이라고 적는다", () => {
    renderPane();
    const hud = screen.getByLabelText("성능 HUD");
    const row = (key: string): string => hud.querySelector(`[data-key="${key}"] dd`)?.textContent ?? "";
    expect(row("backend")).toBe("webgpu");
    expect(row("adapter")).toBe("mock");
    expect(row("physics")).toBe("builtin-pbd");
    expect(row("gpu")).toBe("미지원");
    expect(row("frame")).toBe("8.0 ms");
    expect(row("p95")).toBe("10.0 ms");
  });

  it("HUD 버튼으로 끄고 켤 수 있고 주기마다 다시 읽는다", () => {
    vi.useFakeTimers();
    let frameMs = 5;
    const engine = createTestEngine({ hud: () => ({ ...createMockEngine().readHud(), frameMs, frameMsP95: 6 }) });
    renderPane({ engine, hudIntervalMs: 100 });
    expect(screen.getByLabelText("성능 HUD").textContent).toContain("5.0 ms");
    frameMs = 9;
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByLabelText("성능 HUD").textContent).toContain("9.0 ms");
    fireEvent.click(screen.getByRole("button", { name: "HUD" }));
    expect(screen.queryByLabelText("성능 HUD")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "HUD" }));
    expect(screen.getByLabelText("성능 HUD")).toBeTruthy();
  });

  it("HUD 읽기가 실패하면 표를 지우고 사유를 알린다", () => {
    const engine = createTestEngine({
      hud: () => {
        throw failVisible("engine-disposed", "이미 해제된 엔진입니다.", undefined, 1);
      },
    });
    renderPane({ engine });
    expect(screen.queryByLabelText("성능 HUD")).toBeNull();
    expect(screen.getByText(/engine-disposed/u)).toBeTruthy();
  });
});

describe("카메라 프레이밍", () => {
  it("버튼이 engine.setCamera를 호출하고 눌림 상태를 바꾼다", () => {
    const engine = createTestEngine();
    renderPane({ engine });
    expect(screen.getByRole("button", { name: "전신" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "얼굴" }));
    fireEvent.click(screen.getByRole("button", { name: "상반신" }));
    expect(engine.calls.filter((call) => call.method === "setCamera").map((call) => call.args[0])).toEqual([
      { ...DEFAULT_FRAMING, mode: "face" },
      { ...DEFAULT_FRAMING, mode: "bust" },
    ]);
    expect(screen.getByRole("button", { name: "상반신" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "얼굴" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("setCamera가 LabFailure를 던지면 사유를 보인다", () => {
    const engine = createTestEngine();
    engine.setCamera = () => {
      throw failVisible("engine-disposed", "이미 해제된 엔진입니다.", undefined, 1);
    };
    renderPane({ engine });
    fireEvent.click(screen.getByRole("button", { name: "얼굴" }));
    expect(screen.getByText(/이미 해제된 엔진입니다/u)).toBeTruthy();
  });
});

describe("관절 핸들", () => {
  it("눈·손가락을 뺀 핸들을 렌더 좌표로 그리고 손가락은 토글로 켠다", () => {
    renderPane();
    flushFrames();
    const bones = Array.from(document.querySelectorAll("circle[data-bone]")).map((node) => node.getAttribute("data-bone"));
    expect(bones).toEqual(["hips", "spine", "chest", "neck", "head", "leftUpperArm", "leftLowerArm", "leftHand"]);
    const svg = document.querySelector("svg.cl-viewport-handles");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 800 800");
    const elbow = handlesFor({}).find((entry) => entry.bone === "leftLowerArm");
    expect(Number(handle("leftLowerArm").getAttribute("cx"))).toBeCloseTo(elbow?.screen[0] ?? Number.NaN, 6);
    expect(handle("leftLowerArm").getAttribute("aria-label")).toBe("왼쪽 아래팔 관절 핸들");
    fireEvent.click(screen.getByRole("button", { name: "손가락 핸들" }));
    flushFrames();
    expect(document.querySelector('circle[data-bone="leftIndexProximal"]')).not.toBeNull();
    expect(document.querySelector('circle[data-bone="leftEye"]')).toBeNull();
  });

  it("핸들 오버레이를 끄면 진행 중 드래그를 취소하고 미리보기를 되돌린다", () => {
    const base = applyPlanFixture({ revision: 2 });
    const engine = createTestEngine();
    const view = renderPane({ engine, plan: base });
    flushFrames();
    const elbow = projectToPixel(CAMERA, worldOf({}, "leftLowerArm"));
    const pivot = worldOf({}, "leftUpperArm");
    const target = projectToPixel(CAMERA, [pivot[0], pivot[1] - 0.28, pivot[2]]);
    if (!elbow || !target) throw new Error("투영 불가");
    fireEvent.pointerDown(handle("leftLowerArm"), { ...toClient(elbow), pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle("leftLowerArm"), { ...toClient(target), pointerId: 1 });
    expect(engine.appliedPlans.at(-1)).not.toBe(base);
    fireEvent.click(screen.getByRole("button", { name: "관절 핸들" }));
    expect(engine.appliedPlans.at(-1)).toBe(base);
    expect(view.dispatched).toEqual([]);
  });

  it("관절 핸들 버튼으로 오버레이를 끄고 켠다", () => {
    renderPane();
    flushFrames();
    fireEvent.click(screen.getByRole("button", { name: "관절 핸들" }));
    expect(document.querySelector("svg.cl-viewport-handles")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "관절 핸들" }));
    flushFrames();
    expect(document.querySelector("circle[data-bone]")).not.toBeNull();
  });

  it("핸들이 없는 소스는 사유를 보인다", () => {
    renderPane({ engine: createTestEngine({ handles: false }) });
    flushFrames();
    expect(screen.getByText(/스켈레톤이 없어 표시할 관절 핸들이 없습니다/u)).toBeTruthy();
  });
});

describe("관절 드래그 → pose/set", () => {
  const BASE_PLAN = applyPlanFixture({ revision: 3, boneRotations: { head: [0, 0.0998, 0, 0.995] } });

  function dragElbow(deltaDeg: number) {
    const pivotWorld = worldOf(BASE_PLAN.boneRotations, "leftUpperArm");
    const elbowWorld = worldOf(BASE_PLAN.boneRotations, "leftLowerArm");
    const angle = (deltaDeg * Math.PI) / 180;
    const offset = v3Sub(elbowWorld, pivotWorld);
    // 시선 평면(XY)에서 Z축 둘레 회전
    const target: Vec3 = [pivotWorld[0] + offset[0] * Math.cos(angle) - offset[1] * Math.sin(angle), pivotWorld[1] + offset[0] * Math.sin(angle) + offset[1] * Math.cos(angle), pivotWorld[2] + offset[2]];
    const start = projectToPixel(CAMERA, elbowWorld);
    const end = projectToPixel(CAMERA, target);
    if (!start || !end) throw new Error("투영 불가");
    return { start, end, target };
  }

  it("팔꿈치 핸들을 끌면 미리보기만 하고 포인터를 놓을 때 pose/set(scope full) 1회를 보낸다", () => {
    const engine = createTestEngine();
    const view = renderPane({ engine, plan: BASE_PLAN });
    flushFrames();
    const { start, end, target } = dragElbow(-45);
    const elbow = handle("leftLowerArm");
    fireEvent.pointerDown(elbow, { ...toClient(start), pointerId: 5, button: 0 });
    fireEvent.pointerMove(elbow, { ...toClient(end), pointerId: 5 });
    // 미리보기: 엔진에 플랜이 적용되고 dispatch는 아직 없다
    expect(view.dispatched).toEqual([]);
    const preview = engine.appliedPlans.at(-1);
    expect(preview?.revision).toBe(3);
    expect(preview?.boneRotations.head).toEqual(BASE_PLAN.boneRotations.head);
    expect(preview?.boneRotations.leftUpperArm).toBeDefined();
    flushFrames();
    // 핸들이 미리보기 포즈를 따라 이동했다
    expect(Number(handle("leftLowerArm").getAttribute("cx"))).toBeCloseTo((projectToPixel(CAMERA, target) ?? [Number.NaN, 0])[0], 2);

    fireEvent.pointerUp(handle("leftLowerArm"), { ...toClient(end), pointerId: 5 });
    expect(view.dispatched).toHaveLength(1);
    const command = view.dispatched[0];
    expect(command?.type).toBe("pose/set");
    if (command?.type !== "pose/set") return;
    expect(command.scope).toBe("full");
    expect(command.labelKo).toBe("관절 드래그: 왼쪽 위팔");
    // 레시피 포즈(플랜이 아니라)에 위팔 회전만 얹는다: 기존 포즈에 머리 값이 없으므로 위팔만 들어 있다
    expect(Object.keys(command.pose)).toEqual(["leftUpperArm"]);
    const q = command.pose.leftUpperArm ?? [0, 0, 0, 1];
    expect((2 * Math.atan2(Math.abs(q[2]), Math.abs(q[3])) * 180) / Math.PI).toBeCloseTo(45, 2);
    // 그 포즈를 FK에 넣으면 팔꿈치가 목표 위치에 온다
    const after = worldOf({ ...BASE_PLAN.boneRotations, ...command.pose }, "leftLowerArm");
    expect(v3Length(v3Sub(after, target))).toBeLessThan(3e-3);
  });

  it("포인터를 움직이지 않은 클릭은 dispatch하지 않는다", () => {
    const view = renderPane({ plan: BASE_PLAN });
    flushFrames();
    const { start } = dragElbow(-45);
    fireEvent.pointerDown(handle("leftLowerArm"), { ...toClient(start), pointerId: 1, button: 0 });
    fireEvent.pointerUp(handle("leftLowerArm"), { ...toClient(start), pointerId: 1 });
    expect(view.dispatched).toEqual([]);
  });

  it("pointercancel·Escape는 미리보기를 시작 플랜으로 되돌리고 기록하지 않는다", () => {
    const engine = createTestEngine();
    const view = renderPane({ engine, plan: BASE_PLAN });
    flushFrames();
    const { start, end } = dragElbow(-45);
    fireEvent.pointerDown(handle("leftLowerArm"), { ...toClient(start), pointerId: 2, button: 0 });
    fireEvent.pointerMove(handle("leftLowerArm"), { ...toClient(end), pointerId: 2 });
    expect(engine.appliedPlans.at(-1)).not.toBe(BASE_PLAN);
    fireEvent.pointerCancel(handle("leftLowerArm"), { pointerId: 2 });
    expect(engine.appliedPlans.at(-1)).toBe(BASE_PLAN);
    expect(view.dispatched).toEqual([]);

    // Escape
    fireEvent.pointerDown(handle("leftLowerArm"), { ...toClient(start), pointerId: 3, button: 0 });
    fireEvent.pointerMove(handle("leftLowerArm"), { ...toClient(end), pointerId: 3 });
    expect(engine.appliedPlans.at(-1)).not.toBe(BASE_PLAN);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(engine.appliedPlans.at(-1)).toBe(BASE_PLAN);
    fireEvent.pointerUp(handle("leftLowerArm"), { ...toClient(end), pointerId: 3 });
    expect(view.dispatched).toEqual([]);
  });

  it("관절 제한을 넘기면 사유를 보이고(요청 각도 표시) 제한된 회전으로 기록한다", () => {
    const view = renderPane({ plan: BASE_PLAN });
    flushFrames();
    const pivot = worldOf(BASE_PLAN.boneRotations, "leftUpperArm");
    const elbow = worldOf(BASE_PLAN.boneRotations, "leftLowerArm");
    const mirrored: Vec3 = [pivot[0] - (elbow[0] - pivot[0]), pivot[1] - (elbow[1] - pivot[1]), elbow[2]];
    const start = projectToPixel(CAMERA, elbow);
    const end = projectToPixel(CAMERA, mirrored);
    if (!start || !end) throw new Error("투영 불가");
    fireEvent.pointerDown(handle("leftLowerArm"), { ...toClient(start), pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle("leftLowerArm"), { ...toClient(end), pointerId: 1 });
    expect(screen.getByText(/관절 제한에 닿아/u)).toBeTruthy();
    fireEvent.pointerUp(handle("leftLowerArm"), { ...toClient(end), pointerId: 1 });
    expect(view.dispatched).toHaveLength(1);
  });

  it("골반(루트) 핸들은 자기 원점 둘레로 돌린다", () => {
    const view = renderPane({ plan: applyPlanFixture({ revision: 1 }) });
    flushFrames();
    const hips = worldOf({}, "hips");
    const start = projectToPixel(CAMERA, [hips[0] + 0.3, hips[1], hips[2]]);
    const end = projectToPixel(CAMERA, [hips[0], hips[1] + 0.3, hips[2]]);
    if (!start || !end) throw new Error("투영 불가");
    fireEvent.pointerDown(handle("hips"), { ...toClient(start), pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle("hips"), { ...toClient(end), pointerId: 1 });
    fireEvent.pointerUp(handle("hips"), { ...toClient(end), pointerId: 1 });
    expect(view.dispatched).toHaveLength(1);
    expect(view.dispatched[0]).toMatchObject({ type: "pose/set", labelKo: "관절 드래그: 골반" });
  });

  it("적용 플랜이 없으면(적용 루프 없음) 미리보기 없이도 놓을 때 기록한다", () => {
    const engine = createTestEngine();
    const view = renderPane({ engine, plan: null });
    flushFrames();
    const start = projectToPixel(CAMERA, worldOf({}, "leftLowerArm"));
    const pivot = worldOf({}, "leftUpperArm");
    const end = projectToPixel(CAMERA, [pivot[0], pivot[1] - 0.28, pivot[2]]);
    if (!start || !end) throw new Error("투영 불가");
    fireEvent.pointerDown(handle("leftLowerArm"), { ...toClient(start), pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle("leftLowerArm"), { ...toClient(end), pointerId: 1 });
    expect(engine.appliedPlans).toEqual([]);
    fireEvent.pointerUp(handle("leftLowerArm"), { ...toClient(end), pointerId: 1 });
    expect(view.dispatched).toHaveLength(1);
  });

  it("엔진이 스켈레톤을 주지 않으면 드래그를 시작하지 않고 사유를 보인다", () => {
    const view = renderPane({ engine: createTestEngine({ skeleton: false }) });
    flushFrames();
    fireEvent.pointerDown(handle("leftLowerArm"), { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerUp(handle("leftLowerArm"), { clientX: 120, clientY: 100, pointerId: 1 });
    expect(view.dispatched).toEqual([]);
    expect(screen.getByText(/스켈레톤\(포즈 프레임\)을 제공하지 않습니다/u)).toBeTruthy();
  });

  it("주 버튼이 아닌 포인터는 무시한다", () => {
    const view = renderPane({ plan: BASE_PLAN });
    flushFrames();
    const { start, end } = dragElbow(-45);
    fireEvent.pointerDown(handle("leftLowerArm"), { ...toClient(start), pointerId: 1, button: 2 });
    fireEvent.pointerMove(handle("leftLowerArm"), { ...toClient(end), pointerId: 1 });
    fireEvent.pointerUp(handle("leftLowerArm"), { ...toClient(end), pointerId: 1 });
    expect(view.dispatched).toEqual([]);
  });

  it("드래그 중 언마운트하면 미리보기를 시작 플랜으로 되돌린다", () => {
    const engine = createTestEngine();
    const view = renderPane({ engine, plan: BASE_PLAN });
    flushFrames();
    const { start, end } = dragElbow(-45);
    fireEvent.pointerDown(handle("leftLowerArm"), { ...toClient(start), pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle("leftLowerArm"), { ...toClient(end), pointerId: 1 });
    expect(engine.appliedPlans.at(-1)).not.toBe(BASE_PLAN);
    view.unmount();
    expect(engine.appliedPlans.at(-1)).toBe(BASE_PLAN);
    expect(view.dispatched).toEqual([]);
  });
});

describe("모델 위 드로잉", () => {
  const HIT: PickHit = { partId: 1, role: "skin", uv: [0.5, 0.5], worldPosition: [0, 1, 0], worldNormal: [0, 0, 1], distance: 3 };

  function drawLayer(): HTMLElement {
    return screen.getByRole("application", { name: "모델 위 드로잉 영역" });
  }

  it("드로잉 버튼이 모드를 켜고 오버레이·안내(레이어·브러시)를 보인다", () => {
    const view = renderPane();
    expect(screen.queryByRole("application")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "드로잉" }));
    expect(view.ui.getState().drawingMode).toBe(true);
    expect(drawLayer()).toBeTruthy();
    expect(screen.getByText(/드로잉 모드 · 레이어 피부 · 브러시 \d+px/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "드로잉" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("pick → UV 스트로크 → 텍스처 업로드 후 포인터를 놓을 때 paint/stroke 토큰 1개를 보낸다", () => {
    const picks: Array<readonly [number, number]> = [];
    const engine = createTestEngine({
      pick: (x, y) => {
        picks.push([x, y]);
        return HIT;
      },
    });
    const session = createPaintSession({ layerSize: 32, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
    const ui = createUiStateStore({ drawingMode: true });
    const view = renderPane({ engine, ui, paintSession: session });
    // 클라이언트 (200, 100) → NDC (0, 0.5)
    fireEvent.pointerDown(drawLayer(), { clientX: 200, clientY: 100, pointerId: 1, pointerType: "pen", pressure: 0.8, button: 0 });
    expect(picks[0]?.[0]).toBeCloseTo(0, 6);
    expect(picks[0]?.[1]).toBeCloseTo(0.5, 6);
    expect(engine.paintUploads.length).toBeGreaterThanOrEqual(1);
    expect(engine.paintUploads.at(-1)).toMatchObject({ part: "skin", width: 32 });
    fireEvent.pointerMove(drawLayer(), { clientX: 220, clientY: 110, pointerId: 1, pointerType: "pen", pressure: 0.6 });
    expect(picks.length).toBeGreaterThanOrEqual(2);
    expect(view.dispatched).toEqual([]);
    fireEvent.pointerUp(drawLayer(), { clientX: 220, clientY: 110, pointerId: 1 });
    expect(view.dispatched).toHaveLength(1);
    const command = view.dispatched[0];
    expect(command?.type).toBe("paint/stroke");
    expect(command?.type === "paint/stroke" && command.undoToken.part).toBe("skin");
    expect(command?.type === "paint/stroke" && command.undoToken.tiles.length).toBeGreaterThan(0);
  });

  it("pointercancel은 스트로크를 되돌리고(업로드) 기록하지 않는다", () => {
    const engine = createTestEngine({ pick: () => HIT });
    const session = createPaintSession({ layerSize: 32, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
    const view = renderPane({ engine, ui: createUiStateStore({ drawingMode: true }), paintSession: session });
    fireEvent.pointerDown(drawLayer(), { clientX: 200, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(drawLayer(), { clientX: 210, clientY: 100, pointerId: 1 });
    const uploadsBefore = engine.paintUploads.length;
    fireEvent.pointerCancel(drawLayer(), { pointerId: 1 });
    expect(view.dispatched).toEqual([]);
    // 되돌림 업로드로 레이어가 비어 있다
    expect(engine.paintUploads.length).toBeGreaterThan(uploadsBefore);
    expect(session.layer("skin").rgba.every((value) => value === 0)).toBe(true);
  });

  it("활성 부위가 아닌 표면이나 빈 공간에서 시작하면 칠하지 않고 안내한다", () => {
    const engine = createTestEngine({ pick: () => ({ ...HIT, role: "hair" }) });
    const view = renderPane({ engine, ui: createUiStateStore({ drawingMode: true }), paintSession: createPaintSession({ layerSize: 32 }) });
    fireEvent.pointerDown(drawLayer(), { clientX: 200, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerUp(drawLayer(), { clientX: 200, clientY: 100, pointerId: 1 });
    expect(engine.paintUploads).toEqual([]);
    expect(view.dispatched).toEqual([]);
    expect(screen.getByText(/선택한 레이어\(피부\) 표면 위에서 시작하세요/u)).toBeTruthy();
  });

  it("모드를 끄면 진행 중 스트로크를 취소하고 기록하지 않는다", () => {
    const engine = createTestEngine({ pick: () => HIT });
    const ui = createUiStateStore({ drawingMode: true });
    const session = createPaintSession({ layerSize: 32, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
    const view = renderPane({ engine, ui, paintSession: session });
    fireEvent.pointerDown(drawLayer(), { clientX: 200, clientY: 100, pointerId: 1, button: 0 });
    act(() => ui.setDrawingMode(false));
    expect(screen.queryByRole("application")).toBeNull();
    expect(view.dispatched).toEqual([]);
    expect(session.layer("skin").rgba.every((value) => value === 0)).toBe(true);
  });

  it("주 버튼이 아닌 포인터는 칠하지 않는다", () => {
    const engine = createTestEngine({ pick: () => HIT });
    renderPane({ engine, ui: createUiStateStore({ drawingMode: true }), paintSession: createPaintSession({ layerSize: 32 }) });
    fireEvent.pointerDown(drawLayer(), { clientX: 200, clientY: 100, pointerId: 1, button: 2 });
    expect(engine.paintUploads).toEqual([]);
  });
});

describe("접근성", () => {
  it("도구 막대·핸들 그룹·HUD가 이름 있는 영역이다", () => {
    renderPane();
    flushFrames();
    expect(screen.getByRole("toolbar", { name: "뷰포트 도구" })).toBeTruthy();
    expect(within(screen.getByRole("toolbar")).getByRole("group", { name: "카메라 프레이밍" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "관절 핸들" })).toBeTruthy();
    expect(screen.getByLabelText("성능 HUD")).toBeTruthy();
  });
});
