"""Generate ToonSpectrum's original lightweight VRM 1.0 character pack.

This file is intentionally self-contained so its source can be sent to Blender
through the Blender MCP ``execute_blender_code`` tool.  It uses the official
VRM Add-on exporter instead of rewriting a glTF JSON chunk after export.

Requirements:
  - Blender 5.2+
  - VRM Add-on for Blender 4.5+

The output is a set of compact, stylized, fully skinned VRM 1.0 characters.
Every visible mesh has an Armature modifier, JOINTS_0 and WEIGHTS_0, and the
shared rig includes the complete VRM hand/finger skeleton produced by the
add-on's humanoid generator.
"""

import bpy
from mathutils import Vector


OUTPUT_DIR = bpy.path.abspath("//public/vrm")
AUTHOR = "ToonSpectrum"


CHARACTERS = (
    {
        "file": "TS_Minseo_Campus.vrm",
        "name": "민서 (캠퍼스 메이커)",
        "height": 1.65,
        "heads": 7.1,
        "age": 0.78,
        "shoulder": 0.074,
        "body": (1.00, 0.94, 1.00),
        "skin": (0.78, 0.55, 0.39, 1.0),
        "primary": (0.10, 0.16, 0.29, 1.0),
        "secondary": (0.90, 0.31, 0.18, 1.0),
        "accent": (0.92, 0.86, 0.76, 1.0),
        "hair": (0.08, 0.045, 0.035, 1.0),
        "style": "campus",
    },
    {
        "file": "TS_Taeo_Barista.vrm",
        "name": "태오 (동네 바리스타)",
        "height": 1.73,
        "heads": 6.8,
        "age": 0.82,
        "shoulder": 0.095,
        "body": (1.20, 1.10, 1.13),
        "skin": (0.60, 0.36, 0.23, 1.0),
        "primary": (0.10, 0.35, 0.33, 1.0),
        "secondary": (0.45, 0.20, 0.10, 1.0),
        "accent": (0.78, 0.67, 0.51, 1.0),
        "hair": (0.035, 0.022, 0.017, 1.0),
        "style": "barista",
    },
    {
        "file": "TS_Jeonghwa_Gardener.vrm",
        "name": "정화 (노년 정원사)",
        "height": 1.58,
        "heads": 6.55,
        "age": 0.88,
        "shoulder": 0.066,
        "body": (0.96, 1.02, 0.98),
        "skin": (0.69, 0.46, 0.32, 1.0),
        "primary": (0.25, 0.34, 0.20, 1.0),
        "secondary": (0.40, 0.23, 0.31, 1.0),
        "accent": (0.78, 0.72, 0.62, 1.0),
        "hair": (0.58, 0.56, 0.53, 1.0),
        "style": "gardener",
    },
    {
        "file": "TS_Haram_Explorer.vrm",
        "name": "하람 (어린 탐험가)",
        "height": 1.34,
        "heads": 5.3,
        "age": 0.18,
        "shoulder": 0.055,
        "body": (0.88, 0.91, 0.90),
        "skin": (0.73, 0.49, 0.31, 1.0),
        "primary": (0.82, 0.50, 0.08, 1.0),
        "secondary": (0.16, 0.42, 0.56, 1.0),
        "accent": (0.72, 0.18, 0.12, 1.0),
        "hair": (0.10, 0.055, 0.025, 1.0),
        "style": "explorer",
    },
    {
        "file": "TS_Yeonhui_RuneGuard.vrm",
        "name": "연휘 (룬 수호자)",
        "height": 1.79,
        "heads": 7.6,
        "age": 0.86,
        "shoulder": 0.092,
        "body": (1.08, 0.98, 1.03),
        "skin": (0.30, 0.16, 0.10, 1.0),
        "primary": (0.11, 0.10, 0.29, 1.0),
        "secondary": (0.42, 0.23, 0.10, 1.0),
        "accent": (0.10, 0.68, 0.72, 1.0),
        "hair": (0.025, 0.018, 0.022, 1.0),
        "style": "rune_guard",
    },
    {
        "file": "TS_Nova_ServiceAndroid.vrm",
        "name": "노바 (서비스 안드로이드)",
        "height": 1.82,
        "heads": 7.25,
        "age": 0.90,
        "shoulder": 0.096,
        "body": (1.04, 0.94, 1.00),
        "skin": (0.66, 0.70, 0.74, 1.0),
        "primary": (0.055, 0.07, 0.095, 1.0),
        "secondary": (0.70, 0.75, 0.78, 1.0),
        "accent": (0.96, 0.46, 0.05, 1.0),
        "hair": (0.055, 0.07, 0.095, 1.0),
        "style": "android",
    },
)


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials):
        for datablock in list(collection):
            if datablock.users == 0:
                collection.remove(datablock)


def make_material(name, rgba, metallic=0.0, roughness=0.62, emission=None):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        emission_rgba, strength = emission
        shader.inputs["Emission Color"].default_value = emission_rgba
        shader.inputs["Emission Strength"].default_value = strength
    return material


def rig_mesh(obj, armature, bone_name, material):
    if material:
        obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("TS_Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    return obj


def ellipsoid(name, location, scale, armature, bone_name, material, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return rig_mesh(obj, armature, bone_name, material)


def limb(name, start, end, radius, armature, bone_name, material, depth=0.92):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    obj = ellipsoid(
        name,
        (start + end) * 0.5,
        (radius, radius * depth, direction.length * 0.5),
        armature,
        bone_name,
        material,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def bone_head(armature, name):
    return armature.data.bones[name].head_local.copy()


def bone_tail(armature, name):
    return armature.data.bones[name].tail_local.copy()


def add_character_meshes(spec, armature):
    unit = spec["height"] / spec["heads"]
    width, depth, limb_scale = spec["body"]
    prefix = spec["file"].replace(".vrm", "")

    skin = make_material(prefix + "_Skin", spec["skin"], roughness=0.72)
    primary = make_material(prefix + "_Primary", spec["primary"], roughness=0.64)
    secondary = make_material(prefix + "_Secondary", spec["secondary"], roughness=0.58)
    hair = make_material(prefix + "_Hair", spec["hair"], roughness=0.76)
    accent_emission = None
    if spec["style"] in ("rune_guard", "android"):
        accent_emission = (spec["accent"], 2.0)
    accent = make_material(
        prefix + "_Accent",
        spec["accent"],
        metallic=0.35 if spec["style"] == "android" else 0.05,
        roughness=0.32,
        emission=accent_emission,
    )
    eye = make_material(prefix + "_Eye", (0.93, 0.96, 0.98, 1.0), roughness=0.32)
    pupil = make_material(prefix + "_Pupil", (0.012, 0.018, 0.026, 1.0), roughness=0.44)

    hips = bone_head(armature, "hips")
    chest = bone_head(armature, "chest")
    neck = bone_head(armature, "neck")
    head = bone_head(armature, "head")
    head_tip = bone_tail(armature, "head")
    shoulder_z = bone_head(armature, "upper_arm.L").z

    ellipsoid(prefix + "_Pelvis", (0, 0, hips.z + unit * 0.06),
              (unit * 0.82 * width, unit * 0.50 * depth, unit * 0.62),
              armature, "hips", primary)
    ellipsoid(prefix + "_Abdomen", (0, 0, (hips.z + chest.z) * 0.5),
              (unit * 0.72 * width, unit * 0.46 * depth, (chest.z - hips.z) * 0.43),
              armature, "spine", secondary)
    ellipsoid(prefix + "_Chest", (0, 0, (chest.z + neck.z) * 0.5 - unit * 0.08),
              (unit * 1.02 * width, unit * 0.50 * depth, (neck.z - chest.z) * 0.48),
              armature, "chest", primary)
    ellipsoid(prefix + "_Neck", (0, 0, (neck.z + head.z) * 0.5),
              (unit * 0.30, unit * 0.27, max(unit * 0.28, (head.z - neck.z) * 0.48)),
              armature, "neck", skin, 18, 10)

    face_center = (head + head_tip) * 0.5
    face_center.y = -unit * 0.01
    ellipsoid(prefix + "_Head", face_center,
              (unit * 0.50, unit * 0.43, unit * 0.60), armature, "head", skin, 24, 16)
    ellipsoid(prefix + "_HairCap", (face_center.x, face_center.y + unit * 0.035, face_center.z + unit * 0.12),
              (unit * 0.515, unit * 0.445, unit * 0.49), armature, "head", hair, 24, 16)

    eye_z = face_center.z + unit * 0.07
    eye_y = face_center.y - unit * 0.40
    for side, sign in (("L", 1), ("R", -1)):
        eye_x = unit * 0.18 * sign
        ellipsoid(prefix + "_Eye_" + side, (eye_x, eye_y, eye_z),
                  (unit * 0.12, unit * 0.035, unit * 0.075), armature, "head", eye, 16, 8)
        ellipsoid(prefix + "_Pupil_" + side, (eye_x, eye_y - unit * 0.032, eye_z),
                  (unit * 0.045, unit * 0.018, unit * 0.045), armature, "head", pupil, 12, 8)
    ellipsoid(prefix + "_Nose", (0, eye_y - unit * 0.015, face_center.z - unit * 0.025),
              (unit * 0.045, unit * 0.065, unit * 0.08), armature, "head", skin, 14, 8)

    arm_radius = unit * 0.24 * limb_scale
    leg_radius = unit * 0.34 * limb_scale
    for suffix in ("L", "R"):
        upper_arm = "upper_arm." + suffix
        lower_arm = "lower_arm." + suffix
        hand_bone = "hand." + suffix
        upper_leg = "upper_leg." + suffix
        lower_leg = "lower_leg." + suffix
        foot = "foot." + suffix

        limb(prefix + "_UpperArm_" + suffix, bone_head(armature, upper_arm), bone_tail(armature, upper_arm),
             arm_radius, armature, upper_arm, primary)
        ellipsoid(prefix + "_Elbow_" + suffix, bone_head(armature, lower_arm),
                  (arm_radius * 1.03,) * 3, armature, lower_arm, secondary, 18, 10)
        limb(prefix + "_LowerArm_" + suffix, bone_head(armature, lower_arm), bone_tail(armature, lower_arm),
             arm_radius * 0.82, armature, lower_arm, secondary)
        hand_start = bone_head(armature, hand_bone)
        hand_end = bone_tail(armature, hand_bone)
        limb(prefix + "_Hand_" + suffix, hand_start, hand_end, arm_radius * 0.85,
             armature, hand_bone, skin, depth=0.58)

        limb(prefix + "_UpperLeg_" + suffix, bone_head(armature, upper_leg), bone_tail(armature, upper_leg),
             leg_radius, armature, upper_leg, secondary, depth=0.90)
        ellipsoid(prefix + "_Knee_" + suffix, bone_head(armature, lower_leg),
                  (leg_radius * 0.92, leg_radius * 0.82, leg_radius * 0.92),
                  armature, lower_leg, secondary, 18, 10)
        limb(prefix + "_LowerLeg_" + suffix, bone_head(armature, lower_leg), bone_tail(armature, lower_leg),
             leg_radius * 0.77, armature, lower_leg, primary, depth=0.90)
        foot_head = bone_head(armature, foot)
        foot_tail = bone_tail(armature, foot)
        foot_center = (foot_head + foot_tail) * 0.5
        ellipsoid(prefix + "_Foot_" + suffix, foot_center,
                  (leg_radius * 0.90, (foot_head - foot_tail).length * 0.58, leg_radius * 0.60),
                  armature, foot, accent, 20, 12)

    style = spec["style"]
    if style == "barista":
        ellipsoid(prefix + "_Apron", (0, -unit * 0.47, hips.z + unit * 0.33),
                  (unit * 0.72 * width, unit * 0.055, unit * 0.90), armature, "spine", accent)
    elif style == "gardener":
        ellipsoid(prefix + "_HairBun", (0, unit * 0.27, face_center.z + unit * 0.37),
                  (unit * 0.29, unit * 0.24, unit * 0.29), armature, "head", hair, 18, 12)
        for sign in (-1, 1):
            ellipsoid(prefix + "_Glasses_" + str(sign), (sign * unit * 0.18, eye_y - unit * 0.055, eye_z),
                      (unit * 0.16, unit * 0.018, unit * 0.11), armature, "head", accent, 16, 8)
    elif style == "explorer":
        ellipsoid(prefix + "_Backpack", (0, unit * 0.46, shoulder_z - unit * 0.35),
                  (unit * 0.74, unit * 0.28, unit * 0.80), armature, "chest", secondary)
    elif style == "rune_guard":
        ellipsoid(prefix + "_RuneCore", (0, -unit * 0.52, shoulder_z - unit * 0.14),
                  (unit * 0.17, unit * 0.04, unit * 0.17), armature, "chest", accent, 18, 10)
        for index in range(4):
            ellipsoid(prefix + "_Braid_" + str(index),
                      (unit * 0.38, unit * 0.20, face_center.z - unit * (0.08 + index * 0.27)),
                      (unit * 0.17, unit * 0.14, unit * 0.22), armature, "head", hair, 16, 10)
    elif style == "android":
        ellipsoid(prefix + "_FacePanel", (0, eye_y - unit * 0.045, face_center.z + unit * 0.015),
                  (unit * 0.33, unit * 0.025, unit * 0.23), armature, "head", accent, 20, 12)


def configure_vrm(armature, spec):
    extension = armature.data.vrm_addon_extension
    extension.spec_version = "1.0"
    meta = extension.vrm1.meta
    meta.vrm_name = spec["name"]
    meta.version = "1.0.0"
    meta.authors.add().value = AUTHOR
    meta.copyright_information = "ToonSpectrum original procedural character"
    meta.contact_information = "ToonSpectrum"
    meta.references.add().value = "Generated with Blender MCP"
    meta.avatar_permission = "everyone"
    meta.commercial_usage = "corporation"
    meta.credit_notation = "unnecessary"
    meta.allow_redistribution = True
    meta.modification = "allowModificationRedistribution"
    meta.allow_excessively_violent_usage = True
    meta.allow_excessively_sexual_usage = True
    meta.allow_political_or_religious_usage = True
    meta.allow_antisocial_or_hate_usage = False


def generate_character(spec):
    clear_scene()
    result = bpy.ops.icyp.make_basic_armature(
        "EXEC_DEFAULT",
        tall=spec["height"],
        head_ratio=max(4.0, spec["heads"]),
        aging_ratio=spec["age"],
        shoulder_width=spec["shoulder"],
        arm_length_ratio=1.0,
        leg_length_ratio=1.0,
        hand_ratio=1.0,
        skip_heavy_armature_setup=False,
        wip_with_template_mesh=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError("VRM humanoid creation failed: " + repr(result))
    armature = bpy.context.view_layer.objects.active
    armature.name = spec["file"].replace(".vrm", "") + "_Rig"
    configure_vrm(armature, spec)
    add_character_meshes(spec, armature)

    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = armature
    filepath = OUTPUT_DIR + "/" + spec["file"]
    export_result = bpy.ops.export_scene.vrm(
        filepath=filepath,
        armature_object_name=armature.name,
        use_addon_preferences=False,
        export_invisibles=False,
        export_only_selections=True,
        enable_advanced_preferences=True,
        export_all_influences=False,
        export_lights=False,
        export_gltf_animations=False,
        export_try_sparse_sk=True,
        ignore_warning=True,
    )
    if export_result != {"FINISHED"}:
        raise RuntimeError("VRM export failed for " + spec["file"] + ": " + repr(export_result))
    print("VRM_PACK_EXPORT " + spec["file"] + " " + str(len(armature.data.bones)))


def main():
    for character in CHARACTERS:
        generate_character(character)
    print("VRM_PACK_COMPLETE " + str(len(CHARACTERS)))


if __name__ == "__main__":
    main()
