#!/usr/bin/env python3
"""Materialize reviewed candidates locally; never publish or push a Git ref.

Usage: python this.py artifacts/studio-premium-world-v1 config/studio-premium-world-review-v1.json
An explicit, hash-bound visual decision and successful real GLB verification are required.
"""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps/web/public"
CC0 = PUBLIC / "assets/studio/cc0-20260906"
ENV = PUBLIC / "assets/3d/environments/premium-world-v1"
DOMAIN = ROOT / "apps/web/src/domains/creator"
GENERATOR = "scripts/blender/generate_studio_premium_world_v1.py"
SOURCE = "https://github.com/blue45f/toonspectrum/blob/main/" + GENERATOR


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_text())


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def patch(path, old, new, count=1):
    text = path.read_text()
    if text.count(old) != count:
        raise ValueError("Integration anchor changed: " + str(path))
    path.write_text(text.replace(old, new))


def integrate():
    delivery = DOMAIN / "studio-cc0-asset-delivery.ts"
    patch(delivery, 'import type { StudioAsset }', 'import { isTrustedStudioCc0Source } from "./studio-cc0-source-policy";\n\nimport type { StudioAsset }')
    patch(delivery, '"model" | "effect-mask" | "surface-texture";', '"model" | "effect-mask" | "surface-texture" | "illustration";')
    patch(delivery, '["model", "effect-mask", "surface-texture"].includes', '["model", "effect-mask", "surface-texture", "illustration"].includes')
    patch(delivery, '  "surface-material": "표면 재질",', '  "surface-material": "표면 재질",\n  "scene-background": "2D 배경 · 거리 · 실내",\n  "prop-illustration": "2D 투명 소품",')
    old = '''    const source = new URL(license.sourceUrl);
    if (source.protocol !== "https:" || !["kenney.nl", "ambientcg.com", "polyhaven.com"].includes(source.hostname)
      || source.username || source.password || source.port) throw new TypeError("확인되지 않은 에셋 공급처입니다.");'''
    patch(delivery, old, '''    if (!isTrustedStudioCc0Source(license.provider, license.sourceUrl)) {
      throw new TypeError("확인되지 않은 에셋 공급처입니다.");
    }''')
    curation = DOMAIN / "studio-cc0-curation.ts"
    patch(curation, '  if (asset.kind !== "model") return asset.kind === "effect-mask" ? "투명 효과" : "원본 표면 재질";', '  if (asset.kind === "illustration") return "2D 배경 · 투명 소품";\n  if (asset.kind !== "model") return asset.kind === "effect-mask" ? "투명 효과" : "원본 표면 재질";')
    panel = DOMAIN / "StudioCc0AssetLibraryPanel.tsx"
    patch(panel, '{id: "all", label: "전체"}, {id: "model", label: "3D 소품"},', '{id: "all", label: "전체"}, {id: "model", label: "3D 소품"},\n  {id: "illustration", label: "2D 배경 · 소품"},')
    patch(panel, '효과·재질 이미지는 캔버스에 바로 삽입합니다.', '2D 배경·투명 소품·효과·재질은 캔버스에 바로 삽입합니다.')
    patch(panel, 'studioCc0AssetUrl(preview.previewPath ?? preview.path)', 'studioCc0AssetUrl(preview.kind === "illustration" ? preview.path : preview.previewPath ?? preview.path)')
    catalog = DOMAIN / "bg3d/studio-bg3d-environment-catalog.ts"
    patch(catalog, 'import refinedV6Manifest', 'import premiumWorldManifest from "../../../../public/assets/3d/environments/premium-world-v1/manifest.json";\nimport refinedV6Manifest')
    patch(catalog, '    | "scripts/blender/generate_studio_environment_expansion_v1.py";', '    | "scripts/blender/generate_studio_environment_expansion_v1.py"\n    | "scripts/blender/generate_studio_premium_world_v1.py";')
    block = '''export const STUDIO_BG3D_ENVIRONMENT_ASSETS_PREMIUM_WORLD_V1 = Object.freeze(
  premiumWorldManifest.assets.map((asset) => defineEnvironment({
    id: asset.id,
    name: asset.name,
    description: asset.description,
    theme: asset.theme as StudioBg3dEnvironmentTheme,
    tags: asset.tags,
    fileName: asset.fileName as `${string}.glb`,
    url: asset.url as StudioBg3dEnvironmentAsset["url"],
    thumbnailUrl: asset.thumbnailUrl as StudioBg3dEnvironmentAsset["thumbnailUrl"],
    byteSize: asset.byteSize,
    sha256: asset.sha256 as `sha256:${string}`,
    bounds: asset.bounds as [number, number, number],
    camera: {
      position: asset.camera.position as [number, number, number],
      target: asset.camera.target as [number, number, number],
      fovDegrees: asset.camera.fovDegrees,
    },
  }, Object.freeze({
    ...V3_PROVENANCE,
    origin: "original-procedural-with-cc0-sources",
    generator: "scripts/blender/generate_studio_premium_world_v1.py",
    sources: Object.freeze(asset.sourceMaterials.map((source) => source.sourceUrl)),
  }))),
);

'''
    patch(catalog, 'export const STUDIO_BG3D_ENVIRONMENT_ASSETS = Object.freeze([', block + 'export const STUDIO_BG3D_ENVIRONMENT_ASSETS = Object.freeze([\n  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_PREMIUM_WORLD_V1,')


def main():
    if len(sys.argv) != 3:
        raise ValueError("Expected candidate stage and explicit visual decision file")
    stage = Path(sys.argv[1]).resolve()
    if not stage.is_relative_to(ROOT / "artifacts"):
        raise ValueError("Candidates must remain in isolated artifacts")
    decision_path = Path(sys.argv[2]).resolve()
    decisions = load(decision_path)
    if decisions.get("schema") != "toonspectrum.premium-world-review.v1":
        raise ValueError("Unsupported visual review schema")
    runtime = load(stage / "runtime-review/report.json")
    assert not runtime["failures"] and len(runtime["results"]) == 24
    runtime_by_id = {r["id"]: r for r in runtime["results"]}
    decision_by_id = {r["id"]: r for r in decisions["assets"]}
    assert len(decision_by_id) == len(decisions["assets"]) == 24
    records = [load(p) for p in sorted((stage / "assets").glob("*/SOURCE.json"))]
    assert len(records) == 24 and sum(r["kind"] == "scene" for r in records) == 8
    original_bytes = (CC0 / "manifest.json").read_bytes()
    catalog = json.loads(original_bytes)
    original_ids = {r["id"] for r in catalog["assets"]}
    original_hashes = {r["sha256"] for r in catalog["assets"]}
    for r in records:
        assert re.fullmatch(r"ts-world-[a-z0-9-]+", r["id"])
        assert re.fullmatch(r"[a-z0-9-]+", r["slug"])
        assert r["generator"] == GENERATOR and r["sourceUrl"] == SOURCE and r["license"] == "CC0-1.0"
        folder = stage / "assets" / r["id"]
        raw = (folder / (r["slug"] + ".glb")).read_bytes()
        image = (folder / (r["slug"] + ".png")).read_bytes()
        assert digest(raw) == r["sha256"] and len(raw) == r["byteSize"]
        assert r["id"] not in original_ids and r["sha256"] not in original_hashes
        decision = decision_by_id[r["id"]]
        assert decision["decision"] == "admit" and decision["sha256"] == digest(raw)
        assert decision["renderSha256"] == digest(image) and decision["reason"].strip()
        proof = runtime_by_id[r["id"]]
        assert proof["sourceSha256"] == digest(raw) and proof["validator"]["errors"] == 0
        assert len(proof["frames"]) == 3 and all(frame["foregroundPixels"] > 0 for frame in proof["frames"])
        assert all(budget["ok"] for budget in proof["budgets"])
        assert not (CC0 / "assets" / r["id"]).exists()
        assert all(source["license"] == "CC0-1.0" and source["sourceUrl"].startswith("https://polyhaven.com/a/") for source in r["sourceMaterials"])
    assert not ENV.exists(), "Never replace an immutable asset revision"
    ENV.mkdir(parents=True)
    (ENV / "thumbnails").mkdir()
    additions = []
    environments = []
    resources = []
    review_path = "docs/reports/studio-premium-world-v1/visual-decisions.json"
    for r in records:
        folder = stage / "assets" / r["id"]
        destination = CC0 / "assets" / r["id"]
        destination.mkdir(parents=True)
        image = Image.open(folder / (r["slug"] + ".png")).convert("RGBA")
        assert image.size == (r["width"], r["height"])
        # Lossless WebP preserves the rendered pixels and prop alpha; never upsample.
        image_path = destination / (r["slug"] + ".webp")
        image.save(image_path, format="WEBP", lossless=True, method=6, exact=True)
        decoded = Image.open(image_path).convert("RGBA")
        assert decoded.tobytes() == image.tobytes(), "Delivery pixels changed"
        preview = image.copy(); preview.thumbnail((512, 512))
        preview_path = destination / "preview.webp"
        preview.save(preview_path, format="WEBP", lossless=True, method=6)
        common = {"name":r["name"] + " · " + r["slug"].replace("-", " "),
            "style":"detailed-pbr", "role":"finished-asset", "visualReviewed":True,
            "visualReviewLevel":"contact-sheet-visual-triage", "visualReviewSource":review_path,
            "curationStatus":"selected-after-visual-triage", "allAnglesArtisticallyApproved":False,
            "license":{"id":"CC0-1.0", "provider":"ToonSpectrum", "sourceUrl":SOURCE,
                "commercialUse":True, "redistributionAllowed":True, "attributionRequired":False}}
        raw_image = image_path.read_bytes()
        illustration = {**common, "id":r["id"] + "-2d", "kind":"illustration",
            "category":"scene-background" if r["kind"] == "scene" else "prop-illustration",
            "path":image_path.relative_to(CC0).as_posix(), "previewPath":preview_path.relative_to(CC0).as_posix(),
            "bytes":len(raw_image), "sha256":digest(raw_image), "width":r["width"], "height":r["height"],
            "browserRenderVerified":False, "derivedFromModelId":r["id"], "originalRenderSha256":digest((folder/(r["slug"]+".png")).read_bytes())}
        additions.append(illustration)
        if r["kind"] == "prop":
            model = destination / (r["slug"] + ".glb")
            shutil.copy2(folder/model.name, model)
            additions.append({**common, "id":r["id"], "kind":"model", "category":r["category"],
                "path":model.relative_to(CC0).as_posix(), "previewPath":preview_path.relative_to(CC0).as_posix(),
                "bytes":r["byteSize"], "sha256":r["sha256"], "sourceBounds":r["bounds"],
                "browserRenderVerified":True, "studioRuntimeVerified":True})
        else:
            model = ENV / (r["slug"] + ".glb")
            shutil.copy2(folder/model.name, model)
            thumbnail = ENV / "thumbnails" / (r["slug"] + ".png")
            preview.save(thumbnail)
            environments.append({**r, "theme":r["category"], "fileName":model.name,
                "description":r["name"] + " · 재질·구조·시설물을 갖춘 미터 단위 장면. 전면 개방형 구도이며 조명은 스튜디오에서 조정합니다.",
                "url":"/" + model.relative_to(PUBLIC).as_posix(), "thumbnailUrl":"/" + thumbnail.relative_to(PUBLIC).as_posix(),
                "sha256":"sha256:" + r["sha256"], "visualReviewed":True, "browserRenderVerified":True,
                "studioRuntimeVerified":True, "visualReviewLevel":"contact-sheet-visual-triage"})
        save(destination / "SOURCE.json", {**r,"visualDecision":decision_by_id[r["id"]], "runtimeEvidence":runtime_by_id[r["id"]],
            "imageDelivery":{"path":illustration["path"],"sha256":illustration["sha256"],"lossless":True,"upscaled":False}})
        resources.append({"id":r["id"],"kind":r["kind"],"modelPath":model.relative_to(PUBLIC).as_posix(),
            "sha256":r["sha256"],"imagePath":illustration["path"],"imageSha256":illustration["sha256"]})
    next_catalog = {**catalog, "assets":additions + catalog["assets"]}
    assert len(next_catalog["assets"]) <= 2400
    assert len(json.dumps(next_catalog).encode()) < 4*1024*1024
    assert len({r["id"] for r in next_catalog["assets"]}) == len(next_catalog["assets"])
    assert (CC0/"manifest.json").read_bytes() == original_bytes
    save(CC0/"manifest.json", next_catalog)
    save(ENV/"manifest.json", {"version":"premium-world-v1","assets":environments})
    save(PUBLIC/"assets/studio/premium-world-v1/manifest.json", {"version":1,"originalModelCount":24,"derivedImageCount":24,"assets":resources})
    sources = sorted({s["sourceUrl"] for r in records for s in r["sourceMaterials"]})
    licenses = "# Studio premium world v1\n\nOriginal architecture, fixtures, furniture, geometry and renders: ToonSpectrum, CC0-1.0.\n\nGenerator: `"+GENERATOR+"`.\nLicense: https://creativecommons.org/publicdomain/zero/1.0/\n\nEmbedded PBR surfaces: Poly Haven, CC0-1.0.\n\n" + "\n".join("- "+source for source in sources) + "\n\n24 original 3D models and 24 matching 2D render derivatives; derivatives are not additional original models.\nNo runtime external resources. Preview review is not an all-angle artistic or real-device performance approval.\n"
    (ENV/"LICENSES.md").write_text(licenses)
    (PUBLIC/"assets/studio/premium-world-v1/LICENSES.md").write_text(licenses)
    report_root = ROOT/"docs/reports/studio-premium-world-v1"
    save(report_root/"visual-decisions.json", decisions)
    save(report_root/"runtime-verification.json", runtime)
    save(report_root/"delivery.json", {"originalModels":24,"scenes":8,"props":16,"derived2dImages":24,
        "previousCc0CatalogCount":len(catalog["assets"]),"addedCc0Entries":len(additions),
        "preservedPreviousAssets":True,"beforeCatalogSha256":digest(original_bytes),
        "afterCatalogSha256":digest((CC0/"manifest.json").read_bytes()),"resources":resources})
    # Use exactly the reviewed generator bytes (including authored stair/label corrections).
    shutil.copy2(stage/"generator.py", ROOT/GENERATOR)
    integrate()
    print(json.dumps({"models":24,"scenes":8,"props":16,"derived2dImages":24,"cc0EntriesAdded":len(additions)}, indent=2))


if __name__ == "__main__":
    main()
