"""Regenerate the four ToonSpectrum Wave 5 characters as visual-quality v2 VRMs.

This is a deliberately layered upgrade rather than a second rig implementation:
the reviewed Wave 5/Wave 4 connected skin, exact humanoid mapping and expression
bindings remain the source of truth, while this file replaces the face, material
finish and character-specific art pass.  The result keeps every public filename,
catalog ID and CC0 term stable.

Wave 6 adds:

* a higher-density face with ears, eyelids, irises, eye highlights, nose bridge,
  nostrils, cheeks and layered lips;
* visible nails/knuckles plus shoe soles, toe caps and seam construction;
* packed procedural weave/detail textures and richer official MToon 1.0 rim and
  outline settings;
* style-specific layered garments, hair, prosthetic hardware and coral growth.

The script uses the official Blender VRM Add-on armature creator/exporter.  It is
safe for Blender MCP: scene clearing is delegated to ``COMMON.clear_scene()`` and
``read_factory_settings`` is never used.

Requirements: Blender 5.2+, VRM Add-on for Blender 4.5+.
"""

from math import cos, pi, sin

import bpy
from mathutils import Vector


SCRIPT_DIR = __file__.rsplit("/", 1)[0]
WAVE5_PATH = str(
    bpy.context.scene.get("toonspectrum_wave5_common_path")
    or SCRIPT_DIR + "/generate_toonspectrum_vrm_pack_wave5.py"
)
if not bpy.context.scene.get("toonspectrum_wave4_common_path"):
    bpy.context.scene["toonspectrum_wave4_common_path"] = (
        SCRIPT_DIR + "/generate_toonspectrum_vrm_pack_wave4.py"
    )
# Text.as_module() is supported by both Blender CLI and blend-ai's restricted
# MCP executor without weakening its blocked-import policy.
WAVE5 = bpy.data.texts.load(WAVE5_PATH).as_module()
COMMON = WAVE5.COMMON


ORIGINAL_MAKE_MATERIAL = COMMON.make_material
ORIGINAL_STYLE_DETAILS = WAVE5.add_style_details
ORIGINAL_CONFIGURE_VRM = WAVE5.configure_vrm
TEXTURE_SIZE = 64


def generated_detail_texture(name, rgba):
    """Create a tiny deterministic packed texture that survives VRM export.

    The texture is intentionally subtle: it modulates the MToon base color by
    0.88–1.0, providing cloth/skin breakup without baking lighting or depending
    on an external file.  Every pixel is authored here and packed into the blend
    datablock before the official exporter serializes it as an embedded image.
    """
    image = bpy.data.images.new(name + "_PackedTexture", TEXTURE_SIZE, TEXTURE_SIZE, alpha=True)
    seed = sum((index + 1) * ord(character) for index, character in enumerate(name)) % 29
    pixels = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    is_delicate = any(token in name for token in ("Skin", "Eye", "Iris", "Lip", "Mouth"))
    cross_strength = 0.004 if is_delicate else 0.010
    wave_strength = 0.002 if is_delicate else 0.004
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            weave = 0.982
            weave += cross_strength if (x + seed) % 8 in (0, 1) else 0.0
            weave += cross_strength * 0.72 if (y + seed * 2) % 10 == 0 else 0.0
            weave += wave_strength * sin((x + y + seed) * pi / 9.0)
            weave = max(0.965, min(1.0, weave))
            offset = (y * TEXTURE_SIZE + x) * 4
            pixels[offset : offset + 4] = (weave, weave, weave, rgba[3])
    image.pixels.foreach_set(pixels)
    image.update()
    image.pack()
    return image


def make_material_v2(name, rgba, *, metallic=0.0, roughness=0.62, emission=0.0):
    """Create an official MToon material with embedded detail and tuned edges."""
    material = ORIGINAL_MAKE_MATERIAL(
        name,
        rgba,
        metallic=metallic,
        roughness=roughness,
        emission=emission,
    )
    material.name = name
    mtoon = material.vrm_addon_extension.mtoon1
    pbr = mtoon.pbr_metallic_roughness
    if hasattr(pbr, "metallic_factor"):
        pbr.metallic_factor = metallic
    if hasattr(pbr, "roughness_factor"):
        pbr.roughness_factor = roughness
    pbr.base_color_texture.index.source = generated_detail_texture(name, rgba)

    vrmc = mtoon.extensions.vrmc_materials_mtoon
    vrmc.outline_width_mode = "worldCoordinates"
    vrmc.outline_width_factor = 0.0012 if "Skin" in name or "Eye" in name else 0.0018
    vrmc.outline_color_factor = tuple(max(0.008, channel * 0.18) for channel in rgba[:3])
    vrmc.outline_lighting_mix_factor = 0.34
    vrmc.parametric_rim_color_factor = tuple(min(1.0, channel * 0.42 + 0.10) for channel in rgba[:3])
    vrmc.rim_lighting_mix_factor = 0.58
    vrmc.parametric_rim_fresnel_power_factor = 3.6
    vrmc.parametric_rim_lift_factor = 0.04
    return material


COMMON.make_material = make_material_v2


def named(obj):
    """Keep authored mesh names stable instead of Blender's Sphere.xxx names."""
    if obj is not None and obj.type == "MESH":
        obj.data.name = obj.name + "Mesh"
    return obj


def ellipsoid(name, location, scale, armature, bone, material, segments=24, rings=16):
    return named(COMMON.ellipsoid(
        name, location, scale, armature, bone, material, segments, rings
    ))


def weighted_ellipsoid(name, location, scale, armature, weights, material, segments=24, rings=14):
    return named(COMMON.weighted_ellipsoid(
        name, location, scale, armature, weights, material, segments, rings
    ))


def tube(name, points, radii, weights, armature, material, segments=12):
    return named(COMMON.make_tube(
        name, points, radii, weights, armature, material, segments
    ))


def ensure_detail_materials(prefix, spec, materials):
    if "skin_shadow" in materials:
        return materials
    skin = spec["skin"]
    materials.update({
        "skin_shadow": COMMON.make_material(
            prefix + "_SkinShadow",
            tuple(max(0.012, channel * 0.64) for channel in skin[:3]) + (1.0,),
            roughness=0.76,
        ),
        "iris": COMMON.make_material(
            prefix + "_Iris",
            spec.get("iris", spec.get("accent", (0.24, 0.48, 0.64, 1.0))),
            roughness=0.24,
            emission=0.08 if spec["style"] == "coral_djinn" else 0.0,
        ),
        "eye_highlight": COMMON.make_material(
            prefix + "_EyeHighlight", (0.96, 0.99, 1.0, 1.0), roughness=0.12, emission=0.10
        ),
        "lip": COMMON.make_material(
            prefix + "_LipDetail", (0.56, 0.105, 0.13, 1.0), roughness=0.46
        ),
        "seam": COMMON.make_material(
            prefix + "_GarmentSeam",
            tuple(min(1.0, channel * 1.24 + 0.025) for channel in spec["secondary"][:3]) + (1.0,),
            roughness=0.70,
        ),
        "sole": COMMON.make_material(
            prefix + "_ShoeSole", (0.022, 0.030, 0.040, 1.0), metallic=0.08, roughness=0.74
        ),
        "hardware": COMMON.make_material(
            prefix + "_Hardware", (0.38, 0.46, 0.56, 1.0), metallic=0.76, roughness=0.24
        ),
        "pearl": COMMON.make_material(
            prefix + "_Pearl", (0.74, 0.96, 0.96, 1.0), metallic=0.05, roughness=0.18, emission=0.34
        ),
    })
    return materials


def add_face_v2(prefix, spec, armature, materials):
    """Create an expressive layered face while preserving Wave 5 target names."""
    ensure_detail_materials(prefix, spec, materials)
    unit = spec["height"] / spec["heads"]
    head = COMMON.bone_head(armature, "head")
    head_tip = COMMON.bone_tail(armature, "head")
    center = (head + head_tip) * 0.5
    center.y = -unit * 0.01
    head_scale = spec.get("head_scale", (1.0, 1.0, 1.0))

    ellipsoid(
        prefix + "_HeadHighTopology",
        center,
        (
            unit * 0.49 * head_scale[0],
            unit * 0.43 * head_scale[1],
            unit * 0.58 * head_scale[2],
        ),
        armature,
        "head",
        materials["skin"],
        48,
        32,
    )
    # A softly overlapping jaw and cheeks remove the featureless sphere read.
    ellipsoid(
        prefix + "_JawVolume",
        (0.0, center.y - unit * 0.018, center.z - unit * 0.205),
        (unit * 0.39 * head_scale[0], unit * 0.405, unit * 0.34),
        armature,
        "head",
        materials["skin"],
        32,
        20,
    )
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        ellipsoid(
            prefix + "_CheekVolume_" + suffix,
            (sign * unit * 0.215, center.y - unit * 0.405, center.z - unit * 0.055),
            (unit * 0.155, unit * 0.025, unit * 0.125),
            armature,
            "head",
            materials["skin"],
            22,
            12,
        )
        ear_x = sign * unit * 0.485 * head_scale[0]
        ellipsoid(
            prefix + "_OuterEar_" + suffix,
            (ear_x, center.y + unit * 0.005, center.z + unit * 0.005),
            (unit * 0.095, unit * 0.055, unit * 0.155),
            armature,
            "head",
            materials["skin"],
            24,
            14,
        )
        ellipsoid(
            prefix + "_InnerEar_" + suffix,
            (ear_x + sign * unit * 0.014, center.y - unit * 0.051, center.z + unit * 0.004),
            (unit * 0.045, unit * 0.014, unit * 0.092),
            armature,
            "head",
            materials["skin_shadow"],
            18,
            10,
        )

    eye_z = center.z + unit * 0.075
    eye_y = center.y - unit * 0.405 * head_scale[1]
    expression_targets = {"eyes": [], "brows": [], "mouth": None}
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        eye_x = unit * 0.185 * sign * head_scale[0]
        eye_bone = "eye." + suffix
        eye = ellipsoid(
            prefix + "_ScleraExpression_" + suffix,
            (eye_x, eye_y, eye_z),
            (unit * 0.129, unit * 0.037, unit * 0.084),
            armature,
            eye_bone,
            materials["eye"],
            28,
            16,
        )
        WAVE5.add_shape_key_from_basis(eye, "Blink", lambda co: setattr(co, "z", co.z * 0.075))
        WAVE5.add_shape_key_from_basis(eye, "Wide", lambda co: setattr(co, "z", co.z * 1.28))
        WAVE5.add_shape_key_from_basis(eye, "Squint", lambda co: setattr(co, "z", co.z * 0.52))
        expression_targets["eyes"].append(eye)
        ellipsoid(
            prefix + "_Iris_" + suffix,
            (eye_x, eye_y - unit * 0.037, eye_z),
            (unit * 0.066, unit * 0.014, unit * 0.066),
            armature,
            eye_bone,
            materials["iris"],
            24,
            14,
        )
        ellipsoid(
            prefix + "_Pupil_" + suffix,
            (eye_x, eye_y - unit * 0.051, eye_z),
            (unit * 0.030, unit * 0.010, unit * 0.036),
            armature,
            eye_bone,
            materials["pupil"],
            18,
            10,
        )
        ellipsoid(
            prefix + "_EyeHighlight_" + suffix,
            (eye_x + sign * unit * 0.018, eye_y - unit * 0.061, eye_z + unit * 0.022),
            (unit * 0.012, unit * 0.007, unit * 0.016),
            armature,
            eye_bone,
            materials["eye_highlight"],
            14,
            8,
        )
        for lid_name, z_offset, z_scale in (
            ("UpperEyelid", 0.079, 0.020),
            ("LowerEyelid", -0.078, 0.014),
        ):
            ellipsoid(
                prefix + "_" + lid_name + "_" + suffix,
                (eye_x, eye_y - unit * 0.047, eye_z + unit * z_offset),
                (unit * 0.142, unit * 0.017, unit * z_scale),
                armature,
                "head",
                materials["skin_shadow"],
                24,
                10,
            )

        brow = ellipsoid(
            prefix + "_BrowExpression_" + suffix,
            (eye_x, eye_y - unit * 0.025, eye_z + unit * 0.168),
            (unit * 0.151, unit * 0.021, unit * 0.028),
            armature,
            "head",
            materials["hair"],
            22,
            10,
        )
        WAVE5.add_shape_key_from_basis(brow, "HappyBrow", lambda co: setattr(co, "z", co.z + abs(co.x) * 0.16))
        WAVE5.add_shape_key_from_basis(brow, "SadBrow", lambda co: setattr(co, "z", co.z - abs(co.x) * 0.18))
        WAVE5.add_shape_key_from_basis(brow, "AngryBrow", lambda co, d=sign: setattr(co, "z", co.z - d * co.x * 0.22))
        WAVE5.add_shape_key_from_basis(brow, "RelaxedBrow", lambda co: setattr(co, "z", co.z + unit * 0.016))
        WAVE5.add_shape_key_from_basis(brow, "SurprisedBrow", lambda co: setattr(co, "z", co.z + unit * 0.055))
        expression_targets["brows"].append(brow)

    # Nose bridge, tip and paired nostrils create an actual profile in 3/4 view.
    ellipsoid(
        prefix + "_NoseBridge",
        (0.0, eye_y - unit * 0.018, center.z + unit * 0.005),
        (unit * 0.050, unit * 0.055, unit * 0.150),
        armature,
        "head",
        materials["skin"],
        22,
        14,
    )
    ellipsoid(
        prefix + "_NoseTip",
        (0.0, eye_y - unit * 0.074, center.z - unit * 0.064),
        (unit * 0.075, unit * 0.050, unit * 0.064),
        armature,
        "head",
        materials["skin"],
        22,
        14,
    )
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        ellipsoid(
            prefix + "_Nostril_" + suffix,
            (sign * unit * 0.037, eye_y - unit * 0.119, center.z - unit * 0.079),
            (unit * 0.014, unit * 0.009, unit * 0.010),
            armature,
            "head",
            materials["skin_shadow"],
            14,
            8,
        )

    mouth = ellipsoid(
        prefix + "_MouthExpression",
        (0.0, eye_y - unit * 0.029, center.z - unit * 0.215),
        (unit * 0.170, unit * 0.027, unit * 0.044),
        armature,
        "head",
        materials["mouth"],
        28,
        14,
    )
    for name, transform in (
        ("AA", lambda co: setattr(co, "z", co.z * 3.25)),
        ("IH", lambda co: setattr(co, "x", co.x * 1.42)),
        ("OU", lambda co: (setattr(co, "x", co.x * 0.52), setattr(co, "z", co.z * 2.2))),
        ("EE", lambda co: (setattr(co, "x", co.x * 1.62), setattr(co, "z", co.z * 0.58))),
        ("OH", lambda co: (setattr(co, "x", co.x * 0.70), setattr(co, "z", co.z * 2.85))),
        ("Happy", lambda co: setattr(co, "z", co.z + abs(co.x) * 0.31)),
        ("Sad", lambda co: setattr(co, "z", co.z - abs(co.x) * 0.28)),
        ("Angry", lambda co: setattr(co, "z", co.z - co.x * 0.23)),
        ("Relaxed", lambda co: (setattr(co, "x", co.x * 1.12), setattr(co, "z", co.z * 0.82))),
        ("Surprised", lambda co: (setattr(co, "x", co.x * 0.56), setattr(co, "z", co.z * 3.55))),
    ):
        WAVE5.add_shape_key_from_basis(mouth, name, transform)
    expression_targets["mouth"] = mouth
    # Lip ridges stay narrow so the expressive inner mouth remains readable.
    for lip_name, z_offset, x_scale in (
        ("UpperLipRidge", 0.050, 0.145),
        ("LowerLipRidge", -0.052, 0.132),
    ):
        ellipsoid(
            prefix + "_" + lip_name,
            (0.0, eye_y - unit * 0.055, center.z - unit * 0.215 + unit * z_offset),
            (unit * x_scale, unit * 0.014, unit * 0.012),
            armature,
            "head",
            materials["lip"],
            24,
            10,
        )
    ellipsoid(
        prefix + "_Philtrum",
        (0.0, eye_y - unit * 0.052, center.z - unit * 0.145),
        (unit * 0.021, unit * 0.010, unit * 0.036),
        armature,
        "head",
        materials["skin_shadow"],
        16,
        8,
    )
    return center, eye_y, eye_z, expression_targets


COMMON.add_face = add_face_v2


def add_common_hand_and_foot_detail(prefix, spec, armature, materials):
    unit = spec["height"] / spec["heads"]
    ensure_detail_materials(prefix, spec, materials)
    for suffix in ("L", "R"):
        hand = "hand." + suffix
        for finger in ("thumb", "index", "middle", "ring", "little"):
            proximal = finger + "_proximal." + suffix
            distal = finger + "_distal." + suffix
            distal_head = COMMON.bone_head(armature, distal)
            distal_tail = COMMON.bone_tail(armature, distal)
            tube(
                prefix + "_Fingernail_" + finger.title() + "_" + suffix,
                [COMMON.blend(distal_head, distal_tail, 0.43), COMMON.blend(distal_head, distal_tail, 0.92)],
                [(unit * 0.028, unit * 0.011), (unit * 0.020, unit * 0.008)],
                [{distal: 1.0}, {distal: 1.0}],
                armature,
                materials["eye_highlight"],
                8,
            )
            weighted_ellipsoid(
                prefix + "_HandKnuckle_" + finger.title() + "_" + suffix,
                COMMON.bone_head(armature, proximal),
                (unit * 0.046, unit * 0.038, unit * 0.034),
                armature,
                {hand: 0.25, proximal: 0.75},
                materials["skin"],
                14,
                8,
            )

        lower = "lower_leg." + suffix
        foot = "foot." + suffix
        toes = "toes." + suffix
        ankle = COMMON.bone_head(armature, foot)
        toe_root = COMMON.bone_head(armature, toes)
        toe_tip = COMMON.bone_tail(armature, toes)
        center = COMMON.blend(ankle, toe_tip, 0.58)
        weighted_ellipsoid(
            prefix + "_ShoeSole_" + suffix,
            (center.x, center.y, center.z - unit * 0.095),
            (unit * 0.305, unit * 0.46, unit * 0.055),
            armature,
            {foot: 0.56, toes: 0.44},
            materials["sole"],
            28,
            12,
        )
        toe_center = COMMON.blend(toe_root, toe_tip, 0.62)
        weighted_ellipsoid(
            prefix + "_ShoeToeCap_" + suffix,
            (toe_center.x, toe_center.y - unit * 0.018, toe_center.z + unit * 0.025),
            (unit * 0.29, unit * 0.20, unit * 0.115),
            armature,
            {foot: 0.20, toes: 0.80},
            materials["seam"],
            26,
            14,
        )
        weighted_ellipsoid(
            prefix + "_ShoeHeelGuard_" + suffix,
            (ankle.x, ankle.y + unit * 0.075, ankle.z + unit * 0.015),
            (unit * 0.245, unit * 0.12, unit * 0.18),
            armature,
            {lower: 0.16, foot: 0.84},
            materials["sole"],
            22,
            12,
        )
        for lace_index in range(3):
            lace_center = COMMON.blend(ankle, toe_root, 0.42 + lace_index * 0.14)
            weighted_ellipsoid(
                prefix + f"_ShoeLace_{suffix}_{lace_index}",
                (lace_center.x, lace_center.y - unit * 0.19, lace_center.z + unit * 0.12),
                (unit * 0.13, unit * 0.008, unit * 0.014),
                armature,
                {foot: 1.0},
                materials["seam"],
                16,
                8,
            )


def add_sunja_v2(prefix, spec, armature, materials, face_context):
    unit = spec["height"] / spec["heads"]
    center, eye_y, _, _ = face_context
    chest = COMMON.bone_head(armature, "chest")
    hips = COMMON.bone_head(armature, "hips")
    # Face-opening hood rim and silver wisps frame rather than cover the face.
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        ellipsoid(
            prefix + "_HoodRimSide_" + suffix,
            (sign * unit * 0.405, eye_y + unit * 0.035, center.z + unit * 0.02),
            (unit * 0.075, unit * 0.055, unit * 0.39),
            armature,
            "head",
            materials["accent"],
            24,
            14,
        )
        ellipsoid(
            prefix + "_SilverTempleWisp_" + suffix,
            (sign * unit * 0.32, eye_y - unit * 0.014, center.z + unit * 0.22),
            (unit * 0.10, unit * 0.022, unit * 0.15),
            armature,
            "head",
            materials["hair"],
            22,
            12,
        )
        # Crow's feet are fine raised strokes, a respectful age cue.
        for wrinkle in range(2):
            ellipsoid(
                prefix + f"_CrowFoot_{suffix}_{wrinkle}",
                (sign * unit * (0.315 + wrinkle * 0.035), eye_y - unit * 0.055, center.z + unit * (0.075 - wrinkle * 0.030)),
                (unit * 0.055, unit * 0.008, unit * 0.008),
                armature,
                "head",
                materials["skin_shadow"],
                14,
                8,
            )
    ellipsoid(
        prefix + "_HoodRimTop",
        (0.0, eye_y + unit * 0.035, center.z + unit * 0.43),
        (unit * 0.38, unit * 0.055, unit * 0.075),
        armature,
        "head",
        materials["accent"],
        28,
        14,
    )
    # Structured vest panels, zipper, straps and real pocket layers.
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        weighted_ellipsoid(
            prefix + "_HaenyeoVestPanel_" + suffix,
            (sign * unit * 0.31, -unit * 0.57, (hips.z + chest.z) * 0.54),
            (unit * 0.30, unit * 0.035, unit * 0.63),
            armature,
            {"chest": 0.38, "spine": 0.50, "hips": 0.12},
            materials["secondary"],
            26,
            14,
        )
        strap_points = [
            (sign * unit * 0.42, -unit * 0.61, chest.z + unit * 0.16),
            (sign * unit * 0.31, -unit * 0.64, chest.z - unit * 0.24),
            (sign * unit * 0.25, -unit * 0.62, hips.z + unit * 0.15),
        ]
        tube(
            prefix + "_HarnessStrap_" + suffix,
            strap_points,
            [unit * 0.035] * 3,
            [{"chest": 1.0}, {"chest": 0.45, "spine": 0.55}, {"hips": 0.65, "spine": 0.35}],
            armature,
            materials["accent"],
            10,
        )
        weighted_ellipsoid(
            prefix + "_UtilityPocket_" + suffix,
            (sign * unit * 0.30, -unit * 0.66, hips.z + unit * 0.38),
            (unit * 0.20, unit * 0.035, unit * 0.18),
            armature,
            {"spine": 0.65, "hips": 0.35},
            materials["fabric"],
            20,
            10,
        )
    tube(
        prefix + "_WetsuitSeamCenter",
        [(0.0, -unit * 0.635, chest.z + unit * 0.23), (0.0, -unit * 0.665, hips.z + unit * 0.08)],
        [unit * 0.017, unit * 0.017],
        [{"chest": 1.0}, {"hips": 0.58, "spine": 0.42}],
        armature,
        materials["seam"],
        10,
    )


def add_maya_v2(prefix, spec, armature, materials, face_context):
    unit = spec["height"] / spec["heads"]
    center, _, _, _ = face_context
    chest = COMMON.bone_head(armature, "chest")
    hips = COMMON.bone_head(armature, "hips")
    # Layered coil crown and two weighted braids establish a readable silhouette.
    coil_layout = (
        (-0.38, 0.12, 0.34), (-0.20, 0.19, 0.48), (0.0, 0.22, 0.52),
        (0.20, 0.19, 0.48), (0.38, 0.12, 0.34), (-0.30, 0.23, 0.08),
        (0.30, 0.23, 0.08),
    )
    for index, (x, y, z) in enumerate(coil_layout):
        ellipsoid(
            prefix + f"_HairCoilLayer_{index}",
            (center.x + unit * x, center.y + unit * y, center.z + unit * z),
            (unit * 0.16, unit * 0.14, unit * 0.17),
            armature,
            "head",
            materials["hair"],
            24,
            16,
        )
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        braid_points = [
            (sign * unit * 0.42, center.y + unit * 0.12, center.z + unit * 0.22),
            (sign * unit * 0.50, unit * 0.10, center.z - unit * 0.20),
            (sign * unit * 0.43, unit * 0.12, chest.z + unit * 0.08),
        ]
        tube(
            prefix + "_BraidedHair_" + suffix,
            braid_points,
            [unit * 0.085, unit * 0.072, unit * 0.045],
            [{"head": 1.0}, {"head": 0.72, "neck": 0.28}, {"neck": 0.48, "chest": 0.52}],
            armature,
            materials["hair"],
            14,
        )
        weighted_ellipsoid(
            prefix + "_CoutureBodicePanel_" + suffix,
            (sign * unit * 0.29, -unit * 0.60, chest.z - unit * 0.19),
            (unit * 0.28, unit * 0.038, unit * 0.50),
            armature,
            {"chest": 0.62, "spine": 0.38},
            materials["primary"] if sign > 0 else materials["secondary"],
            28,
            16,
        )
        weighted_ellipsoid(
            prefix + "_CoutureHipPleat_" + suffix,
            (sign * unit * 0.48, -unit * 0.49, hips.z + unit * 0.07),
            (unit * 0.35, unit * 0.055, unit * 0.30),
            armature,
            {"hips": 0.78, "spine": 0.22},
            materials["fabric"],
            26,
            14,
        )
    # Neckline piping, gem and cape edge add close-range construction detail.
    tube(
        prefix + "_CoutureNecklineSeam",
        [(-unit * 0.37, -unit * 0.57, chest.z + unit * 0.25), (0.0, -unit * 0.63, chest.z + unit * 0.08), (unit * 0.37, -unit * 0.57, chest.z + unit * 0.25)],
        [unit * 0.020] * 3,
        [{"chest": 1.0}] * 3,
        armature,
        materials["seam"],
        10,
    )
    ellipsoid(
        prefix + "_CoutureJewel",
        (0.0, -unit * 0.69, chest.z + unit * 0.08),
        (unit * 0.090, unit * 0.026, unit * 0.12),
        armature,
        "chest",
        materials["pearl"],
        24,
        14,
    )
    tube(
        prefix + "_AsymmetricCapeEdge",
        [(unit * 0.64, unit * 0.16, chest.z + unit * 0.20), (unit * 0.83, unit * 0.18, chest.z - unit * 0.40), (unit * 0.70, unit * 0.20, hips.z - unit * 0.05)],
        [unit * 0.026] * 3,
        [{"chest": 1.0}, {"chest": 0.40, "spine": 0.60}, {"hips": 0.62, "spine": 0.38}],
        armature,
        materials["accent"],
        10,
    )


def add_iseul_v2(prefix, spec, armature, materials, face_context):
    unit = spec["height"] / spec["heads"]
    center, _, _, _ = face_context
    chest = COMMON.bone_head(armature, "chest")
    hips = COMMON.bone_head(armature, "hips")
    # Directional hair clumps avoid a uniform helmet silhouette.
    for index, (x, y, z, tilt) in enumerate((
        (-0.34, 0.03, 0.34, -0.28), (-0.18, 0.00, 0.47, -0.16),
        (0.02, 0.00, 0.50, 0.05), (0.21, 0.04, 0.45, 0.18),
        (0.36, 0.08, 0.31, 0.31),
    )):
        tuft = ellipsoid(
            prefix + f"_RescueHairTuft_{index}",
            (center.x + unit * x, center.y + unit * y, center.z + unit * z),
            (unit * 0.13, unit * 0.10, unit * 0.23),
            armature,
            "head",
            materials["hair"],
            22,
            14,
        )
        tuft.rotation_euler.y = tilt
    # High-visibility layered rescue vest with collar, zipper, reflectors/pockets.
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        weighted_ellipsoid(
            prefix + "_RescueCollar_" + suffix,
            (sign * unit * 0.23, -unit * 0.54, chest.z + unit * 0.22),
            (unit * 0.25, unit * 0.045, unit * 0.20),
            armature,
            {"chest": 0.84, "neck": 0.16},
            materials["secondary"],
            22,
            12,
        )
        for row in range(2):
            weighted_ellipsoid(
                prefix + f"_ReflectivePanel_{suffix}_{row}",
                (sign * unit * 0.31, -unit * 0.64, chest.z - unit * (0.05 + row * 0.25)),
                (unit * 0.24, unit * 0.025, unit * 0.055),
                armature,
                {"chest": 0.55, "spine": 0.45},
                materials["accent"],
                20,
                10,
            )
        weighted_ellipsoid(
            prefix + "_RescuePocket_" + suffix,
            (sign * unit * 0.31, -unit * 0.655, hips.z + unit * 0.42),
            (unit * 0.22, unit * 0.04, unit * 0.18),
            armature,
            {"spine": 0.62, "hips": 0.38},
            materials["fabric"],
            22,
            12,
        )
    tube(
        prefix + "_RescueZipper",
        [(0.0, -unit * 0.655, chest.z + unit * 0.24), (0.0, -unit * 0.69, hips.z + unit * 0.15)],
        [unit * 0.018, unit * 0.018],
        [{"chest": 1.0}, {"hips": 0.60, "spine": 0.40}],
        armature,
        materials["hardware"],
        10,
    )

    upper = "upper_leg.R"
    lower = "lower_leg.R"
    foot = "foot.R"
    toes = "toes.R"
    knee = COMMON.bone_head(armature, lower)
    ankle = COMMON.bone_head(armature, foot)
    toe_root = COMMON.bone_head(armature, toes)
    radius = unit * 0.29 * spec.get("leg_scale", 1.0)
    for side_index, x_offset in enumerate((-1.0, 1.0)):
        ellipsoid(
            prefix + f"_ProstheticKneeHinge_{side_index}",
            (knee.x + x_offset * radius * 0.72, knee.y, knee.z),
            (radius * 0.18, radius * 0.50, radius * 0.50),
            armature,
            lower,
            materials["hardware"] if side_index == 0 else materials["accent"],
            22,
            14,
        )
    tube(
        prefix + "_ProstheticPylon",
        [COMMON.blend(knee, ankle, 0.25), COMMON.blend(knee, ankle, 0.55), COMMON.blend(knee, ankle, 0.82)],
        [radius * 0.23, radius * 0.18, radius * 0.20],
        [{upper: 0.08, lower: 0.92}, {lower: 1.0}, {lower: 0.80, foot: 0.20}],
        armature,
        materials["hardware"],
        14,
    )
    for index, amount in enumerate((0.29, 0.50, 0.71)):
        p = COMMON.blend(knee, ankle, amount)
        ellipsoid(
            prefix + f"_ProstheticPylonBand_{index}",
            p,
            (radius * 0.38, radius * 0.34, unit * 0.035),
            armature,
            lower,
            materials["prosthetic_dark"],
            20,
            10,
        )
    weighted_ellipsoid(
        prefix + "_ProstheticFootPlate",
        COMMON.blend(ankle, toe_root, 0.58),
        (radius * 0.92, unit * 0.34, unit * 0.070),
        armature,
        {foot: 0.62, toes: 0.38},
        materials["prosthetic_dark"],
        26,
        12,
    )


def add_neoul_v2(prefix, spec, armature, materials, face_context):
    unit = spec["height"] / spec["heads"]
    center, eye_y, _, _ = face_context
    chest = COMMON.bone_head(armature, "chest")
    hips = COMMON.bone_head(armature, "hips")
    # Branching secondary crown with luminous polyps (not merely four spikes).
    roots = (
        (-0.42, 0.12, 0.28, -0.70, 0.20, 0.64),
        (-0.28, 0.18, 0.44, -0.48, 0.29, 0.91),
        (-0.09, 0.21, 0.48, -0.12, 0.34, 1.02),
        (0.09, 0.21, 0.48, 0.12, 0.34, 1.02),
        (0.28, 0.18, 0.44, 0.48, 0.29, 0.91),
        (0.42, 0.12, 0.28, 0.70, 0.20, 0.64),
    )
    for index, values in enumerate(roots):
        x0, y0, z0, x1, y1, z1 = values
        midpoint = ((x0 + x1) * 0.50, (y0 + y1) * 0.48, (z0 + z1) * 0.52)
        points = [
            (center.x + unit * x0, center.y + unit * y0, center.z + unit * z0),
            (center.x + unit * midpoint[0], center.y + unit * midpoint[1], center.z + unit * midpoint[2]),
            (center.x + unit * x1, center.y + unit * y1, center.z + unit * z1),
        ]
        tube(
            prefix + f"_CoralBranchV2_{index}",
            points,
            [unit * 0.072, unit * 0.050, unit * 0.025],
            [{"head": 1.0}] * 3,
            armature,
            materials["secondary"] if index % 2 else materials["hair"],
            12,
        )
        tip = Vector(points[-1])
        ellipsoid(
            prefix + f"_CoralPolypTip_{index}",
            tip,
            (unit * 0.070, unit * 0.060, unit * 0.070),
            armature,
            "head",
            materials["pearl"],
            20,
            12,
        )
        side_sign = -1.0 if index % 2 else 1.0
        branch_base = Vector(points[1])
        branch_tip = branch_base + Vector((side_sign * unit * 0.15, unit * 0.035, unit * 0.18))
        tube(
            prefix + f"_CoralSubBranch_{index}",
            [branch_base, branch_tip],
            [unit * 0.038, unit * 0.017],
            [{"head": 1.0}, {"head": 1.0}],
            armature,
            materials["secondary"],
            10,
        )
        ellipsoid(
            prefix + f"_CoralPolypSide_{index}",
            branch_tip,
            (unit * 0.048, unit * 0.043, unit * 0.048),
            armature,
            "head",
            materials["accent"],
            18,
            10,
        )

    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        # Three nested fin lobes and two gill marks per side.
        for lobe in range(3):
            fin = ellipsoid(
                prefix + f"_TempleFinLobe_{suffix}_{lobe}",
                (sign * unit * (0.49 + lobe * 0.055), center.y + unit * 0.018, center.z + unit * (0.08 - lobe * 0.10)),
                (unit * (0.18 - lobe * 0.025), unit * 0.038, unit * (0.24 - lobe * 0.025)),
                armature,
                "head",
                materials["secondary"] if lobe % 2 == 0 else materials["accent"],
                22,
                12,
            )
            fin.rotation_euler.y = sign * (0.42 + lobe * 0.08)
        for gill in range(2):
            ellipsoid(
                prefix + f"_GillMark_{suffix}_{gill}",
                (sign * unit * 0.315, eye_y - unit * 0.040, center.z - unit * (0.09 + gill * 0.065)),
                (unit * 0.075, unit * 0.009, unit * 0.014),
                armature,
                "head",
                materials["pearl"],
                16,
                8,
            )
        weighted_ellipsoid(
            prefix + "_TideMantleLayer_" + suffix,
            (sign * unit * 0.39, unit * 0.20, (hips.z + chest.z) * 0.59),
            (unit * 0.45, unit * 0.055, unit * 0.76),
            armature,
            {"chest": 0.52, "spine": 0.38, "hips": 0.10},
            materials["fabric"] if sign > 0 else materials["primary"],
            28,
            16,
        )
    tube(
        prefix + "_TideMantlePearlEdge",
        [(-unit * 0.55, -unit * 0.50, chest.z - unit * 0.12), (0.0, -unit * 0.59, hips.z + unit * 0.35), (unit * 0.55, -unit * 0.50, chest.z - unit * 0.12)],
        [unit * 0.022] * 3,
        [{"chest": 0.65, "spine": 0.35}, {"hips": 0.35, "spine": 0.65}, {"chest": 0.65, "spine": 0.35}],
        armature,
        materials["pearl"],
        10,
    )


def add_style_details_v2(prefix, spec, armature, materials, face_context):
    ensure_detail_materials(prefix, spec, materials)
    # Keep the Wave 5 silhouette cues, then add construction and close-up art.
    ORIGINAL_STYLE_DETAILS(prefix, spec, armature, materials, face_context)
    add_common_hand_and_foot_detail(prefix, spec, armature, materials)
    style = spec["style"]
    if style == "haenyeo_mentor":
        add_sunja_v2(prefix, spec, armature, materials, face_context)
    elif style == "couture_director":
        add_maya_v2(prefix, spec, armature, materials, face_context)
    elif style == "adaptive_rescuer":
        add_iseul_v2(prefix, spec, armature, materials, face_context)
    elif style == "coral_djinn":
        add_neoul_v2(prefix, spec, armature, materials, face_context)
    else:
        raise ValueError("Unknown Wave 6 style: " + style)


WAVE5.add_style_details = add_style_details_v2


def configure_vrm_v2(armature, spec):
    ORIGINAL_CONFIGURE_VRM(armature, spec)
    meta = armature.data.vrm_addon_extension.vrm1.meta
    meta.version = "4.0.0"
    meta.copyright_information = "ToonSpectrum Wave 5 original, Wave 6 visual-quality v2"
    meta.references.clear()
    meta.references.add().value = (
        "Procedurally regenerated with Blender 5.2 and the official VRM Add-on exporter"
    )


WAVE5.configure_vrm = configure_vrm_v2


def generate_character(spec):
    armature = WAVE5.build_character(spec)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = armature
    filepath = WAVE5.OUTPUT_DIR + "/" + spec["file"]
    result = bpy.ops.export_scene.vrm(
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
    if result != {"FINISHED"}:
        raise RuntimeError("VRM export failed for " + spec["file"] + ": " + repr(result))
    mesh_count = sum(1 for obj in bpy.context.scene.objects if obj.type == "MESH")
    triangle_count = sum(
        len(obj.data.loop_triangles) if obj.data.loop_triangles else sum(len(p.vertices) - 2 for p in obj.data.polygons)
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
    )
    print(
        "WAVE6_VRM_EXPORT",
        spec["file"],
        len(armature.data.bones),
        mesh_count,
        triangle_count,
        filepath,
    )


def main():
    requested_value = bpy.context.scene.get("toonspectrum_vrm_files", "")
    requested = {
        file_name.strip()
        for file_name in requested_value.split(",")
        if file_name.strip()
    }
    selected = [
        spec for spec in WAVE5.CHARACTERS if not requested or spec["file"] in requested
    ]
    if requested and len(selected) != len(requested):
        known = {spec["file"] for spec in WAVE5.CHARACTERS}
        raise ValueError("Unknown Wave 6 VRM files: " + ", ".join(sorted(requested - known)))
    for spec in selected:
        generate_character(spec)
    print("WAVE6_VRM_COMPLETE", len(selected))


if __name__ == "__main__":
    main()
