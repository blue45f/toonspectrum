"""Rebuild the thirteen Wave 1 characters on the reviewed Wave 5 / Wave 6 pipeline.

An August 2026 skin-weight census of ``public/vrm`` found that every character
still produced by ``generate_toonspectrum_vrm_pack.py`` has **zero** mesh
vertices weighted to any finger bone. The Wave 1 body builder relies on the VRM
add-on's humanoid *skeleton* for hands and never authors finger *geometry*, so
all thirteen ship a rigged hand skeleton inside a single smooth mitten
ellipsoid. A render confirms the rest: the Wave 1 body is roughly thirty
disconnected ellipsoids with floating sausage arms.

    fingerVerts   character
    ----------- ------------------------------------------------------------
              0 TS_Minseo_Campus · TS_Taeo_Barista · TS_Jeonghwa_Gardener
              0 TS_Haram_Explorer · TS_Yeonhui_RuneGuard · TS_Nova_ServiceAndroid
              0 cyber_agent_zero · TS_Seojin_Architect · TS_Mira_Detective
              0 TS_Okseon_HanjiArchivist · TS_Nuri_RobotClub
              0 TS_Dami_RescueCaptain · TS_Moru_MossGolem
            720 Wave 4 characters (five)
           2230 Wave 5 / Wave 6 characters (four)

This wave is a re-host, not a fourth rig implementation. The Wave 5 body,
Wave 6 face and the Wave 4 connected-skin arm/leg builders stay the source of
truth; ``build_character`` already produces jointed limbs, a segmented hand
with per-phalanx weights, fingernails and knuckles. The only thing stopping
these thirteen from using it is ``add_style_details`` raising on an unknown
style, so this file supplies the missing per-style art pass: hair with a
readable webtoon silhouette, layered garments, and character-specific props.

Every public filename, catalog ID, VRM humanoid mapping and CC0 term is kept.

Run with Blender 5.2 and the VRM Add-on::

    blender -b --python scripts/blender/generate_toonspectrum_vrm_pack_wave7.py

Restrict the run by setting a scene string before execution::

    bpy.context.scene["toonspectrum_vrm_files"] = "TS_Mira_Detective.vrm"

Self-contained procedural geometry, CC0, no external resources.
"""

from math import cos, pi, sin

import bpy

# ``Text.as_module()`` sets ``__file__`` to the datablock name, not a path, so a
# caller that loads this file that way must pass the directory through the scene.
SCRIPT_DIR = (
    __file__.rsplit("/", 1)[0]
    if "/" in __file__
    else str(bpy.context.scene.get("toonspectrum_script_dir") or "")
)
if not SCRIPT_DIR:
    raise RuntimeError(
        "Wave 7 cannot resolve its script directory; set "
        'bpy.context.scene["toonspectrum_script_dir"] before loading it as a module.'
    )

for key, name in (
    ("toonspectrum_wave4_common_path", "generate_toonspectrum_vrm_pack_wave4.py"),
    ("toonspectrum_wave5_common_path", "generate_toonspectrum_vrm_pack_wave5.py"),
):
    if not bpy.context.scene.get(key):
        bpy.context.scene[key] = SCRIPT_DIR + "/" + name

# Text.as_module() keeps this loadable from the Blender CLI and from the MCP
# executor, which blocks plain filesystem imports.
WAVE6 = bpy.data.texts.load(SCRIPT_DIR + "/generate_toonspectrum_vrm_pack_wave6.py").as_module()
WAVE5 = WAVE6.WAVE5
COMMON = WAVE6.COMMON

ellipsoid = WAVE6.ellipsoid
weighted_ellipsoid = WAVE6.weighted_ellipsoid
tube = WAVE6.tube


# ───────────────────────────── character roster ─────────────────────────────
#
# Proportions, palette and style key are carried over verbatim from Wave 1 so
# the thirteen keep their established identity; only ``fabric`` is added, which
# the Wave 5 material table requires and Wave 1 never defined.

# TS_Minseo_Campus is not in CHARACTERS. It is the SHA-pinned canonical source of
# the reproducible avatar-reference render -- studio-vrm-avatar-reference-
# product.ts, the catalogue generator's drift guard, and
# public/catalog/...-catalogue-v1.json all pin its bytes -- so regenerating it
# means republishing that catalogue in the same change. It lives in
# OPT_IN_CHARACTERS below and is only built when named explicitly, because an
# empty file filter means "all" and once regenerated it by accident.
CHARACTERS = (
    {
        "file": "TS_Taeo_Barista.vrm", "name": "태오 (동네 바리스타)", "style": "barista",
        "height": 1.73, "heads": 6.8, "age": 0.82, "shoulder": 0.095,
        "body": (1.20, 1.10, 1.13),
        "skin": (0.60, 0.36, 0.23, 1.0), "primary": (0.10, 0.35, 0.33, 1.0),
        "secondary": (0.45, 0.20, 0.10, 1.0), "accent": (0.78, 0.67, 0.51, 1.0),
        "hair": (0.035, 0.022, 0.017, 1.0), "fabric": (0.14, 0.30, 0.29, 1.0),
    },
    {
        "file": "TS_Jeonghwa_Gardener.vrm", "name": "정화 (노년 정원사)", "style": "gardener",
        "height": 1.58, "heads": 6.55, "age": 0.88, "shoulder": 0.066,
        "body": (0.96, 1.02, 0.98),
        "skin": (0.69, 0.46, 0.32, 1.0), "primary": (0.25, 0.34, 0.20, 1.0),
        "secondary": (0.40, 0.23, 0.31, 1.0), "accent": (0.78, 0.72, 0.62, 1.0),
        "hair": (0.58, 0.56, 0.53, 1.0), "fabric": (0.30, 0.36, 0.26, 1.0),
    },
    {
        "file": "TS_Haram_Explorer.vrm", "name": "하람 (어린 탐험가)", "style": "explorer",
        "height": 1.34, "heads": 5.3, "age": 0.18, "shoulder": 0.055,
        "body": (0.88, 0.91, 0.90),
        "skin": (0.73, 0.49, 0.31, 1.0), "primary": (0.82, 0.50, 0.08, 1.0),
        "secondary": (0.16, 0.42, 0.56, 1.0), "accent": (0.72, 0.18, 0.12, 1.0),
        "hair": (0.10, 0.055, 0.025, 1.0), "fabric": (0.62, 0.40, 0.12, 1.0),
        # Haram is a child; vrm-original-bundle.test.ts requires these stay false.
        "allow_excessively_violent_usage": False,
        "allow_excessively_sexual_usage": False,
    },
    {
        "file": "TS_Yeonhui_RuneGuard.vrm", "name": "연휘 (룬 수호자)", "style": "rune_guard",
        "height": 1.79, "heads": 7.6, "age": 0.86, "shoulder": 0.092,
        "body": (1.08, 0.98, 1.03),
        "skin": (0.30, 0.16, 0.10, 1.0), "primary": (0.11, 0.10, 0.29, 1.0),
        "secondary": (0.42, 0.23, 0.10, 1.0), "accent": (0.10, 0.68, 0.72, 1.0),
        "hair": (0.025, 0.018, 0.022, 1.0), "fabric": (0.14, 0.13, 0.30, 1.0),
    },
    {
        "file": "TS_Nova_ServiceAndroid.vrm", "name": "노바 (서비스 안드로이드)", "style": "android",
        "height": 1.82, "heads": 7.25, "age": 0.90, "shoulder": 0.096,
        "body": (1.04, 0.94, 1.00),
        "skin": (0.66, 0.70, 0.74, 1.0), "primary": (0.055, 0.07, 0.095, 1.0),
        "secondary": (0.70, 0.75, 0.78, 1.0), "accent": (0.96, 0.46, 0.05, 1.0),
        "hair": (0.055, 0.07, 0.095, 1.0), "fabric": (0.12, 0.14, 0.17, 1.0),
        "eye": (0.90, 0.95, 0.99, 1.0), "pupil": (0.96, 0.46, 0.05, 1.0),
    },
    {
        "file": "cyber_agent_zero.vrm", "name": "사이버 에이전트 제로", "style": "cyber_agent",
        "height": 1.84, "heads": 7.45, "age": 0.92, "shoulder": 0.105,
        "body": (1.12, 0.96, 1.08), "arm_scale": 1.08, "leg_scale": 1.04,
        "skin": (0.54, 0.37, 0.29, 1.0), "primary": (0.025, 0.045, 0.085, 1.0),
        "secondary": (0.12, 0.18, 0.27, 1.0), "accent": (0.00, 0.78, 1.00, 1.0),
        "hair": (0.018, 0.025, 0.040, 1.0), "fabric": (0.05, 0.08, 0.13, 1.0),
    },
    {
        "file": "TS_Seojin_Architect.vrm", "name": "서진 (배리어프리 건축가)", "style": "architect",
        "height": 1.70, "heads": 6.95, "age": 0.84, "shoulder": 0.108,
        "body": (1.16, 1.08, 1.00), "arm_scale": 1.20, "leg_scale": 0.84,
        "skin": (0.66, 0.43, 0.30, 1.0), "primary": (0.09, 0.23, 0.37, 1.0),
        "secondary": (0.78, 0.72, 0.61, 1.0), "accent": (0.96, 0.58, 0.08, 1.0),
        "hair": (0.055, 0.037, 0.028, 1.0), "fabric": (0.20, 0.30, 0.42, 1.0),
    },
    {
        "file": "TS_Mira_Detective.vrm", "name": "미라 (느와르 탐정)", "style": "detective",
        "height": 1.68, "heads": 6.65, "age": 0.86, "shoulder": 0.090,
        "body": (1.24, 1.17, 1.08), "arm_scale": 1.06, "leg_scale": 1.08,
        "skin": (0.76, 0.52, 0.38, 1.0), "primary": (0.16, 0.13, 0.12, 1.0),
        "secondary": (0.31, 0.25, 0.20, 1.0), "accent": (0.56, 0.08, 0.09, 1.0),
        "hair": (0.08, 0.055, 0.042, 1.0), "fabric": (0.22, 0.18, 0.15, 1.0),
    },
    {
        "file": "TS_Okseon_HanjiArchivist.vrm", "name": "옥선 (한지 기록가)", "style": "hanji_archivist",
        "height": 1.54, "heads": 6.15, "age": 0.94, "shoulder": 0.068,
        "body": (1.08, 1.10, 0.94), "arm_scale": 0.96, "leg_scale": 0.92,
        "skin": (0.72, 0.50, 0.37, 1.0), "primary": (0.19, 0.32, 0.30, 1.0),
        "secondary": (0.76, 0.68, 0.52, 1.0), "accent": (0.68, 0.16, 0.17, 1.0),
        "hair": (0.68, 0.66, 0.62, 1.0), "fabric": (0.82, 0.78, 0.68, 1.0),
    },
    {
        "file": "TS_Nuri_RobotClub.vrm", "name": "누리 (로봇 동아리원)", "style": "robot_club",
        "height": 1.47, "heads": 5.85, "age": 0.30, "shoulder": 0.062,
        "body": (0.90, 0.94, 0.88), "arm_scale": 0.90, "leg_scale": 0.88,
        "skin": (0.82, 0.62, 0.47, 1.0), "primary": (0.16, 0.28, 0.52, 1.0),
        "secondary": (0.88, 0.40, 0.12, 1.0), "accent": (0.10, 0.78, 0.74, 1.0),
        "hair": (0.055, 0.045, 0.052, 1.0), "fabric": (0.22, 0.32, 0.55, 1.0),
    },
    {
        "file": "TS_Dami_RescueCaptain.vrm", "name": "다미 (구조대장)", "style": "rescue_captain",
        "height": 1.76, "heads": 6.75, "age": 0.88, "shoulder": 0.112,
        "body": (1.36, 1.24, 1.22), "arm_scale": 1.28, "leg_scale": 1.20,
        "skin": (0.30, 0.18, 0.12, 1.0), "primary": (0.76, 0.16, 0.07, 1.0),
        "secondary": (0.10, 0.12, 0.15, 1.0), "accent": (0.98, 0.72, 0.06, 1.0),
        "hair": (0.020, 0.015, 0.014, 1.0), "fabric": (0.42, 0.12, 0.07, 1.0),
    },
    {
        "file": "TS_Moru_MossGolem.vrm", "name": "모루 (이끼 골렘)", "style": "moss_golem",
        "height": 1.92, "heads": 6.40, "age": 0.91, "shoulder": 0.118,
        "body": (1.30, 1.24, 1.30), "arm_scale": 1.34, "leg_scale": 1.30,
        "head_scale": (1.12, 1.05, 0.96),
        "skin": (0.28, 0.30, 0.27, 1.0), "primary": (0.16, 0.33, 0.17, 1.0),
        "secondary": (0.33, 0.38, 0.28, 1.0), "accent": (0.35, 0.92, 0.43, 1.0),
        "hair": (0.10, 0.27, 0.12, 1.0), "fabric": (0.20, 0.30, 0.20, 1.0),
        "eye": (0.14, 0.20, 0.12, 1.0), "pupil": (0.32, 1.00, 0.44, 1.0),
    },
)


# ─────────────────────────────── art toolkit ────────────────────────────────
#
# The character faces -Y, stands on +Z and is mirrored about x=0.


# Measured from a built Wave 6 head (TS_Mira_Detective, unit = 0.2526 m), as
# half-extents in head units around the ``center`` returned by ``add_face``:
#   x 0.49 · y 0.43 · z 0.58,  eye plane at y -0.40, z +0.075.
# Hair must stay behind y -0.30 and above z +0.10 or it swallows the face.
HEAD_HALF = (0.49, 0.43, 0.58)
HEAD_EYE_Z = 0.075
HAIRLINE_Y = -0.30

# Measured the same way from the Wave 4 connected-skin body, as half-extents in
# head units. Garments sized against the head instead of these read as small
# plates floating on a much larger torso, which is what the first pass did.
TORSO_HALF = (1.26, 0.66, 0.71)
ARM_RADIUS = 0.25
LEG_RADIUS = 0.35


def bone(armature, name):
    return COMMON.bone_head(armature, name)


# (y offset, z offset, rx, ry, rz) in head units, relative to ``center``.
HAIR_LAYERS = {
    # Back mass, crown cap, nape. Each stays behind HAIRLINE_Y at its front edge.
    "short": ((0.14, 0.04, 0.53, 0.40, 0.54), (0.10, 0.34, 0.52, 0.40, 0.28)),
    "medium": ((0.16, 0.02, 0.55, 0.42, 0.58), (0.10, 0.34, 0.53, 0.41, 0.28),
               (0.20, -0.30, 0.48, 0.36, 0.30)),
    "long": ((0.18, 0.00, 0.57, 0.44, 0.60), (0.10, 0.36, 0.54, 0.42, 0.28),
             (0.22, -0.36, 0.52, 0.40, 0.38)),
}


def hair_shell(prefix, spec, armature, materials, center, unit, *, cut="medium", scale=1.0):
    """Back-weighted hair mass. The cap sits on and behind the skull; it never
    reaches the eye plane, which is what turned Wave 7's first pass into a
    featureless dome."""
    made = []
    for index, (y_off, z_off, rx, ry, rz) in enumerate(HAIR_LAYERS[cut]):
        made.append(ellipsoid(
            prefix + f"_HairShell_{index}",
            (center.x, center.y + unit * y_off, center.z + unit * z_off),
            (unit * rx * scale, unit * ry * scale, unit * rz * scale),
            armature, "head", materials["hair"], 28, 18,
        ))
    return made


def bangs(prefix, spec, armature, materials, center, unit, *,
          count=7, spread=0.38, drop=0.10, depth=-0.30, lift=0.40, part=0.18):
    """Swept, pointed fringe locks. A row of separate ellipsoids reads as a line
    of bumps across the forehead; anime bangs need tapered strands with a parting.

    Every lock ends above HEAD_EYE_Z so the fringe never covers the eyes.
    """
    tip_z = lift - drop - 0.06
    assert tip_z > HEAD_EYE_Z, "fringe tips would reach the eye plane"
    for index in range(count):
        t = (index / max(count - 1, 1)) * 2.0 - 1.0
        # Locks sweep away from an off-centre parting.
        sweep = 1.0 if t >= part * -1.0 else -1.0
        root_x = center.x + unit * spread * t * 0.72
        tip_x = center.x + unit * (spread * t * 1.20 + sweep * 0.16)
        taper = 0.10 - 0.025 * abs(t)
        tube(
            prefix + f"_HairBang_{index}",
            [(root_x, center.y + unit * (depth + 0.34), center.z + unit * (lift + 0.30)),
             (root_x + (tip_x - root_x) * 0.45, center.y + unit * (depth + 0.06), center.z + unit * (lift + 0.06)),
             (tip_x, center.y + unit * depth, center.z + unit * (tip_z + 0.04 * abs(t)))],
            [unit * taper, unit * taper * 0.85, unit * 0.014],
            [{"head": 1.0}, {"head": 1.0}, {"head": 1.0}],
            armature, materials["hair"], 10,
        )
    # A soft mass behind the locks so the scalp never shows between them.
    ellipsoid(
        prefix + "_HairFringeMass",
        (center.x, center.y + unit * (depth + 0.16), center.z + unit * (lift + 0.10)),
        (unit * (spread + 0.16), unit * 0.20, unit * 0.20),
        armature, "head", materials["hair"], 26, 12,
    )


def side_locks(prefix, spec, armature, materials, center, unit, *,
               length=0.9, radius=0.10, out=0.46, chest_z=None):
    """A pair of weighted locks falling past the jaw onto the collarbone."""
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        end_z = center.z - unit * length
        if chest_z is not None:
            end_z = max(end_z, chest_z + unit * 0.12)
        tube(
            prefix + "_HairSideLock_" + suffix,
            [(center.x + sign * unit * out, center.y + unit * 0.02, center.z + unit * 0.18),
             (center.x + sign * unit * (out + 0.05), center.y - unit * 0.06, center.z - unit * length * 0.5),
             (center.x + sign * unit * (out - 0.02), center.y - unit * 0.02, end_z)],
            [unit * radius, unit * radius * 0.88, unit * radius * 0.55],
            [{"head": 1.0}, {"head": 0.7, "neck": 0.3}, {"neck": 0.45, "chest": 0.55}],
            armature, materials["hair"], 12,
        )


def ponytail(prefix, spec, armature, materials, center, unit, *, drop=1.3, radius=0.17):
    tube(
        prefix + "_Ponytail",
        [(center.x, center.y + unit * 0.46, center.z + unit * 0.16),
         (center.x, center.y + unit * 0.56, center.z - unit * drop * 0.45),
         (center.x, center.y + unit * 0.48, center.z - unit * drop)],
        [unit * radius, unit * radius * 0.92, unit * radius * 0.42],
        [{"head": 1.0}, {"head": 0.55, "neck": 0.45}, {"neck": 0.4, "chest": 0.6}],
        armature, materials["hair"], 14,
    )
    ellipsoid(prefix + "_PonytailTie", (center.x, center.y + unit * 0.49, center.z + unit * 0.08),
              (unit * 0.11, unit * 0.11, unit * 0.07), armature, "head", materials["accent"], 16, 10)


def hair_bun(prefix, spec, armature, materials, center, unit, *, back=0.44, lift=0.30, size=0.26):
    ellipsoid(prefix + "_HairBun", (center.x, center.y + unit * back, center.z + unit * lift),
              (unit * size, unit * size, unit * size * 0.9), armature, "head", materials["hair"], 24, 16)
    ring(prefix + "_HairBunPin", armature, "head", materials["accent"],
         (center.x, center.y + unit * back, center.z + unit * lift), unit * size * 1.05,
         unit * 0.018, axis="z")


def twin_tails(prefix, spec, armature, materials, center, unit, *, out=0.5, drop=1.05):
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        tube(
            prefix + "_TwinTail_" + suffix,
            [(center.x + sign * unit * out, center.y + unit * 0.30, center.z + unit * 0.26),
             (center.x + sign * unit * (out + 0.20), center.y + unit * 0.40, center.z - unit * drop * 0.45),
             (center.x + sign * unit * (out + 0.10), center.y + unit * 0.30, center.z - unit * drop)],
            [unit * 0.15, unit * 0.13, unit * 0.06],
            [{"head": 1.0}, {"head": 0.65, "neck": 0.35}, {"neck": 0.5, "chest": 0.5}],
            armature, materials["hair"], 12,
        )
        ellipsoid(prefix + "_TwinTailTie_" + suffix,
                  (center.x + sign * unit * out, center.y + unit * 0.30, center.z + unit * 0.26),
                  (unit * 0.10, unit * 0.10, unit * 0.07), armature, "head", materials["accent"], 14, 10)


def ring(name, armature, bone_name, material, centre, radius, thickness, *, axis="z", segments=20, weights=None):
    """A closed loop built from a tube, for brims, collars, goggles and bands."""
    points, radii, weight_list = [], [], []
    w = weights or {bone_name: 1.0}
    # Overlap the seam by half a segment: a duplicated first/last point would be
    # a zero-length tube segment.
    angles = [index / segments * 2 * pi for index in range(segments)]
    angles.append(2 * pi * (1.0 + 0.5 / segments))
    for a in angles:
        if axis == "z":
            p = (centre[0] + cos(a) * radius, centre[1] + sin(a) * radius, centre[2])
        elif axis == "y":
            p = (centre[0] + cos(a) * radius, centre[1], centre[2] + sin(a) * radius)
        else:
            p = (centre[0], centre[1] + cos(a) * radius, centre[2] + sin(a) * radius)
        points.append(p)
        radii.append(thickness)
        weight_list.append(dict(w))
    return tube(name, points, radii, weight_list, armature, material, 8)


def brim(prefix, name, armature, materials, centre, unit, *, radius=0.62, thickness=0.045, material_key="primary"):
    """Flat disc brim for hats, assembled from concentric rings so it stays a
    solid surface after the exporter welds it."""
    for index, scale in enumerate((0.45, 0.68, 0.86, 1.0)):
        ring(prefix + f"_{name}Ring_{index}", armature, "head", materials[material_key],
             (centre[0], centre[1], centre[2] - unit * thickness * index * 0.25),
             unit * radius * scale, unit * thickness * (1.0 - index * 0.16), axis="z", segments=22)


def jacket(prefix, spec, armature, materials, unit, chest, hips, *,
           key="primary", front=0.78, width=1.34, lapel=True):
    """Coat body sized to TORSO_HALF, plus a front opening. ``width`` is the coat
    half-width in head units; the bare torso is 1.26."""
    mid_z = (chest.z + hips.z) * 0.5
    # A single ellipsoid here made every character the same balloon. A garment
    # body needs a shoulder yoke, a chest, a waist and a hip: four stacked
    # sections give the taper that reads as a figure at panel scale.
    depth = TORSO_HALF[1] + 0.10
    sections = (
        # (z, half-width factor, depth factor, half-height)
        (chest.z + unit * 0.40, 1.00, 0.94, 0.26),
        (chest.z + unit * 0.06, 0.97, 1.00, 0.40),
        (mid_z - unit * 0.10, 0.76, 0.86, 0.42),
        (hips.z + unit * 0.10, 0.90, 0.94, 0.40),
    )
    weights = (
        {"chest": 0.85, "neck": 0.15}, {"chest": 0.80, "spine": 0.20},
        {"spine": 0.75, "hips": 0.25}, {"hips": 0.80, "spine": 0.20},
    )
    for index, ((z, wf, df, hh), w) in enumerate(zip(sections, weights)):
        weighted_ellipsoid(
            prefix + f"_CoatBody_{index}", (0.0, 0.0, z),
            (unit * width * wf, unit * depth * df, unit * hh),
            armature, w, materials[key], 30, 16,
        )
    # Shoulder caps so the sleeves leave a shoulder instead of the widest point.
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        shoulder = bone(armature, "shoulder." + suffix)
        upper = bone(armature, "upper_arm." + suffix)
        weighted_ellipsoid(
            prefix + "_CoatShoulder_" + suffix,
            ((shoulder.x + upper.x) * 0.5, upper.y, upper.z + unit * 0.04),
            (unit * 0.42, unit * 0.40, unit * 0.34),
            armature, {"upper_arm." + suffix: 0.55, "shoulder." + suffix: 0.25, "chest": 0.20},
            materials[key], 22, 14,
        )
    # Front opening: a single narrow placket. An earlier pass stacked lapels and
    # two coat edges here and the three volumes read as blobs, not as tailoring.
    weighted_ellipsoid(
        prefix + "_CoatPlacket", (0.0, -unit * front, mid_z),
        (unit * 0.085, unit * 0.05, unit * (TORSO_HALF[2] + 0.06)),
        armature, {"chest": 0.5, "spine": 0.5}, materials["secondary"], 12, 14,
    )
    if lapel:
        for suffix, sign in (("L", 1.0), ("R", -1.0)):
            tube(
                prefix + "_Lapel_" + suffix,
                [(sign * unit * 0.34, -unit * front, chest.z + unit * 0.40),
                 (sign * unit * 0.13, -unit * front, chest.z - unit * 0.26)],
                [unit * 0.075, unit * 0.055],
                [{"chest": 0.9, "neck": 0.1}, {"chest": 0.7, "spine": 0.3}],
                armature, materials["secondary"], 8,
            )
    sleeves(prefix, spec, armature, materials, unit, key=key)


def collar(prefix, spec, armature, materials, unit, *, key="secondary", scale=1.0):
    neck = bone(armature, "neck")
    ring(prefix + "_Collar", armature, "neck", materials[key],
         (0.0, neck.y, neck.z + unit * 0.02), unit * 0.46 * scale, unit * 0.085 * scale,
         axis="z", weights={"neck": 0.55, "chest": 0.45})


def belt(prefix, spec, armature, materials, unit, z, *, key="secondary", radius=1.34, thickness=0.085):
    hips = bone(armature, "hips")
    ring(prefix + "_Belt", armature, "hips", materials[key],
         (0.0, hips.y, z), unit * radius, unit * thickness, axis="z",
         weights={"hips": 0.7, "spine": 0.3})


def strap(prefix, name, spec, armature, materials, unit, chest, hips, *, key="secondary", sign=1.0, radius=0.055):
    tube(
        prefix + "_" + name,
        [(sign * unit * 0.62, unit * 0.30, chest.z + unit * 0.42),
         (sign * unit * 0.50, -unit * 0.76, chest.z - unit * 0.02),
         (sign * unit * 0.26, -unit * 0.72, hips.z + unit * 0.24)],
        [unit * radius, unit * radius, unit * radius * 0.9],
        [{"chest": 0.9, "shoulder." + ("L" if sign > 0 else "R"): 0.1},
         {"chest": 0.75, "spine": 0.25}, {"spine": 0.5, "hips": 0.5}],
        armature, materials[key], 8,
    )


def apron(prefix, spec, armature, materials, unit, chest, hips, *, key="accent", width=1.05, drop=0.9):
    weighted_ellipsoid(
        prefix + "_ApronBib",
        (0.0, -unit * 0.82, chest.z - unit * 0.10),
        (unit * width * 0.62, unit * 0.07, unit * 0.46),
        armature, {"chest": 0.7, "spine": 0.3}, materials[key], 22, 14,
    )
    weighted_ellipsoid(
        prefix + "_ApronSkirt",
        (0.0, -unit * 0.80, hips.z - unit * drop * 0.4),
        (unit * width, unit * 0.09, unit * drop),
        armature, {"hips": 0.72, "spine": 0.28}, materials[key], 24, 14,
    )
    for sign in (1.0, -1.0):
        tube(
            prefix + "_ApronTie_" + ("L" if sign > 0 else "R"),
            [(0.0, -unit * 0.78, chest.z + unit * 0.30),
             (sign * unit * 0.42, -unit * 0.40, chest.z + unit * 0.46)],
            [unit * 0.045, unit * 0.038],
            [{"chest": 1.0}, {"chest": 0.85, "neck": 0.15}],
            armature, materials[key], 8,
        )


def pauldron(prefix, spec, armature, materials, unit, *, key="secondary", size=0.30):
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        shoulder = bone(armature, "shoulder." + suffix)
        upper = bone(armature, "upper_arm." + suffix)
        weighted_ellipsoid(
            prefix + "_Pauldron_" + suffix,
            ((shoulder.x + upper.x) * 0.5, upper.y, upper.z + unit * 0.06),
            (unit * size, unit * size * 0.92, unit * size * 0.66),
            armature, {"upper_arm." + suffix: 0.72, "shoulder." + suffix: 0.28},
            materials[key], 22, 14,
        )


def cuffs(prefix, spec, armature, materials, unit, *, key="secondary", size=0.20):
    for suffix in ("L", "R"):
        lower = bone(armature, "lower_arm." + suffix)
        hand = bone(armature, "hand." + suffix)
        p = COMMON.blend(lower, hand, 0.82)
        weighted_ellipsoid(
            prefix + "_Cuff_" + suffix, p,
            (unit * size, unit * size, unit * size * 0.7),
            armature, {"lower_arm." + suffix: 0.7, "hand." + suffix: 0.3},
            materials[key], 18, 12,
        )


def sleeves(prefix, spec, armature, materials, unit, *, key="primary", upper=0.42, lower=0.30):
    """Garment volume over the arms, carried all the way to the wrist. Without
    this the Wave 4 limb tubes read as bare sticks poking out of a coat."""
    for suffix in ("L", "R"):
        up, low, hand = (bone(armature, n + "." + suffix) for n in ("upper_arm", "lower_arm", "hand"))
        tube(
            prefix + "_Sleeve_" + suffix,
            [COMMON.blend(up, low, -0.06), COMMON.blend(up, low, 0.52), COMMON.blend(up, low, 0.99),
             COMMON.blend(low, hand, 0.55), COMMON.blend(low, hand, 0.97)],
            [unit * upper, unit * (upper * 0.90), unit * (upper * 0.78),
             unit * (lower * 1.02), unit * lower],
            [{"upper_arm." + suffix: 1.0}, {"upper_arm." + suffix: 1.0},
             {"upper_arm." + suffix: 0.45, "lower_arm." + suffix: 0.55},
             {"lower_arm." + suffix: 1.0}, {"lower_arm." + suffix: 0.85, "hand." + suffix: 0.15}],
            armature, materials[key], 16,
        )


def trousers(prefix, spec, armature, materials, unit, *, key="secondary",
             thigh=0.42, calf=0.32, stop=0.94):
    """Leg garment volume. ``stop`` is how far down the shin the fabric runs, so
    a skirt style can pass a short value instead of leaving bare legs."""
    for suffix in ("L", "R"):
        up, low, foot = (bone(armature, n + "." + suffix) for n in ("upper_leg", "lower_leg", "foot"))
        tube(
            prefix + "_Trouser_" + suffix,
            [COMMON.blend(up, low, -0.02), COMMON.blend(up, low, 0.55), COMMON.blend(up, low, 1.0),
             COMMON.blend(low, foot, stop)],
            [unit * thigh, unit * (thigh * 0.86), unit * (calf * 1.06), unit * calf],
            [{"upper_leg." + suffix: 0.85, "hips": 0.15}, {"upper_leg." + suffix: 1.0},
             {"upper_leg." + suffix: 0.45, "lower_leg." + suffix: 0.55},
             {"lower_leg." + suffix: 1.0}],
            armature, materials[key], 16,
        )


def visor(prefix, spec, armature, materials, center, unit, *, key="accent", width=0.52, height=0.13):
    ellipsoid(prefix + "_Visor",
              (center.x, center.y - unit * 0.40, center.z + unit * 0.06),
              (unit * width, unit * 0.20, unit * height),
              armature, "head", materials[key], 26, 12)


def glasses(prefix, spec, armature, materials, center, unit, eye_y, eye_z, *, key="secondary", lens=0.17):
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        ring(prefix + "_GlassRim_" + suffix, armature, "head", materials[key],
             (center.x + sign * unit * 0.22, eye_y - unit * 0.06, eye_z), unit * lens, unit * 0.022,
             axis="y", segments=18)
    tube(prefix + "_GlassBridge",
         [(-unit * 0.06, eye_y - unit * 0.06, eye_z + unit * 0.02),
          (unit * 0.06, eye_y - unit * 0.06, eye_z + unit * 0.02)],
         [unit * 0.020, unit * 0.020], [{"head": 1.0}, {"head": 1.0}],
         armature, materials[key], 8)
    for sign in (1.0, -1.0):
        tube(prefix + "_GlassTemple_" + ("L" if sign > 0 else "R"),
             [(sign * unit * 0.38, eye_y - unit * 0.04, eye_z + unit * 0.02),
              (sign * unit * 0.46, eye_y + unit * 0.38, eye_z + unit * 0.06)],
             [unit * 0.018, unit * 0.016], [{"head": 1.0}, {"head": 1.0}],
             armature, materials[key], 6)


def panel_seam(prefix, name, spec, armature, materials, unit, points, weights, *, key="accent", radius=0.022):
    tube(prefix + "_" + name, points, [unit * radius] * len(points),
         weights, armature, materials[key], 8)


# ──────────────────────────── per-style art passes ───────────────────────────


def add_campus(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="short")
    bangs(prefix, spec, armature, materials, center, unit, count=7, spread=0.38)
    side_locks(prefix, spec, armature, materials, center, unit, length=0.72, radius=0.11, chest_z=chest.z)
    # Hoodie: kangaroo pocket, drawstrings and a hood that reads from behind.
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.74, width=1.31, lapel=False)
    trousers(prefix, spec, armature, materials, unit, key="secondary")
    weighted_ellipsoid(prefix + "_Hood", (0.0, unit * 0.52, chest.z + unit * 0.62),
                       (unit * 0.46, unit * 0.34, unit * 0.36), armature,
                       {"chest": 0.4, "neck": 0.6}, materials["primary"], 24, 14)
    weighted_ellipsoid(prefix + "_HoodiePocket", (0.0, -unit * 0.781, hips.z + unit * 0.30),
                       (unit * 0.40, unit * 0.06, unit * 0.22), armature,
                       {"hips": 0.6, "spine": 0.4}, materials["fabric"], 20, 12)
    for sign in (1.0, -1.0):
        tube(prefix + "_HoodieString_" + ("L" if sign > 0 else "R"),
             [(sign * unit * 0.10, -unit * 0.731, chest.z + unit * 0.34),
              (sign * unit * 0.12, -unit * 0.781, chest.z - unit * 0.04)],
             [unit * 0.022, unit * 0.020], [{"chest": 1.0}, {"chest": 1.0}],
             armature, materials["accent"], 6)
    strap(prefix, "BackpackStrap_L", spec, armature, materials, unit, chest, hips, key="secondary", sign=1.0)
    strap(prefix, "BackpackStrap_R", spec, armature, materials, unit, chest, hips, key="secondary", sign=-1.0)
    cuffs(prefix, spec, armature, materials, unit, key="secondary", size=0.17)


def add_barista(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="short")
    bangs(prefix, spec, armature, materials, center, unit, count=6, spread=0.34)
    collar(prefix, spec, armature, materials, unit, key="secondary")
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.75, width=1.34)
    trousers(prefix, spec, armature, materials, unit, key="secondary")
    apron(prefix, spec, armature, materials, unit, chest, hips, key="secondary", width=0.44, drop=0.52)
    belt(prefix, spec, armature, materials, unit, hips.z + unit * 0.18, key="accent", radius=0.44)
    # Rolled sleeves: a thicker band where the fabric stops on the forearm.
    for suffix in ("L", "R"):
        lower = bone(armature, "lower_arm." + suffix)
        weighted_ellipsoid(prefix + "_SleeveRoll_" + suffix,
                           (lower.x, lower.y, lower.z),
                           (unit * 0.21, unit * 0.21, unit * 0.13), armature,
                           {"lower_arm." + suffix: 0.6, "upper_arm." + suffix: 0.4},
                           materials["primary"], 18, 12)
    weighted_ellipsoid(prefix + "_ApronTowel", (unit * 0.34, -unit * 0.731, hips.z + unit * 0.06),
                       (unit * 0.12, unit * 0.05, unit * 0.26), armature,
                       {"hips": 0.8, "spine": 0.2}, materials["accent"], 16, 12)


def add_gardener(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="short")
    hair_bun(prefix, spec, armature, materials, center, unit, back=0.42, lift=0.18, size=0.22)
    # Wide straw sun hat, the strongest read in her silhouette.
    brim(prefix, "SunHat", armature, materials, (center.x, center.y + unit * 0.06, center.z + unit * 0.40),
         unit, radius=0.86, thickness=0.05, material_key="accent")
    ellipsoid(prefix + "_SunHatCrown", (center.x, center.y + unit * 0.06, center.z + unit * 0.52),
              (unit * 0.44, unit * 0.44, unit * 0.24), armature, "head", materials["accent"], 24, 14)
    ring(prefix + "_SunHatBand", armature, "head", materials["primary"],
         (center.x, center.y + unit * 0.06, center.z + unit * 0.44), unit * 0.45, unit * 0.035, axis="z")
    collar(prefix, spec, armature, materials, unit, key="secondary")
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.74, width=1.31, lapel=False)
    trousers(prefix, spec, armature, materials, unit, key="secondary")
    apron(prefix, spec, armature, materials, unit, chest, hips, key="fabric", width=0.42, drop=0.56)
    # Gardening gloves reach past the wrist.
    for suffix in ("L", "R"):
        hand = bone(armature, "hand." + suffix)
        weighted_ellipsoid(prefix + "_GloveCuff_" + suffix,
                           (hand.x, hand.y, hand.z + unit * 0.10),
                           (unit * 0.20, unit * 0.20, unit * 0.16), armature,
                           {"hand." + suffix: 0.45, "lower_arm." + suffix: 0.55},
                           materials["secondary"], 18, 12)


def add_explorer(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="short")
    # Deliberately uneven locks: a child's hair under a cap.
    for index, (x, z, r) in enumerate(((-0.30, 0.40, 0.15), (-0.06, 0.48, 0.17),
                                       (0.20, 0.44, 0.16), (0.38, 0.34, 0.13))):
        ellipsoid(prefix + f"_HairTuft_{index}",
                  (center.x + unit * x, center.y - unit * 0.18, center.z + unit * z),
                  (unit * r, unit * r * 0.9, unit * r * 1.2), armature, "head", materials["hair"], 16, 12)
    ellipsoid(prefix + "_CapCrown", (center.x, center.y + unit * 0.04, center.z + unit * 0.40),
              (unit * 0.46, unit * 0.48, unit * 0.28), armature, "head", materials["primary"], 24, 14)
    weighted_ellipsoid(prefix + "_CapPeak", (center.x, center.y - unit * 0.52, center.z + unit * 0.30),
                       (unit * 0.36, unit * 0.26, unit * 0.045), armature, {"head": 1.0},
                       materials["secondary"], 22, 12)
    collar(prefix, spec, armature, materials, unit, key="secondary", scale=0.9)
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.72, width=1.30, lapel=False)
    trousers(prefix, spec, armature, materials, unit, key="secondary", stop=0.55)
    # Utility vest pockets read as an explorer at panel scale.
    for sign in (1.0, -1.0):
        for index, z_off in enumerate((0.06, -0.28)):
            weighted_ellipsoid(prefix + f"_VestPocket_{'L' if sign > 0 else 'R'}_{index}",
                               (sign * unit * 0.24, -unit * 0.756, chest.z + unit * z_off),
                               (unit * 0.15, unit * 0.05, unit * 0.13), armature,
                               {"chest": 0.7, "spine": 0.3}, materials["secondary"], 16, 10)
    strap(prefix, "SatchelStrap", spec, armature, materials, unit, chest, hips, key="accent", sign=1.0)
    weighted_ellipsoid(prefix + "_Satchel", (-unit * 0.42, unit * 0.10, hips.z + unit * 0.16),
                       (unit * 0.24, unit * 0.14, unit * 0.22), armature,
                       {"hips": 0.75, "spine": 0.25}, materials["accent"], 20, 12)


def add_rune_guard(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="long")
    bangs(prefix, spec, armature, materials, center, unit, count=7, spread=0.40)
    ponytail(prefix, spec, armature, materials, center, unit, drop=1.9, radius=0.17)
    pauldron(prefix, spec, armature, materials, unit, key="secondary", size=0.32)
    collar(prefix, spec, armature, materials, unit, key="secondary", scale=1.15)
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.76, width=1.34)
    trousers(prefix, spec, armature, materials, unit, key="secondary")
    belt(prefix, spec, armature, materials, unit, hips.z + unit * 0.24, key="secondary", radius=0.48, thickness=0.07)
    # Glowing rune plates: the accent material already carries emission.
    for index in range(5):
        a = (index / 5.0) * pi - pi / 2
        weighted_ellipsoid(prefix + f"_RunePlate_{index}",
                           (sin(a) * unit * 0.34, -unit * 0.832, chest.z + unit * (0.18 - index * 0.13)),
                           (unit * 0.09, unit * 0.030, unit * 0.09), armature,
                           {"chest": 0.65, "spine": 0.35}, materials["accent"], 14, 10)
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        tube(prefix + "_Cloak_" + suffix,
             [(sign * unit * 0.44, unit * 0.30, chest.z + unit * 0.44),
              (sign * unit * 0.52, unit * 0.42, hips.z + unit * 0.10),
              (sign * unit * 0.44, unit * 0.36, hips.z - unit * 0.85)],
             [unit * 0.16, unit * 0.22, unit * 0.20],
             [{"chest": 0.9, "shoulder." + suffix: 0.1}, {"spine": 0.6, "hips": 0.4}, {"hips": 1.0}],
             armature, materials["primary"], 12)
    cuffs(prefix, spec, armature, materials, unit, key="secondary", size=0.22)


def add_android(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    # A moulded shell instead of hair, with a lit sensor band.
    ellipsoid(prefix + "_HeadShell", (center.x, center.y + unit * 0.10, center.z + unit * 0.20),
              (unit * 0.50, unit * 0.52, unit * 0.44), armature, "head", materials["primary"], 28, 18)
    ring(prefix + "_SensorBand", armature, "head", materials["accent"],
         (center.x, center.y + unit * 0.06, center.z + unit * 0.34), unit * 0.44, unit * 0.030, axis="z")
    for sign in (1.0, -1.0):
        ellipsoid(prefix + "_AudioPort_" + ("L" if sign > 0 else "R"),
                  (center.x + sign * unit * 0.48, center.y + unit * 0.06, center.z - unit * 0.02),
                  (unit * 0.09, unit * 0.13, unit * 0.13), armature, "head", materials["accent"], 16, 12)
    collar(prefix, spec, armature, materials, unit, key="secondary", scale=1.05)
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.75, width=1.33, lapel=False)
    trousers(prefix, spec, armature, materials, unit, key="primary", thigh=0.38, calf=0.30)
    # Chassis seams and a core light give the torso a manufactured read.
    panel_seam(prefix, "ChassisSeamCenter", spec, armature, materials, unit,
               [(0.0, -unit * 0.832, chest.z + unit * 0.40), (0.0, -unit * 0.857, hips.z + unit * 0.10)],
               [{"chest": 1.0}, {"spine": 0.5, "hips": 0.5}], key="secondary")
    for sign in (1.0, -1.0):
        panel_seam(prefix, "ChassisSeam_" + ("L" if sign > 0 else "R"), spec, armature, materials, unit,
                   [(sign * unit * 0.34, -unit * 0.781, chest.z + unit * 0.36),
                    (sign * unit * 0.30, -unit * 0.806, hips.z + unit * 0.16)],
                   [{"chest": 1.0}, {"spine": 0.6, "hips": 0.4}], key="secondary")
    ellipsoid(prefix + "_CoreLight", (0.0, -unit * 0.832, chest.z + unit * 0.02),
              (unit * 0.15, unit * 0.05, unit * 0.15), armature, "chest", materials["accent"], 20, 12)
    pauldron(prefix, spec, armature, materials, unit, key="secondary", size=0.28)
    cuffs(prefix, spec, armature, materials, unit, key="accent", size=0.18)
    # Joint rings expose the actuator at knee and elbow.
    for suffix in ("L", "R"):
        for bone_name, radius in (("lower_arm." + suffix, 0.20), ("lower_leg." + suffix, 0.26)):
            p = bone(armature, bone_name)
            ring(prefix + "_JointRing_" + bone_name.replace(".", "_"), armature, bone_name,
                 materials["accent"], (p.x, p.y, p.z), unit * radius, unit * 0.022, axis="z")


def add_cyber_agent(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    # Undercut: full volume on top, cropped at the temples.
    hair_shell(prefix, spec, armature, materials, center, unit, cut="short")
    bangs(prefix, spec, armature, materials, center, unit, count=5, spread=0.30)
    for sign in (1.0, -1.0):
        ellipsoid(prefix + "_Undercut_" + ("L" if sign > 0 else "R"),
                  (center.x + sign * unit * 0.42, center.y + unit * 0.06, center.z - unit * 0.10),
                  (unit * 0.13, unit * 0.42, unit * 0.24), armature, "head", materials["secondary"], 18, 12)
    visor(prefix, spec, armature, materials, center, unit, key="accent", width=0.50, height=0.12)
    collar(prefix, spec, armature, materials, unit, key="secondary", scale=1.2)
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.77, width=1.36)
    trousers(prefix, spec, armature, materials, unit, key="secondary")
    # Long coat tails.
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        tube(prefix + "_CoatTail_" + suffix,
             [(sign * unit * 0.34, unit * 0.20, hips.z + unit * 0.24),
              (sign * unit * 0.38, unit * 0.26, hips.z - unit * 0.60),
              (sign * unit * 0.32, unit * 0.18, hips.z - unit * 1.30)],
             [unit * 0.26, unit * 0.24, unit * 0.20],
             [{"spine": 0.5, "hips": 0.5}, {"hips": 1.0}, {"hips": 1.0}],
             armature, materials["primary"], 12)
    strap(prefix, "TacticalRig", spec, armature, materials, unit, chest, hips, key="secondary", sign=1.0, radius=0.06)
    belt(prefix, spec, armature, materials, unit, hips.z + unit * 0.22, key="secondary", radius=0.48, thickness=0.065)
    for sign in (1.0, -1.0):
        weighted_ellipsoid(prefix + "_Holster_" + ("L" if sign > 0 else "R"),
                           (sign * unit * 0.46, unit * 0.04, hips.z - unit * 0.10),
                           (unit * 0.10, unit * 0.16, unit * 0.24), armature,
                           {"hips": 0.8, "upper_leg." + ("L" if sign > 0 else "R"): 0.2},
                           materials["secondary"], 18, 12)
    cuffs(prefix, spec, armature, materials, unit, key="accent", size=0.19)


def add_architect(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="short")
    bangs(prefix, spec, armature, materials, center, unit, count=6, spread=0.34)
    glasses(prefix, spec, armature, materials, center, unit, eye_y, eye_z, key="secondary", lens=0.16)
    collar(prefix, spec, armature, materials, unit, key="secondary")
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.75, width=1.34)
    trousers(prefix, spec, armature, materials, unit, key="fabric")
    # Shirt placket and a lanyard: office-legible, not armour.
    panel_seam(prefix, "ShirtPlacket", spec, armature, materials, unit,
               [(0.0, -unit * 0.832, chest.z + unit * 0.34), (0.0, -unit * 0.857, hips.z + unit * 0.16)],
               [{"chest": 1.0}, {"spine": 0.6, "hips": 0.4}], key="secondary", radius=0.020)
    for sign in (1.0, -1.0):
        tube(prefix + "_Lanyard_" + ("L" if sign > 0 else "R"),
             [(sign * unit * 0.22, -unit * 0.30, chest.z + unit * 0.48),
              (sign * unit * 0.14, -unit * 0.806, chest.z - unit * 0.10)],
             [unit * 0.024, unit * 0.022], [{"neck": 0.5, "chest": 0.5}, {"chest": 1.0}],
             armature, materials["accent"], 6)
    weighted_ellipsoid(prefix + "_IdBadge", (0.0, -unit * 0.857, chest.z - unit * 0.22),
                       (unit * 0.10, unit * 0.012, unit * 0.14), armature,
                       {"chest": 0.8, "spine": 0.2}, materials["accent"], 14, 10)
    cuffs(prefix, spec, armature, materials, unit, key="secondary", size=0.18)


def add_detective(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="medium")
    bangs(prefix, spec, armature, materials, center, unit, count=7, spread=0.42)
    side_locks(prefix, spec, armature, materials, center, unit, length=1.15, radius=0.16, out=0.46,
               chest_z=chest.z)
    # Fedora: the noir read.
    brim(prefix, "Fedora", armature, materials, (center.x, center.y + unit * 0.04, center.z + unit * 0.42),
         unit, radius=0.72, thickness=0.045, material_key="primary")
    ellipsoid(prefix + "_FedoraCrown", (center.x, center.y + unit * 0.04, center.z + unit * 0.56),
              (unit * 0.42, unit * 0.44, unit * 0.28), armature, "head", materials["primary"], 24, 14)
    ring(prefix + "_FedoraBand", armature, "head", materials["accent"],
         (center.x, center.y + unit * 0.04, center.z + unit * 0.46), unit * 0.43, unit * 0.035, axis="z")
    collar(prefix, spec, armature, materials, unit, key="secondary", scale=1.25)
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.77, width=1.36)
    trousers(prefix, spec, armature, materials, unit, key="secondary")
    # Trench skirt, storm flap and a tied belt.
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        tube(prefix + "_TrenchSkirt_" + suffix,
             [(sign * unit * 0.30, 0.0, hips.z + unit * 0.30),
              (sign * unit * 0.40, unit * 0.02, hips.z - unit * 0.80),
              (sign * unit * 0.50, 0.0, hips.z - unit * 1.95)],
             [unit * 0.34, unit * 0.38, unit * 0.40],
             [{"spine": 0.4, "hips": 0.6}, {"hips": 1.0}, {"hips": 1.0}],
             armature, materials["primary"], 16)
    belt(prefix, spec, armature, materials, unit, hips.z + unit * 0.30, key="secondary", radius=0.66, thickness=0.075)
    weighted_ellipsoid(prefix + "_BeltBuckle", (0.0, -unit * 0.882, hips.z + unit * 0.30),
                       (unit * 0.12, unit * 0.05, unit * 0.10), armature,
                       {"hips": 0.8, "spine": 0.2}, materials["accent"], 14, 10)
    cuffs(prefix, spec, armature, materials, unit, key="secondary", size=0.21)


def add_hanji_archivist(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="short")
    hair_bun(prefix, spec, armature, materials, center, unit, back=0.44, lift=0.10, size=0.24)
    glasses(prefix, spec, armature, materials, center, unit, eye_y, eye_z, key="secondary", lens=0.17)
    # Jeogori: crossed front panels with a contrasting goreum tie.
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        weighted_ellipsoid(prefix + "_JeogoriPanel_" + suffix,
                           (sign * unit * 0.20, -unit * 0.756, chest.z - unit * 0.04),
                           (unit * 0.40, unit * 0.05, unit * 0.46), armature,
                           {"chest": 0.66, "spine": 0.34},
                           materials["primary"] if sign > 0 else materials["secondary"], 22, 14)
    weighted_ellipsoid(prefix + "_JeogoriBack", (0.0, unit * 0.46, chest.z - unit * 0.04),
                       (unit * 0.46, unit * 0.06, unit * 0.46), armature,
                       {"chest": 0.6, "spine": 0.4}, materials["primary"], 24, 14)
    ring(prefix + "_Git", armature, "neck", materials["fabric"],
         (0.0, bone(armature, "neck").y, bone(armature, "neck").z + unit * 0.02),
         unit * 0.32, unit * 0.055, axis="z", weights={"neck": 0.5, "chest": 0.5})
    tube(prefix + "_Goreum",
         [(unit * 0.10, -unit * 0.832, chest.z - unit * 0.10),
          (unit * 0.06, -unit * 0.882, chest.z - unit * 0.52),
          (unit * 0.10, -unit * 0.857, chest.z - unit * 0.95)],
         [unit * 0.075, unit * 0.070, unit * 0.055],
         [{"chest": 1.0}, {"chest": 0.5, "spine": 0.5}, {"spine": 0.5, "hips": 0.5}],
         armature, materials["accent"], 10)
    # Chima: a full skirt from the high waist.
    weighted_ellipsoid(prefix + "_Chima", (0.0, 0.0, hips.z - unit * 0.60),
                       (unit * 0.62, unit * 0.56, unit * 1.05), armature,
                       {"hips": 0.75, "spine": 0.25}, materials["fabric"], 28, 16)
    weighted_ellipsoid(prefix + "_HanjiScroll", (unit * 0.44, -unit * 0.30, hips.z + unit * 0.34),
                       (unit * 0.07, unit * 0.07, unit * 0.30), armature,
                       {"hand.L": 0.35, "lower_arm.L": 0.65}, materials["accent"], 16, 10)


def add_robot_club(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="medium")
    bangs(prefix, spec, armature, materials, center, unit, count=7, spread=0.38)
    twin_tails(prefix, spec, armature, materials, center, unit, out=0.48, drop=1.15)
    # Goggles pushed up onto the forehead: the club's signature.
    for sign in (1.0, -1.0):
        ring(prefix + "_GoggleRim_" + ("L" if sign > 0 else "R"), armature, "head", materials["accent"],
             (center.x + sign * unit * 0.22, center.y - unit * 0.34, center.z + unit * 0.40),
             unit * 0.17, unit * 0.035, axis="y", segments=18)
        ellipsoid(prefix + "_GoggleLens_" + ("L" if sign > 0 else "R"),
                  (center.x + sign * unit * 0.22, center.y - unit * 0.34, center.z + unit * 0.40),
                  (unit * 0.15, unit * 0.05, unit * 0.15), armature, "head", materials["secondary"], 18, 12)
    ring(prefix + "_GoggleBand", armature, "head", materials["secondary"],
         (center.x, center.y + unit * 0.02, center.z + unit * 0.38), unit * 0.47, unit * 0.035, axis="z")
    collar(prefix, spec, armature, materials, unit, key="secondary", scale=0.95)
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.73, width=1.31)
    weighted_ellipsoid(prefix + "_ClubPatch", (unit * 0.24, -unit * 0.806, chest.z + unit * 0.12),
                       (unit * 0.12, unit * 0.02, unit * 0.12), armature,
                       {"chest": 0.85, "spine": 0.15}, materials["accent"], 16, 10)
    # Pleated school skirt.
    for index in range(10):
        a = index / 10.0 * 2 * pi
        tube(prefix + f"_SkirtPleat_{index}",
             [(cos(a) * unit * 0.40, sin(a) * unit * 0.36, hips.z + unit * 0.10),
              (cos(a) * unit * 0.52, sin(a) * unit * 0.48, hips.z - unit * 0.52)],
             [unit * 0.07, unit * 0.09], [{"hips": 1.0}, {"hips": 1.0}],
             armature, materials["fabric"], 6)
    cuffs(prefix, spec, armature, materials, unit, key="secondary", size=0.16)


def add_rescue_captain(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    hair_shell(prefix, spec, armature, materials, center, unit, cut="short")
    ponytail(prefix, spec, armature, materials, center, unit, drop=0.85, radius=0.13)
    # Rescue helmet with brim and chin strap.
    ellipsoid(prefix + "_HelmetShell", (center.x, center.y + unit * 0.04, center.z + unit * 0.34),
              (unit * 0.54, unit * 0.56, unit * 0.44), armature, "head", materials["accent"], 28, 16)
    weighted_ellipsoid(prefix + "_HelmetBrim", (center.x, center.y - unit * 0.46, center.z + unit * 0.24),
                       (unit * 0.42, unit * 0.24, unit * 0.05), armature, {"head": 1.0},
                       materials["accent"], 24, 12)
    ring(prefix + "_HelmetBand", armature, "head", materials["secondary"],
         (center.x, center.y + unit * 0.04, center.z + unit * 0.26), unit * 0.55, unit * 0.045, axis="z")
    for sign in (1.0, -1.0):
        tube(prefix + "_ChinStrap_" + ("L" if sign > 0 else "R"),
             [(center.x + sign * unit * 0.48, center.y, center.z + unit * 0.16),
              (center.x + sign * unit * 0.20, center.y - unit * 0.26, center.z - unit * 0.46)],
             [unit * 0.030, unit * 0.028], [{"head": 1.0}, {"head": 0.7, "neck": 0.3}],
             armature, materials["secondary"], 6)
    collar(prefix, spec, armature, materials, unit, key="secondary", scale=1.2)
    jacket(prefix, spec, armature, materials, unit, chest, hips, key="primary", front=0.79, width=1.39, lapel=False)
    trousers(prefix, spec, armature, materials, unit, key="primary", thigh=0.46, calf=0.36)
    # Reflective bands are the turnout-coat read.
    for z_off in (0.24, -0.18):
        ring(prefix + f"_ReflectiveBand_{z_off:.2f}", armature, "chest", materials["accent"],
             (0.0, chest.y, chest.z + unit * z_off), unit * 0.56, unit * 0.045, axis="z",
             weights={"chest": 0.7, "spine": 0.3})
    for suffix in ("L", "R"):
        p = bone(armature, "lower_arm." + suffix)
        ring(prefix + "_SleeveBand_" + suffix, armature, "lower_arm." + suffix, materials["accent"],
             (p.x, p.y, p.z), unit * 0.23, unit * 0.035, axis="z")
    strap(prefix, "AirTankStrap_L", spec, armature, materials, unit, chest, hips, key="secondary", sign=1.0, radius=0.065)
    strap(prefix, "AirTankStrap_R", spec, armature, materials, unit, chest, hips, key="secondary", sign=-1.0, radius=0.065)
    weighted_ellipsoid(prefix + "_AirTank", (0.0, unit * 0.62, chest.z - unit * 0.06),
                       (unit * 0.24, unit * 0.20, unit * 0.52), armature,
                       {"chest": 0.65, "spine": 0.35}, materials["secondary"], 22, 14)
    belt(prefix, spec, armature, materials, unit, hips.z + unit * 0.22, key="secondary", radius=0.52, thickness=0.07)


def add_moss_golem(prefix, spec, armature, materials, face_context):
    center, eye_y, eye_z, _ = face_context
    unit = spec["height"] / spec["heads"]
    chest, hips = bone(armature, "chest"), bone(armature, "hips")
    # Moss canopy instead of hair, clumped so the silhouette stays irregular.
    for index in range(11):
        a = index / 11.0 * 2 * pi
        radius = 0.30 + 0.14 * cos(a * 3.0)
        ellipsoid(prefix + f"_MossClump_{index}",
                  (center.x + cos(a) * unit * radius,
                   center.y + unit * 0.08 + sin(a) * unit * radius,
                   center.z + unit * (0.34 + 0.10 * sin(a * 2.0))),
                  (unit * 0.21, unit * 0.21, unit * 0.17),
                  armature, "head", materials["hair"], 18, 12)
    # Stone plating across the chest, shoulders and back.
    for sign in (1.0, -1.0):
        weighted_ellipsoid(prefix + "_StonePlate_" + ("L" if sign > 0 else "R"),
                           (sign * unit * 0.30, -unit * 0.731, chest.z + unit * 0.10),
                           (unit * 0.30, unit * 0.10, unit * 0.44), armature,
                           {"chest": 0.68, "spine": 0.32}, materials["primary"], 20, 14)
    weighted_ellipsoid(prefix + "_StonePlateBack", (0.0, unit * 0.52, chest.z),
                       (unit * 0.52, unit * 0.12, unit * 0.52), armature,
                       {"chest": 0.6, "spine": 0.4}, materials["secondary"], 24, 14)
    pauldron(prefix, spec, armature, materials, unit, key="primary", size=0.38)
    # Glowing seams between the plates.
    for sign in (1.0, -1.0):
        panel_seam(prefix, "GlowSeam_" + ("L" if sign > 0 else "R"), spec, armature, materials, unit,
                   [(sign * unit * 0.12, -unit * 0.806, chest.z + unit * 0.42),
                    (sign * unit * 0.20, -unit * 0.832, chest.z - unit * 0.30),
                    (sign * unit * 0.14, -unit * 0.781, hips.z + unit * 0.10)],
                   [{"chest": 1.0}, {"chest": 0.5, "spine": 0.5}, {"spine": 0.5, "hips": 0.5}],
                   key="accent", radius=0.028)
    ellipsoid(prefix + "_HeartCore", (0.0, -unit * 0.756, chest.z + unit * 0.04),
              (unit * 0.16, unit * 0.08, unit * 0.16), armature, "chest", materials["accent"], 20, 12)
    # Moss growth on the forearms and shins.
    for suffix in ("L", "R"):
        for bone_name, size in (("lower_arm." + suffix, 0.26), ("lower_leg." + suffix, 0.32)):
            p = bone(armature, bone_name)
            for index in range(3):
                a = index / 3.0 * 2 * pi
                ellipsoid(prefix + "_MossPatch_" + bone_name.replace(".", "_") + f"_{index}",
                          (p.x + cos(a) * unit * size * 0.5, p.y + sin(a) * unit * size * 0.5, p.z),
                          (unit * size * 0.42, unit * size * 0.42, unit * size * 0.5),
                          armature, bone_name, materials["hair"], 14, 10)


# Wave 6 builds every facial feature as its own mesh and gives each one an MToon
# outline. Close up that reads as a face assembled from outlined parts: ringed
# cheeks, a protruding nose with visible nostrils and a stacked lip stack. The
# VRoid-class look wants those cues flat or painted, so this pass keeps the
# meshes (expression targets bind to them) and instead shrinks the offenders and
# removes their outlines.
# Only the parts that survive rebuild_painted_face need tuning here; everything
# else in the Wave 6 face is deleted and repainted.
FACE_REFINEMENTS = (
    # (name fragment, uniform scale, keep outline)
    ("_CheekVolume_", 0.34, False),
    ("_InnerEar_", 1.0, False),
    ("_JawVolume", 1.0, False),
)


# Wave 6 eye geometry, read from its own face builder so this stays in step:
#   sclera  (0.129, 0.037, 0.084)u at  eye_x = 0.185u,  eye_z = center.z + 0.075u
#   iris    (0.066, 0.014, 0.066)u    — a perfect circle, which is the tell
#   pupil   (0.030, 0.010, 0.036)u
EYE_X = 0.185
EYE_Z = 0.075
EYE_Y = -0.405


def add_eye_definition(prefix, spec, armature, materials, face_context):
    """A VRoid-class eye needs a heavy upper lash line and an iris taller than it
    is wide. Wave 6 draws neither, which is why its eyes read as startled discs."""
    unit = spec["height"] / spec["heads"]
    center, eye_y, eye_z, _ = face_context
    head_scale = spec.get("head_scale", (1.0, 1.0, 1.0))
    lash_rgba = tuple(min(1.0, channel * 0.42) for channel in spec["hair"][:3]) + (1.0,)
    lash = COMMON.make_material(prefix + "_Lash", lash_rgba, roughness=0.42)
    lash.vrm_addon_extension.mtoon1.extensions.vrmc_materials_mtoon.outline_width_factor = 0.0

    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        eye_x = unit * EYE_X * sign * head_scale[0]
        eye_bone = "eye." + suffix
        # Lash band across the top of the sclera, thickest at the outer corner.
        ellipsoid(
            prefix + "_UpperLash_" + suffix,
            (eye_x + sign * unit * 0.008, eye_y - unit * 0.055, eye_z + unit * 0.072),
            (unit * 0.140, unit * 0.030, unit * 0.024),
            armature, eye_bone, lash, 26, 10,
        )
        ellipsoid(
            prefix + "_LashOuter_" + suffix,
            (eye_x + sign * unit * 0.114, eye_y - unit * 0.048, eye_z + unit * 0.062),
            (unit * 0.042, unit * 0.026, unit * 0.022),
            armature, eye_bone, lash, 16, 10,
        )
        ellipsoid(
            prefix + "_LashInner_" + suffix,
            (eye_x - sign * unit * 0.104, eye_y - unit * 0.046, eye_z + unit * 0.030),
            (unit * 0.032, unit * 0.022, unit * 0.020),
            armature, eye_bone, lash, 14, 8,
        )
        # Lower rim: a thin line, not a lid volume.
        ellipsoid(
            prefix + "_LowerLash_" + suffix,
            (eye_x, eye_y - unit * 0.050, eye_z - unit * 0.062),
            (unit * 0.112, unit * 0.022, unit * 0.012),
            armature, eye_bone, lash, 20, 8,
        )


def reshape_eyes(prefix):
    """Anime irises are taller than wide; Wave 6 authors them perfectly round."""
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.name.startswith(prefix):
            continue
        if "_BrowExpression_" in obj.name:
            # Wave 6 brows are heavy slabs that merge into the fringe.
            obj.scale = (0.94, 1.0, 0.55)
        elif "_Iris_" in obj.name:
            obj.scale = (0.92, 1.0, 1.16)
        elif "_Pupil_" in obj.name:
            obj.scale = (0.80, 1.0, 1.10)
        elif "_EyeHighlight_" in obj.name:
            obj.scale = (1.45, 1.0, 1.45)


def refine_face(prefix):
    """Flatten Wave 6's assembled-parts face read for the Wave 7 roster."""
    touched = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.name.startswith(prefix):
            continue
        for fragment, scale, keep_outline in FACE_REFINEMENTS:
            if fragment not in obj.name:
                continue
            if scale != 1.0:
                obj.scale = (scale, scale, scale)
            if not keep_outline:
                for slot in obj.material_slots:
                    material = slot.material
                    if material is None:
                        continue
                    mtoon = getattr(material.vrm_addon_extension, "mtoon1", None)
                    if mtoon is None:
                        continue
                    mtoon.extensions.vrmc_materials_mtoon.outline_width_factor = 0.0
            touched += 1
            break
    return touched



# ─────────────────────── VRoid-style painted face ────────────────────────
#
# Wave 6 builds every facial feature as its own protruding solid: an iris ball,
# a pupil ball, two lid shells, a nose tip with nostrils, a stack of lip
# volumes. Close up that reads as a face assembled from parts, which is the
# single largest gap to a VRoid-class avatar. VRoid draws the same features as
# flat, alpha-cut, *painted* surfaces sitting on the skull.
#
# The expression contract forces the shape of this rewrite: vrm-original-bundle
# .test.ts pins blink.morphTargetBinds to exactly 2 and aa.morphTargetBinds to
# exactly 1, so expressions must stay morph-target driven. The painted eye,
# brow and mouth planes therefore carry the same shape keys the solids did, and
# ``targets`` is repointed at them before configure_expressions runs.

FACE_TEX = 256


def _pack_image(name, pixels, size=FACE_TEX):
    image = bpy.data.images.new(name, size, size, alpha=True)
    image.pixels.foreach_set(pixels)
    image.update()
    image.pack()
    return image


def _blend_px(dst, offset, rgb, alpha):
    """Source-over compositing in the flat RGBA buffer."""
    inv = 1.0 - alpha
    dst[offset] = dst[offset] * inv + rgb[0] * alpha
    dst[offset + 1] = dst[offset + 1] * inv + rgb[1] * alpha
    dst[offset + 2] = dst[offset + 2] * inv + rgb[2] * alpha
    dst[offset + 3] = min(1.0, dst[offset + 3] + alpha)


def _smoothstep(edge0, edge1, x):
    if edge1 == edge0:
        return 0.0 if x < edge0 else 1.0
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def paint_eye_texture(name, spec, sign):
    """One full anime eye: sclera, graded iris, pupil, two highlights, a heavy
    upper lash that tapers past the outer corner, and a thin lower rim.

    ``sign`` is +1 for the left eye, so the outer corner is at large u; the
    right eye is painted mirrored rather than flipping the plane, which would
    invert its normals.
    """
    n = FACE_TEX
    px = [0.0] * (n * n * 4)
    iris = spec.get("iris", spec.get("accent", (0.24, 0.48, 0.64, 1.0)))
    iris_deep = tuple(c * 0.42 for c in iris[:3])
    iris_lit = tuple(min(1.0, c * 1.35 + 0.12) for c in iris[:3])
    pupil = spec.get("pupil", (0.03, 0.03, 0.05, 1.0))[:3]
    lash = tuple(min(1.0, c * 0.36) for c in spec["hair"][:3])
    sclera = (0.985, 0.975, 0.975)
    sclera_shade = (0.86, 0.85, 0.88)

    half_w, up, low = 0.455, 0.300, 0.235
    iris_cx, iris_cy, iris_rx, iris_ry = 0.5, 0.548, 0.212, 0.252

    for y in range(n):
        v = (y + 0.5) / n
        for x in range(n):
            u = (x + 0.5) / n
            uu = u if sign > 0 else 1.0 - u          # outer corner always at uu>0.5
            dx = (uu - 0.5) / half_w
            offset = (y * n + x) * 4
            if abs(dx) > 1.14:
                continue
            k = max(0.0, 1.0 - dx * dx)
            v_top = 0.5 + up * (k ** 0.58)
            v_bot = 0.5 - low * (k ** 0.80)
            inside = abs(dx) <= 1.0 and v_bot <= v <= v_top

            if inside:
                shade = _smoothstep(v_top - 0.16, v_top, v) * 0.55
                col = tuple(sclera[i] * (1 - shade) + sclera_shade[i] * shade for i in range(3))
                _blend_px(px, offset, col, 1.0)
                # Iris: darker rim, lit lower edge, so it is not a flat disc.
                ix, iy = (uu - iris_cx) / iris_rx, (v - iris_cy) / iris_ry
                r = (ix * ix + iy * iy) ** 0.5
                if r <= 1.0:
                    rim = _smoothstep(0.62, 1.0, r)
                    lit = _smoothstep(0.35, -0.55, iy) * 0.55
                    base = tuple(
                        iris[i] * (1 - rim) + iris_deep[i] * rim for i in range(3)
                    )
                    base = tuple(base[i] * (1 - lit) + iris_lit[i] * lit for i in range(3))
                    _blend_px(px, offset, base, 1.0 - _smoothstep(0.94, 1.0, r) * 0.15)
                    pr = ((uu - iris_cx) / 0.086) ** 2 + ((v - iris_cy) / 0.104) ** 2
                    if pr <= 1.0:
                        _blend_px(px, offset, pupil, 1.0 - _smoothstep(0.80, 1.0, pr))

            # Highlights sit above the lash in draw order so they always read.
            for hx, hy, hr, ha in ((0.418, 0.640, 0.072, 0.96), (0.602, 0.452, 0.034, 0.68)):
                hd = (((uu - hx) / hr) ** 2 + ((v - hy) / (hr * 1.05)) ** 2) ** 0.5
                if hd <= 1.0 and inside:
                    _blend_px(px, offset, (1.0, 1.0, 1.0), ha * (1.0 - _smoothstep(0.55, 1.0, hd)))

            # Upper lash: thickens and lifts toward the outer corner.
            outer = _smoothstep(0.30, 1.02, dx)
            thick = 0.052 + 0.088 * outer
            lash_lo = v_top - 0.055 - 0.030 * outer
            lash_hi = v_top + thick
            if abs(dx) <= 1.10 and lash_lo <= v <= lash_hi:
                edge = min(_smoothstep(lash_lo, lash_lo + 0.030, v),
                           1.0 - _smoothstep(lash_hi - 0.022, lash_hi, v))
                _blend_px(px, offset, lash, min(1.0, edge * 1.6))
            # Lower rim: a thin line on the outer half only.
            if abs(dx) <= 0.96 and v_bot - 0.020 <= v <= v_bot + 0.026:
                _blend_px(px, offset, lash, 0.55 * _smoothstep(-0.40, 0.70, dx))
    return _pack_image(name, px)


def paint_brow_texture(name, spec, sign):
    """A tapered brow stroke — soft at the inner end, pointed at the outer."""
    n = FACE_TEX
    px = [0.0] * (n * n * 4)
    brow = tuple(min(1.0, c * 0.62) for c in spec["hair"][:3])
    for y in range(n):
        v = (y + 0.5) / n
        for x in range(n):
            u = (x + 0.5) / n
            uu = u if sign > 0 else 1.0 - u
            t = (uu - 0.10) / 0.80
            if t < 0.0 or t > 1.0:
                continue
            arc = 0.50 + 0.13 * (t ** 0.75) - 0.10 * t * t
            thick = 0.085 * (1.0 - 0.72 * _smoothstep(0.45, 1.0, t)) * (0.55 + 0.45 * _smoothstep(0.0, 0.28, t))
            d = abs(v - arc)
            if d <= thick:
                a = 1.0 - _smoothstep(thick * 0.55, thick, d)
                _blend_px(px, (y * n + x) * 4, brow, a)
    return _pack_image(name, px)


def paint_mouth_texture(name, spec, key):
    """Lips as a painted shape. ``key`` selects the viseme silhouette."""
    n = FACE_TEX
    px = [0.0] * (n * n * 4)
    lip = (0.72, 0.30, 0.31)
    lip_deep = (0.52, 0.17, 0.20)
    for y in range(n):
        v = (y + 0.5) / n
        for x in range(n):
            u = (x + 0.5) / n
            dx = (u - 0.5) / 0.30
            if abs(dx) > 1.0:
                continue
            k = max(0.0, 1.0 - dx * dx)
            upper = 0.50 + 0.085 * (k ** 0.55) - 0.020 * _smoothstep(0.0, 0.25, abs(dx))
            lower = 0.50 - 0.115 * (k ** 0.70)
            if lower <= v <= upper:
                depth = _smoothstep(upper, lower, v)
                col = tuple(lip[i] * (1 - depth * 0.55) + lip_deep[i] * depth * 0.55 for i in range(3))
                edge = min(_smoothstep(lower, lower + 0.020, v), 1.0 - _smoothstep(upper - 0.018, upper, v))
                _blend_px(px, (y * n + x) * 4, col, min(1.0, edge * 1.8))
            # Philtrum notch and the parting line, painted rather than modelled.
            if abs(v - 0.50) <= 0.010 and abs(dx) <= 0.88:
                _blend_px(px, (y * n + x) * 4, lip_deep, 0.62)
    return _pack_image(name, px)


def paint_nose_texture(name, spec):
    """A faint bridge line and a small shadow under the tip. VRoid noses are a
    painted hint; anything stronger reads as a blob stuck to the face."""
    n = FACE_TEX
    px = [0.0] * (n * n * 4)
    shade = tuple(max(0.0, c * 0.74) for c in spec["skin"][:3])
    for y in range(n):
        v = (y + 0.5) / n
        for x in range(n):
            u = (x + 0.5) / n
            d = abs(u - 0.5)
            offset = (y * n + x) * 4
            # Bridge: barely there, fading in from the brow line downwards.
            if 0.34 <= v <= 0.88 and d <= 0.055:
                a = (1.0 - _smoothstep(0.020, 0.055, d)) * _smoothstep(0.88, 0.46, v) * 0.13
                _blend_px(px, offset, shade, a)
            # Tip shadow: a small soft lobe, the only part meant to be noticed.
            lobe = ((u - 0.5) / 0.145) ** 2 + ((v - 0.285) / 0.085) ** 2
            if lobe <= 1.0:
                _blend_px(px, offset, shade, (1.0 - _smoothstep(0.25, 1.0, lobe)) * 0.26)
    return _pack_image(name, px)


def paint_blush_texture(name, spec):
    """A soft cheek wash. Needs alpha blending, not a cutout, or it hard-edges."""
    n = FACE_TEX
    px = [0.0] * (n * n * 4)
    tint = (0.94, 0.55, 0.52)
    for y in range(n):
        v = (y + 0.5) / n
        for x in range(n):
            u = (x + 0.5) / n
            d = (((u - 0.5) / 0.46) ** 2 + ((v - 0.5) / 0.40) ** 2) ** 0.5
            if d <= 1.0:
                _blend_px(px, (y * n + x) * 4, tint, (1.0 - _smoothstep(0.10, 1.0, d)) * 0.40)
    return _pack_image(name, px)


def blush_material(name, image):
    material = COMMON.make_material(name, (1.0, 1.0, 1.0, 1.0), roughness=0.55)
    mtoon = material.vrm_addon_extension.mtoon1
    mtoon.pbr_metallic_roughness.base_color_texture.index.source = image
    mtoon.alpha_mode = "BLEND"
    mtoon.extensions.vrmc_materials_mtoon.outline_width_factor = 0.0
    return material


def painted_material(name, image, *, cutoff=0.42):
    """MToon material whose colour comes entirely from the painted texture."""
    material = COMMON.make_material(name, (1.0, 1.0, 1.0, 1.0), roughness=0.48)
    mtoon = material.vrm_addon_extension.mtoon1
    mtoon.pbr_metallic_roughness.base_color_texture.index.source = image
    for attr in ("base_color_factor",):
        if hasattr(mtoon.pbr_metallic_roughness, attr):
            setattr(mtoon.pbr_metallic_roughness, attr, (1.0, 1.0, 1.0, 1.0))
    mtoon.alpha_mode = "MASK"
    mtoon.alpha_cutoff = cutoff
    mtoon.extensions.vrmc_materials_mtoon.outline_width_factor = 0.0
    return material


def face_plane(name, centre, size, armature, bone_name, material, *, bow=0.0, subdiv=10, mirror_uv=False):
    """A grid facing -Y with planar UVs, bowed back at the edges to hug the skull.

    ``mirror_uv`` flips u so the right side can share the left side's painted
    texture; flipping the plane's X scale instead would invert its normals.
    """
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=subdiv, y_subdivisions=subdiv, size=1.0, location=centre)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], 1.0)
    obj.rotation_euler = (pi / 2, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if mirror_uv:
        for datum in obj.data.uv_layers.active.data:
            datum.uv.x = 1.0 - datum.uv.x
    if bow:
        hw, hh = size[0] * 0.5, size[1] * 0.5
        for vertex in obj.data.vertices:
            nx = vertex.co.x / hw if hw else 0.0
            nz = vertex.co.z / hh if hh else 0.0
            vertex.co.y += bow * min(1.0, nx * nx + nz * nz)
    return COMMON.rig_primitive(obj, armature, material, {bone_name: 1.0})


def rebuild_painted_face(prefix, spec, armature, materials, face_context):
    """Swap Wave 6's assembled face solids for painted alpha-cut planes."""
    unit = spec["height"] / spec["heads"]
    center, eye_y, eye_z, targets = face_context
    head_scale = spec.get("head_scale", (1.0, 1.0, 1.0))

    replaced = (
        "_ScleraExpression_", "_Iris_", "_Pupil_", "_EyeHighlight_",
        "_UpperEyelid_", "_LowerEyelid_", "_BrowExpression_",
        "_MouthExpression", "_UpperLipRidge", "_LowerLipRidge",
        "_Philtrum", "_Nostril_", "_CrowFoot_", "_NoseTip", "_NoseBridge",
    )
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or not obj.name.startswith(prefix):
            continue
        if any(fragment in obj.name for fragment in replaced):
            bpy.data.objects.remove(obj, do_unlink=True)

    surface_y = eye_y - unit * 0.055
    # One painted texture per feature, mirrored onto the right side: two of each
    # pushed the material count past the 16-material budget.
    eye_art = painted_material(prefix + "_EyeArt", paint_eye_texture(prefix + "_EyeTex", spec, 1.0))
    brow_art = painted_material(prefix + "_BrowArt", paint_brow_texture(prefix + "_BrowTex", spec, 1.0))
    blush_art = blush_material(prefix + "_BlushArt", paint_blush_texture(prefix + "_BlushTex", spec))
    eyes, brows = [], []
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        # Widened from EYE_X: a 0.40u plane at 0.185u crossed the centre line and
        # the two eyes touched. 0.34u at 0.215u leaves an eye-gap of ~0.09u.
        eye_x = unit * 0.215 * sign * head_scale[0]
        eye_bone = "eye." + suffix

        eye = face_plane(
            prefix + "_ScleraExpression_" + suffix,
            (eye_x, surface_y, eye_z + unit * 0.010),
            (unit * 0.335, unit * 0.295), armature, eye_bone, eye_art,
            bow=unit * 0.055, mirror_uv=sign < 0,
        )
        WAVE5.add_shape_key_from_basis(eye, "Blink", lambda co: setattr(co, "z", co.z * 0.06))
        WAVE5.add_shape_key_from_basis(eye, "Wide", lambda co: setattr(co, "z", co.z * 1.24))
        WAVE5.add_shape_key_from_basis(eye, "Squint", lambda co: setattr(co, "z", co.z * 0.54))
        eyes.append(eye)

        brow = face_plane(
            prefix + "_BrowExpression_" + suffix,
            (eye_x + sign * unit * 0.010, surface_y - unit * 0.010, eye_z + unit * 0.178),
            (unit * 0.315, unit * 0.125), armature, "head", brow_art,
            bow=unit * 0.030, mirror_uv=sign < 0,
        )
        for key_name, dz, dtilt in (
            ("HappyBrow", 0.055, 0.30), ("SadBrow", -0.030, -0.55),
            ("AngryBrow", -0.048, 0.70), ("RelaxedBrow", 0.026, 0.12),
            ("SurprisedBrow", 0.092, 0.10),
        ):
            WAVE5.add_shape_key_from_basis(
                brow, key_name,
                (lambda z, t: (lambda co: setattr(co, "z", co.z + unit * z + co.x * t * 0.16)))(dz, dtilt * sign),
            )
        brows.append(brow)

    mouth = face_plane(
        prefix + "_MouthExpression",
        (0.0, surface_y + unit * 0.055, eye_z - unit * 0.520),
        (unit * 0.34, unit * 0.26), armature, "head",
        painted_material(prefix + "_MouthArt", paint_mouth_texture(prefix + "_MouthTex", spec, "neutral")),
        bow=unit * 0.040,
    )
    # Visemes and emotions reshape the painted lip plane; VRoid drives the same
    # silhouettes from a texture atlas, but the morph contract keeps them here.
    for key_name, sx, sz, dz in (
        ("AA", 1.02, 1.85, -0.030), ("IH", 1.16, 0.62, -0.006),
        ("OU", 0.62, 1.35, -0.018), ("EE", 1.24, 0.72, 0.004),
        ("OH", 0.80, 1.70, -0.026), ("Happy", 1.20, 1.05, 0.016),
        ("Sad", 0.92, 0.86, -0.020), ("Angry", 1.06, 0.80, -0.016),
        ("Relaxed", 1.05, 0.94, 0.008), ("Surprised", 0.74, 1.62, -0.022),
    ):
        WAVE5.add_shape_key_from_basis(
            mouth, key_name,
            (lambda a, b, c: (lambda co: (setattr(co, "x", co.x * a), setattr(co, "z", co.z * b + unit * c))))(sx, sz, dz),
        )

    face_plane(
        prefix + "_NoseShade",
        (0.0, surface_y + unit * 0.012, eye_z - unit * 0.235),
        (unit * 0.115, unit * 0.150), armature, "head",
        blush_material(prefix + "_NoseArt", paint_nose_texture(prefix + "_NoseTex", spec)),
        bow=unit * 0.018,
    )
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        face_plane(
            prefix + "_Blush_" + suffix,
            (sign * unit * 0.255, surface_y + unit * 0.052, eye_z - unit * 0.145),
            (unit * 0.215, unit * 0.115), armature, "head", blush_art,
            bow=unit * 0.030,
        )

    targets["eyes"] = eyes
    targets["brows"] = brows
    targets["mouth"] = mouth
    return eyes, brows, mouth


# Built only when `toonspectrum_vrm_files` names it. Never swept up by "all".
OPT_IN_CHARACTERS = (
    {
        "file": "TS_Minseo_Campus.vrm", "name": "민서 (캠퍼스 메이커)", "style": "campus",
        "height": 1.65, "heads": 7.1, "age": 0.78, "shoulder": 0.074,
        "body": (1.00, 0.94, 1.00),
        "skin": (0.78, 0.55, 0.39, 1.0), "primary": (0.10, 0.16, 0.29, 1.0),
        "secondary": (0.90, 0.31, 0.18, 1.0), "accent": (0.92, 0.86, 0.76, 1.0),
        "hair": (0.08, 0.045, 0.035, 1.0), "fabric": (0.16, 0.22, 0.36, 1.0),
    },
)


WAVE7_STYLES = {
    "campus": add_campus,
    "barista": add_barista,
    "gardener": add_gardener,
    "explorer": add_explorer,
    "rune_guard": add_rune_guard,
    "android": add_android,
    "cyber_agent": add_cyber_agent,
    "architect": add_architect,
    "detective": add_detective,
    "hanji_archivist": add_hanji_archivist,
    "robot_club": add_robot_club,
    "rescue_captain": add_rescue_captain,
    "moss_golem": add_moss_golem,
}

# Wave 6 already replaced this with its own v2 dispatcher; keep that as the
# fallback so the four Wave 5 characters still regenerate identically.
WAVE6_STYLE_DETAILS = WAVE5.add_style_details


def add_style_details_v7(prefix, spec, armature, materials, face_context):
    style = spec["style"]
    builder = WAVE7_STYLES.get(style)
    if builder is None:
        WAVE6_STYLE_DETAILS(prefix, spec, armature, materials, face_context)
        return
    WAVE6.ensure_detail_materials(prefix, spec, materials)
    WAVE6.add_common_hand_and_foot_detail(prefix, spec, armature, materials)
    refine_face(prefix)
    rebuild_painted_face(prefix, spec, armature, materials, face_context)
    builder(prefix, spec, armature, materials, face_context)


WAVE5.add_style_details = add_style_details_v7

ORIGINAL_CONFIGURE_VRM_V7 = WAVE5.configure_vrm


def configure_vrm_v7(armature, spec):
    ORIGINAL_CONFIGURE_VRM_V7(armature, spec)
    meta = armature.data.vrm_addon_extension.vrm1.meta
    # Wave 5's configure_vrm does not read these, so a Wave 1 character whose
    # spec restricts them would silently ship as permissive.
    meta.allow_excessively_violent_usage = spec.get("allow_excessively_violent_usage", True)
    meta.allow_excessively_sexual_usage = spec.get("allow_excessively_sexual_usage", True)
    meta.version = "5.0.0"
    meta.copyright_information = (
        "ToonSpectrum original, Wave 7 rebuild on the Wave 5/6 connected-skin pipeline"
    )


WAVE5.configure_vrm = configure_vrm_v7


def main():
    requested_value = bpy.context.scene.get("toonspectrum_vrm_files", "")
    requested = {name.strip() for name in requested_value.split(",") if name.strip()}
    # An empty filter builds the roster only. Opt-in specs join it solely when named.
    pool = list(CHARACTERS) + ([*OPT_IN_CHARACTERS] if requested else [])
    selected = [spec for spec in pool if not requested or spec["file"] in requested]
    if requested and len(selected) != len(requested):
        known = {spec["file"] for spec in pool}
        raise ValueError("Unknown Wave 7 VRM files: " + ", ".join(sorted(requested - known)))
    for spec in selected:
        WAVE6.generate_character(spec)
    print("WAVE7_VRM_COMPLETE", len(selected))


if __name__ == "__main__":
    main()
