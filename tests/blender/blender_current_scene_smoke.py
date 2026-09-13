"""Dedicated background-Blender verification, never an artist's live process."""
from dataclasses import replace
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile
import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/blender"))
from toonstudio_blender_kit.contracts import load_config
from toonstudio_blender_kit.current_scene import export_current_character_package

base = load_config(ROOT / "config/blender/reference-character.json")
config = replace(base, character_id="bridge-roundtrip", display_name="Edited character",
    output_dir="batch_generated/blender-bridge-verification",
    hair=replace(base.hair, enabled=False),
    face=replace(base.face, create_semantic_shape_keys=False),
    render=replace(base.render, enabled=False),
    export=replace(base.export, export_animations=True))
scene = bpy.context.scene
cube = bpy.data.objects["Cube"]
cube["toonstudio_character_id"] = config.character_id
basis = cube.shape_key_add(name="Basis")
basis.data[0].co.z = -1.75
smile = cube.shape_key_add(name="Smile")
smile.data[0].co.x -= 0.3
smile.value = 0.35
cube.location = (0, 0, 0)
cube.keyframe_insert(data_path="location", frame=1)
cube.location = (2, 0, 0)
cube.keyframe_insert(data_path="location", frame=20)
scene.frame_set(7, subframe=0.25)
bpy.context.view_layer.objects.active = scene.camera
scene.camera.select_set(True)

def snapshot():
    return (bpy.data.filepath, scene.frame_current, scene.frame_subframe,
        scene.camera.name if scene.camera else None,
        bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None,
        sorted((obj.name, obj.select_get(), obj.hide_get(), tuple(obj.location)) for obj in scene.objects))

before = snapshot()
first = export_current_character_package(config, project_root=ROOT)
assert snapshot() == before, "Artist scene state changed"
assert abs(basis.data[0].co.z + 1.75) < 0.00001
assert abs(smile.value - 0.35) < 0.00001
model = first.output_dir / "bridge-roundtrip.glb"
content = model.read_bytes()
length = struct.unpack_from("<I", content, 12)[0]
document = json.loads(content[20:20 + length])
assert document.get("animations"), "Animation was lost"
assert document["meshes"][0]["primitives"][0].get("targets"), "Shape key was lost"
archive = first.output_dir / "bridge-roundtrip.toonchar.zip"
with zipfile.ZipFile(archive) as package:
    assert not any(name.endswith(".blend") for name in package.namelist())
    receipt = first.package_manifest["files"]["glb"]
    assert hashlib.sha256(package.read(receipt["path"])).hexdigest() == receipt["sha256"]
archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
second = export_current_character_package(config, project_root=ROOT)
assert first.output_dir != second.output_dir
assert hashlib.sha256(archive.read_bytes()).hexdigest() == archive_hash
assert snapshot() == before
imported_scene = bpy.data.scenes.new("Roundtrip validation")
bpy.context.window.scene = imported_scene
bpy.ops.import_scene.gltf(filepath=str(model))
imported = next(obj for obj in imported_scene.objects if obj.type == "MESH")
assert imported.data.shape_keys is not None
assert "Smile" in imported.data.shape_keys.key_blocks
assert any(abs(vertex.co.z + 1.75) < 0.00001
    for vertex in imported.data.shape_keys.key_blocks[0].data)
bpy.context.window.scene = scene
result = {"blender": bpy.app.version_string,
    "checks": ["scene-state", "edited-geometry-roundtrip", "shape-keys", "animation-export",
        "archive-hash", "private-source-exclusion", "revision-preservation"],
    "runtimeArchive": str(archive)}
(ROOT / config.output_dir / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
print("BLENDER_BRIDGE_VERIFIED " + json.dumps(result))

# Verify authored hair/semantic shapes from the existing production pipeline too.
from toonstudio_blender_kit.pipeline import run_pipeline
authored_config = replace(base, output_dir=config.output_dir,
    render=replace(base.render, enabled=False))
authored = run_pipeline(authored_config, project_root=ROOT)
assert (authored.output_dir / "reference-character.toonchar.zip").is_file()
before_authored = snapshot()
reexport = export_current_character_package(authored_config, project_root=ROOT)
assert snapshot() == before_authored
assert reexport.package_manifest["capabilities"]["authoredHair"]["enabled"]
assert reexport.package_manifest["capabilities"]["semanticFaceShapes"]["shapeKeys"]
result["authoredArchive"] = str(reexport.output_dir / "reference-character.toonchar.zip")
result["checks"].extend(["authored-pipeline-archive", "authored-hair-and-face-reexport"])
(ROOT / config.output_dir / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
print("BLENDER_AUTHORED_BRIDGE_VERIFIED " + json.dumps(result))

# Failed revision export must keep both artist state and previously published files.
from toonstudio_blender_kit import current_scene, register, unregister
original_export = current_scene._export_glb
prior_revisions = set(reexport.output_dir.parent.iterdir())
def fail_export(*_args, **_kwargs):
    raise RuntimeError("test-only export failure")
current_scene._export_glb = fail_export
try:
    try:
        export_current_character_package(authored_config, project_root=ROOT)
        raise AssertionError("Expected the injected failure")
    except RuntimeError as error:
        assert "test-only export failure" in str(error)
finally:
    current_scene._export_glb = original_export
assert snapshot() == before_authored
assert set(reexport.output_dir.parent.iterdir()) == prior_revisions
register()
try:
    assert bpy.ops.toonstudio.export_current_character.get_rna_type().name
finally:
    unregister()
result["checks"].extend(["failure-rollback", "operator-registration"])
(ROOT / config.output_dir / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
print("BLENDER_BRIDGE_ALL_CHECKS_PASSED " + json.dumps(result))
