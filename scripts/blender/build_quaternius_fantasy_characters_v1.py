"""Assemble four genuinely distinct free Quaternius outfits with skinned heads.

Use the official Standard archives unpacked under artifacts/studio-asset-expansion.
No original archive, source model, live Blender scene or prior public asset is changed.
Run with Blender --factory-startup -b --python-exit-code 1 --python this_file.py.
"""
import json
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "artifacts/studio-asset-expansion"
SOURCE = ART / "source-extracted"
BASE = SOURCE / "Universal Base Characters[Standard]"
OUTFITS = SOURCE / "Modular Character Outfits - Fantasy[Standard]"
ASSEMBLED = ART / "assembled-fantasy-v1"
PREVIEWS = ART / "previews/fantasy-v1"
PROFILES = [
    ("quaternius-female-peasant", "Female", "Peasant", "Hair_Buns"),
    ("quaternius-male-peasant", "Male", "Peasant", "Hair_SimpleParted"),
    ("quaternius-female-ranger", "Female", "Ranger", "Hair_BuzzedFemale"),
    ("quaternius-male-ranger", "Male", "Ranger", "Hair_Buzzed"),
]


def import_asset(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    imported = [o for o in bpy.context.scene.objects if o not in before]
    armature = next(o for o in imported if o.type == "ARMATURE")
    meshes = [o for o in imported if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]
    return armature, meshes, imported


def rebind(obj, target):
    world = obj.matrix_world.copy()
    obj.parent = target
    obj.matrix_world = world
    for mod in obj.modifiers:
        if mod.type == "ARMATURE":
            mod.object = target


def transfer_rest_shape(obj, source, target):
    """Apply source-to-target bind matrices with the existing vertex weights."""
    groups = {g.index: g.name for g in obj.vertex_groups}
    transforms = {
        name: target.matrix_world @ target.data.bones[name].matrix_local
        @ (source.matrix_world @ source.data.bones[name].matrix_local).inverted()
        for name in source.data.bones.keys() if name in target.data.bones
    }
    inverse = obj.matrix_world.inverted()
    for vertex in obj.data.vertices:
        world = obj.matrix_world @ vertex.co
        result = Vector((0, 0, 0))
        total = 0.0
        for group in vertex.groups:
            transform = transforms.get(groups[group.group])
            if transform is not None:
                result += (transform @ world) * group.weight
                total += group.weight
        if total > 0:
            vertex.co = inverse @ (result / total)
    obj.data.update()


def head_only(obj, source_armature):
    """Retain authored face/neck topology and weights, not a replacement primitive."""
    weights = {g.index for g in obj.vertex_groups if g.name in {"Head", "neck_01"}}
    keep = {
        v.index for v in obj.data.vertices
        if sum(g.weight for g in v.groups if g.group in weights) > 0.015
    }
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
    neck = source_armature.matrix_world @ source_armature.data.bones["neck_01"].head_local
    plane = obj.matrix_world.inverted() @ Vector((0, 0, neck.z - 0.025))
    normal = obj.matrix_world.to_3x3().transposed() @ Vector((0, 0, 1))
    bmesh.ops.bisect_plane(
        bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=plane, plane_no=normal, clear_inner=True, clear_outer=False,
    )
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    obj.name = "GEO-Authored skinned head and neck"


def knee_underlayer(body, source_armature):
    """Keep authored skinned knee geometry inside open articulated boot cuffs."""
    obj = body.copy()
    obj.data = body.data.copy()
    bpy.context.scene.collection.objects.link(obj)
    obj.name = "GEO-Skinned fabric knee underlayer"
    knees = [source_armature.matrix_world @ source_armature.data.bones[name].head_local for name in ("calf_l", "calf_r")]
    keep = set()
    inverse = obj.matrix_world.inverted()
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        knee = min(knees, key=lambda k: abs(k.x - point.x))
        if abs(point.z - knee.z) < 0.145 and abs(point.x - knee.x) < 0.16:
            keep.add(vertex.index)
            point.x = knee.x + (point.x - knee.x) * 0.90
            point.y = knee.y + (point.y - knee.y) * 0.90
            vertex.co = inverse @ point
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if vertex.index not in keep], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    material = bpy.data.materials.new("MAT-Dark ranger knee fabric")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.026, 0.055, 0.03, 1)
    shader.inputs["Roughness"].default_value = 0.92
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    obj.data.update()
    return obj


def prepare_images():
    corrections = []
    used = {
        node.image for obj in bpy.context.scene.objects if obj.type == "MESH"
        for slot in obj.material_slots if slot.material and slot.material.use_nodes
        for node in slot.material.node_tree.nodes
        if node.type == "TEX_IMAGE" and node.image
    }
    for image in used:
        if image.source != "FILE":
            continue
        path = Path(bpy.path.abspath(image.filepath))
        if not path.exists() and "source-extracted/" in path.as_posix():
            path = SOURCE / path.as_posix().split("source-extracted/", 1)[1]
            image.filepath = str(path)
        if not path.exists() and path.name.endswith("_png.png"):
            replacement = path.with_name(path.name.replace("_png.png", ".png"))
            if not replacement.exists():
                raise RuntimeError(f"Missing official source normal: {replacement}")
            image.filepath = str(replacement)
            image.reload()
            corrections.append(f"Corrected official glTF URI typo in memory: {path.name}")
        if image.size[0] <= 0:
            raise RuntimeError(f"Unresolved source texture: {image.filepath}")
        largest = max(image.size)
        limit = 512 if "_orm" in image.name.lower() or "roughness" in image.name.lower() else 1024
        if largest > limit:
            factor = limit / largest
            image.scale(round(image.size[0] * factor), round(image.size[1] * factor))
        image.pack()
    return corrections


def render_preview(path, selected):
    scene = bpy.context.scene
    points = [o.matrix_world @ Vector(p) for o in selected if o.type == "MESH" for p in o.bound_box]
    minimum = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    maximum = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (minimum + maximum) / 2
    span = max(maximum.z - minimum.z, (maximum.x - minimum.x) * 0.88) * 1.14
    camera_data = bpy.data.cameras.new("CAM-Review")
    camera = bpy.data.objects.new("CAM-Review", camera_data)
    scene.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = span
    camera.location = center + Vector((0.22, -5.0, 0.12))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.24, 0.28, 0.32, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
    for name, location, power, size in [
        ("Key", (3, -4, 5), 650, 4),
        ("Fill", (-3, -2, 3), 420, 3),
        ("Rim", (2, 3, 4), 850, 3),
    ]:
        data = bpy.data.lights.new("LIGHT-" + name, "AREA")
        data.energy = power
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new("LIGHT-" + name, data)
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def build(profile):
    asset_id, sex, outfit, hair = profile
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # Remove only unused datablocks in this factory-startup process.
    for image in list(bpy.data.images):
        if image.users == 0:
            bpy.data.images.remove(image)
    outfit_path = OUTFITS / "Exports/glTF (Godot-Unreal)/Outfits" / f"{sex}_{outfit}.gltf"
    armature, clothing, _ = import_asset(outfit_path)
    base_path = BASE / "Base Characters/Godot - UE" / f"Superhero_{sex}_FullBody.gltf"
    body_armature, heads, _ = import_asset(base_path)
    rest_error = max(
        max(abs(a - b) for a, b in zip(
            (armature.matrix_world @ armature.data.bones[name].matrix_local).col[j],
            (body_armature.matrix_world @ body_armature.data.bones[name].matrix_local).col[j],
        )) for name in armature.data.bones.keys() for j in range(4)
    )
    body_mesh = max(heads, key=lambda obj: len(obj.data.vertices))
    if outfit == "Ranger":
        heads.append(knee_underlayer(body_mesh, body_armature))
    for obj in heads:
        if obj == body_mesh:
            head_only(obj, body_armature)
        if rest_error > 0.0001:
            transfer_rest_shape(obj, body_armature, armature)
        rebind(obj, armature)
    hair_path = BASE / "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)" / f"{hair}.gltf"
    hair_armature, hairs, _ = import_asset(hair_path)
    transform = (
        armature.matrix_world @ armature.data.bones["Head"].matrix_local
        @ (hair_armature.matrix_world @ hair_armature.data.bones["Head"].matrix_local).inverted()
    )
    for obj in hairs:
        obj.matrix_world = transform @ obj.matrix_world
        rebind(obj, armature)
    selected = [armature] + clothing + heads + hairs
    for obj in list(bpy.context.scene.objects):
        if obj not in selected:
            bpy.data.objects.remove(obj, do_unlink=True)
    armature.name = "RIG-Quaternius humanoid"
    armature["source_author"] = "Quaternius"
    armature["source_license"] = "CC0-1.0"
    armature["assembly"] = "Free Standard outfit plus authored base head and hairstyle"
    corrections = prepare_images()
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    output = ASSEMBLED / f"{asset_id}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_apply=False, export_skins=True, export_animations=True,
        export_yup=True, export_extras=True, export_image_format="AUTO",
        export_cameras=False, export_lights=False,
    )
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSEMBLED / f"{asset_id}.blend"))
    render_preview(PREVIEWS / f"{asset_id}-blender.png", selected)
    record = {
        "id": asset_id, "sex": sex, "outfit": outfit, "hair": hair,
        "sourceBase": str(base_path.relative_to(ROOT)),
        "sourceOutfit": str(outfit_path.relative_to(ROOT)),
        "sourceHair": str(hair_path.relative_to(ROOT)),
        "sourceRestMatrixMaxDifference": rest_error,
        "headBindTransfer": "weighted-source-to-target" if rest_error > 0.0001 else "identical-bind-pose",
        "bones": len(armature.data.bones),
        "meshCount": len(selected) - 1, "bytes": output.stat().st_size,
        "corrections": corrections, "expressions": False,
        "kneeUnderlayer": outfit == "Ranger",
        "notes": "Original clothing and head skin weights preserved; body cropped to buried neck seam; basecolor/normal textures limited to 1024px, ORM/roughness to 512px. No source clips in these free source GLTFs.",
    }
    print("ASSEMBLED " + json.dumps(record))
    return record


if __name__ == "__main__":
    ASSEMBLED.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    records = [build(profile) for profile in PROFILES]
    (ART / "fantasy-assembly-report.json").write_text(json.dumps(records, indent=2) + "\n")
