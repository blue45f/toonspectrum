# ToonStudio V11 — stroke-brush 라이선스·배포 (license & deployment)

- 기준일: 2026-08-07
- 상위 정책: V11 §3.1(라이선스·안전성 하드 게이트), §11(라이선스와 배포)
- 원칙: permissive 엔진은 browser/worker 직접 통합 우선. 사용자 파일은 서버로 보내지 않는다.

## 1. 후보별 라이선스 의무와 배포 방식

| Candidate | License | 주요 의무 | 배포 방식 | 비고 |
| --- | --- | --- | --- | --- |
| Perfect Freehand 1.2.3 | MIT | 저작권·라이선스 고지 유지(THIRD-PARTY NOTICES 포함) | **직접 JS 번들** — 이미 리포 의존성. 순수 함수라 Worker 이전도 자유 | 버전 고정(1.2.3) 유지, 업그레이드는 golden 재검증 후 |
| Google Ink | Apache-2.0 | LICENSE·NOTICE 파일 동봉, 수정 사실 표기(포팅 패치 명시), 특허 허여 조항 준수 | **직접 WASM 번들 + 전용 Worker 격리** — lazy-load, 고정 commit 빌드. 서버 실행 불필요 | 공식 웹 SDK가 아니므로 우리 포팅 계층도 NOTICE에 기록. crash 격리는 라이선스가 아니라 안정성 사유 |
| Kurbo | MIT / Apache-2.0 (dual) | 둘 중 택일 고지(Apache 선택 시 NOTICE) | **직접 WASM 번들** — project-model/vello-adapter crate에 정적 링크 | Rust dual license는 정적 링크 제약 없음 |
| Lyon | MIT / Apache-2.0 (dual) | 상동 | **직접 WASM 번들**(탑재 결정 시) — Vello adapter와 동일 산출물 | 미탑재 결정 시 이 행 삭제 |
| Skia PathOps (outline 정리용) | BSD 계열 (E01) | 고지 유지 | **직접 WASM 번들** — CanvasKit 산출물에 이미 포함, 별도 추가 없음 | 신규 라이선스 표면 없음 |
| Clipper2 (boolean 보완, 선택) | Boost Software License 1.0 | 소스 배포 시 고지(바이너리 배포는 고지 의무 없음이나 정책상 동봉) | **직접 WASM 번들**(채택 시) | PathOps로 충분하면 미탑재 |
| 커스텀 입력 파이프라인·스태빌라이저 | internal (proprietary) | 없음 — 외부 코드 유입 시 즉시 Rights BOM 등재 | 앱 코어 번들 | CSP 등 타사 구현의 역설계·코드 참조 금지, 공개 문헌·특허 회피 검토는 법무 확인 |
| ToonGpuExtensions | internal + wgpu (MIT / Apache-2.0) | wgpu 고지 | 앱 코어 번들(WGSL 모듈) | Vello adapter와 wgpu 컨텍스트 공유 |

## 2. copyleft 격리 요구

**stroke-brush 서브시스템의 채택·후보 스택에는 copyleft 구성요소가 없다.** 전 후보가 MIT / Apache-2.0 / BSD / BSL 계열 permissive이므로:

- Local ToonBridge·서버 프록시·프로세스 격리 같은 **라이선스 사유의 격리는 불필요**하다 (G'MIC/GEGL/libvips가 요구하는 격리는 filter/export 서브시스템 소관 — E17·E18·E19).
- Google Ink의 전용 Worker 격리는 **안정성·메모리 회수 사유**(V11 §9.1 lazy load + Worker 종료 회수)이지 라이선스 요구가 아니다. 문서·코드 주석에 사유를 혼동해 적지 않는다.
- 인접 경계 주의: 자연매체 쪽 libmypaint는 ISC(permissive)라 copyleft 아님 — stroke-brush가 natural-media Provider와 조합될 때도 새로운 copyleft 표면은 생기지 않는다. 단, MyPaint **브러시 프리셋(.myb) 자산**은 코드와 별개의 라이선스이므로 Rights BOM으로 개별 추적한다(V11 §11 asset 조항).

## 3. 배포 체크리스트

1. **THIRD-PARTY NOTICES**: perfect-freehand(MIT), Google Ink(Apache-2.0 + NOTICE), Kurbo/Lyon/wgpu(dual), CanvasKit(BSD) 항목을 빌드 시 자동 생성 목록에 포함하고 license scan CI(매트릭스 검증 게이트 공통 항목)로 검증한다.
2. **고정 버전/commit**: perfect-freehand 1.2.3, Google Ink 고정 commit, Rust crate lockfile — Provider descriptor의 `version / commit` 선언(V11 §2.2)과 일치해야 한다.
3. **Rights BOM**: 각 브러시 프리셋에 provider·version·source app·original payload·license·calibration profile을 기록한다(V11 §6.4). 마켓 유입 프리셋은 서명 패키지에 license 고정.
4. **사용자 데이터 경계**: 입력 트레이스(InputIR)는 생체 특성에 준하는 필적 데이터이므로 로컬(OPFS) 저장이 기본이고, cloud backup·협업 동기화 시 명시 동의 하에만 전송한다. 벤치마크 corpus로 쓰는 실사용자 트레이스는 수집 동의·익명화를 거친다.
5. **WASM 산출물 분리**: Google Ink WASM은 코어 번들과 분리된 청크로 배포하고(lazy-load), PoC 게이트 통과 전에는 프로덕션 번들에 포함하지 않는다.
6. **폴백 보장**: 어떤 배포 구성(WebGPU 미지원, Worker 불가, Google Ink 미탑재)에서도 PerfectFreehandProvider 경로만으로 전체 기능이 동작함을 릴리스 게이트로 확인한다 — 라이선스·번들 구성이 기능 가용성을 좌우하지 않게 한다.

## 4. 법무 확인 필요 항목 (미결)

1. Google Ink 포팅 패치의 Apache-2.0 §4(수정 표기) 이행 형식 — NOTICE 추가 문안.
2. 커스텀 스태빌라이저 관련 타사 특허(스타일러스 지연 보정 계열) 저촉 여부 스크리닝.
3. 실사용자 입력 트레이스의 corpus 편입 동의 문안(개인정보 처리방침 연동).
