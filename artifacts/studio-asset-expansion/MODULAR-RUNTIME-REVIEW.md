# Quaternius modular humanoid runtime review

## Scope and activation

- 21 distinct authored outfits: 11 male and 10 female humanoids.
- These are deliberately low-poly, faceted characters, not photorealistic avatars or recolor variants counted as additional characters.
- Runtime files: `apps/web/public/vrm/quaternius-modular-v1/{id}.vrm`.
- Actual GPU-rendered thumbnails: `apps/web/public/assets/3d/characters/thumbnails/quaternius-modular-v1/{id}.png`.
- Connected through `quaternius-modular-catalog.ts` and the existing `SAMPLE_VRMS` list in `vrm-library.ts`; pre-existing entries are preserved.
- Local catalog integration is not evidence of deployment to the production website.

## Provenance

- Male pack: https://quaternius.com/packs/ultimatemodularcharacters.html
- Female pack: https://quaternius.com/packs/ultimatemodularwomen.html
- Source license: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/
- Original FBX files, license text and source receipts are retained under `modular-humanoid-sources/` outside the web public directory.
- Per-asset hashes, source URLs, mapped bones and conversion changes are recorded in the public pack manifest.

## Validation performed

- Final rendering used Chrome with the actual Apple M2 Max / ANGLE Metal WebGL renderer, not SwiftShader.
- All 21 VRM 1 assets loaded with the production VRM loader integration.
- Actual skinned mesh vertex displacement was checked independently for upper arm, lower leg and head rotations. Triangle submission alone was not treated as evidence of visible geometry.
- All 21 models passed the actual Studio `default`, `wave`, `sit` and `run` preset checks: 84 production-preset cases.
- Every captured pose required a non-background foreground area above two percent of the image.
- All 21 neutral thumbnails were inspected in contact sheets. Female formal sitting, female soldier running and female witch waving were additionally inspected at full capture resolution after the opacity repair.
- Machine-readable measurements, output hashes and GPU identity: `modular-runtime-validation.json`.
- Review images and four contact sheets: `previews/modular-v1/`.

## Failure found and correction

The first numeric pose run submitted triangles for female models but rendered only the background. Inspection found FBX imported Principled alpha values of zero on solid, untextured palette materials whose source diffuse alpha was one. The converter now corrects only this contradictory case to opaque alpha. Each material name, old and new alpha, and reason are retained in `importedPaletteAlphaRepairs`. Color, roughness and metallic values were not changed. A foreground-pixel gate and material-opacity regression assertion were added, and the complete 21-model run was repeated successfully on the corrected outputs.

## Limitations

- These source FBX files contain no animation clips. Studio pose support does not imply that a source animation library was bundled.
- There are no authored facial expression morphs. No empty expression presets were fabricated.
- Male rigs expose 48 humanoid bones with two-segment thumbs; female rigs expose 50 with three-segment thumbs. Neither pack provides toe bones.
- Female upper-leg hierarchy was repaired for VRM compatibility while preserving rest transforms within the recorded tolerance; maximum recorded matrix-element delta was approximately 1.34e-5.
- Source weights with more than four influences were reduced and normalized for the browser path. Maximum discarded influence mass was approximately 10.67 percent, under the converter's twenty-percent ceiling. Original weights are not claimed to be byte-for-byte preserved. Per-model statistics remain in the manifest.
- Clothing is skinned geometry without cloth simulation. Extreme poses and all editor tools were not exhaustively validated by this bounded review.
