"""Export quality-gated authored character parts from a ToonStudio Blender package.

This script intentionally only admits geometry that the production Blender pipeline already marked
as authored and quality-approved. It never downloads assets and it emits a Canonical Manifest V2
that the browser validates again before a part can be applied.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import shutil
import sys
from typing import Any

import bpy
from mathutils import Matrix


def _args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--model-url", required=True)
    parser.add_argument("--model-sha256", required=True)
    parser.add_argument("--thumbnail", required=True)
    parser.add_argument("--accepted-at", default="2026-09-09T00:00:00Z")
    parser.add_argument("--public-prefix", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"expected object in {path}")
    return value


def _sha(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_public_prefix(value: str) -> str:
    prefix = value.replace("\\", "/").rstrip("/")
    if not prefix.startswith("/") or ".." in prefix.split("/"):
        raise RuntimeError("public prefix must be an absolute same-origin URL path without traversal")
    return prefix


def _operator_kwargs(operator: Any, raw: dict[str, Any]) -> dict[str, Any]:
    try:
        identifiers = {
            prop.identifier
            for prop in operator.get_rna_type().properties
            if prop.identifier != "rna_type"
        }
    except (AttributeError, RuntimeError):
        return raw
    return {key: value for key, value in raw.items() if key in identifiers}


def _call_operator(operator: Any, **kwargs: Any) -> set[str]:
    return operator(**_operator_kwargs(operator, kwargs))


def _head_relative_matrix(obj: bpy.types.Object) -> Matrix:
    obj_world = obj.matrix_world.copy()
    armature = obj.parent
    if armature is None or armature.type != "ARMATURE" or obj.parent_type != "BONE" or not obj.parent_bone:
        return obj_world
    pose_bone = armature.pose.bones.get(obj.parent_bone)
    if pose_bone is None:
        raise RuntimeError(f"missing authored-hair parent bone {obj.parent_bone}")
    anchor_world = armature.matrix_world @ pose_bone.matrix
    return anchor_world.inverted_safe() @ obj_world


def _duplicate_for_export(source: bpy.types.Object, name: str) -> bpy.types.Object:
    duplicate = source.copy()
    if getattr(source, "data", None) is not None:
        duplicate.data = source.data.copy()
    duplicate.name = name
    duplicate.parent = None
    duplicate.parent_type = "OBJECT"
    duplicate.parent_bone = ""
    duplicate.matrix_world = _head_relative_matrix(source)
    duplicate.hide_set(False)
    duplicate.hide_viewport = False
    duplicate.hide_render = False
    bpy.context.scene.collection.objects.link(duplicate)
    return duplicate


def _remove_object(obj: bpy.types.Object) -> None:
    data = getattr(obj, "data", None)
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is not None and getattr(data, "users", 0) == 0:
        collection = getattr(bpy.data, f"{data.__class__.__name__.lower()}s", None)
        if collection is not None:
            try:
                collection.remove(data)
            except (ReferenceError, TypeError):
                pass


def _export_glb(path: Path, objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    result = _call_operator(
        bpy.ops.export_scene.gltf,
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_morph=True,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
        export_visible=False,
    )
    if "FINISHED" not in result or not path.is_file():
        raise RuntimeError(f"GLB export failed for {path.name}: {sorted(result)}")


def _hair_lods() -> list[tuple[int, bpy.types.Object, bpy.types.Object]]:
    mains = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and bool(obj.get("toonstudio_authored_hair"))
    ]
    if len(mains) < 3:
        raise RuntimeError("quality package does not contain all three authored-hair LOD meshes")
    result: list[tuple[int, bpy.types.Object, bpy.types.Object]] = []
    for main in mains:
        lod = int(main.get("toonstudio_lod", -1))
        if lod < 0:
            continue
        outline = next(
            (
                obj
                for obj in bpy.context.scene.objects
                if obj.type == "MESH"
                and bool(obj.get("toonstudio_authored_hair_outline"))
                and obj.name.startswith(main.name)
            ),
            None,
        )
        if outline is None:
            raise RuntimeError(f"missing authored outline for {main.name}")
        result.append((lod, main, outline))
    result.sort(key=lambda value: value[0])
    if [lod for lod, _, _ in result] != [0, 1, 2]:
        raise RuntimeError(f"expected authored-hair LODs 0/1/2, found {[value[0] for value in result]}")
    return result


def main() -> None:
    args = _args()
    package_dir = Path(args.package_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    prefix = _safe_public_prefix(args.public_prefix)
    package = _read_json(package_dir / "character-package.json")
    quality = package.get("quality")
    if not isinstance(quality, dict) or quality.get("passed") is not True:
        raise RuntimeError("Blender package did not pass its quality gate")
    score = float(quality.get("score", 0))
    minimum = float(quality.get("minimumScore", 0))
    if score < max(90.0, minimum):
        raise RuntimeError(f"Blender package quality score is too low: {score}")
    capabilities = package.get("capabilities")
    authored = capabilities.get("authoredHair") if isinstance(capabilities, dict) else None
    if not isinstance(authored, dict) or authored.get("enabled") is not True:
        raise RuntimeError("Blender package has no approved authored hair")
    triangles = authored.get("lodTriangles")
    if not isinstance(triangles, list) or len(triangles) != 3:
        raise RuntimeError("Blender package has no three-LOD triangle receipt")
    style = str(authored.get("style") or "authored").strip().lower().replace(" ", "-")
    if not style or any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for ch in style):
        raise RuntimeError(f"unsafe hair style id: {style!r}")

    blend_receipt = package.get("files", {}).get("blend") if isinstance(package.get("files"), dict) else None
    if not isinstance(blend_receipt, dict):
        raise RuntimeError("Blender package has no .blend receipt")
    blend_path = package_dir / str(blend_receipt.get("path", ""))
    if not blend_path.is_file() or _sha(blend_path) != str(blend_receipt.get("sha256", "")):
        raise RuntimeError("Blender package .blend receipt does not match")
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))

    output_dir.mkdir(parents=True, exist_ok=True)
    parts_dir = output_dir / "hair"
    parts_dir.mkdir(parents=True, exist_ok=True)
    lod_receipts: list[dict[str, Any]] = []
    common_main = "TS_CanonicalHair"
    common_outline = "TS_CanonicalHair_Outline"
    for lod, main_obj, outline_obj in _hair_lods():
        copies = [
            _duplicate_for_export(main_obj, common_main),
            _duplicate_for_export(outline_obj, common_outline),
        ]
        try:
            file_name = f"{args.model_id}-{style}-lod{lod}.glb"
            path = parts_dir / file_name
            _export_glb(path, copies)
            lod_receipts.append({
                "id": f"lod{lod}",
                "sourceFile": f"{prefix}/hair/{file_name}",
                "sourceSha256": _sha(path),
                "maximumProjectedHeightPx": [4096, 480, 160][lod],
                "triangles": int(triangles[lod]),
                "bytes": path.stat().st_size,
            })
        finally:
            bpy.ops.object.select_all(action="DESELECT")
            for duplicate in copies:
                _remove_object(duplicate)

    # The runtime sorts thresholds ascending. LOD2 is for the smallest projection, LOD0 the closest.
    lod_receipts.sort(key=lambda value: value["maximumProjectedHeightPx"])
    lod0 = next(receipt for receipt in lod_receipts if receipt["id"] == "lod0")
    quality_report_source = package_dir / str(quality.get("report", "quality-report.json"))
    if not quality_report_source.is_file():
        raise RuntimeError("quality report referenced by the package is missing")
    quality_report_target = output_dir / "quality-report.json"
    shutil.copyfile(quality_report_source, quality_report_target)

    accepted_at = args.accepted_at
    # Parse once to reject accidental non-ISO release metadata while preserving the supplied deterministic text.
    datetime.fromisoformat(accepted_at.replace("Z", "+00:00")).astimezone(timezone.utc)
    manifest = {
        "schemaVersion": 2,
        "identity": {
            "assetId": args.model_id,
            "version": "2026.09.09-part-v1",
            "topologyFamily": "toon-standard",
            "topologyRevision": f"source-{args.model_sha256[:12]}",
            "rigRevision": "vrm1-humanoid",
            "morphRevision": "blender-semantic-v1",
            "rendererRevision": "toon-authored-hair-v1",
        },
        "runtime": {
            "format": "vrm-1.0",
            "modelFile": args.model_url,
            "unitScale": 1,
            "upAxis": "Y",
            "forwardAxis": "-Z",
        },
        "semantics": {"nodes": {}, "materials": {}, "renderIds": {}},
        "morphs": {},
        "fitting": {"bodyMeasurements": {}, "sockets": [], "colliders": []},
        "parts": [{
            "id": f"hair:{args.model_id}:{style}",
            "label": f"{style} · Blender Authored",
            "slot": "hair",
            "thumbnail": args.thumbnail,
            "source": {
                "format": "glb-part",
                "file": lod0["sourceFile"],
                "sha256": lod0["sourceSha256"],
                "selector": {"kind": "nodes", "names": [common_main, common_outline]},
            },
            "binding": {"kind": "rigid-follow", "targetBone": "head"},
            "fitting": {
                "drivers": [],
                "clearanceMeters": 0,
                "hideTargetPart": True,
                "correctiveMorphs": {},
            },
            "lods": [
                {
                    "id": receipt["id"],
                    "sourceFile": receipt["sourceFile"],
                    "sourceSha256": receipt["sourceSha256"],
                    "maximumProjectedHeightPx": receipt["maximumProjectedHeightPx"],
                }
                for receipt in lod_receipts
            ],
            "semanticLayers": ["hair-front", "hair-back"],
            "quality": {
                "minimumScore": score,
                "accepted": True,
                "reportFile": f"{prefix}/quality-report.json",
                "goldenPoseIds": ["standing", "action"],
                "goldenCameraIds": ["front", "three-quarter", "side", "back"],
            },
            "provenance": {
                "creatorId": "Polygonal Mind + ToonStudio Blender Kit",
                "sourceLicense": "CC0-1.0",
                "commercialUse": True,
                "redistribution": True,
                "derivativeUse": True,
            },
        }],
        "exports": {"supportedPasses": [], "psdLayerMap": {}},
        "quality": {
            "reportFile": f"{prefix}/quality-report.json",
            "minimumScore": score,
            "acceptedAt": accepted_at,
            "acceptedBy": "toonstudio-blender-5.2-quality-gate",
            "goldenPoseIds": ["standing", "action"],
            "goldenCameraIds": ["front", "three-quarter", "side", "back"],
        },
        "provenance": {
            "creatorId": "Polygonal Mind + ToonStudio Blender Kit",
            "sourceLicense": "CC0-1.0",
            "commercialUse": True,
            "redistribution": True,
            "contentSha256": args.model_sha256,
        },
    }
    (output_dir / "canonical-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    receipts = {
        "schemaVersion": 1,
        "modelId": args.model_id,
        "style": style,
        "qualityScore": score,
        "lods": lod_receipts,
        "canonicalManifestSha256": _sha(output_dir / "canonical-manifest.json"),
    }
    (output_dir / "part-receipts.json").write_text(
        json.dumps(receipts, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(receipts, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
