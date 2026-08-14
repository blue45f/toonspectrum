"""Generate ToonSpectrum Wave 4 high-detail original VRM 1.0 characters.

The script is intentionally self-contained so it can be executed either from
Blender's CLI or through Blender MCP.  It only uses the official VRM Add-on
armature generator and ``bpy.ops.export_scene.vrm`` exporter.  It never calls
``read_factory_settings`` because that would tear down a live MCP bridge.

Quality contract:
  * connected torso, arm, and leg lofts with two-bone joint transitions;
  * visible geometry influenced by every finger bone, both eye bones, and toes;
  * 18 real facial morph target names and 13 bound VRM preset expressions;
  * MToon 1.0 materials, embedded data, and direct CC0 metadata;
  * deterministic per-file filtering through ``scene["toonspectrum_vrm_files"]``.

Requirements:
  * Blender 5.2+
  * VRM Add-on for Blender 4.5+
"""

import bpy
from math import cos, pi, sin
from mathutils import Vector


OUTPUT_DIR = (
    bpy.context.scene.get("toonspectrum_vrm_output_dir")
    or bpy.path.abspath("//public/vrm")
)
AUTHOR = "ToonSpectrum"
CC0_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"


CHARACTERS = (
    {
        "file": "TS_Samira_OrbitalBotanist.vrm",
        "name": "사미라 (궤도 식물학자)",
        "style": "orbital_botanist",
        "height": 1.78,
        "heads": 7.35,
        "age": 0.88,
        "shoulder": 0.083,
        "body": (0.94, 0.92, 0.94),
        "skin": (0.28, 0.15, 0.10, 1.0),
        "primary": (0.08, 0.13, 0.31, 1.0),
        "secondary": (0.05, 0.43, 0.42, 1.0),
        "accent": (0.83, 0.62, 0.17, 1.0),
        "hair": (0.035, 0.025, 0.020, 1.0),
        "fabric": (0.15, 0.25, 0.43, 1.0),
    },
    {
        "file": "TS_Yunae_DeafPercussionist.vrm",
        "name": "윤애 (진동 타악 연주자)",
        "style": "deaf_percussionist",
        "height": 1.62,
        "heads": 6.65,
        "age": 0.86,
        "shoulder": 0.105,
        "body": (1.12, 1.00, 1.08),
        "arm_scale": 1.18,
        "skin": (0.73, 0.48, 0.32, 1.0),
        "primary": (0.075, 0.09, 0.20, 1.0),
        "secondary": (0.70, 0.08, 0.38, 1.0),
        "accent": (0.08, 0.88, 0.78, 1.0),
        "hair": (0.025, 0.018, 0.020, 1.0),
        "fabric": (0.19, 0.13, 0.31, 1.0),
    },
    {
        "file": "TS_Boram_WeatherScientist.vrm",
        "name": "보람 (기상과학자)",
        "style": "weather_scientist",
        "height": 1.67,
        "heads": 6.75,
        "age": 0.87,
        "shoulder": 0.086,
        "body": (1.10, 1.13, 1.02),
        "belly": 0.42,
        "skin": (0.84, 0.64, 0.48, 1.0),
        "primary": (0.19, 0.39, 0.62, 1.0),
        "secondary": (0.77, 0.86, 0.89, 1.0),
        "accent": (0.95, 0.34, 0.20, 1.0),
        "hair": (0.15, 0.075, 0.035, 1.0),
        "fabric": (0.37, 0.57, 0.72, 1.0),
    },
    {
        "file": "TS_Hyeon_StudioPotter.vrm",
        "name": "현 (도예 스튜디오 운영자)",
        "style": "studio_potter",
        "height": 1.31,
        "heads": 5.20,
        "age": 0.91,
        "shoulder": 0.106,
        "body": (1.25, 1.11, 1.06),
        "arm_length": 0.82,
        "leg_length": 0.70,
        "arm_scale": 1.12,
        "leg_scale": 1.08,
        "skin": (0.63, 0.40, 0.27, 1.0),
        "primary": (0.12, 0.24, 0.34, 1.0),
        "secondary": (0.55, 0.27, 0.12, 1.0),
        "accent": (0.82, 0.56, 0.28, 1.0),
        "hair": (0.065, 0.040, 0.028, 1.0),
        "fabric": (0.24, 0.34, 0.37, 1.0),
    },
    {
        "file": "TS_Dorong_SeaOtterCourier.vrm",
        "name": "도롱 (해달 우편원)",
        "style": "sea_otter_courier",
        "height": 1.46,
        "heads": 5.15,
        "age": 0.82,
        "shoulder": 0.100,
        "body": (1.28, 1.20, 1.18),
        "arm_scale": 1.08,
        "leg_scale": 0.98,
        "skin": (0.22, 0.12, 0.075, 1.0),
        "primary": (0.06, 0.34, 0.42, 1.0),
        "secondary": (0.78, 0.39, 0.12, 1.0),
        "accent": (0.94, 0.73, 0.22, 1.0),
        "hair": (0.12, 0.065, 0.040, 1.0),
        "fabric": (0.08, 0.25, 0.30, 1.0),
        "eye": (0.86, 0.94, 0.91, 1.0),
        "pupil": (0.008, 0.012, 0.010, 1.0),
        "head_scale": (1.16, 1.08, 1.04),
    },
)


def clear_scene():
    """Remove scene data without resetting Blender or the MCP server."""
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


def make_material(name, rgba, *, metallic=0.0, roughness=0.62, emission=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission > 0.0:
        shader.inputs["Emission Color"].default_value = rgba
        shader.inputs["Emission Strength"].default_value = emission

    # Use the official VRM Add-on MToon property group so the exporter emits
    # VRMC_materials_mtoon instead of relying on a post-export JSON mutation.
    mtoon = material.vrm_addon_extension.mtoon1
    mtoon.enabled = True
    mtoon.pbr_metallic_roughness.base_color_factor = rgba
    mtoon.emissive_factor = tuple(channel * min(emission, 1.0) for channel in rgba[:3])
    vrmc = mtoon.extensions.vrmc_materials_mtoon
    vrmc.shade_color_factor = tuple(max(0.0, channel * 0.58) for channel in rgba[:3])
    vrmc.shading_toony_factor = 0.86
    vrmc.gi_equalization_factor = 0.72
    return material


def add_armature_modifier(obj, armature):
    modifier = obj.modifiers.new("TS_Wave4_Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    return obj


def apply_vertex_weights(obj, armature, weights_by_vertex):
    groups = {}
    for weights in weights_by_vertex:
        for bone_name in weights:
            if bone_name not in groups:
                groups[bone_name] = obj.vertex_groups.new(name=bone_name)
    for vertex_index, weights in enumerate(weights_by_vertex):
        total = sum(max(0.0, value) for value in weights.values())
        if total <= 0.0:
            raise ValueError(f"{obj.name}: vertex {vertex_index} has no skin influence")
        for bone_name, value in weights.items():
            normalized = max(0.0, value) / total
            if normalized > 0.0:
                groups[bone_name].add([vertex_index], normalized, "REPLACE")
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return add_armature_modifier(obj, armature)


def make_loft(name, rings, segments, armature, material, cap=True):
    """Create one connected skinned surface from oriented elliptical rings.

    Each ring is ``(center, axis_a, axis_b, weights)``. ``axis_a`` and
    ``axis_b`` already include their radii.  Adjacent rings are joined by quads,
    allowing elbows, knees, ankles, and curved tails to remain a single mesh.
    """
    vertices = []
    weights_by_vertex = []
    for center, axis_a, axis_b, weights in rings:
        center = Vector(center)
        axis_a = Vector(axis_a)
        axis_b = Vector(axis_b)
        for index in range(segments):
            angle = 2.0 * pi * index / segments
            vertices.append(center + axis_a * cos(angle) + axis_b * sin(angle))
            weights_by_vertex.append(dict(weights))

    faces = []
    for ring_index in range(len(rings) - 1):
        start = ring_index * segments
        next_start = start + segments
        for index in range(segments):
            following = (index + 1) % segments
            faces.append((start + index, start + following,
                          next_start + following, next_start + index))

    if cap:
        first_center_index = len(vertices)
        vertices.append(Vector(rings[0][0]))
        weights_by_vertex.append(dict(rings[0][3]))
        last_center_index = len(vertices)
        vertices.append(Vector(rings[-1][0]))
        weights_by_vertex.append(dict(rings[-1][3]))
        last_start = (len(rings) - 1) * segments
        for index in range(segments):
            following = (index + 1) % segments
            faces.append((first_center_index, following, index))
            faces.append((last_center_index, last_start + index, last_start + following))

    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return apply_vertex_weights(obj, armature, weights_by_vertex)


def stable_frame(points, index):
    if index == 0:
        tangent = Vector(points[1]) - Vector(points[0])
    elif index == len(points) - 1:
        tangent = Vector(points[-1]) - Vector(points[-2])
    else:
        tangent = Vector(points[index + 1]) - Vector(points[index - 1])
    tangent.normalize()
    reference = Vector((0.0, 0.0, 1.0))
    if abs(tangent.dot(reference)) > 0.92:
        reference = Vector((0.0, 1.0, 0.0))
    axis_a = tangent.cross(reference).normalized()
    axis_b = tangent.cross(axis_a).normalized()
    return axis_a, axis_b


def make_tube(name, points, radii, ring_weights, armature, material, segments=12):
    rings = []
    previous_axis = None
    for index, point in enumerate(points):
        axis_a, axis_b = stable_frame(points, index)
        if previous_axis is not None and axis_a.dot(previous_axis) < 0.0:
            axis_a.negate()
            axis_b.negate()
        previous_axis = axis_a.copy()
        radius_a, radius_b = radii[index] if isinstance(radii[index], tuple) else (radii[index], radii[index])
        rings.append((Vector(point), axis_a * radius_a, axis_b * radius_b, ring_weights[index]))
    return make_loft(name, rings, segments, armature, material)


def rig_primitive(obj, armature, material, weights):
    obj.data.materials.append(material)
    weight_list = [dict(weights) for _ in obj.data.vertices]
    return apply_vertex_weights(obj, armature, weight_list)


def ellipsoid(name, location, scale, armature, bone_name, material, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return rig_primitive(obj, armature, material, {bone_name: 1.0})


def weighted_ellipsoid(name, location, scale, armature, weights, material, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return rig_primitive(obj, armature, material, weights)


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


def blend(a, b, amount):
    return Vector(a).lerp(Vector(b), amount)


def add_torso(prefix, spec, armature, material):
    unit = spec["height"] / spec["heads"]
    width, depth, _ = spec["body"]
    hips = bone_head(armature, "hips")
    spine = bone_head(armature, "spine")
    chest = bone_head(armature, "chest")
    neck = bone_head(armature, "neck")
    belly = spec.get("belly", 0.0)

    levels = [
        (hips.z - unit * 0.10, 0.72, 0.48, {"hips": 1.0}, 0.05),
        (hips.z + unit * 0.20, 0.84, 0.56, {"hips": 0.72, "spine": 0.28}, 0.32),
        (spine.z, 0.77, 0.54, {"hips": 0.30, "spine": 0.70}, 0.72),
        ((spine.z + chest.z) * 0.5, 0.74, 0.50, {"spine": 0.72, "chest": 0.28}, 1.0),
        (chest.z, 0.91, 0.52, {"spine": 0.24, "chest": 0.76}, 0.45),
        (chest.z + (neck.z - chest.z) * 0.62, 1.02, 0.51, {"chest": 1.0}, 0.10),
        (neck.z - unit * 0.08, 0.72, 0.42, {"chest": 0.78, "neck": 0.22}, 0.0),
    ]
    rings = []
    for z, x_scale, y_scale, weights, belly_factor in levels:
        front_shift = -unit * belly * belly_factor * 0.16
        front_depth = 1.0 + belly * belly_factor * 0.72
        rings.append((
            Vector((0.0, front_shift, z)),
            Vector((unit * x_scale * width, 0.0, 0.0)),
            Vector((0.0, unit * y_scale * depth * front_depth, 0.0)),
            weights,
        ))
    return make_loft(prefix + "_ConnectedTorso", rings, 24, armature, material)


def add_arm(prefix, suffix, spec, armature, material, skin_material):
    unit = spec["height"] / spec["heads"]
    arm_scale = spec.get("arm_scale", spec["body"][2])
    upper = "upper_arm." + suffix
    lower = "lower_arm." + suffix
    hand = "hand." + suffix
    shoulder = "shoulder." + suffix
    shoulder_point = bone_head(armature, upper)
    elbow = bone_head(armature, lower)
    wrist = bone_head(armature, hand)
    palm_end = bone_tail(armature, hand)
    radius = unit * 0.205 * arm_scale
    points = [
        shoulder_point,
        blend(shoulder_point, elbow, 0.46),
        blend(shoulder_point, elbow, 0.84),
        elbow,
        blend(elbow, wrist, 0.18),
        blend(elbow, wrist, 0.56),
        blend(elbow, wrist, 0.86),
        wrist,
    ]
    radii = [radius * factor for factor in (1.14, 1.03, 0.94, 0.91, 0.88, 0.80, 0.74, 0.69)]
    weights = [
        {shoulder: 0.22, upper: 0.78},
        {upper: 1.0},
        {upper: 0.76, lower: 0.24},
        {upper: 0.50, lower: 0.50},
        {upper: 0.20, lower: 0.80},
        {lower: 1.0},
        {lower: 0.78, hand: 0.22},
        {lower: 0.48, hand: 0.52},
    ]
    make_tube(prefix + "_ConnectedArm_" + suffix, points, radii, weights,
              armature, material, 16)

    # A tapered palm overlaps the wrist, while every finger below has its own
    # three-bone connected loft.  This keeps the silhouette natural and makes
    # Studio finger tracking visibly deform the model.
    palm_points = [
        blend(wrist, palm_end, -0.10),
        blend(wrist, palm_end, 0.38),
        blend(wrist, palm_end, 0.85),
        palm_end,
    ]
    palm_radii = [
        (radius * 0.74, radius * 0.46),
        (radius * 0.78, radius * 0.48),
        (radius * 0.63, radius * 0.41),
        (radius * 0.48, radius * 0.34),
    ]
    palm_weights = [
        {lower: 0.28, hand: 0.72},
        {hand: 1.0},
        {hand: 1.0},
        {hand: 1.0},
    ]
    make_tube(prefix + "_Palm_" + suffix, palm_points, palm_radii,
              palm_weights, armature, skin_material, 14)

    finger_roots = ("thumb", "index", "middle", "ring", "little")
    for finger_index, finger in enumerate(finger_roots):
        bones = [
            f"{finger}_proximal.{suffix}",
            f"{finger}_intermediate.{suffix}",
            f"{finger}_distal.{suffix}",
        ]
        finger_points = [
            bone_head(armature, bones[0]),
            blend(bone_head(armature, bones[0]), bone_tail(armature, bones[0]), 0.72),
            bone_head(armature, bones[1]),
            blend(bone_head(armature, bones[1]), bone_tail(armature, bones[1]), 0.72),
            bone_head(armature, bones[2]),
            blend(bone_head(armature, bones[2]), bone_tail(armature, bones[2]), 0.78),
            bone_tail(armature, bones[2]),
        ]
        base_radius = unit * (0.047 if finger == "thumb" else 0.040 - finger_index * 0.0015)
        finger_radii = [base_radius * f for f in (1.08, 1.00, 0.96, 0.88, 0.82, 0.70, 0.48)]
        finger_weights = [
            {hand: 0.18, bones[0]: 0.82},
            {bones[0]: 1.0},
            {bones[0]: 0.50, bones[1]: 0.50},
            {bones[1]: 1.0},
            {bones[1]: 0.50, bones[2]: 0.50},
            {bones[2]: 1.0},
            {bones[2]: 1.0},
        ]
        make_tube(prefix + "_" + finger.title() + "_" + suffix,
                  finger_points, finger_radii, finger_weights,
                  armature, skin_material, 10)


def add_leg(prefix, suffix, spec, armature, material, shoe_material):
    unit = spec["height"] / spec["heads"]
    leg_scale = spec.get("leg_scale", spec["body"][2])
    upper = "upper_leg." + suffix
    lower = "lower_leg." + suffix
    foot = "foot." + suffix
    toes = "toes." + suffix
    hip = bone_head(armature, upper)
    knee = bone_head(armature, lower)
    ankle = bone_head(armature, foot)
    toe_root = bone_head(armature, toes)
    toe_tip = bone_tail(armature, toes)
    radius = unit * 0.285 * leg_scale
    points = [
        hip,
        blend(hip, knee, 0.48),
        blend(hip, knee, 0.84),
        knee,
        blend(knee, ankle, 0.18),
        blend(knee, ankle, 0.60),
        blend(knee, ankle, 0.88),
        ankle,
        blend(ankle, toe_root, 0.62),
        toe_root,
        blend(toe_root, toe_tip, 0.62),
        toe_tip,
    ]
    radii = [
        (radius * 1.12, radius * 0.98),
        (radius * 1.00, radius * 0.92),
        (radius * 0.89, radius * 0.83),
        (radius * 0.82, radius * 0.78),
        (radius * 0.79, radius * 0.74),
        (radius * 0.70, radius * 0.65),
        (radius * 0.63, radius * 0.59),
        (radius * 0.59, radius * 0.55),
        (radius * 0.65, radius * 0.48),
        (radius * 0.76, radius * 0.42),
        (radius * 0.73, radius * 0.36),
        (radius * 0.47, radius * 0.29),
    ]
    weights = [
        {upper: 1.0},
        {upper: 1.0},
        {upper: 0.76, lower: 0.24},
        {upper: 0.50, lower: 0.50},
        {upper: 0.20, lower: 0.80},
        {lower: 1.0},
        {lower: 0.78, foot: 0.22},
        {lower: 0.46, foot: 0.54},
        {foot: 1.0},
        {foot: 0.78, toes: 0.22},
        {foot: 0.32, toes: 0.68},
        {toes: 1.0},
    ]
    make_tube(prefix + "_ConnectedLeg_" + suffix, points, radii,
              weights, armature, material, 16)

    # A separate low-profile shoe shell shares foot/toe weights.  The toe bone
    # therefore changes the visible silhouette instead of existing only as a
    # metadata mapping.
    shoe_points = [ankle, blend(ankle, toe_root, 0.66), toe_root,
                   blend(toe_root, toe_tip, 0.68), toe_tip]
    shoe_radii = [
        (radius * 0.67, radius * 0.59),
        (radius * 0.78, radius * 0.54),
        (radius * 0.88, radius * 0.49),
        (radius * 0.86, radius * 0.42),
        (radius * 0.56, radius * 0.34),
    ]
    shoe_weights = [
        {lower: 0.18, foot: 0.82},
        {foot: 1.0},
        {foot: 0.76, toes: 0.24},
        {foot: 0.28, toes: 0.72},
        {toes: 1.0},
    ]
    make_tube(prefix + "_Shoe_" + suffix, shoe_points, shoe_radii,
              shoe_weights, armature, shoe_material, 14)


def add_face(prefix, spec, armature, materials):
    unit = spec["height"] / spec["heads"]
    head = bone_head(armature, "head")
    head_tip = bone_tail(armature, "head")
    center = (head + head_tip) * 0.5
    center.y = -unit * 0.01
    head_scale = spec.get("head_scale", (1.0, 1.0, 1.0))
    ellipsoid(
        prefix + "_Head",
        center,
        (unit * 0.49 * head_scale[0], unit * 0.43 * head_scale[1], unit * 0.58 * head_scale[2]),
        armature,
        "head",
        materials["skin"],
        32,
        22,
    )

    eye_z = center.z + unit * 0.075
    eye_y = center.y - unit * 0.405 * head_scale[1]
    expression_targets = {"eyes": [], "brows": [], "mouth": None}
    for suffix, sign in (("L", 1.0), ("R", -1.0)):
        eye_x = unit * 0.185 * sign * head_scale[0]
        eye_bone = "eye." + suffix
        eye = ellipsoid(
            prefix + "_Eye_" + suffix,
            (eye_x, eye_y, eye_z),
            (unit * 0.125, unit * 0.036, unit * 0.082),
            armature,
            eye_bone,
            materials["eye"],
            20,
            12,
        )
        add_shape_key(eye, "Blink", lambda co: setattr(co, "z", co.z * 0.075))
        add_shape_key(eye, "Wide", lambda co: setattr(co, "z", co.z * 1.28))
        add_shape_key(eye, "Squint", lambda co: setattr(co, "z", co.z * 0.52))
        expression_targets["eyes"].append(eye)
        ellipsoid(
            prefix + "_Pupil_" + suffix,
            (eye_x, eye_y - unit * 0.036, eye_z),
            (unit * 0.045, unit * 0.018, unit * 0.048),
            armature,
            eye_bone,
            materials["pupil"],
            16,
            10,
        )

        brow = ellipsoid(
            prefix + "_Brow_" + suffix,
            (eye_x, eye_y - unit * 0.018, eye_z + unit * 0.165),
            (unit * 0.145, unit * 0.021, unit * 0.025),
            armature,
            "head",
            materials["hair"],
            16,
            8,
        )
        direction = sign
        add_shape_key(brow, "HappyBrow", lambda co: setattr(co, "z", co.z + abs(co.x) * 0.16))
        add_shape_key(brow, "SadBrow", lambda co: setattr(co, "z", co.z - abs(co.x) * 0.18))
        add_shape_key(brow, "AngryBrow", lambda co, d=direction: setattr(co, "z", co.z - d * co.x * 0.22))
        add_shape_key(brow, "RelaxedBrow", lambda co: setattr(co, "z", co.z + unit * 0.016))
        add_shape_key(brow, "SurprisedBrow", lambda co: setattr(co, "z", co.z + unit * 0.055))
        expression_targets["brows"].append(brow)

    ellipsoid(
        prefix + "_Nose",
        (0.0, eye_y - unit * 0.020, center.z - unit * 0.025),
        (unit * 0.047, unit * 0.065, unit * 0.075),
        armature,
        "head",
        materials["skin"],
        16,
        10,
    )
    mouth = ellipsoid(
        prefix + "_Mouth",
        (0.0, eye_y - unit * 0.018, center.z - unit * 0.205),
        (unit * 0.17, unit * 0.027, unit * 0.043),
        armature,
        "head",
        materials["mouth"],
        20,
        10,
    )
    add_shape_key(mouth, "AA", lambda co: setattr(co, "z", co.z * 3.25))
    add_shape_key(mouth, "IH", lambda co: setattr(co, "x", co.x * 1.42))
    add_shape_key(mouth, "OU", lambda co: (setattr(co, "x", co.x * 0.52), setattr(co, "z", co.z * 2.2)))
    add_shape_key(mouth, "EE", lambda co: (setattr(co, "x", co.x * 1.62), setattr(co, "z", co.z * 0.58)))
    add_shape_key(mouth, "OH", lambda co: (setattr(co, "x", co.x * 0.70), setattr(co, "z", co.z * 2.85)))
    add_shape_key(mouth, "Happy", lambda co: setattr(co, "z", co.z + abs(co.x) * 0.31))
    add_shape_key(mouth, "Sad", lambda co: setattr(co, "z", co.z - abs(co.x) * 0.28))
    add_shape_key(mouth, "Angry", lambda co: setattr(co, "z", co.z - co.x * 0.23))
    add_shape_key(mouth, "Relaxed", lambda co: (setattr(co, "x", co.x * 1.12), setattr(co, "z", co.z * 0.82)))
    add_shape_key(mouth, "Surprised", lambda co: (setattr(co, "x", co.x * 0.56), setattr(co, "z", co.z * 3.55)))
    expression_targets["mouth"] = mouth
    return center, eye_y, eye_z, expression_targets


def make_badge(prefix, location, scale, armature, material, bone="chest"):
    return ellipsoid(prefix, location, scale, armature, bone, material, 18, 10)


def add_style_details(prefix, spec, armature, materials, face_context):
    unit = spec["height"] / spec["heads"]
    center, eye_y, eye_z, _ = face_context
    style = spec["style"]
    hips = bone_head(armature, "hips")
    chest = bone_head(armature, "chest")
    neck = bone_head(armature, "neck")

    # Shared hair/fur cap is positioned behind the face so eyes remain visible.
    cap_material = materials["fabric"] if style == "orbital_botanist" else materials["hair"]
    ellipsoid(
        prefix + "_HeadCover",
        (center.x, center.y + unit * 0.065, center.z + unit * 0.13),
        (unit * 0.505, unit * 0.43, unit * 0.47),
        armature,
        "head",
        cap_material,
        28,
        18,
    )

    if style == "orbital_botanist":
        # Modest orbital headscarf and a split botanical leaf insignia.
        weighted_ellipsoid(prefix + "_ScarfCollar", (0, 0, neck.z - unit * 0.02),
                           (unit * 0.46, unit * 0.35, unit * 0.20), armature,
                           {"neck": 0.34, "chest": 0.66}, materials["fabric"], 28, 14)
        for sign in (-1.0, 1.0):
            weighted_ellipsoid(prefix + "_ScarfTail_" + str(int(sign)),
                               (sign * unit * 0.20, unit * 0.26, chest.z - unit * 0.19),
                               (unit * 0.18, unit * 0.075, unit * 0.50), armature,
                               {"chest": 0.82, "spine": 0.18}, materials["fabric"], 18, 12)
            leaf = make_badge(prefix + "_Leaf_" + str(int(sign)),
                              (sign * unit * 0.11, -unit * 0.53, chest.z + unit * 0.04),
                              (unit * 0.085, unit * 0.025, unit * 0.17),
                              armature, materials["accent"])
            leaf.rotation_euler.y = sign * 0.48
    elif style == "deaf_percussionist":
        # Visible body-worn hearing processors and vibration feedback bands.
        for sign, suffix in ((1.0, "L"), (-1.0, "R")):
            ellipsoid(prefix + "_HearingProcessor_" + suffix,
                      (sign * unit * 0.49, center.y - unit * 0.01, center.z + unit * 0.02),
                      (unit * 0.070, unit * 0.045, unit * 0.125), armature,
                      "head", materials["accent"], 18, 10)
            lower = "lower_arm." + suffix
            band_center = blend(bone_head(armature, lower), bone_tail(armature, lower), 0.46)
            weighted_ellipsoid(prefix + "_VibrationBand_" + suffix, band_center,
                               (unit * 0.19, unit * 0.19, unit * 0.12), armature,
                               {lower: 1.0}, materials["accent"], 20, 10)
        make_badge(prefix + "_PulseCore", (0, -unit * 0.53, chest.z + unit * 0.02),
                   (unit * 0.17, unit * 0.032, unit * 0.17), armature, materials["accent"])
    elif style == "weather_scientist":
        # Layered weather coat and radar/cloud badge; the connected torso loft
        # carries the pregnancy silhouette rather than a detached belly sphere.
        for sign in (-1.0, 1.0):
            weighted_ellipsoid(prefix + "_CoatLapels_" + str(int(sign)),
                               (sign * unit * 0.22, -unit * 0.54, chest.z - unit * 0.18),
                               (unit * 0.20, unit * 0.040, unit * 0.56), armature,
                               {"chest": 0.62, "spine": 0.38}, materials["secondary"], 20, 12)
        make_badge(prefix + "_RadarBadge", (0, -unit * 0.59, chest.z + unit * 0.02),
                   (unit * 0.16, unit * 0.030, unit * 0.16), armature, materials["accent"])
        for index, x in enumerate((-0.10, 0.0, 0.10)):
            make_badge(prefix + "_CloudMark_" + str(index),
                       (unit * x, -unit * 0.625, chest.z + unit * (0.02 + 0.035 * (index % 2))),
                       (unit * 0.065, unit * 0.018, unit * 0.045), armature, materials["secondary"])
    elif style == "studio_potter":
        weighted_ellipsoid(prefix + "_Apron", (0, -unit * 0.55, (hips.z + chest.z) * 0.5),
                           (unit * 0.76 * spec["body"][0], unit * 0.050, unit * 0.92), armature,
                           {"spine": 0.64, "hips": 0.20, "chest": 0.16}, materials["fabric"], 24, 14)
        weighted_ellipsoid(prefix + "_ApronBelt", (0, -unit * 0.56, hips.z + unit * 0.12),
                           (unit * 0.86 * spec["body"][0], unit * 0.060, unit * 0.13), armature,
                           {"hips": 0.72, "spine": 0.28}, materials["accent"], 22, 10)
        for sign in (-1.0, 1.0):
            make_badge(prefix + "_ClayPatch_" + str(int(sign)),
                       (sign * unit * 0.25, -unit * 0.62, hips.z + unit * 0.42),
                       (unit * 0.13, unit * 0.025, unit * 0.18), armature, materials["secondary"], "spine")
    elif style == "sea_otter_courier":
        # Organic animal silhouette with real humanoid fingers/toes underneath.
        for sign, suffix in ((1.0, "L"), (-1.0, "R")):
            ellipsoid(prefix + "_Ear_" + suffix,
                      (sign * unit * 0.44, center.y + unit * 0.03, center.z + unit * 0.34),
                      (unit * 0.16, unit * 0.10, unit * 0.18), armature,
                      "head", materials["hair"], 20, 12)
        weighted_ellipsoid(prefix + "_Muzzle", (0, eye_y - unit * 0.025, center.z - unit * 0.12),
                           (unit * 0.30, unit * 0.075, unit * 0.18), armature,
                           {"head": 1.0}, materials["secondary"], 24, 14)
        ellipsoid(prefix + "_OtterNose", (0, eye_y - unit * 0.105, center.z - unit * 0.055),
                  (unit * 0.085, unit * 0.045, unit * 0.065), armature,
                  "head", materials["pupil"], 18, 10)
        # Curved, hips/spine-weighted tail. It is deliberately not advertised as
        # a spring bone until a separate verified secondary-motion pass exists.
        tail_points = [
            (0.0, unit * 0.42, hips.z + unit * 0.08),
            (unit * 0.10, unit * 0.67, hips.z - unit * 0.22),
            (unit * 0.18, unit * 0.83, hips.z - unit * 0.55),
            (unit * 0.08, unit * 0.92, hips.z - unit * 0.83),
        ]
        tail_radii = [unit * f for f in (0.24, 0.22, 0.17, 0.08)]
        tail_weights = [
            {"hips": 0.86, "spine": 0.14},
            {"hips": 0.76, "spine": 0.24},
            {"hips": 0.62, "spine": 0.38},
            {"hips": 0.55, "spine": 0.45},
        ]
        make_tube(prefix + "_ConnectedTail", tail_points, tail_radii,
                  tail_weights, armature, materials["hair"], 16)
        weighted_ellipsoid(prefix + "_CourierVest", (0, -unit * 0.49, (hips.z + chest.z) * 0.53),
                           (unit * 0.88 * spec["body"][0], unit * 0.055, unit * 0.72), armature,
                           {"spine": 0.60, "chest": 0.30, "hips": 0.10}, materials["primary"], 24, 14)
        make_badge(prefix + "_CourierSeal", (0, -unit * 0.57, chest.z),
                   (unit * 0.16, unit * 0.030, unit * 0.16), armature, materials["accent"])


def configure_vrm(armature, spec):
    extension = armature.data.vrm_addon_extension
    extension.spec_version = "1.0"
    meta = extension.vrm1.meta
    meta.vrm_name = spec["name"]
    meta.version = "2.0.0"
    meta.authors.add().value = AUTHOR
    meta.copyright_information = "ToonSpectrum Wave 4 original procedural character"
    meta.contact_information = "ToonSpectrum"
    meta.references.add().value = "Generated with Blender MCP and the official VRM Add-on exporter"
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


def configure_expressions(armature, targets):
    expressions = armature.data.vrm_addon_extension.vrm1.expressions.preset
    left_eye, right_eye = targets["eyes"]
    left_brow, right_brow = targets["brows"]
    mouth = targets["mouth"]

    bind_expression(expressions.blink, left_eye, "Blink")
    bind_expression(expressions.blink, right_eye, "Blink")
    bind_expression(expressions.blink_left, left_eye, "Blink")
    bind_expression(expressions.blink_right, right_eye, "Blink")
    for expression, target in (
        (expressions.aa, "AA"),
        (expressions.ih, "IH"),
        (expressions.ou, "OU"),
        (expressions.ee, "EE"),
        (expressions.oh, "OH"),
    ):
        bind_expression(expression, mouth, target)

    emotion_bindings = (
        (expressions.happy, "Happy", "HappyBrow", "Squint"),
        (expressions.sad, "Sad", "SadBrow", None),
        (expressions.angry, "Angry", "AngryBrow", "Squint"),
        (expressions.relaxed, "Relaxed", "RelaxedBrow", None),
        (expressions.surprised, "Surprised", "SurprisedBrow", "Wide"),
    )
    for expression, mouth_target, brow_target, eye_target in emotion_bindings:
        bind_expression(expression, mouth, mouth_target)
        bind_expression(expression, left_brow, brow_target, 0.88)
        bind_expression(expression, right_brow, brow_target, 0.88)
        if eye_target:
            bind_expression(expression, left_eye, eye_target, 0.72)
            bind_expression(expression, right_eye, eye_target, 0.72)


def build_character(spec):
    clear_scene()
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
        "skin": make_material(prefix + "_Skin", spec["skin"], roughness=0.78),
        "primary": make_material(prefix + "_Primary", spec["primary"], roughness=0.58),
        "secondary": make_material(prefix + "_Secondary", spec["secondary"], roughness=0.64),
        "accent": make_material(prefix + "_Accent", spec["accent"], metallic=0.16, roughness=0.32, emission=0.28),
        "hair": make_material(prefix + "_Hair", spec["hair"], roughness=0.82),
        "fabric": make_material(prefix + "_Fabric", spec["fabric"], roughness=0.86),
        "eye": make_material(prefix + "_Eye", eye_color, roughness=0.28),
        "pupil": make_material(prefix + "_Pupil", pupil_color, roughness=0.24),
        "mouth": make_material(prefix + "_Mouth", (0.38, 0.055, 0.075, 1.0), roughness=0.52),
    }

    add_torso(prefix, spec, armature, materials["primary"])
    for suffix in ("L", "R"):
        add_arm(prefix, suffix, spec, armature, materials["fabric"], materials["skin"])
        add_leg(prefix, suffix, spec, armature, materials["secondary"], materials["accent"])

    unit = spec["height"] / spec["heads"]
    neck = bone_head(armature, "neck")
    head = bone_head(armature, "head")
    weighted_ellipsoid(prefix + "_Neck", (neck + head) * 0.5,
                       (unit * 0.29, unit * 0.27, max(unit * 0.25, (head.z - neck.z) * 0.48)),
                       armature, {"neck": 0.78, "head": 0.22}, materials["skin"], 20, 12)
    center, eye_y, eye_z, targets = add_face(prefix, spec, armature, materials)
    add_style_details(prefix, spec, armature, materials, (center, eye_y, eye_z, targets))
    configure_expressions(armature, targets)
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
    print("WAVE4_VRM_EXPORT", spec["file"], len(armature.data.bones), filepath)


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
        raise ValueError("Unknown Wave 4 VRM files: " + ", ".join(sorted(requested - known)))
    for spec in selected:
        generate_character(spec)
    print("WAVE4_VRM_COMPLETE", len(selected))


if __name__ == "__main__":
    main()
