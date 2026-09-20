# Virtual Studio opt-in environmental audio — 2026-09-20

Status: implemented and locally verified. This record covers VS-B17 environmental sound only. It does not imply deployment, whole-roadmap completion, live multi-user call verification or a subjective headphone listening review.

## Product behavior

Virtual Studio starts silent, with no AudioContext, download or decoding. A user can enable either of two rain recordings and choose volume. Only the selected recording is fetched, checked against its byte length/SHA-256, and decoded; one context, buffer and looping source are retained. No preference is automatically restored on a new world or mount. The site OST playlist is unchanged.

The actual joined `StudioP2pHuddleLauncher` controller holds a counted local playback-priority lease. Opening a panel does not acquire it. Joining lowers ambient output to 15% of the chosen volume; collapsing the panel retains priority; leaving/unmounting releases it. Multiple local owners keep priority until the final release. This lease carries no device permission, participant audience or media.

Focus atmosphere, focused activity, away activity, hidden document, window blur, world-not-ready and map authoring pause the local ambient source and suspend its context. Existing user consent allows playback to restart when that condition clears, using the already decoded buffer. This is a restarted environmental loop, not a persisted timeline. User off, world/project scope replacement and unmount abort pending loads, reject late decode completion, stop/disconnect output, close the context and drop references. Playback errors require a new explicit enable. Tab blur does not leave the Huddle.

Reduced-motion and lively decoration do not enable sound or change its information content. All navigation, tools, collaboration and status information remain available with sound off. Ambient output is connected only to `AudioContext.destination`; it never uses media capture, captureStream or a stream destination and is never intentionally mixed into RTC sending tracks.

## Original source and selection

The original uploader describes **Rain (loopable)** as rain recorded with a mono microphone at their window, with stereo processing by the author; the page explicitly labels it CC0. The four recordings are described as prepared loops. [Ylmir's original publication](https://opengameart.org/content/rain-loopable)

The CC0 deed permits copying, modification and commercial distribution without asking permission. The official legal text is included with the assets and its hash is verified. [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/), [official legal text](https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt)

The original OGG archive was fetched without login/payment: 2,736,596 bytes, SHA-256 `e68f3e1c77493cf43bec84cebff5043bff6be9ce16d59b24caa988cd460aa75b`. [Original archive](https://opengameart.org/sites/default/files/Rain%20OGG.zip)

Other primary-page candidates were considered before downloading: Kresiek's own rain recording is CC0 but its OGG is much larger (19 MB); the dripping-water loop has less direct recording provenance and a more repetitive discrete drip character. Neither alternative was downloaded. [Kresiek rain](https://opengameart.org/content/amb-rain-loop-2), [dripping-water publication](https://opengameart.org/content/dripping-water-loop)

All four small source-pack loops were decoded locally for objective inspection. Selected originals are copied unchanged: no resampling, normalization, trimming, synthesized overlay or re-encoding. Both are 44.1 kHz stereo; combined delivery size is 1,463,818 bytes. The default 45-second choice is quieter and has the smallest one-second level range of the two selected choices. The other two pack files were not added to the repository.

| Product choice | Original | Duration | Bytes | Peak / clipped samples | RMS | Seam jump / ordinary first-difference P99 | Start/end RMS delta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gentle rain | `3.ogg` | 45 s | 913,769 | 0.4243 / 0 | −27.02 dBFS | 0.01183 / 0.06730 | 0.554 dB |
| Window rain | `1.ogg` | 27 s | 550,049 | 0.5704 / 0 | −22.31 dBFS | 0.02259 / 0.10808 | 0.194 dB |

These measurements show no clipped decoded samples, low DC offset and a boundary discontinuity below ordinary within-recording changes. They do not prove perceptual perfection or absence of every audible artifact. No subjective headphone assessment was performed by the assistant. The UI labels these as environmental recordings rather than composed music or generated premium audio.

Author/source/archive, exact original hashes, official license text, PCM measurements and the lack of pixel/audio processing are recorded in `apps/web/public/assets/virtual-studio/ambient-audio/provenance.json`. Browser decoding at its native output sample rate is expected and does not alter the stored source bytes.

## Verification and bounds

- Focused Vitest: **3 files, 63 tests passed**, including real Launcher consent/lifetime, Page social integration, delayed fetch/decode rejection, pause/resume, error handling and concurrent joined owners. The existing mandatory `live/huddle` and `virtual-space` directory targets include these tests.
- Existing art + actual-git CI sparse contracts: **37 tests passed**. The full art gate still verifies 36 preserved production assets, one clean plate and 32 drawn sheets / 128 real frames. The added audio check verifies two unchanged files and official license text, and rejects changed payload length/hash or changed license evidence. It does not re-label recorded PCM checks as a new decode or listening test.
- Foundation sparse checkout restores only its existing three Virtual Studio art packs plus `ambient-audio`. Lint/typecheck/other static lanes retain their original exclusions; unrelated 3D payloads remain excluded by the actual-git scratch test. No mandatory gate/target was removed.
- Scoped ESLint, CI YAML parse, full art verifier and `git diff --check` passed. Whole production build/typecheck are parent integration checks and are not claimed here.
- Actual Chrome Web Audio and React StrictMode fixture: **16 checks passed**. Before opt-in: zero audio contexts/network/device requests. The native 45-second source stayed running past 46 seconds with one fetch and one loop source. Native hidden-tab events paused ambient while actual Huddle participation remained joined. Joined gain changed approximately 0.60 → 0.09 → 0.60 after leave. Source changes decoded the real 27-second choice and closed the prior context. Focus, away, authoring, explicit off, scope replacement, unmount/remount and 390px/reduced-motion/lively were verified. Final resource evidence: four contexts all closed, eight source starts matched eight stops, zero capture calls and zero stream destinations.

The browser fixture mounts the actual panel, actual Huddle launcher/controller and original assets, using an empty synthetic room. It does not establish live backend/peer communication quality, physical microphone echo isolation, Safari behavior, long-session memory stability or subjective listening quality. The tests never granted devices. One paused loop remains decoded for efficient resume; at 48 kHz stereo the longest decoded buffer is about 16.5 MiB. Off/world replacement/unmount drop it.

Reproduction fixture: `apps/web/tools/browser-harnesses/virtual-studio-ambient-audio.html` via the development server. Native ownership/loop/lifecycle observations are exposed by `window.ambientAudioQA()`. Local evidence: `/tmp/virtual-studio-ambient-audio/browser-report.json`, `browser.log`, `verify-browser.mjs`, `mobile-final.png`, `unit-final.log`, `gates.log`, `art-final.log`, `candidate-qc.json`. The automation used the agent-browser skill with an isolated session.

A separate Huddle layout repair bounds the entire dock by the available viewport above the existing mobile canvas controls. The header and participation toggle retain their size while only the content scrolls; the collapse target is at least 44×44 px. The original 390×844 failure clipped the header above the viewport (`/tmp/virtual-studio-ambient-audio/panel-open.png`). The corrected actual launcher/controller passed four browser journeys at 390×844, 320×568, 844×390 and 1280×900: join, reach and fill the message field, keyboard collapse, reopen with call/draft preserved, and leave. All dock bounds and header controls were on-screen, and there were no page errors. Launcher unit tests: 19 passed; scoped lint passed. Reproducible evidence is written to `.qa/virtual-studio-huddle-layout/report.json` and four screenshots. This uses the same empty-room development fixture, without a remote media peer.

Commands:

```sh
pnpm exec vitest run apps/web/src/domains/creator/virtual-space/studio-virtual-space-ambient-audio.test.ts apps/web/src/domains/creator/live/huddle/StudioP2pHuddleLauncher.test.tsx apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePage.social.test.tsx
node --test scripts/verify-virtual-studio-art-manifest.test.mjs scripts/ci-executed-gates.test.mjs
node scripts/verify-virtual-studio-art-manifest.mjs
node scripts/verify-virtual-studio-ambient-audio.mjs
# With the owned development server running (default fixture origin: port 5253):
node scripts/verify-virtual-studio-huddle-layout.mjs
```
