// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsPresetSettings,
} from "./studio-brush-dynamics";
import { findStudioBrushDynamicsMapping } from "./studio-brush-dynamics-editor";
import {
  StudioBrushDynamicsInputMatrix,
  StudioBrushGrainControls,
  StudioBrushTaperAdvancedControls,
} from "./StudioBrushDynamicsControls";

afterEach(cleanup);

describe("StudioBrushDynamicsInputMatrix", () => {
  it("keeps the common path compact while exposing every commercial-grade input source", () => {
    const html = renderToStaticMarkup(
      <StudioBrushDynamicsInputMatrix
        settings={studioBrushDynamicsPresetSettings("ink-particle")}
        onSettingsChange={vi.fn()}
      />
    );

    expect(html).toContain("입력원별 반응");
    expect(html).toContain("굵기");
    expect(html).toContain("불투명도");
    expect(html).toContain("유량");
    expect(html).toContain("간격");
    expect(html).toContain("산포");
    expect(html).toContain("각도");
    expect(html).toContain("원형도");
    expect(html).toContain("필압");
    expect(html).toContain("속도");
    expect(html).toContain("기울기");
    expect(html).toContain("랜덤");
    expect(html).toContain("배럴 압력");
    expect(html).toContain("펜 회전");
    expect(html).toContain("획 방향");
    expect(html).not.toContain("<details open");
  });

  it("connects, edits, inverts and removes one source without changing unrelated outputs", () => {
    const preset = studioBrushDynamicsPresetSettings("ink-particle");
    const initial = normalizeStudioBrushDynamicsSettings({
      ...preset,
      width: { ...preset.width, mappings: [], jitter: null },
    });
    const onSettingsChange = vi.fn();
    const view = render(
      <StudioBrushDynamicsInputMatrix
        settings={initial}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.click(screen.getByText("입력원별 반응").closest("summary")!);
    fireEvent.click(screen.getByText("획과 펜촉의 지름").closest("summary")!);
    fireEvent.click(screen.getByRole("switch", { name: "굵기 · 속도 입력 켜기" }));

    const connected = onSettingsChange.mock.calls.at(-1)?.[0];
    expect(findStudioBrushDynamicsMapping(connected, "width", "speed")).toMatchObject({
      from: 0.8,
      to: 1.4,
    });
    expect(connected.opacity).toEqual(initial.opacity);

    view.rerender(
      <StudioBrushDynamicsInputMatrix
        settings={connected}
        onSettingsChange={onSettingsChange}
      />
    );
    fireEvent.change(screen.getByLabelText("굵기 · 속도 입력 시작값"), {
      target: { value: "0.45" },
    });
    const tuned = onSettingsChange.mock.calls.at(-1)?.[0];
    expect(findStudioBrushDynamicsMapping(tuned, "width", "speed")?.from).toBe(0.45);

    view.rerender(
      <StudioBrushDynamicsInputMatrix
        settings={tuned}
        onSettingsChange={onSettingsChange}
      />
    );
    fireEvent.click(screen.getByRole("switch", { name: "굵기 · 속도 입력 방향 반전" }));
    const inverted = onSettingsChange.mock.calls.at(-1)?.[0];
    expect(findStudioBrushDynamicsMapping(inverted, "width", "speed")?.invert).toBe(true);

    view.rerender(
      <StudioBrushDynamicsInputMatrix
        settings={inverted}
        onSettingsChange={onSettingsChange}
      />
    );
    fireEvent.click(screen.getByRole("switch", { name: "굵기 · 속도 입력 끄기" }));
    const removed = onSettingsChange.mock.calls.at(-1)?.[0];
    expect(findStudioBrushDynamicsMapping(removed, "width", "speed")).toBeNull();
    expect(removed.opacity).toEqual(initial.opacity);
  });

  it("uses seeded property jitter for the random source and can disable it atomically", () => {
    const preset = studioBrushDynamicsPresetSettings("ink-particle");
    const initial = normalizeStudioBrushDynamicsSettings({
      ...preset,
      flow: { ...preset.flow, jitter: null },
    });
    const onSettingsChange = vi.fn();
    const view = render(
      <StudioBrushDynamicsInputMatrix
        settings={initial}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.click(screen.getByText("입력원별 반응").closest("summary")!);
    fireEvent.click(screen.getByText("겹쳐 쌓이는 색의 양").closest("summary")!);
    fireEvent.click(screen.getByRole("switch", { name: "유량 · 랜덤 입력 켜기" }));
    const enabled = onSettingsChange.mock.calls.at(-1)?.[0];
    expect(enabled.flow.jitter).toEqual({ mode: "multiply", amount: 0.12 });

    view.rerender(
      <StudioBrushDynamicsInputMatrix
        settings={enabled}
        onSettingsChange={onSettingsChange}
      />
    );
    fireEvent.change(screen.getByLabelText("유량 · 랜덤 입력 변화량"), {
      target: { value: "0.31" },
    });
    const tuned = onSettingsChange.mock.calls.at(-1)?.[0];
    expect(tuned.flow.jitter).toEqual({ mode: "multiply", amount: 0.31 });

    view.rerender(
      <StudioBrushDynamicsInputMatrix
        settings={tuned}
        onSettingsChange={onSettingsChange}
      />
    );
    fireEvent.click(screen.getByRole("switch", { name: "유량 · 랜덤 입력 끄기" }));
    expect(onSettingsChange.mock.calls.at(-1)?.[0].flow.jitter).toBeNull();
  });
});

describe("advanced brush material controls", () => {
  it("edits the hidden taper opacity and curve settings", () => {
    const settings = studioBrushDynamicsPresetSettings("dry-media");
    const onSettingsChange = vi.fn();
    render(
      <StudioBrushTaperAdvancedControls
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.change(screen.getByLabelText("테이퍼 끝 최소 불투명도"), {
      target: { value: "0.18" },
    });
    expect(onSettingsChange.mock.calls.at(-1)?.[0].taper.minOpacityRatio).toBe(0.18);
    fireEvent.change(screen.getByLabelText("테이퍼 반응 곡선"), {
      target: { value: "2.4" },
    });
    expect(onSettingsChange.mock.calls.at(-1)?.[0].taper.curve).toBe(2.4);
  });

  it("edits grain strength, scale, contrast and coordinate space through normalized settings", () => {
    const settings = studioBrushDynamicsPresetSettings("ink-particle");
    const onSettingsChange = vi.fn();
    const view = render(
      <StudioBrushGrainControls
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /획 고정/ }));
    const strokeFixed = onSettingsChange.mock.calls.at(-1)?.[0];
    expect(strokeFixed.grain.space).toBe("stroke-fixed");

    view.rerender(
      <StudioBrushGrainControls
        settings={strokeFixed}
        onSettingsChange={onSettingsChange}
      />
    );
    fireEvent.change(screen.getByLabelText("그레인 강도"), {
      target: { value: "0.48" },
    });
    const textured = onSettingsChange.mock.calls.at(-1)?.[0];
    expect(textured.grain).toMatchObject({ space: "stroke-fixed", amount: 0.48 });
  });
});
