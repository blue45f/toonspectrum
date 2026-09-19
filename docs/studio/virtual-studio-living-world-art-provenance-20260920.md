# Living World background provenance

Status: **current implementation record** for the background asset prepared on 2026-09-20. This record establishes file provenance and verification scope; it does not claim the entire Living World design, visual acceptance, PR merge, or deployment is complete.

## Preserved reference and generated clean plate

The reference was the existing authored studio background at `apps/web/public/assets/virtual-studio/production-v2/master-central-lossless.webp`. It remains unchanged: 869 × 813 pixels, 1,091,280 bytes, SHA-256 `49b5bb57cebe4afeeb4c4b481ba17da2b10adc47aad27101fcf90f49180f146e`.

The `image_gen` edit used that reference to remove baked human figures, character nameplates, speech bubbles and cats, while retaining the room arrangement, furniture, fountain mascot and warm isometric art direction. This is an intent summary rather than a verbatim generation prompt. The generated image contains reconstructed floor and furniture pixels. **It is not pixel-identical to the authored reference**, including outside the removed characters; layout and style preservation require visual review.

The resulting PNG artifact was `exec-70d77608-9c6a-47c5-851e-90e2176a3618.png`, 1,296 × **1,213** pixels, 2,716,789 bytes, SHA-256 `06d79f1539f24afac01bf7ffba8adc48b8be3198975f31f68347c442a4fef096`. The initially reported height of 1,216 was corrected after decoding both actual files. The original generated PNG is retained by the local image-generation tool and is not committed to the repository.

`cwebp` version 1.6.0 encoded the generated PNG once using:

```sh
cwebp -lossless -z 9 <imagegen-output.png> -o apps/web/public/assets/virtual-studio/living-world/master-clean-plate.webp
```

The committed clean plate is 1,296 × 1,213 pixels, 2,062,398 bytes, SHA-256 `4ddf70d019b26261a49eb1e16b7ab6b2bbe91b95593afa191dbb0724086c6f55`. The output contains a static lossless `VP8L` WebP bitstream. At preparation time, Pillow decoded the generated PNG and WebP to RGBA; dimensions and every decoded byte were equal. Their decoded RGBA SHA-256 was `94874295b03977492f41ee81a9cb155d0445e6e580191822731758ae95f28675`. “Lossless” describes the conversion from the generated PNG, not equivalence to the original authored studio background.

The private approved master source recorded by the older production manifest has SHA-256 `62d42f5fead432be3589504641f16ebf99c147c28091e1977c87a41bed23b14e`. That private source was **not** reopened or reverified for this edit. Its existing provenance remains in `production-v2/art-manifest.json`, separately from the new `living-world/art-manifest.json`.

## Repository verification

Run these existing repository commands:

```sh
pnpm run verify:studio-virtual-art
pnpm run test:studio-virtual-art
```

The verifier retains all 36 original production-art output checks and additionally verifies the clean plate's byte length, SHA-256, actual dimensions, static lossless WebP encoding, and its preserved authored reference's identity. It checks agreement between the runtime manifest URL, `scripts/generate-virtual-studio-default-world.mts`, and the generated Tiled background layer. The world remains 850 × 798 world units; image resolution and world coordinates are distinct.

The verifier does not call image generation, regenerate the background, decode the uncommitted generated PNG, or claim that its recorded preparation-time pixel comparison ran again. Changing generated artwork requires a new reviewed asset and updated provenance, not relabeling an existing checksum.

## Remaining visual constraints

- The clean plate is one flattened image. Furniture cannot be independently moved or provide separately authored foreground occlusion merely by changing colliders.
- The preserved four character skins still use cutout-rig walk deformation; no newly drawn walk poses or new sprite trial were produced by this background change.
- Checksums and header checks establish asset identity and encoding. They do not prove removal of every baked character, precise furniture/collider alignment, equal perceived quality, or acceptable sprite placement. Those remain visual acceptance work in the actual runtime.
