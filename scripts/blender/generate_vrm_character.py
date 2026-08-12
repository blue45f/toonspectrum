import os
import math
import bpy

VRM_OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../public/vrm"))
os.makedirs(VRM_OUT_DIR, exist_ok=True)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_material(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.0, roughness=0.5, emission_color=(0, 0, 0, 1), emission_strength=0.0):
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
        if emission_strength > 0:
            if "Emission Color" in principled.inputs:
                principled.inputs["Emission Color"].default_value = emission_color
            if "Emission Strength" in principled.inputs:
                principled.inputs["Emission Strength"].default_value = emission_strength
    return mat

def build_vrm_character():
    reset_scene()
    
    # Materials
    mat_skin = create_material("CyberSkin", base_color=(0.95, 0.82, 0.74, 1.0), roughness=0.4)
    mat_suit = create_material("CyberSuit", base_color=(0.08, 0.12, 0.18, 1.0), metallic=0.7, roughness=0.25)
    mat_glow = create_material("CyberGlow", base_color=(0.0, 0.85, 1.0, 1.0), metallic=0.1, roughness=0.1, emission_color=(0.0, 0.9, 1.0, 1.0), emission_strength=5.0)
    
    # 1. Create Armature
    bpy.ops.object.armature_add(location=(0, 0, 0))
    armature = bpy.context.active_object
    armature.name = "CyberArmature"
    bpy.ops.object.mode_set(mode='EDIT')
    
    ebones = armature.data.edit_bones
    root_bone = ebones[0]
    root_bone.name = "hips"
    root_bone.head = (0, 0, 0.85)
    root_bone.tail = (0, 0, 1.0)
    
    spine = ebones.new("spine")
    spine.head = (0, 0, 1.0)
    spine.tail = (0, 0, 1.2)
    spine.parent = root_bone
    
    chest = ebones.new("chest")
    chest.head = (0, 0, 1.2)
    chest.tail = (0, 0, 1.4)
    chest.parent = spine
    
    neck = ebones.new("neck")
    neck.head = (0, 0, 1.4)
    neck.tail = (0, 0, 1.5)
    neck.parent = chest
    
    head = ebones.new("head")
    head.head = (0, 0, 1.5)
    head.tail = (0, 0, 1.75)
    head.parent = neck
    
    # Arms
    left_upper_arm = ebones.new("leftUpperArm")
    left_upper_arm.head = (0.18, 0, 1.38)
    left_upper_arm.tail = (0.42, 0, 1.38)
    left_upper_arm.parent = chest
    
    right_upper_arm = ebones.new("rightUpperArm")
    right_upper_arm.head = (-0.18, 0, 1.38)
    right_upper_arm.tail = (-0.42, 0, 1.38)
    right_upper_arm.parent = chest
    
    # Legs
    left_upper_leg = ebones.new("leftUpperLeg")
    left_upper_leg.head = (0.1, 0, 0.85)
    left_upper_leg.tail = (0.1, 0, 0.45)
    left_upper_leg.parent = root_bone
    
    right_upper_leg = ebones.new("rightUpperLeg")
    right_upper_leg.head = (-0.1, 0, 0.85)
    right_upper_leg.tail = (-0.1, 0, 0.45)
    right_upper_leg.parent = root_bone
    
    bpy.ops.object.mode_set(mode='OBJECT')
    
    # 2. Character Body Mesh
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15, location=(0, 0, 1.62))
    head_mesh = bpy.context.active_object
    head_mesh.name = "CyberHead"
    head_mesh.data.materials.append(mat_skin)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.55, location=(0, 0, 1.15))
    torso_mesh = bpy.context.active_object
    torso_mesh.name = "CyberTorso"
    torso_mesh.data.materials.append(mat_suit)
    
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.015, location=(0, 0, 1.18))
    glow_ring = bpy.context.active_object
    glow_ring.name = "CyberGlowRing"
    glow_ring.data.materials.append(mat_glow)
    
    # Export VRM/GLB model file
    tmp_path = os.path.join(VRM_OUT_DIR, "cyber_agent_zero.vrm")
    bpy.ops.export_scene.gltf(filepath=tmp_path, export_format='GLB', export_apply=True)
    vrm_path = tmp_path if os.path.exists(tmp_path) else f"{tmp_path}.glb"
    final_path = os.path.join(VRM_OUT_DIR, "cyber_agent_zero.vrm")
    if os.path.exists(vrm_path) and vrm_path != final_path:
        os.rename(vrm_path, final_path)

    # Inject VRMC_vrm extension header
    inject_vrmc_extension(final_path, "사이버 에이전트 제로")
    print(f"🤖 Exported Cyber Agent Zero VRM: {final_path} ({os.path.getsize(final_path)} bytes)")

def inject_vrmc_extension(vrm_path, name):
    import json, struct
    with open(vrm_path, 'rb') as f:
        data = f.read()
    if len(data) < 20: return
    magic, version, length = struct.unpack_from('<III', data, 0)
    if magic != 0x46546c67: return
    json_len, json_type = struct.unpack_from('<II', data, 12)
    json_bytes = data[20:20 + json_len]
    gltf = json.loads(json_bytes.decode('utf-8'))
    
    nodes = gltf.get("nodes", [])
    def find_node(bname):
        for idx, n in enumerate(nodes):
            if n.get("name") == bname:
                return {"node": idx}
        return None

    gltf.setdefault("extensionsUsed", [])
    if "VRMC_vrm" not in gltf["extensionsUsed"]:
        gltf["extensionsUsed"].append("VRMC_vrm")
    
    gltf.setdefault("extensions", {})
    gltf["extensions"]["VRMC_vrm"] = {
        "specVersion": "1.0",
        "meta": {
            "name": name,
            "authors": ["ToonSpectrum 3D Engine"],
            "version": "1.0.0",
            "avatarPermission": "everyone",
            "allowCommercialUsage": "corporation",
            "creditNotation": "unnecessary",
            "modification": "allowModification"
        },
        "humanoid": {
            "humanBones": {
                "hips": find_node("hips") or {"node": 0},
                "spine": find_node("spine") or {"node": 1},
                "chest": find_node("chest") or {"node": 2},
                "neck": find_node("neck") or {"node": 3},
                "head": find_node("head") or {"node": 4},
                "leftUpperArm": find_node("leftUpperArm") or {"node": 5},
                "rightUpperArm": find_node("rightUpperArm") or {"node": 6},
                "leftUpperLeg": find_node("leftUpperLeg") or {"node": 7},
                "rightUpperLeg": find_node("rightUpperLeg") or {"node": 8}
            }
        }
    }

    new_json_str = json.dumps(gltf)
    new_json_bytes = new_json_str.encode('utf-8')
    pad = (4 - (len(new_json_bytes) % 4)) % 4
    if pad > 0:
        new_json_bytes += b' ' * pad

    bin_bytes = data[20 + json_len:]
    new_total_len = 12 + 8 + len(new_json_bytes) + len(bin_bytes)

    header = struct.pack('<III', 0x46546c67, 2, new_total_len)
    chunk0_hdr = struct.pack('<II', len(new_json_bytes), 0x4e4f534a)

    with open(vrm_path, 'wb') as f:
        f.write(header)
        f.write(chunk0_hdr)
        f.write(new_json_bytes)
        f.write(bin_bytes)

if __name__ == "__main__":
    print("🚀 Generating 3D VRM Cyber Agent Zero Character...")
    build_vrm_character()
    print("✨ Cyber Agent Zero VRM Character Created Successfully!")
