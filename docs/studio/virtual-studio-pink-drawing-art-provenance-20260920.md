# Pink continuous drawing artwork - 2026-09-20

Status: current source integration; final renderer results below. Original PNG bytes are preserved. This addition completes pink directional draw loops only, not all character actions.

The built-in imagegen used the original production-v2 pink directional images and existing pink drawing-state artwork. Pink walk, wave and sit sheets were inspected for identity/proportions; no silver or walking sheet was used as a generation template. Salmon bob/heart clip, cream cardigan, dark blouse/skirt and brown shoes retain the original design. The right first candidate turned too far toward the front and showed ambiguous tablet contact; a second built-in imagegen edit corrected the camera and screen contact. No CLI provider, resizing, warping, alpha editing, recoloring or recompression was used.

The four consecutive drawings show observe, long stroke, small refinement and check/recover. They have a quiet stationary stance, not walking feet. Four key drawings are not a multi-bone animation or many hand-drawn in-betweens. Slight line/cloth redraw differences remain, and the rear tablet is naturally hidden in front of the body.

## Exact source and atlas layout

| Direction | Source image | Original dimensions | Integer cell | Declared right/bottom remainder | Max alpha / nonzero pixels | SHA-256 |
|---|---|---|---|---|---|---|
| down | exec-22e04a68-134a-4f2c-9e86-6f1837b57b17.png | [1121, 1403] | 560 x 701 | 1 / 1 | 0 / 0 | 737b24a666d8b61d8dcfa4c5204b132ccf6d212a81742ac242771041a8496015 |
| right | exec-d7960ae5-88b1-42e3-8add-6573084bb736.png | [1122, 1402] | 561 x 701 | 0 / 0 | 0 / 0 | b8df511cb19651e5dfca5aab84ffbf7a0ffc0cdd7eb63c826ec46d3570f11f09 |
| left | exec-0d51eb8d-2edb-4f0d-98f1-133f795484a1.png | [1072, 1467] | 536 x 733 | 0 / 1 | 0 / 0 | 650f4581f321bb1de7af0f91a4cf9bd610e9ae9506b87612bda1c13af65ece75 |
| up | exec-2b30c624-f20e-4745-818d-79526f6f86cb.png | [1072, 1467] | 536 x 733 | 0 / 1 | 1 / 1 | 191f032e1e1d1ac96ed13ffcbf4658cc62a0777f7ae2cb9053e79dbe32fd71a0 |

All sources are from the built-in tool default directory $CODEX_HOME/generated_images/01a0bb3f-0968-7303-bc77-c66fc680d664/. The four selected files total 4,140,325 bytes and remain byte-identical to those files. Source reference hashes, full dimensions, per-frame decoded RGBA hashes, alpha >= 64 silhouette/shoe bounds, foot origins, uniform per-direction scale and the exact remainder RGBA hash are stored in drawn-characters-v1/art-manifest.json.

The existing 28 sheets (24 walk/held-pose sheets plus 4 silver review sheets) still require exactly two cells in each dimension and cannot opt into remainder metadata. Only the four explicit pink draw entries declare full atlas dimensions and zero/one trailing row/column. Their remainder pixels are decoded and checked: maximum alpha 1, at most one nonzero-alpha pixel, exact declared count and exact RGBA hash. The actual up sheet contains a single alpha 1 pixel in its final row; all other remainders are alpha 0. No opaque source artwork is outside the four cells. Negative tests reject larger remainders, full-size drift, noninteger cells, missing declarations, opaque/multiple-alpha pixels and hidden RGB changes. All 28 original strict-layout negative tests remain enforced.

## Exact selected prompts

### down

```text
Use the two references of the SAME PINK-HAIRED GIRL to draw a new production game action animation. Image1 defines the exact requested direction and original full-body identity. Image2 is her existing drawing pose and defines her drawing tablet and stylus. Preserve her salmon-pink bob with bangs and heart-shaped hairclip, pink-brown eyes, cream button cardigan with balloon sleeves, charcoal collared blouse, dark pleated skirt, bare lower legs and brown loafers, and her exact cute head-to-body proportions. Refined soft painted anime/chibi linework and shading, no redesign. She is the original girl, not a recolored boy. No silver character or silver animation reference is used.

Create FOUR distinct consecutive drawings of her standing and DRAWING a small sketch on her tablet. This is a real artist's drawing action: an observed composition, a deliberate lateral pen stroke, a smaller correcting stroke, then lifting the pen to assess it. It must not look like repeatedly tapping/reading, typing, waving, walking, dancing or cycling legs. Her pelvis, knees, skirt and both planted shoes remain still in all four frames. Only the drawing elbow, forearm, wrist, fingers, eyes and a tiny head nod change. Torso stays calm and upright. Keep the same silhouette scale; no stretching, shrinking or leaning from the waist.

Use the same small thin charcoal-black drawing tablet and dark stylus as image2. Her LEFT hand supports the tablet at lower-chest/upper-waist level. It is a compact landscape tablet tilted toward her face, about the width of her torso. Her RIGHT hand grips the stylus naturally with thumb/index/middle finger. Screen faces HER. Keep the tablet and left supporting grip steady in all frames. No giant prop, text, logos, printed UI, floating stroke effects, sparkles or extra fingers.

LAYOUT: output1122x1402 genuine transparent RGBA PNG, four complete sprites in a TWO BY TWO grid, eachcell561x701. Reading order0top-left,1top-right,2bottom-left,3bottom-right. Clear at least32px transparent margins around every complete head/arm/prop/shoe. Each character ground pivot is cell-local x280,y660, head top abouty50, with identical original body/head scale. All feet fully visible. Do not cross a cell boundary. Background alpha=0, not white, black, grey or checkerboard. No floor, shadows, glows, captions, dividers or furniture.

FRAME0 TOP LEFT — OBSERVE: quietly studies the sketch with eyes focused downward, stylus hovering above the upper-left part of her screen, elbow relaxed; slight thoughtful neutral smile.
FRAME1 TOP RIGHT — DRAW LINE: stylus TIP CONTACTS the screen after traveling laterally about one HAND-WIDTH across its upper/central area toward her right. Her drawing forearm opens and wrist extends visibly. Eyes follow the pen. This must be a clearly new hand/elbow pose, not a tiny duplicate or a tap.
FRAME2 BOTTOM LEFT — REFINE: pen remains in contact lower on the sketch, wrist bends inward to draw a short small complementary stroke; elbow comes in slightly; head nods down only2-3degrees. Clearly distinguish this short lower correction from frame1's extended upper stroke.
FRAME3 BOTTOM RIGHT — CHECK/RECOVER: lifts the stylus one pen-tip length off the screen, brings the right hand gently back toward frame0's initial position, eyes assess the drawing and head returns; an ordinary relaxed loop back to frame0.
The four drawings must communicate drawing rhythm while the lower body stays planted. Do not reuse one body sprite with only a moved prop; draw natural arm and sleeve folds for the actual four hand positions.
DIRECTION: all four are the FRONT/down view of image1. She looks toward her own screen, not up at the camera. We mostly see the tablet BACK since its screen faces her; small top/side edges can show naturally. Her left supporting hand appears viewer-right; her right stylus hand appears viewer-left. The lateral drawing wrist/forearm movement must be visible above the tablet edge. Keep the heart clip on the reference side.
```

### right

```text
Correct the first reference animation sheet using image2 as the strict RIGHT PROFILE camera/face authority. Keep the pink girl's exact salmon bob, heart clip, cream cardigan, dark collared blouse/pleated skirt and brown shoes. Preserve all four distinct drawing action phases and the standing still stance, tablet, stylus and 2by2 transparent layout. The current four faces rotate too much toward the viewer: change EVERY frame to the same nearly SIDE-ON RIGHT profile as image2, nose pointing right, near eye visible, far eye mostly hidden by the nose/bangs. Keep the torso/skirt/feet in that same stable right profile too. It must read as the original RIGHT-direction sprite, not front/right diagonal. Maintain identical head/body scale in allcells and stablefeetbaselines.
The tablet screen faces HER and tilts upward toward her eyes; from the side a slim screen plane is visible with a subtle pale drawing surface, no text/UI. Pen must contact the screen surface, never draw on the tablet BACK. Keep small landscape tablet size and left support grip fixed. TOP LEFT observe pen hovering, TOP RIGHT a visibly extended lateral line stroke, BOTTOM LEFT a smaller lower correction stroke with wrist returning in, BOTTOM RIGHT pen lifts and returns to assess. Existing four poses are the action structure, not a color-swapped review. No walking, knees/hips stay planted. Actualcanvas1122x1402,2by2equalcells561x701, complete figures with32px minimum transparent margin, true RGBA alpha0 background, no shadow/floor/glow/captions. Do not change the character design or outfit.
```

### left

```text
Use the two references of the SAME PINK-HAIRED GIRL to draw a new production game action animation. Image1 defines the exact requested direction and original full-body identity. Image2 is her existing drawing pose and defines her drawing tablet and stylus. Preserve her salmon-pink bob with bangs and heart-shaped hairclip, pink-brown eyes, cream button cardigan with balloon sleeves, charcoal collared blouse, dark pleated skirt, bare lower legs and brown loafers, and her exact cute head-to-body proportions. Refined soft painted anime/chibi linework and shading, no redesign. She is the original girl, not a recolored boy. No silver character or silver animation reference is used.

Create FOUR distinct consecutive drawings of her standing and DRAWING a small sketch on her tablet. This is a real artist's drawing action: an observed composition, a deliberate lateral pen stroke, a smaller correcting stroke, then lifting the pen to assess it. It must not look like repeatedly tapping/reading, typing, waving, walking, dancing or cycling legs. Her pelvis, knees, skirt and both planted shoes remain still in all four frames. Only the drawing elbow, forearm, wrist, fingers, eyes and a tiny head nod change. Torso stays calm and upright. Keep the same silhouette scale; no stretching, shrinking or leaning from the waist.

Use the same small thin charcoal-black drawing tablet and dark stylus as image2. Her LEFT hand supports the tablet at lower-chest/upper-waist level. It is a compact landscape tablet tilted toward her face, about the width of her torso. Her RIGHT hand grips the stylus naturally with thumb/index/middle finger. Screen faces HER. Keep the tablet and left supporting grip steady in all frames. No giant prop, text, logos, printed UI, floating stroke effects, sparkles or extra fingers.

LAYOUT: output1122x1402 genuine transparent RGBA PNG, four complete sprites in a TWO BY TWO grid, eachcell561x701. Reading order0top-left,1top-right,2bottom-left,3bottom-right. Clear at least32px transparent margins around every complete head/arm/prop/shoe. Each character ground pivot is cell-local x280,y660, head top abouty50, with identical original body/head scale. All feet fully visible. Do not cross a cell boundary. Background alpha=0, not white, black, grey or checkerboard. No floor, shadows, glows, captions, dividers or furniture.

FRAME0 TOP LEFT — OBSERVE: quietly studies the sketch with eyes focused downward, stylus hovering above the upper-left part of her screen, elbow relaxed; slight thoughtful neutral smile.
FRAME1 TOP RIGHT — DRAW LINE: stylus TIP CONTACTS the screen after traveling laterally about one HAND-WIDTH across its upper/central area toward her right. Her drawing forearm opens and wrist extends visibly. Eyes follow the pen. This must be a clearly new hand/elbow pose, not a tiny duplicate or a tap.
FRAME2 BOTTOM LEFT — REFINE: pen remains in contact lower on the sketch, wrist bends inward to draw a short small complementary stroke; elbow comes in slightly; head nods down only2-3degrees. Clearly distinguish this short lower correction from frame1's extended upper stroke.
FRAME3 BOTTOM RIGHT — CHECK/RECOVER: lifts the stylus one pen-tip length off the screen, brings the right hand gently back toward frame0's initial position, eyes assess the drawing and head returns; an ordinary relaxed loop back to frame0.
The four drawings must communicate drawing rhythm while the lower body stays planted. Do not reuse one body sprite with only a moved prop; draw natural arm and sleeve folds for the actual four hand positions.
DIRECTION: all four face image-LEFT, matching image1's three-quarter left profile. Do not turn toward front or back. Tablet projects toward image-left, tilted toward her. Her left hand supports the bottom/edge while right drawing hand is visible over the upper edge; show a natural lateral forearm movement, lower correction and recovery without swapping hands. Heart clip remains on original reference side.
CRITICAL camera: strict nearly SIDE-ON LEFT profile matching image1. Near eye visible, far eye hidden by nose/bangs. Do not turn to a front/left diagonal to show both eyes. The drawing-state reference is for prop only, not camera.
```

### up

```text
Use the two references of the SAME PINK-HAIRED GIRL to draw a new production game action animation. Image1 defines the exact requested direction and original full-body identity. Image2 is her existing drawing pose and defines her drawing tablet and stylus. Preserve her salmon-pink bob with bangs and heart-shaped hairclip, pink-brown eyes, cream button cardigan with balloon sleeves, charcoal collared blouse, dark pleated skirt, bare lower legs and brown loafers, and her exact cute head-to-body proportions. Refined soft painted anime/chibi linework and shading, no redesign. She is the original girl, not a recolored boy. No silver character or silver animation reference is used.

Create FOUR distinct consecutive drawings of her standing and DRAWING a small sketch on her tablet. This is a real artist's drawing action: an observed composition, a deliberate lateral pen stroke, a smaller correcting stroke, then lifting the pen to assess it. It must not look like repeatedly tapping/reading, typing, waving, walking, dancing or cycling legs. Her pelvis, knees, skirt and both planted shoes remain still in all four frames. Only the drawing elbow, forearm, wrist, fingers, eyes and a tiny head nod change. Torso stays calm and upright. Keep the same silhouette scale; no stretching, shrinking or leaning from the waist.

Use the same small thin charcoal-black drawing tablet and dark stylus as image2. Her LEFT hand supports the tablet at lower-chest/upper-waist level. It is a compact landscape tablet tilted toward her face, about the width of her torso. Her RIGHT hand grips the stylus naturally with thumb/index/middle finger. Screen faces HER. Keep the tablet and left supporting grip steady in all frames. No giant prop, text, logos, printed UI, floating stroke effects, sparkles or extra fingers.

LAYOUT: output1122x1402 genuine transparent RGBA PNG, four complete sprites in a TWO BY TWO grid, eachcell561x701. Reading order0top-left,1top-right,2bottom-left,3bottom-right. Clear at least32px transparent margins around every complete head/arm/prop/shoe. Each character ground pivot is cell-local x280,y660, head top abouty50, with identical original body/head scale. All feet fully visible. Do not cross a cell boundary. Background alpha=0, not white, black, grey or checkerboard. No floor, shadows, glows, captions, dividers or furniture.

FRAME0 TOP LEFT — OBSERVE: quietly studies the sketch with eyes focused downward, stylus hovering above the upper-left part of her screen, elbow relaxed; slight thoughtful neutral smile.
FRAME1 TOP RIGHT — DRAW LINE: stylus TIP CONTACTS the screen after traveling laterally about one HAND-WIDTH across its upper/central area toward her right. Her drawing forearm opens and wrist extends visibly. Eyes follow the pen. This must be a clearly new hand/elbow pose, not a tiny duplicate or a tap.
FRAME2 BOTTOM LEFT — REFINE: pen remains in contact lower on the sketch, wrist bends inward to draw a short small complementary stroke; elbow comes in slightly; head nods down only2-3degrees. Clearly distinguish this short lower correction from frame1's extended upper stroke.
FRAME3 BOTTOM RIGHT — CHECK/RECOVER: lifts the stylus one pen-tip length off the screen, brings the right hand gently back toward frame0's initial position, eyes assess the drawing and head returns; an ordinary relaxed loop back to frame0.
The four drawings must communicate drawing rhythm while the lower body stays planted. Do not reuse one body sprite with only a moved prop; draw natural arm and sleeve folds for the actual four hand positions.
DIRECTION: all four are the STRICT BACK/up view from image1. No face, no turned head looking back. The tablet is held in FRONT of her torso, so most of it is naturally hidden by her body; a small top/side edge may peek beside the cardigan. The RIGHT drawing elbow/forearm is visible on viewer-right: relaxed/hover inframe0, opened outward for the long drawing stroke inframe1, returns inward and slightly down for correction inframe2, pen lifted/recovery inframe3. The back of the head nods a little and returns; the bob and heart clip preserve the back-view design. Never put the tablet behind her back, never turn her to expose the tablet.
```

## Source behavior and acceptance

Pink actions.draw selects one current-direction sheet through the existing scene-local residency. The original static draw image remains a loading/failure fallback. An unexpected full source size is never reinterpreted as a different grid: the renderer holds the static fallback. Per-frame shoe origins preserve the authority floor coordinate, with a single display scale per direction and aspect ratio preserved. Local activity time drives a 2.4 second loop; reduced motion selects frame 0. The existing studio-artist-0 anchor already declares draw and now uses the real action automatically; no world, acoustic, seat or human authority geometry was edited.

Appearance capabilities are deduplicated because pink has both static and animated draw. The current registry revision is drawn-characters-v1-actions-2; silver review remains available and all other capabilities remain as before. No tool/media/AI action is triggered by animation.

Focused source/adjacent tests: 7 files, 87 tests passed. Art suite: 19 tests passed, comprising all 32 sheets/128 frames while preserving the original 24/96 plus silver 4/16 and adding pink 4/16. Scoped ESLint passed. Full integrated build and typecheck are performed by the parent task, not repeated in this art task.

Canvas runtime PASS: 4 directions x 4 frames, fixed measured foot origins/floor, one current action sheet, exit walk then directional idle, 12 reduced-motion frame 0 samples, 8 mounts/restarts with no prior action sheets and final 0 canvases/page errors. Exact probe and report/video/screenshots: /tmp/virtual-studio-action-art-pink/verify-runtime.mjs and runtime-canvas/.

WebGL runtime PASS with the same 4-direction/16-frame, floor/origin, lazy-sheet, exit/idle, reduced-motion and 8-restart assertions, actual WebGL context verified and 0 page errors. Evidence: /tmp/virtual-studio-action-art-pink/runtime-webgl/report.json, npc-draw.webm and all 16 frame screenshots. Headless Chromium allowed SwiftShader; hardware throughput is not measured. This is renderer correctness acceptance, not a native GPU/FPS/20-minute memory benchmark. The fixture uses the real product Phaser component and NPC director with a reviewed floor activity; human seats are omitted there, so it does not replace shared-seat/media authority tests.
