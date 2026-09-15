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

`quality.sourceNonManifoldAllowances` records that allowance by imported mesh name and requires
an upgrade source pinned by `provenance.sourceSha256`. Orion preserves 11,996 source edges across
its body and six face meshes: the VRM export splits UV/material seams and includes open authored
surfaces. The audit reports the total, the accepted source count, and unexpected edges separately.
New hair receives no source allowance; additional edges still fail the existing budget. Humanoid
coverage reads actual VRM bone bindings, including Orion's chest mapped to `mixamorig:Spine2`.

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

## Edited-scene roundtrip and portable import

The new **Export Edited Character Package** button in `View3D > Sidebar > ToonStudio`
exports the currently edited character without re-importing the source, regenerating hair,
rebuilding face keys, or clearing the scene. Rebuild/reinstall the repository extension using
the setup command above to expose this button in an existing Blender installation.

The original **Run Character Pipeline** button and MCP `export_character_package` command
still rebuild from the recipe. They are not the edited-scene path. For an edited character,
use the new button or MCP `export_current_character_package` with the same allowlisted
`configPath` and `projectRoot` parameters. Its receipt includes `outputDir`, `manifest`,
and the portable `archive` path.

Export requires Object Mode and the existing quality budgets. It preserves original files,
mesh edits, shape keys, frame/subframe, active object, selection and visibility. Tagged
character objects, their untagged children, and legacy authored hair belonging to a single
character are included; other tagged characters are not silently combined. A shape-key
model with `export.applyModifiers=true` is rejected rather than silently losing its keys.

Each successful export creates a new sibling directory:
`<outputDir>/<characterId>-revisions/<UTC timestamp>-<unique suffix>/`.
The normal rebuild directory and earlier revisions are not overwritten. Failed exports
remove only the current operation's staging directory. Current-scene export performs
technical validation but deliberately does not generate new review renders or claim an
art-direction approval. Existing VRM bindings are exported, not regenerated.

Successful ordinary pipeline runs and edited-scene exports now produce
`<characterId>.toonchar.zip`. It contains the manifest, declared runtime models, quality
report and available PNG previews. Private `.blend` sources and HTML are excluded; optional
source/review entries can remain in the manifest without being included in this runtime ZIP.

In Character Shaper > 정밀 제작, choose one ZIP, a package folder, or the manifest and
runtime files together. Choose VRM-first for character features, or GLB-first for generic
models. The importer shows quality score, size, mesh/skin/morph/animation counts and the
SHA-256 result before enabling an explicit model handoff. Selecting a package alone does
not replace the current model. Verification can be cancelled; late results are ignored.

The browser requires HTTPS or localhost for WebCrypto verification. It checks exact file
identity, quality gate consistency, GLB headers and VRM extensions; it refuses external
texture/buffer references. Manifest limit: 1,000,000 bytes. Runtime entry limit: 256,000,000
bytes. File count limit: 256. ZIP total uncompressed limit: 512,000,000 bytes. The existing
bounded ZIP reader also checks CRC, path collisions, unsafe paths and decompression limits.
Oversized packages are rejected with guidance, never automatically downsampled.

SHA-256 is an integrity receipt, not an author signature or a guarantee of artistic quality.
No package/model upload, paid conversion service, or AI token call is added by this bridge.
It does not implement direct `.blend` execution in a browser, live bidirectional sync,
complete Blender/Cycles material parity, or automatic replacement of poses/paint history.
Final model-load errors still belong to the existing model loader; the import UI reports a
handoff rather than incorrectly asserting that a render completed.

### Reproduce the real Blender-to-runtime verification

Run in a dedicated Blender process, not an artist's active scene:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python tests/blender/blender_current_scene_smoke.py
node --import tsx scripts/verify-blender-package-roundtrip.mts
```

The first test checks edited geometry, morphs, animation, revision and scene preservation,
and re-exports real pipeline-authored hair/face shapes. The second opens both actual ZIPs
through the browser preflight and Three.js GLTFLoader, rather than using a mocked exporter.
