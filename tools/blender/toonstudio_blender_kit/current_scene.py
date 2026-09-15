"""Non-destructive re-export of the edited scene; never re-imports or regenerates it."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import shutil
import tempfile
import uuid

import bpy

from .contracts import PipelineConfig, PipelineReport, write_json
from .face import FaceBuildResult, _normalize
from .geometry import HairBuildResult
from .package_archive import create_runtime_archive
from .pipeline import (
    PipelineExecution, PipelineFailure, _assert_blender_version, _build_manifest,
    _call_operator, _character_export_objects, _detect_vrm_addon_version,
    _export_glb, _export_vrm, _find_primary_armature, _safe_output_dir,
)
from .quality import audit_character


def _existing_authoring(meshes):
    hair_objects = tuple(sorted(
        (obj for obj in meshes if obj.get("toonstudio_authored_hair") and not obj.get("toonstudio_authored_hair_outline")),
        key=lambda obj: (int(obj.get("toonstudio_lod", 0)), obj.name),
    ))
    outlines = tuple(obj for obj in meshes if obj.get("toonstudio_authored_hair_outline"))
    hair = HairBuildResult(
        hair_objects, outlines,
        tuple(sum(max(0, len(face.vertices) - 2) for face in obj.data.polygons) for obj in hair_objects),
        str(hair_objects[0].get("toonstudio_hair_style", "authored")),
    ) if hair_objects else None
    face_objects, shape_keys, confidence = [], [], []
    for obj in meshes:
        if obj.data.shape_keys is None:
            continue
        keys = [key.name for key in obj.data.shape_keys.key_blocks
                if obj.get(f"toonstudio_shape_{_normalize(key.name)}_generated", False)]
        if keys:
            face_objects.append(obj.name)
            shape_keys.extend(f"{obj.name}:{key}" for key in keys)
            confidence.append(float(obj.get("toonstudio_face_detection_confidence", 0)))
    face = FaceBuildResult(tuple(face_objects), tuple(shape_keys), (), min(confidence), "preserved-semantic-shapes") if shape_keys else None
    return hair, face


def export_current_character_package(config: PipelineConfig, *, project_root: str | Path) -> PipelineExecution:
    """Publish a validated new revision, preserving current objects and the saved project path.

    No art direction changes, no automatic repairs, no render-camera creation, no
    network service, and no previous package cleanup. A failure removes only the
    staging directory created by this invocation.
    """
    config.validate()
    _assert_blender_version()
    if bpy.context.mode != "OBJECT":
        raise PipelineFailure("Switch to Object Mode before exporting the current character")
    scene = bpy.context.scene
    tagged = [obj for obj in scene.objects if obj.get("toonstudio_character_id") == config.character_id]
    # Include owned children and legacy generated hair (created after the original
    # pipeline's identity annotation). Never mix hair from another tagged character.
    identities = {obj.get("toonstudio_character_id") for obj in scene.objects if obj.get("toonstudio_character_id")}
    if not tagged and identities:
        raise PipelineFailure("Current scene character ID does not match the selected config")
    objects = list(tagged) if tagged else list(scene.objects)
    if tagged:
        owned = set(tagged)
        changed = True
        while changed:
            changed = False
            for obj in scene.objects:
                if obj in owned or obj.get("toonstudio_character_id"):
                    continue
                legacy_hair = identities == {config.character_id} and (
                    obj.get("toonstudio_authored_hair") or obj.get("toonstudio_authored_hair_outline")
                )
                if obj.parent in owned or legacy_hair:
                    owned.add(obj)
                    objects.append(obj)
                    changed = True
    meshes = [obj for obj in objects if obj.type == "MESH" and not obj.get("toonstudio_replaced_hair")]
    if not meshes:
        raise PipelineFailure("Current character contains no mesh objects")
    armature = _find_primary_armature(objects)
    if config.export.apply_modifiers and any(obj.data.shape_keys for obj in meshes):
        raise PipelineFailure("Set export.applyModifiers=false to preserve existing shape keys")
    if config.quality.source_non_manifold_allowances:
        if scene.get("toonstudio_provenance_sourceSha256") != config.provenance.get("sourceSha256"):
            raise PipelineFailure("Source topology allowance requires the matching imported scene provenance")
    hair, face = _existing_authoring(meshes)
    audit = audit_character(config, meshes, armature, hair=hair, face=face)
    if not audit.passed:
        reasons = "; ".join(issue.message for issue in audit.issues if issue.severity == "error")
        raise PipelineFailure(f"Current scene did not pass its quality gate ({audit.score}): {reasons or 'minimum score not reached'}")
    if not (config.export.glb or config.export.vrm):
        raise PipelineFailure("Enable a GLB or VRM runtime export")
    base = _safe_output_dir(Path(project_root).resolve(), config)
    revisions = base.with_name(base.name + "-revisions")
    if revisions.is_symlink():
        raise PipelineFailure("Revision directory must not be a symlink")
    revisions.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".export-", dir=revisions))
    final = revisions / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:8])
    active, camera = bpy.context.view_layer.objects.active, scene.camera
    frame, subframe = scene.frame_current, scene.frame_subframe
    try:
        outputs = {}
        glb_objects = _character_export_objects(meshes, armature, include_lods=True, include_outlines=True)
        if config.export.blend:
            path = staging / f"{config.character_id}.blend"
            result = _call_operator(bpy.ops.wm.save_as_mainfile, filepath=str(path), copy=True, compress=True)
            if "FINISHED" not in result or not path.is_file():
                raise PipelineFailure("Current scene .blend copy failed")
            outputs["blend"] = path.name
        if config.export.glb:
            path = staging / f"{config.character_id}.glb"
            _export_glb(path, config, glb_objects)
            outputs["glb"] = path.name
        if config.export.vrm:
            if armature is None:
                raise PipelineFailure("VRM export requires an armature")
            path = staging / f"{config.character_id}.vrm"
            vrm_objects = _character_export_objects(meshes, armature, include_lods=False, include_outlines=False)
            _export_vrm(path, armature, vrm_objects, config)
            outputs["vrm"] = path.name
        outputs["qualityReport"] = "quality-report.json"
        report = PipelineReport(
            character_id=config.character_id, config_digest=config.digest(),
            blender_version=bpy.app.version_string, vrm_addon_version=_detect_vrm_addon_version(),
            score=audit.score, passed=audit.passed, metrics={**dict(audit.metrics), "exportMode": "current-scene", "reviewRendersGenerated": False},
            issues=audit.issues, outputs=outputs,
        )
        write_json(staging / "quality-report.json", report.to_mapping())
        manifest = _build_manifest(config, report, outputs, staging, hair, face, (), None, None)
        manifest["provenance"]["exportMode"] = "current-scene"
        # Existing VRM bindings are preserved by the official exporter, not regenerated here.
        manifest["capabilities"]["vrmCustomExpressions"]["status"] = "preserved-not-rebound"
        write_json(staging / "character-package.json", manifest)
        create_runtime_archive(staging, manifest)
        staging.rename(final)
        return PipelineExecution(report, manifest, final)
    finally:
        scene.camera = camera
        scene.frame_set(frame, subframe=subframe)
        bpy.context.view_layer.objects.active = active
        if staging.exists():
            shutil.rmtree(staging)
