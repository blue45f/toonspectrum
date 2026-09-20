# Virtual Studio drawn character provenance · 2026-09-20

Status: current selected art plus explicit remaining work. This is not evidence that the entire visual roadmap is complete.

Built-in `imagegen` generated these new poses from the existing authored character references. No CLI/API fallback, provider switch, image warp, resize, mask, palette conversion or lossy recompression was used. Selected RGBA PNG bytes are copied unchanged; original `production-v2` files remain intact. `drawn-characters-v1/art-manifest.json` records exact SHA-256, dimensions and frame metadata. Generation source names refer to the tool's default `$CODEX_HOME/generated_images/01a0bb3f-0968-7303-bc77-c66fc680d664/` directory.

The walking sheets contain four generated key poses per direction, played from actual traveled distance, with per-frame origins and uniform scale preserving cell aspect ratio. They are not eight hand-drawn in-between frames or a 3D skeleton. Held `wave` and `sit` directional poses contain one drawing per direction, not multi-frame action loops. Existing idle/draw/review/talk artwork is retained. Character identity was visually compared with original references; generated output does not preserve original source pixels except the unchanged files themselves.

Pink/right was inspected in an actual Phaser Canvas loop at140 worldpx/s and84px/gait cycle, native actorheight131px and2x comparison, including30 frame changes over4.3s. Measured attachment ground stayed at270px. Local evidence: `/tmp/virtual-studio-walk-preview/pink-right-loop.webm`, `preview.png`, `frames.json`. This does not establish WebGL/20minute/multi-device acceptance. Initial eight-pose right candidate was rejected for opaque background and repeated support leg; the initial high-knee candidate was rejected for marching. Early front-view repeats were corrected using the accepted back-view gait as structural reference. Left-view alternating occlusion is less legible than back/front views and requires final in-world review.

Sitting requires an authoritative granted slot plus an independently verified visual seat attachment. A pose registry entry does not prove chair collision, correct foreground occlusion, or slot/permission correctness. Canvas keeps physics at the approach point; only the rendered hips attach to the provided visual seat point, after the sit texture is ready. Movement interrupts the pose. The page owns admission/lease/attachment validity. Wave visuals never activate media or AI.

All four registered skins now have four directional walk sheets and directional held sit/wave sheets (24 PNGs, 96 drawings). The original idle/work images remain. A generic world-space polygon mask repeats the exact clean-plate background with the same cover transform; it occludes seated feet behind the authored sofa edge without repainting source pixels. Full idle/action animation beyond held poses and additional furniture masks remain separate art requirements. Final runtime evidence is recorded below after inspection.

## Exact selected prompts

### pink/walk-right

References: production-v2/player-pink-direction-right.png.

```text
Edit the reference character into a small production game animation contact sheet. Preserve the exact salmon-haired girl's face, haircut, cream cardigan, charcoal shirt and skirt, brown shoes, painterly anime linework and original proportions. True transparent background, no ground, no glow, no checkerboard, no captions.
Output exactly FOUR full-body sprites in an evenly spaced TWO BY TWO grid. All face three-quarter RIGHT as in reference, camera and head scale identical. Each cell is 512x640, whole PNG 1024x1280. The feet baseline is y=605 within each cell, head top y=60. This four-pose cycle must show TWO different supporting legs.
TOP LEFT: ordinary small walking contact pose, near-camera leg extends diagonally forward to the right with heel on floor; far leg extends diagonally backward to the left with toe on floor. Far arm slightly forward, near arm slightly back.
TOP RIGHT: narrow passing pose, both knees close together, far-camera leg sweeps past the planted near leg, foot lifted only a shoe-height. No high knee.
BOTTOM LEFT: genuinely opposite contact pose: near-camera THIGH slopes BACK toward image-left and its knee is behind the torso; far-camera THIGH slopes FORWARD toward image-right and foot heel lands forward. The near leg clearly overlaps in front of the far leg from the viewer's camera. Near arm forward and far arm back. Do not repeat the top-left legs.
BOTTOM RIGHT: narrow opposite passing pose: the near leg sweeps past the planted far leg, foot only a shoe-height above the floor.
Keep a calm neutral face and stable upright torso. Ordinary quiet walk, no marching, no running. All four complete from hair to toes, consistent transparent margins.
```

### pink/walk-up

References: production-v2/player-pink-direction-up.png.

```text
Edit the reference into a genuine WALK-UP animation sheet of the SAME girl, seen strictly from behind, moving away from the camera. Keep the reference salmon bob, hairclip, cream cardigan, dark pleated skirt and brown shoes with exactly the same identity and fine painted rendering.
Four transparent-background full-body sprites, clean RGBA, no floor/shadow/text, in two equal columns and two equal rows. Output1024x1280. Each cell512x640. Stable character scale, head centerx256, feetbaseliney605, top ofheady60. Entire figures comfortably fit inside cells.
The key requirement is visibly ALTERNATING left and right steps:
TOP LEFT: weight on screen-LEFT leg, its shoe sole on floor. Screen-RIGHT leg trails toward viewer; bend its knee slightly so the brown sole faces viewer. Left arm goes back and right arm forward gently.
TOP RIGHT: screen-RIGHT foot passes close to the planted LEFT ankle, shoe only slightly above ground.
BOTTOM LEFT: weight on screen-RIGHT leg, its shoe sole on floor. Screen-LEFT leg trails toward viewer; bend its knee slightly so its brown sole faces viewer. Right arm goes back and left arm forward gently. This must visibly be the opposite leg from top-left.
BOTTOM RIGHT: screen-LEFT foot passes close to planted RIGHT ankle, slightly above ground.
Quiet short strides, no high knees or exaggerated running. Back view only, no turned head or visible face. Genuine new drawings of four poses with correct alternating leg occlusion.
```

### pink/walk-down

References: production-v2/player-pink-direction-down.png; accepted pink/walk-up poses.

```text
Use image1 as exact identity/front-view design. Use image2 as the animation STRUCTURE reference: four distinct poses with alternating supporting legs and two narrow passing phases. Convert that cycle into the FRONT VIEW of image1, walking toward the camera. Preserve salmon bob and heart clip, cream cardigan, dark collared blouse/skirt, brown shoes and painted style. No redesign.
Output four full-body sprites in a TWO BY TWO equal grid, same scale and headposition percell, 1024x1280, transparent RGBA with no floor, shadow, text or labels. Top-left left support, top-right passing, bottom-left RIGHT support (opposite from top-left), bottom-right opposite passing. Read the legs in image2: frame0 lifts one foot while frame2 lifts the other. Reproduce that alternation front-facing. Passing phases keep both thighs close together and the raised shoe low beside the planted ankle. Quiet ordinary walking, low knees. Front camera throughout, no back views. The four poses must read as a loop rather than repeating one forward leg.
```

### pink/walk-left

References: production-v2/player-pink-direction-left.png; exec-454791f7-6467-4fc9-b124-bdd511540a3f.png first candidate.

```text
Edit this four-cell transparent game sprite sheet. Preserve the character identity, face, hair, outfit, scale, layout and genuine transparency. All four remain LEFT-facing.
Change only the LOWER RIGHT pose into the OPPOSITE passing step from the upper right. Upper right has the image-left/front foot planted and the right/back shoe lifted behind. In LOWER RIGHT do the opposite: the image-RIGHT/back foot is planted flat under the hip supporting the body, while the image-LEFT/front foot is slightly raised and crossing in front of its ankle, toes only one shoe-height from the ground. Knees low. The passing leg must be visibly the other leg, not a duplicate. Keep lower-right arms as already drawn.
Do not alter the other three cells. No shadows, floor, captions or new background.
```

### pink/wave

References: production-v2/player-pink-direction-down/right/up.png.

```text
Create four directional full-body WAVE gesture sprites of this exact character for a game. The three references are the same salmon-haired girl: front, right, back. Preserve exact hair and heart clip, face, cream cardigan, charcoal blouse and pleated skirt, brown loafers and fine painted anime rendering. No redesign.
One genuinely transparent RGBA image, two by two equal cells, 1024x1280. Eachcell512x640, whole character centered, all shoes visible, standing on baseline605, headtop60. Same scale as reference in everycell.
Top-left: front-facing girl, gentle smile, one arm raised beside head, OPEN hand waving hello with five natural fingers, other hand relaxed.
Top-right: right-facing three-quarter view of same raised-open-hand wave.
Bottom-left: left-facing three-quarter view of same wave.
Bottom-right: rear view of same wave with raised palm visible beside head from behind.
Feet stand naturally side by side as reference. Keep whole raised hand inside its cell with margin. No text, shadow, floor, glow, furniture or background. Friendly restrained greeting, no flailing, no huge hands.
```

### pink/sit

References: production-v2/player-pink-direction-down/right/up.png.

```text
Use case: identity-preserve.
Create a transparent production sprite model sheet from the referenced girl. Reference1 front, reference2 right, reference3 back are the SAME character. Preserve exact salmon bob, heart clip, cream cardigan, charcoal collared shirt and pleated skirt, brown loafers, cute proportions and high-quality painted anime linework.
Four complete SEATED poses, in a 2 by 2 grid, output 1024x1280 RGBA PNG with genuinely transparent background. Each cell is512x640; same scale in every cell, complete from hair to shoes, ample margin. No text, chair, furniture, floor, shadow or props.
She is calmly sitting on an INVISIBLE ordinary chair with hips supported, thighs nearly horizontal, knees bent roughly90 degrees, feet pointing down to the floor, hands relaxed on thighs, a warm neutral expression. Feet remain below knees. Clothes and skirt must cover naturally with no upskirt view.
TOP LEFT front-facing seated.
TOP RIGHT right-facing three-quarter seated, matching reference2 camera.
BOTTOM LEFT left-facing three-quarter seated.
BOTTOM RIGHT rear-facing seated, matching reference3 camera.
All images depict one consistent seated pose in different directions, preserving head size, clothing and character identity. Do not draw standing or squatting. Do not add a seat or chair: this sprite must overlay a real chair in a game.
```


### silver/walk-right

Selected source: `exec-ea8a6f4a-ef91-41c7-a21d-1371dec37586.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 is the exact silver-haired BOY identity: silver fluffy hair and blue ear studs, blue-grey eyes, navy jacket, white tee, charcoal trousers and white sneakers. Image2 is ONLY an animation pose/layout reference, not the character. Draw the BOY from image1 in those four right-facing quiet walk poses. Preserve boy face/outfit/proportions/painted style, never pink hair or skirt. Two by two equal cells, transparent RGBA, 1024x1280, fullbody ineachcell, identicalscale/headcenter. Sequence contact-near leg forward, narrow passing, opposite contact-far leg forward, opposite passing. Read the reference's two different crossing feet and opposite arms; preserve genuine support-leg alternation in the BOY. Knees low, foot lift aboutone shoe, quiet ordinarywalk notrunning/marching. No ground/shadow/text/captions.
```

### silver/walk-up

Selected source: `exec-ad40ad18-2b59-4657-b042-6e915f4581b0.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 is the exact silver-haired BOY back-view identity in navy jacket, charcoal trousers, white sneakers and blue ear studs. Image2 is ONLY a four-frame walking structure/layout reference. Draw the BOY seen strictly from behind in those same four UP walking phases with alternating left/right supporting legs. Preserve his fluffy silver hair, outfit, proportions, paintedstyle. Do not include the girl or skirt. Top-left right shoe lifts back/left supports; top-right narrow passing; bottom-left left shoe lifts back/right supports; bottom-right opposite passing. Fullbody fourframes2by2 equalgrid, genuine transparent RGBA,1024x1280, constantscale/headcenter, allshoesinsidecell, quietshortwalkingstep, lowknees. No ground/shadow/text/captions.
```

### silver/walk-down

Selected source: `exec-f1b7c2d4-c5c8-45a0-ba58-9c0eadf33b77.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 is the exact silver-haired BOY FRONT identity in navy jacket, white tee, grey trousers, white sneakers and blue ear studs. Image2 is ONLY the four-pose front-walk STRUCTURE reference. Draw the BOY in those four poses preserving his face/hair/outfit and fine painted anime rendering. Do not draw girl/skirt. Actual alternating support leg as template: top-left right shoe lifted/left supports; top-right narrow passing; bottom-left left shoe lifted/right supports; bottom-right opposite passing. Samebody/headscale, front-facing throughout. Four complete fullbody sprites,2by2equalcells,1024x1280, genuine transparent RGBA, no floor/shadow/text. Quietshortwalk, lowknees, natural opposite arm swings, allshoesinsidecells.
```

### silver/walk-left

Selected source: `exec-2232a423-85cf-48c4-b2fa-08f1ab529e56.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 is the exact silver-haired BOY LEFT-view identity, silverhair blue ear studs, navyjacket whiteteeshirt greytrousers whitesneakers. Image2 is ONLY an animation pose/layout guide. Draw the BOY LEFT-facing in four quiet walk phases with contact, passing, opposite contact and opposite passing. Preserve boy identity, clothing/proportions and fine paintedanime style, no girl/skirt. Real alternating support leg: frame0 near foot forward/heel, frame2 far foot forward/heel. Frames1and3 have DIFFERENT leg crossing and opposite planted leg. Lowshoe-height footlift, natural opposite arms, no marching/running. Fourfullbody sprites two bytwoequalcells 1024x1280 transparentRGBA nofloor/shadow/text, constantscale/headcenter/allshoeswithinmargins.
```

### silver/wave

Selected source: `exec-3b4a0725-441d-43b2-bac1-e55de7ebb37f.png`. Previous sheet crossed the horizontal cell seam and was rejected. Exact correction prompt:

```text
Preserve this exact silver-haired boy and his four wave poses, all face/hair/outfit/hand design and genuine transparency. Fix ONLY layout spacing: the entire image is a precise2by2 equalgrid. EACH complete character including hairtips and shoes must fit FULLY inside its quadrant with generous transparent margins at least40pixels allfour sides ofeachcell. The TOP of bottomrow hair must lie BELOW the horizontal image halfwayline by40pixels, never cross the center seam. Toprow shoes must lie ABOVE halfwayline by40pixels. Keep equalhead/body scale acrossfourposes; naturally decrease allfour figures uniformly a little to provide margins. Still readingorder front/right/left/back, fullbodywave. Output1024x1280 genuine transparentRGBA nofloor shadow text or gridlines. No redesign.
```

### silver/sit

Selected source: `exec-d00c7809-851c-43ff-8948-7ef89976840d.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Images1,2,3 are the SAME silver-haired BOY identity front/right/back: fluffy silverhair, blue-grey eyes, blue ear studs, navyjacket over white tee, darkgrey trousers and white sneakers. Image4 is ONLY a seated pose/layout reference. Draw BOY in the four SEATED directions from template, preserving his exact face/hair/outfit/style, no girl/skirt. One calm seated pose: hips supported by invisiblechair, thighs nearhorizontal, knees90degrees, feetbelowknees, handsreston thighs. Do not draw furniture. Fourfullbody sprites2by2: front/right/left/back in readingorder. GenuinelytransparentRGBA1024x1280, stableheadscale inallcells, completeshoeswithinmargins, nofloor/shadows/text. Friendlynatural restrainedexpression, refinedpaintedanime linework asoriginal.
```

### dark/walk-right

Selected source: `exec-736c0479-9a64-4c4b-9ef7-9c6da85e921d.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Correct this transparent four-frame right-walking BOY sheet. Keep all faces/hair/headsets/outfitdesign/scale/grid and transparency. The BOTTOM ROW wrongly repeats top-row arm positions. Change ONLY the near-camera arm in BOTTOM LEFT so the elbow bends and its hand swings FORWARD toward image-RIGHT in front of the waist, as the opposite of the top-left arm that hangs backwards. The brown sleeve must clearly cross in front of the black hoodie in BOTTOM LEFT. Change BOTTOM RIGHT near arm to swing behind the body towardimageLEFT, opposite oftop-right neararmforward. Preserve far-arm natural counter-swing and alllegposes. No new background/text/shadows. Actual opposite arm phases overtheloop, not four identical torsos.
```

### dark/walk-up

Selected source: `exec-5712758d-0644-43dc-bdfa-3fa1d666a5d7.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 exactdarkbrownhairedBOY backidentity: tousledbrownhair, brownjacket overblackhoodie, darktrousers andgreysneakers, smallblackheadset. Image2 ONLY fourframebackwalkingpose/layoutreference. Draw theBROWNhairedBOY walkingUP/away inthosefourphases: top-left onefoot liftsback/other supports, top-right passing, bottom-left OPPOSITEfoot lifts/other supports, bottom-right oppositepassing. Preserve originaloutfit/proportions/refinedpaintedanime rendering, never silverhair/navyjacket. Strictbackview withnoface, naturaloppositearms, quietshortstride/lowknees. Fourcompletefullbody sprites2by2equalcells1024x1280 true transparentRGBA, constantscale/headposition/allshoesinsidemargins. No floor/shadow/text/captions.
```

### dark/walk-down

Selected source: `exec-c6824643-3e04-4be9-8c65-b14091341170.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 is exact dark brown-haired BOY identity/frontdesign: tousleddarkbrownhair, amber eyes, black headset with short mic, brown jacket over black hoodie, dark trousers and grey sneakers. Image2 is ONLY a four-pose walking STRUCTURE reference. Draw the brown-haired BOY fromimage1 in those DOWN/frontwalking phases. Preserve everyidentity/outfitdetail, cuteproportions/refinedpaintedanime style, no silverhair/navyjacket. Alternate support leg exactly as template: topleft rightshoelifted/leftsupports, topright narrowpassing, bottomleft leftshoelifted/rightsupports, bottomright oppositepassing. Natural oppositearms, lowknees quietshortwalk. Fourfullbody2by2equalcells1024x1280, transparentRGBA, constantscale/headcenters, completeshoesincells. No floor/shadow/text/captions.
```

### dark/walk-left

Selected source: `exec-0463fe0f-ebc4-4c0b-9851-4f8b3fde2d62.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Correct ONLY the legs in the RIGHT COLUMN (top-right and bottom-right) of this four-cell LEFT-facing walk sheet. They incorrectly show wide contact poses. Change both into NARROW PASSING poses: both thighs nearly vertical under hips, knees close, ankles almost touching, feet within the width of the torso. TOP RIGHT: the near foot planted flat underhip, far shoe raised one shoe-height behind thatankle. BOTTOM RIGHT: far foot planted underhip, near shoe raised one shoe-height crossing IN FRONT of thatankle. DIFFERENT leg crossing/support foot. No wide strides in rightcolumn. Keep LEFT COLUMN fullstrideposes and allfaces/hair/headsets/body/armposes/clothes/scale/grid unchanged. True transparentbackground, no floor/shadow/text. The four-frame sequence is wide,narrow,wide,narrow.
```

### dark/sit

Selected source: `exec-db804ccb-949c-48c4-95dd-c2bd7dc45796.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Images 1–3 show the exact same brown-haired boy from front, right and back: tousled brown hair, amber eyes, black headset and mic, brown jacket over black hoodie, dark trousers and grey sneakers. Image4 is only a seated pose/layout reference. Draw the brown-haired boy seated in four directions (front, right, left, back), preserving his exact identity, outfit, proportions and refined painted anime linework. One calm seated pose, hips supported on an invisible chair, thighs almost horizontal, knees90degrees, feet below knees, hands relaxed on thighs. No chair or other furniture. Four full-body sprites in2by2 equalcells,1024x1280 genuine transparentRGBA, identical headscale, allshoes within clear margins. No floor, shadow, captions or text. Do not draw the silver-haired reference character.
```

### dark/wave

Selected source: `exec-5303807a-8908-4735-adb2-34fa8b6c5d82.png`. Previous sheet crossed the horizontal cell seam and was rejected. Exact correction prompt:

```text
Images1,2,3 exact DARK BROWN HAIRED BOY identity front/right/back: blackheadset withmicrophone, brownjacket blackhoodie darkgreytrousers greysneakers. Image4 ONLY gives the four wave poses and generous spacing. Draw DARK BOY in image4's fourwaveposes, exact facehairoutfit from1-3, no silverhair orbluejacket. Four completefullbody sprites2by2equalquadrants, readingorderfront/right/left/back. One handraised nexttohead withopenpalm, otherarm relaxed. Generous40pixelminimum transparentmargin ineachcell: hair never crosses horizontalcenterseam, allshoes contained. Use SAME headbodyscale inallcells. GENUINE CLEAN TRANSPARENT RGBA1024x1280. Absolutely NO drop shadows, NO glows, NO grey or colored halos, NO ground, NO borders, NO backdrop ofanykind. Only clean character pixels with crisp antialiased silhouette edges; transparent outside. Refinedpaintedanime style matchesoriginal, friendly quiet wave.
```

### purple/walk-down

Selected source: `exec-6b0ec00b-3c3f-4352-bbda-f8eebfa717f6.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 is the exact PURPLE-HAIRED GIRL FRONT identity: long wavy deep-purple hair with side braid and yellow star clip, purple eyes, lavender cardigan over cream top, plum SHORTS and burgundy lace-up ankle boots. Image2 is ONLY the four-pose front-walk STRUCTURE reference. Draw the purple girl in those four poses preserving her exact face, long hair, shorts, boots and fine painted anime style. Do not copy pink hair or skirt. Actual alternating support legs: top-left right boot lifted/left supports; top-right narrow passing; bottom-left left boot lifted/right supports; bottom-right opposite passing. Same body/head scale, front-facing throughout. Four complete fullbody sprites, 2 by 2 equal cells, 1024x1280, genuine transparent RGBA, no floor, shadow, text. Quiet short walk, low knees, natural opposite arm swings, all boots and long hair inside each cell.
```

### purple/walk-up

Selected source: `exec-e0e3f9e0-4559-4210-a456-963d09e31f41.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 is the exact PURPLE-HAIRED GIRL BACK identity: long wavy deep-purple hair, lavender cardigan, plum SHORTS and burgundy lace-up ankle boots. Image2 is ONLY the four-pose back-walk STRUCTURE reference. Draw this purple girl in those four poses preserving her exact long hair, shorts, boots and fine painted anime style. No pink hair, no skirt. Genuine back view in every cell, NO face. Actual alternating support legs and opposite arms. Reading order: left leg forward/right trails, narrow passing1, right leg forward/left trails, narrow passing2 with opposite raised ankle. Same head/body scale. Four complete fullbody sprites, 2 by 2 equal cells, 1024x1280, genuine transparent RGBA, no floor/shadow/text. Quiet short walking strides, knees low, complete boots and hair inside each cell. Preserve leg and sleeve pose differences even under her long hair.
```

### purple/walk-right

Selected source: `exec-2a822aa7-d9a0-45c5-97d3-8b1db5b32174.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 is exact PURPLE-HAIRED GIRL RIGHT-facing identity, long wavy purple hair with side braid yellow starclip, lavender cardigan over cream top, plum SHORTS and burgundy lace-up ankle boots. Image2 is ONLY four-pose right-walk STRUCTURE. Draw purple girl in these same four right-facing poses, retain her exact face/hair/outfit rendering, no pink hair/skirt. Reading order four actual gait key poses: near leg forward and near arm back; narrow passing near foot planted/far shoe behind; near leg back and near arm FORWARD; opposite narrow passing near raised boot crossing in front of far planted ankle. Clear alternating arms and feet, low knee lift, natural short walk. Sameheadscale eachcell, right profile inallcells. Four complete fullbody sprites2by2equalcells1024x1280 genuine transparent RGBA. No floor/shadow/text; all long hair and boots contained in each cell.
```

### purple/walk-left

Selected source: `exec-faaf3e87-77ed-4fe1-8f65-78fcf2f8a45d.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Image1 is exact PURPLE-HAIRED GIRL LEFT-facing identity: long wavy deep-purple hair with braid and star clip, lavender cardigan creamtop, plum SHORTS, burgundy lace-up ankleboots. Image2 is ONLY four-pose LEFT-walk STRUCTURE template. Draw purple girl in those four poses, preserve her exact face/hair/outfit/style, no boy, no headset. LEFT profile inallcells. Fourframe readingsequence widecontact, narrowpassing, oppositewidecontact, oppositenarrowpassing. LEFTcolumn wide short stride poses, with visible near arm swinging BACK in top-left and FORWARD in bottom-left. RIGHTcolumn NARROW passing: thighs almostvertical, anklesclose underhips; top-right near boot planted and far raised justbehind, bottom-right far boot planted and near boot raised crossing IN FRONT. Distinct support foot and crossing. Sameheadscale, lowknees natural walking. Four complete sprites2by2equalcells1024x1280. Genuine transparentRGBA, nofloor/shadow/text, fullhair andbootswithinmargins.
```

### purple/sit

Selected source: `exec-a6c29437-d621-48ce-9efa-80093ef2bdf6.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Images1,2,3 are the SAME purple-haired GIRL identity front/right/back: long wavy deep-purple hair with braid yellowstarclip, purpleeyes, lavendercardigan creamtop, plum SHORTS and burgundy lace-up ankleboots. Image4 is ONLY a seated pose/layout reference. Draw PURPLE GIRL in the four SEATED directions from template, preserve her exact face/hair/outfit/style, no pinkhair/skirt. Calm seated pose with hips supported by invisiblechair, thighs nearhorizontal, knees90degrees, feetbelowknees, handsreston thighs. Do NOT draw furniture. Four fullbody sprites2by2: front/right/left/back in readingorder. Genuinely transparentRGBA1024x1280, stableheadscale inallcells, completeboots andhairwithinmargins, nofloor/shadows/text. Friendlynatural restrainedexpression and refinedpaintedanime linework matchingoriginal.
```

### purple/wave

Selected source: `exec-54e30314-76d4-4b88-a97d-cc78181b4708.png`. Authored identity references are recorded per asset in the manifest; additional accepted pose templates are identified in the prompt.

```text
Images1,2,3 are SAME purple-haired GIRL identity front/right/back: longwavy deep-purplehair withsidebraid yellowstarclip, purpleeyes, lavendercardigan creamtop, plum SHORTS andburgundy lace-up ankleboots. Image4 is ONLY four-direction greeting-pose reference. Draw purple girl in a friendly relaxed wave with one open hand raised near head, otherarm relaxed. Preserve her exactface/hair/outfit/style, no pinkhair/skirt. Four FULLBODY sprites 2by2equalcells, directions readingorder FRONT, RIGHT, LEFT, BACK. Right/left faces lookstrictly respective direction, backhead has no face, wavinghandvisible above side ofhair. Natural5fingeropenhands, no props. Genuine transparentRGBA1024x1280, constanthead/body scale, completeboots/hair/handswithinmargins, nofloor/shadows/text. One distinct held wave ineachdirection, refinedpaintedanime rendering.
```

The dark wave intermediate `exec-52267a3b-ee03-4fed-bdcc-fe059eb3ac10.png` was rejected for a colored halo. It is not shipped. Alpha-bound checks rejected the initial silver/dark wave layouts before final selection.

## Final selected-pack verification

`node scripts/verify-virtual-studio-art-manifest.mjs` now includes the drawn pack: 24 original PNG byte hashes/dimensions, 96 freshly decoded RGBA frame hashes, actual transparent margins/alpha bounds, foot/hip metadata, preserved authored-reference hashes, and runtime skin/clip registry bindings. The checked-in PNG pack totals 25,391,923 bytes. Runtime loading is limited to each visible actor's current skin/direction/action with deduplication, retained fallback while pending, lifecycle guards, and unused-texture collection.

Focused character/occlusion/world/slot tests: 79 passing across seven files. Art verifier tests: 16 passing. Generator rerun and actual default-world Tiled import/slot tests: 27 passing. Target ESLint and `git diff --check` pass. These are bounded local checks, not a full repository CI or production deployment claim.

Actual component runtime in Canvas and forced WebGL each displayed all four distance-sampled frames in all 16 skin/direction combinations, all four directional wave sheets, and four back-facing sofa attachments. Each run remounted scenes 12 times with one final canvas and no page errors. Floor position remained (220,737) while the rendered seated hip was (220,664); scene teardown removed the prior actor/overlay. The default sofa mask was visually inspected with both a seated actor behind it and a standing actor in front. Seated names/reactions derive from rendered head position; movement/picking retain the physical approach point. The fixture injects visual seat grants: server ownership is tested by the separate slot/lease integration, not proved by this art harness.

Local evidence: `/tmp/virtual-studio-walk-preview/all-skins-canvas.json`, `all-skins-canvas.webm`, `all-skins-webgl.json`, `contact-{pink,silver,dark,purple}.png`, `{canvas,webgl}-{skin}-sofa.png`, and `webgl-foreground-walker.png`. The WebGL run used headless Chromium SwiftShader without video recording; this is functional rendering evidence, not a hardware performance benchmark. An earlier short cold-load route and a simultaneous software-WebGL video recording did not sample all four frames before arrival; final art runs use longer routes, and the WebGL run omits costly video readback. Source art and product loading behavior were not weakened for those inspection fixtures.

The static contact sheets use the same source cells and runtime geometry and were inspected at game-scale. All four skins have readable front/back leg alternation and restrained side passing/arm changes. These remain four-key-pose cycles, so side-view leg occlusion is subtler and less fluid than a full in-between animation set. Wave/sit are held poses; retained original idle/work art and the single authored sofa mask do not establish completion of every future idle animation or furniture layer.
