// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioGroupUniformResizeProxy } from "./StudioGroupUniformResizeProxy";

type CapturedProps = Record<string, unknown>;

const konvaHarness = vi.hoisted(() => ({
  rectNode: null as Record<string, unknown> | null,
  rectProps: null as CapturedProps | null,
  transformerNode: null as Record<string, unknown> | null,
  transformerProps: null as CapturedProps | null,
}));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");

  const Rect = forwardRef<unknown, CapturedProps>((props, ref) => {
    // eslint-disable-next-line react-compiler/react-compiler -- Test-only render probe.
    konvaHarness.rectProps = props;
    useImperativeHandle(ref, () => konvaHarness.rectNode);
    return null;
  });
  const Transformer = forwardRef<unknown, CapturedProps>((props, ref) => {
    // eslint-disable-next-line react-compiler/react-compiler -- Test-only render probe.
    konvaHarness.transformerProps = props;
    useImperativeHandle(ref, () => konvaHarness.transformerNode);
    return null;
  });
  Rect.displayName = "TestGroupResizeRect";
  Transformer.displayName = "TestGroupResizeTransformer";

  return { Rect, Transformer };
});

type FakeRectNode = {
  getLayer: () => { batchDraw: () => void };
  getStage: () => FakeStage | null;
  height: (value?: number) => number;
  position: (value?: { x: number; y: number }) => {
    x: number;
    y: number;
  };
  rotation: (value?: number) => number;
  scaleX: (value?: number) => number;
  scaleY: (value?: number) => number;
  width: (value?: number) => number;
  x: () => number;
  y: () => number;
};

type FakeStage = {
  find: (selector: unknown) => unknown[];
};

type FakeWrapperNode = ReturnType<typeof createWrapperNode>;

type FakeIndicatorNode = ReturnType<typeof createIndicatorNode>;

/** Draw wrapper double covering the finder (getAttr/getParent), eligibility, and attr surface. */
function createWrapperNode(elementId: string, options: { cached?: boolean } = {}) {
  const state = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  const layer = { batchDraw: vi.fn() };
  return {
    state,
    layer,
    getAttr: vi.fn((name: string) =>
      name === "studioElementId" ? elementId : undefined
    ),
    setAttr: vi.fn(),
    getParent: vi.fn(() => null),
    isCached: vi.fn(() => options.cached === true),
    getLayer: vi.fn(() => layer),
    position: vi.fn((value?: { x: number; y: number }) => {
      if (value) {
        state.x = value.x;
        state.y = value.y;
      }
      return { x: state.x, y: state.y };
    }),
    rotation: vi.fn((value?: number) => {
      if (value !== undefined) state.rotation = value;
      return state.rotation;
    }),
    scale: vi.fn((value?: { x: number; y: number }) => {
      if (value) {
        state.scaleX = value.x;
        state.scaleY = value.y;
      }
      return { x: state.scaleX, y: state.scaleY };
    }),
    offset: vi.fn((value?: { x: number; y: number }) => {
      if (value) {
        state.offsetX = value.x;
        state.offsetY = value.y;
      }
      return { x: state.offsetX, y: state.offsetY };
    }),
  };
}

function createIndicatorNode() {
  const state = { visible: true };
  return {
    state,
    visible: vi.fn((value?: boolean) => {
      if (value !== undefined) state.visible = value;
      return state.visible;
    }),
  };
}

/** Answers the wrapper finder's predicate find and the indicator-name string find. */
function createStage(
  wrapper: FakeWrapperNode,
  indicators: readonly FakeIndicatorNode[]
): FakeStage {
  return {
    find: vi.fn((selector: unknown) => {
      if (typeof selector === "function") {
        return [wrapper].filter((node) =>
          (selector as (node: FakeWrapperNode) => boolean)(node)
        );
      }
      if (selector === ".studio-draw-selection-indicator") return [...indicators];
      return [];
    }),
  };
}

type FakeTransformerNode = {
  forceUpdate: () => void;
  getLayer: () => { batchDraw: () => void };
  nodes: {
    (): unknown[];
    (next: unknown[]): FakeTransformerNode;
  };
  stopTransform: () => void;
};

function createRectNode(stage: FakeStage | null = null): FakeRectNode {
  const state = {
    height: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    width: 0,
    x: 0,
    y: 0,
  };
  const layer = { batchDraw: vi.fn() };
  const node = {
    getLayer: vi.fn(() => layer),
    getStage: vi.fn(() => stage),
    height: vi.fn((value?: number) => {
      if (value !== undefined) state.height = value;
      return state.height;
    }),
    position: vi.fn((value?: { x: number; y: number }) => {
      if (value) {
        state.x = value.x;
        state.y = value.y;
      }
      return { x: state.x, y: state.y };
    }),
    rotation: vi.fn((value?: number) => {
      if (value !== undefined) state.rotation = value;
      return state.rotation;
    }),
    scaleX: vi.fn((value?: number) => {
      if (value !== undefined) state.scaleX = value;
      return state.scaleX;
    }),
    scaleY: vi.fn((value?: number) => {
      if (value !== undefined) state.scaleY = value;
      return state.scaleY;
    }),
    width: vi.fn((value?: number) => {
      if (value !== undefined) state.width = value;
      return state.width;
    }),
    x: vi.fn(() => state.x),
    y: vi.fn(() => state.y),
  };
  return node;
}

function createTransformerNode(): FakeTransformerNode {
  const state = { nodes: [] as unknown[] };
  const layer = { batchDraw: vi.fn() };
  const node = {
    forceUpdate: vi.fn(),
    getLayer: vi.fn(() => layer),
    nodes: vi.fn((next?: unknown[]) => {
      if (next) {
        state.nodes = [...next];
        return node;
      }
      return state.nodes;
    }),
    stopTransform: vi.fn(),
  };
  return node as unknown as FakeTransformerNode;
}

function rectProps(): {
  onTransform: (event: { target: FakeRectNode }) => void;
  onTransformEnd: (event: { target: FakeRectNode }) => void;
  onTransformStart: () => void;
} & CapturedProps {
  if (!konvaHarness.rectProps) throw new Error("Missing captured Rect props");
  return konvaHarness.rectProps as {
    onTransform: (event: { target: FakeRectNode }) => void;
    onTransformEnd: (event: { target: FakeRectNode }) => void;
    onTransformStart: () => void;
  } & CapturedProps;
}

function transformerProps(): {
  anchorStyleFunc: (anchor: Record<string, ReturnType<typeof vi.fn>>) => void;
  boundBoxFunc: (
    oldBox: Record<string, number>,
    newBox: Record<string, number>
  ) => Record<string, number>;
} & CapturedProps {
  if (!konvaHarness.transformerProps) {
    throw new Error("Missing captured Transformer props");
  }
  return konvaHarness.transformerProps as {
    anchorStyleFunc: (anchor: Record<string, ReturnType<typeof vi.fn>>) => void;
    boundBoxFunc: (
      oldBox: Record<string, number>,
      newBox: Record<string, number>
    ) => Record<string, number>;
  } & CapturedProps;
}

const bounds = { x: 10, y: 20, width: 100, height: 50 };

function commonProps() {
  return {
    bounds,
    coarse: false,
    effScale: 1,
    enabled: true,
    mobile: false,
    onBegin: vi.fn(() => true),
    onCancel: vi.fn(),
    onCommit: vi.fn(),
  };
}

beforeEach(() => {
  konvaHarness.rectNode = createRectNode() as unknown as Record<string, unknown>;
  konvaHarness.transformerNode =
    createTransformerNode() as unknown as Record<string, unknown>;
  konvaHarness.rectProps = null;
  konvaHarness.transformerProps = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioGroupUniformResizeProxy", () => {
  it("자식 대신 투명 proxy 하나에 전용 corner-only Transformer를 연결한다", () => {
    const props = commonProps();
    const { rerender } = render(<StudioGroupUniformResizeProxy {...props} />);
    const rect = konvaHarness.rectNode as unknown as FakeRectNode;
    const transformer =
      konvaHarness.transformerNode as unknown as FakeTransformerNode;
    const desktop = transformerProps();

    expect(transformer.nodes()).toEqual([rect]);
    expect(desktop.enabledAnchors).toEqual([
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ]);
    expect(desktop.keepRatio).toBe(true);
    expect(desktop.rotateEnabled).toBe(false);
    expect(desktop.flipEnabled).toBe(false);
    expect(desktop.anchorSize).toBe(13);
    expect(desktop.anchorStroke).toBe("#c2410c");
    expect(desktop.borderStroke).toBe("#c2410c");

    rerender(
      <StudioGroupUniformResizeProxy
        {...props}
        coarse
        effScale={2}
      />
    );
    const coarse = transformerProps();
    const anchor = {
      hitStrokeWidth: vi.fn(),
      shadowBlur: vi.fn(),
      shadowColor: vi.fn(),
      shadowOffsetY: vi.fn(),
      shadowOpacity: vi.fn(),
    };
    coarse.anchorStyleFunc(anchor);
    expect(coarse.anchorSize).toBe(7);
    expect(anchor.hitStrokeWidth).toHaveBeenCalledWith(22);

    const oldBox = { x: 0, y: 0, width: 100, height: 50, rotation: 0 };
    const tooSmall = { x: 0, y: 0, width: 11, height: 30, rotation: 0 };
    const valid = { x: 0, y: 0, width: 12, height: 12, rotation: 0 };
    expect(coarse.boundBoxFunc(oldBox, tooSmall)).toBe(oldBox);
    expect(coarse.boundBoxFunc(oldBox, valid)).toBe(valid);
  });

  it("승인된 gesture는 proxy를 먼저 원복한 뒤 유한 양수 target을 정확히 한 번 커밋한다", () => {
    const props = commonProps();
    const rect = konvaHarness.rectNode as unknown as FakeRectNode;
    props.onCommit.mockImplementation(() => {
      expect(rect.x()).toBe(bounds.x);
      expect(rect.y()).toBe(bounds.y);
      expect(rect.width()).toBe(bounds.width);
      expect(rect.height()).toBe(bounds.height);
      expect(rect.scaleX()).toBe(1);
      expect(rect.scaleY()).toBe(1);
      expect(rect.rotation()).toBe(0);
    });
    render(<StudioGroupUniformResizeProxy {...props} />);

    act(() => rectProps().onTransformStart());
    expect(props.onBegin).toHaveBeenCalledWith(bounds);

    act(() => {
      rect.position({ x: 30, y: 40 });
      rect.scaleX(2);
      rect.scaleY(2);
      rectProps().onTransformEnd({ target: rect });
    });

    expect(props.onCommit).toHaveBeenCalledTimes(1);
    // Rotation is reported alongside the box and is 0 for the default uniform proxy.
    expect(props.onCommit).toHaveBeenCalledWith(
      {
        x: 30,
        y: 40,
        width: 200,
        height: 100,
      },
      0,
    );
    expect(props.onCancel).not.toHaveBeenCalled();

    act(() => rectProps().onTransformEnd({ target: rect }));
    expect(props.onCommit).toHaveBeenCalledTimes(1);
  });

  it("freeTransform은 회전 핸들과 8방향 앵커를 열고 비균등 스케일을 허용한다", () => {
    const props = { ...commonProps(), freeTransform: true };
    render(<StudioGroupUniformResizeProxy {...props} />);
    const transformer = transformerProps();

    expect(transformer.rotateEnabled).toBe(true);
    expect(transformer.keepRatio).toBe(false);
    expect(transformer.enabledAnchors).toEqual([
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "middle-left",
      "middle-right",
      "top-center",
      "bottom-center",
    ]);
    expect(transformer.rotationSnaps).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it("freeTransform 커밋은 회전각을 박스와 함께 넘기고 proxy를 원복한다", () => {
    const props = { ...commonProps(), freeTransform: true };
    const rect = konvaHarness.rectNode as unknown as FakeRectNode;
    render(<StudioGroupUniformResizeProxy {...props} />);

    act(() => rectProps().onTransformStart());
    act(() => {
      rect.position({ x: 30, y: 40 });
      rect.scaleX(2);
      rect.scaleY(3);
      rect.rotation(45);
      rectProps().onTransformEnd({ target: rect });
    });

    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(props.onCommit).toHaveBeenCalledWith(
      { x: 30, y: 40, width: 200, height: 150 },
      45,
    );
    // The gesture proxy always returns to its source box; the document owns the result.
    expect(rect.rotation()).toBe(0);
    expect(rect.scaleX()).toBe(1);
    expect(rect.scaleY()).toBe(1);
  });

  it("회전이 비유한 값이면 커밋 대신 취소한다", () => {
    const props = { ...commonProps(), freeTransform: true };
    const rect = konvaHarness.rectNode as unknown as FakeRectNode;
    render(<StudioGroupUniformResizeProxy {...props} />);

    act(() => rectProps().onTransformStart());
    act(() => {
      rect.position({ x: 30, y: 40 });
      rect.rotation(Number.NaN);
      rectProps().onTransformEnd({ target: rect });
    });

    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("기본(그룹) 모드는 회전 핸들 없이 균등 코너 리사이즈만 유지한다", () => {
    const props = commonProps();
    render(<StudioGroupUniformResizeProxy {...props} />);
    const transformer = transformerProps();

    expect(transformer.rotateEnabled).toBe(false);
    expect(transformer.keepRatio).toBe(true);
    expect(transformer.rotationSnaps).toEqual([]);
  });

  it("onBegin 거부 시 즉시 stopTransform하고 원복하며 commit/cancel을 만들지 않는다", () => {
    const props = commonProps();
    props.onBegin.mockReturnValue(false);
    const rect = konvaHarness.rectNode as unknown as FakeRectNode;
    const transformer =
      konvaHarness.transformerNode as unknown as FakeTransformerNode;
    render(<StudioGroupUniformResizeProxy {...props} />);

    act(() => {
      rect.position({ x: 999, y: 888 });
      rect.scaleX(3);
      rect.scaleY(3);
      rectProps().onTransformStart();
    });

    expect(transformer.stopTransform).toHaveBeenCalledTimes(1);
    expect(rect.position()).toEqual({ x: 10, y: 20 });
    expect(rect.scaleX()).toBe(1);
    expect(rect.scaleY()).toBe(1);
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("비유한 target은 cancel하고, 활성 gesture 중 disabled 전환도 한 번만 취소한다", () => {
    const props = commonProps();
    const rect = konvaHarness.rectNode as unknown as FakeRectNode;
    const transformer =
      konvaHarness.transformerNode as unknown as FakeTransformerNode;
    const view = render(<StudioGroupUniformResizeProxy {...props} />);

    act(() => {
      rectProps().onTransformStart();
      rect.scaleX(Number.NaN);
      rectProps().onTransformEnd({ target: rect });
    });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCommit).not.toHaveBeenCalled();

    act(() => rectProps().onTransformStart());
    view.rerender(<StudioGroupUniformResizeProxy {...props} enabled={false} />);
    expect(props.onCancel).toHaveBeenCalledTimes(2);
    expect(transformer.nodes()).toEqual([]);
  });

  it("활성 gesture 중 unmount되면 commit 없이 onCancel을 한 번 호출한다", () => {
    const props = commonProps();
    const view = render(<StudioGroupUniformResizeProxy {...props} />);

    act(() => rectProps().onTransformStart());
    view.unmount();

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("활성 gesture 중 window blur가 나면 source bounds로 원복하고 정확히 한 번 취소한다", () => {
    const props = commonProps();
    const rect = konvaHarness.rectNode as unknown as FakeRectNode;
    const transformer =
      konvaHarness.transformerNode as unknown as FakeTransformerNode;
    const view = render(<StudioGroupUniformResizeProxy {...props} />);

    act(() => window.dispatchEvent(new Event("blur")));
    expect(transformer.stopTransform).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();

    act(() => {
      rectProps().onTransformStart();
      rect.position({ x: 310, y: 420 });
      rect.width(150);
      rect.height(90);
      rect.scaleX(2);
      rect.scaleY(3);
      rect.rotation(12);
    });
    view.rerender(
      <StudioGroupUniformResizeProxy
        {...props}
        bounds={{ x: 400, y: 500, width: 210, height: 160 }}
      />,
    );
    // Konva may synchronously deliver transformend from stopTransform(). The latest props now carry
    // a different box, so this proves cancellation's final projection is the captured source box.
    vi.mocked(transformer.stopTransform).mockImplementation(() => {
      rectProps().onTransformEnd({ target: rect });
    });
    props.onCancel.mockImplementation(() => {
      expect(rect.position()).toEqual({ x: bounds.x, y: bounds.y });
      expect(rect.width()).toBe(bounds.width);
      expect(rect.height()).toBe(bounds.height);
      expect(rect.scaleX()).toBe(1);
      expect(rect.scaleY()).toBe(1);
      expect(rect.rotation()).toBe(0);
      expect(transformer.stopTransform).toHaveBeenCalledTimes(1);
    });
    act(() => window.dispatchEvent(new Event("blur")));

    expect(rect.position()).toEqual({ x: bounds.x, y: bounds.y });
    expect(rect.width()).toBe(bounds.width);
    expect(rect.height()).toBe(bounds.height);
    expect(rect.scaleX()).toBe(1);
    expect(rect.scaleY()).toBe(1);
    expect(rect.rotation()).toBe(0);
    expect(transformer.stopTransform).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCommit).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("blur"));
      rectProps().onTransformEnd({ target: rect });
    });
    view.unmount();
    expect(transformer.stopTransform).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  describe("live transform preview (PPT-style real-time ink)", () => {
    function setupLivePreview(options: { cached?: boolean } = {}) {
      const wrapper = createWrapperNode("stroke-1", options);
      const indicator = createIndicatorNode();
      const stage = createStage(wrapper, [indicator]);
      konvaHarness.rectNode = createRectNode(stage) as unknown as Record<
        string,
        unknown
      >;
      const props = {
        ...commonProps(),
        freeTransform: true,
        livePreviewElementId: "stroke-1",
      };
      return { wrapper, indicator, props };
    }

    it("변형 프레임마다 커밋 플래너와 동일한 affine attrs를 래퍼에 명령형으로 투영한다", () => {
      const { wrapper, indicator, props } = setupLivePreview();
      const rect = konvaHarness.rectNode as unknown as FakeRectNode;
      render(<StudioGroupUniformResizeProxy {...props} />);

      act(() => rectProps().onTransformStart());
      // The dashed indicator is parked for the gesture — the Transformer frame is the affordance.
      expect(indicator.state.visible).toBe(false);

      act(() => {
        rect.position({ x: 30, y: 40 });
        rect.scaleX(2);
        rect.scaleY(3);
        rect.rotation(45);
        rectProps().onTransform({ target: rect });
      });

      expect(wrapper.state).toEqual({
        x: 30,
        y: 40,
        rotation: 45,
        scaleX: 2,
        scaleY: 3,
        offsetX: bounds.x,
        offsetY: bounds.y,
      });
    });

    it("transformend는 래퍼를 중립화한 뒤에야 정확히 한 번 커밋하고 인디케이터를 복구한다", () => {
      const { wrapper, indicator, props } = setupLivePreview();
      const rect = konvaHarness.rectNode as unknown as FakeRectNode;
      props.onCommit.mockImplementation(() => {
        // The neutral projection must precede the commit so the baked points repaint atomically.
        expect(wrapper.state).toEqual({
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          offsetX: 0,
          offsetY: 0,
        });
        expect(indicator.state.visible).toBe(true);
      });
      render(<StudioGroupUniformResizeProxy {...props} />);

      act(() => rectProps().onTransformStart());
      act(() => {
        rect.position({ x: 30, y: 40 });
        rect.scaleX(2);
        rect.scaleY(2);
        rect.rotation(30);
        rectProps().onTransform({ target: rect });
        rectProps().onTransformEnd({ target: rect });
      });

      expect(props.onCommit).toHaveBeenCalledTimes(1);
      expect(props.onCommit).toHaveBeenCalledWith(
        { x: 30, y: 40, width: 200, height: 100 },
        30,
      );
    });

    it("blur 취소는 프리뷰 투영을 중립으로 되돌리고 커밋을 만들지 않는다", () => {
      const { wrapper, indicator, props } = setupLivePreview();
      const rect = konvaHarness.rectNode as unknown as FakeRectNode;
      render(<StudioGroupUniformResizeProxy {...props} />);

      act(() => {
        rectProps().onTransformStart();
        rect.position({ x: 50, y: 70 });
        rect.scaleX(1.5);
        rectProps().onTransform({ target: rect });
      });
      expect(wrapper.state.scaleX).toBe(1.5);

      act(() => window.dispatchEvent(new Event("blur")));

      expect(wrapper.state).toEqual({
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0,
      });
      expect(indicator.state.visible).toBe(true);
      expect(props.onCancel).toHaveBeenCalledTimes(1);
      expect(props.onCommit).not.toHaveBeenCalled();
    });

    it("캐시된 조상 아래 스트로크는 프리뷰 없이 커밋-지연 동작으로 폴백한다", () => {
      const { wrapper, indicator, props } = setupLivePreview({ cached: true });
      const rect = konvaHarness.rectNode as unknown as FakeRectNode;
      render(<StudioGroupUniformResizeProxy {...props} />);

      act(() => rectProps().onTransformStart());
      act(() => {
        rect.position({ x: 30, y: 40 });
        rect.scaleX(2);
        rectProps().onTransform({ target: rect });
        rectProps().onTransformEnd({ target: rect });
      });

      expect(wrapper.position).not.toHaveBeenCalled();
      expect(wrapper.rotation).not.toHaveBeenCalled();
      expect(indicator.state.visible).toBe(true);
      expect(props.onCommit).toHaveBeenCalledTimes(1);
    });

    it("비유한 중간 프레임은 마지막 유효 투영을 유지한다", () => {
      const { wrapper, props } = setupLivePreview();
      const rect = konvaHarness.rectNode as unknown as FakeRectNode;
      render(<StudioGroupUniformResizeProxy {...props} />);

      act(() => rectProps().onTransformStart());
      act(() => {
        rect.position({ x: 30, y: 40 });
        rect.scaleX(2);
        rectProps().onTransform({ target: rect });
      });
      const lastValid = { ...wrapper.state };

      act(() => {
        rect.scaleX(Number.NaN);
        rectProps().onTransform({ target: rect });
      });

      expect(wrapper.state).toEqual(lastValid);
    });
  });

  it("외부 취소 신호(Escape·포인터 취소)는 진행 중인 gesture를 즉시 중단시킨다", () => {
    // 페이지가 Escape로 세션을 지우고 lease를 반납해도 proxy의 Konva 제스처는 계속 돌았다 —
    // 라이브 프리뷰가 붙은 뒤로는 "취소했습니다" 안내 후에도 잉크가 핸들을 따라다녔다.
    const props = commonProps();
    const rect = konvaHarness.rectNode as unknown as FakeRectNode;
    const view = render(
      <StudioGroupUniformResizeProxy {...props} externalCancelSignal={0} />,
    );

    act(() => rectProps().onTransformStart());
    act(() => {
      rect.position({ x: 80, y: 90 });
      rect.scaleX(2);
    });

    view.rerender(
      <StudioGroupUniformResizeProxy {...props} externalCancelSignal={1} />,
    );

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCommit).not.toHaveBeenCalled();
    // 취소는 캡처된 source box로 원복한다.
    expect(rect.position()).toEqual({ x: bounds.x, y: bounds.y });
    expect(rect.scaleX()).toBe(1);

    // 같은 값 재렌더는 아무 것도 하지 않는다(마운트 값은 기준선일 뿐 취소가 아니다).
    view.rerender(
      <StudioGroupUniformResizeProxy {...props} externalCancelSignal={1} />,
    );
    expect(props.onCancel).toHaveBeenCalledTimes(1);

    // 활성 gesture가 없을 때의 신호 변화도 조용히 무시된다(왕복 루프 방지).
    view.rerender(
      <StudioGroupUniformResizeProxy {...props} externalCancelSignal={2} />,
    );
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("hidden visibility 전환만 활성 gesture를 취소하고 listener를 정리한다", () => {
    let visibilityState: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState,
    );
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    const props = commonProps();
    const rect = konvaHarness.rectNode as unknown as FakeRectNode;
    const transformer =
      konvaHarness.transformerNode as unknown as FakeTransformerNode;
    const view = render(<StudioGroupUniformResizeProxy {...props} />);

    act(() => {
      rectProps().onTransformStart();
      rect.position({ x: 50, y: 70 });
      rect.scaleX(1.5);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(transformer.stopTransform).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();

    act(() => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(rect.position()).toEqual({ x: bounds.x, y: bounds.y });
    expect(rect.width()).toBe(bounds.width);
    expect(rect.height()).toBe(bounds.height);
    expect(rect.scaleX()).toBe(1);
    expect(rect.scaleY()).toBe(1);
    expect(transformer.stopTransform).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCommit).not.toHaveBeenCalled();

    act(() => document.dispatchEvent(new Event("visibilitychange")));
    view.unmount();
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(removeWindowListener).toHaveBeenCalledWith(
      "blur",
      expect.any(Function),
    );
    expect(removeDocumentListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });
});
