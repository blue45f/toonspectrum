// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioNaturalTransformer } from "./StudioNaturalTransformer";
import { STUDIO_TRANSFORM_ROTATION_SNAPS } from "./studio-transform-interaction";

const harness = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  const Transformer = forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    // eslint-disable-next-line react-compiler/react-compiler -- Test-only render probe.
    harness.props = props;
    useImperativeHandle(ref, () => ({}));
    return null;
  });
  Transformer.displayName = "TestNaturalTransformer";
  return { Transformer };
});

function props(): Record<string, unknown> {
  if (!harness.props) throw new Error("Transformer props were not captured");
  return harness.props;
}

afterEach(() => {
  cleanup();
  harness.props = null;
});

describe("StudioNaturalTransformer", () => {
  it("is free by default and uses Shift only for proportional resize and 15-degree rotation", () => {
    render(
      <StudioNaturalTransformer
        naturalRatioMode="shift"
        naturalRotationEnabled
      />,
    );

    expect(props()).toMatchObject({
      keepRatio: false,
      shiftBehavior: "default",
      centeredScaling: false,
      rotateEnabled: true,
      rotationSnaps: [],
      rotationSnapTolerance: 0,
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
    });
    expect(props().rotationSnaps).toEqual(STUDIO_TRANSFORM_ROTATION_SNAPS);
    expect(props().rotationSnapTolerance).toBe(7.5);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    });
    expect(props().rotationSnaps).toEqual([]);
  });

  it("uses Alt/Option for centre-origin scaling and clears modifiers on blur", () => {
    render(
      <StudioNaturalTransformer
        naturalRatioMode="shift"
        naturalRotationEnabled
      />,
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
    });
    expect(props().centeredScaling).toBe(true);

    act(() => window.dispatchEvent(new Event("blur")));
    expect(props().centeredScaling).toBe(false);
  });

  it("keeps inherently proportional content locked without letting Shift invert the rule", () => {
    render(
      <StudioNaturalTransformer
        naturalRatioMode="always"
        naturalRotationEnabled={false}
      />,
    );

    expect(props()).toMatchObject({
      keepRatio: true,
      shiftBehavior: "none",
      rotateEnabled: false,
      rotationSnaps: [],
    });
  });
});
