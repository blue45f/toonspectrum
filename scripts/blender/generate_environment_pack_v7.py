"""Generate three original ToonSpectrum webtoon-ready BG3D Wave 7 assets.

The models are reconstructed from visually reviewed free-generator previews, but
contain only original procedural geometry authored by this script. No external
model, image, font, or runtime resource is embedded. Outputs are metre-authored,
self-contained GLB files released under CC0-1.0.

Example:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python scripts/blender/generate_environment_pack_v7.py
"""
from __future__ import annotations

import argparse
import importlib.util
from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector

GENERATOR = "scripts/blender/generate_environment_pack_v7.py"
GENERATOR_VERSION = "7.0.0-blender-5.2"
CC0_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
ASSETS = (
    "webtoon_rooftop_utility_platform",
    "webtoon_corner_store_facade",
    "webtoon_street_prop_pack",
)


def parse_arguments():
    script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        default="apps/web/public/assets/3d/environments/webtoon-v7",
    )
    parser.add_argument("--thumbnail-dir", default=None)
    parser.add_argument("--only", choices=ASSETS, action="append")
    parser.add_argument("--skip-thumbnails", action="store_true")
    return parser.parse_args(script_args)


ARGS = parse_arguments()
OUTPUT_DIRECTORY = Path(bpy.path.abspath(ARGS.output_dir)).resolve()
THUMBNAIL_DIRECTORY = Path(
    bpy.path.abspath(ARGS.thumbnail_dir)
    if ARGS.thumbnail_dir
    else OUTPUT_DIRECTORY / "thumbnails"
).resolve()

# Reuse the audited primitive/material helpers without executing Wave 5's main.
_BASE = Path(__file__).with_name("generate_environment_pack_v5.py")
_original_argv = list(sys.argv)
sys.argv = [str(_BASE)]
try:
    _spec = importlib.util.spec_from_file_location("toonspectrum_wave5_helpers", _BASE)
    if _spec is None or _spec.loader is None:
        raise RuntimeError(f"Unable to load helper module: {_BASE}")
    _wave5 = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_wave5)
finally:
    sys.argv = _original_argv

clear_scene = _wave5.clear_scene
material = _wave5.material
textured_material = _wave5.textured_material
box = _wave5.box
cylinder = _wave5.cylinder
cone = _wave5.cone
sphere = _wave5.sphere
torus = _wave5.torus
rod = _wave5.rod
tube_path = _wave5.tube_path
consolidate_repeated_meshes = _wave5.consolidate_repeated_meshes


def rail_run(prefix, start, end, height, metal, *, posts=8, radius=0.035):
    sx, sy, sz = start
    ex, ey, ez = end
    rod(f"{prefix}_Top", (sx, sy, sz + height), (ex, ey, ez + height), radius, metal)
    rod(
        f"{prefix}_Mid",
        (sx, sy, sz + height * 0.52),
        (ex, ey, ez + height * 0.52),
        radius * 0.78,
        metal,
    )
    for index in range(posts + 1):
        ratio = index / posts
        x = sx + (ex - sx) * ratio
        y = sy + (ey - sy) * ratio
        z = sz + (ez - sz) * ratio
        rod(
            f"{prefix}_Post_{index + 1}",
            (x, y, z),
            (x, y, z + height),
            radius,
            metal,
        )


def fan_grille(prefix, center, radius, frame_mat, blade_mat):
    x, y, z = center
    torus(
        f"{prefix}_Ring",
        radius,
        0.026,
        center,
        frame_mat,
        rotation=(pi / 2, 0, 0),
        major_segments=48,
        minor_segments=10,
    )
    cylinder(
        f"{prefix}_Hub",
        radius * 0.14,
        0.065,
        center,
        frame_mat,
        vertices=32,
        rotation=(pi / 2, 0, 0),
    )
    for index in range(7):
        angle = index * 2 * pi / 7
        tip = (
            x + cos(angle) * radius * 0.70,
            y - 0.012,
            z + sin(angle) * radius * 0.70,
        )
        middle = (
            x + cos(angle + 0.34) * radius * 0.42,
            y - 0.018,
            z + sin(angle + 0.34) * radius * 0.42,
        )
        tube_path(
            f"{prefix}_Blade_{index + 1}",
            [center, middle, tip],
            radius * 0.055,
            blade_mat,
            resolution=2,
        )
    for index in range(4):
        angle = index * pi / 2 + pi / 4
        px = x + cos(angle) * radius * 1.09
        pz = z + sin(angle) * radius * 1.09
        cylinder(
            f"{prefix}_Bolt_{index + 1}",
            radius * 0.035,
            0.04,
            (px, y - 0.028, pz),
            frame_mat,
            vertices=12,
            rotation=(pi / 2, 0, 0),
        )


def vent_slats(prefix, origin, width, height, depth, mat, *, columns=7):
    x, y, z = origin
    step = width / max(columns, 1)
    for index in range(columns):
        px = x - width / 2 + step * (index + 0.5)
        box(
            f"{prefix}_Slat_{index + 1}",
            (step * 0.52, depth, height),
            (px, y, z),
            mat,
            edge=min(0.008, step * 0.18),
        )


def add_root_and_export(asset_id, dimensions, semantic_parts):
    root = bpy.data.objects.new(f"TS_ENV_{asset_id}_Root", None)
    root.empty_display_type = "CUBE"
    root["asset_id"] = f"ts-bg3d-{asset_id}-v7"
    root["asset_type"] = "studio-bg3d-environment"
    root["asset_author"] = "ToonSpectrum"
    root["asset_generator"] = GENERATOR
    root["asset_generator_version"] = GENERATOR_VERSION
    root["asset_license"] = "CC0-1.0"
    root["asset_license_url"] = CC0_LICENSE_URL
    root["units"] = "metres"
    root["ground_plane"] = "glTF-Y=0"
    root["ground_y_m"] = 0.0
    root["nominal_width_m"] = dimensions[0]
    root["nominal_depth_m"] = dimensions[1]
    root["nominal_height_m"] = dimensions[2]
    root["semantic_parts"] = semantic_parts
    root["embedded_texture_count"] = 2
    root["embedded_texture_max_dimension"] = 128
    root["reference_workflow"] = "free-generator-preview-reviewed, original-procedural-rebuild"
    bpy.context.scene.collection.objects.link(root)
    for obj in tuple(bpy.context.scene.objects):
        if obj is not root and obj.type in {"MESH", "CURVE", "FONT"} and obj.parent is None:
            obj.parent = root
    bpy.context.scene["toonspectrum_asset_id"] = f"ts-bg3d-{asset_id}-v7"
    destination = OUTPUT_DIRECTORY / f"{asset_id}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format="GLB",
        export_apply=True,
        export_extras=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    print(f"Exported {asset_id}: {destination}")


def render_thumbnail(
    asset_id,
    camera_location,
    camera_target,
    *,
    world=(0.035, 0.045, 0.065, 1.0),
    key_color=(1.0, 0.82, 0.68),
    fill_color=(0.32, 0.56, 1.0),
    energy=1750,
    sun_energy=1.1,
    lens=48,
):
    if ARGS.skip_thumbnails:
        return
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.filepath = str(THUMBNAIL_DIRECTORY / f"{asset_id}.png")
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = world
    background.inputs["Strength"].default_value = 0.42

    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.active_object
    camera.name = f"PreviewCamera_{asset_id}"
    camera.data.lens = lens
    camera.rotation_euler = (Vector(camera_target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(4.6, -4.8, 8.2))
    key = bpy.context.active_object
    key.name = "Preview_Key_Area"
    key.data.energy = energy
    key.data.color = key_color
    key.data.shape = "DISK"
    key.data.size = 6.8
    key.rotation_euler = (Vector(camera_target) - key.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.light_add(type="AREA", location=(-4.8, -1.2, 5.6))
    fill = bpy.context.active_object
    fill.name = "Preview_Fill_Area"
    fill.data.energy = energy * 0.58
    fill.data.color = fill_color
    fill.data.size = 7.2
    fill.rotation_euler = (Vector(camera_target) - fill.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.light_add(type="AREA", location=(0.0, 5.0, 6.8))
    rim = bpy.context.active_object
    rim.name = "Preview_Rim_Area"
    rim.data.energy = energy * 0.42
    rim.data.color = (0.58, 0.76, 1.0)
    rim.data.size = 5.0
    rim.rotation_euler = (Vector(camera_target) - rim.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.light_add(type="SUN", location=(0, 0, 8))
    sun = bpy.context.active_object
    sun.name = "Preview_Rim_Sun"
    sun.data.energy = sun_energy
    sun.rotation_euler = (0.48, -0.58, -0.34)
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {asset_id}: {scene.render.filepath}")


def build_webtoon_rooftop_utility_platform():
    clear_scene()
    concrete = textured_material(
        "RooftopConcrete",
        (0.36, 0.39, 0.42),
        (0.18, 0.20, 0.23),
        "platform",
        roughness=0.78,
    )
    steel = material("UtilitySteel", (0.24, 0.28, 0.32), metallic=0.82, roughness=0.32)
    steel_light = material("GalvanizedSteel", (0.61, 0.66, 0.70), metallic=0.78, roughness=0.27)
    tank_mat = material("TankPaint", (0.76, 0.80, 0.82), metallic=0.28, roughness=0.37)
    tank_dark = material("TankBands", (0.22, 0.26, 0.29), metallic=0.72, roughness=0.30)
    ac_shell = material("ACShell", (0.70, 0.73, 0.72), metallic=0.18, roughness=0.42)
    fan_dark = material("ACFan", (0.12, 0.15, 0.17), metallic=0.58, roughness=0.33)
    safety_yellow = material("SafetyYellow", (0.92, 0.62, 0.08), metallic=0.35, roughness=0.39)
    cable = material("CableRubber", (0.035, 0.045, 0.055), roughness=0.62)
    glass = material("GaugeGlass", (0.20, 0.62, 0.82), roughness=0.12, transmission=0.55, alpha=0.72)

    box("Rooftop_Slab", (6.0, 4.8, 0.20), (0, 0, 0.10), concrete, edge=0.035)
    box("Rooftop_Curb_Back", (6.0, 0.18, 0.38), (0, 2.31, 0.29), concrete, edge=0.025)
    box("Rooftop_Curb_Right", (0.18, 4.45, 0.38), (2.91, 0.08, 0.29), concrete, edge=0.025)

    # Water-tank support frame.
    frame_x = (-1.95, 0.20)
    frame_y = (-0.25, 1.72)
    for x in frame_x:
        for y in frame_y:
            box(f"TankFrame_Leg_{x}_{y}", (0.12, 0.12, 1.88), (x, y, 1.14), steel, edge=0.018)
            box(f"TankFrame_Foot_{x}_{y}", (0.30, 0.30, 0.06), (x, y, 0.24), tank_dark, edge=0.012)
    for z in (0.52, 2.02):
        for y in frame_y:
            rod(f"TankFrame_X_{z}_{y}", (frame_x[0], y, z), (frame_x[1], y, z), 0.065, steel)
        for x in frame_x:
            rod(f"TankFrame_Y_{z}_{x}", (x, frame_y[0], z), (x, frame_y[1], z), 0.065, steel)
    for y in frame_y:
        rod(f"TankFrame_BraceA_{y}", (frame_x[0], y, 0.50), (frame_x[1], y, 2.02), 0.045, steel)
        rod(f"TankFrame_BraceB_{y}", (frame_x[1], y, 0.50), (frame_x[0], y, 2.02), 0.045, steel)

    tank_center = (-0.88, 0.74, 3.00)
    cylinder("WaterTank_Body", 0.96, 1.62, tank_center, tank_mat, vertices=64, edge=0.025)
    for z in (2.22, 2.57, 3.00, 3.43, 3.78):
        torus("WaterTank_Band", 0.96, 0.035, (-0.88, 0.74, z), tank_dark, major_segments=64, minor_segments=10)
    cone("WaterTank_Top", 0.96, 0.72, 0.22, (-0.88, 0.74, 3.92), tank_mat, vertices=64, edge=0.02)
    cylinder("WaterTank_Hatch", 0.22, 0.14, (-0.88, 0.74, 4.10), tank_dark, vertices=36, edge=0.012)
    torus("WaterTank_HatchHandle", 0.13, 0.018, (-0.88, 0.74, 4.19), steel_light, rotation=(0, 0, 0), major_segments=28)
    cylinder("WaterTank_Gauge", 0.095, 0.045, (-0.88, -0.245, 3.08), glass, vertices=32, rotation=(pi / 2, 0, 0))
    rod("WaterTank_Inlet", (-1.63, 0.74, 3.78), (-2.18, 0.74, 3.78), 0.07, steel_light)
    tube_path("WaterTank_Outlet", [(-0.25, 0.74, 2.55), (0.45, 0.74, 2.55), (0.45, 0.10, 0.35)], 0.065, steel_light)
    tube_path("WaterTank_Drain", [(-1.46, 0.74, 2.38), (-2.32, 0.74, 2.38), (-2.32, 1.78, 0.35)], 0.042, steel_light)

    # Access ladder with safety hoops.
    for x in (-2.22, -1.78):
        rod(f"TankLadder_Rail_{x}", (x, -0.31, 0.30), (x, -0.31, 3.78), 0.035, safety_yellow)
    for index in range(12):
        z = 0.48 + index * 0.285
        rod(f"TankLadder_Rung_{index + 1}", (-2.22, -0.31, z), (-1.78, -0.31, z), 0.025, safety_yellow)
    for index, z in enumerate((2.58, 3.05, 3.52), 1):
        torus(f"TankLadder_Hoop_{index}", 0.43, 0.022, (-2.00, -0.31, z), safety_yellow, rotation=(pi / 2, 0, 0), major_segments=32)

    # Two detailed AC outdoor units.
    for index, x in enumerate((1.15, 2.10), 1):
        box(f"AC_{index}_Body", (0.82, 0.62, 0.82), (x, -1.18, 0.75), ac_shell, edge=0.055)
        box(f"AC_{index}_Top", (0.90, 0.68, 0.065), (x, -1.18, 1.195), steel_light, edge=0.018)
        fan_grille(f"AC_{index}_Fan", (x, -1.505, 0.78), 0.28, fan_dark, fan_dark)
        vent_slats(f"AC_{index}_Vent", (x, -0.855, 0.78), 0.62, 0.54, 0.025, fan_dark, columns=8)
        for sx in (-1, 1):
            box(f"AC_{index}_Foot_{sx}", (0.20, 0.12, 0.08), (x + sx * 0.25, -1.18, 0.28), steel, edge=0.012)
        tube_path(f"AC_{index}_Copper", [(x + 0.36, -0.86, 0.55), (2.58, -0.86, 0.55), (2.58, 0.15, 0.34)], 0.024, steel_light)

    # Electrical cabinet and conduits.
    box("Electrical_Cabinet", (0.88, 0.42, 1.42), (1.85, 1.30, 1.02), steel_light, edge=0.035)
    box("Electrical_Cabinet_Door", (0.78, 0.055, 1.24), (1.85, 1.075, 1.02), ac_shell, edge=0.025)
    cylinder("Electrical_Door_Handle", 0.035, 0.075, (2.12, 1.035, 1.02), tank_dark, vertices=18, rotation=(pi / 2, 0, 0))
    for index in range(4):
        cylinder(f"Electrical_Indicator_{index + 1}", 0.035, 0.03, (1.62 + index * 0.15, 1.03, 1.42), glass, vertices=20, rotation=(pi / 2, 0, 0))
    for index, y in enumerate((1.12, 1.30, 1.48), 1):
        tube_path(f"Conduit_{index}", [(2.30, y, 0.34), (2.60, y, 0.34), (2.60, y, 1.52)], 0.032, steel_light)
    tube_path("PowerCable", [(1.42, 1.08, 0.55), (0.70, 1.02, 0.45), (0.68, -0.30, 0.35)], 0.025, cable)

    rail_run("RooftopRail_Back", (-2.75, 2.18, 0.38), (2.75, 2.18, 0.38), 1.12, safety_yellow, posts=10)
    rail_run("RooftopRail_Right", (2.76, -2.10, 0.38), (2.76, 2.18, 0.38), 1.12, safety_yellow, posts=8)

    consolidate_repeated_meshes(
        "webtoon_rooftop_utility_platform",
        (
            "Rooftop_Slab",
            "WaterTank_Body",
            "AC_1_Body",
            "AC_2_Body",
            "Electrical_Cabinet",
            "TankLadder_Rail_-2.22",
            "RooftopRail_Back_Top",
        ),
    )
    add_root_and_export(
        "webtoon_rooftop_utility_platform",
        (6.0, 4.8, 4.32),
        "rooftop-slab,water-tank,steel-support-frame,access-ladder,two-outdoor-ac-units,electrical-cabinet,pipe-network,safety-railings",
    )
    render_thumbnail(
        "webtoon_rooftop_utility_platform",
        (8.4, -9.6, 7.0),
        (0.0, 0.10, 1.75),
        world=(0.035, 0.055, 0.080, 1.0),
        key_color=(1.0, 0.75, 0.52),
        fill_color=(0.32, 0.55, 1.0),
        lens=52,
    )


def build_webtoon_corner_store_facade():
    clear_scene()
    pavement = textured_material(
        "StorePavement",
        (0.28, 0.30, 0.32),
        (0.12, 0.14, 0.16),
        "platform",
        roughness=0.82,
    )
    plaster = material("StorePlaster", (0.72, 0.68, 0.60), roughness=0.72)
    charcoal = material("StoreCharcoal", (0.10, 0.12, 0.14), metallic=0.38, roughness=0.42)
    aluminium = material("StoreAluminium", (0.46, 0.50, 0.54), metallic=0.82, roughness=0.25)
    red = material("StoreAccentRed", (0.78, 0.11, 0.09), roughness=0.38)
    amber = material("StoreAmberLight", (1.0, 0.48, 0.08), roughness=0.22, emission=(1.0, 0.34, 0.06), emission_strength=4.0)
    cyan = material("StoreCyanLight", (0.04, 0.68, 0.82), roughness=0.20, emission=(0.03, 0.72, 1.0), emission_strength=3.0)
    glass = material("StoreGlass", (0.16, 0.26, 0.32), roughness=0.08, transmission=0.72, alpha=0.42)
    wood = material("StoreWood", (0.46, 0.24, 0.12), roughness=0.60)
    product_colors = [
        material("ProductMint", (0.12, 0.62, 0.52), roughness=0.45),
        material("ProductCream", (0.88, 0.77, 0.52), roughness=0.48),
        material("ProductBlue", (0.10, 0.33, 0.70), roughness=0.42),
    ]

    box("Store_Pavement", (7.6, 4.2, 0.18), (0, 0, 0.09), pavement, edge=0.025)
    box("Store_Curb", (7.6, 0.30, 0.28), (0, -1.96, 0.14), charcoal, edge=0.025)
    box("Store_BackWall", (7.30, 0.24, 4.20), (0, 1.48, 2.28), plaster, edge=0.035)
    box("Store_LeftReturn", (0.24, 3.12, 4.20), (-3.53, 0.02, 2.28), plaster, edge=0.035)
    box("Store_RoofParapet", (7.50, 0.45, 0.55), (0, 1.36, 4.45), charcoal, edge=0.045)
    box("Store_RoofCanopy", (7.40, 1.02, 0.17), (0, -0.02, 3.62), charcoal, edge=0.035)

    # Storefront structural grid and glazing.
    box("Store_Sill", (7.05, 0.26, 0.18), (0, 1.03, 0.31), charcoal, edge=0.025)
    box("Store_Header", (7.05, 0.26, 0.24), (0, 1.03, 3.10), charcoal, edge=0.025)
    for x in (-3.37, -2.15, -0.92, 0.38, 1.62, 2.80, 3.37):
        box(f"Store_Mullion_{x}", (0.105, 0.26, 2.72), (x, 1.03, 1.70), aluminium, edge=0.015)
    for index, (x, width) in enumerate(((-2.76, 1.08), (-1.54, 1.08), (-0.27, 1.20), (1.00, 1.08), (2.21, 1.08), (3.08, 0.46)), 1):
        box(f"Store_Glass_{index}", (width, 0.035, 2.52), (x, 0.885, 1.70), glass, edge=0.008)
    box("Store_Door", (1.08, 0.12, 2.54), (0.38, 0.79, 1.70), glass, edge=0.018)
    box("Store_DoorFrame", (1.20, 0.18, 0.12), (0.38, 0.76, 3.00), aluminium, edge=0.015)
    cylinder("Store_DoorHandle", 0.035, 0.72, (0.72, 0.67, 1.68), aluminium, vertices=20)

    # Sign fascia and awning ribs.
    box("Store_MainSign", (5.70, 0.34, 0.72), (-0.55, 0.95, 3.50), red, edge=0.055)
    box("Store_MainSignGlow", (4.90, 0.03, 0.18), (-0.55, 0.755, 3.50), amber, edge=0.02)
    box("Store_CornerLightbox", (0.78, 0.48, 1.15), (3.18, 0.79, 3.17), cyan, edge=0.06)
    for x in (-3.2, -2.1, -1.0, 0.1, 1.2, 2.3, 3.2):
        rod(f"Store_AwningRib_{x}", (x, -0.56, 3.56), (x, 0.44, 3.62), 0.028, aluminium)
    for x in (-2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7):
        sphere(f"Store_AwningLamp_{x}", 0.09, (x, -0.44, 3.42), amber, scale=(1.0, 1.0, 0.72), segments=24, rings=12)

    # Visible interior display shelves and products.
    for shelf_index, z in enumerate((0.62, 1.22, 1.82), 1):
        box(f"Store_DisplayShelf_{shelf_index}", (5.85, 0.58, 0.08), (-0.25, 1.20, z), wood, edge=0.018)
        for item_index in range(15):
            x = -2.95 + item_index * 0.39
            color = product_colors[(item_index + shelf_index) % len(product_colors)]
            if item_index % 3 == 0:
                cylinder(f"Store_Product_{shelf_index}_{item_index}", 0.075, 0.24, (x, 0.88, z + 0.16), color, vertices=18)
            else:
                box(f"Store_Product_{shelf_index}_{item_index}", (0.18, 0.18, 0.30), (x, 0.88, z + 0.19), color, edge=0.018)

    # Exterior vending machine with detailed product grid.
    box("Store_VendingBody", (0.92, 0.52, 1.92), (-2.84, -0.74, 1.20), aluminium, edge=0.055)
    box("Store_VendingWindow", (0.72, 0.035, 1.10), (-2.84, -1.02, 1.46), glass, edge=0.025)
    for row in range(4):
        for column in range(4):
            color = product_colors[(row + column) % len(product_colors)]
            cylinder(
                f"VendingCan_{row}_{column}",
                0.055,
                0.15,
                (-3.10 + column * 0.18, -1.05, 1.12 + row * 0.25),
                color,
                vertices=16,
            )
    box("Store_VendingPanel", (0.18, 0.04, 0.62), (-2.50, -1.03, 1.35), charcoal, edge=0.018)
    for index in range(3):
        cylinder(f"VendingButton_{index}", 0.035, 0.025, (-2.50, -1.06, 1.58 - index * 0.17), amber, vertices=18, rotation=(pi / 2, 0, 0))

    # Outdoor condenser, crates, bollards and wall services.
    box("Store_ACBody", (1.05, 0.55, 0.90), (2.62, -0.74, 0.73), aluminium, edge=0.045)
    fan_grille("Store_ACFan", (2.62, -1.03, 0.76), 0.31, charcoal, charcoal)
    vent_slats("Store_ACVent", (2.62, -0.45, 0.76), 0.76, 0.56, 0.03, charcoal, columns=9)
    for stack, x in enumerate((1.35, 1.88), 1):
        for level in range(2):
            box(f"Store_Crate_{stack}_{level}", (0.44, 0.42, 0.31), (x, -0.88, 0.38 + level * 0.31), wood, edge=0.03)
            for slat in range(3):
                box(f"Store_CrateSlat_{stack}_{level}_{slat}", (0.055, 0.045, 0.22), (x - 0.13 + slat * 0.13, -1.105, 0.38 + level * 0.31), charcoal, edge=0.008)
    for index, x in enumerate((-1.65, 0.95, 3.05), 1):
        cylinder(f"Store_Bollard_{index}", 0.085, 0.72, (x, -1.55, 0.54), charcoal, vertices=32, edge=0.02)
        torus(f"Store_BollardBand_{index}", 0.087, 0.018, (x, -1.55, 0.70), amber, major_segments=32)
    tube_path("Store_Conduit", [(3.18, 1.30, 0.40), (3.18, 1.30, 3.60), (2.50, 1.30, 3.60)], 0.038, aluminium)
    box("Store_MeterBox", (0.44, 0.18, 0.62), (2.85, 1.30, 2.55), aluminium, edge=0.025)

    consolidate_repeated_meshes(
        "webtoon_corner_store_facade",
        (
            "Store_Pavement",
            "Store_BackWall",
            "Store_LeftReturn",
            "Store_MainSign",
            "Store_Door",
            "Store_VendingBody",
            "Store_ACBody",
        ),
    )
    add_root_and_export(
        "webtoon_corner_store_facade",
        (7.6, 4.2, 4.73),
        "corner-facade,glazed-shopfront,sliding-door,lit-signage,awning,vending-machine,product-shelves,outdoor-ac,crates,bollards,service-conduit",
    )
    render_thumbnail(
        "webtoon_corner_store_facade",
        (10.6, -12.6, 7.8),
        (0.0, 0.22, 2.0),
        world=(0.018, 0.025, 0.045, 1.0),
        key_color=(1.0, 0.55, 0.34),
        fill_color=(0.20, 0.52, 1.0),
        energy=1850,
        lens=50,
    )


def build_webtoon_street_prop_pack():
    clear_scene()
    asphalt = textured_material(
        "StreetAsphalt",
        (0.20, 0.22, 0.24),
        (0.08, 0.09, 0.10),
        "platform",
        roughness=0.84,
    )
    dark_steel = material("StreetDarkSteel", (0.13, 0.16, 0.18), metallic=0.78, roughness=0.35)
    galvanized = material("StreetGalvanized", (0.50, 0.55, 0.58), metallic=0.82, roughness=0.29)
    wood = material("StreetWood", (0.39, 0.22, 0.12), roughness=0.64)
    concrete = material("StreetConcrete", (0.48, 0.47, 0.44), roughness=0.78)
    yellow = material("StreetSafetyYellow", (0.94, 0.62, 0.06), roughness=0.42)
    red = material("StreetHydrantRed", (0.70, 0.06, 0.05), metallic=0.35, roughness=0.40)
    green = material("StreetPlanterGreen", (0.12, 0.35, 0.18), roughness=0.68)
    leaf = material("StreetLeaves", (0.16, 0.46, 0.20), roughness=0.78)
    glow = material("StreetLampGlow", (1.0, 0.74, 0.28), roughness=0.18, emission=(1.0, 0.56, 0.16), emission_strength=5.0)
    cable_mat = material("StreetCable", (0.025, 0.03, 0.035), roughness=0.66)

    box("Street_DisplayBase", (7.4, 5.2, 0.16), (0, 0, 0.08), asphalt, edge=0.025)
    box("Street_CurbStrip", (7.4, 0.36, 0.30), (0, 2.38, 0.15), concrete, edge=0.025)

    # Utility pole with transformer and layered services.
    cylinder("UtilityPole_Base", 0.30, 0.16, (-2.55, 0.78, 0.24), concrete, vertices=40, edge=0.018)
    cylinder("UtilityPole_Shaft", 0.105, 4.35, (-2.55, 0.78, 2.34), dark_steel, vertices=40, edge=0.012)
    for z in (0.62, 1.85, 3.35, 4.30):
        torus("UtilityPole_Collar", 0.11, 0.012, (-2.55, 0.78, z), galvanized, major_segments=32)
    for arm_index, (z, length) in enumerate(((3.60, 1.28), (4.22, 1.60)), 1):
        box(f"UtilityPole_Crossarm_{arm_index}", (length, 0.13, 0.13), (-2.55, 0.78, z), wood, edge=0.025)
        for insulator_index, x in enumerate(
            (-2.55 - length * 0.36, -2.55, -2.55 + length * 0.36),
            1,
        ):
            cylinder(
                f"UtilityPole_Insulator_{arm_index}_{insulator_index}",
                0.055,
                0.20,
                (x, 0.78, z + 0.15),
                galvanized,
                vertices=24,
                edge=0.008,
            )
            torus(
                f"UtilityPole_InsulatorRing_{arm_index}_{insulator_index}",
                0.065,
                0.012,
                (x, 0.78, z + 0.18),
                galvanized,
                major_segments=24,
            )
    cylinder("UtilityPole_Transformer", 0.31, 0.72, (-2.10, 0.78, 3.12), galvanized, vertices=48, edge=0.018)
    cone("UtilityPole_TransformerTop", 0.31, 0.22, 0.14, (-2.10, 0.78, 3.55), galvanized, vertices=48, edge=0.012)
    box("UtilityPole_Junction", (0.48, 0.28, 0.62), (-2.22, 0.63, 1.62), galvanized, edge=0.035)
    for index in range(3):
        tube_path(
            f"UtilityCable_{index + 1}",
            [(-3.30, 0.78, 4.38 - index * 0.14), (-2.55, 0.78, 4.32 - index * 0.14), (-1.75, 0.78, 4.36 - index * 0.14), (-0.90, 0.90, 4.24 - index * 0.14)],
            0.018,
            cable_mat,
            resolution=2,
        )
    tube_path("Utility_DownCable", [(-2.18, 0.66, 3.06), (-2.18, 0.66, 2.18), (-2.22, 0.62, 1.92)], 0.026, cable_mat)

    # Arched street lamp.
    cylinder("StreetLamp_Base", 0.24, 0.12, (2.55, 0.85, 0.22), concrete, vertices=36, edge=0.015)
    cylinder("StreetLamp_Pole", 0.075, 3.58, (2.55, 0.85, 2.00), dark_steel, vertices=36, edge=0.010)
    tube_path("StreetLamp_Arm", [(2.55, 0.85, 3.78), (2.55, 0.82, 4.15), (2.18, 0.56, 4.34), (1.72, 0.38, 4.28)], 0.065, dark_steel)
    box("StreetLamp_Housing", (0.62, 0.28, 0.16), (1.68, 0.34, 4.18), dark_steel, edge=0.055, rotation=(0.0, -0.10, -0.05))
    box("StreetLamp_Lens", (0.48, 0.20, 0.04), (1.68, 0.30, 4.08), glow, edge=0.018, rotation=(0.0, -0.10, -0.05))

    # Slatted bench.
    for x in (-0.45, 0.75):
        box(f"Bench_Leg_{x}", (0.12, 0.65, 0.62), (x, 1.30, 0.48), dark_steel, edge=0.025)
        box(f"Bench_Foot_{x}", (0.42, 0.16, 0.08), (x, 1.30, 0.20), dark_steel, edge=0.020)
    for index in range(6):
        y = 1.02 + index * 0.11
        box(f"Bench_SeatSlat_{index}", (1.65, 0.085, 0.08), (0.15, y, 0.72 + index * 0.014), wood, edge=0.025)
    for index in range(5):
        z = 0.94 + index * 0.16
        box(f"Bench_BackSlat_{index}", (1.65, 0.08, 0.10), (0.15, 1.60, z), wood, edge=0.025, rotation=(0.12, 0, 0))
    for x in (-0.68, 0.98):
        tube_path(f"Bench_Arm_{x}", [(x, 1.03, 0.70), (x, 0.92, 1.02), (x, 1.30, 1.08)], 0.038, dark_steel)

    # Fire hydrant.
    cylinder("Hydrant_Base", 0.25, 0.12, (2.60, -1.55, 0.22), red, vertices=40, edge=0.016)
    cylinder("Hydrant_Body", 0.21, 0.72, (2.60, -1.55, 0.63), red, vertices=40, edge=0.018)
    cone("Hydrant_Cap", 0.25, 0.08, 0.28, (2.60, -1.55, 1.13), red, vertices=40, edge=0.018)
    cylinder("Hydrant_TopNut", 0.08, 0.12, (2.60, -1.55, 1.34), galvanized, vertices=8, edge=0.008)
    for x in (2.35, 2.85):
        cylinder("Hydrant_SideOutlet", 0.115, 0.16, (x, -1.55, 0.72), red, vertices=32, edge=0.015, rotation=(0, pi / 2, 0))
        cylinder("Hydrant_SideCap", 0.10, 0.08, (x + (-0.09 if x < 2.6 else 0.09), -1.55, 0.72), galvanized, vertices=12, edge=0.010, rotation=(0, pi / 2, 0))

    # Dual recycling bins.
    for index, x in enumerate((-0.88, -0.18), 1):
        cylinder(f"Bin_{index}_Body", 0.27, 0.78, (x, -1.45, 0.57), dark_steel, vertices=40, edge=0.025)
        torus(f"Bin_{index}_Rim", 0.27, 0.025, (x, -1.45, 0.98), galvanized, major_segments=40)
        cone(f"Bin_{index}_Lid", 0.29, 0.21, 0.17, (x, -1.45, 1.08), galvanized, vertices=40, edge=0.015)
        box(f"Bin_{index}_Label", (0.24, 0.025, 0.18), (x, -1.725, 0.64), yellow if index == 1 else green, edge=0.018)

    # Road barrier, signpost and planter.
    for x in (0.35, 1.55):
        cylinder(f"Barrier_Foot_{x}", 0.15, 0.08, (x, -1.48, 0.20), concrete, vertices=28, edge=0.012)
        rod(f"Barrier_Post_{x}", (x, -1.48, 0.22), (x, -1.48, 1.20), 0.055, yellow)
    box("Barrier_Board", (1.52, 0.12, 0.34), (0.95, -1.48, 0.93), yellow, edge=0.035)
    for index in range(5):
        box(f"Barrier_Stripe_{index}", (0.18, 0.13, 0.36), (0.43 + index * 0.26, -1.55, 0.93), dark_steel, edge=0.016, rotation=(0, 0.16, 0))
    cylinder("Signpost_Pole", 0.055, 2.20, (-1.25, -0.25, 1.26), galvanized, vertices=32, edge=0.010)
    box("Signpost_Board", (0.82, 0.08, 0.92), (-1.25, -0.25, 2.48), dark_steel, edge=0.060)
    box("Signpost_Inset", (0.62, 0.025, 0.66), (-1.25, -0.295, 2.48), yellow, edge=0.035)

    cylinder("Planter_Pot", 0.45, 0.54, (1.10, 1.48, 0.45), concrete, vertices=48, edge=0.025, scale=(1.0, 1.0, 1.0))
    cylinder("Planter_Soil", 0.39, 0.06, (1.10, 1.48, 0.75), green, vertices=48, edge=0.008)
    for index in range(18):
        angle = index * 2 * pi / 18
        radius = 0.16 + 0.16 * (index % 3) / 2
        x = 1.10 + cos(angle) * radius
        y = 1.48 + sin(angle) * radius
        sphere(f"Planter_Leaf_{index}", 0.18, (x, y, 0.92 + (index % 4) * 0.08), leaf, scale=(0.48, 1.0, 1.65), segments=20, rings=10)

    consolidate_repeated_meshes(
        "webtoon_street_prop_pack",
        (
            "Street_DisplayBase",
            "UtilityPole_Shaft",
            "UtilityPole_Transformer",
            "StreetLamp_Pole",
            "Bench_SeatSlat_0",
            "Hydrant_Body",
            "Bin_1_Body",
            "Barrier_Board",
            "Signpost_Board",
            "Planter_Pot",
        ),
    )
    add_root_and_export(
        "webtoon_street_prop_pack",
        (7.4, 5.2, 4.47),
        "utility-pole,transformer,crossarms,overhead-cables,street-lamp,slatted-bench,fire-hydrant,recycling-bins,road-barrier,signpost,planter",
    )
    render_thumbnail(
        "webtoon_street_prop_pack",
        (9.8, -11.8, 8.5),
        (0.0, 0.05, 1.75),
        world=(0.03, 0.04, 0.06, 1.0),
        key_color=(1.0, 0.72, 0.48),
        fill_color=(0.30, 0.52, 1.0),
        lens=52,
    )


BUILDERS = {
    "webtoon_rooftop_utility_platform": build_webtoon_rooftop_utility_platform,
    "webtoon_corner_store_facade": build_webtoon_corner_store_facade,
    "webtoon_street_prop_pack": build_webtoon_street_prop_pack,
}


def main():
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    THUMBNAIL_DIRECTORY.mkdir(parents=True, exist_ok=True)
    selected = set(ARGS.only or ASSETS)
    for asset_id in ASSETS:
        if asset_id in selected:
            BUILDERS[asset_id]()
    print(f"Generated {len(selected)} ToonSpectrum Wave 7 assets in {OUTPUT_DIRECTORY}")


if __name__ == "__main__":
    main()
