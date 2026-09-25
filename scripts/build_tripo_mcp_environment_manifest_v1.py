#!/usr/bin/env python3
"""Build the deployable manifest for the Tripo MCP free-wallet environment pack.

This script consumes only generated assets, processing metrics, task metadata, and the
checked-in processor definition. It does not read API credentials or provider download URLs.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack-dir", type=Path, required=True)
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--metrics", type=Path, required=True)
    parser.add_argument("--processor-script", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def extract_specs(processor_script: Path) -> list[dict[str, Any]]:
    tree = ast.parse(processor_script.read_text(encoding="utf-8"))
    for node in tree.body:
        value: ast.expr | None = None
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "ASSETS" for target in node.targets
        ):
            value = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == "ASSETS":
            value = node.value
        if not isinstance(value, ast.Tuple):
            continue
        records: list[dict[str, Any]] = []
        for element in value.elts:
            if not isinstance(element, ast.Call) or not isinstance(element.func, ast.Name) or element.func.id != "AssetSpec":
                raise ValueError("ASSETS contains a non-literal AssetSpec")
            values = [ast.literal_eval(value) for value in element.args]
            if len(values) != 7:
                raise ValueError("Unexpected AssetSpec argument count")
            asset_id, target_height, name, theme, description, tags, semantic_parts = values
            records.append({
                "assetId": asset_id,
                "targetHeightM": target_height,
                "name": name,
                "theme": theme,
                "description": description,
                "tags": list(tags),
                "semanticParts": list(semantic_parts),
            })
        return records
    raise ValueError("ASSETS definition was not found")


def parse_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError(f"Not a GLB: {path}")
    magic, version, declared_size = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2 or declared_size != len(data):
        raise ValueError(f"Invalid GLB header: {path}")
    offset = 12
    document: dict[str, Any] | None = None
    binary = b""
    while offset + 8 <= len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8:offset + 8 + length]
        if chunk_type == 0x4E4F534A:
            document = json.loads(payload.rstrip(b" \x00").decode("utf-8"))
        elif chunk_type == 0x004E4942:
            binary = payload
        offset += 8 + length
    if document is None:
        raise ValueError(f"GLB JSON chunk missing: {path}")
    return document, binary


def webp_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    chunk = data[12:16]
    if chunk == b"VP8X" and len(data) >= 30:
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return width, height
    if chunk == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
        bits = int.from_bytes(data[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if chunk == b"VP8 " and len(data) >= 30:
        start = data.find(b"\x9d\x01\x2a", 20, 40)
        if start >= 0 and start + 7 <= len(data):
            width = int.from_bytes(data[start + 3:start + 5], "little") & 0x3FFF
            height = int.from_bytes(data[start + 5:start + 7], "little") & 0x3FFF
            return width, height
    return None


def png_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) >= 24 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack_from(">II", data, 16)
    return None


def image_dimensions(data: bytes, mime_type: str | None) -> tuple[int, int] | None:
    if mime_type == "image/webp":
        return webp_dimensions(data)
    if mime_type == "image/png":
        return png_dimensions(data)
    return png_dimensions(data) or webp_dimensions(data)


def embedded_image_bytes(document: dict[str, Any], binary: bytes, image: dict[str, Any]) -> bytes | None:
    buffer_view_index = image.get("bufferView")
    if not isinstance(buffer_view_index, int):
        return None
    views = document.get("bufferViews") or []
    if not 0 <= buffer_view_index < len(views):
        return None
    view = views[buffer_view_index]
    start = int(view.get("byteOffset", 0))
    length = int(view.get("byteLength", 0))
    return binary[start:start + length]


def glb_metrics(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    document, binary = parse_glb(path)
    accessors = document.get("accessors") or []
    primitive_count = 0
    triangles = 0
    for mesh in document.get("meshes") or []:
        for primitive in mesh.get("primitives") or []:
            primitive_count += 1
            mode = int(primitive.get("mode", 4))
            index = primitive.get("indices")
            count = 0
            if isinstance(index, int) and 0 <= index < len(accessors):
                count = int(accessors[index].get("count", 0))
            elif isinstance(primitive.get("attributes"), dict):
                position = primitive["attributes"].get("POSITION")
                if isinstance(position, int) and 0 <= position < len(accessors):
                    count = int(accessors[position].get("count", 0))
            if mode == 4:
                triangles += count // 3
            elif mode in (5, 6):
                triangles += max(0, count - 2)

    maximum_dimension = 0
    undetermined_dimensions = 0
    for image in document.get("images") or []:
        payload = embedded_image_bytes(document, binary, image)
        dimensions = image_dimensions(payload or b"", image.get("mimeType"))
        if dimensions is None:
            undetermined_dimensions += 1
        else:
            maximum_dimension = max(maximum_dimension, *dimensions)

    external_resources = sum(
        1 for buffer in document.get("buffers") or [] if isinstance(buffer.get("uri"), str)
    ) + sum(
        1 for image in document.get("images") or [] if isinstance(image.get("uri"), str)
    )
    required = list(document.get("extensionsRequired") or [])
    used = list(document.get("extensionsUsed") or [])
    metrics = {
        "bytes": path.stat().st_size,
        "nodes": len(document.get("nodes") or []),
        "meshes": len(document.get("meshes") or []),
        "triangles": triangles,
        "drawCalls": primitive_count,
        "materials": len(document.get("materials") or []),
        "textures": len(document.get("textures") or []),
        "images": len(document.get("images") or []),
        "maxImageDimension": maximum_dimension,
        "undeterminedImageDimensions": undetermined_dimensions,
        "animations": len(document.get("animations") or []),
        "skins": len(document.get("skins") or []),
        "lights": len(((document.get("extensions") or {}).get("KHR_lights_punctual") or {}).get("lights") or []),
        "extensionsUsed": used,
        "extensionsRequired": required,
        "externalResources": external_resources,
    }
    root = next(
        (node for node in document.get("nodes") or [] if isinstance(node.get("extras"), dict) and node["extras"].get("asset_id")),
        None,
    )
    if root is None:
        raise ValueError(f"Asset metadata root missing: {path}")
    return metrics, {"name": root.get("name"), "extras": root["extras"]}


def thumbnail_metrics(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    dimensions = png_dimensions(data)
    if dimensions is None:
        raise ValueError(f"Thumbnail is not PNG: {path}")
    return {"width": dimensions[0], "height": dimensions[1], "sha256": sha256(path)}


def camera_for(bounds: list[float]) -> dict[str, Any]:
    width, height, depth = bounds
    span = max(width, depth, 1.0)
    return {
        "position": [round(span * 1.45, 3), round(max(height * 1.18, span * 0.78), 3), round(span * 1.62, 3)],
        "target": [0.0, round(height * 0.43, 3), 0.0],
        "fovDegrees": 50,
    }


def main() -> None:
    args = parse_args()
    pack_dir = args.pack_dir.expanduser().resolve()
    registry = json.loads(args.registry.expanduser().read_text(encoding="utf-8"))
    processing = json.loads(args.metrics.expanduser().read_text(encoding="utf-8"))
    specs = extract_specs(args.processor_script.expanduser().resolve())
    processing_by_id = {item["assetId"]: item for item in processing["assets"]}
    tasks = registry["assets"]
    assets: list[dict[str, Any]] = []

    for spec in specs:
        asset_id = spec["assetId"]
        task = tasks[asset_id]
        processed = processing_by_id[asset_id]
        model_path = pack_dir / f"{asset_id}.glb"
        thumbnail_path = pack_dir / "thumbnails" / f"{asset_id}.png"
        metrics, metadata_root = glb_metrics(model_path)
        thumbnail = thumbnail_metrics(thumbnail_path)
        if task.get("status") != "TaskStatus.SUCCESS":
            raise ValueError(f"Provider task is not successful: {asset_id}")
        if metrics["externalResources"] != 0:
            raise ValueError(f"Unexpected external resource: {asset_id}")
        bounds = [float(value) for value in processed["bounds"]]
        model_sha = sha256(model_path)
        prompt = str(task["prompt"])
        prompt_sha = "sha256:" + hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        expected_id = f"ts-bg3d-{asset_id}-mcp-v1"
        if metadata_root["extras"].get("asset_id") != expected_id:
            raise ValueError(f"Root asset ID mismatch: {asset_id}")
        if metadata_root["extras"].get("asset_prompt_sha256") != prompt_sha.removeprefix("sha256:"):
            raise ValueError(f"Prompt hash mismatch: {asset_id}")

        assets.append({
            "id": expected_id,
            "provider": "Tripo",
            "providerTaskId": task["taskId"],
            "generator": "official-tripo-mcp",
            "generatorVersion": "local-patched-v3-free-wallet-20260925",
            "providerModelVersion": "v3.0-20250812",
            "blenderProcessor": "scripts/blender/process_tripo_mcp_environment_pack_v1.py",
            "blenderVersion": "5.2",
            "optimizer": "glTF-Transform 4.4.2 / meshopt / WebP",
            "billing": {
                "mode": "free-api-wallet",
                "creditCost": 50,
                "paymentMethodUsed": False,
                "paidUpgradeUsed": False,
            },
            "license": {
                "name": "Tripo Terms of Service - Free User Output",
                "url": "https://www.tripo3d.ai/terms",
                "commercialUse": True,
                "attributionRequired": False,
                "exclusive": False,
                "providerRetainsRights": True,
                "cc0": False,
            },
            "prompt": prompt,
            "promptSha256": prompt_sha,
            "semanticParts": spec["semanticParts"],
            "externalRuntimeResources": 0,
            "metrics": metrics,
            "byteSize": metrics["bytes"],
            "sha256": model_sha,
            "bounds": bounds,
            "camera": camera_for(bounds),
            "url": f"/assets/3d/environments/mcp-free-v1/{asset_id}.glb",
            "fileName": f"{asset_id}.glb",
            "thumbnailUrl": f"/assets/3d/environments/mcp-free-v1/thumbnails/{asset_id}.png",
            "name": spec["name"],
            "theme": spec["theme"],
            "description": spec["description"],
            "tags": spec["tags"],
            "normalization": "authored-metres",
            "rootMetadata": metadata_root,
            "visualReviewed": True,
            "allAnglesArtisticallyApproved": False,
            "visualReviewLevel": "three-angle-local-structural-review",
            "visualReviewSource": f"/assets/3d/environments/mcp-free-v1/thumbnails/{asset_id}.png",
            "previewReview": {
                "renderer": "Blender 5.2 / Eevee / AgX Medium High Contrast / 960x720",
                "scope": "Primary oblique render plus local front and rear structural reviews; only the primary thumbnail is shipped.",
                "reviewedModelSha256": model_sha,
                "reviewedImageSha256": thumbnail["sha256"],
                "reviewedImageWidth": thumbnail["width"],
                "reviewedImageHeight": thumbnail["height"],
                "visibleStructuralBlocker": False,
            },
        })

    payload = {
        "schema": "toonspectrum.bg3d-environment-pack.mcp-free-v1",
        "version": "mcp-free-v1",
        "generatedAt": registry.get("generatedAt") or registry.get("updatedAt") or "2026-09-25T00:00:00Z",
        "provider": "Tripo",
        "connection": {
            "mcp": "official Tripo MCP",
            "blenderAddon": "official Tripo 3D for Blender",
            "cliCompanion": "Meshy CLI 0.4.0 connected separately; free task creation unavailable",
        },
        "generation": {
            "providerModelVersion": "v3.0-20250812",
            "geometryQuality": "detailed",
            "textureQuality": "detailed",
            "pbr": True,
            "faceLimit": 40000,
            "totalCreditCost": sum(asset["billing"]["creditCost"] for asset in assets),
            "billingMode": "free-api-wallet",
            "paymentMethodUsed": False,
        },
        "assets": assets,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "assets": len(assets),
        "bytes": sum(asset["byteSize"] for asset in assets),
        "triangles": sum(asset["metrics"]["triangles"] for asset in assets),
        "creditCost": payload["generation"]["totalCreditCost"],
        "output": str(args.output),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
