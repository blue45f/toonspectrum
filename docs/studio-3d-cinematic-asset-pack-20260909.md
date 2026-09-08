# Studio 3D cinematic asset pack — 2026-09-09

## Goal

Expand the Studio BG3D library with immediately usable, commercially safe characters, finished backgrounds, and props without adding network dependencies, marketplace identity, or opaque binary provenance.

This slice adds **24 ToonSpectrum-authored procedural assets**:

- 8 editable character pose mannequins
- 8 finished scene/background modules
- 8 detailed story props

The existing procedural catalog grows from 17 to 41 assets. Every new asset expands into the existing engine-neutral `BgPrimitive[]` document model and works in both WebGL2 and WebGPU renderers.

## Benchmark research

The implementation was shaped by three strong public-domain asset ecosystems:

| Reference | What was studied | Product decision |
| --- | --- | --- |
| [Poly Haven Models](https://polyhaven.com/models) | Realistic presentation, category clarity, source transparency, production-oriented model pages | Preserve strong naming, category, descriptive tags, and explicit quality budgets. Existing PBR imports remain the photoreal path. |
| [Kenney Assets](https://kenney.nl/assets) and [support guidance](https://kenney.nl/support) | Consistent modular packs, predictable silhouette language, CC0 commercial safety | Ship cohesive modular sets with no attribution requirement and no runtime network dependency. |
| [Quaternius](https://quaternius.com/) | Stylized CC0 characters, environments, props, and reusable low-poly visual language | Add readable stylized silhouettes, action poses, fantasy/SF coverage, and reusable scene modules. |

The repository already contains a large externally sourced CC0 delivery with source files, hashes, license records, previews, and PBR assets. This change deliberately avoids duplicating those downloads. The new pack fills the missing **editable composition layer**: all geometry is authored in ToonSpectrum code, every component can be selected and modified, and no third-party binary needs to be trusted at runtime.

## New character pose mannequins

1. Neutral hero
2. Contrapposto heroine
3. Broad-shoulder hero
4. Seated reader with book and chair
5. Running figure
6. Foreshortened forward punch
7. Fantasy ranger with staff and cape
8. School child with backpack

Character limbs are generated as oriented segments. The runtime now composes arbitrary local XYZ Euler rotations with whole-asset yaw through a local quaternion path, so arm and leg poses remain correct after scene rotation.

These are intentionally static, editable pose mannequins rather than replacements for the existing rigged VRM pipeline. Use VRM assets for facial expression, skeletal animation, IK, or motion clips; use this pack for fast storyboarding, silhouette design, camera blocking, and editable panel composition.

## New scene/background modules

1. Modern studio apartment
2. Classroom corner
3. Café counter
4. Subway platform bay
5. Urban rooftop
6. Forest path cluster
7. Fantasy ruins gate
8. Science-fiction corridor bay

Each scene is a single-click composition made of 16 or fewer named parts. Walls, windows, furniture, signage, lights, and hero props remain independently editable after insertion.

## New detailed props

1. Cinema camera rig
2. Urban drink vending machine
3. Creator gaming desk
4. Night-market food cart
5. City bicycle
6. Retro arcade cabinet
7. Kitchen island set
8. Neon sign stand

## Runtime and safety contract

- Origin: ToonSpectrum-authored mathematical primitives
- License declaration: CC0-1.0
- External files: 0
- External textures: 0
- Network requests: 0
- Runtime extensions: 0
- Renderer support: WebGL2 and WebGPU
- Parts per new asset: 12–16
- Estimated triangles per new asset: no more than 3,000
- Estimated draw calls per new asset: no more than 32
- Estimated materials per new asset: no more than 32

Insertion remains fail-closed. Node, triangle, draw-call, material, transform, and identifier checks are evaluated before the scene mutates.

## UX changes

The former “composition blockout” browser is promoted to **3D characters · backgrounds · props** and receives three top-level filters:

- Character poses
- Finished backgrounds
- Detailed props

Search covers Korean labels, English tags, descriptions, and category labels. Existing architecture, doors/windows, furniture, street, and nature filters remain available.

## Validation plan

The focused regression suite verifies:

- exact 8/8/8 category counts and unique stable IDs;
- CC0/original/file-free provenance;
- finite normalized XYZ rotations;
- exact primitive-derived budgets;
- default per-asset admission through the production insertion planner;
- representative full-pose yaw composition;
- Korean category search;
- round-trip through the real scene document adapter;
- panel accessibility, pagination, disabled states, and insertion announcements.

## Final validation

GitHub Actions run `34268561861` completed successfully on the materialized product tree.

- 5 focused test files passed with **29 of 29 tests**.
- ESLint passed with zero warnings for every changed TypeScript and TSX file.
- The complete repository TypeScript check passed with the repository-standard 8 GiB Node heap.
- `git diff --check` passed.
- One-shot integration scripts and their temporary workflow were removed before the validated product commit was pushed.

## Scope boundary

This MR adds a high-quality stylized and editable procedural layer. Photoreal textures, skeletal animation, facial morphs, cloth simulation, and LOD-generated binary models remain in the existing GLB/VRM/PBR pipelines and are not imitated with primitive geometry.
