# Quaternius free Standard character assembly

## Shipped designs

Four new character identities are assembled from the free Standard archives:

- `quaternius-female-peasant`: authored female peasant outfit, female head, buns.
- `quaternius-male-peasant`: authored male peasant outfit, male head, parted hair.
- `quaternius-female-ranger`: authored female ranger outfit and hood, female head, short hair.
- `quaternius-male-ranger`: authored male ranger outfit and hood, male head, short hair.

These are four outfit/gender designs, not hairstyle or skin-color permutations counted as extra characters. The website advertises the full paid-and-free kit as six base characters and twelve outfits. The actual free archives contain two complete superhero bases, six hairstyles, two eyebrow pieces and four complete headless outfits. Paid Source assets were not downloaded or used.

## Provenance and transformations

Original author: Quaternius. Both included `License_Standard.txt` files state CC0 1.0 Universal / Public Domain Dedication. Original source ZIPs and SHA-256 receipts are retained in `source-archives/` and `source-inventory.json`.

- Official bases: https://quaternius.com/packs/universalbasecharacters.html
- Official outfits: https://quaternius.com/packs/modularcharacteroutfitsfantasy.html
- License: https://creativecommons.org/publicdomain/zero/1.0/

The original clothing geometry and skin weights remain intact. The original base body is cropped to its authored head and neck, keeping those vertices' weights; the buried neck seam avoids rendering an entire naked body under the clothing. Female base/outfit rest matrices match exactly. Male head geometry is transferred with weighted source-to-target bind matrices before rebinding to the outfit's skeleton. Original hairstyles use the authored head bone.

Two original glTF normal-image URI spellings use `_png.png` while their actual PNG filenames end in `.png`. The Blender assembly corrects these references in memory, not in the immutable ZIPs. Base-color and normal maps are capped at 1024px; lower-frequency ORM/roughness maps at 512px. White hair, leather gloves and buckles are original material content, not missing textures.

VRM1 packaging adds explicit license metadata and 52 unambiguous humanoid mappings to the 65-joint skinned skeleton. The GLB binary chunks are byte-identical before and after adding the VRM extension. All final images are embedded and every model is below 15 MiB. No facial morphs, eye/jaw bones or source animation clips exist in these four free GLTF sources; none were fabricated. Library entries explicitly state `no-expressions`.

## Validation

`fantasy-runtime-validation.json` records real Chrome WebGL rendering through `GLTFLoader` and `VRMLoaderPlugin` on an asserted Apple M2 Max / ANGLE Metal backend, not a software renderer. Each model loads as VRM1, resolves 52 humanoid bones and real skinned meshes, and exhibits finite measurable vertex movement when normalized upper-arm, lower-leg and head poses are applied. Final full-body thumbnails show the actual VRM materials and lowered-arm pose.

This verifies the file/skin/VRM runtime path and selected normalized bone movements. It does not claim facial-expression support, a full authored animation library, universal costume compatibility or exhaustive Studio workflow coverage. The assets are refined stylized characters, not a claim of photorealistic or universally highest-tier production quality.

## Reproduce

Run from the repository root with the two official Standard archives extracted under `source-extracted/`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b --python-exit-code 1 --python scripts/blender/build_quaternius_fantasy_characters_v1.py
node scripts/package-quaternius-fantasy-vrm-v1.mjs
node --import tsx scripts/validate-quaternius-fantasy-vrm.mts http://127.0.0.1:5229
```

The local Vite dev server must already be running for the last command. Public files are under `apps/web/public/vrm/quaternius-fantasy-v1/` and `apps/web/public/assets/3d/characters/thumbnails/quaternius-fantasy-v1/`; editable Blend/GLB intermediates and review renders remain outside public in `assembled-fantasy-v1/` and `previews/fantasy-v1/`.

## Final production-preset and foreground checks

All four assembled VRM 1 characters additionally passed the actual Studio `default`, `wave`, `sit` and `run` presets (16 cases) using `applyPoserVisualState`. The final thumbnails use the production default pose. Every pose capture includes a foreground-pixel gate, and actual arm, leg and head skinned-vertex displacement is measured. These checks run on the Apple M2 Max / ANGLE Metal GPU and are recorded in `fantasy-runtime-validation.json`.

The two ranger assemblies include a small, weighted knee underlayer derived from the corresponding authored body mesh. It is not cloth simulation or a guarantee of seamless clothing under every pose. Deep knee bends can still reveal an articulated boot-cuff seam. The source outfit, head, hair and original skin weights otherwise retain their authored structure; male head/hair vertices are transferred between the different source and outfit bind rests. These four textured characters are distinct outfit/sex combinations, not skin- or hair-color variants counted as extra characters.
