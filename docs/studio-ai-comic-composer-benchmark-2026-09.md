# ToonStudio AI Comic Composer benchmark and implementation notes

Date: 2026-09-09
Scope: `/studio` AI production flow, from episode plan to editable comic cuts and reviewed image candidates.

## Product benchmark

| Product | Production pattern worth adopting | ToonStudio implementation |
| --- | --- | --- |
| Runway Gen-4 References | Named references preserve characters and environments while camera angle and focal point change. Multiple references increase controllability but also introduce variation. | Keep the existing role-based Character / Method / Style reference pack, include the reference pack in a deterministic input fingerprint, and flag prior candidates as needing review after a reference change. |
| Scenario | A single character reference enables rapid iteration; prompt, mask, edit, restyle and image-to-image tools refine outputs. | Make candidate generation additive rather than destructive so a creator can compare retries, return to an earlier take, and approve only a reviewed result. |
| Boords | Script import becomes structured frames and shot metadata; cast and asset libraries provide persistent context. Camera reframes are retained as revisions for comparison and rollback. | Convert the entire episode director plan—not only the first batch prompt—into editable scenario cuts. Preserve all generated alternatives per cut with selected and approved states. |
| LTX Studio | Script, shot list, storyboard, generation and review live in one production flow to avoid tool-switching and handoff loss. | Add a typed cross-surface handoff from episode preflight into the existing scenario editor and reuse ToonStudio’s editable frames, dialogue, references and partial-failure engine. |

## Experience principles

1. **Plan before spending**: show selected cuts, variants and provider-neutral request count before generation. Never invent a currency or duration estimate.
2. **Generate alternatives, not replacements**: a successful retry becomes another candidate. Existing results and approvals remain recoverable.
3. **Approval is explicit**: selecting a candidate changes the working image; approving it records the creator’s reviewed choice.
4. **Inputs are traceable**: prompt, continuity metadata, aspect and reference-pack signature form a deterministic fingerprint. A mismatch is visible as “review required”.
5. **Partial success remains useful**: cancellation or one failed request must not erase successful candidates, prior reviewed images or provenance.
6. **Results remain editable**: the final handoff uses the existing scenario/canvas model, so frames, images and dialogue remain ordinary editable layers.
7. **No fabricated provenance**: a locally deterministic episode-plan handoff has no text-model provenance. Generated images retain their actual provider/model provenance.

## Implemented architecture

### Episode plan handoff

- `studio-ai-comic-composer-handoff.ts` converts every planned cut into a `ScenarioSceneInput`.
- The handoff carries the episode title, original scene text, continuity anchors, preferred variant count and provider-neutral work units.
- `studio-ai-comic-composer-intent.ts` provides strict-mode-safe, one-shot delivery between the lazy AI popover and the lazy scenario panel.
- The scenario editor imports the full plan directly; it does not issue a second text-generation request.

### Candidate workflow

- `studio-scenario-candidate-workflow.ts` owns deterministic input fingerprints, generation planning, candidate append/select/approve operations and stale detection.
- `StudioScenarioCandidateDesk.tsx` provides cut selection, 1/2/4 candidate generation, request-count preflight, candidate comparison and approval.
- Scenario image generation accepts explicit cut indexes and variant count while retaining the prior “generate missing images” default.
- Candidate history is capped while preserving the approved candidate.

### Reliability and trust boundaries

- Existing mutation tickets, abort controllers, provider routing, role references and provenance ledgers remain authoritative.
- Replacement failures preserve reviewed output and provenance.
- Prompt or continuity changes clear the current working image but retain historical candidates for comparison, marked stale by fingerprint.
- Applying to the canvas uses only the selected working image; approved state remains review metadata in the scenario session.

## Acceptance checks

- Entire episode plan opens as editable cuts.
- Selected cut count × variants equals the exact number of planned image requests.
- Existing image generation without an explicit request still targets only missing cuts.
- Successful retries append candidates; failed retries do not destroy prior results.
- Candidate selection and approval do not remove alternatives.
- Reference/prompt/continuity changes make mismatched candidates visibly stale.
- Empty/blocked generation states remain disabled and accessible.
- Typecheck, targeted unit/component tests, lint and production build pass.

## Source links

- Runway — Creating with Gen-4 Image References: https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References
- Scenario — Single-Image Character Consistency: https://help.scenario.com/articles/5838320337-single-image-character-consistency-ideogram
- Boords — AI Storyboard Generator: https://boords.com/ai-storyboard-generator
- Boords — Generating images / camera reframe and revisions: https://assets.boords.com/docs/ai-image-generator
- Boords — Creating storyboards / cast detection: https://assets.boords.com/docs/creating-storyboards
- LTX Studio — Enterprise production workflow: https://website.ltx.studio/studio/enterprise
