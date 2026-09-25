# ToonSpectrum Cloudflare 실시간 조정자

- 상태: **선택형 배포 scaffold**
- 최종 갱신: **2026-09-26**

work·room 범위 Cloudflare Durable Object로 다음만 조정한다.

- 경량 presence와 cursor 상태
- anchor comment 변경 알림
- WebRTC screen-sharing signaling

artwork 저장소, pixel CRDT, media relay, 인증 권위, billing, canonical project save가 아니다.
raster/image/audio/video byte는 거부한다. WebSocket binary frame은 code `1003`으로 닫고 JSON protocol에는
asset byte field가 없으며 모든 frame에 byte 상한을 둔다. 화면 media는 peer 간 WebRTC로 흐르고 이
서비스는 bounded SDP/ICE control message만 중계한다.

## 구조

```text
Browser
  -> Sec-WebSocket-Protocol:
     toonspectrum-realtime-v1, ts-ticket.<short-lived-HMAC-ticket>
  -> Cloudflare Worker
       - exact HTTPS Origin allowlist
       - query credential 금지
       - HMAC ticket 검증
       - 별도 HMAC revocation control plane
       - object key = work:<workId>:room:<roomId>
  -> SQLite-backed RealtimeRoom Durable Object
       - ticket 재검증, work/room binding, one-time nonce 소비
       - hibernatable WebSocket
       - channel별 sequence·replay floor
       - bounded idempotency receipt/storage admission
       - presence·signaling ACL·budget persistence
  -> SQLite-backed RealtimeActorDirectory Durable Object
       - actor room directory와 revocation fence
```

WebSocket Hibernation attachment에는 identity, scope, expiry, client sequence, violation count,
channel별 resume frontier와 egress window를 저장한다. presence, nonce, receipt, publish budget,
screen-share ownership, viewer grant, WebRTC peer binding은 SQLite에 저장해 isolate eviction으로 권한·순서·
backpressure가 초기화되지 않게 한다.

NestJS/PostgreSQL은 membership, durable comment, project, 저장 작품의 권위다. Cloudflare는
latency-sensitive room coordination만 소유한다. provider 장애가 나면 해당 목적을 중단하며 약한
대체 구현으로 자동 전환하지 않는다.

## endpoint와 browser handshake

```text
GET /v1/rooms/<workId>/<roomId>
Upgrade: websocket
Origin: https://toonstudio.cloud
Sec-WebSocket-Protocol: toonspectrum-realtime-v1, ts-ticket.<ticket>
```

```ts
const socket = new WebSocket(
  `wss://realtime.toonstudio.cloud/v1/rooms/${encodeURIComponent(workId)}/${encodeURIComponent(roomId)}`,
  ["toonspectrum-realtime-v1", `ts-ticket.${ticket}`],
);
```

응답은 `toonspectrum-realtime-v1`만 선택하고 ticket-bearing subprotocol은 echo하지 않는다. Worker와
Durable Object는 request/header/ticket/exception/payload를 log하지 않는다. Logpush, Tail Worker,
trace와 third-party observability에서도 `Sec-WebSocket-Protocol`을 제거한다. ticket을 URL, cookie log,
metric label, exception, analytics event에 넣지 않는다.

`GET /health`는 versioned service status만 반환한다.

## ticket 계약

API 권위가 WebSocket handshake 전에 단기 ticket을 발급한다. canonical claim에는 version, issuer,
audience, subject, session version, authorization epoch, work/room/client ID, exact origin, scope, nonce,
issue/expiry/session-expiry가 포함된다.

규칙:

- ticket TTL 최대 2분
- 연결 session 최대 5분이며 검증된 Web session과 room authorization lease를 넘지 않음
- issuer, audience, work, room, exact origin을 서명에 binding
- `authorizationEpochMs <= issuedAtMs`
- nonce는 work SQLite DO에서 1회 소비
- secret은 UTF-8 32 byte 이상
- unknown claim/scope 거부, recursive key-sorted canonical JSON 사용
- 형식: `base64url(claims) + "." + base64url(HMAC-SHA256(...))`
- signed input: `toonspectrum/realtime-ticket/hmac-sha256/v1\n<payloadSegment>`

reference issuer는 `src/ticket.ts`의 `signRealtimeTicket`이다. production 발급은 인증된 NestJS 권한 검사
뒤에만 수행한다. browser에 `REALTIME_TICKET_SECRET`을 노출하지 않는다.

API 설정 예:

```dotenv
STUDIO_REALTIME_TICKET_ENABLED=true
STUDIO_REALTIME_CLOUDFLARE_PROVIDER_ID=cloudflare-realtime-v1
STUDIO_REALTIME_CLOUDFLARE_TICKET_ISSUER=toonspectrum-api
STUDIO_REALTIME_CLOUDFLARE_TICKET_AUDIENCE=toonspectrum-realtime
STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET=<REALTIME_TICKET_SECRET와 같은 값>
STUDIO_REALTIME_CLOUDFLARE_TICKET_TTL_SECONDS=120
STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS=300
STUDIO_REALTIME_REVOCATION_ENABLED=true
STUDIO_REALTIME_CLOUDFLARE_CONTROL_URL=https://realtime.toonstudio.cloud/v1/control/revocations
STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET=<Worker REALTIME_CONTROL_SECRET와 같은 별도 값>
STUDIO_REALTIME_CLOUDFLARE_CONTROL_TIMEOUT_MS=3000
```

ticket secret과 control secret은 서로 달라야 하며 secret store와 `wrangler secret put`으로만 전달한다.
`vars`, repository, example, `VITE_` 변수에 넣지 않는다. 누락·약한 값·앞뒤 whitespace·범위 오류는
secret을 출력하지 않고 bootstrap을 중단한다.

## 즉시 revoke control plane

`POST /v1/control/revocations`는 server-to-server 전용이다. method, 고정 path, timestamp, UUID nonce,
body digest를 HMAC-SHA256으로 서명한다. 30초 이상 오래되거나 미래 timestamp, 변조 body, unknown field,
nonce replay, 동일한 ticket/control secret, 부분 설정은 fail-closed다.

actor DO는 bounded actor→room registration과 짧은 session/room fence만 저장한다. room admission은
preflight와 accept 뒤 final confirmation을 모두 수행해 두 단계 사이 revoke race를 막는다. logout은
control event보다 먼저 durable session version을 올린다. member removal은 PostgreSQL transaction 안에
append-only removal epoch를 저장해 edge delivery 재시도를 가능하게 한다. 재초대는 더 최신 authorization
epoch를 받아 과거 delayed event에 닫히지 않는다.

현재 Studio는 creator work ID를 canonical live room ID로 사용한다. provisional collaboration도 hidden
provisional work의 `workId`를 사용하며 `draft-room_<uuid>`는 provisioning/lease record ID일 뿐이다.
protocol v1은 `{ workId, roomId: workId }`만 허용하고 Nest ACL adapter가 다른 pairing을 거부한다.

## protocol v1

모든 JSON frame:

```json
{ "version": "toonspectrum.realtime.v1", "type": "..." }
```

unknown envelope/payload key, channel mismatch, unsafe identifier, non-finite coordinate, oversized text,
binary/raster marker를 거부한다. 정확한 TypeScript shape와 validator는 `src/protocol.ts`가 소유한다.

Client message:

| type | 의미 |
| --- | --- |
| `publish` | unique idempotency key, 증가하는 client sequence, timestamp를 포함한 publish |
| `resume` | `afterSequence` 이후 bounded replay 요청 |
| `ping` | hibernation auto-response용 고정 heartbeat |

Server message:

| type | 의미 |
| --- | --- |
| `welcome` | connection identity, scope, channel sequence/floor, expiry |
| `presence-snapshot` | paginated connection-level presence; cursor stroke tail 제외 |
| `ack` | idempotency key와 canonical channel sequence 연결 |
| `event` | server connection ID를 포함한 channel sequence event |
| `replay` | channel별 bounded replay page |
| `error` | input/exception을 반사하지 않는 안정적 code |
| `pong` | 고정 heartbeat 응답 |

presence는 update/cursor/leave, comment는 body가 아닌 monotonic `comment.changed` invalidation만 전달한다.
screen signaling은 announce/stop, targeted request/access/offer/answer/ICE를 허용한다. active share owner와
승인된 viewer pair, persisted peer connection ID를 검사한다. share restart는 과거 grant와 peer binding을
상속하지 않는다.

## replay·순서·backpressure

- presence/comments/screen signaling은 독립 sequence와 contiguous replay floor를 가진다.
- connection별 client sequence는 엄격히 증가한다.
- event log는 SQLite에 저장해 hibernation 뒤 replay를 유지한다.
- receipt는 replay log와 분리하지만 같은 retention deadline을 사용한다.
- receipt count/byte 상한을 넘길 publish는 state mutation 전에 `backpressure`로 거부한다.
- 기본 event log는 최대 2,048건, 15분이다.
- cleanup은 channel별 완전 prefix만 제거한다. floor보다 뒤진 client는 `resume-gap` 후 canonical snapshot을
  다시 받아야 한다.
- replay page는 최대 128 event와 128 KiB다.
- resume request/egress byte는 attachment의 고정 window budget을 공유한다.
- room/actor connection limit은 기존 기능을 약화하지 않고 새 handshake를 거부한다.

강화 변수:

| 변수 | 기본값 | 목적 |
| --- | ---: | --- |
| `REALTIME_MAX_RECEIPT_COUNT` | `4096` | room의 live client receipt 상한 |
| `REALTIME_MAX_RECEIPT_BYTES` | `33554432` | 보수적 receipt 저장 byte 상한 |
| `REALTIME_RESUME_WINDOW_MS` | `10000` | connection resume budget window |
| `REALTIME_RESUME_MAX_REQUESTS_PER_WINDOW` | `64` | window의 resume response 상한 |
| `REALTIME_RESUME_MAX_BYTES_PER_WINDOW` | `8388608` | window의 serialized response byte 상한 |

값은 startup에서 bounded positive base-10 integer로 검증한다. `wrangler.jsonc.example`의 검토된 기본값은
세 channel 모두의 최대 replay frame을 허용해야 한다.

DO replay log는 운영 realtime state이며 영구 작품·comment 저장소가 아니다. canonical comment write와
realtime notification을 조정할 때 같은 idempotency key를 사용한다.

## 비용 guardrail

- cursor traffic의 replay/hibernation 계약을 protocol·snapshot recovery 변경 없이 ephemeral로 바꾸지 않는다.
- cleanup alarm이 이미 window 안에 예약돼 있으면 SQLite scan을 반복하지 않는다.
- boolean probe는 growing table의 `COUNT(*)` 대신 `EXISTS`/bounded lookup을 사용한다.
- bounded actor×channel `rate_budget`에는 hot-path expiry index를 추가하지 않는다.
- actor-directory preflight와 final registration은 revoke race 방어이므로 단순 중복 제거하지 않는다.
- cursor 비용을 줄이기 위해 durable comment, signaling, CRDT, ink 보장을 낮추지 않는다.

## 검증과 배포

```sh
pnpm exec vitest run deploy/cloudflare-realtime/src
pnpm typecheck:cloudflare-realtime
pnpm exec eslint --max-warnings=0 deploy/cloudflare-realtime
pnpm test:cloudflare-realtime
pnpm exec wrangler deploy --dry-run \
  --config deploy/cloudflare-realtime/wrangler.jsonc \
  --outdir /tmp/toonspectrum-realtime-dry
```

`wrangler.jsonc`는 `realtime.toonstudio.cloud` custom domain, 독립 canary/rollback용 `workers.dev`, preview
URL 비활성화를 선언한다. `wrangler.test.jsonc`의 local-only credential은 배포하면 안 된다. production은
`wrangler secret put REALTIME_TICKET_SECRET`와 `DEPLOY_CHECKLIST.md` 전체 승인이 필요하다. 이 파일 자체는
Worker나 Cloudflare resource를 배포하지 않는다.
