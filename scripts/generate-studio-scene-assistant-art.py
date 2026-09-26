"""저장소의 ImageGen 2.5 원본으로 장면 도우미용 경량 이미지를 생성한다."""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps/web/public"
OUTPUT = PUBLIC / "assets/studio/scene-assistant/imagegen25-v1"

SOURCES = {
    "classroom": "assets/studio/backgrounds/webtoon_classroom.jpg",
    "cafe": "assets/studio/backgrounds/webtoon_cafe.jpg",
    "city": "assets/studio/backgrounds/webtoon_neon_alley.png",
    "rooftop": "assets/studio/backgrounds/webtoon_rooftop_sunset.png",
    "bedroom": (
        "assets/studio/generated-backgrounds/gpt25-v1/daily/"
        "gpt25-bg-daily-bedroom-night-vertical-depth/background.png"
    ),
    "fantasy": (
        "assets/studio/generated-backgrounds/gpt25-v1/fantasy/"
        "gpt25-bg-fantasy-dragon-cliff-vertical-depth/background.png"
    ),
    "palace": (
        "assets/studio/generated-backgrounds/gpt25-v1/wuxia/"
        "gpt25-bg-wuxia-palace-courtyard-vertical-depth/background.png"
    ),
    "sf": (
        "assets/studio/generated-backgrounds/gpt25-v1/sf/"
        "gpt25-bg-sf-research-lab-vertical-depth/background.png"
    ),
    "action": (
        "assets/studio/generated-backgrounds/gpt25-v1/action/"
        "gpt25-bg-action-ruined-city-vertical-depth/background.png"
    ),
}

CARD_SIZE = (720, 460)
HERO_SIZE = (1600, 900)
RESAMPLE = Image.Resampling.LANCZOS
FOCUS_Y = {
    "bedroom": 0.25,
    "fantasy": 0.34,
    "palace": 0.36,
    "sf": 0.3,
    "action": 0.38,
}


def cover(image: Image.Image, size: tuple[int, int], focus_y: float = 0.5) -> Image.Image:
    image = image.convert("RGB")
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), RESAMPLE)
    left = max(0, (resized.width - size[0]) // 2)
    top = max(0, round((resized.height - size[1]) * focus_y))
    return resized.crop((left, top, left + size[0], top + size[1]))


def grade(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Color(image).enhance(1.08)
    image = ImageEnhance.Contrast(image).enhance(1.05)
    return ImageEnhance.Sharpness(image).enhance(1.08)


def load_image(source: Path) -> Image.Image:
    if not source.is_file():
        raise SystemExit(
            f"ImageGen 2.5 원본을 찾지 못했습니다: {source}\n"
            "원본 에셋을 복구한 뒤 다시 실행해 주세요."
        )
    with Image.open(source) as image:
        return image.copy()


def render_card(source: Path, destination: Path, focus_y: float = 0.5) -> None:
    image = grade(cover(load_image(source), CARD_SIZE, focus_y))
    overlay = Image.new("RGBA", CARD_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle(
        (0, CARD_SIZE[1] * 0.52, CARD_SIZE[0], CARD_SIZE[1]),
        fill=(10, 8, 18, 108),
    )
    draw.rectangle((0, 0, CARD_SIZE[0], 8), fill=(255, 109, 49, 210))
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=88, method=6)


def render_hero(sources: list[Path], destination: Path) -> None:
    canvas = Image.new("RGB", HERO_SIZE, "#130f1c")
    panel_width = HERO_SIZE[0] // len(sources)
    for index, source in enumerate(sources):
        panel = cover(load_image(source), (panel_width + 30, HERO_SIZE[1]), 0.42)
        panel = grade(panel).filter(ImageFilter.GaussianBlur(radius=0.25))
        canvas.paste(panel, (index * panel_width, 0))

    overlay = Image.new("RGBA", HERO_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, 0, HERO_SIZE[0], HERO_SIZE[1]), fill=(13, 8, 22, 42))
    for x in range(HERO_SIZE[0]):
        alpha = round(225 * (x / HERO_SIZE[0]) ** 1.8)
        draw.line((x, 0, x, HERO_SIZE[1]), fill=(10, 7, 18, alpha))
    draw.rectangle(
        (0, HERO_SIZE[1] - 240, HERO_SIZE[0], HERO_SIZE[1]),
        fill=(9, 6, 16, 106),
    )
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "WEBP", quality=90, method=6)


def generate(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for key, relative in SOURCES.items():
        render_card(PUBLIC / relative, output / f"{key}.webp", FOCUS_Y.get(key, 0.5))

    render_hero(
        [PUBLIC / SOURCES[key] for key in ("classroom", "city", "fantasy", "sf")],
        output / "scene-assistant-hero.webp",
    )


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_committed_art(generated: Path) -> None:
    expected_names = sorted([f"{key}.webp" for key in SOURCES] + ["scene-assistant-hero.webp"])
    committed_names = sorted(path.name for path in OUTPUT.glob("*.webp")) if OUTPUT.is_dir() else []
    generated_names = sorted(path.name for path in generated.glob("*.webp"))
    if committed_names != expected_names or generated_names != expected_names:
        raise SystemExit(
            "장면 도우미 이미지 목록이 생성 규칙과 다릅니다.\n"
            "`pnpm studio:scene-assistant-art:generate`로 다시 생성해 주세요."
        )

    changed = [
        name
        for name in expected_names
        if digest(OUTPUT / name) != digest(generated / name)
    ]
    if changed:
        raise SystemExit(
            "장면 도우미 이미지가 원본 또는 생성 규칙과 일치하지 않습니다: "
            + ", ".join(changed)
            + "\n`pnpm studio:scene-assistant-art:generate`로 다시 생성해 주세요."
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="커밋된 이미지가 현재 원본과 생성 규칙에 맞는지 검증합니다.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.check:
        with TemporaryDirectory(prefix="toonstudio-scene-assistant-") as temp_dir:
            generated = Path(temp_dir)
            generate(generated)
            verify_committed_art(generated)
        print(f"장면 도우미 이미지 {len(SOURCES) + 1}개 검증 완료")
        return

    generate(OUTPUT)
    print(f"장면 도우미 이미지 {len(SOURCES) + 1}개 생성 완료: {OUTPUT}")


if __name__ == "__main__":
    try:
        main()
    except OSError as error:
        print(f"장면 도우미 이미지 처리 실패: {error}", file=sys.stderr)
        raise SystemExit(1) from error
