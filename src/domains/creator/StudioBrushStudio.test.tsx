import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsPresetSettings,
} from "./studio-brush-dynamics";
import { studioBrushStudioDefaultPresetId } from "./studio-brush-studio-contract";
import { studioBrushTipAlphaMapToBase64 } from "./studio-brush-tip-stamp";
import {
  StudioBrushDualBrushControls,
  StudioBrushDynamicsPreview,
  StudioBrushStudio,
  StudioBrushTipImportControls,
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

  it.each([
    ["spray", "airbrush"],
    ["soft-brush", "airbrush"],
    ["crayon", "dry-media"],
    ["chalk", "dry-media"],
    ["charcoal", "dry-media"],
  ] as const)("maps the %s catalog alias to its actual dynamics preset", (brushId, presetId) => {
    expect(studioBrushStudioDefaultPresetId(brushId)).toBe(presetId);
    const html = renderToStaticMarkup(
      <StudioBrushStudio
        {...props({
          brushId,
          settings: studioBrushDynamicsPresetSettings(presetId),
        })}
      />
    );

    expect(html).toContain(
      presetId === "airbrush" ? "에어브러시" : "드라이 미디어"
    );
    expect(html).not.toContain("필압·속도 입력과 입자 브러시");
  });

  it("falls back to ink-particle when a non-dynamics brush restores defaults", () => {
    expect(studioBrushStudioDefaultPresetId("pen")).toBe("ink-particle");
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

  it("renders dual brush controls with secondary tip, blend mode, size ratio and PNG import", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      ...studioBrushDynamicsPresetSettings("ink-particle"),
      dualBrush: {
        enabled: true,
        tip: { shape: "halftone" },
        blendMode: "screen",
        sizeRatio: 1.5,
      },
    });
    const html = renderToStaticMarkup(
      <StudioBrushDualBrushControls settings={settings} onSettingsChange={vi.fn()} />
    );
    expect(html).toContain("듀얼 브러시 사용");
    expect(html).toContain("간격·산포는 1차 브러시를 따릅니다");
    expect(html).toContain('aria-label="듀얼 브러시 합성 모드"');
    expect(html).toContain("곱하기");
    expect(html).toContain("스크린");
    expect(html).toContain("2차 팁 크기 비율");
    expect(html).toContain("150%");
    expect(html).toContain('aria-label="2차 팁 망점"');
    // The secondary tip reuses the shared PNG tip import system.
    expect(html).toContain("PNG 펜촉 가져오기");
  });

  it("collapses dual brush to a single accessible toggle while disabled", () => {
    const html = renderToStaticMarkup(
      <StudioBrushDualBrushControls
        settings={studioBrushDynamicsPresetSettings("ink-particle")}
        onSettingsChange={vi.fn()}
      />
    );
    expect(html).toContain("듀얼 브러시 사용");
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain("2차 팁 크기 비율");
    expect(html).not.toContain('aria-label="듀얼 브러시 합성 모드"');
  });

  it("moves the preview primary tip off the solid-ellipse path only while dual brush is active", () => {
    const roundTip = {
      tip: { shape: "round" as const, softness: 0.35, alphaMapBase64: null, alphaMapSize: 24 },
    };
    const base = { ...studioBrushDynamicsPresetSettings("dry-media"), ...roundTip };
    const disabledHtml = renderToStaticMarkup(
      <StudioBrushDynamicsPreview settings={base} strokeWidth={9} color="#3a2218" />
    );
    expect(disabledHtml).toContain("<ellipse");
    const enabled = normalizeStudioBrushDynamicsSettings({
      ...base,
      dualBrush: { enabled: true, tip: { shape: "halftone" }, blendMode: "multiply", sizeRatio: 1 },
    });
    const enabledHtml = renderToStaticMarkup(
      <StudioBrushDynamicsPreview settings={enabled} strokeWidth={9} color="#3a2218" />
    );
    expect(enabledHtml).toContain("<circle");
    expect(enabledHtml).not.toContain("<ellipse");
  });

  it("offers an actual PNG chooser with clear limits and a 44px touch target", () => {
    const html = renderToStaticMarkup(
      <StudioBrushTipImportControls
        tip={{ shape: "round", softness: 0.35, alphaMapBase64: null, alphaMapSize: 24 }}
        onTipChange={vi.fn()}
      />
    );

    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".png,image/png"');
    expect(html).toContain("PNG 펜촉 가져오기");
    expect(html).toContain("4MB·4,096px 이하");
    expect(html).toContain("min-h-[44px]");
  });

  it("shows embedded custom-tip status and an accessible remove action", () => {
    const payload = studioBrushTipAlphaMapToBase64("sumi", 0.3, 16);
    const html = renderToStaticMarkup(
      <StudioBrushTipImportControls
        tip={{
          shape: "sumi",
          softness: 0.3,
          alphaMapBase64: payload.alphaMapBase64,
          alphaMapSize: payload.alphaMapSize,
        }}
        onTipChange={vi.fn()}
      />
    );

    expect(html).toContain("문서에 포함된 사용자 PNG");
    expect(html).toContain("16×16 알파");
    expect(html).toContain('aria-label="사용자 PNG 펜촉 제거"');
    expect(html).toContain("다른 PNG로 교체");
  });
});
