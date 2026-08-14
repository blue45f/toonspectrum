"""Generate ToonSpectrum's original lightweight VRM 1.0 character pack.

This file is intentionally self-contained so its source can be sent to Blender
through the Blender MCP ``execute_blender_code`` tool.  It uses the official
VRM Add-on exporter instead of rewriting a glTF JSON chunk after export.

Requirements:
  - Blender 5.2+
  - VRM Add-on for Blender 4.5+

The output is a set of compact, stylized, fully skinned VRM 1.0 characters.
Every visible mesh has an Armature modifier, JOINTS_0 and WEIGHTS_0, the torso
and limbs use blended weights at their transitions, and the shared rig includes
the complete VRM hand/finger skeleton produced by the add-on's humanoid
generator.  Facial meshes include real shape keys wired to VRM expressions.
"""

import bpy
from mathutils import Vector


OUTPUT_DIR = (
    bpy.context.scene.get("toonspectrum_vrm_output_dir")
    or bpy.path.abspath("//public/vrm")
)
AUTHOR = "ToonSpectrum"
CC0_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"


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
        "allow_excessively_violent_usage": False,
        "allow_excessively_sexual_usage": False,
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
    {
        "file": "cyber_agent_zero.vrm",
        "name": "사이버 에이전트 제로",
        "height": 1.84,
        "heads": 7.45,
        "age": 0.92,
        "shoulder": 0.105,
        "body": (1.12, 0.96, 1.08),
        "skin": (0.54, 0.37, 0.29, 1.0),
        "primary": (0.025, 0.045, 0.085, 1.0),
        "secondary": (0.12, 0.18, 0.27, 1.0),
        "accent": (0.00, 0.78, 1.00, 1.0),
        "hair": (0.018, 0.025, 0.040, 1.0),
        "style": "cyber_agent",
        "arm_scale": 1.08,
        "leg_scale": 1.04,
    },
    {
        "file": "TS_Seojin_Architect.vrm",
        "name": "서진 (배리어프리 건축가)",
        "height": 1.70,
        "heads": 6.95,
        "age": 0.84,
        "shoulder": 0.108,
        "body": (1.16, 1.08, 1.00),
        "skin": (0.66, 0.43, 0.30, 1.0),
        "primary": (0.09, 0.23, 0.37, 1.0),
        "secondary": (0.78, 0.72, 0.61, 1.0),
        "accent": (0.96, 0.58, 0.08, 1.0),
        "hair": (0.055, 0.037, 0.028, 1.0),
        "style": "architect",
        "arm_scale": 1.20,
        "leg_scale": 0.84,
    },
    {
        "file": "TS_Mira_Detective.vrm",
        "name": "미라 (느와르 탐정)",
        "height": 1.68,
        "heads": 6.65,
        "age": 0.86,
        "shoulder": 0.090,
        "body": (1.24, 1.17, 1.08),
        "skin": (0.76, 0.52, 0.38, 1.0),
        "primary": (0.16, 0.13, 0.12, 1.0),
        "secondary": (0.31, 0.25, 0.20, 1.0),
        "accent": (0.56, 0.08, 0.09, 1.0),
        "hair": (0.08, 0.055, 0.042, 1.0),
        "style": "detective",
        "arm_scale": 1.06,
        "leg_scale": 1.08,
    },
)


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    # The VRM exporter may hide expression meshes after export. Blender's
    # select-all operator skips hidden objects, so unlink every object data
    # block explicitly to keep repeated MCP runs deterministic and bounded.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
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


def rig_mesh(obj, armature, bone_name, material, blend_bone=None):
    if material:
        obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    primary_group = obj.vertex_groups.new(name=bone_name)
    if blend_bone and blend_bone != bone_name:
        blend_group = obj.vertex_groups.new(name=blend_bone)
        z_values = [vertex.co.z for vertex in obj.data.vertices]
        low = min(z_values)
        span = max(max(z_values) - low, 0.00001)
        for vertex in obj.data.vertices:
            # Preserve a strong primary influence while feathering the mesh
            # toward the adjacent bone. This avoids rigid one-bone joints and
            # produces genuine normalized multi-bone skinning.
            transition = max(0.0, min(1.0, (vertex.co.z - low) / span))
            blend_weight = 0.42 * transition
            primary_group.add([vertex.index], 1.0 - blend_weight, "REPLACE")
            blend_group.add([vertex.index], blend_weight, "REPLACE")
    else:
        primary_group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("TS_Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    return obj


def ellipsoid(
    name,
    location,
    scale,
    armature,
    bone_name,
    material,
    segments=20,
    rings=12,
    blend_bone=None,
):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return rig_mesh(obj, armature, bone_name, material, blend_bone)


def limb(
    name,
    start,
    end,
    radius,
    armature,
    bone_name,
    material,
    depth=0.92,
    blend_bone=None,
):
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
        blend_bone=blend_bone,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def add_shape_key(obj, name, transform):
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis")
    key = obj.shape_key_add(name=name)
    for point in key.data:
        transform(point.co)
    return key


def bind_expression(expression, obj, shape_key_name, weight=1.0):
    binding = expression.morph_target_binds.add()
    binding.node.mesh_object_name = obj.name
    binding.index = shape_key_name
    binding.weight = weight


def bone_head(armature, name):
    return armature.data.bones[name].head_local.copy()


def bone_tail(armature, name):
    return armature.data.bones[name].tail_local.copy()


def add_character_meshes(spec, armature):
    unit = spec["height"] / spec["heads"]
    width, depth, default_limb_scale = spec["body"]
    arm_scale = spec.get("arm_scale", default_limb_scale)
    leg_scale = spec.get("leg_scale", default_limb_scale)
    prefix = spec["file"].replace(".vrm", "")

    skin = make_material(prefix + "_Skin", spec["skin"], roughness=0.72)
    primary = make_material(prefix + "_Primary", spec["primary"], roughness=0.64)
    secondary = make_material(prefix + "_Secondary", spec["secondary"], roughness=0.58)
    hair = make_material(prefix + "_Hair", spec["hair"], roughness=0.76)
    accent_emission = None
    if spec["style"] in ("rune_guard", "android", "cyber_agent"):
        accent_emission = (spec["accent"], 2.0)
    accent = make_material(
        prefix + "_Accent",
        spec["accent"],
        metallic=0.35 if spec["style"] in ("android", "cyber_agent") else 0.05,
        roughness=0.32,
        emission=accent_emission,
    )
    eye = make_material(prefix + "_Eye", (0.93, 0.96, 0.98, 1.0), roughness=0.32)
    pupil = make_material(prefix + "_Pupil", (0.012, 0.018, 0.026, 1.0), roughness=0.44)
    mouth_material = make_material(prefix + "_Mouth", (0.36, 0.055, 0.065, 1.0), roughness=0.52)

    hips = bone_head(armature, "hips")
    chest = bone_head(armature, "chest")
    neck = bone_head(armature, "neck")
    head = bone_head(armature, "head")
    head_tip = bone_tail(armature, "head")
    shoulder_z = bone_head(armature, "upper_arm.L").z

    ellipsoid(prefix + "_Pelvis", (0, 0, hips.z + unit * 0.06),
              (unit * 0.82 * width, unit * 0.50 * depth, unit * 0.62),
              armature, "hips", primary, blend_bone="spine")
    ellipsoid(prefix + "_Abdomen", (0, 0, (hips.z + chest.z) * 0.5),
              (unit * 0.72 * width, unit * 0.46 * depth, (chest.z - hips.z) * 0.43),
              armature, "spine", secondary, blend_bone="chest")
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
    expression_targets = {"eyes": [], "mouth": None}
    for side, sign in (("L", 1), ("R", -1)):
        eye_x = unit * 0.18 * sign
        eye_obj = ellipsoid(prefix + "_Eye_" + side, (eye_x, eye_y, eye_z),
                            (unit * 0.12, unit * 0.035, unit * 0.075),
                            armature, "head", eye, 16, 8)
        add_shape_key(eye_obj, "Blink", lambda coordinate: setattr(coordinate, "z", coordinate.z * 0.08))
        expression_targets["eyes"].append(eye_obj)
        ellipsoid(prefix + "_Pupil_" + side, (eye_x, eye_y - unit * 0.032, eye_z),
                  (unit * 0.045, unit * 0.018, unit * 0.045), armature, "head", pupil, 12, 8)
    ellipsoid(prefix + "_Nose", (0, eye_y - unit * 0.015, face_center.z - unit * 0.025),
              (unit * 0.045, unit * 0.065, unit * 0.08), armature, "head", skin, 14, 8)

    mouth = ellipsoid(prefix + "_Mouth", (0, eye_y - unit * 0.010, face_center.z - unit * 0.21),
                      (unit * 0.16, unit * 0.025, unit * 0.040),
                      armature, "head", mouth_material, 16, 8)
    add_shape_key(mouth, "AA", lambda coordinate: setattr(coordinate, "z", coordinate.z * 3.2))
    add_shape_key(mouth, "IH", lambda coordinate: setattr(coordinate, "x", coordinate.x * 1.42))
    add_shape_key(
        mouth,
        "OU",
        lambda coordinate: (
            setattr(coordinate, "x", coordinate.x * 0.54),
            setattr(coordinate, "z", coordinate.z * 2.15),
        ),
    )
    add_shape_key(
        mouth,
        "EE",
        lambda coordinate: (
            setattr(coordinate, "x", coordinate.x * 1.58),
            setattr(coordinate, "z", coordinate.z * 0.62),
        ),
    )
    add_shape_key(
        mouth,
        "OH",
        lambda coordinate: (
            setattr(coordinate, "x", coordinate.x * 0.72),
            setattr(coordinate, "z", coordinate.z * 2.75),
        ),
    )
    add_shape_key(
        mouth,
        "Happy",
        lambda coordinate: setattr(coordinate, "z", coordinate.z + abs(coordinate.x) * 0.28),
    )
    add_shape_key(
        mouth,
        "Sad",
        lambda coordinate: setattr(coordinate, "z", coordinate.z - abs(coordinate.x) * 0.24),
    )
    add_shape_key(
        mouth,
        "Angry",
        lambda coordinate: setattr(coordinate, "z", coordinate.z - coordinate.x * 0.20),
    )
    add_shape_key(mouth, "Relaxed", lambda coordinate: setattr(coordinate, "x", coordinate.x * 1.12))
    add_shape_key(
        mouth,
        "Surprised",
        lambda coordinate: (
            setattr(coordinate, "x", coordinate.x * 0.58),
            setattr(coordinate, "z", coordinate.z * 3.45),
        ),
    )
    expression_targets["mouth"] = mouth

    arm_radius = unit * 0.24 * arm_scale
    leg_radius = unit * 0.34 * leg_scale
    for suffix in ("L", "R"):
        upper_arm = "upper_arm." + suffix
        lower_arm = "lower_arm." + suffix
        hand_bone = "hand." + suffix
        upper_leg = "upper_leg." + suffix
        lower_leg = "lower_leg." + suffix
        foot = "foot." + suffix

        limb(prefix + "_UpperArm_" + suffix, bone_head(armature, upper_arm), bone_tail(armature, upper_arm),
             arm_radius, armature, upper_arm, primary, blend_bone=lower_arm)
        ellipsoid(prefix + "_Elbow_" + suffix, bone_head(armature, lower_arm),
                  (arm_radius * 1.03,) * 3, armature, lower_arm, secondary, 18, 10)
        limb(prefix + "_LowerArm_" + suffix, bone_head(armature, lower_arm), bone_tail(armature, lower_arm),
             arm_radius * 0.82, armature, lower_arm, secondary, blend_bone=hand_bone)
        hand_start = bone_head(armature, hand_bone)
        hand_end = bone_tail(armature, hand_bone)
        limb(prefix + "_Hand_" + suffix, hand_start, hand_end, arm_radius * 0.85,
             armature, hand_bone, skin, depth=0.58)

        limb(prefix + "_UpperLeg_" + suffix, bone_head(armature, upper_leg), bone_tail(armature, upper_leg),
             leg_radius, armature, upper_leg, secondary, depth=0.90, blend_bone=lower_leg)
        ellipsoid(prefix + "_Knee_" + suffix, bone_head(armature, lower_leg),
                  (leg_radius * 0.92, leg_radius * 0.82, leg_radius * 0.92),
                  armature, lower_leg, secondary, 18, 10)
        limb(prefix + "_LowerLeg_" + suffix, bone_head(armature, lower_leg), bone_tail(armature, lower_leg),
             leg_radius * 0.77, armature, lower_leg, primary, depth=0.90, blend_bone=foot)
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
    elif style == "cyber_agent":
        ellipsoid(prefix + "_Visor", (0, eye_y - unit * 0.050, face_center.z + unit * 0.075),
                  (unit * 0.39, unit * 0.024, unit * 0.13), armature, "head", accent, 24, 10)
        ellipsoid(prefix + "_ChestCore", (0, -unit * 0.53, shoulder_z - unit * 0.22),
                  (unit * 0.21, unit * 0.035, unit * 0.21), armature, "chest", accent, 20, 12)
        for sign in (-1, 1):
            ellipsoid(prefix + "_ShoulderNode_" + str(sign),
                      (sign * unit * 0.90 * width, 0, shoulder_z - unit * 0.03),
                      (unit * 0.19, unit * 0.22, unit * 0.19),
                      armature, "upper_arm.L" if sign > 0 else "upper_arm.R", accent, 18, 10)
    elif style == "architect":
        # The bundled VRM intentionally contains only the person. The chair is
        # supplied as a separate scene prop so artists can pose, swap or omit it.
        ellipsoid(prefix + "_Vest", (0, -unit * 0.50, (hips.z + chest.z) * 0.55),
                  (unit * 0.76 * width, unit * 0.045, unit * 0.74),
                  armature, "spine", accent, 20, 12, blend_bone="chest")
        for sign in (-1, 1):
            ellipsoid(prefix + "_Glasses_" + str(sign),
                      (sign * unit * 0.18, eye_y - unit * 0.055, eye_z),
                      (unit * 0.16, unit * 0.018, unit * 0.105),
                      armature, "head", accent, 16, 8)
            cuff_bone = "lower_arm.L" if sign > 0 else "lower_arm.R"
            cuff_center = bone_head(armature, cuff_bone).lerp(bone_tail(armature, cuff_bone), 0.22)
            ellipsoid(prefix + "_RolledCuff_" + str(sign), cuff_center,
                      (arm_radius * 1.12, arm_radius * 1.12, arm_radius * 0.55),
                      armature, cuff_bone, accent, 18, 10)
    elif style == "detective":
        # Fedora silhouette and double-breasted coat make the mature, fuller
        # detective readable even at thumbnail scale.
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=unit * 0.66, depth=unit * 0.055,
                                            location=(0, face_center.y, face_center.z + unit * 0.55))
        brim = bpy.context.object
        brim.name = prefix + "_FedoraBrim"
        rig_mesh(brim, armature, "head", primary)
        bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=unit * 0.39, depth=unit * 0.38,
                                            location=(0, face_center.y, face_center.z + unit * 0.72))
        crown = bpy.context.object
        crown.name = prefix + "_FedoraCrown"
        rig_mesh(crown, armature, "head", primary)
        for sign in (-1, 1):
            ellipsoid(prefix + "_CoatButton_" + str(sign),
                      (sign * unit * 0.23, -unit * 0.54, hips.z + unit * 0.56),
                      (unit * 0.065, unit * 0.030, unit * 0.065),
                      armature, "spine", accent, 14, 8)

    return expression_targets


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
    meta.other_license_url = CC0_LICENSE_URL
    meta.allow_excessively_violent_usage = spec.get("allow_excessively_violent_usage", True)
    meta.allow_excessively_sexual_usage = spec.get("allow_excessively_sexual_usage", True)
    meta.allow_political_or_religious_usage = True
    meta.allow_antisocial_or_hate_usage = False


def configure_expressions(armature, targets):
    expressions = armature.data.vrm_addon_extension.vrm1.expressions.preset
    left_eye, right_eye = targets["eyes"]
    mouth = targets["mouth"]

    bind_expression(expressions.blink, left_eye, "Blink")
    bind_expression(expressions.blink, right_eye, "Blink")
    bind_expression(expressions.blink_left, left_eye, "Blink")
    bind_expression(expressions.blink_right, right_eye, "Blink")
    bind_expression(expressions.aa, mouth, "AA")
    bind_expression(expressions.ih, mouth, "IH")
    bind_expression(expressions.ou, mouth, "OU")
    bind_expression(expressions.ee, mouth, "EE")
    bind_expression(expressions.oh, mouth, "OH")
    bind_expression(expressions.happy, mouth, "Happy")
    bind_expression(expressions.sad, mouth, "Sad")
    bind_expression(expressions.angry, mouth, "Angry")
    bind_expression(expressions.relaxed, mouth, "Relaxed")
    bind_expression(expressions.surprised, mouth, "Surprised")


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
    expression_targets = add_character_meshes(spec, armature)
    configure_expressions(armature, expression_targets)

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
    selected_file = bpy.context.scene.get("toonspectrum_vrm_character_file")
    selected_characters = tuple(
        character
        for character in CHARACTERS
        if not selected_file or character["file"] == selected_file
    )
    if selected_file and not selected_characters:
        raise ValueError("Unknown ToonSpectrum VRM character file: " + str(selected_file))
    for character in selected_characters:
        generate_character(character)
    print("VRM_PACK_COMPLETE " + str(len(selected_characters)))


if __name__ == "__main__":
    main()
