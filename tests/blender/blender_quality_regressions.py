"""Run with Blender after installing the pinned VRM add-on; no production files are modified."""
from pathlib import Path
import sys
import unittest

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "blender"))

from toonstudio_blender_kit.contracts import load_config  # noqa: E402
from toonstudio_blender_kit.quality import audit_character, _armature_bone_coverage  # noqa: E402


class ImportedCharacterQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for obj in list(bpy.data.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.ops.import_scene.vrm(filepath=str(ROOT / "apps/web/public/vrm/Avatar_Orion.vrm"))
        cls.armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
        cls.meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        cls.config = load_config(ROOT / "config/blender/avatar-orion-production.json")

    def test_semantic_chest_mapping_does_not_require_a_chest_named_bone(self):
        chest = self.armature.data.vrm_addon_extension.vrm1.humanoid.human_bones.chest
        self.assertEqual(chest.node.bone_name, "mixamorig:Spine2")
        self.assertEqual(_armature_bone_coverage(self.armature), (17, []))
        chest.node.bone_name = ""
        try:
            self.assertIn("chest", _armature_bone_coverage(self.armature)[1])
        finally:
            chest.node.bone_name = "mixamorig:Spine2"

    def test_audited_source_counts_remain_visible_and_unlisted_geometry_fails(self):
        audit = audit_character(self.config, self.meshes, self.armature)
        self.assertEqual(audit.metrics["nonManifoldEdges"], 11996)
        self.assertEqual(audit.metrics["auditedSourceNonManifoldEdges"], 11996)
        self.assertEqual(audit.metrics["unexpectedNonManifoldEdges"], 0)
        self.assertFalse(any(issue.code == "topology.non_manifold" for issue in audit.issues))
        body = next(obj for obj in self.meshes if obj.name == "Avatar_Orion_Body")
        name = body.name
        body.name = "unreviewed-import"
        try:
            changed = audit_character(self.config, self.meshes, self.armature)
            self.assertTrue(any(issue.code == "topology.non_manifold" for issue in changed.issues))
        finally:
            body.name = name
        body["toonstudio_authored_hair"] = True
        try:
            authored = audit_character(self.config, self.meshes, self.armature)
            self.assertTrue(any(issue.code == "topology.non_manifold" for issue in authored.issues))
        finally:
            del body["toonstudio_authored_hair"]


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ImportedCharacterQualityTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)
