# Cloudflare 실시간 조정자 배포 체크리스트

- 상태: **운영 승인 체크리스트**
- 최종 갱신: **2026-09-26**

scaffold와 production routing은 별개다. 모든 항목을 확인하기 전 production client를 Worker로 보내지 않는다.

## 1. 권위와 ticket 발급

- [ ] `POST /api/studio-realtime/tickets`를 소유한 인증 NestJS deployment에서만
      `STUDIO_REALTIME_TICKET_ENABLED=true` 설정
- [ ] README의 `STUDIO_REALTIME_CLOUDFLARE_*` 전체 설정; 부분 활성화는 bootstrap 실패
- [ ] exact control URL과 별도 control secret 준비 뒤 revoke 기능 활성화; ticket secret 재사용 금지
- [ ] exact `workId + roomId` scope 권한 확인 뒤 서명
- [ ] saved/provisional client 모두 creator work ID를 workId와 roomId에 사용; `draft-room_<uuid>` 금지
- [ ] ticket마다 cryptographic random single-use nonce
- [ ] ticket TTL 2분 이하, session TTL 5분 이하이며 Web session/authorization lease보다 짧게 유지
- [ ] `src/ticket.ts` canonicalization과 HMAC context 그대로 사용
- [ ] HTTPS로 승인 browser에만 반환하고 ticket 저장·log 금지

## 2. Cloudflare 구성

- [ ] declarative Durable Object `exports`를 지원하는 최신 Wrangler 사용
- [ ] account와 namespace history 기준으로 `wrangler.jsonc` 검토; example/test config 배포 금지
- [ ] `RealtimeRoom`, `RealtimeActorDirectory`를 SQLite-backed로 생성
- [ ] `REALTIME_ROOMS`, `REALTIME_ACTORS` binding 정확히 연결
- [ ] ticket/control secret은 Worker secret 또는 Secrets Store에 저장; vars/source/CI/shell history 금지
- [ ] local development secret은 ignore된 `.dev.vars` 계열에만 저장
- [ ] issuer/audience가 API signer와 exact match
- [ ] receipt count/byte, resume request/egress limit을 room canary로 검토; admission 비활성 금지
- [ ] origin allowlist에 `*`, HTTP, 유사 domain, 무관 preview host 금지
- [x] `realtime.toonstudio.cloud` custom hostname과 독립 workers.dev canary 유지
- [x] custom domain·canary DNS/TLS 확인
- [ ] account limit, DO billing, rollback owner 확인

구형 toolchain의 one-time migration은 현재 Wrangler schema와 namespace history를 확인한 뒤에만 사용한다.
두 lifecycle 형식을 동시에 선언하지 않는다.

## 3. Browser·edge 보안

- [x] Studio CSP `connect-src`에 `wss://realtime.toonstudio.cloud` 추가
- [ ] ticket은 `ts-ticket.*` WebSocket subprotocol로만 전송
- [ ] ticket/token/jwt/authorization/access_token query 거부
- [ ] Origin 필수·exact match
- [ ] proxy가 Upgrade, Connection, Origin, Sec-WebSocket-Protocol 보존
- [ ] response protocol은 `toonspectrum-realtime-v1`만 선택
- [ ] byte limit 대신 permessage-deflate/미검토 compression을 사용하지 않음

## 4. Log·관측

- [ ] route의 request header/body capture 비활성
- [ ] revoke endpoint header/body 전체 제외; timestamp/nonce/signature/ID/raw error log 금지
- [ ] Logpush, Tail Worker, trace, error/support proxy에서 `Sec-WebSocket-Protocol` 제거
- [ ] aggregate counter와 close code, replay gap, capacity rejection, room-size bucket만 기록
- [ ] work/room/actor/client ID, nonce, comment body, SDP, ICE, ticket, raw exception을 label/log로 사용 금지
- [ ] payload 없이 1011, 반복 1013, capacity rejection, alarm/storage error alert

## 5. 통합·품질 gate

- [ ] README의 Vitest, TypeScript, ESLint 실행
- [x] workerd + SQLite DO 통합 스위트 유지
- [ ] production canary로 close/error와 account limit 검증
- [ ] 같은 work의 actor 2명과 multi-tab 테스트
- [ ] comments, presence, offer/answer/ICE/hangup end-to-end
- [ ] exact replay, paginated replay, `resume-gap`
- [ ] repeated/old/post-completion resume rejection와 hibernation budget persistence
- [ ] duplicate idempotency key와 out-of-order client sequence
- [ ] receipt count/byte exhaustion에서 sequence/state 미변경, cleanup 뒤 admission 회복
- [ ] ticket replay, wrong work/room/origin/audience, expiry/future time, malformed signature, rotation
- [ ] revoke body tamper, timestamp, nonce replay, partial config, logout, ACL removal, race interleaving
- [ ] binary, raster data URL, oversized comment/SDP/ICE, unknown key/type
- [ ] room/actor capacity, slow-client backpressure, 1013 뒤 회복
- [ ] close/expiry당 presence leave와 `signal.stop` 정확히 1회; idle connect-close는 event/receipt 0
- [ ] owner eject, viewer self-end, peer/expired share cleanup, same-ID reannounce
- [ ] truncation, fidelity 저하, channel 비활성, partial protocol fallback이 없는지 확인
- [ ] coordinator 장애에서도 canonical project/comment persistence가 동작하는지 확인

## 6. Rollout·rollback

- [ ] 내부 work allowlist와 별도 custom hostname으로 시작
- [ ] connection count, active duration 비용, SQLite write, alarm, replay size, close-code 측정
- [ ] 전체 feature/security matrix 통과 뒤 점진 확대
- [ ] rollout 동안 기존 transport 유지; 연결 전에 선택하고 active room protocol downgrade 금지
- [ ] route disable, secret rotation, DO point-in-time restore, client endpoint revert owner 문서화
- [ ] rollback에서 hostname과 ticket issuer를 함께 revoke해 stale ticket 신규 연결 차단
