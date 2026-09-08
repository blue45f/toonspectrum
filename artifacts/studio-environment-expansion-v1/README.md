# Studio environment expansion v1

Six new original places, not revisions or recolors of existing rooms. The active catalog now has 18 entries; all 12 historical v1 IDs and hashes still resolve separately.

## Review scope

Each final PNG was directly inspected at its authored oblique overview camera. `visual-review.json` ties each observation to the exact model and image SHA-256. This is not an all-angle artistic approval, photorealism claim, or a Studio browser-render verification. Generated set dressing garments are not wearable or skinned character clothing. The pavilion has an intentional front architectural roof cutaway for character visibility.

## Delivery

| File | Bytes | Instanced triangles | Draw calls | Embedded images |
|---|---:|---:|---:|---:|
| library_reading_room.glb | 23,818,220 | 149,261 | 31 | 20 |
| independent_bookshop.glb | 21,020,616 | 88,478 | 20 | 20 |
| fashion_boutique.glb | 12,516,872 | 63,093 | 13 | 13 |
| park_garden_pavilion.glb | 20,896,920 | 92,171 | 14 | 19 |
| police_interview_room.glb | 5,305,120 | 34,356 | 12 | 7 |
| science_research_laboratory.glb | 6,376,868 | 69,568 | 12 | 7 |

Total new GLB bytes: 89,934,616. Each scene loads on selection, not as an upfront aggregate download. Embedded PBR images are at most 1024px; images and shared materials are reused inside each file.

## Source and reproducibility

Generator: `scripts/blender/generate_studio_environment_expansion_v1.py`. Original authored scene geometry is CC0-1.0 by ToonSpectrum. Imported scanned furniture/plants/books and PBR image sources are CC0 Poly Haven assets; per-scene provenance and public `LICENSES.md` retain their URLs. Regenerating a GLB resets its generated report to preview-pending; re-review its new hash before publishing.

## Validation

Actual mobile GLB admission and immutable metadata are covered by `studio-bg3d-environment-expansion-v1.test.ts`. Final focused run result is reported separately after all bytes and metadata stop changing. Browser/Studio admission is tracked by the runtime agent, not inferred from Blender preview success.
