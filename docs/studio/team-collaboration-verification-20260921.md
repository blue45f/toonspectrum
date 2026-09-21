# Team chat and voice verification — 2026-09-21

Status: **partial verification; production remote collaboration is not accepted**.
Source baseline: `6d9a54c0004f1b0715d74a77433ef4b5161e046a` (PR #1924).

## Production observations (read-only)

- Public route: `https://www.toonstudio.cloud/studio/p/virtual-demo/space`.
- `GET /api/health/ready`: HTTP 200, `{"status":"ready"}`. This is not a collaboration acceptance result.
- Loaded asset: `/assets/use-studio-live-transport-auth-DEYZTRCi.js`.
- Its endpoint resolver contains `explicitOrigin:void 0`, `development:!1`, `devProxyEnabled:!1`.
- Invoking the deployed, exported endpoint resolver in the browser returned **null**.
- The compiled factory selects the local transport when that resolver is null; the inspected factory does not distinguish authenticated versus guest users at that selection point.
- The clean production browser displayed `1명 · 로컬`; no authenticated two-user room was exercised.
- No production configuration, credentials, membership, documents, deployment, or infrastructure was changed.

The operator must supply and validate the intended long-running Socket.IO origin in the web build, rather than asking users to configure the service. Do not replace this with an arbitrary Cloudflare realtime URL: the existing source distinguishes those protocols.

## Executed browser checks

Two independent Chromium contexts, actual product launcher/controller and native RTC/SCTP/RTP, with synthetic primary signaling and synthetic capture. **Not authenticated production, physical devices, or WAN.**

Desktop and mobile emulation both passed bidirectional Korean chat and receipts, camera-free audio packet reception in both directions, increasing received byte counts over a 1.5-second interval, microphone mute/track release with chat preserved, bidirectional video decoding, collapsed-call retention, terminal cleanup, and rejoining with chat.

The standard fake-audio run received 5,343 / 4,801 audio bytes (desktop) and 4,999 / 5,236 bytes (mobile emulation) at the sampled point. These are byte counts, not a claim that audible speech was heard. Audio energy was zero in those synthetic runs.

A stronger known non-silent WAV input check was added. Its decoded-audio-energy assertion did not pass in the initial desktop/mobile runs. Therefore audible end-to-end voice is **not certified** by the packet-only success. This may involve test capture/playback and is not, by itself, a proven production audio defect.

## Test reliability and scope

- The older UI fixture omitted `room.mode` despite constructing a server-mode primary transport. Its participation button was consequently disabled. The fixture now declares `mode: "server"`; product authorization checks were not relaxed.
- In the installed local browser driver, `waitForFunction(async () => false)` unexpectedly returned a handle containing false immediately. RTP checks now use host-side `expect.poll` with awaited `page.evaluate`, positive received-stat assertions, and consecutive byte-growth samples.
- A dedicated known-audio profile requires positive decoded audio energy, rather than accepting silent RTP packets. The normal fake-device suite remains a transport/lifecycle test only.
- The browser test now checks reverse-direction chat, audio-only participation, mute, and chat while muted.
- Related frontend/backend tests: **16 files / 328 tests passed**, including gateway admission and authorization, ticket handling, acoustic binding, P2P overlay, Huddle controls, provider lifecycle, and bounded reconnect.
- These server tests use their declared test doubles and are not proof of a live authenticated production session.
- Native phones, physical microphones/speakers, Safari/WebKit, actual screen sharing, long-duration calls, cross-network NAT, and TURN fallback were not qualified in this run. Current media configuration remains STUN-only.
- PR #1924 was still open and not merged at inspection; its existing production-build/studio-foundation CI failures were observed, not represented as passing.

## Reproduce

```sh
P2P_QA_PROFILE=chromium P2P_QA_OUTPUT=/tmp/toon-team-qa \
  node scripts/verify-studio-p2p-creative-ui.mjs

# Stronger signal-content check: point to a generated non-silent WAV, never a user's recording.
P2P_QA_PROFILE=chromium-desktop P2P_QA_AUDIO_FILE=/path/to/generated-test.wav \
  P2P_QA_OUTPUT=/tmp/toon-team-audio-qa \
  node scripts/verify-studio-p2p-creative-ui.mjs
```

QA screenshots and JSON remain in local `/tmp/toon-team-collaboration-*` directories, not committed as source. A server configuration correction and an authorized two-account real-network acceptance are still required before claiming production team chat/voice works.
