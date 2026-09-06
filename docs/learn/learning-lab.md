# Webtoon Learning Lab

## Product surface

- `/learn`: ten lessons (eight foundations and two manual-based self-guided Studio exercises), search and track filters.
- `/learn/lessons/:lessonId`: three concept sections, a schematic lab, assignment, checklist, quiz with feedback, personal notes and explicit completion.
- `/learn/glossary`: 36 terms with Korean/English/alias search, categories, bookmarks, examples, cautions and lesson cross-links. `?term=id` is a shareable detail link.
- `/learn/studio`: describes the currently available self-guided exercises and clearly separates future screen-guided tutorials.

All content is Korean. The global footer identifies these links as Korean. Lesson text, SVG diagrams and exercises are original; each lesson links to official references. Reading-time labels are editorial estimates, not measured completion guarantees. Diagram units are not publisher upload requirements.

## Technical design

One lazy `/learn/*` route owns this feature. React owns navigation, labels, inputs and progress. One SVG lab at a time illustrates pacing, one-point perspective, stroke-width variation, clipping versus opacity, lettering, or grayscale separation. These are schematic explanations, not demonstrations of the actual Studio brush/filter engine.

The frame reducer is bounded to 0–299 at 30 explanatory frames per second. There is no autoplay or sound. Playback pauses on visibility changes, off-screen intersection and reduced-motion preference changes. Explicit chapter buttons and range controls expose every state without animation. Narrow layouts retain a readable diagram in a labelled horizontal scroll region rather than shrinking its labels beyond recognition. Full text remains outside the diagram.

Search/filter/detail state lives in the URL; rapid search edits replace history, discrete filters and navigation push history. Progress, notes and bookmarks use a versioned, validated `toonstudio:learning:v1` localStorage record. Data is not account-synced. Malformed storage falls back to an empty state; quota or access failures retain the in-memory session with a visible warning. Completion is revalidated from checklist and quiz state; it is self-assessment, not a credential. Reset requires a second explicit action.

The feature never imports Studio engines, creates projects, changes existing documents, calls paid APIs, or automatically opens external sites. The user chooses a safe `/studio` new-tab link. The global footer adds discovery links; the existing route-title owner yields to this page for lesson-specific titles.

## Remotion decision and extension boundary

This release **does not install Remotion, embed a Remotion Player, or render MP4 files**. The request permits Remotion-like interaction; a native typed React/SVG timeline meets this without another runtime or rendering service. The pure diagram props (`kind`, `value`, `frame`) provide a future adapter boundary for Remotion `useCurrentFrame()` / Player input props. A future implementation must verify package compatibility and licensing, add actual rendering and jobs, and test the resulting video—not merely rename this player as Remotion.

The two Studio courses are manual-based self-guided exercises, not UI-verified walkthrough automation. Future guided tours need stable command identifiers, versioned steps, non-destructive sample-project import and an explicit save/leave guard.

## Validation commands

```sh
pnpm exec vitest run src/domains/learn/learning-model.test.ts
pnpm exec eslint src/domains/learn src/app/routes/groups/creator.routes.tsx src/app/routes/app-route-title-ownership.ts components/site-footer.tsx
pnpm run typecheck
pnpm exec playwright test e2e/learn.spec.ts
```

The 16 model/content tests cover catalog consistency, sources and cross-links, normalization, malformed storage, completion integrity, bounded inputs, playback limits, and perspective interpolation. Six browser tests cover routes, searching, bookmarks/history, completion/reload/revocation, reduced motion/keyboard/mobile overflow, persistence failure, and explicit reset.

During initial authoring, the isolated environment ran the same 16 test bodies through Node's test runner after TypeScript transpilation, passed a strict check of the pure model/content, and transpiled all new TypeScript/TSX without syntax diagnostics. This is **not** a full application typecheck, installed Vitest run, visual browser review, or production deployment. Those require the repository's Node 24+/pnpm 11 environment and are reported separately in the pull request.
