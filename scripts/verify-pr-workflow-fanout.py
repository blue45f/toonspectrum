#!/usr/bin/env python3
from pathlib import Path
import re
import sys

WORKFLOWS = Path('.github/workflows')
ALLOWED = {"ci.yml", 'acon-asset-intake.yml', 'admin-hardening-regression.yml', 'blender-character-pipeline.yml', 'character-merge-validation.yml', 'character-shaper-discovery-quality.yml', 'cleanup-merged-pr-branches.yml', 'creator-home-quality.yml', 'dontdraw-intake.yml', 'kmas-reference-library.yml', 'learning-quality.yml', 'marketplace-authoring.yml', 'marketplace-integrity.yml', 'reference-rebuild.yml', 'studio-2d-asset-quality.yml', 'studio-ai-comic-director-complete.yml', 'studio-asset-browser.yml', 'studio-asset-upload-integrity.yml', 'studio-brush-filter-stability.yml', 'studio-brush-quality-portfolio.yml', 'studio-brush-semantic-quality.yml', 'studio-cc0-library.yml', 'studio-discovery-ux.yml', 'studio-editor-client-runtime.yml', 'studio-finishing-quality.yml', 'studio-interaction-integrity.yml', 'studio-manual.yml', 'studio-menu-viewport.yml', 'studio-mesh-sync-repair.yml', 'studio-music-regression.yml', 'studio-production-integrity.yml', 'studio-promo-video.yml', 'studio-raster-snapshot-stability.yml', 'studio-retouch-gesture-stability.yml', 'studio-scene3d-next.yml', 'studio-vrm-asset-quality.yml', 'webgpu-brush-phase2.yml', 'webgpu-dab-tile-binning-compute.yml', 'webgpu-tile-provider-v2-atlas.yml', 'webtoon-assistant-regression.yml'}

def has_direct_pr_trigger(path: Path) -> bool:
    lines = path.read_text(encoding='utf-8').splitlines()
    in_on = False
    for line in lines:
        if line == 'on:':
            in_on = True
            continue
        if in_on and line and not line.startswith((' ', '\t')):
            break
        if in_on and re.fullmatch(r'  pull_request:\s*', line):
            return True
    return False

offenders = sorted(
    path.name
    for path in (*WORKFLOWS.glob('*.yml'), *WORKFLOWS.glob('*.yaml'))
    if path.name not in ALLOWED and has_direct_pr_trigger(path)
)
if offenders:
    print('Unexpected direct pull_request workflows:', file=sys.stderr)
    for name in offenders:
        print(f'  - {name}', file=sys.stderr)
    raise SystemExit(1)
print('PR workflow fan-out policy satisfied.')
