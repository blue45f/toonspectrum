# Studio 3D quality and library expansion: 2026-09-08

## Status and scope

This report records the local asset work and validation results already reported during the task. It was written without a new repository inspection or verification run.

- **100 new library assets** were added: 25 humanoid VRMs, 6 environments, 51 PBR props and 18 surfaces.
- **23 existing assets** received improved replacements: 11 props and 12 environments. These are not included again in the 100 new assets.
- **5 existing avatar thumbnails** were changed. Thumbnail-only changes are not counted as new characters or replacement models.
- Original legacy asset files were retained. Existing saved scenes were not bulk-migrated or destructively rewritten.
- The mobile high-quality mode has passed the reported local policy, session, cache, template and catalog checks. The corrected policy suite is **17/17**, and actual original-GLB admission checks confirm the finite automatic/high-quality budget boundary.
- The latest focused run passed **355 tests in 23 files**, and the catalog run passed **180 tests in 5 files**. These overlapping results must not be summed. Root TypeScript checking and the production build plus postbuild also passed.
- Commit, push, remote CI, merge and production deployment have **not** been established as complete. Local catalog integration and local validation are not proof that `toonstudio.cloud` is serving these changes.

## Asset accounting

| Work category | Count | Counting rule |
| --- | ---: | --- |
| New textured humanoid VRMs | 4 | Female and male villagers and rangers; actual assembled, skinned characters |
| New intentionally low-poly humanoid VRMs | 21 | 11 male and 10 female authored outfit variants |
| New environments | 6 | New environment entries, separate from the 12 improved existing environments |
| New PBR props | 51 | New prop entries |
| New surfaces | 18 | Surface assets, not additional character or prop meshes |
| **Total new library assets** | **100** | **25 + 6 + 51 + 18** |
| Improved existing props | 11 | Replacement versions; originals retained |
| Improved existing environments | 12 | Replacement versions; originals retained |
| **Total improved existing assets** | **23** | **11 + 12**, separate from new additions |
| Existing avatar thumbnail updates | 5 | Presentation-only changes; excluded from asset totals |

The CC0 catalog grew from **1,143 to 1,212 records**, an increase of **69** corresponding to the 51 PBR props and 18 surfaces. One assembly-component record is hidden from the default selection. Record count and default-visible selection count should not be treated as interchangeable.

The 100 additions are a mixed library total, not a claim that 100 new humanoids or 100 distinct mesh models were created. Skin-color and hair-color recolors were not counted as additional characters.

## Humanoid sources and conversion

The four textured characters combine the actual free Standard contents of the official Quaternius base-character and fantasy-outfit packs. Whole-product advertised counts include content that is not present in those free archives; this work does not claim to have acquired the complete paid packs.

- [Universal Base Characters, official source](https://quaternius.com/packs/universalbasecharacters.html)
- [Modular Character Outfits - Fantasy, official source](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html)
- [Ultimate Modular Characters, official male source](https://quaternius.com/packs/ultimatemodularcharacters.html)
- [Ultimate Modular Women, official female source](https://quaternius.com/packs/ultimatemodularwomen.html)
- [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/)

Original source archives, license text and conversion evidence remain outside the web public directory. The runtime assets are actual VRM 1 files with mapped humanoid bones and skinned geometry, not screenshots or thumbnail-only placeholders.

The four textured models expose 52 mapped humanoid bones. Male head and hair geometry required a weighted transfer between different source and outfit bind rests; it was not simply attached to an incompatible skeleton. VRM packaging preserves the assembled GLB binary chunk, which is a narrower claim than preserving every original source file unchanged.

The 21 modular models expose 48 mapped humanoid bones for the male rigs and 50 for the female rigs. Female upper-leg parenting required a hierarchy repair, with a maximum recorded rest-matrix element delta of approximately `1.34e-5`. Browser-compatible skinning reduced and normalized source weights that exceeded four influences. The maximum recorded discarded influence mass was approximately **10.67 percent**. Original modular skin weights are therefore **not** claimed to be completely unchanged.

The 21 modular entries are intentionally faceted, low-poly characters. Their variety comes from authored outfits and shapes, including workwear, formal wear, fantasy clothing, armor and spacesuits, rather than counting palette swaps as new characters.

Visual-review metadata has been synchronized for all **25 final VRMs**. The modular manifest records the existing runtime report and its hash, the 21 reviewed model hashes, 84 production-preset cases and the contact-sheet evidence. This metadata synchronization did not regenerate the models or thumbnails. Local visual review is separate from production publication; publication status remains false while deployment is pending.

### Conversion failure found and corrected

The first modular render run submitted triangles for female models while producing only background pixels. The imported FBX materials had Principled alpha values of zero despite source diffuse alpha values of one on solid, untextured palette materials.

The converter correction was limited to that contradictory alpha case. Per-material changes are recorded in `importedPaletteAlphaRepairs`; color, roughness and metallic values were not changed by the correction. The complete 21-model runtime run was repeated on the corrected files. A foreground-pixel gate was added so triangle submission alone cannot pass as evidence of a visible character.

## Actual runtime and visual evidence

The humanoid review used Chrome with the actual **Apple M2 Max / ANGLE Metal** WebGL renderer, not a software-renderer substitute. It loaded the real runtime files and measured skinned-vertex movement for arm, leg and head rotations.

All 25 humanoids passed the actual Studio `default`, `wave`, `sit` and `run` preset checks: **100 production-preset cases**. Every final pose capture also required a visible foreground area greater than two percent of the image. This is a bounded pose-and-render check, not exhaustive coverage of every Studio tool or every possible pose.

All 25 default thumbnails were visually reviewed. Representative sitting, running and waving captures were additionally inspected. For the 11 refined props, before/after renders were reviewed, GLB structure and bounds were checked, and three exported GLBs were re-imported and rendered. These checks concern actual geometry and runtime output, not only catalog metadata.

### Local review links

These relative links point to retained review artifacts. They are not public-production URLs.

- [Textured-character assembly and limitations](../artifacts/studio-asset-expansion/FANTASY-ASSEMBLY.md)
- [Textured-character GPU and pose measurements](../artifacts/studio-asset-expansion/fantasy-runtime-validation.json)
- [Modular-character review and limitations](../artifacts/studio-asset-expansion/MODULAR-RUNTIME-REVIEW.md)
- [Modular-character GPU and pose measurements](../artifacts/studio-asset-expansion/modular-runtime-validation.json)
- [Modular contact sheet 1](../artifacts/studio-asset-expansion/previews/modular-v1/contact-1.png)
- [Modular contact sheet 2](../artifacts/studio-asset-expansion/previews/modular-v1/contact-2.png)
- [Modular contact sheet 3](../artifacts/studio-asset-expansion/previews/modular-v1/contact-3.png)
- [Modular contact sheet 4](../artifacts/studio-asset-expansion/previews/modular-v1/contact-4.png)
- [Female formal outfit: sitting](../artifacts/studio-asset-expansion/previews/modular-v1/quaternius-modular-female-formal-studio-sit.png)
- [Female soldier: running](../artifacts/studio-asset-expansion/previews/modular-v1/quaternius-modular-female-soldier-studio-run.png)
- [Female witch: waving](../artifacts/studio-asset-expansion/previews/modular-v1/quaternius-modular-female-witch-studio-wave.png)
- [Refined prop quality report](../artifacts/studio-asset-quality-v8/quality-report.json)
- [Refined prop GLB validation](../artifacts/studio-asset-quality-v8/glb-validation.json)
- [Actual original-GLB high-quality admission checks](../artifacts/studio-3d-quality-review/original-high-quality-admission.json)
- [Fox mask before](../artifacts/studio-asset-quality-v8/previews/fox_mask-before.png)
- [Fox mask after](../artifacts/studio-asset-quality-v8/previews/fox_mask-after.png)
- [Ice cream cone before](../artifacts/studio-asset-quality-v8/previews/ice_cream_cone-before.png)
- [Ice cream cone after](../artifacts/studio-asset-quality-v8/previews/ice_cream_cone-after.png)

## Validation accounting

### Current reported results

| Reported suite | Result | Scope note |
| --- | --- | --- |
| Root focused asset/integration run | **355 tests in 23 files passed** | Includes the reported follow-up corrections; overlaps with other runs |
| Catalog and variant run | **180 tests in 5 files passed** | Separate overlapping run; not an additional unique-test total |
| Quality policy run | **17 of 17 tests passed** | Previously failing boundary case corrected |
| Cache and template follow-up run | **22 tests passed** | Includes the reported cache and template type/boundary corrections |
| Actual original-GLB admission checks | **3 assets passed the expected boundary checks** | Approximately 144 MiB each; rejected by automatic 128 MiB admission, accepted by high-quality 256 MiB admission; SHA values matched |
| Root TypeScript check | **`noEmit` exit 0** | Archived `artifacts/**` sources excluded from the product type-check scope |
| Production build and postbuild | **Exit 0** | Local build result, not a remote CI or deployment result |

The passing test counts must **not be added together** as a unique-test total. In particular, the 355-test and 180-test runs overlap. These are reported local results, not evidence of completed remote CI, merge or deployment.

### Historical checkpoints

Earlier task runs passed 245 tests in 9 files, 34 humanoid/thumbnail tests in 3 files, and 84 environment-related tests in 6 files. An earlier mobile UI/session run passed 11 tests plus lint. These historical counts also overlap and are not added to the current results.

The policy suite previously passed 16 of 17 tests before its boundary correction. The earlier root TypeScript run failed with 34 errors attributed to copied verifier sources in ignored artifact directories. That historical failure is superseded by the current successful product type check after excluding `artifacts/**`. Excluding archived copies is not a claim that those copies were individually repaired. The final reported template/cache checks include the follow-up template boundary and test-type corrections.

## Remaining quality and compatibility limits

- None of the 25 new humanoids has authored facial-expression morphs. Empty expression presets were not fabricated.
- The selected humanoid source files contain no animation clips. Working Studio pose controls do not mean an animation library was included.
- Male modular rigs have two-segment thumbs; female modular rigs have three-segment thumbs. Neither modular pack supplies toe bones.
- The textured ranger assemblies can still show an articulated boot-cuff seam under deep knee bends. The small weighted knee underlayer is not cloth simulation or a guarantee of seamless clothing in every pose.
- Skinned clothing was not exhaustively tested under all extreme poses, intersections or editor operations.
- The modular models are suitable as intentionally low-poly stylistic options, not evidence of photorealistic or universally highest-quality character production.
- Surface entries are material resources and should not be presented as newly modeled standalone objects.
- Original legacy versions remain available for compatibility. Replacement selection does not imply destructive removal from users' saved scenes.

## Mobile high-quality mode: locally validated, publication pending

The approved design is a bounded, session-only option, not an unlimited quality override:

- A finite **256 MiB** budget applies to the high-quality mode.
- The choice is **session-only**; it is not a permanent preference change.
- Renderer settings are unchanged by this option.
- Existing scene objects are not automatically unloaded to make room.
- A non-empty scene must have a scene-template copy successfully saved before the quality transition is enabled.
- An empty-scene checkpoint exception must be explicit rather than pretending that an empty template was saved.

The BG3D template-save handler now returns `Promise<boolean>`. It submits current primitives, custom models and the model-attachment mapping to the document adapter, using the current viewport camera when available. Existing refusal paths and save failures return `false`; a successful save in the still-current modal session returns `true`. A session change during the asynchronous save also returns `false`.

The pending-state correction and the reported policy, cache and template boundary/type corrections are included in the subsequent passing local runs. The final policy result is 17/17; the cache/template follow-up passed 22 tests. Catalog and variant checks also passed. These targeted checks extend the handler-level evidence without claiming exhaustive coverage of every possible browser session or editor operation.

Admission was additionally checked against three actual original GLB assets of approximately 144 MiB each, with matching SHA values: automatic 128 MiB mode rejected each and high-quality 256 MiB mode accepted each. The [retained admission report](../artifacts/studio-3d-quality-review/original-high-quality-admission.json) records this boundary evidence. Admission success is not a claim that arbitrary assets fit the budget or that the device has unlimited memory; it does not change renderer settings or permit automatic scene unloading.

At this final local checkpoint, the focused 355-test run, overlapping 180-test catalog run, root TypeScript check and production build plus postbuild have passed. Visual-review metadata is synchronized for all 25 VRMs. **Commit, push, remote CI, merge and production deployment remain pending.** The document is ready to be included with the local changes, but publication must be established by subsequent results rather than inferred from this report.
