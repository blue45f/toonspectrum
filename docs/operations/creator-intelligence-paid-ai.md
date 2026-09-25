# Creator Intelligence 유료 AI 운영 정책

작성일: 2026-09-26

이 문서는 Creator Intelligence의 서버 키 기반 외부 AI 기능을 운영 환경에서 활성화하는 조건과 장애 시 동작을 정의합니다.

## 적용 기능

다음 경로는 외부 공급자 비용 또는 민감한 서버 자격 증명을 사용하므로 동일한 admission 경계를 통과합니다.

| 기능 | API | 공급자 |
|---|---|---|
| 클라우드 음성 | `POST /api/creator-intelligence/voice/synthesize` | Gemini TTS, Deepgram |
| 효과음 생성 | `POST /api/creator-intelligence/sfx/generate` | ElevenLabs |
| 번역 | `POST /api/creator-intelligence/translate` | DeepL, LibreTranslate |
| 이미지→3D 생성 | `POST /api/creator-intelligence/mesh/jobs` | Meshy |
| 3D 작업 조회 | `GET /api/creator-intelligence/mesh/jobs/:jobId` | Meshy |
| 외부 민감도 검사 | `POST /api/creator-intelligence/preflight/safe-search` | Google Vision |

Openverse, Pexels, Pixabay, AniList, Freesound 검색과 장면 자료 조회는 별도의 공개 discovery 경로이며 이 문서의 유료 생성 admission 대상이 아닙니다.

## 운영 활성화 조건

운영에서 아래 조건 중 하나라도 충족되지 않으면 유료 AI 경로는 공급자 호출 전에 `503`으로 종료됩니다.

1. `CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED=true`
2. Upstash coordination이 완전하게 설정됨
3. 사용하는 각 공급자의 개별 기능 플래그와 서버 키가 설정됨
4. Meshy를 사용하면 `CREATOR_INTELLIGENCE_JOB_TOKEN_SECRET`이 32자 이상으로 설정됨
5. 요청이 인증 세션을 통과해 canonical `x-user-id`를 가짐
6. 변경성 요청은 유효한 `Idempotency-Key`를 가짐

권장 환경 변수 예시는 다음과 같습니다.

```dotenv
# 전체 유료 Creator Intelligence master gate
CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED=false

# Meshy 공급자 작업 ID를 사용자 귀속 토큰으로 감싸는 HMAC 비밀
# 운영에서는 32바이트 이상의 별도 무작위 값을 사용합니다.
CREATOR_INTELLIGENCE_JOB_TOKEN_SECRET=

# 다중 API 인스턴스 공통 admission·중복 방지 카운터
UPSTASH_COORDINATION_ENABLED=true
UPSTASH_COORDINATION_REST_URL=
UPSTASH_COORDINATION_REST_TOKEN=
UPSTASH_COORDINATION_KEY_HASH_SECRET=
UPSTASH_COORDINATION_NAMESPACE=toonspectrum-production

# 기능별 스위치와 서버 전용 키
CREATOR_INTELLIGENCE_VOICE_ENABLED=false
GEMINI_TTS_API_KEY=
DEEPGRAM_API_KEY=

CREATOR_INTELLIGENCE_ELEVENLABS_SFX_ENABLED=false
ELEVENLABS_API_KEY=

DEEPL_API_KEY=
LIBRETRANSLATE_BASE_URL=
LIBRETRANSLATE_API_KEY=

CREATOR_INTELLIGENCE_MESHY_ENABLED=false
MESHY_API_KEY=

CREATOR_INTELLIGENCE_SAFESEARCH_ENABLED=false
GOOGLE_CLOUD_VISION_API_KEY=
```

`VITE_` 접두사가 붙은 변수, 프런트 번들, 브라우저 저장소, 클라이언트 로그에는 서버 키를 넣지 않습니다.

## Admission 정책

| 작업 | 단기 한도 | 장기 한도 | 멱등키 |
|---|---:|---:|---|
| 음성합성 | 10분 60회 | 24시간 120회 | 필수 |
| 효과음 생성 | 10분 10회 | 24시간 30회 | 필수 |
| 번역 | 10분 60회 | 24시간 300회 | 필수 |
| Meshy 생성 | 30분 3회 | 24시간 10회 | 필수 |
| Meshy 상태 조회 | 10분 120회 | 24시간 1,000회 | 불필요 |
| Safe Search | 10분 30회 | 24시간 200회 | 필수 |

운영 한도는 Upstash의 원자적 fixed-window counter로 모든 API 인스턴스에서 공유합니다. 사용자 ID, 토큰, 프롬프트, 이미지 내용은 coordination key로 전송하지 않습니다. API 프로세스에서 생성한 SHA-256 fingerprint만 전달하며 Upstash 클라이언트가 key를 다시 HMAC 처리합니다.

개발 환경에서는 Upstash가 없을 때 프로세스 로컬 카운터를 사용할 수 있습니다. 운영에서는 로컬 카운터로 자동 강등하지 않습니다.

## 중복 요청과 재시도

클라이언트는 유료 변경 요청마다 새 `Idempotency-Key`를 생성하고 자동 네트워크 재시도를 사용하지 않습니다.

- 같은 키의 두 번째 요청은 `409 creator_intelligence_duplicate_request`
- 한도 초과는 `429 creator_intelligence_rate_limited`
- coordination 장애는 `503 creator_intelligence_coordination_unavailable`
- 운영 master gate 비활성은 `503 creator_intelligence_paid_routes_disabled`
- 인증이 없으면 `401 creator_intelligence_auth_required`

타임아웃이나 응답 불명확 상태에서 앱이 다른 유료 공급자를 자동 호출하지 않습니다. 사용자가 결과 상태를 확인한 뒤 명시적으로 새 작업을 시작해야 합니다.

## Meshy 작업 소유권

Meshy가 반환하는 원본 provider job ID는 브라우저에 전달하지 않습니다. API는 다음 값을 포함한 HMAC 서명 토큰으로 바꿔 반환합니다.

- provider job ID
- 생성한 사용자의 fingerprint
- 발급 시각
- 계약 버전

토큰은 7일 후 만료됩니다. 다른 계정, 위변조된 토큰, 만료된 토큰은 Meshy 조회 전에 차단합니다. 서명 비밀이 없는 운영 환경에서는 Meshy 생성·조회가 fail-closed 됩니다.

## 비밀키 보관

사용자 소유 BYOK 값은 다음 정책을 따릅니다.

- 일반 텍스트·이미지 연결은 기존 암호화 vault 사용
- Hyper3D 키, Creator Runtime token, 레거시 OpenAI 호환 키는 현재 페이지 메모리에만 유지
- sessionStorage에는 base URL, 모델명, owner 같은 비밀이 아닌 연결 메타데이터만 기록
- 과거 sessionStorage 평문 키는 최초 로드 시 메모리로 옮긴 뒤 즉시 저장소에서 제거
- 페이지 새로고침 후에는 사용자가 키를 다시 입력하거나 암호화 vault 연결을 사용

## 3D 입력 전송 제한

현재 Hyper3D 인라인 경로는 JSON body를 사용합니다. 전역 API body 경계가 16MB이므로 Base64 팽창과 제어 필드를 고려해 원본 입력 파일 합계를 10MB로 제한합니다.

- UI는 선택된 이미지와 모델 파일의 합계를 표시
- 10MB 초과 시 인코딩과 네트워크 요청을 시작하지 않음
- 25MB 이미지 또는 200MB 모델 직접 JSON 전송을 지원한다고 표시하지 않음

10MB를 초과하는 파일을 지원하려면 private object storage의 pre-signed upload와 파일 ID 기반 작업 제출을 별도 구현해야 합니다.

## 상태 확인

`GET /api/creator-intelligence/status`의 `admission` 필드에서 현재 운영 상태를 확인합니다.

```json
{
  "paidRoutesEnabled": true,
  "enforcement": "distributed-upstash",
  "meshJobOwnership": "signed-user-bound-token"
}
```

가능한 `enforcement` 값:

- `distributed-upstash`: 운영 가능한 분산 admission
- `single-instance-local`: 개발 전용 로컬 admission
- `unavailable`: 운영에서 coordination이 없어 유료 경로 비활성

## 배포 순서

1. 유료 기능 플래그를 모두 `false`로 둔 상태로 API 배포
2. Upstash coordination readiness와 key namespace 확인
3. `CREATOR_INTELLIGENCE_JOB_TOKEN_SECRET` 설정
4. `/creator-intelligence/status`에서 `distributed-upstash` 확인
5. 공급자별 sandbox 또는 제한 계정으로 canary 실행
6. 필요한 공급자 플래그만 하나씩 활성화
7. 401·409·429·503 비율과 공급자 비용 대시보드 확인
8. 이상 시 공급자 플래그 또는 master gate를 즉시 `false`로 전환

## 검증 항목

배포 전 최소 검증:

- 인증 없는 모든 유료 요청이 401
- 멱등키 없는 변경 요청이 400
- 같은 멱등키 재사용이 409
- 한도 초과가 429이며 공급자 호출 없음
- Upstash 장애가 503이며 공급자 호출 없음
- Meshy token이 다른 사용자에게 403
- 토큰 위변조·만료가 400
- 브라우저 sessionStorage에 API key와 Runtime token이 남지 않음
- 10MB 초과 3D 입력에서 POST 요청이 발생하지 않음
