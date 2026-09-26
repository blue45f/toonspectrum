#!/usr/bin/env python3
"""Build the Virtual Studio Image Generation 2.5 place/background pack.

The two committed source boards were produced with OpenAI Image Generation 2.5. This
script creates runtime crops, thumbnails and a tile atlas without CSS recolouring or
cross-theme derivation. Every output is reproducible and carries source provenance.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT: Final = Path(__file__).resolve().parents[1]
SOURCE_ROOT: Final = ROOT / "apps/web/public/assets/virtual-studio/living-town-v6/source"
DESIGN_BOARD: Final = SOURCE_ROOT / "imagegen25-design-board.png"
WORLD_CONCEPT: Final = SOURCE_ROOT / "imagegen25-world-concept.png"
PACK: Final = ROOT / "apps/web/public/assets/virtual-studio/imagegen25-v7"

DESIGN_FILE_ID: Final = "file_000000001c9081fdbfb6bcbe9e715172"
WORLD_FILE_ID: Final = "file_00000000854881f482a2bd88a6ed7433"
GENERATION_IDS: Final = (
    "66b20001-32fd-4d90-9a6f-14b676399191",
    "9ffa2971-6d20-49bd-a8b3-aaa3da97d83f",
    "22beabfc-ecd4-47a7-8925-1c83b56003c2",
)


@dataclass(frozen=True)
class PlaceCrop:
    id: str
    label_ko: str
    label_en: str
    room_id: str
    category: str
    box: tuple[int, int, int, int]
    description_ko: str
    description_en: str
    project_only: bool = False


PLACES: Final = (
    PlaceCrop("skyport", "스카이 포트", "Sky Port", "lobby", "arrival", (0, 220, 285, 500),
              "입장 부두와 월드 이동 게이트가 있는 시작 장소.", "The arrival dock and gateway to every studio district."),
    PlaceCrop("creator-plaza", "창작자 광장", "Creator Plaza", "live", "community", (470, 135, 900, 485),
              "이벤트와 공지가 모이는 가상스튜디오의 중심 광장.", "The central plaza for announcements, events and meetups."),
    PlaceCrop("personal-atelier", "개인 아틀리에", "Personal Atelier", "drawing", "creation", (245, 45, 530, 260),
              "드로잉과 캐릭터 제작을 이어가는 개인 작업실.", "A private atelier for drawing and character production."),
    PlaceCrop("story-lab", "스토리 랩", "Story Lab", "writers", "creation", (280, 250, 535, 475),
              "대본과 아이디어를 함께 정리하는 공동 집필 공간.", "A collaborative writing room for scripts and story ideas."),
    PlaceCrop("creator-cafe", "크리에이터 카페", "Creator Cafe", "lounge", "social", (865, 225, 1135, 470),
              "짧은 대화와 휴식을 위한 정원형 카페.", "A garden cafe for brief conversations and breaks."),
    PlaceCrop("team-meeting", "팀 미팅 로프트", "Team Meeting Loft", "meeting", "collaboration", (1090, 225, 1375, 465),
              "팀 회의와 화면 공유를 위한 비공개 협업실.", "A private team room for meetings and screen sharing.", True),
    PlaceCrop("tree-library", "트리 라이브러리", "Tree Library", "assets", "archive", (800, 0, 1115, 275),
              "레퍼런스와 제작 에셋을 보관하는 수목 도서관.", "A tree-top library for references and production assets."),
    PlaceCrop("review-gallery", "리뷰 갤러리", "Review Gallery", "review", "review", (815, 395, 1075, 650),
              "버전 비교와 공동 검수를 진행하는 전시형 공간.", "A gallery for version comparison and collaborative review."),
    PlaceCrop("garden", "창작 정원", "Creator Garden", "assistant", "rest", (1010, 375, 1325, 675),
              "아이디어를 정리하고 잠시 쉬어가는 폭포 정원.", "A waterfall garden for reflection and quiet breaks."),
    PlaceCrop("observatory", "스토리 관측소", "Story Observatory", "quality", "review", (1280, 350, 1536, 690),
              "프로젝트 흐름과 품질 상태를 멀리서 조망하는 곳.", "An observatory for project flow and quality signals."),
    PlaceCrop("arcade", "크리에이터 아케이드", "Creator Arcade", "storyboard", "play", (350, 405, 620, 650),
              "작업 데이터와 분리된 짧은 놀이와 영감 공간.", "A lightweight play space kept separate from production data."),
    PlaceCrop("beach", "해변 아틀리에", "Beach Atelier", "lounge", "rest", (50, 405, 385, 675),
              "파도와 석양을 보며 쉬는 해변 작업 공간.", "A seaside work-and-rest space with waves and sunset views."),
    PlaceCrop("event-stage", "이벤트 스테이지", "Event Stage", "live", "community", (560, 470, 875, 710),
              "발표와 라이브 행사를 진행하는 공개 무대.", "A public stage for presentations and live events."),
    PlaceCrop("production-control", "프로덕션 관제실", "Production Control", "production", "production", (350, 40, 650, 265),
              "일정, 작업 배정과 병목을 확인하는 제작 관제실.", "A production room for schedules, assignments and bottlenecks.", True),
)

BACKDROPS: Final = {
    "sky": (1075, 0, 1536, 265, WORLD_CONCEPT),
    "coast": (0, 390, 460, 715, WORLD_CONCEPT),
    "forest": (780, 0, 1160, 315, WORLD_CONCEPT),
    "city": (735, 250, 1065, 640, DESIGN_BOARD),
}

TILE_CENTERS: Final = (
    (376, 846), (418, 846), (460, 846),
    (376, 887), (418, 887), (460, 887),
    (376, 929), (418, 929), (460, 929),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_webp(image: Image.Image, path: Path, *, lossless: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=94, method=6, exact=True, lossless=lossless)


def crop_cover(source: Image.Image, box: tuple[int, int, int, int], size: tuple[int, int]) -> Image.Image:
    image = source.crop(box).convert("RGB")
    image = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    image = ImageEnhance.Contrast(image).enhance(1.035)
    image = ImageEnhance.Sharpness(image).enhance(1.15)
    return image


def file_record(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        size = [image.width, image.height]
    return {
        "file": path.relative_to(PACK).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "size": size,
    }


def build_place_assets(world: Image.Image) -> tuple[list[Path], list[dict[str, object]]]:
    files: list[Path] = []
    records: list[dict[str, object]] = []
    for place in PLACES:
        preview = crop_cover(world, place.box, (640, 360))
        preview = preview.filter(ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=3))
        target = PACK / "places" / f"{place.id}.webp"
        save_webp(preview, target)
        files.append(target)
        records.append({
            "id": place.id,
            "labelKo": place.label_ko,
            "labelEn": place.label_en,
            "roomId": place.room_id,
            "category": place.category,
            "descriptionKo": place.description_ko,
            "descriptionEn": place.description_en,
            "projectOnly": place.project_only,
            "preview": f"places/{place.id}.webp",
        })
    return files, records


def build_backdrops(design: Image.Image, world: Image.Image) -> list[Path]:
    files: list[Path] = []
    sources = {DESIGN_BOARD: design, WORLD_CONCEPT: world}
    for key, (left, top, right, bottom, source_path) in BACKDROPS.items():
        image = crop_cover(sources[source_path], (left, top, right, bottom), (1280, 720))
        target = PACK / "backgrounds" / f"{key}.webp"
        save_webp(image, target)
        files.append(target)
    return files


def build_terrain_atlas(design: Image.Image) -> Path:
    atlas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    base_tiles: list[Image.Image] = []
    for x, y in TILE_CENTERS:
        # Crop the authored texture interior, excluding the rounded white swatch border.
        tile = design.crop((x - 13, y - 13, x + 13, y + 13)).convert("RGB")
        tile = ImageOps.fit(tile, (128, 128), Image.Resampling.LANCZOS)
        tile = ImageEnhance.Contrast(tile).enhance(1.04)
        tile = ImageEnhance.Sharpness(tile).enhance(1.25)
        base_tiles.append(tile)
    tiles = [
        *base_tiles,
        ImageOps.mirror(base_tiles[0]),
        ImageOps.flip(base_tiles[1]),
        ImageOps.mirror(base_tiles[2]),
        base_tiles[3].rotate(180),
        ImageOps.mirror(base_tiles[7]),
        ImageOps.flip(base_tiles[6]),
        ImageOps.mirror(base_tiles[8]),
    ]
    for index, tile in enumerate(tiles):
        atlas.alpha_composite(tile.convert("RGBA"), ((index % 4) * 128, (index // 4) * 128))
    target = PACK / "tiles" / "terrain-atlas.webp"
    save_webp(atlas, target, lossless=True)
    return target


def main() -> None:
    PACK.mkdir(parents=True, exist_ok=True)
    design = Image.open(DESIGN_BOARD).convert("RGBA")
    world = Image.open(WORLD_CONCEPT).convert("RGBA")

    generated, places = build_place_assets(world)
    generated.extend(build_backdrops(design, world))
    generated.append(build_terrain_atlas(design))

    manifest = {
        "version": 7,
        "generatedAt": "2026-09-26",
        "generator": "OpenAI Image Generation 2.5 runtime place and background extraction",
        "sourceTechnique": "Deterministic crops from committed Image Generation 2.5 source boards; no CSS recolour or cross-theme filter derivation.",
        "sourceFiles": [
            {"file": DESIGN_BOARD.relative_to(ROOT).as_posix(), "fileId": DESIGN_FILE_ID,
             "sha256": sha256(DESIGN_BOARD), "bytes": DESIGN_BOARD.stat().st_size},
            {"file": WORLD_CONCEPT.relative_to(ROOT).as_posix(), "fileId": WORLD_FILE_ID,
             "sha256": sha256(WORLD_CONCEPT), "bytes": WORLD_CONCEPT.stat().st_size},
        ],
        "sessionGenerationIds": list(GENERATION_IDS),
        "tile": {"frameWidth": 128, "frameHeight": 128, "columns": 4, "rows": 4,
                 "asset": "tiles/terrain-atlas.webp"},
        "backdrops": {key: f"backgrounds/{key}.webp" for key in BACKDROPS},
        "places": places,
        "files": [file_record(path) for path in sorted(generated)],
    }
    (PACK / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"ImageGen 2.5 Virtual Studio v7: {len(generated)} files, {len(places)} places")


if __name__ == "__main__":
    main()
