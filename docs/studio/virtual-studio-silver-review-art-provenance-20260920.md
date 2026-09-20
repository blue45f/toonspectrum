# Silver four-direction continuous review candidates

Four genuine drawn phases per direction: read/hover, track/approach, tap, lift/recover. Original silver-haired boy identity, navy jacket/white shirt/charcoal trousers/white sneakers and blue earrings were visually matched to the authored production-v2 references. No walking legs or swapped clothing.

Only built-in imagegen was used. Requested 1024x1280; actual outputs are all 1122x1402 RGBA (561x701 cells), matching the existing drawn pack. Root accepted the actual dimensions; no resize/warp/alpha editing/recoloring occurred. Each candidate is a byte-identical copy of the default generated source. Exact prompts are prompt-DIRECTION-v1.txt and exact paths/hashes/alpha data are inspection.json.

Alpha 0..255; all sixteen cells have no alpha>=64 pixels on a cell boundary. Fixed foot attachment is derived from the alpha>=64 shoe bounds in the lower110px. There are raw row-position differences of8..21px, resolved by frame-origin metadata, not modified PNGs. Each direction uses one uniform scale based on the median drawn height relative to its original reference; head nods remain intact.


## Exact generation prompts

### down

```text
Create a production game animation sheet by editing the referenced character. Exact identity preservation: same silver-haired chibi BOY with fluffy layered silver hair, blue ear earrings, blue-grey eyes, navy bomber jacket over plain white T-shirt, charcoal trousers and white lace-up sneakers, same head/body proportions and refined softly painted anime rendering. Do not redesign his age, gender, face, clothing or hair.

This is a STATIONARY REVIEW/READING ACTION LOOP, NOT WALKING. The feet, shoes, legs, pelvis and upright torso stay planted in the exact same calm standing pose in all four frames. Only the eyes, slight head angle, right forearm/wrist and stylus change. Both feet remain flat and side by side; no stepping, no leg crossing, no knee lift, no swaying. He holds a small thin dark-slate PORTRAIT drawing tablet at abdomen height in his LEFT hand, with a small plain light screen with no text; his RIGHT hand holds one short light-grey stylus. The tablet is the exact same size/design/grip across the entire sheet. The screen faces the boy, never outward to the viewer. No extra fingers or floating objects.

OUTPUT: one genuine transparent RGBA PNG, exactly 1024 x 1280, FOUR complete full-body animation frames in two equal columns and two equal rows (each cell512x640). Reading order top-left, top-right, bottom-left, bottom-right. All frames have the same camera, body/head scale and registered foot position at cell-local x256,y600. Head top approximately cell-local y60. Leave at least32px transparent margins and completely separate figures. Keep shoes/arms/prop inside the correct cell. Transparent background means alpha=0 outside characters, NOT white/grey/black/checkerboard. No backdrop, ground, shadow, glow, labels, frame dividers or captions.

Four meaningfully different consecutive frames of ONE gentle review action:
0 TOP LEFT: reads the tablet with eyes lowered, stylus tip hovering a short distance above the upper half of the screen.
1 TOP RIGHT: eyes track a line downward, chin tilts down only about3degrees; right wrist brings stylus toward the screen.
2 BOTTOM LEFT: makes one small precise stylus tap/short mark on the lower half of screen; wrist rotates slightly, right elbow moves a little, eyes concentrate at that point. This arm/hand position must be visibly different from frames0 and1.
3 BOTTOM RIGHT: stylus lifts from the screen and returns toward the initial hover position, chin gently returns toward frame0. Distinct relaxed recovery, suitable for looping back to0.
Quiet professional concentration, closed mouth, no talk/wave/walking poses. Preserve leg/foot outlines and exact shoe baseline throughout.
DIRECTION: all four drawings are the FRONT/down view from reference, looking toward viewer with eyes lowered to his own tablet. Keep face visible. We see the back of the tablet, its top edge and subtle screen edge, because the screen faces the boy. His left hand appears on viewer-right supporting it; his right stylus hand appears on viewer-left. Do not swap hands between frames.
```

### right

```text
Create a production game animation sheet by editing the referenced character. Exact identity preservation: same silver-haired chibi BOY with fluffy layered silver hair, blue ear earrings, blue-grey eyes, navy bomber jacket over plain white T-shirt, charcoal trousers and white lace-up sneakers, same head/body proportions and refined softly painted anime rendering. Do not redesign his age, gender, face, clothing or hair.

This is a STATIONARY REVIEW/READING ACTION LOOP, NOT WALKING. The feet, shoes, legs, pelvis and upright torso stay planted in the exact same calm standing pose in all four frames. Only the eyes, slight head angle, right forearm/wrist and stylus change. Both feet remain flat and side by side; no stepping, no leg crossing, no knee lift, no swaying. He holds a small thin dark-slate PORTRAIT drawing tablet at abdomen height in his LEFT hand, with a small plain light screen with no text; his RIGHT hand holds one short light-grey stylus. The tablet is the exact same size/design/grip across the entire sheet. The screen faces the boy, never outward to the viewer. No extra fingers or floating objects.

OUTPUT: one genuine transparent RGBA PNG, exactly 1024 x 1280, FOUR complete full-body animation frames in two equal columns and two equal rows (each cell512x640). Reading order top-left, top-right, bottom-left, bottom-right. All frames have the same camera, body/head scale and registered foot position at cell-local x256,y600. Head top approximately cell-local y60. Leave at least32px transparent margins and completely separate figures. Keep shoes/arms/prop inside the correct cell. Transparent background means alpha=0 outside characters, NOT white/grey/black/checkerboard. No backdrop, ground, shadow, glow, labels, frame dividers or captions.

Four meaningfully different consecutive frames of ONE gentle review action:
0 TOP LEFT: reads the tablet with eyes lowered, stylus tip hovering a short distance above the upper half of the screen.
1 TOP RIGHT: eyes track a line downward, chin tilts down only about3degrees; right wrist brings stylus toward the screen.
2 BOTTOM LEFT: makes one small precise stylus tap/short mark on the lower half of screen; wrist rotates slightly, right elbow moves a little, eyes concentrate at that point. This arm/hand position must be visibly different from frames0 and1.
3 BOTTOM RIGHT: stylus lifts from the screen and returns toward the initial hover position, chin gently returns toward frame0. Distinct relaxed recovery, suitable for looping back to0.
Quiet professional concentration, closed mouth, no talk/wave/walking poses. Preserve leg/foot outlines and exact shoe baseline throughout.
DIRECTION: all four drawings face image RIGHT, matching the exact three-quarter right-side camera of the reference. Never turn toward front or away. Hold the tablet slightly in front of the abdomen toward image-right; its screen tilts toward his lowered eyes. Right-side near arm/hand with stylus is legible from this camera and changes clearly between four phases. Preserve the reference's compact side-profile shoes and constant head size.
```

### left

```text
Create a production game animation sheet by editing the referenced character. Exact identity preservation: same silver-haired chibi BOY with fluffy layered silver hair, blue ear earrings, blue-grey eyes, navy bomber jacket over plain white T-shirt, charcoal trousers and white lace-up sneakers, same head/body proportions and refined softly painted anime rendering. Do not redesign his age, gender, face, clothing or hair.

This is a STATIONARY REVIEW/READING ACTION LOOP, NOT WALKING. The feet, shoes, legs, pelvis and upright torso stay planted in the exact same calm standing pose in all four frames. Only the eyes, slight head angle, right forearm/wrist and stylus change. Both feet remain flat and side by side; no stepping, no leg crossing, no knee lift, no swaying. He holds a small thin dark-slate PORTRAIT drawing tablet at abdomen height in his LEFT hand, with a small plain light screen with no text; his RIGHT hand holds one short light-grey stylus. The tablet is the exact same size/design/grip across the entire sheet. The screen faces the boy, never outward to the viewer. No extra fingers or floating objects.

OUTPUT: one genuine transparent RGBA PNG, exactly 1024 x 1280, FOUR complete full-body animation frames in two equal columns and two equal rows (each cell512x640). Reading order top-left, top-right, bottom-left, bottom-right. All frames have the same camera, body/head scale and registered foot position at cell-local x256,y600. Head top approximately cell-local y60. Leave at least32px transparent margins and completely separate figures. Keep shoes/arms/prop inside the correct cell. Transparent background means alpha=0 outside characters, NOT white/grey/black/checkerboard. No backdrop, ground, shadow, glow, labels, frame dividers or captions.

Four meaningfully different consecutive frames of ONE gentle review action:
0 TOP LEFT: reads the tablet with eyes lowered, stylus tip hovering a short distance above the upper half of the screen.
1 TOP RIGHT: eyes track a line downward, chin tilts down only about3degrees; right wrist brings stylus toward the screen.
2 BOTTOM LEFT: makes one small precise stylus tap/short mark on the lower half of screen; wrist rotates slightly, right elbow moves a little, eyes concentrate at that point. This arm/hand position must be visibly different from frames0 and1.
3 BOTTOM RIGHT: stylus lifts from the screen and returns toward the initial hover position, chin gently returns toward frame0. Distinct relaxed recovery, suitable for looping back to0.
Quiet professional concentration, closed mouth, no talk/wave/walking poses. Preserve leg/foot outlines and exact shoe baseline throughout.
DIRECTION: all four drawings face image LEFT, matching the exact three-quarter left-side camera of the reference. Never turn toward front or away. Hold the tablet slightly in front of abdomen toward image-left; screen tilts toward his eyes. Show the far right stylus hand above the tablet edge, enough to read its hovering→tap→return movement, while near left hand supports it throughout. Never swap hands. Preserve constant profile shoes and head size.
Image1 is the exact LEFT identity/camera authority. Image2 shows the accepted SAME boy's right-view four-phase reading loop only as action/prop/style reference. Use the same compact dark tablet, light stylus and calm subtle hand/head cycle. DO NOT copy image2's right-facing camera; every frame must stay LEFT-facing.
```

### up

```text
Create a production game animation sheet by editing the referenced character. Exact identity preservation: same silver-haired chibi BOY with fluffy layered silver hair, blue ear earrings, blue-grey eyes, navy bomber jacket over plain white T-shirt, charcoal trousers and white lace-up sneakers, same head/body proportions and refined softly painted anime rendering. Do not redesign his age, gender, face, clothing or hair.

This is a STATIONARY REVIEW/READING ACTION LOOP, NOT WALKING. The feet, shoes, legs, pelvis and upright torso stay planted in the exact same calm standing pose in all four frames. Only the eyes, slight head angle, right forearm/wrist and stylus change. Both feet remain flat and side by side; no stepping, no leg crossing, no knee lift, no swaying. He holds a small thin dark-slate PORTRAIT drawing tablet at abdomen height in his LEFT hand, with a small plain light screen with no text; his RIGHT hand holds one short light-grey stylus. The tablet is the exact same size/design/grip across the entire sheet. The screen faces the boy, never outward to the viewer. No extra fingers or floating objects.

OUTPUT: one genuine transparent RGBA PNG, exactly 1024 x 1280, FOUR complete full-body animation frames in two equal columns and two equal rows (each cell512x640). Reading order top-left, top-right, bottom-left, bottom-right. All frames have the same camera, body/head scale and registered foot position at cell-local x256,y600. Head top approximately cell-local y60. Leave at least32px transparent margins and completely separate figures. Keep shoes/arms/prop inside the correct cell. Transparent background means alpha=0 outside characters, NOT white/grey/black/checkerboard. No backdrop, ground, shadow, glow, labels, frame dividers or captions.

Four meaningfully different consecutive frames of ONE gentle review action:
0 TOP LEFT: reads the tablet with eyes lowered, stylus tip hovering a short distance above the upper half of the screen.
1 TOP RIGHT: eyes track a line downward, chin tilts down only about3degrees; right wrist brings stylus toward the screen.
2 BOTTOM LEFT: makes one small precise stylus tap/short mark on the lower half of screen; wrist rotates slightly, right elbow moves a little, eyes concentrate at that point. This arm/hand position must be visibly different from frames0 and1.
3 BOTTOM RIGHT: stylus lifts from the screen and returns toward the initial hover position, chin gently returns toward frame0. Distinct relaxed recovery, suitable for looping back to0.
Quiet professional concentration, closed mouth, no talk/wave/walking poses. Preserve leg/foot outlines and exact shoe baseline throughout.
DIRECTION: all four drawings are strictly the BACK/up view of the reference, facing away. No visible face, no turned head toward viewer. The tablet is held IN FRONT of his torso and therefore mostly hidden behind his body; only its side/top edges may peek beyond the jacket naturally. Show the right forearm/elbow opening gently outward on viewer-right, and the stylus hand partly visible beside the right torso edge, then moving inward to tap before recovering. Head tilt changes gently down/recover, hair outline remains stable. Do not move the tablet behind his back. Back-view reading is conveyed by actual elbow/wrist and small head movement without inventing visible front-facing screen.
Image1 is the exact BACK identity/camera authority. Image2 shows the accepted SAME boy's right-view four-phase reading loop only as action/prop/style reference. Use the same compact dark tablet, light stylus and calm subtle hand/head cycle. DO NOT copy image2's right-facing camera; every frame must stay strictly BACK-facing.
```

## Integration acceptance

Actual production Phaser component and NPC director passed both forced Canvas and forced WebGL browser runs on 2026-09-20. Each direction loaded its current review sheet only (maximum1 action sheet), displayed all four frames during perform, kept the authority floor point constant with the checked-in per-frame shoe origins, and restored walk then directional idle on exit. A live reduced-motion preference produced12 consecutive frame0 samples with fixed position. Eight mount/restart operations retained one active canvas, began new scenes with zero prior action sheets, and final unmount left zero canvases. Both runs had zero page errors. WebGL used headless Chromium with --enable-unsafe-swiftshader available and checked the actual WebGL context; this is renderer correctness evidence, not a native GPU performance or20-minute memory benchmark.

Local evidence:
- /tmp/virtual-studio-action-art-silver/runtime-canvas/report.json and npc-review.webm
- /tmp/virtual-studio-action-art-silver/runtime-webgl/report.json and npc-review.webm
- Each folder contains all16 actual product-rendered frame screenshots and reduced-motion.png.
- /tmp/virtual-studio-action-art-silver/verify-runtime.mjs is the exact local browser probe. It uses the real reviewed floor and source NPC director with a single authored review fixture; human slots are removed in that fixture. It does not substitute for shared-seat or media-authority tests.

Source validation:7 focused/adjacent Vitest files85 tests passed. Art manifest suite17 tests passed, including the unchanged24 base sheets/96 frames plus4 review sheets/16 frames, byte integrity and decoded transparent bounds, a new negative test for horizontal shoe-origin drift, and original production/clean-plate gates. Scoped ESLint and git diff --check passed. The unchanged world generator produced only the two intended writer animation values idle to review; room, acoustic and seat geometry were unchanged. Full integrated web typecheck is owned by the parent task; the local attempt with default4GB Node heap stopped with OOM before diagnostics and is not a pass.

Product behavior: silver's four directional action clips use a2.4second cycle from local activity time. Texture loading uses the existing scene-local residency and current direction only, with existing static fallback and teardown guards. Silver advertises the review capability using registry revision drawn-characters-v1-review-1. Other skins retain their existing capabilities; no extra work/talk/draw/wave animation completion is claimed. Default writer work/inspect anchors select review; rest stays idle. Tool/media actions are unchanged.


## Exact selected artifact integrity

| Direction | Source image | SHA-256 | Bytes |
|---|---|---|---:|
| down | exec-3be397fb-9e73-46d5-bfd1-db339bcb87b6.png | bdcb6cfafd703fb687c34d50e41af6dbfaf64c95135d1d42350bce618ddfa62c | 1093116 |
| right | exec-49188558-cc50-41d6-95a3-0442ee0461da.png | 60ff2592fa2351bce3ba054a74eab2276b12429e2d69da6b0a8354f20c65381e | 967216 |
| left | exec-0637ed6c-93c6-41b1-95c7-e28b51d29bd0.png | 6a2d96c6181da25527f22f6a4eb93c131b028556955dd5660dfbe16eb1e13f04 | 1020786 |
| up | exec-58c8f4a3-1f94-4137-a257-af07a26ee5fc.png | 01f82afc8c2f43696f9b1dbe6f9c5db81252200d9b310dd9e0de8816d34b5798 | 887487 |

Frame dimensions, alpha bounds, decoded RGBA frame hashes, foot bounds, origins and uniform display ratios are in drawn-characters-v1/art-manifest.json and its checked-in runtime binding. Source PNG bytes remain unchanged.
