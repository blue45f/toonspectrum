import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { studioBrushDynamicsPresetSettings } from "./studio-brush-dynamics";
import {
  StudioBrushDynamicsPreview,
  StudioBrushStudio,
  type StudioBrushStudioProps,
} from "./StudioBrushStudio";

function props(overrides: Partial<StudioBrushStudioProps> = {}): StudioBrushStudioProps {
  return {
    brushId: "ink-particle",
    strokeWidth: 8,
    color: "#281d18",
    settings: studioBrushDynamicsPresetSettings("ink-particle"),
    onSettingsChange: vi.fn(),
    onSelectDynamicsPreset: vi.fn(),
    useVelocityPressure: true,
    onUseVelocityPressureChange: vi.fn(),
    velocitySensitivity: 0.65,
    onVelocitySensitivityChange: vi.fn(),
    pressureCurve: 1,
    onPressureCurveChange: vi.fn(),
    tiltEnabled: true,
    onTiltEnabledChange: vi.fn(),
    tipAngle: -30,
    onTipAngleChange: vi.fn(),
    tipRoundness: 0.24,
    onTipRoundnessChange: vi.fn(),
    ...overrides,
  };
}

describe("StudioBrushStudio", () => {
  it("renders one compact, dialog-capable launcher with a dynamics summary", () => {
    const html = renderToStaticMarkup(<StudioBrushStudio {...props()} />);
    expect(html).toContain("브러시 스튜디오");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("잉크 입자");
    expect(html).toContain("개 연결");
    expect(html).toContain("min-h-[44px]");
    expect(html).not.toContain('role="dialog"');
  });

  it("uses a 44px-or-larger launcher in touch density and summarizes calligraphy", () => {
    const html = renderToStaticMarkup(
      <StudioBrushStudio {...props({ brushId: "calligraphy", density: "touch" })} />
    );
    expect(html).toContain("min-h-14");
    expect(html).toContain("촉 -30° · 원형도 24%");
  });

  it("renders deterministic rotated elliptical dabs from the shipped planner", () => {
    // Solid ellipse path: force round tip so preview matches Canvas ellipse geometry.
    const settings = {
      ...studioBrushDynamicsPresetSettings("dry-media"),
      tip: { shape: "round" as const, softness: 0.35, alphaMapBase64: null, alphaMapSize: 24 },
    };
    const first = renderToStaticMarkup(
      <StudioBrushDynamicsPreview settings={settings} strokeWidth={9} color="#3a2218" />
    );
    const second = renderToStaticMarkup(
      <StudioBrushDynamicsPreview settings={settings} strokeWidth={9} color="#3a2218" />
    );
    expect(first).toBe(second);
    expect((first.match(/<ellipse/g) ?? []).length).toBeGreaterThan(4);
    expect(first).toContain("rotate(");
    expect(first).toContain("필압 · 속도 · 기울기 · 회전");
  });

  it("matches Canvas radius-then-roundness geometry for a deterministic thin tip", () => {
    const preset = studioBrushDynamicsPresetSettings("dry-media");
    const settings = {
      ...preset,
      tip: { shape: "round" as const, softness: 0.35, alphaMapBase64: null, alphaMapSize: 24 },
      width: {
        ...preset.width,
        mappings: [{
          source: "pressure" as const,
          mode: "multiply" as const,
          from: 0.08,
          to: 0.08,
          amount: 1,
          curve: 1,
          invert: false,
        }],
        jitter: null,
      },
      roundness: {
        ...preset.roundness,
        base: 0.08,
        mappings: [],
        jitter: null,
      },
    };
    const html = renderToStaticMarkup(
      <StudioBrushDynamicsPreview settings={settings} strokeWidth={3} color="#3a2218" />
    );
    const firstEllipse = html.match(/<ellipse\b[^>]*\brx="([^"]+)"[^>]*\bry="([^"]+)"/);

    expect(firstEllipse).not.toBeNull();
    const radiusX = Number(firstEllipse![1]);
    const radiusY = Number(firstEllipse![2]);
    expect(radiusX).toBe(0.25);
    expect(radiusY).toBeCloseTo(radiusX * settings.roundness.base, 12);
    expect(radiusY).toBeLessThan(0.25);
  });
});
