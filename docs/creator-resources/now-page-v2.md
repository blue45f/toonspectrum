# `/now` daily creator dashboard v2

Date: 2026-09-09  
Scope: `apps/web/src/domains/creator-resources`

## Product decision

The previous page supplied one deterministic daily scene and two research links. It was useful as an editorial prompt, but it stopped before the user could choose a direction, begin a concrete artifact, or build a return habit.

V2 treats the page as a compact daily creation loop:

1. Discover a shared daily scene.
2. Choose an explicit directing lens instead of accepting an opaque feed ranking.
3. Translate the scene into five panel beats.
4. Run a bounded 20-minute thumbnail sprint.
5. Track completion, save useful prompts, and reopen the last seven days.

The page remains useful without an account, backend, notification permission, or external recommendation API.

## Benchmark synthesis

| Service pattern | Observed strength | ToonStudio adaptation | Deliberate difference |
| --- | --- | --- | --- |
| Pinterest recommendation tuning | People can refine recommendations using activity, boards, interests, following, and AI-content preferences. | Four visible directing modes change lens, palette, pacing, and panel directives. | No behavioral profiling or hidden ranking is introduced. The choice is explicit and browser-local. |
| Behance Moodboards | Related projects and images can be collected under a theme, reopened, and used to discover related work. | Daily prompts can be saved; the recent seven-day archive shows saved and completed state. Mood tags open targeted reference searches. | V2 stores only prompt identifiers, not third-party media or copied rights metadata. |
| Behance creative search | Search is separated by project/image type, with tags, tools, fields, save, and share affordances. | Object/space research and work/edition research remain separate launch paths; tags act as quick query pivots. | Research cannot silently insert an external asset into Studio. Rights review remains explicit. |
| Daily UI | A bounded daily challenge creates practice cadence, encourages interpretation, and supports sharing work. | A five-step creation loop, streak calculation, structured brief copy, and a 20-minute sprint make the prompt actionable. | No email capture, artificial reward, or public-pressure mechanic is required. An unfinished today does not immediately destroy yesterday's streak. |
| Curated creative feeds | Editorial selection gives a common starting point and reduces blank-page anxiety. | Everyone receives the same deterministic KST daily anchor, while directing mode and progress remain personal. | The editorial anchor is kept separate from third-party recommendation material and clearly labelled as original content. |

Primary references:

- Pinterest, “Refine your recommendations”: https://help.pinterest.com/en/article/tune-your-home-feed
- Behance, “Guide: Moodboards”: https://help.behance.net/hc/en-us/articles/204484004-Guide-Moodboards
- Behance, “Guide: Search & Filter Creative Work”: https://help.behance.net/hc/en-us/articles/204483864-Guide-Search-Filter-Creative-Work
- Behance, “What is Behance?”: https://help.behance.net/hc/en-us/articles/204483894-What-is-Behance
- Daily UI: https://www.dailyui.co/

## Shipped experience

### Shared daily anchor

- KST calendar boundary preserves the current editorial rotation.
- The prompt continues to expose object, place, light, sound, mood, and original five-panel mission.
- The previous six prompts are available in a horizontally scrollable archive.
- Archive cards disclose selected, saved, and completed state without relying on color alone.

### Explicit directing modes

Four modes are intentionally small and comprehensible:

- Balanced: clear information hierarchy and a conventional five-beat arc.
- Emotion: gestures, distance, and reaction details rather than explanatory dialogue.
- Mystery: fair clues, delayed interpretation, and a final verifiable question.
- Visual experiment: scale, repetition, negative space, and one rule-breaking panel.

Each mode changes:

- lens/composition guidance,
- palette guidance,
- panel pacing,
- all five storyboard beat directives.

The selected mode is persisted locally and synchronized through the browser `storage` event.

### Actionable creation loop

The page now includes:

- five workflow checks,
- percentage progress with semantic `progressbar`,
- automatic completion recording when all checks are done,
- a streak that tolerates an unfinished current day,
- recent seven-day completion count,
- a 20-minute start/pause/reset timer,
- a five-card storyboard scaffold,
- a portable plain-text brief copied to the clipboard.

### Research boundaries

- Mood tags link to targeted public-art searches.
- Object/space and story/edition research remain distinct.
- No third-party asset is auto-inserted into Studio.
- The rights notice follows the selected archive date.

## Persistence and resilience

Storage key: `toonstudio:daily-inspiration:v2`

Persisted values:

- selected directing mode,
- progress step IDs by ISO date,
- completed ISO dates,
- saved ISO dates.

Defensive behavior:

- invalid JSON falls back to a fresh state;
- unknown modes and step IDs are discarded;
- ISO dates are validated, deduplicated, and bounded;
- payloads larger than 200 KB are rejected;
- progress history is capped at 120 dates;
- completion history is capped at 400 dates;
- saved prompts are capped at 60 dates;
- localStorage read/write failures leave the editorial page usable and surface an inline notice;
- another tab's valid state is adopted through `StorageEvent`.

No account synchronization, tracking claim, or server persistence is added.

## Accessibility

- Every mode and archive choice uses `aria-pressed`.
- Archive controls have complete accessible names that include status.
- Progress exposes min/max/current values.
- Timer controls use explicit names and the remaining time has a duration value.
- Completion and clipboard states are announced.
- Every interactive target is at least 44 CSS pixels high where the primary control size applies.
- Focus rings and non-color status icons are included.
- Horizontal archive overflow preserves narrow-screen access rather than compressing text into unreadable cards.

## Tests

`now.test.ts` covers:

- KST midnight behavior and deterministic theme selection;
- malformed/untrusted local state sanitization and round trip;
- mode-aware five-panel beat generation and portable brief output;
- current-day-tolerant streak calculation;
- timer formatting and date shifting.

`NowPage.test.tsx` covers:

- full dashboard render and archive navigation;
- mode and bookmark persistence across remounts;
- all five progress transitions, completion, streak, and reopening;
- clipboard success/failure states;
- focus timer start, pause, and reset;
- cross-tab state synchronization.

## Non-goals

- No social feed, public leaderboard, or follow graph.
- No generative image call or personalized model inference.
- No notification subscription.
- No automatic publishing or asset licensing decision.
- No migration of the creator research workspace schema.
