# Character Shaper — browser verification captures

Captured 2026-09-04 from the local dev server at the viewports listed below, by
`pnpm verify:studio-character-shaper`. These are implementation evidence, not product mockups.

| Capture | Verified |
| --- | --- |
| `character-desktop.png` | 1440×900 workshop: 15-slot rail, searchable shelf with genre filters and predictive previews, viewport with camera presets and transparent background, precision inspector, output dock |
| `character-desktop-hair.png` | Hair shelf with the model's own hair kept, a no-hair card, and procedural silhouettes |
| `character-desktop-top.png` | After committing no-hair and a T-shirt: bald head, garment applied, change count 2, undo enabled, garment colour and original-costume controls in the inspector |
| `character-desktop-pose.png` | Pose shelf with stick-figure previews projected from each preset's bone map |
| `character-mobile.png` | 390×844 stacked layout, no horizontal overflow |
| `character-shaper-evidence.json` | Pixel deltas per commit, PSD layer names, accessible-name gaps, page errors |

The exported PSD is written next to these files by the verification run and is not committed; its
layer names are recorded in the evidence JSON.
