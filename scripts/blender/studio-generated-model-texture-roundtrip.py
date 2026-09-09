from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

import bpy


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for item in list(collection):
            if getattr(item, "users", 0) == 0:
                collection.remove(item)


def import_glb(path: pathlib.Path) -> None:
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender failed to import {path}: {result}")


def first_mesh_object() -> bpy.types.Object:
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.data is not None:
            return obj
    raise RuntimeError("Generated GLB contains no mesh object.")


def attach_test_texture(mesh_object: bpy.types.Object) -> tuple[str, str]:
    image = bpy.data.images.new("ToonStudioPaintedTexture", width=4, height=4, alpha=True)
    pixels: list[float] = []
    for y in range(4):
        for x in range(4):
            checker = (x + y) % 2 == 0
            pixels.extend((0.92 if checker else 0.12, 0.3 if checker else 0.72, 0.18, 1.0))
    image.pixels = pixels
    image.pack()

    material = bpy.data.materials.new("ToonStudioPaintedMaterial")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = (0.9, 0.3, 0.18, 1.0)

    mesh_object.data.materials.clear()
    mesh_object.data.materials.append(material)
    return image.name, material.name


def export_glb(path: pathlib.Path) -> None:
    result = bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_colors=True,
        export_cameras=True,
        export_lights=True,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender failed to export {path}: {result}")


def scene_summary() -> dict[str, object]:
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    polygons = sum(len(obj.data.polygons) for obj in mesh_objects if obj.data is not None)
    vertices = sum(len(obj.data.vertices) for obj in mesh_objects if obj.data is not None)
    materials = sorted({slot.material.name for obj in mesh_objects for slot in obj.material_slots if slot.material})
    images = sorted(image.name for image in bpy.data.images if image.users > 0)
    return {
        "meshObjects": len(mesh_objects),
        "vertices": vertices,
        "polygons": polygons,
        "materials": materials,
        "images": images,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

    input_path = pathlib.Path(args.input).resolve()
    output_path = pathlib.Path(args.output).resolve()
    receipt_path = pathlib.Path(args.receipt).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    import_glb(input_path)
    imported = scene_summary()
    mesh_object = first_mesh_object()
    image_name, material_name = attach_test_texture(mesh_object)
    export_glb(output_path)

    clear_scene()
    import_glb(output_path)
    roundtripped = scene_summary()
    if roundtripped["meshObjects"] < 1:
        raise RuntimeError("Round-tripped GLB contains no mesh object.")
    if material_name not in roundtripped["materials"]:
        raise RuntimeError("Round-tripped GLB lost the painted material.")
    if not roundtripped["images"]:
        raise RuntimeError("Round-tripped GLB lost the packed texture image.")

    receipt = {
        "schemaVersion": 1,
        "input": {
            "path": input_path.name,
            "bytes": input_path.stat().st_size,
            "sha256": sha256(input_path),
            "scene": imported,
        },
        "roundTrip": {
            "path": output_path.name,
            "bytes": output_path.stat().st_size,
            "sha256": sha256(output_path),
            "scene": roundtripped,
            "paintedImage": image_name,
            "paintedMaterial": material_name,
        },
        "blenderVersion": bpy.app.version_string,
    }
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
