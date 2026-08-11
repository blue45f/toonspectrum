import os
import sys
import math
import bpy

# Ensure output directories exist
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../public/assets/3d"))
OUTFIT_DIR = os.path.join(OUT_DIR, "outfits")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(OUTFIT_DIR, exist_ok=True)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_material(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.0, roughness=0.5, emission_color=(0, 0, 0, 1), emission_strength=0.0, sheen=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    if principled:
        if "Base Color" in principled.inputs:
            principled.inputs["Base Color"].default_value = base_color
        if "Metallic" in principled.inputs:
            principled.inputs["Metallic"].default_value = metallic
        if "Roughness" in principled.inputs:
            principled.inputs["Roughness"].default_value = roughness
        if sheen > 0 and "Sheen Weight" in principled.inputs:
            principled.inputs["Sheen Weight"].default_value = sheen
        if emission_strength > 0:
            if "Emission Color" in principled.inputs:
                principled.inputs["Emission Color"].default_value = emission_color
            if "Emission Strength" in principled.inputs:
                principled.inputs["Emission Strength"].default_value = emission_strength
    return mat

def apply_subsurf(obj, levels=2):
    mod = obj.modifiers.new(name="Subsurf", type='SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()

def export_glb(filename):
    out_path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_apply=True)
    print(f"✅ Exported GLB: {out_path} ({os.path.getsize(out_path)} bytes)")

def export_outfit_glb(filename):
    out_path = os.path.join(OUTFIT_DIR, filename)
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_apply=True)
    print(f"👕 Exported High-Poly Outfit GLB: {out_path} ({os.path.getsize(out_path)} bytes)")

# 1. Cyber Katana Blade
def build_cyber_katana():
    reset_scene()
    
    # Materials
    mat_blade = create_material("BladeMetal", base_color=(0.15, 0.18, 0.22, 1.0), metallic=0.95, roughness=0.15)
    mat_edge = create_material("CyberGlowEdge", base_color=(0.0, 0.8, 1.0, 1.0), metallic=0.1, roughness=0.1, emission_color=(0.0, 0.9, 1.0, 1.0), emission_strength=4.0)
    mat_handle = create_material("HandleGrip", base_color=(0.05, 0.05, 0.08, 1.0), metallic=0.2, roughness=0.7)
    
    # Blade body
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.5, 0))
    blade = bpy.context.active_object
    blade.scale = (0.015, 0.9, 0.06)
    blade.data.materials.append(mat_blade)
    
    # Glowing energy edge
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.5, 0.032))
    edge = bpy.context.active_object
    edge.scale = (0.008, 0.92, 0.01)
    edge.data.materials.append(mat_edge)
    
    # Tsuba (Guard)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.015, location=(0, 0.02, 0))
    tsuba = bpy.context.active_object
    tsuba.rotation_euler = (math.radians(90), 0, 0)
    tsuba.data.materials.append(mat_blade)
    
    # Handle (Tsuka)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=0.24, location=(0, -0.12, 0))
    handle = bpy.context.active_object
    handle.rotation_euler = (math.radians(90), 0, 0)
    handle.data.materials.append(mat_handle)
    
    apply_subsurf(blade, 2)
    export_glb("cyber_katana.glb")

# 2. Magic Staff with Glowing Crystal Core
def build_magic_staff():
    reset_scene()
    
    mat_wood = create_material("StaffWood", base_color=(0.28, 0.16, 0.08, 1.0), metallic=0.05, roughness=0.85)
    mat_gold = create_material("StaffGold", base_color=(0.95, 0.78, 0.25, 1.0), metallic=0.9, roughness=0.2)
    mat_crystal = create_material("CrystalCore", base_color=(0.7, 0.2, 1.0, 1.0), metallic=0.1, roughness=0.05, emission_color=(0.8, 0.3, 1.0, 1.0), emission_strength=5.0)
    
    # Main Staff Pole
    bpy.ops.mesh.primitive_cylinder_add(radius=0.028, depth=1.6, location=(0, 0, 0.8))
    pole = bpy.context.active_object
    pole.data.materials.append(mat_wood)
    
    # Gold Fitting Collar
    bpy.ops.mesh.primitive_torus_add(major_radius=0.038, minor_radius=0.01, location=(0, 0, 1.55))
    collar = bpy.context.active_object
    collar.data.materials.append(mat_gold)
    
    # Crystal Core (Octahedron / Icosahedron)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.09, location=(0, 0, 1.72))
    crystal = bpy.context.active_object
    crystal.data.materials.append(mat_crystal)
    
    # Surrounding Gold Orbits
    bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.008, location=(0, 0, 1.72))
    orbit = bpy.context.active_object
    orbit.rotation_euler = (math.radians(35), math.radians(45), 0)
    orbit.data.materials.append(mat_gold)
    
    apply_subsurf(pole, 1)
    export_glb("magic_staff_crystal.glb")

# 3. Sci-Fi Exploration Drone
def build_scifi_drone():
    reset_scene()
    
    mat_body = create_material("DroneBody", base_color=(0.9, 0.92, 0.95, 1.0), metallic=0.7, roughness=0.2)
    mat_dark = create_material("DroneChassis", base_color=(0.08, 0.1, 0.12, 1.0), metallic=0.85, roughness=0.3)
    mat_eye = create_material("DroneEye", base_color=(1.0, 0.1, 0.1, 1.0), metallic=0.0, roughness=0.1, emission_color=(1.0, 0.2, 0.2, 1.0), emission_strength=6.0)
    
    # Body Sphere
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=(0, 0, 0))
    body = bpy.context.active_object
    body.data.materials.append(mat_body)
    
    # Front Lens Eye
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.06, location=(0, 0.23, 0))
    eye = bpy.context.active_object
    eye.rotation_euler = (math.radians(90), 0, 0)
    eye.data.materials.append(mat_eye)
    
    # Thruster Pods (4 corners)
    angles = [45, 135, 225, 315]
    for deg in angles:
        rad = math.radians(deg)
        x = 0.28 * math.cos(rad)
        y = 0.28 * math.sin(rad)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=0.12, location=(x, y, 0))
        pod = bpy.context.active_object
        pod.data.materials.append(mat_dark)
        
    apply_subsurf(body, 2)
    export_glb("scifi_drone_bot.glb")

# 4. Neon Cyber Bench Prop
def build_cyber_bench():
    reset_scene()
    
    mat_carbon = create_material("CarbonBench", base_color=(0.1, 0.12, 0.15, 1.0), metallic=0.4, roughness=0.4)
    mat_neon = create_material("NeonStrip", base_color=(0.0, 1.0, 0.5, 1.0), metallic=0.1, roughness=0.1, emission_color=(0.0, 1.0, 0.6, 1.0), emission_strength=5.0)
    
    # Bench Seat Plank
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.45))
    seat = bpy.context.active_object
    seat.scale = (1.6, 0.5, 0.08)
    seat.data.materials.append(mat_carbon)
    
    # Neon Accent Line
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.24, 0.45))
    strip = bpy.context.active_object
    strip.scale = (1.62, 0.02, 0.082)
    strip.data.materials.append(mat_neon)
    
    # Legs (Left & Right)
    for x in [-0.7, 0.7]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.22))
        leg = bpy.context.active_object
        leg.scale = (0.1, 0.48, 0.44)
        leg.data.materials.append(mat_carbon)
        
    apply_subsurf(seat, 2)
    export_glb("neom_bench_prop.glb")

# 5. Cyberpunk Helmet Visor (Headwear)
def build_cyber_visor():
    reset_scene()
    
    mat_frame = create_material("VisorFrame", base_color=(0.1, 0.1, 0.14, 1.0), metallic=0.8, roughness=0.2)
    mat_glass = create_material("VisorGlass", base_color=(1.0, 0.5, 0.0, 1.0), metallic=0.2, roughness=0.05, emission_color=(1.0, 0.6, 0.0, 1.0), emission_strength=4.0)
    
    # Curved Visor Shield
    bpy.ops.mesh.primitive_cylinder_add(radius=0.14, depth=0.08, location=(0, 0.04, 0))
    visor = bpy.context.active_object
    visor.scale = (1.0, 0.6, 0.8)
    visor.data.materials.append(mat_glass)
    
    # Frame Rim
    bpy.ops.mesh.primitive_torus_add(major_radius=0.145, minor_radius=0.012, location=(0, 0, 0))
    frame = bpy.context.active_object
    frame.data.materials.append(mat_frame)
    
    apply_subsurf(visor, 2)
    export_glb("cyber_helmet_visor.glb")

# 6. Holographic Data Tablet (Hand Prop)
def build_hologram_tablet():
    reset_scene()
    
    mat_frame = create_material("TabletBezel", base_color=(0.12, 0.15, 0.18, 1.0), metallic=0.9, roughness=0.25)
    mat_holo = create_material("HoloScreen", base_color=(0.0, 0.7, 1.0, 1.0), metallic=0.0, roughness=0.05, emission_color=(0.0, 0.85, 1.0, 1.0), emission_strength=6.0)
    
    # Bezel Frame
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    frame = bpy.context.active_object
    frame.scale = (0.24, 0.01, 0.16)
    frame.data.materials.append(mat_frame)
    
    # Glowing Hologram Glass
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.002, 0))
    holo = bpy.context.active_object
    holo.scale = (0.22, 0.006, 0.14)
    holo.data.materials.append(mat_holo)
    
    export_glb("hologram_tablet.glb")

# 7. Ancient Rune Shield (Fantasy Hand Prop)
def build_rune_shield():
    reset_scene()
    
    mat_steel = create_material("ShieldSteel", base_color=(0.3, 0.32, 0.35, 1.0), metallic=0.9, roughness=0.3)
    mat_gold = create_material("ShieldGoldRune", base_color=(0.95, 0.8, 0.3, 1.0), metallic=0.85, roughness=0.2, emission_color=(1.0, 0.85, 0.3, 1.0), emission_strength=2.0)
    
    # Main Shield Body
    bpy.ops.mesh.primitive_cylinder_add(radius=0.38, depth=0.04, location=(0, 0, 0))
    shield = bpy.context.active_object
    shield.scale = (1.0, 0.75, 1.0)
    shield.data.materials.append(mat_steel)
    
    # Center Boss / Rune Emblem
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.12, location=(0, 0.02, 0))
    boss = bpy.context.active_object
    boss.scale = (1.0, 0.4, 1.0)
    boss.data.materials.append(mat_gold)
    
    apply_subsurf(shield, 2)
    export_glb("ancient_rune_shield.glb")

# 8. Retro Arcade Cabinet (Interior Environment)
def build_arcade_cabinet():
    reset_scene()
    
    mat_body = create_material("CabinetBody", base_color=(0.85, 0.1, 0.3, 1.0), metallic=0.2, roughness=0.5)
    mat_screen = create_material("ArcadeScreen", base_color=(0.1, 0.8, 1.0, 1.0), metallic=0.0, roughness=0.1, emission_color=(0.2, 0.9, 1.0, 1.0), emission_strength=4.5)
    mat_marquee = create_material("ArcadeMarquee", base_color=(1.0, 0.9, 0.2, 1.0), metallic=0.1, roughness=0.2, emission_color=(1.0, 0.9, 0.2, 1.0), emission_strength=5.0)
    
    # Cabinet Frame
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.85))
    body = bpy.context.active_object
    body.scale = (0.7, 0.75, 1.7)
    body.data.materials.append(mat_body)
    
    # Glowing Screen
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.32, 1.15))
    screen = bpy.context.active_object
    screen.scale = (0.52, 0.05, 0.42)
    screen.rotation_euler = (math.radians(-15), 0, 0)
    screen.data.materials.append(mat_screen)
    
    # Marquee Sign Header
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.34, 1.58))
    marquee = bpy.context.active_object
    marquee.scale = (0.64, 0.06, 0.18)
    marquee.data.materials.append(mat_marquee)
    
    export_glb("arcade_game_cabinet.glb")

# ── 10 High-Poly Procedural Outfit GLB Generators ──

def build_outfit_tshirt():
    reset_scene()
    mat = create_material("TShirtFabric", base_color=(0.18, 0.42, 0.85, 1.0), roughness=0.75)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.6, location=(0, 0, 1.1))
    body = bpy.context.active_object
    body.data.materials.append(mat)
    apply_subsurf(body, 2)
    export_outfit_glb("outfit_tshirt.glb")

def build_outfit_tank():
    reset_scene()
    mat = create_material("TankTopFabric", base_color=(0.95, 0.95, 0.95, 1.0), roughness=0.8)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=0.54, location=(0, 0, 1.12))
    body = bpy.context.active_object
    body.data.materials.append(mat)
    apply_subsurf(body, 2)
    export_outfit_glb("outfit_tank.glb")

def build_outfit_cardigan():
    reset_scene()
    mat = create_material("CardiganKnit", base_color=(0.55, 0.4, 0.3, 1.0), roughness=0.9)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.24, depth=0.72, location=(0, 0, 1.05))
    body = bpy.context.active_object
    body.data.materials.append(mat)
    apply_subsurf(body, 2)
    export_outfit_glb("outfit_cardigan.glb")

def build_outfit_sailor():
    reset_scene()
    mat = create_material("SailorFabric", base_color=(0.12, 0.18, 0.35, 1.0), roughness=0.75)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.55, location=(0, 0, 1.1))
    body = bpy.context.active_object
    body.data.materials.append(mat)
    apply_subsurf(body, 2)
    export_outfit_glb("outfit_sailor.glb")

def build_outfit_dress():
    reset_scene()
    mat = create_material("DressFabric", base_color=(0.85, 0.25, 0.45, 1.0), roughness=0.4, sheen=0.6)
    bpy.ops.mesh.primitive_cone_add(radius1=0.48, radius2=0.18, depth=0.9, location=(0, 0, 0.8))
    skirt = bpy.context.active_object
    skirt.data.materials.append(mat)
    apply_subsurf(skirt, 2)
    export_outfit_glb("outfit_dress.glb")

def build_outfit_pants():
    reset_scene()
    mat = create_material("PantsFabric", base_color=(0.15, 0.18, 0.25, 1.0), roughness=0.8)
    for x in [-0.11, 0.11]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.1, depth=0.85, location=(x, 0, 0.45))
        leg = bpy.context.active_object
        leg.data.materials.append(mat)
        apply_subsurf(leg, 2)
    export_outfit_glb("outfit_pants.glb")

def build_outfit_wide():
    reset_scene()
    mat = create_material("WidePantsFabric", base_color=(0.25, 0.28, 0.32, 1.0), roughness=0.85)
    for x in [-0.15, 0.15]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.88, location=(x, 0, 0.44))
        leg = bpy.context.active_object
        leg.data.materials.append(mat)
        apply_subsurf(leg, 2)
    export_outfit_glb("outfit_wide.glb")

def build_outfit_scrubs():
    reset_scene()
    mat = create_material("ScrubsFabric", base_color=(0.15, 0.55, 0.65, 1.0), roughness=0.8)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.23, depth=0.62, location=(0, 0, 1.08))
    body = bpy.context.active_object
    body.data.materials.append(mat)
    apply_subsurf(body, 2)
    export_outfit_glb("outfit_scrubs.glb")

def build_outfit_scrubpants():
    reset_scene()
    mat = create_material("ScrubPantsFabric", base_color=(0.15, 0.55, 0.65, 1.0), roughness=0.8)
    for x in [-0.12, 0.12]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.11, depth=0.86, location=(x, 0, 0.44))
        leg = bpy.context.active_object
        leg.data.materials.append(mat)
        apply_subsurf(leg, 2)
    export_outfit_glb("outfit_scrubpants.glb")

def build_outfit_shorts():
    reset_scene()
    mat = create_material("ShortsFabric", base_color=(0.2, 0.4, 0.7, 1.0), roughness=0.8)
    for x in [-0.11, 0.11]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=0.35, location=(x, 0, 0.7))
        leg = bpy.context.active_object
        leg.data.materials.append(mat)
        apply_subsurf(leg, 2)
    export_outfit_glb("outfit_shorts.glb")

if __name__ == "__main__":
    print("🚀 Starting Blender 5.2 3D Asset & Outfit Generation...")
    build_cyber_katana()
    build_magic_staff()
    build_scifi_drone()
    build_cyber_bench()
    build_cyber_visor()
    build_hologram_tablet()
    build_rune_shield()
    build_arcade_cabinet()
    
    # Generate 10 High-Poly Outfits
    build_outfit_tshirt()
    build_outfit_tank()
    build_outfit_cardigan()
    build_outfit_sailor()
    build_outfit_dress()
    build_outfit_pants()
    build_outfit_wide()
    build_outfit_scrubs()
    build_outfit_scrubpants()
    build_outfit_shorts()
    
    print("✨ All 18 3D Assets & High-Poly Outfits Generated Successfully!")
