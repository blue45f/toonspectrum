# `/now` explicit variation lab v3

Date: 2026-09-09  
Scope: `apps/web/src/domains/creator-resources`

## Product decision

The v2 dashboard solved the blank-page problem by turning a shared daily scene into a bounded creation loop. The remaining gap appeared between **choosing a directing mode** and **drawing the first thumbnail**: a creator could understand the scene and still not know which concrete interpretation to commit to.

V3 adds an explicit variation lab instead of another recommendation feed. It converts four visible creative decisions into three production-ready routes:

1. framing distance,
2. narrative pressure,
3. dialogue budget,
4. visual rule.

The four axes expose 256 understandable combinations before deterministic route remixing. Every result explains its hook, five-panel strategy, constraint, first action, and completion check. No behavioral ranking, remote inference, or hidden personalization is introduced.

## Benchmark synthesis

| Reference pattern | Product strength | ToonStudio adaptation | Deliberate difference |
| --- | --- | --- | --- |
| Pinterest recommendation controls | People can explicitly tune interests and recommendation inputs instead of accepting one opaque stream. | Four visible creative axes make the reason for every variation inspectable. | No activity graph, cross-site tracking, or model-ranked feed is added. |
| Cosmos discovery and collections | Fast capture, retrieval, collection, and taste-oriented organization reduce the distance between discovery and reuse. | A chosen route and date-scoped production note are saved locally and exported together as a portable brief. | V3 does not ingest third-party media, expose a public profile, or infer taste from browsing history. |
| Are.na channels and conscious browsing | Deliberate collection without likes, ads, or engagement-ranking pressure supports slower research. | The page asks the creator to pick one of three bounded routes and return to production. | There is no infinite scroll, social score, follower graph, or public competition. |
| Daily UI and creative challenge formats | A clear constraint and finish line make practice repeatable. | Every route includes a hard dialogue/visual constraint, a first action, and an observable success check. | No email gate, streak punishment, or public submission requirement is introduced. |
| Miro/Milanote storyboard workflows | Structured cards help translate ideas into an ordered sequence. | Route output is phrased as a five-panel strategy and can be copied into an existing Studio workflow. | The daily task remains compact instead of becoming an unbounded project-management canvas. |

Primary references:

- Pinterest, “Refine your recommendations”: https://help.pinterest.com/en/article/tune-your-home-feed
- Cosmos: https://www.cosmos.so/
- Are.na, About: https://www.are.na/about
- Daily UI: https://www.dailyui.co/
- Miro storyboard templates: https://miro.com/templates/storyboard/
- Milanote storyboard guide: https://milanote.com/guide/storyboarding

## Shipped experience

### Explicit creative axes

The variation lab adds four accessible fieldsets, each with four choices:

- **Framing:** extreme detail, medium, wide, overhead.
- **Narrative pressure:** deadline, sensory contradiction, hidden witness, meaning reversal.
- **Dialogue budget:** silent, one sentence, 30-character budget, diegetic records only.
- **Visual rule:** two-tone palette, repeated composition, silhouette, single light source.

Each choice communicates a plain-language purpose before selection. The current choice uses `aria-pressed`, visible border/background change, and a minimum touch target.

### Three inspectable routes

For the selected axes, the client creates three deterministic routes:

- anchor route,
- tension route,
- form route.

The first route preserves all four explicit choices. The two alternatives move through neighboring option spaces using a date/theme/mode/selection/seed hash. The remix action changes interpretation patterns while keeping the same transparent input model.

Each route includes:

- a signature showing all four active rules,
- an opening hook,
- a mode-aware five-panel strategy,
- enforced dialogue and visual constraints,
- a first action scaled to the selected 10/20/40-minute session,
- a concrete review checklist.

### Production handoff

The selected route is expanded into a production card and can be copied as plain text. The exported brief includes:

- original scene and mission,
- directing mode,
- session length,
- selected route signature,
- hook and five-panel strategy,
- constraints and success checks,
- first action,
- optional private production note.

The existing Studio entry point remains unchanged. V3 improves the decision immediately before opening or returning to the canvas without inventing an unsupported deep-link payload.

### Date-scoped private notes

Creators can attach a short note to each archived daily prompt. Notes and variation choices:

- stay in `localStorage`,
- are capped at 1,200 characters per day,
- are retained for at most 45 dates,
- synchronize across tabs through `StorageEvent`,
- survive remounts and archive navigation,
- are included only when the creator explicitly copies the selected brief.

Storage key: `toonstudio:daily-inspiration:variation-lab:v1`

Invalid, oversized, or unknown persisted values are discarded or replaced with safe defaults. A storage failure surfaces inline while the daily editorial content and route generator remain usable.

## Accessibility and responsive behavior

- Every axis is a semantic `fieldset` with a visible legend and explanation.
- Every option and route reports selected state with `aria-pressed`.
- Generated routes have complete accessible names independent of decorative numbering.
- Copy success uses a polite status; clipboard and storage failures use alerts.
- The note field has an explicit label, description, hard character limit, and visible counter.
- The sticky creation flow adds a direct “변주” anchor.
- Layouts collapse from two-column axes and three-column routes to single-column reading order without horizontal truncation.
- Motion is limited to color/width transitions and respects existing reduced-motion utilities.

## Tests

`variation.test.ts` covers:

- deterministic generation of three inspectable routes,
- remix reproducibility and output change,
- local-state sanitization and note length limits,
- bounded 45-day retention and serialization round trip,
- portable production brief output.

`NowVariationLab.test.tsx` covers:

- axis selection, route selection, note persistence,
- deterministic remix UI state,
- clipboard export including the private note,
- clipboard failure recovery without losing generated routes.

The existing `NowPage.test.tsx` continues to cover archive navigation, share links, directing modes, completion, timers, clipboard recovery, and cross-tab synchronization for the core dashboard state.

## Non-goals

- No AI image or text generation call.
- No opaque recommendation or behavioral profiling.
- No public feed, reactions, follower graph, or leaderboard.
- No automatic import of third-party media or licensing decision.
- No server account synchronization.
- No change to the existing Studio route contract.
