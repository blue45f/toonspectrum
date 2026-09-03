#!/usr/bin/env python3
from __future__ import annotations

import base64
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD_DIR = ROOT / "scripts" / ".shaper-quality-payload"

encoded = "".join(
    (PAYLOAD_DIR / f"{index:02d}.txt").read_text(encoding="utf-8").strip()
    for index in range(6)
)
source = zlib.decompress(base64.b64decode(encoded, validate=True)).decode("utf-8")
# Some transport layers rewrite comment openers inside compressed generator literals.
# Restore the four audited JSDoc markers before compiling the migration itself.
source = source.replace("**()", "/**")
exec(compile(source, str(Path(__file__).with_name("shaper-quality-closure.payload.py")), "exec"))

# Keep generated imports in the repository's type-import ordering contract.
semantic_path = ROOT / "src/domains/creator/vrm/studio-vrm-semantic-face-morph.ts"
semantic = semantic_path.read_text(encoding="utf-8")
semantic = semantic.replace(
    'import type * as THREE from "three";\n\nimport {\n',
    'import {\n',
    1,
)
semantic = semantic.replace(
    'import type { VRM } from "@pixiv/three-vrm";\n',
    'import type { VRM } from "@pixiv/three-vrm";\nimport type * as THREE from "three";\n',
    1,
)
semantic_path.write_text(semantic, encoding="utf-8")

# The supported standing-pose path now calls commitPose directly.
mannequin_path = ROOT / "src/domains/creator/scene-3d/StudioMannequinPoserPanel.tsx"
mannequin = mannequin_path.read_text(encoding="utf-8")
old_dependencies = '  }, [applyPosePreset, commitParams, params]);'
new_dependencies = '  }, [applyPosePreset, commitParams, commitPose, params]);'
if mannequin.count(old_dependencies) != 1:
    raise RuntimeError("mannequin Shaper callback dependency anchor changed")
mannequin_path.write_text(
    mannequin.replace(old_dependencies, new_dependencies, 1),
    encoding="utf-8",
)

# The mannequin integration test must verify the independent ToonStudio surface, not competitor
# branding or a disabled hair slot. It also proves a supported face recipe reaches the scene.
mannequin_test_path = ROOT / "src/domains/creator/scene-3d/StudioMannequinPoserPanel.test.tsx"
mannequin_test = mannequin_test_path.read_text(encoding="utf-8")
old_mannequin_test = '''  it("셰이퍼 탭을 클릭하면 Shaper 패널이 렌더링되고 프리셋 선택이 씬에 반영된다", async () => {
    renderPanel();
    const shaperTab = screen.getByRole("button", { name: /^셰이퍼/ });
    fireEvent.click(shaperTab);

    expect(screen.getByText("3D 셰이퍼 (Webtoon Shaper)")).toBeTruthy();
    expect(screen.getByText("SHAPER")).toBeTruthy();

    // Select hair preset
    const hairChip = screen.getByRole("button", { name: "헤어" });
    fireEvent.click(hairChip);
    const bobPreset = screen.getByRole("button", { name: /시스루 뱅 단발/i });
    fireEvent.click(bobPreset);
  });'''
new_mannequin_test = '''  it("셰이퍼 탭은 독립 ToonStudio 레시피를 열고 지원되는 얼굴형을 씬에 반영한다", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^셰이퍼/ }));

    expect(screen.getByRole("tab", { name: "캐릭터 레시피" })).toBeTruthy();
    expect(screen.queryByText("SHAPER")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "얼굴형" }));
    fireEvent.click(screen.getByRole("button", { name: /둥근 동안형/u }));
    await waitFor(() => {
      expect(sceneHandle.setBodySpec).toHaveBeenCalled();
    });
  });'''
if mannequin_test.count(old_mannequin_test) != 1:
    raise RuntimeError("mannequin integration test anchor changed")
mannequin_test_path.write_text(
    mannequin_test.replace(old_mannequin_test, new_mannequin_test, 1),
    encoding="utf-8",
)

# Flattening the strand cross-section intentionally makes total X spread a poor wave metric.
# Measure displacement of each ring's centerline instead, which is the semantic property of wave.
hair_test_path = ROOT / "src/domains/creator/vrm/StudioVrmAvatarForge.test.ts"
hair_test = hair_test_path.read_text(encoding="utf-8")
old_wave_assertion = '''    const spreadX = (values: Float32Array) => {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < values.length; index += 3) {
        min = Math.min(min, values[index]);
        max = Math.max(max, values[index]);
      }
      return max - min;
    };
    expect(spreadX(after.array)).toBeGreaterThan(spreadX(before.array) * 1.3);'''
new_wave_assertion = '''    const ringCenterXs = (values: Float32Array) =>
      Array.from({ length: 15 }, (_, row) => {
        let total = 0;
        for (let column = 0; column < 10; column += 1) {
          total += values[(row * 10 + column) * 3] ?? 0;
        }
        return total / 10;
      });
    const beforeCenters = ringCenterXs(before.array);
    const afterCenters = ringCenterXs(after.array);
    const maximumCenterlineShift = Math.max(
      ...afterCenters.map((value, index) => Math.abs(value - (beforeCenters[index] ?? 0))),
    );
    expect(maximumCenterlineShift).toBeGreaterThan(0.1);'''
if hair_test.count(old_wave_assertion) != 1:
    raise RuntimeError("hair wave assertion anchor changed")
hair_test_path.write_text(
    hair_test.replace(old_wave_assertion, new_wave_assertion, 1),
    encoding="utf-8",
)
