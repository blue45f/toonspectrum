# ToonSpectrum 3D benchmark → productization wave — 2026-09-04

## 1. Goal

This wave does not add another isolated demo panel. It turns the existing 3D breadth into a connected webtoon-production workflow:

1. save and reorder real `SceneDocument` shots;
2. review camera continuity before a batch render;
3. reuse the same shot as an AI composition/pose reference without bypassing the existing consent gate;
4. plan manuscript, relighting, selection, AI-control and motion artifacts against one renderer-neutral capture contract;
5. preserve the existing dense editor UI while separating production wiring from presentation.

## 2. Benchmark signals

### Clip Studio Paint

Official Clip Studio documentation exposes camera-based Hand Scanner and Pose Scanner workflows, drawing-figure pose materials, camera/perspective controls and 3D-to-line/tone production. The transferable product lesson is not “add more presets”; it is to keep capture, preview, correction and final application as separate, reversible steps.

- Hand Scanner: https://help.clip-studio.com/en-us/manual_en/660_3d/Hand_scanner.htm
- Pose Scanner: https://help.clip-studio.com/en-us/manual_en/660_3d/Pose_scanner.htm
- Editing a 3D material: https://help.clip-studio.com/en-us/manual_en/660_3d/Editing_a_3D_material.htm

### Spline

Spline’s camera-switch and timeline/state-animation model makes a camera an animatable scene object instead of a static preset. The transferable lesson is deterministic transitions with explicit easing and hold timing, plus a sequence preview before publication.

- Switch Camera: https://docs.spline.design/doc/switch-camera/docz7nSJoLPM
- Timeline Animation: https://docs.spline.design/doc/timeline-animation/docx7d8JXcPR
- State Animation: https://docs.spline.design/doc/state-animation/doczN6dNwBiD

### Reallusion iClone / AccuPOSE

Reallusion combines full-body IK, floor contact, effectors, pose locking, pose mixing and motion trails. The transferable lesson is persistent constraints and diagnostic feedback: artists should see where a pose or camera transition breaks instead of accepting a silent solver result.

- Full Body IK / floor contact: https://manual.reallusion.com/iClone-8/Content/ENU/8.0/50-Animation/Inverse-Kinematics/Full-Body-IK.htm
- Pose Mixer: https://manual.reallusion.com/iclone-8/content/enu/8.0/50-animation/motion-layer/pose-mixer.htm
- Inverse effectors: https://manual.reallusion.com/iclone-8/content/enu/8.0/50-animation/inverse-kinematics/inverse-effectors.htm
- Motion trails: https://manual.reallusion.com/iClone-8/Content/ENU/8.0/50-Animation/Motion-Trail/Motion-Trail.htm

### Adobe Mixamo

Mixamo’s custom-character flow uses a small set of anatomical markers, automatic humanoid rig mapping and a searchable animation library. Its official FAQ also documents important limits: the automatic rigger is humanoid-focused and works best with a clean, centered neutral-pose mesh. The transferable lesson is to validate the asset and report unsupported topology before retargeting rather than producing a low-confidence result.

- Upload and rig custom characters: https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html
- Mixamo FAQ and auto-rig constraints: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html

### Existing ToonSpectrum benchmark corpus

The repository’s prior benchmark already covers ABLER/CartoonTech, Snaptoon, SHAPER, Plask, Tooning, Clip Studio, Spline, Womp, Reallusion, SketchUp, Vectary and Mixamo. This wave concentrates on the remaining product gap: connecting those capabilities to canonical scene state and verifiable outputs rather than adding more disconnected controls.

- `docs/studio-3d-startup-comprehensive-benchmark-2026-09-03.md`
- `docs/studio-3d-webtoon-tool-benchmark-2026-07-19.md`

## 3. Product changes

### 3.1 Continuity-aware shot deck

New domain module:

- `src/domains/creator/bg3d/studio-bg3d-shot-continuity.ts`

It resolves partial shot cameras against the canonical scene camera and reports:

- projection discontinuity;
- 180-degree axis reversal and large view-angle cuts;
- focal-length/FOV jumps;
- camera and target displacement relative to subject distance;
- Dutch-roll discontinuity;
- near-clipping risk;
- effectively duplicated framing.

Every issue has a severity, human-readable explanation and an editorial recommendation. The result is a score, not a hard blocker: intentional jump cuts remain an artist decision.

### 3.2 Exact camera capture and deterministic transition timeline

Extended domain module:

- `src/domains/creator/scene-3d/studio-3d-camera-cinematic-director.ts`

Added:

- exact live-camera bookmarks (`position`, `target`, `FOV`, estimated roll);
- transition duration and shot hold duration;
- vertical-webtoon and cinematic panel-aspect metadata;
- `linear`, `ease-in-out`, `spring-punch` and `whip-pan` easing;
- deterministic camera interpolation;
- deterministic shot-deck playback planning.

The cinematic director UI now supports a local rehearsal deck and a production mode. Production mode delegates capture, apply, reorder and delete to the existing editor commands.

### 3.3 Production runtime bridge

New runtime boundary:

- `src/domains/creator/bg3d/studio-bg3d-pro-suite-runtime-context.tsx`
- `src/domains/creator/bg3d/StudioBg3dViewPanel.tsx` — thin production shell
- `src/domains/creator/bg3d/StudioBg3dViewPanelContent.tsx` — preserved dense presentation
- `src/domains/creator/bg3d/StudioBg3dCinematicDirectorPanel.tsx` — context adapter
- `src/domains/creator/bg3d/StudioBg3dCinematicDirectorPanelContent.tsx` — director presentation
- `src/domains/creator/bg3d/StudioBg3dMultiPassExporterPanel.tsx` — capture-lock adapter
- `src/domains/creator/bg3d/StudioBg3dMultiPassExporterPanelContent.tsx` — exporter presentation

The bridge carries only state and commands already owned by `StudioBg3dViewPanel`:

- canonical base camera;
- saved production shots;
- capture/apply/reorder/remove commands;
- capture, batch-render, restore and physics locks;
- AI reference action, busy state and consent/availability gate.

It does **not** create a parallel store and does not mutate the scene outside the existing command path.

### 3.4 Artifact-v2 multipass planning

Extended domain module:

- `src/domains/creator/scene-3d/studio-3d-webtoon-multipass-exporter.ts`

The plan now covers 11 production roles:

1. line art;
2. flat color;
3. direct shadow;
4. ambient occlusion;
5. highlight;
6. emission;
7. normalized linear depth;
8. view-space octahedral normal;
9. stable object ID;
10. stable material ID;
11. pixel velocity.

Each pass declares its source (`derived-lt` or `artifact-v2`), pixel format, bytes per pixel, blend mode and production role. Presets are organized by task:

- manuscript;
- AI control maps;
- compositing/VFX;
- complete diagnostic set.

The planner separately estimates download size and working memory, clamps dimensions to the capture contract, warns when split rendering is required and recommends interactive versus Worker execution.

## 4. Truthful capability boundary

The following is implemented in this wave:

- continuity analysis and recommendations;
- exact camera bookmark/transition/timeline domain logic;
- production shot command wiring;
- capture/restore/batch/physics lock propagation;
- AI-reference command/availability propagation;
- 11-pass typed planning, presets, format metadata and memory budgeting;
- UI and focused tests for these paths.

The renderer-neutral `artifact-capture-v2` contract already represents depth, normal, object ID, material ID, shadow, AO, emission and velocity. However, the older shot-batch archive pipeline still publishes its established subset. AO, normal, material ID, emission and velocity must pass the existing renderer/browser proof and archive-integrity gates before they are advertised as final downloadable production files. The UI therefore treats this wave as a validated **plan and contract alignment**, not proof that every backend already emits every new pass at final manuscript resolution.

## 5. Verification added

- `studio-bg3d-shot-continuity.test.ts`
- `studio-3d-camera-cinematic-director.test.ts`
- `StudioBg3dCinematicDirectorPanel.test.tsx`
- `studio-3d-webtoon-multipass-exporter.test.ts`
- `StudioBg3dMultiPassExporterPanel.test.tsx`
- `StudioBg3dProSuiteRuntimeBridge.test.tsx`

Coverage includes:

- partial camera override resolution;
- axis, projection and focal discontinuity detection;
- exact live-camera capture;
- bounded easing and deterministic playback timing;
- production callback routing;
- inherited capture locks;
- task presets and pass selection;
- high-resolution memory/split-render warnings.

## 6. Next production gates

1. Bind the five expanded artifact-v2 outputs to the shot-batch artifact pipeline with stable manifests and PSD/ZIP semantics.
2. Add real WebGL2/WebGPU golden captures for normal, material-ID, AO, emission and velocity on primitives, GLB and VRM scenes.
3. Add thumbnail capture and safe-frame overlay to the canonical `StudioBg3dShot` schema after a versioned migration.
4. Add BVH/VRMA clip sampling, humanoid retarget error visualization and additive bone-mask UI on top of the existing retarget diagnostics.
5. Add hand/pose scanner preview → freeze → confirm UX to the existing local MediaPipe path without introducing mandatory paid API calls.
