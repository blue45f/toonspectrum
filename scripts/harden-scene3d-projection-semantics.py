from pathlib import Path

projection = Path("apps/web/src/domains/creator/scene3d/studio-scene3d-bg3d-projection.ts")
text = projection.read_text(encoding="utf-8")

text = text.replace("const OUTPUT_MIN_HEIGHT = 2160;", "const OUTPUT_MIN_HEIGHT = 256;", 1)

input_old = '''export function projectStudioBg3dDocumentToScene3d(input: {
  readonly documentId: string;
  readonly source: StudioBg3dSceneDocument;
  readonly revision?: number;
  readonly now?: string;
}): StudioScene3dDocumentV1 {'''
input_new = '''export type StudioScene3dProjectionErrorCode = "missing-viewport-aspect-ratio";

export class StudioScene3dProjectionError extends Error {
  constructor(readonly code: StudioScene3dProjectionErrorCode, message: string) {
    super(message);
    this.name = "StudioScene3dProjectionError";
  }
}

export function projectStudioBg3dDocumentToScene3d(input: {
  readonly documentId: string;
  readonly source: StudioBg3dSceneDocument;
  /** Required only when the legacy document intentionally follows the live viewport ratio. */
  readonly viewportAspectRatio?: number;
  readonly revision?: number;
  readonly now?: string;
}): StudioScene3dDocumentV1 {'''
if input_old not in text:
    raise SystemExit("projection input contract anchor changed")
text = text.replace(input_old, input_new, 1)

size_old = '''  const { width, height } = resolveProjectionOutputSize(
    source.output.exportHeight,
    source.output.exportAspectRatio ?? 1,
  );'''
size_new = '''  const outputAspectRatio = source.output.exportAspectRatio ?? input.viewportAspectRatio;
  if (
    typeof outputAspectRatio !== "number"
    || !Number.isFinite(outputAspectRatio)
    || outputAspectRatio <= 0
  ) {
    throw new StudioScene3dProjectionError(
      "missing-viewport-aspect-ratio",
      "자동 출력 비율을 투영하려면 현재 뷰포트 비율이 필요합니다.",
    );
  }
  const { width, height } = resolveProjectionOutputSize(
    source.output.exportHeight,
    outputAspectRatio,
  );'''
if size_old not in text:
    raise SystemExit("projection output aspect anchor changed")
text = text.replace(size_old, size_new, 1)

background_old = '''    environment: Object.freeze({
      mode,
      color: source.background.color,
      assetId: null,
      rotationDegrees: source.background.panoramaRotation,
      intensity: source.lighting.ambientIntensity,
      groundEnabled: true,
      groundHeight: 0,
      groundShadowOpacity: source.render.shadows ? 0.22 : 0,
    }),'''
background_new = '''    environment: Object.freeze({
      mode,
      color: source.background.color,
      assetId: null,
      proceduralSkyPresetId:
        source.background.mode === "sky-preset" ? source.background.skyPresetId : null,
      fog: source.background.fogEnabled
        ? Object.freeze({
          enabled: true,
          color: source.background.fogColor ?? source.background.color,
          near: source.background.fogNear ?? 1,
          far: source.background.fogFar ?? 100,
        })
        : null,
      rotationDegrees: source.background.panoramaRotation,
      intensity: source.lighting.ambientIntensity,
      groundEnabled: true,
      groundHeight: 0,
      groundShadowOpacity: source.render.shadows ? 0.22 : 0,
    }),'''
if background_old not in text:
    raise SystemExit("projection environment anchor changed")
text = text.replace(background_old, background_new, 1)

text = text.replace(
    'toneMapping: source.render.toneMapping === "aces" ? "aces" : "neutral",',
    'toneMapping: source.render.toneMapping,',
    1,
)
text = text.replace(
    'antialiasing: source.render.antialias ? "msaa" : "ssaa",',
    'antialiasing: source.render.antialias ? "msaa" : "none",',
    1,
)
text = text.replace(
    'enabled: source.output.tone.mode !== "none",',
    'enabled: source.output.tone.mode !== "none" || source.output.line.enabled,',
    1,
)

output_old = '''      width,
      height,
      pixelRatio: 1,'''
output_new = '''      width,
      height,
      sourceAspectRatioMode:
        source.output.exportAspectRatio === undefined ? "viewport" : "fixed",
      pixelRatio: 1,'''
if output_old not in text:
    raise SystemExit("projection output metadata anchor changed")
text = text.replace(output_old, output_new, 1)
projection.write_text(text, encoding="utf-8")

model = Path("apps/web/src/domains/creator/scene3d/studio-scene3d-document.ts")
text = model.read_text(encoding="utf-8")
text = text.replace(
    'readonly toneMapping: "neutral" | "aces";',
    'readonly toneMapping: "none" | "neutral" | "aces";',
    1,
)
text = text.replace(
    'readonly antialiasing: "msaa" | "taa" | "taau" | "ssaa";',
    'readonly antialiasing: "none" | "msaa" | "taa" | "taau" | "ssaa";',
    1,
)

environment_anchor = '''  readonly assetId: string | null;
  readonly rotationDegrees: number;'''
environment_replacement = '''  readonly assetId: string | null;
  /** Allowlisted legacy procedural sky identity, when the source used a sky preset. */
  readonly proceduralSkyPresetId?: string | null;
  readonly fog?: {
    readonly enabled: boolean;
    readonly color: string;
    readonly near: number;
    readonly far: number;
  } | null;
  readonly rotationDegrees: number;'''
if environment_anchor not in text:
    raise SystemExit("Scene3D environment type anchor changed")
text = text.replace(environment_anchor, environment_replacement, 1)

output_anchor = '''  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;'''
output_replacement = '''  readonly width: number;
  readonly height: number;
  /** Whether dimensions came from a persisted ratio or the live viewport contract. */
  readonly sourceAspectRatioMode?: "fixed" | "viewport";
  readonly pixelRatio: number;'''
if output_anchor not in text:
    raise SystemExit("Scene3D output type anchor changed")
text = text.replace(output_anchor, output_replacement, 1)
model.write_text(text, encoding="utf-8")

test = Path("apps/web/src/domains/creator/scene3d/studio-scene3d-bg3d-projection.test.ts")
text = test.read_text(encoding="utf-8")
text = text.replace("expect(projected.output.height).toBe(2160);", "expect(projected.output.height).toBe(640);", 1)
text = text.replace("expect(projected.output.width).toBe(1620);", "expect(projected.output.width).toBe(480);", 1)
shot_call = 'projectStudioBg3dDocumentToScene3d({ documentId: "scene:shot", source });'
if shot_call not in text:
    raise SystemExit("projection shot test call anchor changed")
text = text.replace(
    shot_call,
    'projectStudioBg3dDocumentToScene3d({ documentId: "scene:shot", source, viewportAspectRatio: 1 });',
    1,
)
test.write_text(text, encoding="utf-8")

math_test = Path("apps/web/src/domains/creator/scene3d/studio-scene3d-bg3d-projection-math.test.ts")
text = math_test.read_text(encoding="utf-8")
text = text.replace(
    '      source: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,\n      now:',
    '      source: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,\n      viewportAspectRatio: 1,\n      now:',
    1,
)
insert = '''

  it("fails closed when an automatic legacy ratio has no live viewport measurement", () => {
    expect(() => projectStudioBg3dDocumentToScene3d({
      documentId: "missing-viewport-contract",
      source: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    })).toThrowError(expect.objectContaining({ code: "missing-viewport-aspect-ratio" }));
  });

  it("preserves disabled AA, no tone mapping, sky identity, fog, and viewport ratio", () => {
    const projected = projectStudioBg3dDocumentToScene3d({
      documentId: "render-contract",
      viewportAspectRatio: 0.75,
      source: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
        render: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render,
          antialias: false,
          toneMapping: "none",
        },
        background: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background,
          mode: "sky-preset",
          skyPresetId: "sunset",
          fogEnabled: true,
          fogColor: "#445566",
          fogNear: 2,
          fogFar: 80,
        },
      },
      now: "2026-09-10T00:00:00.000Z",
    });

    expect(projected.output).toMatchObject({
      width: 480,
      height: 640,
      sourceAspectRatioMode: "viewport",
    });
    expect(projected.render).toMatchObject({
      antialiasing: "none",
      toneMapping: "none",
    });
    expect(projected.environment).toMatchObject({
      mode: "procedural-sky",
      proceduralSkyPresetId: "sunset",
      fog: { enabled: true, color: "#445566", near: 2, far: 80 },
    });
  });
'''
closing = "\n});\n"
if not text.endswith(closing):
    raise SystemExit("projection math test closing anchor changed")
text = text[: -len(closing)] + insert + closing
math_test.write_text(text, encoding="utf-8")
