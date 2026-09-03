# Blender-based high-quality character pipeline

## Purpose

ToonStudio keeps real-time composition, pose, expression, surface painting, and linked 2D output in
the browser. Blender is used as the deterministic authoring and release stage for work that needs a
stable topology, shape-key discipline, authored hair silhouettes, MToon/VRM metadata, and rendered
quality review. This avoids trying to solve production topology by adding ever more browser sliders.

## Architecture

```text
Versioned character recipe
        │
        ▼
ToonStudio Blender extension (Blender 5.2 LTS)
        ├─ source import: VRM / GLB / GLTF / Blend / FBX / OBJ
        ├─ face classification and bounded semantic shape keys
        ├─ authored guide-based toon hair + LOD0/1/2
        ├─ MToon-first material setup with portable fallback
        ├─ topology, skin, texture, rig and transform audit
        ├─ fixed-camera expression/view contact sheet
        └─ official GLB / VRM / Blend export
        │
        ▼
Signed-by-hash character package
        │
        ▼
ToonStudio package parser and asset batch importer
        │
        ▼
Existing VRM viewport / Avatar Forge / pose / paint / capture pipeline
```

The DCC output is an input asset, not a second document authority. ToonStudio still owns the scene,
pose, paint history, layers, and linked render state.

## Why the result is higher quality

### Stable facial deformation

The pipeline distinguishes animation expressions from identity-shaping controls. It preserves the
source expressions and generates conservative paired semantic keys for eye size/spacing/tilt, nose
height/width/depth, mouth width, lip fullness, jaw width, chin length, cheek volume, and ear size.
The shape-key basis and topology remain identical, so Blender, VRM and ToonStudio can interpolate
the controls without rebuilding a mesh.

### Authored hair silhouettes

Hair is built from style-specific guides and a closed flattened clump cross-section. Width and depth
fall independently toward a pointed tip, clumps overlap in ordered front/side/back groups, the scalp
shell closes the crown, and a separate inverted outline shell provides a stable graphic edge. The
pipeline creates descending LODs instead of decimating one tube-like mesh after the fact.

### Release evidence

The same production objects are rendered from front, three-quarter, side and back cameras. Existing
neutral/emotion/blink keys can be reviewed without allowing generated identity keys to masquerade as
expressions. The HTML contact sheet and PNGs are included in the package and CI artifact.

## Version and dependency policy

- Blender: pinned to the current 5.2 LTS patch in automation.
- VRM Add-on: pinned by release version and SHA-256.
- ToonStudio extension: versioned by `blender_manifest.toml` and built with Blender's extension CLI.
- Recipe schema: `config/blender/toonstudio-character-pipeline.schema.json`.
- Output schema: `toonstudio.character-package`, schema version 1.

Dependency installation is performed by the setup/CI layer. The installed Blender extension itself
requests local file permission only and performs no network or process execution.

## Local setup on macOS Apple Silicon

```sh
brew install --cask blender
pnpm exec tsx scripts/setup-toonstudio-blender-pipeline.mts -- --install-addons
pnpm exec tsx scripts/setup-toonstudio-blender-pipeline.mts -- --check
```

An explicit binary can be used without changing the global shell:

```sh
pnpm exec tsx scripts/setup-toonstudio-blender-pipeline.mts -- \
  --blender /Applications/Blender.app/Contents/MacOS/Blender \
  --install-addons
```

## Create a character package

Copy a recipe, keep the output inside the repository, and point `inputPath` at a source whose rights
and digest are recorded under `provenance`.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/blender/toonstudio_character_pipeline.py -- \
  --config config/blender/avatar-orion-production.json
```

Import the verified runtime asset into the standard batch source tree:

```sh
pnpm exec tsx scripts/import-blender-character-package.mts -- \
  batch_generated/blender-character/avatar-orion-authored/character-package.json
```

The importer recomputes SHA-256 for the selected VRM or GLB and thumbnail before copying. It writes a
receipt next to the imported asset for provenance and later manifest generation.

## MCP contract

MCP is an orchestration channel, not the quality implementation. The authoritative logic remains in
this repository and can be reproduced headlessly. A caller supplies only a command from the allowlist
and a config/project path. The dispatcher validates the request and returns a JSON-safe receipt.

This prevents model-generated code from obtaining an unrestricted Blender Python or shell surface.
The recommended deployment uses a dedicated Blender profile and a disposable copy of source files.

## Quality budgets

The recipe defines budgets instead of hard-coding one model class. Default targets are:

| Check | Default release budget |
|---|---:|
| Visible character LOD0 | 120,000 triangles |
| LOD1 | 65,000 triangles |
| LOD2 | 30,000 triangles |
| Hair LOD0 | 36,000 triangles |
| Hair materials | 3 |
| Skin influences per vertex | 4 |
| Texture dimension | 4096 px |
| Degenerate faces | 0 |
| Non-manifold edges | 0 |
| Minimum quality score | 86 |

A source with intentionally open cards can use an audited recipe allowance, but generated hair and
reference geometry are required to pass with no degenerates and no non-manifold edges.

## CI gates

The Blender workflow performs three layers of verification:

1. Pure Python contract and source-safety tests without Blender.
2. TypeScript package parser tests, lint, and static integration checks.
3. A real Blender 5.2 run that validates/builds/installs the extension, installs the pinned official
   VRM add-on, generates the reference character, upgrades the audited Orion source, re-imports the
   exported GLB/VRM, and uploads package/contact-sheet evidence.

A PR should not merge until both this workflow and the repository's protected `core` check pass.

## Deliberate limits

The pipeline does not claim that automation can replace art direction. It automates the repeatable
parts that previously caused technical quality loss: topology closure, bounded shape-key generation,
hair construction rules, LODs, material setup, portable rig checks, deterministic rendering,
provenance, and package verification. Style-specific sculpting can still be performed in the saved
`.blend`; re-running validation and export then produces the same auditable package contract.
