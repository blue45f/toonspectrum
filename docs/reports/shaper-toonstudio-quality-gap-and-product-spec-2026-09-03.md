# SHAPER → ToonStudio character workshop quality gap and product specification

Date: 2026-09-03

## 1. Problem statement

The previous implementation closed isolated functional gaps, but it did not close the perceived-quality gap. The product already contains many character, pose, texture, capture, and export capabilities; however, creators judge the product by the confidence of each visible decision. Text/emoji options, coarse whole-head deformation, nested navigation, weak before/after feedback, and low-fidelity procedural hair make the workflow feel like a developer tool rather than a finished authoring product.

The target is not a visual clone. The target is a faster, more inspectable ToonStudio workflow:

> visual recipe → composable slots → precise tuning → pose/reference review → direct surface paint → linked 2D output

## 2. Measured current-state gaps

### 2.1 Result quality

| Gap | Current symptom | Product consequence | Required correction |
|---|---|---|---|
| Hair silhouette | cap/sphere/capsule-like primitives read as blobs or tubes | character identity feels provisional | layered toon clumps, readable bangs, shadow/highlight grouping, outline-safe silhouette |
| Face customization | five whole-head proportion controls | labels imply more control than the runtime can deliver | face-shape recipes now; model-capability-aware eye/nose/mouth morphs as a separate runtime |
| Preset representation | emoji/text cards | user cannot predict the actual model result | consistent rendered/CSS preview cards using the active palette and proportions |
| Material response | one material response across style decisions | hair and skin lose graphic hierarchy | base/shadow/highlight palette, controlled roughness, toon step/rim presets |
| Photo pose review | detached skeleton preview | difficult to judge landmark drift against the source | source image + landmark overlay + confidence/problem regions |

### 2.2 Customization depth

A high-quality character editor must support both composition and precision:

1. **Recipe level:** genre/style, age impression, body proportion, face shape, hair silhouette, palette.
2. **Slot level:** front hair, side locks, back hair, accessory, skin, eyes, clothing.
3. **Precision level:** range plus numeric input, reset, lock, mirror, copy/paste values.
4. **Capability level:** unsupported model semantics are disabled with an explanation; they are never simulated with an unrelated whole-head scale.
5. **Variant level:** one saved character can have named outfit, hair, expression, and body variants without duplicating the source asset.

### 2.3 Information architecture

The previous hierarchy combines outer editor tabs, character subtabs, and inner Avatar Forge tabs. This produces repeated context changes and hides the relationship between a selected recipe and its numeric values.

The target layout is:

```text
Character Workshop
├─ persistent character summary / compare / save variant
├─ visual recipe rail
│  ├─ style
│  ├─ body
│  ├─ face
│  └─ hair
├─ context inspector
│  ├─ recommended controls
│  ├─ precision controls
│  └─ capability notes
└─ reference drawer
   ├─ appearance recommendation
   └─ photo pose review
```

Rules:

- The active character identity and palette remain visible while sections change.
- Search and category filters narrow all visual recipes.
- Preset selection previews first and commits through the normal history path.
- Advanced numeric controls stay collapsed until requested, but their active modifications are summarized.
- Reference-assisted features live in a drawer/workspace, not as unrelated cards inserted after the editor.

## 3. Interaction specification

### 3.1 Character summary

The summary must show style, body/head-unit, face recipe, hair/bangs, base/shadow/highlight colors, and modified-control count. It must provide:

- compare with the state at workshop entry;
- reset current section;
- save named variant;
- copy/paste recipe JSON through a validated schema;
- a clear unsaved-change state.

### 3.2 Visual recipe cards

Every card must have:

- a consistent 4:5 or square preview viewport;
- silhouette, palette, and proportion differences visible without opening the card;
- name, one-line intent, and compatibility badge;
- hover/focus preview without document mutation;
- explicit click/Enter commit;
- selected, previewed, unavailable, and modified states;
- keyboard roving focus and at least 44px touch targets.

Emoji may remain as a secondary semantic label, never as the primary preview.

### 3.3 Precision control

Every continuous control must provide:

- range input;
- locale-safe numeric input;
- unit and meaningful value text;
- default marker;
- per-control reset;
- Shift/Alt keyboard fine adjustment;
- clamped and finite values;
- one history transaction per completed edit, not one per pointer frame.

### 3.4 Photo pose review

The review surface must:

- keep the original image visible;
- overlay joints and bones using confidence-aware presentation;
- identify low-confidence body regions;
- allow whole-body, upper-body, arms, hands, lower-body, and head/neck selection;
- preview selected regions on the model before commit;
- preserve unselected bones and current hand edits;
- cancel stale recognition results when the source, rotation, or mirror setting changes;
- keep all recognition local unless a future provider is explicitly selected.

### 3.5 Hair quality

The procedural hair path must be treated as a toon silhouette generator, not as a substitute for authored production hair assets.

Minimum product quality:

- layered back mass, crown, side locks, and bangs;
- tapered clumps with controlled overlap;
- style-specific silhouette rather than one geometry with parameter changes;
- base/shadow/highlight palette;
- stable outline at normal portrait distances;
- bounded draw calls and deterministic generation;
- no per-frame geometry allocation;
- no topology mutation during capture.

For premium quality, imported authored hair assets must be supported through a slot catalog, license metadata, thumbnail generation, and fit profiles.

## 4. Visual system

- Use one neutral editor chrome so the model and palette carry visual emphasis.
- Use stronger hierarchy between recipe rail, active summary, and precision inspector.
- Avoid dense explanatory paragraphs in the primary path; move long explanations to contextual help.
- Use state labels rather than color alone.
- Keep the 3D viewport large enough to judge face and hair; inspector expansion must not reduce it below a usable portrait size.
- Mobile uses a bottom-sheet inspector and horizontal recipe rail, not a compressed desktop sidebar.
- Reduced-motion mode removes animated preview transitions without removing state feedback.

## 5. Performance budgets

| Operation | Target |
|---|---:|
| recipe hover/focus preview | ≤ 50 ms main-thread work |
| recipe commit UI feedback | ≤ 100 ms |
| slider visual preview | 60 Hz where GPU/scene permits; no React document commit per frame |
| photo overlay interaction | ≤ 16 ms per local UI update |
| workshop reopen from warm cache | ≤ 500 ms |
| additional initial Studio bundle | 0; character workshop remains lazy-loaded |
| generated hair geometry | deterministic, cached by recipe hash |
| texture/geometry disposal | completed when model or recipe is replaced |

All expensive geometry, image analysis, and package work should remain Worker/WASM candidates. The document and UI contract must remain renderer-neutral so WebGPU and WebGL2 can share the same authored state.

## 6. Delivery slices

### Slice A — implemented in the character-workshop branch

- persistent current-character summary;
- visual preset previews;
- preset search/category filtering;
- face-shape recipes;
- coordinated hair palette recipes;
- precision range + number controls;
- photo landmark overlay review;
- partial pose-region apply;
- toon-oriented hair silhouette/material pass;
- focused tests, TypeScript, lint, and production build gates.

### Slice B — topology-aware character quality

- semantic morph capability discovery;
- per-model morph profile registry;
- eye/iris/nose/mouth/ear controls only where supported;
- preview/commit transaction and recovery;
- authored hair asset slots and fit profiles;
- thumbnail and license pipeline.

### Slice C — production authoring flow

- named character variants;
- side-by-side compare and recipe history;
- outfit/hair/expression combinations;
- component-aware PSD export;
- linked 3D scene and 2D layer rerender;
- accessibility and mobile walkthrough browser gates.

## 7. Acceptance criteria

The character workshop is not considered complete because controls exist. It is complete only when:

1. A new user can create a visibly different character without opening advanced controls.
2. A professional user can reproduce exact values and reset any individual decision.
3. Every preset communicates its likely result before commit.
4. Photo pose errors can be identified and partially rejected before model mutation.
5. Hair reads as an intentional toon silhouette at normal working zoom.
6. Unsupported facial semantics are stated honestly.
7. Undo, persistence, capture, and export restore the same result.
8. Desktop, narrow mobile, keyboard, reduced-motion, and in-app Chromium paths remain usable.
9. No feature silently changes provider, brush, model topology, or render backend after admission.
