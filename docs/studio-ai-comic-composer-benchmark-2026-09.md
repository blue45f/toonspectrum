# ToonStudio AI Comic Composer benchmark and implementation notes

Date: 2026-09-09
Scope: `/studio` AI production flow, from episode plan to editable comic cuts and reviewed image candidates.

## Product benchmark

| Product | Production pattern worth adopting | ToonStudio implementation |
| --- | --- | --- |
| Runway Gen-4 References | Named references preserve characters and environments while camera angle and focal point change. Multiple references increase controllability but also introduce variation. | Keep the existing role-based Character / Method / Style reference pack, include the reference pack in a deterministic input fingerprint, and flag prior candidates as needing review after a reference change. |
| Scenario | A single character reference enables rapid iteration; prompt, mask, edit, restyle and image-to-image tools refine outputs. Scenario recommends testing styles in smaller batches before large production runs and offers outpainting/upscaling as later production stages. | Make candidate generation additive rather than destructive, expose 1/2/4 candidates per selected cut, and fail closed above 24 provider requests per action. Retain inpaint/outpaint/upscale as separate capabilities until their real provider contracts exist. |
| Adobe Firefly | Composition references preserve outline/depth, expose adherence strength and return multiple variations for review. | Preserve reference roles separately from the scene prompt and expose an independent candidate-variation strategy instead of blending every control into one opaque prompt field. |
| Midjourney / Niji | Style References and Moodboards separate visual identity from subject content. Draft and production modes make speed/quality intent explicit, while current reference/edit support depends on the selected model version. | Add provider-neutral Draft / Balanced / Final quality recipes and persist the chosen recipe as review metadata. Do not claim model-side seed, style-weight or reference-strength support when the connected OpenAI-compatible endpoint does not expose it. |
| Boords | Script import becomes structured frames and shot metadata; cast and asset libraries provide persistent context. Camera reframes are retained as revisions for comparison and rollback. | Convert the entire episode director plan—not only the first batch prompt—into editable scenario cuts. Preserve all generated alternatives per cut with selected and approved states. |
| LTX Studio | Script, shot list, storyboard, generation and review live in one production flow to avoid tool-switching and handoff loss. | Add a typed cross-surface handoff from episode preflight into the existing scenario editor and reuse ToonStudio’s editable frames, dialogue, references and partial-failure engine. |

## Experience principles

1. **Plan before spending**: show selected cuts, variants and provider-neutral request count before generation. Never invent a currency or duration estimate.
2. **Generate alternatives, not replacements**: a successful retry becomes another candidate. Existing results and approvals remain recoverable.
3. **Approval is explicit**: selecting a candidate changes the working image; approving it records the creator’s reviewed choice.
4. **Inputs are traceable**: prompt, continuity metadata, aspect and reference-pack signature form a deterministic fingerprint. A mismatch is visible as “review required”.
5. **Quality intent is visible**: Draft, Balanced and Final are explicit prompt recipes with truthful descriptions, not undisclosed model aliases.
6. **Diversity is directed**: Subtle, Directorial and Coverage strategies vary expression/gesture, camera/blocking or shot scale in a deterministic candidate order.
7. **Paid work is bounded**: one action can dispatch at most 24 image requests. Oversized batches are rejected before an operation ledger entry or provider request is created.
8. **Partial success remains useful**: cancellation or one failed request must not erase successful candidates, prior reviewed images or provenance.
9. **Results remain editable**: the final handoff uses the existing scenario/canvas model, so frames, images and dialogue remain ordinary editable layers.
10. **No fabricated provenance or controls**: a locally deterministic episode-plan handoff has no text-model provenance. Generated images retain their actual provider/model provenance, and provider-specific seed/strength controls are not invented.

## Implemented architecture

### Episode plan handoff

- `studio-ai-comic-composer-handoff.ts` converts every planned cut into a `ScenarioSceneInput`.
- The handoff carries the episode title, original scene text, continuity anchors, preferred variant count and provider-neutral work units.
- `studio-ai-comic-composer-intent.ts` provides strict-mode-safe, one-shot delivery between the lazy AI popover and the lazy scenario panel.
- The scenario editor imports the full plan directly; it does not issue a second text-generation request.

### Candidate workflow

- `studio-scenario-candidate-workflow.ts` owns deterministic input fingerprints, generation planning, candidate append/select/approve operations and stale detection.
- It now also compiles provider-neutral quality and variation directives, validates the exact paid workload and summarizes missing/failed/review/approved cut readiness.
- `StudioScenarioCandidateDesk.tsx` provides cut selection, status filters, 1/2/4 candidate generation, Draft/Balanced/Final quality profiles, Subtle/Directorial/Coverage variation strategies, exact request-count preflight, comparison and approval.
- Scenario image generation accepts explicit cut indexes, variant count and recipe controls while retaining the prior “generate missing images” default.
- Candidate history is capped while preserving the approved candidate. Every new candidate keeps its actual provider/model provenance plus its quality and variation review metadata.

### Prompt recipe contract

| Control | Deterministic intent |
| --- | --- |
| Draft | Prioritize readable staging, silhouettes, eye-lines and editable speech-balloon space; restrain micro-detail. |
| Balanced | Balance clean line work, face/hand/anatomy stability, silhouettes, wardrobe/prop continuity, focus and cel shading. |
| Final | Ask for publication-candidate line, anatomy, prop, perspective, material, lighting and edge finish; explicitly forbid generated text/logo/watermark. |
| Subtle | Keep camera/blocking and compare expression, gaze, gesture, lighting or secondary background rhythm. |
| Directorial | Compare camera height/lens, blocking/negative space, action timing or focal-light hierarchy. |
| Coverage | Produce ordered wide, medium, emotional close-up and over-shoulder/alternate-shot coverage. |

The recipe text is stored only in the private request/provenance boundary already used by Studio. Public output still exposes only the safe provider/model provenance fields. The recipe does not promise identical pixels because the connected provider may not implement deterministic seeds.

### Reliability and trust boundaries

- Existing mutation tickets, abort controllers, provider routing, role references and provenance ledgers remain authoritative.
- Replacement failures preserve reviewed output and provenance.
- Prompt or continuity changes clear the current working image but retain historical candidates for comparison, marked stale by fingerprint.
- Oversized explicit batches stop before `beginTrackedStudioAiOperation` and before any network call.
- Applying to the canvas uses only the selected working image; approved state remains review metadata in the scenario session.

## Acceptance checks

- Entire episode plan opens as editable cuts.
- Selected eligible cut count × variants equals the exact number of planned image requests.
- Empty prompts are excluded visibly from workload and dispatch.
- Existing image generation without an explicit request still targets only missing cuts.
- Draft/Balanced/Final and Subtle/Directorial/Coverage produce distinct deterministic prompt directives.
- More than 24 requests in one action are disabled in the UI and rejected again in the executor.
- Successful retries append labeled candidates; failed retries do not destroy prior results.
- Candidate selection and approval do not remove alternatives.
- Reference/prompt/continuity changes make mismatched candidates visibly stale.
- Readiness counters and Missing/Failed or Review Required filters select the right cuts.
- Empty/blocked generation states remain disabled and accessible.
- Typecheck, targeted unit/component tests, lint and production build pass.

## Deliberately not claimed

- No model-side seed or exact pixel reproducibility unless the concrete provider contract implements it.
- No universal reference-strength/style-weight slider across heterogeneous OpenAI-compatible endpoints.
- No AI inpainting, outpainting, upscaling, layer separation or background removal until a tested image-edit provider path and non-destructive canvas commit are connected.
- No currency estimate when provider/model pricing cannot be derived from the active connection.

## Source links

- Runway — Creating with Gen-4 Image References: https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References
- Scenario — Single-Image Character Consistency: https://help.scenario.com/articles/5838320337-single-image-character-consistency-ideogram
- Scenario — Expand / outpainting: https://help.scenario.com/articles/4319929528-expand-your-images-with-ai-seamless-outpainting-in-scenario
- Adobe Firefly — Structure reference image: https://helpx.adobe.com/au/firefly/how-to/generative-ai-structure-reference-image.html
- Midjourney — Style Reference: https://docs.midjourney.com/hc/en-us/articles/32180011136653-Style-Reference
- Midjourney — Version / Draft Mode and current reference model notes: https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version
- Boords — AI Storyboard Generator: https://boords.com/ai-storyboard-generator
- Boords — Generating images / camera reframe and revisions: https://assets.boords.com/docs/ai-image-generator
- Boords — Creating storyboards / cast detection: https://assets.boords.com/docs/creating-storyboards
- LTX Studio — Enterprise production workflow: https://website.ltx.studio/studio/enterprise
