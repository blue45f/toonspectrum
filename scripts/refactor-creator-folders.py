#!/usr/bin/env python3
"""Move the largest studio-creator families into subfolders and rewrite imports."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path("/Users/hjunkim/WebstormProjects/toonspectrum")
CREATOR = ROOT / "src/domains/creator"
SKIP_TOP_DIRS = {"studio-router", "kernel", "components"}

RULES: list[tuple[str, str]] = [
    ("studio-bg3d-", "bg3d"),
    ("StudioBg3d", "bg3d"),
    ("StudioBackground3D", "bg3d"),
    ("bg3d-", "bg3d"),
    ("studio-vrm-", "vrm"),
    ("StudioVrm", "vrm"),
    ("useStudioVrm", "vrm"),
    ("vrm-", "vrm"),
    ("studio-hybrid-", "hybrid-dcc"),
    ("StudioHybrid", "hybrid-dcc"),
    ("studio-dcc-", "hybrid-dcc"),
    ("studio-mannequin-", "scene-3d"),
    ("StudioMannequin", "scene-3d"),
    ("studio-3d-", "scene-3d"),
    ("studio-brush-", "brush"),
    ("StudioBrush", "brush"),
    ("useStudioBrush", "brush"),
    ("studio-wet-", "brush"),
    ("studio-dry-", "brush"),
    ("studio-paper-", "brush"),
    ("studio-ink-", "brush"),
    ("studio-oil-", "brush"),
    ("studio-watercolor-", "brush"),
    ("studio-calligraphy-", "brush"),
    ("studio-bristle-", "brush"),
    ("studio-stamp-", "brush"),
    ("studio-p5-", "brush"),
    ("StudioDraw", "brush"),
    ("studio-draw-", "brush"),
    ("studio-drawing-", "brush"),
    ("studio-stroke-", "brush"),
    ("studio-vello-", "render"),
    ("StudioRender", "render"),
    ("studio-webgpu-", "render"),
    ("studio-gpu-", "render"),
    ("studio-frame-graph-", "render"),
    ("studio-document-scene-", "render"),
    ("studio-engine-", "render"),
    ("studio-pixi-", "render"),
    ("studio-konva-", "render"),
    ("studio-canvaskit-", "render"),
    ("studio-hokusai-", "render"),
    ("studio-tiledoc-", "render"),
    ("studio-raster-", "render"),
    ("studio-webgl-", "render"),
    ("studio-wasm-", "render"),
    ("studio-filter-", "filter"),
    ("StudioFilter", "filter"),
    ("studio-filters-", "filter"),
    ("studio-layer-", "layer"),
    ("StudioLayer", "layer"),
    ("studio-live-", "live"),
    ("StudioLive", "live"),
    ("studio-crdt-", "live"),
    ("use-studio-live-", "live"),
    ("studio-dialogue-", "lettering"),
    ("studio-bubble-", "lettering"),
    ("StudioBubble", "lettering"),
    ("studio-text-", "lettering"),
    ("StudioText", "lettering"),
    ("studio-lettering-", "lettering"),
    ("studio-ai-", "ai"),
    ("StudioAi", "ai"),
    ("studio-export-", "export"),
    ("StudioExport", "export"),
    ("studio-svg-export", "export"),
    ("studio-canvas-", "canvas"),
    ("StudioCanvas", "canvas"),
    ("studio-pointer-", "canvas"),
    ("studio-stage-", "canvas"),
]
RULES.sort(key=lambda item: len(item[0]), reverse=True)

TEXT_SUFFIXES = {
    ".ts",
    ".tsx",
    ".mts",
    ".mjs",
    ".js",
    ".cjs",
    ".json",
}
SKIP_WALK = {
    "node_modules",
    "dist",
    "crates",
    ".git",
    "apps",
    "coverage",
}

SPEC_RE = re.compile(
    r"""(?P<prefix>(?:from|import\s*\(|export\s+(?:\*|[A-Za-z_{][\w{},\s*]*?)\s+from|require\s*\(|new URL\s*\())\s*(?P<quote>['"])(?P<spec>[^'"]+)(?P=quote)"""
)
ALIAS_RE = re.compile(r"@/src/domains/creator/([^'\"]+)")
ENDS_RE = re.compile(r"(/src/domains/creator/)([^'\"]+)")


def dest_dir_for(name: str) -> str | None:
    for prefix, dest in RULES:
        if name.startswith(prefix):
            return dest
    return None


def stem_key(path: Path) -> str:
    name = path.name
    for suffix in (".test.tsx", ".test.ts", ".tsx", ".ts", ".mts", ".mjs"):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return path.stem


def build_plan() -> dict[Path, Path]:
    plan: dict[Path, Path] = {}
    for path in CREATOR.iterdir():
        if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
            continue
        dest = dest_dir_for(path.name)
        if not dest:
            continue
        plan[path] = CREATOR / dest / path.name
    return plan


def git_mv(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["git", "mv", str(src), str(dst)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        if not src.exists():
            raise RuntimeError(f"missing source {src}: {result.stderr}")
        src.replace(dst)


def posix_rel(from_file: Path, to_file: Path) -> str:
    rel = Path(to_file).relative_to(from_file.parent, walk_up=True).as_posix()
    if not rel.startswith("."):
        rel = f"./{rel}"
    return rel


def resolve_import(importer: Path, spec: str) -> Path | None:
    if spec.startswith("@/src/domains/creator/"):
        rest = spec[len("@/src/domains/creator/") :]
        return CREATOR / rest
    if spec.startswith("/src/domains/creator/"):
        return CREATOR / spec[len("/src/domains/creator/") :]
    if "src/domains/creator/" in spec and not spec.startswith("."):
        rest = spec.split("src/domains/creator/", 1)[1]
        return CREATOR / rest
    if spec.startswith("."):
        try:
            return (importer.parent / spec).resolve()
        except OSError:
            return None
    return None


def strip_known_suffix(path: Path) -> Path:
    name = path.name
    for suffix in (".js", ".ts", ".tsx", ".mts", ".mjs"):
        if name.endswith(suffix) and not name.endswith(".d.ts"):
            return path.with_name(name[: -len(suffix)])
    return path


def rewrite_spec(importer_new: Path, spec: str, moved: dict[Path, Path], old_to_new_file: dict[Path, Path]) -> str | None:
    resolved = resolve_import(importer_new if importer_new.exists() else importer_new, spec)
    # importer_new may not exist yet during planning; resolve from old location instead.
    return None


def main() -> None:
    plan = build_plan()
    print(f"planned moves: {len(plan)}")

    # old resolved file -> new resolved file
    old_to_new: dict[Path, Path] = {}
    for src, dst in plan.items():
        old_to_new[src.resolve()] = dst.resolve()

    # basename (no ext, no .test) -> new file path (implementation preferred)
    by_stem: dict[str, Path] = {}
    for src, dst in plan.items():
        key = stem_key(src)
        by_stem[key] = dst
        by_stem[src.name] = dst

    # also index unmoved creator files
    for path in CREATOR.rglob("*"):
        if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
            continue
        if any(part in SKIP_WALK for part in path.parts):
            continue
        new_path = old_to_new.get(path.resolve(), path.resolve())
        by_stem.setdefault(stem_key(path), new_path)
        by_stem.setdefault(path.name, new_path)

    for src, dst in sorted(plan.items(), key=lambda item: str(item[0])):
        git_mv(src, dst)
    print("moves complete")

    # After moves, rewrite imports in the whole repo.
    changed_files = 0
    replacements = 0

    def new_location(old: Path) -> Path:
        resolved = old.resolve() if old.exists() else old
        return old_to_new.get(resolved, resolved)

    # Rebuild old_to_new using names because sources are gone
    name_to_new: dict[str, Path] = {src.name: dst.resolve() for src, dst in plan.items()}
    stem_to_new: dict[str, Path] = {stem_key(src): dst.resolve() for src, dst in plan.items()}

    creator_files_now = {
        path.resolve(): path for path in CREATOR.rglob("*") if path.is_file() and path.suffix in {".ts", ".tsx"}
    }

    def locate_target(spec_path: str) -> Path | None:
        raw = spec_path.split("?")[0]
        name = Path(raw).name
        if name in name_to_new:
            return name_to_new[name]
        stem = stem_key(Path(name))
        if stem in stem_to_new:
            return stem_to_new[stem]
        # still at creator root or already nested
        candidate = CREATOR / raw
        if candidate.exists():
            return candidate.resolve()
        # search current tree by filename
        matches = [p for p in creator_files_now if p.name == name]
        if len(matches) == 1:
            return matches[0]
        return None

    def rewrite_text(path: Path, text: str) -> str:
        nonlocal replacements

        def repl_spec(spec: str) -> str:
            nonlocal replacements
            if spec.startswith("@/src/domains/creator/"):
                rest = spec[len("@/src/domains/creator/") :]
                target = locate_target(rest)
                if target is None:
                    return spec
                rel = target.relative_to(CREATOR).as_posix()
                new = f"@/src/domains/creator/{rel}"
                # preserve missing extension style
                if not Path(rest).suffix and Path(rel).suffix:
                    new = new[: -len(Path(rel).suffix)]
                if new != spec:
                    replacements += 1
                return new
            if "src/domains/creator/" in spec:
                head, rest = spec.split("src/domains/creator/", 1)
                target = locate_target(rest)
                if target is None:
                    return spec
                rel = target.relative_to(CREATOR).as_posix()
                suffix = ""
                if rest.endswith(".ts") or rest.endswith(".tsx"):
                    pass
                elif Path(rel).suffix:
                    rel = rel[: -len(Path(rel).suffix)]
                new = f"{head}src/domains/creator/{rel}{suffix}"
                if new != spec:
                    replacements += 1
                return new
            if spec.startswith("."):
                # resolve against current file location (already moved)
                try:
                    resolved = (path.parent / spec.split("?")[0]).resolve()
                except OSError:
                    return spec
                # if it still exists, keep
                if resolved.exists():
                    return spec
                target = locate_target(spec)
                if target is None:
                    return spec
                rel = Path(os_relpath(target, path.parent)).as_posix()
                if not rel.startswith("."):
                    rel = f"./{rel}"
                # preserve extension presence
                had_ext = Path(spec.split("?")[0]).suffix in {".ts", ".tsx", ".js"}
                if not had_ext:
                    rel = str(Path(rel).with_suffix(""))
                    if not rel.startswith("."):
                        rel = f"./{rel}"
                if spec.endswith("?url"):
                    rel = f"{rel}?url"
                if rel != spec:
                    replacements += 1
                return rel
            return spec

        def sub_spec(match: re.Match[str]) -> str:
            spec = match.group("spec")
            new_spec = repl_spec(spec)
            return f"{match.group('prefix')}{match.group('quote')}{new_spec}{match.group('quote')}"

        return SPEC_RE.sub(sub_spec, text)

    def os_relpath(target: Path, start: Path) -> str:
        import os

        return os.path.relpath(target, start)

    for folder in (ROOT / "src", ROOT / "lib", ROOT / "components", ROOT / "scripts", ROOT / "tests"):
        if not folder.exists():
            continue
        for path in folder.rglob("*"):
            if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
                continue
            if any(part in SKIP_WALK for part in path.parts):
                continue
            original = path.read_text(encoding="utf-8")
            updated = rewrite_text(path, original)
            # also rewrite vite-style endsWith literals not caught? SPEC_RE should get quoted strings in call position;
            # endsWith("/src/...") is a string literal without from/import — handle separately.
            def repl_ends(match: re.Match[str]) -> str:
                rest = match.group(2)
                target = locate_target(rest)
                if target is None:
                    return match.group(0)
                rel = target.relative_to(CREATOR).as_posix()
                if rest != rel:
                    nonlocal_count()
                return f"{match.group(1)}{rel}"

            def nonlocal_count() -> None:
                nonlocal replacements
                replacements += 1

            updated2 = ENDS_RE.sub(repl_ends, updated)
            if updated2 != original:
                path.write_text(updated2, encoding="utf-8")
                changed_files += 1

    # vite.config.ts at repo root
    for extra in (ROOT / "vite.config.ts", ROOT / "vitest.config.ts", ROOT / "vitest.setup.ts"):
        if extra.exists():
            original = extra.read_text(encoding="utf-8")
            updated = rewrite_text(extra, original)
            updated2 = ENDS_RE.sub(
                lambda m: (
                    f"{m.group(1)}{locate_target(m.group(2)).relative_to(CREATOR).as_posix()}"
                    if locate_target(m.group(2))
                    else m.group(0)
                ),
                updated,
            )
            if updated2 != original:
                extra.write_text(updated2, encoding="utf-8")
                changed_files += 1

    mapping = {src.name: str(dst.relative_to(CREATOR)) for src, dst in plan.items()}
    (ROOT / "scripts/refactor-creator-folders.mapping.json").write_text(
        json.dumps({"count": len(mapping), "files": mapping}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"rewrote {changed_files} files ({replacements} spec replacements)")


if __name__ == "__main__":
    main()
