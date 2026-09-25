# Studio 3D MCP·CLI 운영 가이드

## 연결 상태

| 공급자 | 공식 자동화 경로 | 로컬 연결 | 무료 생성 판단 | ToonSpectrum 반영 |
|---|---|---|---|---|
| Tripo | 공식 MCP, 공식 Blender add-on, Python SDK/API | Codex·Claude Desktop MCP와 Blender 5.2 add-on 연결 | 결제수단 없는 600-credit API wallet에서 가능 | v3 detailed/PBR 환경 에셋 10종 생성·검수·번들링 |
| Meshy | 공식 `meshy-cli`, 공식 MCP/API | CLI OAuth 연결 완료 | 계정 잔액은 표시되지만 API/CLI task 생성은 free plan에서 `NoMorePendingTasks`로 거부 | 모델 생성·크레딧 소비 없음 |
| Hyper3D/Rodin | API | 연결하지 않음 | 공개 API는 유료 Business 경로라 zero-cost 보장 불가 | 제외 |
| Sloyd | API | 연결하지 않음 | 결제수단과 선불 크레딧이 필요하고 auto-recharge 경로가 있음 | 제외 |
| 3D AI Studio | API | 연결하지 않음 | API 사용 전 선불 구매가 필요함 | 제외 |
| Womp, Masterpiece X | 웹 생성 | 공식 MCP/CLI를 확인하지 못함 | 웹 무료 범위만 존재 | 자동화 연결 제외 |

유료 업그레이드, 카드 등록, 선불 구매, 자동 충전은 수행하지 않는다. 무료 한도가 서버 측에서 거부되면 생성 작업을 중단하고 웹 무료 이용과 API 자동화를 혼동하지 않는다.

## Tripo MCP

공식 소스는 사용자 로컬 도구 디렉터리에 설치하고, 저장소에는 공급자 코드를 복제하지 않는다.

- MCP source: `~/.local/share/toonstudio-tools/tripo-mcp`
- Blender add-on source: `~/.local/share/toonstudio-tools/tripo-blender-addon`
- credential-safe launcher: `~/.local/bin/toonspectrum-tripo-mcp`
- ignored credential: `~/WebstormProjects/toonspectrum/.env.local`의 `TRIPO_API_KEY`
- Blender encrypted credential: Blender 5.2 add-on의 `api_key.enc`

Codex와 Claude Desktop에는 `tripo3d` stdio 서버가 등록되어 있다. 설정 파일에는 키를 직접 넣지 않고 launcher가 mode `0600`인 `.env.local`을 읽는다. launcher 자체는 mode `0700`이다.

연결 확인은 모델을 생성하지 않는 도구 목록 조회로 수행한다. 실제 생성 전에는 공급자 balance를 읽고, 예상 credit cost가 남은 무료 wallet을 넘으면 요청을 보내지 않는다.

## 생성 프로필

MCP Free Environment Pack v1은 다음 프로필을 사용했다.

- provider model: `v3.0-20250812`
- geometry quality: `detailed`
- texture quality: `detailed`
- PBR: enabled
- face ceiling: 40,000
- auto size: enabled
- cost: 50 promotional credits per model
- batch: 12 models, 600 promotional credits total
- payment method: none

생성 결과는 원격 만료 URL에 의존하지 않도록 즉시 로컬 GLB로 내려받는다. 배포 전에 Blender 5.2에서 실제 미터 스케일, 원점, 바닥, 텍스처 크기, 카메라 프리뷰를 정규화하고 glTF-Transform으로 Meshopt와 WebP를 적용한다.

## 배포 자산

경로: `apps/web/public/assets/3d/environments/mcp-free-v1/`

- 동네 버스 정류장
- 한국 학교 정문
- 학교 옥상 계단실
- 골목 포장마차 카트
- 원룸 가구 클러스터
- 아파트 공동현관
- 한옥 안마당 대문
- 편의점 집기 클러스터
- 동네 지구대 외관
- 한강 공원 쉼터

각 GLB는 자체 포함 파일이며 외부 runtime URI가 없다. 최종 파일은 약 0.4–0.6 MiB, 3개의 1024px PBR WebP 텍스처, 40,000개 이하 삼각형, 단일 draw call을 목표로 한다. 960×720 대표 썸네일과 로컬 전·후면 검수 렌더를 사용한다.

## 권리 경계

이 팩은 CC0가 아니다. 생성 시점의 Tripo Terms of Service에 따른 free-user output이며 상업 이용 가능, 비독점, 공급자 권리 보유 조건을 manifest와 GLB root extras에 보존한다. 기존 ToonSpectrum 원본 CC0 팩의 권리를 생성형 공급자 출력에 확장하지 않는다.

- Terms: https://www.tripo3d.ai/terms
- Official MCP: https://github.com/VAST-AI-Research/tripo-mcp
- Official Blender add-on: https://github.com/VAST-AI-Research/tripo-3d-for-blender

## 재현·검증

- Blender normalization and QA: `scripts/blender/process_tripo_mcp_environment_pack_v1.py`
- Manifest builder: `scripts/build_tripo_mcp_environment_manifest_v1.py`
- Runtime and rights regression: `studio-bg3d-environment-mcp-free-v1.test.ts`

검증 항목은 실제 SHA-256, 파일 크기, glTF 2.0 구조, Meshopt/WebP extension topology, embedded image dimensions, mobile budget, 외부 URI 부재, root provenance, billing receipt, rights projection, thumbnail hash를 포함한다.
