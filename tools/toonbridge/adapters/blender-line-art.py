"""Render a deterministic white-surface Blender Freestyle line-art pass."""
from __future__ import annotations

import pathlib
import sys

import bpy


def output_path() -> pathlib.Path:
    try:
        separator = sys.argv.index("--")
        output = pathlib.Path(sys.argv[separator + 1]).resolve(strict=False)
    except (ValueError, IndexError) as error:
        raise RuntimeError("A single output path is required") from error
    if output.suffix.lower() != ".png":
        raise RuntimeError("The output must be a .png file")
    return output


def select_render_engine(scene) -> None:
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            return
        except TypeError:
            continue
    raise RuntimeError("A Freestyle-compatible Eevee engine is required")


def white_emission_material():
    material = bpy.data.materials.new("ToonBridgeLineArtWhite")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    emission.inputs["Strength"].default_value = 1.0
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def configure_white_world(scene) -> None:
    if scene.world is None:
        scene.world = bpy.data.worlds.new("ToonBridgeLineArtWorld")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background is None:
        background = scene.world.node_tree.nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = 1.0


def configure_freestyle(scene) -> None:
    scene.render.use_freestyle = True
    for view_layer in scene.view_layers:
        settings = view_layer.freestyle_settings
        for line_set in settings.linesets:
            line_set.linestyle.color = (0.0, 0.0, 0.0)
            line_set.linestyle.thickness = 1.5


def main() -> None:
    output = output_path()
    scene = bpy.context.scene
    select_render_engine(scene)
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(output)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    configure_white_world(scene)

    material = white_emission_material()
    for obj in scene.objects:
        materials = getattr(getattr(obj, "data", None), "materials", None)
        if materials is not None:
            materials.clear()
            materials.append(material)

    configure_freestyle(scene)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("Blender did not create the requested line-art image")


if __name__ == "__main__":
    main()
