# ToonStudio × SHAPER quality-gap audit — 2026-09-03

## Scope and evidence

This audit compares SHAPER's publicly documented creator workflow with ToonStudio's shipped VRM
builder. It does not use SHAPER source code, private assets, reverse engineering, or copied UI.

SHAPER publicly presents fourteen combinable preset categories: face shape, eyes, irises, nose,
mouth, ears, hair, body, tops, bottoms, shoes, accessories, pose, and hand pose. It also presents
direct model drawing, reference-image preset recommendations, photo/camera pose recognition,
transparent background, and component-layered PSD export.

## Why the previous result felt low quality

The feature inventory was not the main problem. ToonStudio already had a broad engine surface, but
its creator-facing representation was weaker:

1. Presets were represented primarily by emoji and copy instead of a visual prediction of the
   resulting character.
2. Character work was split across two navigation levels (`캐릭터` then `모델/조형/체형·색/의상/표면`),
   while pose and expression lived in separate top-level tabs. The user had to understand the
   implementation architecture before understanding the creative workflow.
3. Avatar Forge exposed five global face controls, fourteen procedural hair silhouettes, six bang
   styles, proportions, and three face accents. It did not provide independent eye, iris, nose,
   mouth, or ear asset slots.
4. Procedural hair used smooth PBR primitives. The geometry was functional but read as generic 3D
   rather than an authored webtoon asset because it lacked a controlled toon value ramp and a stable
   silhouette shell.
5. AI recommendations exposed raw cosine values and emoji cards. This was useful for debugging but
   weak for visual decision-making.
6. Photo pose review drew a skeleton on an abstract dark field, separating the detected joints from
   the source photograph the artist needed to judge.
7. The 360 px inspector forced thumbnail cards, precise numeric controls, explanations, and action
   buttons into the same narrow column.

## Implemented in this change

### Visual-first selection

- Deterministic SVG preview renderer for face shape, body proportions, fourteen hair silhouettes,
  six bang styles, gradients, and face accents.
- Two-column visual style shelf with search and genre filters.
- Visual face-shape, body-ratio, hair-style, bang-style, character-variant, AI recommendation, and
  generation-result cards.
- Current-character hero preview with a plain-language summary and changed-control count.

### Precision without clutter

- Shared sculpt control with range input, exact numeric input, increment/decrement, formatted units,
  and one-click per-control reset.
- Fast/precision mode. Advanced hair controls stay out of the first viewport until requested.
- Eight curated two-colour hair palettes and root/tip swap.
- Six safe face-shape recipes built only from the existing rig-preserving face authority.

### Creator-facing AI and pose review

- AI results now show the predicted character recipe and descriptive chips; raw model metadata is
  moved under a disclosure.
- Photo pose landmarks are drawn over the source image.
- The artist can apply full body, upper body, or arms/hands only, preserving the rest of the current
  pose.

### Render presentation

- Procedural hair keeps the canonical geometry and gradient vertices but uses toon shading plus a
  restrained back-face silhouette shell.
- The desktop inspector grows to 420–460 px and the overall dialog to 1480 px, while mobile layout
  remains stacked.

## Remaining quality gap — do not mislabel as complete parity

The following require a modular authored-asset pipeline rather than more sliders:

- independent eye, iris, nose, mouth, and ear libraries;
- authored hair cards backed by production meshes, LODs, thumbnails, and license metadata;
- tops, bottoms, shoes, and accessories presented in one semantic slot browser;
- hand-pose shelf next to full-body pose cards;
- semantic PSD passes for face, hair front/back, skin, top, bottom, shoes, accessories, line, shadow,
  and ID masks;
- visual regression baselines covering representative body types, skin tones, extreme head ratios,
  every hair/bang combination, and transparent/PSD export.

## Next architecture

Introduce a `CharacterSlotCatalog` whose entries carry a stable id, slot kind, thumbnail, asset or
recipe reference, compatibility predicate, license authority, tags, and semantic export layer. The
UI must consume that catalog rather than hard-coding feature cards. Runtime application remains
provider-specific and fail-closed; unsupported slots are never substituted silently.

The target slot kinds are:

`face-shape`, `eyes`, `irises`, `nose`, `mouth`, `ears`, `hair`, `body`, `top`, `bottom`, `shoes`,
`accessory`, `pose`, and `hand-pose`.

## Acceptance criteria for the next asset phase

- A creator can build a recognisably different character without touching a numeric slider.
- Every card predicts the actual runtime result, not an unrelated decorative image.
- Switching a slot preserves all other slots and creates one undoable command.
- Incompatible assets explain why they are unavailable.
- No automatic replacement occurs when an asset, GPU path, model, or license check fails.
- A saved project reopens with identical slot ids, transforms, materials, pose, paint atlas, and PSD
  layer mapping.
- A 2K representative character stays interactive during orbit and editing, and capture does not
  synchronously read pixels on the pointer hot path.
