"""Build immutable Studio environment revisions with embedded CC0 PBR surfaces.

Run with Blender 5.2 --background --python this-file -- --scenes all.
Original GLBs are imported, never overwritten. Comparison frames share camera,
lighting, color management and render settings. Export excludes review lights.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "apps/web/public/assets"
SOURCE = PUBLIC / "3d/environments"
OUTPUT = SOURCE / "refined-v6"
ARTIFACTS = ROOT / "artifacts/studio-environment-quality-v6"
CC0 = PUBLIC / "studio/cc0-20260906/assets"

CAMERAS = {
    "compact_apartment_interior": ([8.8, 6.8, 9.6], [0, 1.25, 0], 44),
    "stylized_cafe_interior": ([11.4, 8.1, 12.8], [0, 1.35, 0.4], 44),
    "urban_neon_alley": ([0, 5.7, 19], [0, 2.55, -1], 44),
    "classroom_art_studio": ([12.8, 9.4, 14.2], [0, 1.45, 0], 44),
    "fantasy_ruin_courtyard": ([14.7, 11.2, 16.5], [0, 2, 0], 44),
    "scifi_command_corridor": ([0, 4.9, 20.5], [0, 2, -2.8], 44),
    "hospital_emergency_nurse_station": ([14.2, 9.4, 14.5], [0, 1.35, -1], 46),
    "korean_school_rooftop": ([18, 12, 18.5], [0, 1.15, -0.2], 46),
    "hanok_market_courtyard": ([18.5, 11.8, 19], [0, 1.45, -0.7], 46),
    "korean_convenience_store_night": ([8.8, 8.4, 17.8], [0, 1.35, 0.15], 43),
    "seoul_subway_platform": ([-2.3, 2.25, 9.25], [0.2, 1.75, -3], 38),
    "fantasy_alchemist_workshop_library": ([15.2, 10.6, 17], [0, 2.05, -0.25], 46),
}

# Exact source groups retain their authored contact locations and orientations.
REPLACEMENTS = {
    "compact_apartment_interior": [
        (r"^(DiningChair_\d+)_", "modern_arm_chair_01", "chair"),
        (r"^(Sofa)_", "sofa_02", "bounds"),
        (r"^(Plant)_", "potted_plant_02", "plant"),
    ],
    "stylized_cafe_interior": [
        (r"^(CafeChair_\d+_\d+)_", "modern_arm_chair_01", "chair"),
        (r"^(CafePlant_\d+)_", "potted_plant_02", "plant"),
    ],
    "hospital_emergency_nurse_station": [
        (r"^(NurseStool_\d+)_", "modern_arm_chair_01", "stool-chair"),
    ],
    "korean_school_rooftop": [
        (r"^(RoofPlanter_\d+)(?:_|$)", "potted_plant_04", "plant"),
    ],
}


def y_up(value):
    return Vector((value[0], -value[2], value[1]))


def world_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    if not points:
        raise ValueError("Cannot measure an empty object group")
    return (Vector(tuple(min(p[i] for p in points) for i in range(3))),
            Vector(tuple(max(p[i] for p in points) for i in range(3))))


def triangles(objects):
    return sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
               for obj in objects if obj.type == "MESH")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    for obj in imported:
        matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = matrix
    meshes = [obj for obj in imported if obj.type == "MESH"]
    for obj in list(imported):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    return meshes


def review_setup(name, resolution, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.06
    scene.cycles.max_bounces = 5
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.render.resolution_x = resolution
    scene.render.resolution_y = round(resolution * 0.75)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0
    world = bpy.data.worlds.new("ReviewNeutralWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.62, 0.72, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    scene.world = world
    position, target, fov = CAMERAS[name]
    bpy.ops.object.camera_add(location=y_up(position))
    camera = bpy.context.object
    camera.name = "ReviewCamera"
    camera.rotation_euler = (y_up(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "PERSP"
    camera.data.lens_unit = "FOV"
    camera.data.angle = math.radians(fov)
    camera.data.clip_end = 150
    scene.camera = camera
    for label, location, power, size, color in [
        ("Key", (-6, -5, 11), 1800, 8, (1.0, 0.87, 0.74)),
        ("Fill", (7, -2, 8), 1300, 7, (0.76, 0.86, 1.0)),
        ("Top", (0, 6, 10), 1800, 7, (1.0, 0.96, 0.88)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = "Review" + label
        light.data.energy = power
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (y_up(target) - light.location).to_track_quat("-Z", "Y").to_euler()
    if name in {"seoul_subway_platform", "scifi_command_corridor"}:
        # A shared inspection light inside closed ceilings reveals both source
        # and revised materials. It is never exported with the model.
        bpy.ops.object.light_add(type="AREA", location=(0, -2, 3.6))
        light = bpy.context.object
        light.name = "ReviewInteriorFill"
        light.data.energy = 850
        light.data.size = 6


def render(path):
    bpy.context.scene.render.filepath = str(path)
    if bpy.context.scene.camera is None:
        raise ValueError("Review camera is required")
    bpy.ops.render.render(write_still=True)


def source_folder(slug):
    return CC0 / ("polyhaven-" + slug.replace("_", "-"))


def load_template(slug, report):
    imported = import_glb(source_folder(slug) / (slug + ".glb"))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in imported:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = imported[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    low, high = world_bounds([obj])
    center = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    obj.data.transform(Matrix.Translation(-center))
    count = triangles([obj])
    if count > 16000:
        modifier = obj.modifiers.new("MobileRetopologyBudget", "DECIMATE")
        modifier.ratio = 16000 / count
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for image in bpy.data.images:
        if image.type == "IMAGE" and max(image.size) > 1024:
            factor = 1024 / max(image.size)
            image.scale(max(1, round(image.size[0] * factor)), max(1, round(image.size[1] * factor)))
            image.pack()
    obj.name = "SourceTemplate_" + slug
    low, high = world_bounds([obj])
    report["sourceModels"].append({"id": "polyhaven-" + slug.replace("_", "-"),
        "sourceUrl": "https://polyhaven.com/a/" + slug,
        "license": "CC0-1.0", "sourceTriangles": count, "deliveredTriangles": triangles([obj])})
    return obj, high - low


def replace_groups(name, objects, report):
    for expression, slug, kind in REPLACEMENTS.get(name, []):
        groups = {}
        for obj in objects:
            match = re.match(expression, obj.name)
            if match:
                groups.setdefault(match.group(1), []).append(obj)
        if name == "stylized_cafe_interior" and kind == "plant":
            for obj in objects:
                match = re.match(r"^CafePlant_Pot_(\d+)$", obj.name)
                if match:
                    groups.setdefault("CafePlant_" + match.group(1), []).append(obj)
        if not groups:
            raise ValueError("Expected replacement group missing: " + expression)
        prototype, dimensions = load_template(slug, report)
        for label, group in groups.items():
            low, high = world_bounds(group)
            footprint = high - low
            location = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
            angle = 0
            if kind == "chair":
                seat = next((obj for obj in group if "SeatCushion" in obj.name), None)
                back = next((obj for obj in group if "BackCushion" in obj.name), None)
                if seat and back:
                    # Imported source chair faces -Y; its back therefore points +Y.
                    backward = back.matrix_world.translation - seat.matrix_world.translation
                    angle = math.atan2(-backward.x, backward.y)
                    location.x, location.y = seat.matrix_world.translation.x, seat.matrix_world.translation.y
            replacement = bpy.data.objects.new("Refined_" + label, prototype.data)
            bpy.context.collection.objects.link(replacement)
            if kind in {"chair", "stool-chair"}:
                width = 0.66 if kind == "chair" else 0.58
                replacement.scale = (width / dimensions.x, width / dimensions.y, 0.92 / dimensions.z)
            elif kind == "plant":
                factor = min(max(footprint.z, 0.8), 2.0) / dimensions.z
                replacement.scale = (factor, factor, factor)
            else:
                replacement.scale = tuple(max(0.15, footprint[i]) / dimensions[i] for i in range(3))
            replacement.rotation_euler.z = angle
            replacement.location = location
            objects.append(replacement)
            for obj in group:
                objects.remove(obj)
                bpy.data.objects.remove(obj, do_unlink=True)
            report["replacements"].append({"group": label, "source": slug, "removedNodes": len(group)})
        bpy.data.objects.remove(prototype, do_unlink=True)
    return objects


def surface_for(material_name):
    name = material_name.lower()
    if name in {"cafe_terrazzofloor", "subway_platformdetail", "conveniencestore_tiledetail"}:
        return "marble_01", True, 0.65
    if name == "subway_warmtile":
        return "white_plaster_02", False, 0.8
    if name == "alchemist_stonedetail":
        return "medieval_blocks_03", True, 0.65
    if name == "hanok_charcoalrooftile":
        return "concrete_floor_02", False, 1.4
    if "concretefloor" in name:
        return "concrete_floor_02", True, 0.7
    if name == "hospital_seamlessfloor":
        return "concrete_floor_02", False, 0.65
    if any(token in name for token in ["glow", "light", "glass", "sign", "display", "screen", "water", "neon", "product_"]):
        return None
    if any(token in name for token in ["oak", "walnut", "birch", "timber", "wood"]):
        return "wood_table_001", True, 0.85
    if "brick" in name:
        return "red_brick_03", True, 1.3
    if any(token in name for token in ["plaster", "warmwall", "mintwall", "ochreplaster"]):
        return "white_plaster_02", False, 0.8
    if any(token in name for token in ["upholstery", "textile", "privacy", "canvas", "cloth", "commandseat"]):
        return "denmin_fabric_02", False, 2.8
    if "asphalt" in name:
        return "asphalt_02", True, 0.7
    if any(token in name for token in ["courtyard", "earth", "mossystone"]):
        return "coast_sand_rocks_02", True, 0.65
    if any(token in name for token in ["limestone", "foundationstone", "darkstone"]):
        return "medieval_blocks_03", True, 0.7
    if any(token in name for token in ["floor", "tile", "terrazzo"]):
        return "floor_tiles_06", True, 0.7
    if any(token in name for token in ["concrete", "stonecounter"]):
        return "concrete_floor_02", True, 0.65
    if any(token in name for token in ["steel", "metal", "panel", "hull", "deck", "iron", "brass"]):
        return "metal_plate", False, 1.2
    if "leather" in name:
        return "brown_leather", False, 2
    return None


def finish_cafe_wall_joints(objects, report):
    for label, location, dimensions, material_name in [
        ("LeftBase", (-4.31, 0, 0.22), (0.10, 6.86, 0.20), "Cafe_Cream"),
        ("RightBase", (4.31, 0, 0.22), (0.10, 6.86, 0.20), "Cafe_Cream"),
        ("BackBase", (0, 3.31, 0.22), (8.70, 0.10, 0.20), "Cafe_Cream"),
        ("LeftEnd", (-4.43, -3.49, 1.8), (0.16, 0.06, 3.60), "Cafe_MintWall"),
        ("RightEnd", (4.43, -3.49, 1.8), (0.16, 0.06, 3.60), "Cafe_MintWall"),
        ("LeftCorner", (-4.42, 3.42, 1.8), (0.18, 0.18, 3.60), "Cafe_MintWall"),
        ("RightCorner", (4.42, 3.42, 1.8), (0.18, 0.18, 3.60), "Cafe_MintWall"),
    ]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=location)
        obj = bpy.context.object
        obj.name = "CafeWallFinish_" + label
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel = obj.modifiers.new("ArchitecturalEdge", "BEVEL")
        bevel.width = 0.006
        bevel.segments = 2
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        obj.data.materials.append(bpy.data.materials[material_name])
        objects.append(obj)
    report["structuralImprovements"].append({"kind": "closed-wall-joints-and-baseboards", "parts": 7})


def refine_hospital_curtains(objects, report):
    curtains = [obj for obj in objects if re.match(r"^PrivacyCurtain_\d+_\d+$", obj.name)]
    for original in curtains:
        bay, panel = map(int, re.findall(r"\d+", original.name))
        low, high = world_bounds([original])
        center = (bay - 2) * 4.05
        side = -1 if panel <= 3 else 1
        offset = (panel - 1) % 3
        x = center + side * (1.5 - offset * 0.19)
        width = 0.23
        y = (low.y + high.y) / 2
        vertices = []
        faces = []
        for row in range(7):
            v = row / 6
            for column in range(25):
                u = column / 24
                ripple = 0.023 * math.sin(u * math.pi * 6) * (0.78 + 0.22 * v)
                vertices.append((x + width * (u - 0.5), y + ripple,
                    low.z + (high.z - low.z) * v + 0.008 * math.cos(u * math.pi * 6) * (1 - v)))
        for row in range(6):
            for column in range(24):
                a = row * 25 + column
                faces.append((a, a + 1, a + 26, a + 25))
        mesh = bpy.data.meshes.new(original.name + "_PleatedFabric")
        mesh.from_pydata(vertices, [], faces)
        mesh.materials.append(original.data.materials[0])
        curtain = bpy.data.objects.new(original.name + "_PleatedFabric", mesh)
        bpy.context.collection.objects.link(curtain)
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        objects.append(curtain)
        objects.remove(original)
        bpy.data.objects.remove(original, do_unlink=True)
        ring = bpy.data.objects.get("PrivacyRing_" + str(bay) + "_" + str(panel))
        if ring:
            ring.location.x = x
    report["structuralImprovements"].append({"kind": "gathered-pleated-privacy-curtains", "panels": len(curtains),
        "purpose": "Expose the original beds and nurse station while preserving privacy rails and movable fabric"})


def pbr_image(slug, channel, cache):
    key = (slug, channel)
    if key in cache:
        return cache[key]
    folder = source_folder(slug)
    if channel == "base":
        path = folder / (slug + ".webp")
    else:
        candidates = sorted(folder.glob(slug + "_" + channel + "_2k.*"))
        if not candidates:
            raise ValueError("Missing licensed PBR channel: " + str(folder) + "/" + channel)
        path = candidates[0]
    image = bpy.data.images.load(str(path), check_existing=True)
    if channel != "base":
        image.colorspace_settings.name = "Non-Color"
    maximum = 1024 if channel == "base" else 512
    if max(image.size) > maximum:
        ratio = maximum / max(image.size)
        image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
    texture_output = ARTIFACTS / "textures" / bpy.context.scene.name
    texture_output.mkdir(parents=True, exist_ok=True)
    image.file_format = "PNG"
    image.filepath_raw = str(texture_output / (slug + "_" + channel + ".png"))
    image.save()
    image.pack()
    cache[key] = image
    return image


def add_pbr(material, slug, replace_color, cache):
    bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return False
    links = material.node_tree.links
    nodes = material.node_tree.nodes
    for channel, socket in [("rough", "Roughness"), ("nor_gl", None)] + ([("base", "Base Color")] if replace_color else []):
        image = pbr_image(slug, channel, cache)
        texture = nodes.new("ShaderNodeTexImage")
        texture.name = "CC0_" + slug + "_" + channel
        texture.image = image
        texture.extension = "REPEAT"
        if socket:
            for link in list(bsdf.inputs[socket].links):
                links.remove(link)
            links.new(texture.outputs["Color"], bsdf.inputs[socket])
        else:
            normal = nodes.new("ShaderNodeNormalMap")
            normal.inputs["Strength"].default_value = 0.32 if replace_color else 0.16
            links.new(texture.outputs["Color"], normal.inputs["Color"])
            links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    if replace_color:
        bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    return True


def projected_uv(obj, material_scales):
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name="PBR_MetreProjection")
    normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
    for polygon in mesh.polygons:
        material = mesh.materials[polygon.material_index] if polygon.material_index < len(mesh.materials) else None
        scale = material_scales.get(material.name if material else "")
        if scale is None:
            continue
        normal = normal_matrix @ polygon.normal
        axis = max(range(3), key=lambda i: abs(normal[i]))
        a, b = ((1, 2), (0, 2), (0, 1))[axis]
        for loop_index in polygon.loop_indices:
            position = obj.matrix_world @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (position[a] * scale, position[b] * scale)


def refine_surfaces(objects, original_materials, report):
    cache = {}
    scales = {}
    roof_steel = bpy.data.materials.get("SchoolRoof_GalvanizedSteel")
    if roof_steel:
        housing = roof_steel.copy()
        housing.name = "SchoolRoof_HVACPaintedMetal"
        original_materials.append(housing)
        for obj in objects:
            if obj.name.startswith("HVAC_"):
                for index, material in enumerate(obj.data.materials):
                    if material and material.name == "SchoolRoof_Concrete":
                        obj.data.materials[index] = housing
    for material in original_materials:
        if not material.use_nodes:
            material.use_nodes = True
        bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf:
            emission = bsdf.inputs.get("Emission Strength")
            if emission and emission.default_value > 1.4:
                report["emissionClamps"].append({"material": material.name, "from": emission.default_value, "to": 1.4})
                emission.default_value = 1.4
        # Existing baked platform/shop/stone detail must keep its authored UVs.
        replace_legacy_detail = material.name in {
            "Subway_PlatformDetail", "Alchemist_StoneDetail", "ConvenienceStore_TileDetail",
        }
        if not replace_legacy_detail and any(node.type == "TEX_IMAGE" for node in material.node_tree.nodes):
            continue
        recipe = surface_for(material.name)
        if recipe and add_pbr(material, recipe[0], recipe[1], cache):
            scales[material.name] = recipe[2]
            report["surfaces"].append({"material": material.name, "source": recipe[0],
                "sourceUrl": "https://polyhaven.com/a/" + recipe[0], "license": "CC0-1.0",
                "baseColorReplaced": recipe[1], "normalMap": True, "roughnessMap": True})
    for obj in objects:
        if not obj.name.startswith("Refined_"):
            projected_uv(obj, scales)


def combine_original_by_material(objects):
    # Retain imported replacement geometry separately; merge original surfaces to
    # make room for authored replacements within the 256-node/draw-call profile.
    groups = {}
    for obj in objects:
        if obj.name.startswith("Refined_"):
            continue
        signature = tuple(mat.name if mat else "" for mat in obj.data.materials)
        groups.setdefault(signature, []).append(obj)
    for signature, group in groups.items():
        if len(group) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in group:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        bpy.context.object.name = "RefinedSurface_" + (signature[0] if signature else "Unassigned")


def glb_metrics(path):
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    primitive_triangles = []
    for mesh in doc.get("meshes", []):
        count = 0
        for primitive in mesh["primitives"]:
            accessor = doc["accessors"][primitive.get("indices", primitive["attributes"]["POSITION"])]
            count += accessor["count"] // 3
        primitive_triangles.append(count)
    counts = {"bytes": len(data), "nodes": len(doc.get("nodes", [])),
        "triangles": sum(primitive_triangles[node["mesh"]] for node in doc.get("nodes", []) if "mesh" in node),
        "drawCalls": sum(len(doc["meshes"][node["mesh"]]["primitives"]) for node in doc.get("nodes", []) if "mesh" in node),
        "materials": len(doc.get("materials", [])), "textures": len(doc.get("textures", [])),
        "images": len(doc.get("images", []))}
    limits = {"bytes": 64 * 1024 * 1024, "nodes": 256, "triangles": 500000,
        "drawCalls": 256, "materials": 128, "textures": 64}
    for metric, limit in limits.items():
        if counts[metric] > limit:
            raise ValueError("Mobile budget exceeded: " + metric + "=" + str(counts[metric]))
    for image in doc.get("images", []):
        if image.get("uri") or image.get("mimeType") not in {"image/png", "image/jpeg"}:
            raise ValueError("All PBR channels must be embedded core PNG/JPEG images")
    return counts, hashlib.sha256(data).hexdigest()


def build(name, args):
    reset_scene()
    bpy.context.scene.name = name
    report = {"name": name, "revision": 6, "source": str(SOURCE / (name + ".glb")),
        "replacements": [], "sourceModels": [], "surfaces": [], "emissionClamps": [],
        "structuralImprovements": [],
        "license": "CC0-1.0", "originalFilePreserved": True,
        "allAnglesArtisticallyApproved": False, "studioRuntimeVerified": False}
    objects = import_glb(SOURCE / (name + ".glb"))
    original_materials = list(bpy.data.materials)
    report["beforeTriangles"] = triangles(objects)
    review_setup(name, args.resolution, args.samples)
    if not args.skip_render:
        render(ARTIFACTS / (name + "-before.png"))
    objects = replace_groups(name, objects, report)
    if name == "stylized_cafe_interior":
        finish_cafe_wall_joints(objects, report)
    if name == "hospital_emergency_nurse_station":
        refine_hospital_curtains(objects, report)
    refine_surfaces(objects, original_materials, report)
    bpy.context.view_layer.update()
    low, high = world_bounds(objects)
    report["bounds"] = [high.x - low.x, high.z - low.z, high.y - low.y]
    combine_original_by_material(objects)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    output = OUTPUT / (name + ".glb")
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
        export_cameras=False, export_lights=False, export_animations=False, export_yup=True,
        export_image_format="AUTO", export_extras=False)
    metrics, digest = glb_metrics(output)
    report.update({"metrics": metrics, "sha256": "sha256:" + digest,
        "url": "/assets/3d/environments/refined-v6/" + name + ".glb",
        "thumbnailUrl": "/assets/3d/environments/refined-v6/thumbnails/" + name + ".png"})
    if not args.skip_render:
        render(OUTPUT / "thumbnails" / (name + ".png"))
        bpy.data.images["Render Result"].save_render(str(ARTIFACTS / (name + "-after.png")))
    (ARTIFACTS / (name + ".json")).write_text(json.dumps(report, indent=2) + "\n")
    print("ENVIRONMENT_REFINED " + json.dumps({"name": name, "metrics": metrics,
        "replacements": len(report["replacements"]), "surfaces": len(report["surfaces"])}), flush=True)


def write_delivery_manifest():
    records = []
    for name in CAMERAS:
        report_path = ARTIFACTS / (name + ".json")
        if not report_path.exists():
            return
        report = json.loads(report_path.read_text())
        sources = sorted({entry["sourceUrl"] for entry in report["sourceModels"] + report["surfaces"]})
        records.append({"fileName": name + ".glb", "byteSize": report["metrics"]["bytes"],
            "sha256": report["sha256"], "url": report["url"], "thumbnailUrl": report["thumbnailUrl"],
            "bounds": report["bounds"], "sources": sources,
            "sourceByteSize": (SOURCE / (name + ".glb")).stat().st_size,
            "metrics": report["metrics"], "replacedGroups": len(report["replacements"]),
            "refinedSurfaces": len(report["surfaces"]), "reviewLevel": "single-view-blender-preview",
            "allAnglesArtisticallyApproved": False, "studioRuntimeVerified": False})
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "schema": "toonspectrum.environment-refinement.v6", "records": records,
    }, indent=2) + "\n")
    sources = sorted({source for record in records for source in record["sources"]})
    (OUTPUT / "LICENSES.md").write_text(
        "# Refined Studio environments v6\n\n"
        "Original scene layout and refinement: ToonSpectrum. Licensed CC0 1.0.\n"
        "Embedded source models and PBR textures: Poly Haven, CC0 1.0.\n"
        "License: https://creativecommons.org/publicdomain/zero/1.0/\n\n"
        "Source assets remain available under their original immutable URLs.\n"
        "Review images are single-camera Blender previews, not all-angle or Studio runtime approval.\n\n"
        + "\n".join("- " + source for source in sources) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenes", default="all")
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--resolution", type=int, default=1000)
    parser.add_argument("--skip-render", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    names = list(CAMERAS) if args.scenes == "all" else args.scenes.split(",")
    for name in names:
        if name not in CAMERAS:
            raise ValueError("Unknown source environment: " + name)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "thumbnails").mkdir(exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    for name in names:
        build(name, args)
    write_delivery_manifest()


if __name__ == "__main__":
    main()
