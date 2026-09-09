from pathlib import Path

projection = Path("apps/web/src/domains/creator/scene3d/studio-scene3d-bg3d-projection.ts")
text = projection.read_text(encoding="utf-8")

lens_import = 'import { studioBg3dFovDegreesToFocalLength } from "../bg3d/studio-bg3d-lens";\n'
if lens_import not in text:
    marker = '} from "../bg3d/studio-bg3d-scene-document";\n'
    if text.count(marker) != 1:
        raise SystemExit("projection lens import anchor changed")
    text = text.replace(marker, marker + lens_import, 1)

start = text.find("function focalLengthFromVerticalFov(")
if start >= 0:
    end = text.find("function projectCamera(", start)
    if end < 0:
        raise SystemExit("projection camera anchor changed")
    text = text[:start] + text[end:]

legacy_call = "focalLengthMm: focalLengthFromVerticalFov(source.fovDegrees),"
canonical_call = "focalLengthMm: studioBg3dFovDegreesToFocalLength(source.fovDegrees),"
if legacy_call in text:
    text = text.replace(legacy_call, canonical_call, 1)
elif canonical_call not in text:
    raise SystemExit("projection focal call anchor changed")

helper_marker = "function projectDirectionalLight("
helper = """function resolveProjectionOutputSize(
  exportHeight: number,
  exportAspectRatio: number,
): { readonly width: number; readonly height: number } {
  const requestedHeight = clamp(Math.round(exportHeight), OUTPUT_MIN_HEIGHT, OUTPUT_MAX_EDGE);
  const aspect = clamp(exportAspectRatio, 0.1, 10);
  const requestedWidth = requestedHeight * aspect;
  const fitScale = Math.min(1, OUTPUT_MAX_EDGE / Math.max(requestedWidth, requestedHeight));
  return Object.freeze({
    width: Math.max(64, Math.round(requestedWidth * fitScale)),
    height: Math.max(64, Math.round(requestedHeight * fitScale)),
  });
}

"""
if "function resolveProjectionOutputSize(" not in text:
    if text.count(helper_marker) != 1:
        raise SystemExit("projection output helper anchor changed")
    text = text.replace(helper_marker, helper + helper_marker, 1)

old_size = """  const height = clamp(Math.round(source.output.exportHeight), OUTPUT_MIN_HEIGHT, OUTPUT_MAX_EDGE);
  const aspect = clamp(source.output.exportAspectRatio ?? 1, 0.1, 10);
  const width = clamp(Math.round(height * aspect), 64, OUTPUT_MAX_EDGE);
"""
new_size = """  const { width, height } = resolveProjectionOutputSize(
    source.output.exportHeight,
    source.output.exportAspectRatio ?? 1,
  );
"""
if old_size in text:
    text = text.replace(old_size, new_size, 1)
elif new_size not in text:
    raise SystemExit("projection output sizing anchor changed")
projection.write_text(text, encoding="utf-8")

document = Path("apps/web/src/domains/creator/scene3d/studio-scene3d-document.ts")
lines = document.read_text(encoding="utf-8").splitlines()
rewritten: list[str] = []
replaced_control_regex = False
for line in lines:
    if "u0000" in line and "test(value)" in line:
        indent = line[: len(line) - len(line.lstrip())]
        rewritten.extend([
            f"{indent}for (let index = 0; index < value.length; index += 1) {{",
            f"{indent}  const code = value.charCodeAt(index);",
            f"{indent}  if (code === 92 || code <= 31 || code === 127) return false;",
            f"{indent}}}",
        ])
        replaced_control_regex = True
    else:
        rewritten.append(line)
if not replaced_control_regex and "value.charCodeAt(index)" not in "\n".join(lines):
    raise SystemExit("safe URI control-character anchor changed")
document.write_text("\n".join(rewritten) + "\n", encoding="utf-8")

math_test = Path(
    "apps/web/src/domains/creator/scene3d/studio-scene3d-bg3d-projection-math.test.ts"
)
math_test.write_text(
    '''import { describe, expect, it } from "vitest";

import { studioBg3dFovDegreesToFocalLength } from "../bg3d/studio-bg3d-lens";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../bg3d/studio-bg3d-scene-document";
import { projectStudioBg3dDocumentToScene3d } from "./studio-scene3d-bg3d-projection";

describe("BG3D projection math contracts", () => {
  it("uses the canonical vertical-sensor focal conversion", () => {
    const projected = projectStudioBg3dDocumentToScene3d({
      documentId: "lens-contract",
      source: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      now: "2026-09-10T00:00:00.000Z",
    });

    expect(projected.cameras[0]?.focalLengthMm).toBeCloseTo(
      studioBg3dFovDegreesToFocalLength(
        DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera.fovDegrees,
      ),
      12,
    );
  });

  it("fits landscape output inside 4096px without distorting its aspect ratio", () => {
    const aspect = 2.4;
    const projected = projectStudioBg3dDocumentToScene3d({
      documentId: "landscape-contract",
      source: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
        output: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
          exportHeight: 2160,
          exportAspectRatio: aspect,
        },
      },
      now: "2026-09-10T00:00:00.000Z",
    });

    expect(Math.max(projected.output.width, projected.output.height)).toBeLessThanOrEqual(4096);
    expect(projected.output.width / projected.output.height).toBeCloseTo(aspect, 2);
  });
});
''',
    encoding="utf-8",
)
