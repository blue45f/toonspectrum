"""Render reproducible visual-QA views for ToonSpectrum Wave 5 VRMs.

The script imports the exported file again through the official Blender VRM
Add-on, so every image validates the delivered binary rather than the source
scene. It supports neutral front/three-quarter views and two deliberately
articulated poses that exercise arms, a knee and facial morph targets.

Examples::

    blender -b --python scripts/blender/render_toonspectrum_vrm_wave5_qa.py -- \
      --input public/vrm/TS_Sunja_HaenyeoMentor.vrm \
      --output /tmp/wave5-sunja-front.png --view front

    blender -b --python scripts/blender/render_toonspectrum_vrm_wave5_qa.py -- \
      --input public/vrm/TS_Iseul_AdaptiveRescuer.vrm \
      --output /tmp/wave5-iseul-rescue-pose.png --view rescue-pose

Use ``--thumbnail`` for the catalog's exact 320x400 output. The scene is
cleared safely; this file never performs a Blender factory reset.
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
        choices=("front", "three-quarter", "rescue-pose", "flourish-pose"),
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
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(collection):
            if datablock.users == 0:
                collection.remove(datablock)


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def mesh_bounds():
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    if not points:
        raise RuntimeError("Imported VRM contains no visible mesh bounds")
    return (
        min(point.z for point in points),
        max(point.z for point in points),
        max(abs(point.x) for point in points),
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
    if not applied:
        raise RuntimeError("Requested QA expression has no real imported shape-key targets")
    return applied


def apply_qa_pose(armature, view):
    if view == "rescue-pose":
        # One arm signals upward while the other balances; the right knee is
        # flexed so Iseul's weighted prosthetic chain is visibly exercised.
        set_pose_rotation(armature, "upper_arm.L", (-10, -7, -20))
        set_pose_rotation(armature, "lower_arm.L", (3, -4, -38))
        set_pose_rotation(armature, "upper_arm.R", (8, 8, 16))
        set_pose_rotation(armature, "lower_arm.R", (-4, 3, 34))
        set_pose_rotation(armature, "upper_leg.R", (-14, 2, -3))
        set_pose_rotation(armature, "lower_leg.R", (38, 0, 0))
        return set_shape_keys({"Surprised": 0.70, "Wide": 0.58, "OH": 0.36})
    if view == "flourish-pose":
        # Open asymmetrical presentation pose for couture/fantasy silhouettes,
        # including a bent left knee and a clearly smiling bound expression.
        set_pose_rotation(armature, "upper_arm.L", (4, -8, -16))
        set_pose_rotation(armature, "lower_arm.L", (0, 2, -22))
        set_pose_rotation(armature, "upper_arm.R", (-5, 7, 14))
        set_pose_rotation(armature, "lower_arm.R", (0, -3, 25))
        set_pose_rotation(armature, "upper_leg.L", (-16, -2, 4))
        set_pose_rotation(armature, "lower_leg.L", (43, 0, 0))
        return set_shape_keys({"Happy": 0.76, "HappyBrow": 0.64, "Squint": 0.44})
    return []


def add_lighting(center_z):
    for location, energy, size, color in (
        ((-2.6, -3.4, 3.2), 330, 3.4, (1.0, 0.84, 0.72)),
        ((2.8, -1.8, 2.2), 210, 2.8, (0.58, 0.72, 1.0)),
        ((0.0, 2.5, 3.6), 390, 2.6, (0.72, 0.88, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        point_at(light, (0, 0, center_z))


def add_floor(min_z):
    bpy.ops.mesh.primitive_plane_add(size=16, location=(0, 0, min_z - 0.012))
    floor = bpy.context.object
    material = bpy.data.materials.new("Wave5PreviewFloor")
    material.diffuse_color = (0.022, 0.032, 0.060, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = material.diffuse_color
    shader.inputs["Roughness"].default_value = 0.82
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

    min_z, max_z, half_width = mesh_bounds()
    center_z = (min_z + max_z) * 0.5
    height = max_z - min_z
    distance = max(4.9, height * 2.65, half_width * 4.0)
    if args.view == "rescue-pose":
        camera_location = (-distance * 0.48, -distance * 0.88, center_z + height * 0.035)
    elif args.view == "flourish-pose":
        camera_location = (distance * 0.70, -distance * 0.70, center_z + height * 0.035)
    elif args.view == "three-quarter":
        camera_location = (distance * 0.48, -distance * 0.88, center_z + height * 0.035)
    else:
        camera_location = (0, -distance, center_z + height * 0.02)

    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.object
    camera.data.lens = 64
    point_at(camera, (0, 0, center_z))
    bpy.context.scene.camera = camera
    add_lighting(center_z)
    add_floor(min_z)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 320 if args.thumbnail else 720
    scene.render.resolution_y = 400 if args.thumbnail else 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.world.color = (0.006, 0.009, 0.018)
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -0.7
    bpy.ops.render.render(write_still=True)
    print(
        "WAVE5_QA_RENDER",
        source.name,
        args.view,
        f"{scene.render.resolution_x}x{scene.render.resolution_y}",
        len(expression_targets),
        str(output),
    )


if __name__ == "__main__":
    main()
