#!/usr/bin/env python3
"""Deterministic art processing, not image generation.

Keeps the approved source pixels; removes chroma matte contamination and builds
8-frame cutout-rig walk cycles. These are NOT separately illustrated walk poses.
Requires Pillow. No network access, upscaling, or generative inpainting.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

import PIL
from PIL import Image, ImageChops, features

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/web/public/assets/virtual-studio/reference"
OUTPUT = ROOT / "apps/web/public/assets/virtual-studio/production-v2"
SKINS = ("pink", "silver", "dark", "purple")
DIRECTIONS = ("down", "left", "right", "up")
FRAME_W, FRAME_H, FRAMES = 384, 512, 8
FOOT_Y = 492
LOWER_BODY_TOP = 420
MESH_STEP = 16
LOBE_TRANSITION = 2
CONTACT_ALPHA_THRESHOLD = 32
VISIBLE_DIFFERENCE_THRESHOLD = 4
MINIMUM_DISTINCT_VISIBLE_PIXELS = 1024
RIG_ALGORITHM_VERSION = "flattened-cutout-discrete-gait-v1"
FRAME_LABELS = (
    "double-contact-a",
    "screen-lobe-b-swing-early",
    "screen-lobe-b-swing-apex",
    "screen-lobe-b-swing-late",
    "double-contact-b",
    "screen-lobe-a-swing-early",
    "screen-lobe-a-swing-apex",
    "screen-lobe-a-swing-late",
)

# Discrete authored rig phases: left stride/lift, right stride/lift, body compression.
# A zero lift is a planted/contact foot. Frames 0 and 4 are opposing double-support
# poses; the other frames alternate which limb swings. This intentionally avoids
# the duplicate poses created by sampling symmetric sin/sin^2 curves at 8 phases.
GAIT_PHASES = (
    (1.00, 0.00, -1.00, 0.00, 0.00),
    (0.55, 0.00, -0.35, 0.55, 0.35),
    (0.00, 0.00, 0.10, 1.00, 0.65),
    (-0.55, 0.00, 0.60, 0.45, 0.35),
    (-1.00, 0.00, 1.00, 0.00, 0.00),
    (-0.35, 0.55, 0.55, 0.00, 0.35),
    (0.10, 1.00, 0.00, 0.00, 0.65),
    (0.60, 0.45, -0.55, 0.00, 0.35),
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean_matte(image: Image.Image) -> tuple[Image.Image, int]:
    """Remove green-screen holes inside hair/legs as well as border spill.

    These four source skins contain no intentional green clothing or accessories.
    Do not apply this rule to an arbitrary future green-clothed skin.
    """
    result = image.convert("RGBA").copy()
    pixels = result.load()
    removed = 0
    for y in range(result.height):
        for x in range(result.width):
            r, g, b, a = pixels[x, y]
            if not a:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            dominant = g - max(r, b)
            if g > 90 and dominant > 12:
                # Key opaque internal chroma islands; feather mixed-color edges.
                keep = 1 - min(1.0, max(0.0, (dominant - 12) / 26))
                next_alpha = round(a * keep)
                if next_alpha < a:
                    removed += 1
                pixels[x, y] = (r, min(g, max(r, b)), b, next_alpha)
            elif a < 240 and dominant > 3:
                pixels[x, y] = (r, max(r, b), b, a)
    return result, removed


def canonicalize_transparent_rgb(image: Image.Image) -> Image.Image:
    """Make fully transparent RGB deterministic and safe for direct inspection."""
    rgba = bytearray(image.convert("RGBA").tobytes())
    for offset in range(0, len(rgba), 4):
        if rgba[offset + 3] == 0:
            rgba[offset:offset + 3] = b"\0\0\0"
    return Image.frombytes("RGBA", image.size, bytes(rgba))


def derive_lower_body_landmarks(image: Image.Image, direction: str) -> dict:
    """Find two deterministic screen-space lower-body lobes in flattened art."""
    alpha = image.convert("RGBA").getchannel("A")
    weights = []
    for x in range(FRAME_W):
        weight = sum(
            alpha.getpixel((x, y)) * (y - LOWER_BODY_TOP + 1)
            for y in range(LOWER_BODY_TOP, FOOT_Y)
            if alpha.getpixel((x, y)) >= CONTACT_ALPHA_THRESHOLD
        )
        weights.append(weight)

    total_weight = sum(weights)
    if total_weight == 0:
        raise RuntimeError("Lower-body landmark extraction found no opaque pixels")

    def weighted_percentile(fraction: float) -> float:
        target = total_weight * fraction
        running = 0
        for x, weight in enumerate(weights):
            running += weight
            if running >= target:
                return float(x)
        return float(FRAME_W - 1)

    centers = [weighted_percentile(0.25), weighted_percentile(0.75)]
    for _ in range(16):
        totals = [0, 0]
        weighted_x = [0, 0]
        for x, weight in enumerate(weights):
            if weight == 0:
                continue
            lobe = 0 if abs(x - centers[0]) <= abs(x - centers[1]) else 1
            totals[lobe] += weight
            weighted_x[lobe] += x * weight
        if not all(totals):
            raise RuntimeError("Lower-body landmark extraction produced an empty lobe")
        next_centers = [weighted_x[index] / totals[index] for index in range(2)]
        if max(abs(next_centers[index] - centers[index]) for index in range(2)) < 1e-6:
            centers = next_centers
            break
        centers = next_centers

    if centers[1] - centers[0] < 24:
        raise RuntimeError(f"Lower-body screen lobes are not separable: {centers}")
    center_split_x = round(sum(centers) / 2)
    split_method = "lower-body-center-midpoint"
    split_x = center_split_x
    if direction in ("left", "right"):
        baseline_x = [
            x
            for x in range(FRAME_W)
            if alpha.getpixel((x, FOOT_Y - 1)) >= CONTACT_ALPHA_THRESHOLD
        ]
        if len(baseline_x) < 4:
            raise RuntimeError("Side-view source has too little decoded foot contact")
        split_x = baseline_x[len(baseline_x) // 2]
        split_method = "side-view-contact-median"
    if not 128 <= split_x <= 256:
        raise RuntimeError(f"Lower-body screen-lobe split is unsafe: {split_x}")

    bottoms = []
    bottom_counts = []
    planted_drop = []
    for left, right in ((0, split_x), (split_x, FRAME_W)):
        opaque = [
            (x, y)
            for y in range(LOWER_BODY_TOP, FOOT_Y)
            for x in range(left, right)
            if alpha.getpixel((x, y)) >= CONTACT_ALPHA_THRESHOLD
        ]
        if not opaque:
            raise RuntimeError("Lower-body screen lobe has no opaque pixels")
        bottom = max(y for _, y in opaque)
        count = sum(1 for x, y in opaque if y == bottom)
        drop = FOOT_Y - 1 - bottom
        if drop < 0 or drop > 6:
            raise RuntimeError(f"Lower-body screen lobe needs an unsafe planted drop: {drop}")
        bottoms.append(bottom)
        bottom_counts.append(count)
        planted_drop.append(drop)

    return {
        "screenLobeCenters": [round(center, 3) for center in centers],
        "splitX": split_x,
        "centerDerivedSplitX": center_split_x,
        "splitMethod": split_method,
        "sourceOpaqueBottomY": bottoms,
        "sourceBottomPixels": bottom_counts,
        "plantedDropPixels": planted_drop,
        "plantedContactCompensationPixels": 1,
        "sourceAlphaBounds": list(alpha.getbbox()),
        "sourceVisiblePixels": sum(value >= 8 for value in alpha.getdata()),
    }


def displacement(
    x: float,
    y: float,
    frame: int,
    direction: str,
    landmarks: dict,
) -> tuple[float, float]:
    """Continuous cutout rig: keep face design; articulate legs and sleeves.

    Motion grows below the hips and near the outer sleeves. Each discrete gait
    phase keeps one or both feet planted while the opposite limb swings.
    """
    lobe_a = x < landmarks["splitX"]
    a_stride, a_lift, b_stride, b_lift, compression = GAIT_PHASES[frame]
    lobe = 0 if lobe_a else 1
    stride, lift = (a_stride, a_lift) if lobe_a else (b_stride, b_lift)
    leg = max(0.0, min(1.0, (y - 387) / 105))
    upper_body = max(0.0, min(1.0, (387 - y) / 80))
    bob = -1.6 * compression * upper_body
    arm_y = max(0.0, 1 - abs(y - 345) / 80)
    arm_x = max(0.0, min(1.0, (abs(x - 192) - 38) / 42))
    arm = arm_y * arm_x
    arm_swing = -stride
    dx = arm_swing * 2.5 * arm
    dy = bob + arm_swing * 2.0 * arm
    if direction in ("left", "right"):
        travel = -1 if direction == "left" else 1
        dx += travel * stride * 9.0 * leg
        dx += travel * arm_swing * 5.5 * arm
    else:
        dx += stride * 3.5 * leg
    if lift == 0:
        dy += (
            landmarks["plantedDropPixels"][lobe]
            + landmarks["plantedContactCompensationPixels"]
        ) * leg
    else:
        lift_pixels = 6.0 if direction in ("left", "right") else 8.0
        dy -= lift * lift_pixels * leg
    return dx, dy


def walk_frame(
    image: Image.Image,
    index: int,
    direction: str,
    landmarks: dict,
) -> tuple[Image.Image, int]:
    mesh = []
    split_x = landmarks["splitX"]
    x_cuts = set(range(0, FRAME_W + 1, MESH_STEP))
    x_cuts.update((
        max(0, split_x - LOBE_TRANSITION),
        split_x,
        min(FRAME_W, split_x + LOBE_TRANSITION),
        FRAME_W,
    ))
    x_cuts = sorted(x_cuts)
    y_cuts = list(range(0, FRAME_H + 1, MESH_STEP))
    if y_cuts[-1] != FRAME_H:
        y_cuts.append(FRAME_H)
    # Inverse mapping in premultiplied alpha avoids dark/green antialias halos.
    for top, bottom in zip(y_cuts, y_cuts[1:]):
        for left, right in zip(x_cuts, x_cuts[1:]):
            quad = []
            for x, y in ((left, top), (left, bottom), (right, bottom), (right, top)):
                dx, dy = displacement(x, y, index, direction, landmarks)
                quad.extend((x - dx, y - dy))
            mesh.append(((left, top, right, bottom), tuple(quad)))
    transformed = image.convert("RGBa").transform(
        image.size, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC,
    ).convert("RGBA")
    # The source art's foot anchor is a hard floor. A lobe-specific planted
    # alignment may move only sub-threshold antialias fringe below it; clip that
    # fringe so no decoded pose can render under the shared contact baseline.
    transformed.paste((0, 0, 0, 0), (0, FOOT_Y, FRAME_W, FRAME_H))
    transformed, post_rig_matte_corrections = clean_matte(transformed)
    return canonicalize_transparent_rgb(transformed), post_rig_matte_corrections


def visible_frame_sha256(image: Image.Image) -> str:
    """Hash premultiplied decoded pixels, ignoring RGB hidden under alpha=0."""
    return hashlib.sha256(image.convert("RGBa").tobytes()).hexdigest()


def visible_difference_pixels(left: Image.Image, right: Image.Image) -> int:
    """Count pixels with a rendered-channel difference above codec noise."""
    difference = ImageChops.difference(left.convert("RGBa"), right.convert("RGBa"))
    channels = difference.split()
    maximum = channels[0]
    for channel in channels[1:]:
        maximum = ImageChops.lighter(maximum, channel)
    return sum(maximum.histogram()[VISIBLE_DIFFERENCE_THRESHOLD:])


def decoded_atlas_checks(
    atlas_path: Path,
    direction: str,
    landmarks: dict,
) -> tuple[list[str], list[int], int, list[list[int]], list[list[int]], dict]:
    """Require eight decoded-visible poses and a grounded contact in each."""
    decoded = Image.open(atlas_path).convert("RGBA")
    expected_size = (FRAME_W * 4, FRAME_H * 2)
    if decoded.size != expected_size:
        raise RuntimeError(f"Unexpected decoded atlas size for {atlas_path}: {decoded.size}")
    frames = []
    digests = []
    contact_pixels = []
    contact_pixels_by_lobe = []
    clearance_pixels_by_lobe = []
    transparent_rgb_pixels = []
    visible_green_spill_pixels = []
    visible_pixel_ratios = []
    decoded_alpha_bounds = []
    split_x = landmarks["splitX"]
    lobe_ranges = ((0, split_x), (split_x, FRAME_W))
    clearance_ranges = (
        (0, max(0, split_x - LOBE_TRANSITION)),
        (min(FRAME_W, split_x + LOBE_TRANSITION), FRAME_W),
    )
    for index in range(FRAMES):
        left = (index % 4) * FRAME_W
        top = (index // 4) * FRAME_H
        frame = decoded.crop((left, top, left + FRAME_W, top + FRAME_H))
        frames.append(frame)
        digests.append(visible_frame_sha256(frame))
        alpha = frame.getchannel("A")
        hidden_rgb = 0
        green_spill = 0
        visible_pixels = 0
        for red, green, blue, opacity in frame.getdata():
            if opacity == 0:
                hidden_rgb += int(bool(red or green or blue))
            elif opacity >= 8:
                visible_pixels += 1
                green_spill += int(green > 90 and green - max(red, blue) > 12)
        transparent_rgb_pixels.append(hidden_rgb)
        visible_green_spill_pixels.append(green_spill)
        if hidden_rgb:
            raise RuntimeError(
                f"Frame {index} in {atlas_path.name} has {hidden_rgb} nonzero RGB "
                "pixels under full transparency"
            )
        if green_spill:
            raise RuntimeError(
                f"Frame {index} in {atlas_path.name} has {green_spill} visible "
                "green-matte fringe pixels"
            )
        source_visible = landmarks["sourceVisiblePixels"]
        visible_ratio = visible_pixels / source_visible
        visible_pixel_ratios.append(round(visible_ratio, 6))
        if not 0.80 <= visible_ratio <= 1.20:
            raise RuntimeError(
                f"Frame {index} in {atlas_path.name} has an unsafe visible-pixel "
                f"ratio of {visible_ratio:.3f}"
            )
        alpha_bounds = alpha.getbbox()
        if alpha_bounds is None:
            raise RuntimeError(f"Frame {index} in {atlas_path.name} is fully transparent")
        decoded_alpha_bounds.append(list(alpha_bounds))
        source_bounds = landmarks["sourceAlphaBounds"]
        margin = 20
        envelope = (
            max(0, source_bounds[0] - margin),
            max(0, source_bounds[1] - margin),
            min(FRAME_W, source_bounds[2] + margin),
            min(FRAME_H, source_bounds[3] + margin),
        )
        if (
            alpha_bounds[0] < envelope[0]
            or alpha_bounds[1] < envelope[1]
            or alpha_bounds[2] > envelope[2]
            or alpha_bounds[3] > envelope[3]
        ):
            raise RuntimeError(
                f"Frame {index} in {atlas_path.name} escapes its source-alpha "
                f"envelope: {alpha_bounds} not within {envelope}"
            )
        contacts = [
            sum(
                alpha.getpixel((x, FOOT_Y - 1)) >= CONTACT_ALPHA_THRESHOLD
                for x in range(left, right)
            )
            for left, right in lobe_ranges
        ]
        contact = sum(contacts)
        contact_pixels.append(contact)
        contact_pixels_by_lobe.append(contacts)
        if contact < 2:
            raise RuntimeError(
                f"Frame {index} in {atlas_path.name} has no reliable planted-foot "
                f"contact at y={FOOT_Y - 1}"
            )
        below_baseline = sum(
            alpha.getpixel((x, y)) >= CONTACT_ALPHA_THRESHOLD
            for y in range(FOOT_Y, FRAME_H)
            for x in range(FRAME_W)
        )
        if below_baseline:
            raise RuntimeError(
                f"Frame {index} in {atlas_path.name} extends {below_baseline} "
                "opaque pixels below the foot-contact baseline"
            )

        clearances = []
        for left, right in clearance_ranges:
            opaque_rows = [
                y
                for y in range(LOWER_BODY_TOP, FOOT_Y)
                for x in range(left, right)
                if alpha.getpixel((x, y)) >= CONTACT_ALPHA_THRESHOLD
            ]
            if not opaque_rows:
                raise RuntimeError(
                    f"Frame {index} in {atlas_path.name} lost a lower-body screen lobe"
                )
            clearances.append(FOOT_Y - 1 - max(opaque_rows))
        clearance_pixels_by_lobe.append(clearances)

        _, a_lift, _, b_lift, _ = GAIT_PHASES[index]
        lifts = (a_lift, b_lift)
        for lobe, lift in enumerate(lifts):
            if lift == 0:
                minimum_contact = max(
                    2,
                    (landmarks["sourceBottomPixels"][lobe] + 3) // 4,
                )
                if contacts[lobe] < minimum_contact:
                    raise RuntimeError(
                        f"Frame {index} in {atlas_path.name} has only "
                        f"{contacts[lobe]} planted contact pixels for screen lobe {lobe}; "
                        f"expected at least {minimum_contact}"
                    )
            elif direction in ("down", "up"):
                minimum_clearance = 5 if lift >= 1 else 2
                if clearances[lobe] < minimum_clearance:
                    raise RuntimeError(
                        f"Frame {index} in {atlas_path.name} lifts screen lobe {lobe} "
                        f"only {clearances[lobe]} px; expected {minimum_clearance} px"
                    )
    if len(set(digests)) != FRAMES:
        raise RuntimeError(
            f"{atlas_path.name} has only {len(set(digests))}/{FRAMES} "
            "distinct decoded-visible frames"
        )
    pairwise_differences = [
        visible_difference_pixels(frames[left], frames[right])
        for left in range(FRAMES)
        for right in range(left + 1, FRAMES)
    ]
    minimum_difference = min(pairwise_differences)
    if minimum_difference < MINIMUM_DISTINCT_VISIBLE_PIXELS:
        raise RuntimeError(
            f"{atlas_path.name} has two poses differing at only {minimum_difference} "
            f"visible pixels; expected at least {MINIMUM_DISTINCT_VISIBLE_PIXELS}"
        )
    visual_integrity = {
        "transparentRgbPixels": transparent_rgb_pixels,
        "visibleGreenSpillPixels": visible_green_spill_pixels,
        "visiblePixelRatios": visible_pixel_ratios,
        "decodedAlphaBounds": decoded_alpha_bounds,
        "sourceBoundsMargin": 20,
    }
    return (
        digests,
        contact_pixels,
        minimum_difference,
        contact_pixels_by_lobe,
        clearance_pixels_by_lobe,
        visual_integrity,
    )


def carry_forward_verified_background(previous_path: Path) -> dict:
    """Carry private-source provenance only after validating its existing output."""
    if not previous_path.exists():
        raise RuntimeError(
            "--master-source was not supplied and no previous art-manifest.json exists"
        )
    previous_bytes = previous_path.read_bytes()
    previous = json.loads(previous_bytes)
    background_path = OUTPUT / "master-central-lossless.webp"
    background_output = previous.get("outputs", {}).get(background_path.name)
    background_report = previous.get("background")
    if not isinstance(background_output, dict) or not isinstance(background_report, dict):
        raise RuntimeError("Previous manifest has no background output/provenance to verify")
    if not background_path.is_file():
        raise RuntimeError("Previous background output is missing")
    expected_sha = background_output.get("sha256")
    expected_bytes = background_output.get("bytes")
    expected_size = background_output.get("dimensions")
    actual_sha = sha(background_path)
    actual_bytes = background_path.stat().st_size
    actual_size = list(Image.open(background_path).size)
    if (actual_sha, actual_bytes, actual_size) != (expected_sha, expected_bytes, expected_size):
        raise RuntimeError(
            "Existing background output does not match the previous manifest; "
            "supply the approved private master instead of carrying provenance forward"
        )
    if background_report.get("nativeSize") != actual_size:
        raise RuntimeError("Previous background nativeSize does not match its verified output")
    carried_report = dict(background_report)
    carried_report.pop("sourceReverifiedThisBuild", None)
    carried_report.pop("carriedForwardOutputVerified", None)
    carried_report["sourcePixelsComparedThisBuild"] = False
    carried_report["outputIntegrityVerifiedThisBuild"] = True
    carried_report["provenanceMode"] = "carried-forward"
    carried_report["carriedFromManifestSha256"] = background_report.get(
        "carriedFromManifestSha256",
        hashlib.sha256(previous_bytes).hexdigest(),
    )
    return carried_report


def build(master: Path | None) -> None:
    if len(GAIT_PHASES) != FRAMES or any(
        left_lift > 0 and right_lift > 0
        for _, left_lift, _, right_lift, _ in GAIT_PHASES
    ):
        raise RuntimeError("Every gait phase must keep at least one foot planted")
    if any(
        GAIT_PHASES[index][1] != 0 or GAIT_PHASES[index][3] != 0
        for index in (0, 4)
    ):
        raise RuntimeError("Gait phases 0 and 4 must be opposing double-support poses")
    if not all(
        GAIT_PHASES[index][1] == 0 and GAIT_PHASES[index][3] > 0
        for index in (1, 2, 3)
    ) or not all(
        GAIT_PHASES[index][1] > 0 and GAIT_PHASES[index][3] == 0
        for index in (5, 6, 7)
    ):
        raise RuntimeError("Gait phases must alternate the left and right swing limbs")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"version": 2, "frameSize": [FRAME_W, FRAME_H],
        "framesPerDirection": FRAMES, "footAnchor": [0.5, FOOT_Y / FRAME_H],
        "animationTechnique": "cutout-rig mesh deformation of existing art; not redrawn poses",
        "generator": {"path": "scripts/build-virtual-studio-art.py",
            "sha256": sha(Path(__file__)), "rigAlgorithmVersion": RIG_ALGORITHM_VERSION,
            "meshStep": MESH_STEP, "screenLobeTransitionPixels": LOBE_TRANSITION,
            "transformAlpha": "premultiplied", "resampling": "bicubic"},
        "gait": {"phaseTable": [list(phase) for phase in GAIT_PHASES],
            "frameLabels": list(FRAME_LABELS),
            "limbModel": "two screen-space silhouette lobes; not anatomical reconstruction"},
        "limitations": ["flattened single-layer source",
            "occluded limbs are not reconstructed",
            "mesh-deformed cutout rig, not redrawn walk poses"],
        "toolchain": {"pillowVersion": PIL.__version__,
            "libwebpVersion": features.version_module("webp"),
            "webpEncoding": {"lossless": True, "method": 6,
                "exactTransparentRgb": True}},
        "skins": {}, "outputs": {}}
    if master:
        original = Image.open(master).convert("RGB")
        if original.size != (1312, 1199):
            raise ValueError("Approved master must be the original 1312x1199 PNG")
        background = original.crop((194, 55, 1063, 868))
        path = OUTPUT / "master-central-lossless.webp"
        background.save(path, "WEBP", lossless=True, method=6)
        # Verify that the compression did not change even one source RGB value.
        if Image.open(path).convert("RGB").tobytes() != background.tobytes():
            raise RuntimeError("Lossless background verification failed")
        report["background"] = {"sourceSha256": sha(master), "crop": [194, 55, 1063, 868],
            "nativeSize": list(background.size), "losslessPixelVerified": True,
            "bakedOccupants": True, "sourcePixelsComparedThisBuild": True,
            "outputIntegrityVerifiedThisBuild": True, "provenanceMode": "source-verified"}
    else:
        previous = OUTPUT / "art-manifest.json"
        report["background"] = carry_forward_verified_background(previous)
    for skin in SKINS:
        skin_report = {"directions": {}, "states": {}, "mattePixelsCorrected": 0}
        for direction in DIRECTIONS:
            source_path = SOURCE / f"player-{skin}-direction-{direction}.png"
            source = Image.open(source_path).convert("RGBA")
            if source.size != (FRAME_W, FRAME_H):
                raise ValueError(f"Unexpected frame size: {source_path}")
            clean, removed = clean_matte(source)
            landmarks = derive_lower_body_landmarks(clean, direction)
            skin_report["mattePixelsCorrected"] += removed
            static = OUTPUT / source_path.name
            clean.save(static, optimize=True)
            atlas = Image.new("RGBA", (FRAME_W * 4, FRAME_H * 2))
            post_rig_matte_corrections = 0
            for frame in range(FRAMES):
                image, frame_corrections = walk_frame(clean, frame, direction, landmarks)
                post_rig_matte_corrections += frame_corrections
                atlas.paste(image, ((frame % 4) * FRAME_W, (frame // 4) * FRAME_H))
            atlas_path = OUTPUT / f"player-{skin}-walk-{direction}.webp"
            atlas = canonicalize_transparent_rgb(atlas)
            atlas.save(atlas_path, "WEBP", lossless=True, method=6, exact=True)
            (
                visible_digests,
                foot_contacts,
                minimum_difference,
                foot_contacts_by_lobe,
                clearances_by_lobe,
                visual_integrity,
            ) = decoded_atlas_checks(atlas_path, direction, landmarks)
            skin_report["directions"][direction] = {"sourceSha256": sha(source_path),
                "atlas": atlas_path.name, "frames": FRAMES,
                "technique": "cutout-rig", "mattePixelsCorrected": removed,
                "postRigMattePixelsCorrected": post_rig_matte_corrections,
                "rigProfile": "screen-space-lobes-v1", "lowerBodyLandmarks": landmarks,
                "decodedUniqueVisibleFrames": len(set(visible_digests)),
                "decodedVisibleFrameSha256": visible_digests,
                "visibleDifferenceThreshold": VISIBLE_DIFFERENCE_THRESHOLD,
                "minimumPairwiseVisibleDifferencePixels": minimum_difference,
                "footContactBaselineY": FOOT_Y - 1,
                "footContactPixels": foot_contacts,
                "footContactPixelsByScreenLobe": foot_contacts_by_lobe,
                "footClearancePixelsByScreenLobe": clearances_by_lobe,
                "decodedVisualIntegrity": visual_integrity}
        for state in ("draw", "review", "talk"):
            source_path = SOURCE / f"player-{skin}-state-{state}.png"
            if source_path.exists():
                clean, removed = clean_matte(Image.open(source_path))
                skin_report["mattePixelsCorrected"] += removed
                output_path = OUTPUT / source_path.name
                clean.save(output_path, optimize=True)
                skin_report["states"][state] = {"sourceSha256": sha(source_path),
                    "output": output_path.name, "mattePixelsCorrected": removed}
        report["skins"][skin] = skin_report
    for path in sorted(OUTPUT.iterdir()):
        if path.suffix in (".png", ".webp"):
            report["outputs"][path.name] = {"sha256": sha(path), "bytes": path.stat().st_size,
                "dimensions": list(Image.open(path).size)}
    (OUTPUT / "art-manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"assets": len(report["outputs"]),
        "bytes": sum(v["bytes"] for v in report["outputs"].values()),
        "mattePixelsCorrected": sum(v["mattePixelsCorrected"] for v in report["skins"].values()),
        "background": report.get("background")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--master-source", type=Path, help="Local approved original PNG (never uploaded)")
    args = parser.parse_args()
    build(args.master_source)
