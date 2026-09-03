#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(
            f"{relative}: expected one match, found {count}: {old[:120]!r}"
        )
    write(relative, source.replace(old, new, 1))


render_path = "tools/blender/toonstudio_blender_kit/render.py"
replace_once(
    render_path,
    '''\ndef _set_expression(objects: Sequence[bpy.types.Object], expression: str) -> dict[tuple[str, str], float]:\n''',
    '''\ndef _is_generated_shape_key(obj: bpy.types.Object, key_name: str) -> bool:\n    """Read generator metadata from the owning object, not ShapeKey ID properties.\n\n    Blender 5.2's ShapeKey RNA type does not guarantee ``IDProperty`` access, while\n    ``face.py`` deliberately stores the provenance marker on the mesh object.\n    """\n\n    marker = f"toonstudio_shape_{_normalize(key_name)}_generated"\n    return bool(obj.get(marker, False))\n\n\ndef _set_expression(objects: Sequence[bpy.types.Object], expression: str) -> dict[tuple[str, str], float]:\n''',
)
replace_once(
    render_path,
    '''            and not key.get("toonstudio_generated", False)\n            and any(alias in _normalize(key.name) for alias in aliases)\n''',
    '''            and not _is_generated_shape_key(obj, key.name)\n            and any(alias in _normalize(key.name) for alias in aliases)\n''',
)

pipeline_path = "tools/blender/toonstudio_blender_kit/pipeline.py"
replace_once(
    pipeline_path,
    "from dataclasses import dataclass, replace\n",
    "from dataclasses import dataclass\n",
)

pipeline = read(pipeline_path)
start_token = "    score = calculate_score(issues)\n"
end_token = "    if config.strict and not report.passed:\n"
start = pipeline.index(start_token)
end = pipeline.index(end_token, start)
replacement = '''    # Declare stable sibling paths before serialising the report.  The report can\n    # reference its manifest without hashing itself; the manifest is written only\n    # after the final report bytes exist, so its qualityReport receipt is immutable.\n    outputs["qualityReport"] = "quality-report.json"\n    outputs["manifest"] = "character-package.json"\n\n    score = calculate_score(issues)\n    passed = score >= config.quality.minimum_score and not any(issue.severity == "error" for issue in issues)\n    report = PipelineReport(\n        character_id=config.character_id,\n        config_digest=config.digest(),\n        blender_version=_version_text(bpy.app.version[:3]),\n        vrm_addon_version=_detect_vrm_addon_version(),\n        score=score,\n        passed=passed,\n        metrics={\n            **dict(audit.metrics),\n            "hiddenSourceHairMeshes": list(hidden_hair),\n            "renderedViews": list(render_result.rendered_views),\n            "renderedExpressions": list(render_result.rendered_expressions),\n            "outputCount": len(outputs),\n            "sourceActualSha256": source_sha256 or "generated-reference",\n            "vrmCustomExpressionStatus": (\n                vrm_expression_result.status if vrm_expression_result else "unavailable"\n            ),\n            "vrmCustomExpressionCount": (\n                len(vrm_expression_result.expression_names) if vrm_expression_result else 0\n            ),\n        },\n        issues=tuple(issues),\n        outputs=dict(outputs),\n    )\n    write_json(output_dir / "quality-report.json", report.to_mapping())\n    manifest = _build_manifest(\n        config,\n        report,\n        outputs,\n        output_dir,\n        hair_result,\n        face_result,\n        hidden_hair,\n        vrm_expression_result,\n        source_sha256,\n    )\n    write_json(output_dir / "character-package.json", manifest)\n\n'''
write(pipeline_path, pipeline[:start] + replacement + pipeline[end:])

regression_test = '''from __future__ import annotations\n\nfrom pathlib import Path\nimport unittest\n\n\nROOT = Path(__file__).resolve().parents[2]\nKIT = ROOT / "tools" / "blender" / "toonstudio_blender_kit"\n\n\nclass BlenderPipelineRegressionTests(unittest.TestCase):\n    def test_expression_preview_reads_mesh_owned_shape_provenance(self) -> None:\n        source = (KIT / "render.py").read_text(encoding="utf-8")\n        self.assertIn("def _is_generated_shape_key", source)\n        self.assertIn("obj.get(marker, False)", source)\n        self.assertIn("not _is_generated_shape_key(obj, key.name)", source)\n        self.assertNotIn('key.get("toonstudio_generated"', source)\n\n    def test_quality_report_is_final_before_manifest_receipts_are_hashed(self) -> None:\n        source = (KIT / "pipeline.py").read_text(encoding="utf-8")\n        quality_role = source.index('outputs["qualityReport"] = "quality-report.json"')\n        manifest_role = source.index('outputs["manifest"] = "character-package.json"')\n        report_build = source.index("report = PipelineReport(", quality_role)\n        report_write = source.index('write_json(output_dir / "quality-report.json"', report_build)\n        manifest_build = source.index("manifest = _build_manifest(", report_write)\n        manifest_write = source.index('write_json(output_dir / "character-package.json"', manifest_build)\n\n        self.assertLess(quality_role, report_build)\n        self.assertLess(manifest_role, report_build)\n        self.assertLess(report_build, report_write)\n        self.assertLess(report_write, manifest_build)\n        self.assertLess(manifest_build, manifest_write)\n        self.assertEqual(source.count('write_json(output_dir / "quality-report.json"'), 1)\n        self.assertNotIn("replace(report", source)\n\n\nif __name__ == "__main__":\n    unittest.main()\n'''
write("tests/blender/test_pipeline_regressions.py", regression_test)

print("Repaired Blender 5.2 expression preview and immutable package receipts")
