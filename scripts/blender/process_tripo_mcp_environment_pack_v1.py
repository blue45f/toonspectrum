#!/usr/bin/env python3
"""Normalize and render free-wallet Tripo MCP outputs for the BG3D library.

Run with Blender 5.2 LTS, for example:

    blender --factory-startup --background --python scripts/blender/process_tripo_mcp_environment_pack_v1.py -- \
      --input-dir ~/.cache/toonspectrum-3d-generation/tripo-mcp-20260925/raw \
      --registry ~/.cache/toonspectrum-3d-generation/tripo-mcp-20260925/tasks.json \
      --output-dir apps/web/public/assets/3d/environments/mcp-free-v1 \
      --qa-dir ~/.cache/toonspectrum-3d-generation/tripo-mcp-20260925/qa

The script never reads an API key. It only processes already-downloaded GLB files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bpy
from mathutils import Matrix, Vector


@dataclass(frozen=True)
class AssetSpec:
    asset_id: str
    target_height_m: float
    name_ko: str
    theme: str
    description: str
    tags: tuple[str, ...]
    semantic_parts: tuple[str, ...]


ASSETS: tuple[AssetSpec, ...] = (
    AssetSpec(
        "webtoon_neighborhood_bus_stop", 2.65, "웹툰 동네 버스 정류장", "transit",
        "유리 패널·목재 벤치·노선 안내판·안전 볼라드와 낮은 승강장 기단이 결합된 한국형 동네 정류장 모듈",
        ("webtoon", "bus stop", "shelter", "bench", "transit", "웹툰", "버스 정류장", "벤치", "교통"),
        ("roof canopy", "metal frame", "glass side panels", "wood bench", "blank information board", "two safety bollards", "curb platform"),
    ),
    AssetSpec(
        "webtoon_school_gate_module", 3.8, "웹툰 한국 학교 정문", "education",
        "석재·벽돌 문주, 슬라이딩 철문, 보행자 출입구와 담장 날개를 묶은 학교 정문 배경 모듈",
        ("webtoon", "school", "gate", "education", "korea", "웹툰", "학교", "정문", "담장"),
        ("gate piers", "sliding metal gate", "pedestrian gate", "boundary wall wings", "blank plaque", "raised planter"),
    ),
    AssetSpec(
        "webtoon_rooftop_stairwell_entry", 3.25, "웹툰 학교 옥상 계단실", "education",
        "방화문·차양·배관·환기 설비와 옥상 안전 난간이 결합된 한국 학교 옥상 계단실 모듈",
        ("webtoon", "school", "rooftop", "stairwell", "utility", "웹툰", "학교", "옥상", "계단실"),
        ("concrete utility room", "fire doors", "door awning", "ventilation duct", "electrical conduit", "pipe bundle", "safety railings"),
    ),
    AssetSpec(
        "webtoon_alley_food_cart", 2.55, "웹툰 골목 포장마차 카트", "urban",
        "스테인리스 조리대·붉은 차양·진열대·버너·수납과 간이 의자를 갖춘 이동식 골목 포장마차",
        ("webtoon", "street food", "food cart", "alley", "urban", "웹툰", "포장마차", "노점", "골목"),
        ("red canopy", "stainless counter", "glass display", "cooking burners", "storage drawers", "wheel chassis", "side stool"),
    ),
    AssetSpec(
        "webtoon_one_room_furniture_cluster", 2.25, "웹툰 원룸 가구 클러스터", "home",
        "싱글 침대·책상·의자·옷장·책장·조명과 작은 생활 소품을 한 번에 배치하는 원룸 세트",
        ("webtoon", "one room", "furniture", "bed", "desk", "home", "웹툰", "원룸", "가구", "침실"),
        ("single bed", "study desk", "office chair", "wardrobe", "bookshelf", "floor lamp", "rug", "side table", "potted plant"),
    ),
    AssetSpec(
        "webtoon_apartment_lobby_module", 3.4, "웹툰 아파트 공동현관", "home",
        "유리 출입문·석재 포털·택배함·인터폰·벤치·공지판으로 구성된 현대 아파트 공동현관 모듈",
        ("webtoon", "apartment", "lobby", "entrance", "parcel locker", "웹툰", "아파트", "공동현관", "택배함"),
        ("glass entry doors", "stone portal", "parcel lockers", "intercom panel", "entry mat", "bench", "notice board", "security camera"),
    ),
    AssetSpec(
        "webtoon_hanok_courtyard_gate", 4.2, "웹툰 한옥 안마당 대문", "heritage",
        "목재 기둥·기와지붕·격자문·석재 문턱·담장 날개와 옹기를 갖춘 한옥 대문 배경 모듈",
        ("webtoon", "hanok", "gate", "heritage", "korea", "웹툰", "한옥", "대문", "기와"),
        ("timber columns", "tiled hip roof", "lattice doors", "stone threshold", "plaster wall wings", "brass fittings", "onggi jars"),
    ),
    AssetSpec(
        "webtoon_convenience_store_fixture_cluster", 2.35, "웹툰 편의점 집기 클러스터", "retail",
        "상품 진열대·음료 냉장고·계산대·전자레인지 선반·분리수거함과 장바구니를 묶은 편의점 집기 세트",
        ("webtoon", "convenience store", "retail", "shelves", "refrigerator", "웹툰", "편의점", "진열대", "계산대"),
        ("product gondolas", "glass-door refrigerator", "checkout counter", "microwave shelf", "sorting cabinet", "basket stack", "blank aisle sign"),
    ),
    AssetSpec(
        "webtoon_neighborhood_police_box", 4.0, "웹툰 동네 지구대 외관", "urban",
        "유리 출입구·차양·경사로·보안 설비·자전거 거치대와 화단을 갖춘 소형 지구대 외관 모듈",
        ("webtoon", "police box", "public building", "urban", "korea", "웹툰", "지구대", "파출소", "공공건물"),
        ("pale facade", "glazed entrance", "entry canopy", "accessible ramp", "security camera", "bicycle rack", "planter boxes", "blank sign panels"),
    ),
    AssetSpec(
        "webtoon_riverside_park_pavilion", 3.55, "웹툰 한강 공원 쉼터", "urban",
        "곡면 금속 지붕·목재 천장·벤치·피크닉 테이블·음수대와 자전거 거치대를 갖춘 강변 공원 쉼터",
        ("webtoon", "riverside", "park", "pavilion", "bench", "웹툰", "한강", "공원", "쉼터"),
        ("curved metal roof", "timber ceiling", "slender columns", "integrated benches", "picnic table", "drinking fountain", "sorting bins", "bicycle stand", "deck platform"),
    ),
    AssetSpec(
        "webtoon_korean_alley_stairway_module", 5.2, "웹툰 한국 골목 계단", "urban",
        "콘크리트 계단·벽돌과 미장 담장·스테인리스 난간·배수로·계량기함과 화분을 묶은 경사지 골목 계단 모듈",
        ("webtoon", "korean alley", "stairs", "hillside", "urban", "웹툰", "한국 골목", "계단", "경사지"),
        ("concrete stairway", "brick plaster walls", "stainless handrails", "drainage channel", "landing", "utility meter boxes", "security lights", "potted plants"),
    ),
    AssetSpec(
        "webtoon_cafe_counter_fixture_cluster", 2.8, "웹툰 카페 카운터 집기", "retail",
        "목재·석재 카운터, 에스프레소 머신, 그라인더, 진열장, 냉장고, 선반과 스툴을 한 번에 배치하는 카페 집기 세트",
        ("webtoon", "cafe", "counter", "coffee", "retail", "웹툰", "카페", "카운터", "커피"),
        ("service counter", "espresso machine", "coffee grinder", "pastry display", "sink", "undercounter refrigerator", "back bar shelving", "blank menu board", "stools", "pendant lamps"),
    ),
)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--qa-dir", type=Path, required=True)
    parser.add_argument("--metrics-file", type=Path)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError("Imported model contains no mesh bounds")
    return (
        Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))),
        Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points))),
    )


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_preview_stage(scene: bpy.types.Scene, dimensions: Vector) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    radius = max(dimensions.x, dimensions.y, dimensions.z, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=max(dimensions.x, dimensions.y, 1.0) * 4.2, location=(0, 0, -0.012))
    plane = bpy.context.object
    plane.name = "PreviewGround"
    ground = bpy.data.materials.new("PreviewGroundMaterial")
    ground.diffuse_color = (0.055, 0.068, 0.10, 1)
    ground.roughness = 0.9
    plane.data.materials.append(ground)

    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.lens = 52

    lights: list[bpy.types.Object] = []
    for name, location, energy, size, color in (
        ("PreviewKey", (radius * 1.6, -radius * 1.4, radius * 2.2), 1450, radius * 1.8, (1.0, 0.87, 0.72)),
        ("PreviewFill", (-radius * 1.4, -radius * 0.6, radius * 1.3), 900, radius * 1.5, (0.58, 0.73, 1.0)),
        ("PreviewRim", (0, radius * 1.5, radius * 1.8), 1150, radius * 1.4, (0.74, 0.86, 1.0)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = location
        look_at(light, Vector((0, 0, dimensions.z * 0.42)))
        lights.append(light)
    return camera, [plane, *lights]


def render_angle(scene: bpy.types.Scene, camera: bpy.types.Object, dimensions: Vector, output: Path, angle_degrees: float) -> None:
    radius = max(dimensions.x, dimensions.y, dimensions.z, 1.0)
    angle = math.radians(angle_degrees)
    horizontal = radius * 2.15
    camera.location = Vector((math.cos(angle) * horizontal, math.sin(angle) * horizontal, max(dimensions.z * 1.12, radius * 1.0)))
    look_at(camera, Vector((0, 0, dimensions.z * 0.43)))
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def process_asset(spec: AssetSpec, source: Path, output_dir: Path, qa_dir: Path, task: dict[str, Any]) -> dict[str, Any]:
    reset_scene()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    bpy.ops.import_scene.gltf(filepath=str(source), merge_vertices=True)

    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    model_objects = [obj for obj in bpy.context.scene.objects if obj.type not in {"CAMERA", "LIGHT"}]
    mesh_objects = [obj for obj in model_objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError(f"{spec.asset_id}: no meshes")
    roots = [obj for obj in model_objects if obj.parent is None]
    if not roots:
        raise RuntimeError(f"{spec.asset_id}: no scene root")

    minimum, maximum = mesh_bounds(mesh_objects)
    current_height = maximum.z - minimum.z
    if current_height <= 0:
        raise RuntimeError(f"{spec.asset_id}: invalid height")
    scale = spec.target_height_m / current_height
    center = (minimum + maximum) * 0.5
    transform = Matrix.Translation(Vector((-center.x * scale, -center.y * scale, -minimum.z * scale))) @ Matrix.Scale(scale, 4)
    for obj in roots:
        obj.matrix_world = transform @ obj.matrix_world

    minimum, maximum = mesh_bounds(mesh_objects)
    dimensions = maximum - minimum
    main_root = bpy.data.objects.new(f"TS_ENV_{spec.asset_id}_Root", None)
    bpy.context.scene.collection.objects.link(main_root)
    model_objects.append(main_root)
    for child in roots:
        world = child.matrix_world.copy()
        child.parent = main_root
        child.matrix_world = world

    prompt = str(task.get("prompt", ""))
    root_metadata = {
        "asset_id": f"ts-bg3d-{spec.asset_id}-mcp-v1",
        "asset_type": "studio-bg3d-environment",
        "asset_provider": "Tripo",
        "asset_generator": "official-tripo-mcp",
        "asset_model_version": "v3.0-20250812",
        "asset_provider_task_id": str(task.get("taskId", "")),
        "asset_prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "asset_license": "Tripo Terms of Service - Free User Output",
        "asset_license_url": "https://www.tripo3d.ai/terms",
        "asset_commercial_use": True,
        "asset_nonexclusive": True,
        "asset_provider_retains_rights": True,
        "asset_credit_source": "free-api-wallet",
        "asset_credit_cost": 20,
        "units": "metres",
        "ground_plane": "glTF-Y=0",
        "ground_y_m": 0.0,
        "embedded_texture_max_dimension": 1024,
    }
    for key, value in root_metadata.items():
        main_root[key] = value

    for index, obj in enumerate(mesh_objects):
        obj.name = f"{spec.asset_id}_mesh_{index:02d}"
        if obj.data:
            obj.data.name = obj.name

    max_texture_dimension = 0
    packed_images = 0
    for image in bpy.data.images:
        width, height = int(image.size[0]), int(image.size[1])
        if width <= 0 or height <= 0:
            continue
        maximum_dimension = max(width, height)
        if maximum_dimension > 1024:
            ratio = 1024 / maximum_dimension
            image.scale(max(1, round(width * ratio)), max(1, round(height * ratio)))
        max_texture_dimension = max(max_texture_dimension, int(max(image.size)))
        try:
            image.pack()
            packed_images += 1
        except RuntimeError:
            pass

    output_dir.mkdir(parents=True, exist_ok=True)
    thumbnail_dir = output_dir / "thumbnails"
    work_dir = output_dir / ".work"
    thumbnail_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    qa_dir.mkdir(parents=True, exist_ok=True)
    intermediate = work_dir / f"{spec.asset_id}.glb"
    thumbnail = thumbnail_dir / f"{spec.asset_id}.png"

    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in model_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = main_root
    bpy.ops.export_scene.gltf(
        filepath=str(intermediate),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.025, 0.032, 0.05)
    camera, helpers = add_preview_stage(scene, dimensions)
    render_angle(scene, camera, dimensions, thumbnail, -48)
    render_angle(scene, camera, dimensions, qa_dir / f"{spec.asset_id}-front.png", -90)
    render_angle(scene, camera, dimensions, qa_dir / f"{spec.asset_id}-rear.png", 132)

    triangles = sum(max(0, len(poly.vertices) - 2) for obj in mesh_objects for poly in obj.data.polygons)
    return {
        "assetId": spec.asset_id,
        "intermediate": str(intermediate),
        "thumbnail": str(thumbnail),
        "qaFront": str(qa_dir / f"{spec.asset_id}-front.png"),
        "qaRear": str(qa_dir / f"{spec.asset_id}-rear.png"),
        "bounds": [round(dimensions.x, 6), round(dimensions.z, 6), round(dimensions.y, 6)],
        "triangles": triangles,
        "meshes": len(mesh_objects),
        "materials": len([material for material in bpy.data.materials if not material.name.startswith("Preview")]),
        "images": len(bpy.data.images),
        "packedImages": packed_images,
        "maxTextureDimension": max_texture_dimension,
        "rootName": main_root.name,
        "rootMetadata": root_metadata,
    }


def main() -> None:
    args = parse_args()
    registry = json.loads(args.registry.expanduser().read_text(encoding="utf-8"))
    task_records = registry.get("assets", {})
    input_dir = args.input_dir.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    qa_dir = args.qa_dir.expanduser().resolve()
    metrics: list[dict[str, Any]] = []
    for spec in ASSETS:
        source = input_dir / f"{spec.asset_id}.glb"
        if not source.is_file():
            raise FileNotFoundError(source)
        task = task_records.get(spec.asset_id)
        if not isinstance(task, dict) or task.get("status") != "TaskStatus.SUCCESS":
            raise RuntimeError(f"{spec.asset_id}: generation registry is not successful")
        print(f"PROCESS {spec.asset_id}", flush=True)
        metrics.append(process_asset(spec, source, output_dir, qa_dir, task))
    metrics_file = args.metrics_file.expanduser().resolve() if args.metrics_file else output_dir / ".work/processing-metrics.json"
    metrics_file.parent.mkdir(parents=True, exist_ok=True)
    metrics_file.write_text(json.dumps({"schema": "toonspectrum.tripo-mcp-processing.v1", "assets": metrics}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"processed": len(metrics), "metrics": str(metrics_file)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
