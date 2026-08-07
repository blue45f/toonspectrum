# ToonStudio V11 라이선스·배포 조사 (License & Deployment)

- 기준일: 2026-08-07
- 권위 소스: V11 최종 아키텍처 §3.1(하드 게이트)·§11(라이선스와 배포), 배치 매트릭스 CSV 라이선스 컬럼
- 정책 ADR: `docs/adr/0008-license-isolation-policy.md`
- 주의: 이 문서는 엔지니어링 조사이며 법률 자문이 아니다. LGPL·CeCILL 계층의 최종 배포 형태는 법무 검토를 거쳐 확정한다(아키텍처 §11).

## 1. 배포 방식 정의

| 배포 방식 | 정의 | 적용 기준 |
| --- | --- | --- |
| 직접 WASM 번들 | 앱 번들에 WASM/JS로 포함해 메인 스레드·worker에서 직접 로드 | permissive 라이선스 + hot path 필요 |
| Worker 격리 | 별도 Worker에 lazy-load하고 종료로 메모리 회수. 메시지 경계로 결합 최소화 | 대형 번들·격리성 필요·permissive~약한 copyleft 검토 통과분 |
| Local ToonBridge | 사용자 로컬의 별도 프로세스/헬퍼로 실행하고 IPC로 결과만 수신 | copyleft 격리 필요(동적 결합 회피), 오프라인 final 처리 |
| 서버 실행 | ToonStudio 서버에서 실행하고 결과만 전송 | copyleft 격리 대안. 단, 사용자 파일의 서버 전송 여부는 하드 게이트 항목이므로 명시 동의·옵트인 필수 |

공통 원칙(아키텍처 §11):

- permissive 엔진은 browser/worker 직접 통합을 우선한다.
- LGPL/CeCILL/GPL-compatible 계층은 "정적 링크 무조건 금지"가 아니라 **실제 라이선스 의무에 맞는 배포 방식**을 법무 검토로 결정한다.
- 모든 asset·brush·font·3D·AI model은 Rights BOM을 가진다. Provider descriptor는 license/attribution을 필수 선언한다(아키텍처 §2.2).

## 2. 후보별 라이선스 의무와 배포 방식

| Candidate | License | 주요 의무(요지) | 배포 방식 | Copyleft 격리 요구 |
| --- | --- | --- | --- | --- |
| Skia / CanvasKit | BSD 계열 | 저작권 고지·라이선스 사본 유지 | 직접 WASM 번들 (주 Surface이므로 메인 경로) | 없음 |
| Vello Classic / Hybrid / CPU | MIT / Apache-2.0 | 고지 유지, Apache-2.0 특허 조항·NOTICE 반영 | 직접 WASM 번들 (Rust→WASM) | 없음 |
| Kurbo / Peniko / Linebender Color | MIT / Apache-2.0 | 고지 유지 | 직접 WASM 번들 (어댑터 크레이트에 링크) | 없음 |
| Parley + Fontique + HarfRust + Skrifa + ICU4X | permissive (Apache-2.0/MIT/Unicode 계열 혼합) | 고지 유지, ICU/Unicode 데이터 라이선스 고지 포함 | 직접 WASM 번들 | 없음 |
| Glifo | permissive | 고지 유지 | 직접 WASM 번들 (GlyphCacheAdapter 뒤 교체 가능) | 없음 |
| Google Ink | Apache-2.0 | 고지·NOTICE·특허 조항. 공식 웹 SDK가 아니므로 고정 commit·fork 이력 명시 | 직접 WASM 번들 (자체 포팅, 고정 commit) — PoC 게이트 통과 시 | 없음 |
| Perfect Freehand + Lyon | MIT / Apache 계열 | 고지 유지 | 직접 번들 (JS + Rust WASM) | 없음 |
| libmypaint | ISC | 고지 유지 | Worker 격리 (C→WASM 포팅, 메모리 경계 관리 목적의 격리 — 라이선스 제약 아님) | 없음 |
| Hokusai (hokusai-* crates + 사내 studio-hokusai-wasm) | MIT / Apache-2.0 (사내 크레이트도 MIT OR Apache-2.0 이중) | 고지 유지. 사내 크레이트의 LICENSE-MIT/APACHE/UNICODE 동봉 유지 | 직접 WASM 번들 또는 Worker 격리 | 없음 |
| ThorVG | MIT | 고지 유지 | 직접 WASM 번들 또는 Worker 격리 (C++ WASM 크기에 따라) | 없음 |
| vello_svg + Velato | MIT / Apache-2.0 | 고지 유지 | 직접 WASM 번들 (Vello와 동반) | 없음 |
| resvg + tiny-skia | MIT / Apache-2.0 | 고지 유지 | 직접 WASM 번들 (테스트·export 검증은 네이티브 하니스 겸용) | 없음 |
| OpenCV / OpenCV.js | Apache-2.0 | 고지·NOTICE. contrib 모듈별 라이선스 개별 확인 | Worker 격리 + lazy-load (번들 크기 통제 목적) | 없음 |
| libvips / wasm-vips | LGPL-2.1-or-later | **LGPL 의무**: 라이브러리 교체 가능성 보장(재링크 수단 또는 동적 결합), 소스 제공 고지. 의존 코덱(예: 일부 이미지 코덱)의 별도 라이선스 개별 검토 | Worker 격리 (독립 WASM 모듈로 로드해 교체 가능성 확보) — 최종 형태는 법무 검토로 확정 | 부분 — LGPL 의무 이행 구조(독립 모듈·재링크 가능성) 필요. 강한 격리(ToonBridge)까지는 불요 판단이나 법무 확인 전 잠정 |
| G'MIC / libgmic | CeCILL 계열 (CeCILL / CeCILL-C) | 프랑스법 기반 copyleft. CeCILL은 GPL 호환 강한 copyleft, CeCILL-C는 컴포넌트 수준. 브라우저 번들에 직접 혼합 시 앱 전체 파급 위험 | **Local ToonBridge / 격리 Provider / 서버 실행이 기본 후보**(아키텍처 §11). 허용 형태가 법무로 확인되면 WASM 직접 통합도 비교 | **필수** — 프로세스/브리지 경계로 격리. 필터 recipe 결과(이미지)는 자유, 코드 결합만 격리 |
| GEGL | library LGPL, tools GPL | LGPL 라이브러리 의무 + GPL 도구는 사용 금지 경계 명확화. babl 등 의존성 개별 확인 | **Local ToonBridge / 격리 Provider 기본**. 브라우저 직접 통합은 비용·경계 문제로 후순위 | **필수** — GPL 도구 코드가 번들에 유입되지 않도록 빌드 경계 감사 |
| OpenColorIO + LittleCMS + skcms | mixed permissive/LGPL (OCIO BSD 계열, LCMS MIT, skcms BSD 계열 — 배포 전 개별 재확인) | 고지 유지. LGPL 구성요소가 확인되면 libvips와 동일한 교체 가능성 구조 적용 | 직접 WASM 번들 (export/display 경계 모듈) | 구성요소별 확인 — permissive 확인분은 없음 |
| Three.js + three-vrm + three-mesh-bvh | MIT 및 프로젝트별 permissive | 고지 유지 | 직접 번들 (코드 스플리팅·lazy-load) | 없음 |
| Rapier + Jolt + Manifold | permissive 조합 (Apache-2.0 / MIT) | 고지 유지 | Worker 격리 (물리·boolean은 연산 worker) | 없음 |
| WebCodecs | 브라우저 표준 API | 없음 (플랫폼 codec 라이선스는 브라우저 책임) | 해당 없음 (플랫폼 API) | 없음 |
| Mediabunny | permissive (배포 전 확인) | 고지 유지 | 직접 번들 | 없음 |
| FFmpeg | LGPL 기본, 일부 구성 GPL (빌드 구성 의존) | **LGPL 빌드만 사용**(GPL 전용 컴포넌트 배제한 빌드 플래그 고정), 재링크 가능성·소스 고지. codec별 특허/라이선스(예: 특정 비디오 코덱) 별도 검토 | Worker 격리(LGPL 빌드 WASM) 또는 Local ToonBridge/서버 (final batch) | 부분 — LGPL 의무 구조 필수, GPL 구성요소는 빌드에서 원천 배제 |
| Yjs 또는 Loro | permissive (MIT 계열) | 고지 유지 | 직접 번들 | 없음 |
| OPFS + SQLite WASM | 표준 API / SQLite public domain | 없음 | 직접 번들 | 없음 |
| React Aria + Radix + XState | permissive (Apache-2.0 / MIT) | 고지 유지 | 직접 번들 | 없음 |
| Xilem + Masonry | permissive | 고지 유지 | 해당 없음 (연구·네이티브 후보, 웹 배포 없음) | 없음 |
| wgpu / ToonGpuExtensions | wgpu permissive(MIT/Apache-2.0) + 사내 코드 | wgpu 고지 유지, 사내 모듈은 내부 라이선스 정책 | 직접 WASM 번들 | 없음 |
| Krita (코어) | GPL | **상용 웹 번들에 직접 혼합 금지**(아키텍처 §11) | **reference-only** — 포맷/동작 참고와 ToonBridge 경로만. 코드·셰이더·리소스 복사 금지, 동작 관찰·문서 기반 재구현만 허용 | **필수** — 코드 유입 자체를 차단 |

## 3. Copyleft 격리 운영 규칙

1. **격리 경계 = 프로세스/브리지 경계.** G'MIC·GEGL은 Local ToonBridge(로컬 헬퍼 프로세스) 또는 서버 provider로 실행하고, ToonStudio와는 직렬화된 job/result만 교환한다. 브리지 프로토콜은 EffectGraphIR의 부분집합이다.
2. **서버 실행 시 하드 게이트 준수.** 사용자 파일의 서버 전송은 §3.1 하드 게이트 항목이므로 기본 off, 명시 옵트인 + 전송 범위 표시가 필수다.
3. **LGPL 모듈은 교체 가능 구조로.** libvips·FFmpeg(LGPL 빌드)·LGPL 확인 구성요소는 독립 WASM 모듈/Worker로 로드해 사용자가 라이브러리를 교체할 수 있는 구조를 유지하고, 소스 제공 고지를 앱 라이선스 페이지에 포함한다.
4. **빌드 타임 라이선스 스캔.** 매트릭스 검증 게이트의 license scan을 CI에 배선한다 — 번들 산출물에서 GPL/CeCILL 코드 서명·심볼이 검출되면 릴리스 차단.
5. **Rights BOM.** 모든 provider·asset·brush·font·3D·AI model은 provider id, version/commit, license, attribution, 배포 방식을 Rights BOM에 기록한다. 마켓 패키지는 provider/version/license를 고정한다(아키텍처 §5 소재 마켓).
6. **fork 이력 관리.** Google Ink 등 fork·고정 commit 사용 시 upstream commit hash, 로컬 패치 목록, 라이선스 파일 사본을 crate/패키지에 동봉한다(studio-hokusai-wasm의 LICENSE-* 동봉 방식을 표준으로 삼는다).
