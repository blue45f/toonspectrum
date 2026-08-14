"""Generate ToonSpectrum Wave 5 original adult VRM 1.0 characters.

Wave 5 intentionally broadens the bundled cast without repeating the existing
gardeners, archivists, rescue captain, android, golem, or sea-otter courier:

* Sunja — a senior Jeju haenyeo mentor with a compact, powerful build;
* Maya — a plus-size couture director with a structured asymmetric silhouette;
* Iseul — an adaptive rescue specialist with a visible below-knee prosthesis;
* Neoul — a nonhuman coral djinn with an aquatic crown and fins.

The strict rig implementation is shared with the reviewed Wave 4 generator:
connected torso/limb lofts, genuine two-bone transition weights, visible
geometry for every finger, both eye bones and both toe bones, and 13 bound VRM
preset expressions backed by real morph targets. All output uses MToon 1.0,
direct CC0 metadata, and the official Blender VRM Add-on exporter.

This script is safe for Blender MCP: it uses the shared ``clear_scene()``
helper and never calls ``read_factory_settings``.

Requirements: Blender 5.2+, VRM Add-on for Blender 4.5+.
"""

import bpy
from mathutils import Vector


SCRIPT_DIR = __file__.rsplit("/", 1)[0]
COMMON_PATH = str(
    bpy.context.scene.get("toonspectrum_wave4_common_path")
    or SCRIPT_DIR + "/generate_toonspectrum_vrm_pack_wave4.py"
)
# Blender Text.as_module() keeps the dependency inside bpy and avoids pathlib,
# importlib and direct file I/O. Those modules are intentionally blocked by the
# blend-ai MCP sandbox, while Wave 4 itself only imports Blender-safe modules.
COMMON = bpy.data.texts.load(COMMON_PATH).as_module()


OUTPUT_DIR = (
    bpy.context.scene.get("toonspectrum_vrm_output_dir")
    or bpy.path.abspath("//public/vrm")
)
AUTHOR = "ToonSpectrum"
CC0_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"


def add_shape_key_from_basis(obj, name, transform):
    """Create an independent morph target from Basis, never from the last key.

    Blender's ``shape_key_add`` defaults to ``from_mix=True``. Calling it in a
    sequence can therefore accumulate earlier target deltas into later keys;
    a small mouth expression eventually becomes an exploded mesh. Wave 5
    explicitly copies every target from Basis before applying its one bounded
    deformation. Assigning this helper into the shared module also fixes the
    global referenced by ``COMMON.add_face``.
    """
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    basis = obj.data.shape_keys.key_blocks["Basis"]
    key = obj.shape_key_add(name=name, from_mix=False)
    for basis_point, target_point in zip(basis.data, key.data):
        target_point.co = basis_point.co
        transform(target_point.co)
    return key


COMMON.add_shape_key = add_shape_key_from_basis


CHARACTERS = (
    {
        "file": "TS_Sunja_HaenyeoMentor.vrm",
        "name": "선자 (해녀 멘토)",
        "style": "haenyeo_mentor",
        "height": 1.55,
        "heads": 6.15,
        "age": 0.965,
        "shoulder": 0.111,
        "body": (1.10, 1.06, 1.14),
        "arm_scale": 1.13,
        "leg_scale": 1.10,
        "skin": (0.57, 0.36, 0.245, 1.0),
        "primary": (0.025, 0.105, 0.14, 1.0),
        "secondary": (0.025, 0.30, 0.34, 1.0),
        "accent": (0.94, 0.29, 0.13, 1.0),
        "hair": (0.73, 0.75, 0.72, 1.0),
        "fabric": (0.018, 0.055, 0.075, 1.0),
    },
    {
        "file": "TS_Maya_CoutureDirector.vrm",
        "name": "마야 (쿠튀르 디렉터)",
        "style": "couture_director",
        "height": 1.72,
        "heads": 6.40,
        "age": 0.89,
        "shoulder": 0.104,
        "body": (1.32, 1.22, 1.18),
        "belly": 0.34,
        "arm_scale": 1.16,
        "leg_scale": 1.14,
        "skin": (0.23, 0.105, 0.070, 1.0),
        "primary": (0.16, 0.045, 0.24, 1.0),
        "secondary": (0.86, 0.18, 0.45, 1.0),
        "accent": (0.97, 0.66, 0.19, 1.0),
        "hair": (0.025, 0.012, 0.020, 1.0),
        "fabric": (0.36, 0.10, 0.43, 1.0),
    },
    {
        "file": "TS_Iseul_AdaptiveRescuer.vrm",
        "name": "이슬 (의족 구조전문가)",
        "style": "adaptive_rescuer",
        "height": 1.70,
        "heads": 6.85,
        "age": 0.87,
        "shoulder": 0.112,
        "body": (1.10, 1.02, 1.14),
        "arm_scale": 1.17,
        "leg_scale": 1.12,
        "skin": (0.76, 0.53, 0.36, 1.0),
        "primary": (0.91, 0.22, 0.075, 1.0),
        "secondary": (0.075, 0.13, 0.20, 1.0),
        "accent": (0.95, 0.82, 0.12, 1.0),
        "hair": (0.040, 0.027, 0.022, 1.0),
        "fabric": (0.16, 0.22, 0.30, 1.0),
    },
    {
        "file": "TS_Neoul_CoralDjinn.vrm",
        "name": "너울 (산호 진)",
        "style": "coral_djinn",
        "height": 1.82,
        "heads": 6.75,
        "age": 0.86,
        "shoulder": 0.104,
        "body": (1.14, 1.08, 1.12),
        "arm_scale": 1.10,
        "leg_scale": 1.08,
        "skin": (0.14, 0.52, 0.55, 1.0),
        "primary": (0.055, 0.15, 0.28, 1.0),
        "secondary": (0.88, 0.24, 0.35, 1.0),
        "accent": (0.98, 0.68, 0.24, 1.0),
        "hair": (0.40, 0.08, 0.19, 1.0),
        "fabric": (0.08, 0.30, 0.43, 1.0),
        "eye": (0.90, 0.99, 0.91, 1.0),
        "pupil": (0.015, 0.08, 0.12, 1.0),
        "head_scale": (1.08, 1.03, 1.07),
    },
)


def configure_vrm(armature, spec):
    extension = armature.data.vrm_addon_extension
    extension.spec_version = "1.0"
    meta = extension.vrm1.meta
    meta.vrm_name = spec["name"]
    meta.version = "3.0.0"
    meta.authors.add().value = AUTHOR
    meta.copyright_information = "ToonSpectrum Wave 5 original procedural character"
    meta.contact_information = "ToonSpectrum"
    meta.references.add().value = (
        "Generated with Blender 5.2 and the official VRM Add-on exporter"
    )
    meta.avatar_permission = "everyone"
    meta.commercial_usage = "corporation"
    meta.credit_notation = "unnecessary"
    meta.allow_redistribution = True
    meta.modification = "allowModificationRedistribution"
    meta.other_license_url = CC0_LICENSE_URL
    meta.allow_excessively_violent_usage = True
    meta.allow_excessively_sexual_usage = True
    meta.allow_political_or_religious_usage = True
    meta.allow_antisocial_or_hate_usage = False


def head_cover(prefix, center, unit, spec, armature, materials, *, scale=(0.505, 0.43, 0.47)):
    return COMMON.ellipsoid(
        prefix + "_HeadCover",
        (center.x, center.y + unit * 0.065, center.z + unit * 0.13),
        tuple(unit * value for value in scale),
        armature,
        "head",
        materials["hair"],
        28,
        18,
    )


def add_haenyeo_details(prefix, spec, armature, materials, face_context):
    unit = spec["height"] / spec["heads"]
    center, _, _, _ = face_context
    hips = COMMON.bone_head(armature, "hips")
    chest = COMMON.bone_head(armature, "chest")
    neck = COMMON.bone_head(armature, "neck")

    # Dark diving hood remains behind the face, leaving eyes and mouth clear.
    COMMON.ellipsoid(
        prefix + "_DiveHood",
        (center.x, center.y + unit * 0.060, center.z + unit * 0.10),
        (unit * 0.52, unit * 0.45, unit * 0.50),
        armature,
        "head",
        materials["fabric"],
        28,
        18,
    )
    COMMON.weighted_ellipsoid(
        prefix + "_HoodCollar",
        (0.0, unit * 0.02, neck.z - unit * 0.02),
        (unit * 0.48, unit * 0.36, unit * 0.21),
        armature,
        {"neck": 0.35, "chest": 0.65},
        materials["fabric"],
        24,
        12,
    )
    COMMON.weighted_ellipsoid(
        prefix + "_HaenyeoVest",
        (0.0, -unit * 0.48, (hips.z + chest.z) * 0.54),
        (unit * 0.83 * spec["body"][0], unit * 0.050, unit * 0.70),
        armature,
        {"spine": 0.58, "chest": 0.32, "hips": 0.10},
        materials["secondary"],
        24,
        14,
    )
    COMMON.make_badge(
        prefix + "_TewakMark",
        (0.0, -unit * 0.555, chest.z - unit * 0.02),
        (unit * 0.17, unit * 0.030, unit * 0.17),
        armature,
        materials["accent"],
    )
    for sign in (-1.0, 1.0):
        COMMON.make_badge(
            prefix + "_WaveStripe_" + str(int(sign)),
            (sign * unit * 0.23, -unit * 0.565, hips.z + unit * 0.44),
            (unit * 0.15, unit * 0.020, unit * 0.045),
            armature,
            materials["accent"],
            "spine",
        )


def add_couture_details(prefix, spec, armature, materials, face_context):
    unit = spec["height"] / spec["heads"]
    center, _, _, _ = face_context
    hips = COMMON.bone_head(armature, "hips")
    chest = COMMON.bone_head(armature, "chest")
    head_cover(prefix, center, unit, spec, armature, materials, scale=(0.52, 0.44, 0.48))
    for sign in (-1.0, 1.0):
        COMMON.ellipsoid(
            prefix + "_HairCoil_" + str(int(sign)),
            (sign * unit * 0.36, center.y + unit * 0.18, center.z + unit * 0.22),
            (unit * 0.20, unit * 0.16, unit * 0.23),
            armature,
            "head",
            materials["hair"],
            20,
            12,
        )

    # A cape wing sits behind the body; the front diagonal sash gives a clear
    # couture read without hiding facial features or the body silhouette.
    cape = COMMON.weighted_ellipsoid(
        prefix + "_AsymmetricCape",
        (unit * 0.47, unit * 0.28, (hips.z + chest.z) * 0.58),
        (unit * 0.68, unit * 0.085, unit * 0.96),
        armature,
        {"chest": 0.56, "spine": 0.36, "hips": 0.08},
        materials["secondary"],
        24,
        14,
    )
    cape.rotation_euler.y = -0.16
    sash = COMMON.weighted_ellipsoid(
        prefix + "_CoutureSash",
        (0.0, -unit * 0.58, (hips.z + chest.z) * 0.54),
        (unit * 0.17, unit * 0.035, unit * 0.70),
        armature,
        {"chest": 0.44, "spine": 0.44, "hips": 0.12},
        materials["accent"],
        20,
        12,
    )
    sash.rotation_euler.y = 0.42
    COMMON.weighted_ellipsoid(
        prefix + "_PeplumBelt",
        (0.0, -unit * 0.52, hips.z + unit * 0.15),
        (unit * 0.92 * spec["body"][0], unit * 0.065, unit * 0.14),
        armature,
        {"hips": 0.72, "spine": 0.28},
        materials["fabric"],
        24,
        10,
    )
    for sign in (-1.0, 1.0):
        COMMON.make_badge(
            prefix + "_GoldClasp_" + str(int(sign)),
            (sign * unit * 0.20, -unit * 0.62, chest.z + unit * 0.02),
            (unit * 0.072, unit * 0.024, unit * 0.072),
            armature,
            materials["accent"],
        )


def add_adaptive_rescuer_details(prefix, spec, armature, materials, face_context):
    unit = spec["height"] / spec["heads"]
    center, _, _, _ = face_context
    chest = COMMON.bone_head(armature, "chest")
    hips = COMMON.bone_head(armature, "hips")
    head_cover(prefix, center, unit, spec, armature, materials, scale=(0.48, 0.40, 0.42))
    COMMON.ellipsoid(
        prefix + "_ShortHairCrown",
        (center.x, center.y + unit * 0.06, center.z + unit * 0.24),
        (unit * 0.49, unit * 0.41, unit * 0.34),
        armature,
        "head",
        materials["hair"],
        24,
        14,
    )
    COMMON.weighted_ellipsoid(
        prefix + "_RescueVest",
        (0.0, -unit * 0.51, (hips.z + chest.z) * 0.56),
        (unit * 0.78 * spec["body"][0], unit * 0.050, unit * 0.70),
        armature,
        {"chest": 0.42, "spine": 0.48, "hips": 0.10},
        materials["primary"],
        24,
        14,
    )
    COMMON.make_badge(
        prefix + "_RescueBeacon",
        (0.0, -unit * 0.58, chest.z),
        (unit * 0.16, unit * 0.030, unit * 0.16),
        armature,
        materials["accent"],
    )

    # Right below-knee prosthesis. The original connected leg remains the skin
    # continuity layer, while these lower-leg/foot shells carry real lower-leg,
    # foot and toe weights and visibly replace the silhouette.
    suffix = "R"
    upper = "upper_leg." + suffix
    lower = "lower_leg." + suffix
    foot = "foot." + suffix
    toes = "toes." + suffix
    knee = COMMON.bone_head(armature, lower)
    hip = COMMON.bone_head(armature, upper)
    ankle = COMMON.bone_head(armature, foot)
    toe_root = COMMON.bone_head(armature, toes)
    toe_tip = COMMON.bone_tail(armature, toes)
    radius = unit * 0.31 * spec.get("leg_scale", 1.0)
    thigh_radius = unit * 0.285 * spec.get("leg_scale", 1.0)
    COMMON.make_tube(
        prefix + "_ProstheticSideTrouser_R",
        [hip, COMMON.blend(hip, knee, 0.50), COMMON.blend(hip, knee, 0.86), knee],
        [
            (thigh_radius * 1.17, thigh_radius * 1.04),
            (thigh_radius * 1.08, thigh_radius * 0.98),
            (thigh_radius * 0.96, thigh_radius * 0.88),
            (thigh_radius * 0.90, thigh_radius * 0.84),
        ],
        [
            {upper: 1.0},
            {upper: 1.0},
            {upper: 0.74, lower: 0.26},
            {upper: 0.50, lower: 0.50},
        ],
        armature,
        materials["secondary"],
        16,
    )
    socket_center = COMMON.blend(knee, ankle, 0.14)
    COMMON.weighted_ellipsoid(
        prefix + "_ProstheticSocket_R",
        socket_center,
        (radius * 1.08, radius * 0.94, unit * 0.16),
        armature,
        {upper: 0.16, lower: 0.84},
        materials["prosthetic_dark"],
        22,
        12,
    )
    points = [
        COMMON.blend(knee, ankle, 0.18),
        COMMON.blend(knee, ankle, 0.46),
        COMMON.blend(knee, ankle, 0.76),
        ankle,
        COMMON.blend(ankle, toe_root, 0.70),
        toe_root,
        COMMON.blend(toe_root, toe_tip, 0.70),
        toe_tip,
    ]
    radii = [
        (radius * 0.92, radius * 0.82),
        (radius * 0.46, radius * 0.40),
        (radius * 0.39, radius * 0.35),
        (radius * 0.54, radius * 0.45),
        (radius * 0.62, radius * 0.42),
        (radius * 0.72, radius * 0.39),
        (radius * 0.69, radius * 0.33),
        (radius * 0.44, radius * 0.26),
    ]
    weights = [
        {upper: 0.12, lower: 0.88},
        {lower: 1.0},
        {lower: 0.82, foot: 0.18},
        {lower: 0.46, foot: 0.54},
        {foot: 1.0},
        {foot: 0.74, toes: 0.26},
        {foot: 0.28, toes: 0.72},
        {toes: 1.0},
    ]
    COMMON.make_tube(
        prefix + "_ConnectedProsthesis_R",
        points,
        radii,
        weights,
        armature,
        materials["prosthetic"],
        16,
    )


def add_coral_djinn_details(prefix, spec, armature, materials, face_context):
    unit = spec["height"] / spec["heads"]
    center, eye_y, _, _ = face_context
    chest = COMMON.bone_head(armature, "chest")
    hips = COMMON.bone_head(armature, "hips")
    head_cover(prefix, center, unit, spec, armature, materials, scale=(0.49, 0.42, 0.43))

    # Organic coral crown branches grow upward and backward so the full face
    # remains readable in front and three-quarter camera views.
    crown_roots = (
        (-0.34, 0.10, 0.28, -0.55, 0.18, 0.78),
        (-0.16, 0.14, 0.35, -0.22, 0.24, 0.94),
        (0.16, 0.14, 0.35, 0.22, 0.24, 0.94),
        (0.34, 0.10, 0.28, 0.55, 0.18, 0.78),
    )
    for index, (x0, y0, z0, x1, y1, z1) in enumerate(crown_roots):
        points = [
            (center.x + unit * x0, center.y + unit * y0, center.z + unit * z0),
            (center.x + unit * (x0 + x1) * 0.52, center.y + unit * (y0 + y1) * 0.52, center.z + unit * (z0 + z1) * 0.52),
            (center.x + unit * x1, center.y + unit * y1, center.z + unit * z1),
        ]
        COMMON.make_tube(
            prefix + "_CoralBranch_" + str(index),
            points,
            [unit * 0.075, unit * 0.055, unit * 0.028],
            [{"head": 1.0}, {"head": 1.0}, {"head": 1.0}],
            armature,
            materials["secondary"],
            10,
        )
    for sign, suffix in ((1.0, "L"), (-1.0, "R")):
        fin = COMMON.ellipsoid(
            prefix + "_TempleFin_" + suffix,
            (sign * unit * 0.48, center.y + unit * 0.025, center.z + unit * 0.02),
            (unit * 0.20, unit * 0.055, unit * 0.29),
            armature,
            "head",
            materials["secondary"],
            18,
            10,
        )
        fin.rotation_euler.y = sign * 0.45
    COMMON.make_badge(
        prefix + "_ForeheadPearl",
        (0.0, eye_y - unit * 0.012, center.z + unit * 0.30),
        (unit * 0.075, unit * 0.022, unit * 0.10),
        armature,
        materials["accent"],
        "head",
    )
    COMMON.weighted_ellipsoid(
        prefix + "_TideMantle",
        (0.0, unit * 0.23, (hips.z + chest.z) * 0.58),
        (unit * 0.92 * spec["body"][0], unit * 0.075, unit * 0.78),
        armature,
        {"chest": 0.50, "spine": 0.40, "hips": 0.10},
        materials["fabric"],
        24,
        14,
    )
    for sign in (-1.0, 1.0):
        COMMON.make_badge(
            prefix + "_CoralClasp_" + str(int(sign)),
            (sign * unit * 0.25, -unit * 0.54, chest.z - unit * 0.02),
            (unit * 0.10, unit * 0.026, unit * 0.15),
            armature,
            materials["accent"],
        )


def add_style_details(prefix, spec, armature, materials, face_context):
    style = spec["style"]
    if style == "haenyeo_mentor":
        add_haenyeo_details(prefix, spec, armature, materials, face_context)
    elif style == "couture_director":
        add_couture_details(prefix, spec, armature, materials, face_context)
    elif style == "adaptive_rescuer":
        add_adaptive_rescuer_details(prefix, spec, armature, materials, face_context)
    elif style == "coral_djinn":
        add_coral_djinn_details(prefix, spec, armature, materials, face_context)
    else:
        raise ValueError("Unknown Wave 5 style: " + style)


def build_character(spec):
    COMMON.clear_scene()
    result = bpy.ops.icyp.make_basic_armature(
        "EXEC_DEFAULT",
        tall=spec["height"],
        head_ratio=max(4.0, spec["heads"]),
        aging_ratio=spec["age"],
        shoulder_width=spec["shoulder"],
        arm_length_ratio=spec.get("arm_length", 1.0),
        leg_length_ratio=spec.get("leg_length", 1.0),
        hand_ratio=1.0,
        skip_heavy_armature_setup=False,
        wip_with_template_mesh=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError("VRM humanoid creation failed: " + repr(result))
    armature = bpy.context.view_layer.objects.active
    prefix = spec["file"].replace(".vrm", "")
    armature.name = prefix + "_Rig"
    configure_vrm(armature, spec)

    eye_color = spec.get("eye", (0.94, 0.97, 0.99, 1.0))
    pupil_color = spec.get("pupil", (0.012, 0.018, 0.024, 1.0))
    materials = {
        "skin": COMMON.make_material(prefix + "_Skin", spec["skin"], roughness=0.78),
        "primary": COMMON.make_material(prefix + "_Primary", spec["primary"], roughness=0.58),
        "secondary": COMMON.make_material(prefix + "_Secondary", spec["secondary"], roughness=0.64),
        "accent": COMMON.make_material(prefix + "_Accent", spec["accent"], metallic=0.16, roughness=0.32, emission=0.26),
        "hair": COMMON.make_material(prefix + "_Hair", spec["hair"], roughness=0.82),
        "fabric": COMMON.make_material(prefix + "_Fabric", spec["fabric"], roughness=0.86),
        "eye": COMMON.make_material(prefix + "_Eye", eye_color, roughness=0.28),
        "pupil": COMMON.make_material(prefix + "_Pupil", pupil_color, roughness=0.24),
        "mouth": COMMON.make_material(prefix + "_Mouth", (0.38, 0.055, 0.075, 1.0), roughness=0.52),
        "prosthetic": COMMON.make_material(prefix + "_Prosthetic", (0.58, 0.68, 0.76, 1.0), metallic=0.74, roughness=0.25),
        "prosthetic_dark": COMMON.make_material(prefix + "_ProstheticDark", (0.045, 0.065, 0.085, 1.0), metallic=0.42, roughness=0.38),
    }

    COMMON.add_torso(prefix, spec, armature, materials["primary"])
    for suffix in ("L", "R"):
        COMMON.add_arm(prefix, suffix, spec, armature, materials["fabric"], materials["skin"])
        adaptive_prosthetic_side = spec["style"] == "adaptive_rescuer" and suffix == "R"
        leg_material = (
            materials["prosthetic"] if adaptive_prosthetic_side else materials["secondary"]
        )
        shoe_material = (
            materials["prosthetic"]
            if adaptive_prosthetic_side
            else materials["accent"]
        )
        COMMON.add_leg(prefix, suffix, spec, armature, leg_material, shoe_material)

    unit = spec["height"] / spec["heads"]
    neck = COMMON.bone_head(armature, "neck")
    head = COMMON.bone_head(armature, "head")
    COMMON.weighted_ellipsoid(
        prefix + "_Neck",
        (neck + head) * 0.5,
        (unit * 0.29, unit * 0.27, max(unit * 0.25, (head.z - neck.z) * 0.48)),
        armature,
        {"neck": 0.78, "head": 0.22},
        materials["skin"],
        20,
        12,
    )
    center, eye_y, eye_z, targets = COMMON.add_face(prefix, spec, armature, materials)
    face_context = (center, eye_y, eye_z, targets)
    add_style_details(prefix, spec, armature, materials, face_context)
    COMMON.configure_expressions(armature, targets)
    return armature


def generate_character(spec):
    armature = build_character(spec)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = armature
    filepath = OUTPUT_DIR + "/" + spec["file"]
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
    print("WAVE5_VRM_EXPORT", spec["file"], len(armature.data.bones), filepath)


def main():
    requested_value = bpy.context.scene.get("toonspectrum_vrm_files", "")
    requested = {
        file_name.strip()
        for file_name in requested_value.split(",")
        if file_name.strip()
    }
    selected = [spec for spec in CHARACTERS if not requested or spec["file"] in requested]
    if requested and len(selected) != len(requested):
        known = {spec["file"] for spec in CHARACTERS}
        raise ValueError("Unknown Wave 5 VRM files: " + ", ".join(sorted(requested - known)))
    for spec in selected:
        generate_character(spec)
    print("WAVE5_VRM_COMPLETE", len(selected))


if __name__ == "__main__":
    main()
