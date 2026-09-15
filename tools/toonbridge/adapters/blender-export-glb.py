"""Allow-listed ToonBridge Blender GLB export adapter."""
from __future__ import annotations

import pathlib
import sys

import bpy


def main() -> None:
    try:
        separator = sys.argv.index("--")
        output = pathlib.Path(sys.argv[separator + 1]).resolve(strict=False)
    except (ValueError, IndexError) as error:
        raise RuntimeError("A single output path is required") from error
    if output.suffix.lower() != ".glb":
        raise RuntimeError("The output must be a .glb file")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_animations=True,
    )
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("Blender did not create the requested GLB")


if __name__ == "__main__":
    main()
