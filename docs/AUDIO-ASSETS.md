# 음원 자산 정책

- 상태: **현재 release 정책**
- 최종 갱신: **2026-09-26**

## 사이트 soundtrack 원칙

사이트 전역 soundtrack에는 **ToonSpectrum 자체 제작 음원만** 허용한다. 과거 Pixabay reference track은
2026-09-18 제거했으며 master가 없을 때 license demo나 browser 합성 placeholder를 대체 재생하지 않는다.

## 저장소의 오리지널 OST

기본 production plan의 master 9개는 모두 저장소에 있으며 총 32분 5초다. Prism Awakening 확장 master
6개, 19분 45초를 더해 저장소 catalogue는 총 15개, 51분 50초다. 이는 저장소 산출물 상태이며 실제 운영
배포 완료를 의미하지 않는다. 반복 4음 창작 motif는 제작 의도이며 모든 생성 결과의 음악학적 검증을
주장하지 않는다.

| ID | 역할 | 형식 | 길이 | 목적 |
| --- | --- | --- | ---: | --- |
| `draw-your-world` | opening | 한국어 vocal | 3:30 | 대표 animation-style opening |
| `after-the-last-panel` | ending | 한국어 vocal | 3:45 | 감성 closing theme |
| `lines-become-worlds` | creator | 한국어 vocal | 3:25 | creator anthem |
| `ink-and-starlight` | story | instrumental | 4:00 | worldbuilding main score |
| `beyond-the-panel` | action | instrumental | 3:15 | production/action climax |
| `between-two-speech-bubbles` | romance | 한국어 vocal | 3:20 | character/romance song |
| `midnight-storyboard` | creator | instrumental | 5:00 | long-form drawing focus |
| `neon-scroll` | story | instrumental | 3:50 | discovery/community city-pop |
| `publish-the-sky` | ending | instrumental | 2:00 | publish/completion theme |

vocal title도 production config에 instrumental variant를 선언해 album identity를 바꾸지 않고 집중 작업용
파생본을 만들 수 있게 한다.

## Prism Awakening 확장

곡 6개와 오리지널 한국어 가사는 `docs/ost/prism-awakening/README.md`와 인접 track 문서에 있다. vocal
4개, instrumental 2개다. 특정 artist, franchise, source recording을 prompt에 사용하지 않았다.

새 delivery는 48 kHz stereo MP3 320 kbps다. source FLAC는 Git 밖의 운영자 archive에 보관한다.
2-pass loudness normalization은 -14 LUFS, -1.5 dBTP, 11 LU LRA를 목표로 하며 sidecar에 실제 mode,
first-pass 측정과 encode 뒤 QC를 기록한다. bitrate, loudness test, release flag가 주관적 음악 품질을
보증하지 않는다.

```sh
python3 scripts/generate-site-original-ost-acestep.py \
  --track spectrum-breaker --keep-source
```

raw directory는 `ACESTEP_RAW_DIR`로 지정한다. local generator는 유료 provider를 호출하지 않는다.
운영 배포는 `AGENTS.md`의 별도 승인이 필요하다.

## ACE-Step 1.5 생성 기록

기존 master는 공식 ACE-Step 1.5 Git revision
`ca1e85fe9430179831e6bc6be790c332190a3866`, model `acestep-v15-turbo`, Apple Silicon의 native MLX
DiT/VAE로 생성했다. software license는 MIT다. source audio, commercial recording, artist/franchise,
celebrity voice reference를 제공하지 않았고 prompt에 original melody/harmony와 imitation 금지를 명시했다.

고정 model hash:

- DiT: `3f6e0797fad420a39bd33979eb6e840e30989e34a3794e843d23b60ec6e422d7`
- VAE: `da17edb604c40deaf09e9b24974e590d1ca83a374070e5d0884cfa4bed9a99b0`
- Qwen3 embedding: `0437e45c94563b09e13cb7a64478fc406947a93cb34a7e05870fc8dcd48e23fd`

track별 seed는 deterministic하다. 48 kHz FLAC 중간본은 커밋하지 않고 SHA-256을 sidecar에 보존한다.
legacy core master 6개는 192 kbps/single-pass `loudnorm=I=-14:TP=-1:LRA=7`, 나머지 기본 master 3개는
192 kbps/two-pass, Prism Awakening은 320 kbps/two-pass를 사용한다. 모든 public MP3는 codec, sample rate,
stereo, duration, bitrate, loudness, true peak, SHA-256 자동 검사를 통과해야 한다.

ACE-Step provenance는 Eleven Music C2PA 요청과 다르게 처리한다.

- ACE-Step: `provenance: "local-generation-recorded"`, 40자 revision, SHA-256,
  `status: "published"`
- Eleven Music: `provenance: "c2pa-requested"`, `c2paRequested: true`

```sh
python3 scripts/generate-site-original-ost-acestep.py --all
node scripts/generate-site-original-ost.mjs \
  --track draw-your-world --dry-run --publish
```

future sidecar는 기본 unpublished이며 `--approve-generated`가 명시적 승인 경계다. assistant는 객관적
integrity를 검사할 수 있지만 청각 품질을 주장하지 않는다. sidecar의
`subjectiveListeningReview: "not-performed-by-assistant"`를 유지한다.

## Eleven Music 경로

`scripts/generate-site-original-ost.mjs`는 유료 provider 경로다. 기본은 dry-run이다.

- `--generate`: `ELEVENLABS_API_KEY` 필요
- batch: `--confirm-batch` 필요
- 기존 audio overwrite: `--force` 필요
- `--publish`: media hash와 provider별 provenance gate 통과 필요

sidecar에는 SHA-256, provider song ID, model, generation time, config hash, C2PA 요청 상태와 review flag를
기록한다. 승인되지 않은 sidecar는 publish에서 제외한다.

## manifest와 runtime 계약

`apps/web/public/audio/playlist.json`은 same-origin `/audio/original/*`만 포함한다. role, vocal mode,
adaptive profile/intensity, duration/BPM, `origin: "original"`, 최종 SHA-256, generation timestamp,
provider/model/provenance, `status: "published"`가 필요하다.

parser는 legacy `licensed-reference`, 외부 audio URL, integrity 누락, unsupported provider/model/provenance,
draft와 `/audio/original/` 밖 파일을 거부한다.

route role은 opening/creator/story/action/romance/ending track을 선택한다. 사용자는 자동 routing 또는
Animation, Webtoon, Lo-fi, Cinematic, Fantasy, City Pop과 Chill/Normal/Epic,
Auto/Vocal/Instrumental을 선택할 수 있다. creator/learning/story workspace는 Auto에서 instrumental을
우선한다. audio 제작, animatic, live call, game, message, admin, login/account 등 충돌 route에서는 사용자
선호를 지우지 않고 global soundtrack만 suspend한다.

## 권리와 release 경계

모든 prompt는 named artist, franchise, copyrighted melody, celebrity voice imitation을 금지한다.
software/model provenance와 signal QC는 배포처·광고·방송·관할권별 법적 검토를 대체하지 않는다.
sidecar를 master와 함께 보존하고 사이트 밖 재사용 전에 적용 조건을 다시 확인한다.
