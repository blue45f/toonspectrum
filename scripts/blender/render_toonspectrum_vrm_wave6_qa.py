"""Render delivered Wave 6 VRMs for reproducible visual QA and card art.

Unlike source-scene screenshots, this script imports the exported VRM through
the official Blender VRM Add-on, poses the imported skin and drives imported
shape keys.  Neutral views lower the arms from the humanoid T-pose so the face,
hands, clothing and footwear fill the frame; action views exercise elbows, a
knee, Iseul's prosthesis and bound expression targets.

The scene is cleared safely and no factory reset is performed.
"""

import argparse
from math import radians
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--view",
        choices=("front", "three-quarter", "rescue-pose", "flourish-pose", "face-closeup"),
        default="front",
    )
    parser.add_argument("--thumbnail", action="store_true")
    return parser.parse_args(raw)


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(collection):
            if datablock.users == 0:
                collection.remove(datablock)


def remove_incompatible_render_handlers():
    """Remove only the known add-on guard whose Blender 5.2 callback ABI changed."""
    removed = 0
    for handlers in (bpy.app.handlers.render_pre, bpy.app.handlers.render_complete):
        for handler in list(handlers):
            owner = getattr(handler, "__self__", None)
            if owner is not None and owner.__class__.__name__ == "RenderGuard":
                handlers.remove(handler)
                removed += 1
    return removed


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def evaluated_mesh_bounds():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    if not points:
        raise RuntimeError("Imported VRM contains no visible evaluated mesh")
    return (
        min(point.x for point in points),
        max(point.x for point in points),
        min(point.z for point in points),
        max(point.z for point in points),
    )


def armature_object():
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one imported armature, found {len(armatures)}")
    return armatures[0]


def set_pose_rotation(armature, bone_name, xyz_degrees):
    bone = armature.pose.bones.get(bone_name)
    if bone is None:
        raise RuntimeError(f"Imported VRM has no pose bone {bone_name!r}")
    bone.rotation_mode = "XYZ"
    bone.rotation_euler = tuple(radians(value) for value in xyz_degrees)


def set_shape_keys(names_to_values):
    applied = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.data.shape_keys is None:
            continue
        for key_name, value in names_to_values.items():
            key = obj.data.shape_keys.key_blocks.get(key_name)
            if key is not None:
                key.value = value
                applied.append(f"{obj.name}:{key_name}")
    if names_to_values and not applied:
        raise RuntimeError("Requested QA expression has no imported shape-key targets")
    return applied


def apply_qa_pose(armature, view):
    # Lowered neutral arms expose the torso and make thumbnails human-scale.
    set_pose_rotation(armature, "upper_arm.L", (-68, -4, -3))
    set_pose_rotation(armature, "upper_arm.R", (-68, 4, 3))
    set_pose_rotation(armature, "lower_arm.L", (-8, 0, 0))
    set_pose_rotation(armature, "lower_arm.R", (-8, 0, 0))
    if view == "rescue-pose":
        set_pose_rotation(armature, "upper_arm.L", (-16, -8, -10))
        set_pose_rotation(armature, "lower_arm.L", (-36, -5, -8))
        set_pose_rotation(armature, "upper_arm.R", (-61, 8, 4))
        set_pose_rotation(armature, "lower_arm.R", (-18, 4, 2))
        set_pose_rotation(armature, "upper_leg.R", (-16, 2, -3))
        set_pose_rotation(armature, "lower_leg.R", (42, 0, 0))
        return set_shape_keys({"Surprised": 0.70, "Wide": 0.58, "OH": 0.36})
    if view == "flourish-pose":
        set_pose_rotation(armature, "upper_arm.L", (-38, -8, -8))
        set_pose_rotation(armature, "lower_arm.L", (-24, 2, -6))
        set_pose_rotation(armature, "upper_arm.R", (-35, 7, 8))
        set_pose_rotation(armature, "lower_arm.R", (-28, -3, 6))
        set_pose_rotation(armature, "upper_leg.L", (-15, -2, 4))
        set_pose_rotation(armature, "lower_leg.L", (40, 0, 0))
        return set_shape_keys({"Happy": 0.76, "HappyBrow": 0.64, "Squint": 0.44})
    if view == "face-closeup":
        return set_shape_keys({"Happy": 0.42, "HappyBrow": 0.34})
    return []


def add_lighting(target, height):
    for location, energy, size, color in (
        ((-height * 1.5, -height * 1.8, target.z + height * 0.72), 520, 2.8, (1.0, 0.84, 0.72)),
        ((height * 1.45, -height * 0.8, target.z + height * 0.20), 350, 2.4, (0.56, 0.74, 1.0)),
        ((0.0, height * 1.5, target.z + height * 0.82), 620, 2.6, (0.68, 0.88, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        point_at(light, target)


def add_floor(min_z):
    bpy.ops.mesh.primitive_plane_add(size=16, location=(0, 0, min_z - 0.015))
    floor = bpy.context.object
    floor.name = "Wave6PreviewFloor"
    material = bpy.data.materials.new("Wave6PreviewFloorMaterial")
    material.diffuse_color = (0.018, 0.030, 0.055, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = material.diffuse_color
    shader.inputs["Roughness"].default_value = 0.78
    floor.data.materials.append(material)


def main():
    args = arguments()
    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    output.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    if bpy.ops.import_scene.vrm(filepath=str(source)) != {"FINISHED"}:
        raise RuntimeError(f"VRM import failed: {source}")
    armature = armature_object()
    expression_targets = apply_qa_pose(armature, args.view)
    bpy.context.view_layer.update()

    min_x, max_x, min_z, max_z = evaluated_mesh_bounds()
    height = max_z - min_z
    width = max_x - min_x
    center = Vector(((min_x + max_x) * 0.5, 0.0, (min_z + max_z) * 0.5))
    if args.view == "face-closeup":
        head_bone = armature.pose.bones.get("head")
        if head_bone is None:
            raise RuntimeError("Imported VRM has no head bone")
        center.z = (armature.matrix_world @ head_bone.center).z
        ortho_scale = height * 0.38
    else:
        aspect = (320 / 400) if args.thumbnail else (720 / 960)
        ortho_scale = max(height * 1.10, width / aspect * 1.10)

    distance = max(4.0, height * 3.0)
    if args.view in ("three-quarter", "rescue-pose"):
        camera_location = center + Vector((distance * 0.48, -distance * 0.88, height * 0.025))
    elif args.view == "flourish-pose":
        camera_location = center + Vector((distance * 0.62, -distance * 0.78, height * 0.025))
    else:
        camera_location = center + Vector((0.0, -distance, height * 0.015))
    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.object
    camera.name = "Wave6QACamera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = ortho_scale
    point_at(camera, center)
    bpy.context.scene.camera = camera
    add_lighting(center, height)
    add_floor(min_z)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 320 if args.thumbnail else 720
    scene.render.resolution_y = 400 if args.thumbnail else 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.world.color = (0.004, 0.008, 0.018)
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -0.30
    removed_handlers = remove_incompatible_render_handlers()
    bpy.ops.render.render(write_still=True)
    print(
        "WAVE6_QA_RENDER",
        source.name,
        args.view,
        f"{scene.render.resolution_x}x{scene.render.resolution_y}",
        len(expression_targets),
        f"ortho={ortho_scale:.3f}",
        f"handlers={removed_handlers}",
        str(output),
    )


if __name__ == "__main__":
    main()
