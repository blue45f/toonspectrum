# ToonSpectrum coturn 데이터 plane

- 상태: **선택형 단일 Linux node 배포 scaffold**
- 최종 갱신: **2026-09-26**

Studio voice에서 직접 WebRTC 연결이 불가능할 때 암호화된 packet을 relay한다. Nest API가 단기 credential
control plane이며 coturn은 독립 data plane이다. Core API 배포와 분리되고 로컬 개발을 변경하지 않는다.

`StudioVoiceIcePolicyService`와 같은 REST credential 계약을 사용한다.

```text
username = <unix-expiry>:<opaque-identity>
password = base64(HMAC-SHA1(shared-secret, username))
```

shared secret은 API와 coturn에서 같아야 하지만 browser나 Git에 노출하지 않는다.

## topology와 port

```text
Browser -- UDP/TCP 3478 --┐
Browser -- TLS/TCP 5349 --┼-> voice.example.com / 고정 public IP -> coturn
                          └-> UDP 49160-49259 relay allocation -> peer

API -> 단기 ICE policy -> Browser
    -> 같은 shared secret -> coturn
```

공식 container 권장에 따라 Linux VM에서 `network_mode: host`를 사용하고 Docker bridge port를 publish하지
않는다. 기본 relay range는 UDP 100개이며 bootstrap이 unbounded range를 거부한다.

| protocol | port | 용도 |
| --- | ---: | --- |
| UDP | 3478 | STUN/TURN |
| TCP | 3478 | TURN TCP fallback |
| TCP | 5349 | TURN TLS (`turns:`) |
| UDP | 5349 | DTLS listener, 현재 선택적 |
| UDP | 49160-49259 | WebRTC relay media |

relay range를 바꾸면 host firewall과 cloud security list를 함께 바꾼다. coturn CLI, Web admin, SQLite,
Docker, metrics port는 공개하지 않는다.

## provision

1. 고정 public IPv4에 `voice.<domain>` A record를 만든다. IPv6 relay/listener를 검증하기 전 AAAA를
   publish하지 않는다.
2. exact DNS SAN을 가진 PEM full chain과 암호화되지 않은 PEM private key를 준비한다. renewal은 container
   밖에서 수행하고 교체 뒤 coturn을 재시작한다.
3. 제한된 runtime directory와 고 entropy secret을 만든다.

```bash
cd deploy/coturn
umask 077
mkdir -p secrets certs
openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n' > secrets/static-auth-secret
cp /secure/source/fullchain.pem certs/fullchain.pem
cp /secure/source/privkey.pem certs/privkey.pem
chmod 600 secrets/static-auth-secret certs/privkey.pem
chmod 644 certs/fullchain.pem
sudo chown root:root secrets/static-auth-secret certs/fullchain.pem certs/privkey.pem
cp .env.example .env
```

4. `.env`에서 `TURN_REALM`은 certificate DNS, `TURN_EXTERNAL_IP`는 숫자 public IP로 설정한다. example
   domain, documentation IP, 빈/약한 secret, 무제한 quota, 잘못된 port range는 거부한다.
5. VM이 public IP를 직접 소유하면 `TURN_RELAY_IP`를 비운다. 단순 1:1 NAT이면 private interface IP를
   지정하고 relay port mapping을 동일하게 유지한다.
6. API에 같은 endpoint와 current secret을 설정한다.

```dotenv
STUDIO_VOICE_STUN_URLS=stun:voice.example.com:3478
STUDIO_VOICE_TURN_URLS=turn:voice.example.com:3478?transport=udp,turn:voice.example.com:3478?transport=tcp,turns:voice.example.com:5349?transport=tcp
STUDIO_VOICE_TURN_SHARED_SECRET=<secrets/static-auth-secret의 정확한 내용>
STUDIO_VOICE_TURN_REQUIRED=true
STUDIO_VOICE_TURN_TTL_SECONDS=900
```

server secret에만 두고 `VITE_` prefix를 사용하지 않는다.

7. 명시적으로 검증·시작한다.

```bash
docker compose --profile turn --env-file .env config >/dev/null
docker compose --profile turn --env-file .env up -d
docker compose --profile turn --env-file .env ps
docker compose --profile turn --env-file .env logs --tail=50 coturn
```

image tag는 `latest`가 아니라 pin한다. 갱신 전 release note와 staging을 검토하고 가능하면 production CPU에
맞는 multi-architecture digest를 고정한다.

## 보안 기본값

- `use-auth-secret` 활성, anonymous TURN allocation 금지; credential-free STUN binding만 허용
- secret mount에서 current/previous secret을 읽고 mode 0600 tmpfs config 생성
- read-only filesystem, 필요한 `SETUID`/`SETGID` 외 capability 제거, `no-new-privileges`, PID limit 적용
- RFC 6062 peer-side TCP relay 비활성; browser->TURN TCP/TLS listener는 유지
- loopback/private/link-local/CGNAT/multicast/documentation/reserved peer range 거부
- CLI, Web admin, Prometheus, verbose/binding log와 software version attribute 비활성

Standalone Compose secret은 KMS/HSM이 아니다. host 경로를 root-owned 0600으로 유지하고 Docker 접근,
disk·backup 암호화, cloud secret delivery를 별도로 관리한다.

## quota와 관측

audio-only 최대 6인 P2P mesh 기준 기본값:

- `user-quota=12`
- `total-quota=100`
- `max-bps=262144`
- `bps-capacity=26214400`

capacity 약속이 아니라 admission ceiling이다. health, allocation rejection, egress, packet loss, socket,
disk/log pressure와 cloud egress 비용을 관측한다. load test와 capacity review 없이 range·quota를 올리지
않는다.

temporary username은 work/user identity를 HMAC 처리하지만 log에는 IP와 timestamped pseudonym이 남을 수
있다. security/personal metadata로 취급하고 짧게 보관하며 secret, rendered config, environment, SDP,
ICE credential, debug trace를 수집하지 않는다.

## secret·certificate rotation

1. 새 secret file을 만들고 old file을 보존한다.
2. current path를 새 값, previous path를 old 값으로 설정해 coturn을 재생성한다.
3. API의 `STUDIO_VOICE_TURN_SHARED_SECRET`을 새 값으로 바꾼다.
4. credential TTL, refresh/backoff, clock skew 여유만큼 기다린다.
5. 두 path를 새 값으로 수렴하고 old file을 정책에 따라 제거한다.

secret을 command line에 넣지 않는다. certificate renewal은 auth secret을 바꾸지 않아도 되며 교체마다
외부 smoke를 실행한다.

## 검증

```bash
pnpm exec vitest run deploy/coturn/scaffold.test.ts
sh -n deploy/coturn/entrypoint.sh
bash -n deploy/coturn/smoke.sh
docker compose --profile turn --env-file deploy/coturn/.env.example \
  -f deploy/coturn/compose.yml config
```

외부 network에서:

```bash
deploy/coturn/smoke.sh voice.example.com
```

`--stun`은 pinned image를 검토한 뒤에만 사용한다. health/smoke는 TURN auth나 end-to-end relay를 증명하지
않는다. production 승인은 서로 다른 network의 browser 2개에서 `iceTransportPolicy: "relay"`, relay
candidate pair, 증가하는 RTP byte를 확인하고 UDP 차단 TCP/TLS fallback, credential refresh, restart,
certificate renewal, network 변경을 반복 검증해야 한다.

## 제한

- 단일 VM은 HA가 아니다. 별도 failure domain, DNS routing, admission과 node별 관측이 필요하다.
- IPv4-only이며 TLS는 5349를 사용한다.
- credential을 command argument에 넣지 않기 위해 CLI auth smoke를 제공하지 않는다.
- coturn은 DTLS-SRTP packet을 relay하지만 metadata와 public bandwidth를 소비한다.
- SFU, recording, moderation, abuse response, large-room scaling을 제공하지 않는다.

공식 coturn Docker guide와 configuration/turnserver/turnadmin 원문을 갱신 검토의 기준으로 사용한다.
