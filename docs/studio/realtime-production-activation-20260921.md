# Realtime configuration and audio-only playback repair

Status: implemented and locally verified; production release evidence is recorded separately.
User request: configure the existing realtime infrastructure so P2P chat, voice and related controls work.

## Existing production authority, not a new service

Render CLI's configured workspace resolves the existing `toonspectrum-core-api` service (`srv-dakljs1594qs73egeq30`), owned by the project workspace and linked to `blue45f/toonspectrum`. It remains on the free plan, with automatic deployment off. No service, database, membership or paid plan is deleted or created.

The existing `https://www.toonstudio.cloud/socket.io` gateway already forwards WebSocket requests to that Render service. A native Socket.IO WebSocket probe reaches the server and an unauthenticated attempt is rejected with the expected login-session error. This proves reachability and an active authentication boundary, not authorized room admission.

Render already has realtime ticket issuance enabled and the expected production CORS origins. `https://realtime.toonstudio.cloud/health` returns the existing Cloudflare realtime coordinator's successful response.

The missing browser configuration is now versioned in `.env.production`, containing public values only:

- `VITE_STUDIO_LIVE_ORIGIN=https://www.toonstudio.cloud` — explicit verified gateway to Render, for persisted-work authorization/document transport and signaling.
- `VITE_STUDIO_REALTIME_ORIGIN=https://realtime.toonstudio.cloud` — the different Worker protocol for purpose-routed presence/signaling and unsaved rooms.
- `VITE_STUDIO_REALTIME_PROVIDER_ID=cloudflare-realtime-v1`.

Huddle's chat bodies and media continue over the existing browser-to-browser WebRTC path. No legacy voice flag is enabled to work around this: `STUDIO_LIVE_VOICE_ENABLED` controls a different, opt-in legacy subsystem. The primary authorization/CRDT transport is not replaced with P2P authority.

## Reproduced voice defect and correction

The previous stronger known-audio check failed even while RTP byte counters increased. With a generated non-silent AudioContext source, the old tile reproduced the same defect: outgoing source energy was positive, but the remote mixed audio/video element had `readyState=0` and `currentTime=0`. Its negotiated, inactive video track prevented camera-free voice playback.

`StudioP2pMediaTile` now binds an audio-only MediaStream to an audio element and a video-only MediaStream to the muted inline video element. A camera-off placeholder cannot block voice. Remote mute, autoplay-consent retry and same-source guards remain; presentation teardown detaches streams but does not stop controller-owned tracks.

## Verification

- Related local unit suites: 11 files / 267 tests passed, including the production-origin contract, socket transport, consent, Huddle and provider lifecycle.
- Real Chromium desktop and mobile emulation: two independent contexts, generated audio/video, native RTC/SCTP/RTP. Both profiles passed bidirectional Korean chat/receipts, audio-only reception with positive decoded audio energy and byte growth, microphone mute/track release, camera playback, synthetic screen-share replacement/stop, and rejoining. No physical microphone, camera or display was captured.
- The new public-origin contract is included in the required regression target manifest.
- The same generated non-silent test failed before the media-tile change and passes after it; packet-only success is not used as an audible-voice acceptance criterion.

## Boundaries

Local browser signaling is synthetic in that fixture. Authenticated production team admission and WAN/device acceptance are separate from this evidence. STUN-only direct P2P remains the configured media policy: no paid TURN/SFU is provisioned and no all-NAT guarantee is made. No server authentication, room authorization, microphone consent or camera consent is bypassed.

Additional browser qualification: WebKit 26.5 mobile emulation also passed the same two-context generated non-silent audio, bidirectional chat/video, synthetic screen sharing and cleanup suite. This is not a physical iPhone or native-app test.
