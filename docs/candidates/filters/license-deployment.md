# Filters 서브시스템 — 라이선스·배포 (License & Deployment)

- 기준일: 2026-08-07
- 권위 소스: V11 최종 아키텍처 §3.1(하드 게이트)·§11(라이선스와 배포), 배치매트릭스 E01·E16~E20 라이선스 열
- 원칙: permissive는 직접 통합 우선, LGPL 계층은 "정적 링크 무조건 금지"가 아니라 **실제 의무에 맞는 배포 방식을 법무 검토로 확정**, copyleft(G'MIC·GEGL)는 격리 Provider/bridge가 기본(V11 §11).
- 본 문서는 엔지니어링 관점의 정리이며 최종 판단은 법무 검토를 거친다. 라이선스 표기는 배치매트릭스 기재를 1차 기준으로 하고, 컴포넌트별 재확인 항목을 명시한다.

## 1. 배포 방식 4단계

```text
A. 직접 WASM 번들     — 메인 앱 번들 또는 동일 오리진 chunk로 포함. permissive 전용.
B. Worker 격리        — 별도 WASM 파일 + 전용 Worker. lazy-load·메모리 회수·교체 가능성 확보.
C. Local ToonBridge   — 로컬 별도 프로세스(데스크톱 헬퍼)와 IPC. 프로세스 경계 = 라이선스 경계.
D. 서버 Provider      — 원격 실행. 사용자 파일 전송이 발생하므로 §3.1 하드 게이트(동의·정책) 추가 적용.
```

## 2. 후보별 의무와 배포 방식

| Candidate | License (매트릭스 기준) | 주요 의무 | 배포 방식 | 격리 요구 |
| --- | --- | --- | --- | --- |
| CanvasKit / Skia (E01) | BSD 계열 | 저작권 고지·라이선스 사본 동봉 | **A. 직접 WASM 번들** (주 렌더 코어로 이미 포함) | 없음 |
| OpenCV / OpenCV.js (E16) | Apache-2.0 | 고지·NOTICE 동봉, 수정 시 변경 명시 | **B. Worker 격리** (custom build, lazy-load) — 라이선스상 A도 가능하나 크기·메모리 회수 때문에 B 선택 | 없음 (성능 격리만) |
| libvips / wasm-vips (E17) | LGPL-2.1-or-later | LGPL 의무: 소스 제공(또는 링크), 사용자가 라이브러리를 교체·재링크할 수 있어야 함, 고지 | **B. Worker 격리** — 앱 코드와 정적으로 합치지 않고 **별도 WASM 파일**로 배포해 교체 가능성을 구조로 입증. wasm-vips 빌드에 포함되는 서브 라이브러리·코덱별 라이선스 목록을 별도 감사(매트릭스 E17 위험 항목) | 부분 — 파일 경계 분리 + 재링크 가능 구조. 법무 검토로 충분성 확정 |
| G'MIC / libgmic (E18) | CeCILL 계열 (코어와 부속의 라이선스 구분 존재 — 컴포넌트별 재확인 필요) | CeCILL은 GPL 호환 copyleft 계열 — 결합 저작물 범위 해석이 배포 방식을 좌우 | **C. Local ToonBridge 기본, D. 서버 대안** (V11 §11 명시). 허용 형태가 법무로 확인되면 WASM 직접 통합(B)도 벤치마크 비교 대상에 추가 | **필수** — 프로세스/서비스 경계로 앱 본체와 분리. 통신은 중립 IPC 계약(타일·recipe 문자열)만 |
| GEGL (E19) | library LGPL, tools GPL | 라이브러리는 LGPL 의무(교체 가능성·소스), GPL 도구는 번들 결합 금지 | **C. bridge / D. 서버 기본** (매트릭스 E19 자체 위험 항목: "bridge/provider 격리를 기본으로"). glib 의존성 때문에 B(WASM)는 비표준 경로 — 시도 시 별도 타당성 검토 | **필수** — GPL 도구 계열은 어떤 형태로도 웹 번들에 혼합하지 않음. LGPL 라이브러리도 bridge 경계 유지 |
| OCIO + LittleCMS + skcms (E20) | mixed permissive/LGPL (매트릭스 기재 — 컴포넌트별 재확인: OCIO는 ASWF permissive 계열, skcms는 Skia 동반, LittleCMS 버전별 조건 확인) | 고지 동봉. 재확인 결과 LGPL 컴포넌트가 확인되면 해당 컴포넌트만 파일 분리 | **A/B 혼합** — skcms는 CanvasKit에 동반(A), LCMS·OCIO는 export Worker(B)에 배치 | 조건부 — 재확인 결과에 따름 |

## 3. Copyleft 격리 설계 (G'MIC·GEGL 공통)

1. **경계 = 프로세스**: 격리 Provider는 앱 주소 공간에 로드하지 않는다. Local ToonBridge(로컬 헬퍼 프로세스) 또는 서버 프로세스로만 실행한다.
2. **중립 IPC 계약**: 경계를 넘는 것은 타일 픽셀(표준 포맷), recipe/chain 문자열, 파라미터, 진행률·취소 신호뿐이다. 격리 엔진의 헤더·구조체·링크 심볼이 앱 본체 코드에 등장하지 않는다 — 파생 저작물 논거를 구조적으로 차단한다.
3. **선택적 설치**: ToonBridge는 별도 다운로드·별도 고지·자체 라이선스 문서를 가진 독립 배포물로 제공한다. 미설치 시 앱은 폴백 체인(`hybrid-design.md` §4)대로 동작한다 — copyleft 컴포넌트가 앱 필수 구성요소가 아님을 유지한다.
4. **서버 실행 시 추가 게이트**: 사용자 파일의 서버 전송은 V11 §3.1 하드 게이트 항목이다. 명시적 동의, 전송 데이터 최소화(ROI 타일만), 보존 정책 고지 없이 D 방식을 켜지 않는다.
5. **소스 제공 의무 이행**: 격리 Provider로 배포하는 G'MIC/GEGL 바이너리는 대응 소스(또는 저장소 커밋 참조)와 빌드 스크립트를 공개 채널에 상시 제공한다.

## 4. Rights BOM·Provider Manifest 연동

- 모든 Provider는 manifest에 `license / attribution / version / commit`을 선언한다(V11 §2.2). 필터 서브시스템은 여기에 **배포 방식(A/B/C/D)과 격리 등급**을 추가 필드로 기록한다.
- G'MIC recipe·GEGL chain을 포함한 marketplace 패키지는 Rights BOM에 provider·version·license를 고정한다(V11 §5 소재 마켓 행). recipe 원저작자의 라이선스(예: 커뮤니티 필터 스크립트)도 별도 항목으로 수집한다.
- CI 게이트: 매트릭스 공통 검증 게이트의 `license scan`을 필터 서브시스템 빌드에 상설화한다 — (a) 번들 A/B에 copyleft 코드 혼입 0건, (b) NOTICE/고지 파일 자동 집계, (c) wasm-vips 서브 의존성 라이선스 목록 diff 감시.

## 5. 결정 대기 항목 (법무 검토 큐)

1. wasm-vips Worker 분리 배포가 LGPL-2.1 재링크 요건을 충족하는 형태인지 — 충족 확인 시 B 확정, 미충족 시 C로 강등.
2. G'MIC 코어/부속 라이선스 구분에 따른 WASM 직접 통합(B) 허용 여부 — 허용 시 B를 벤치마크 비교(ToonBridge 왕복 비용 vs 번들 비용)에 추가.
3. LittleCMS·OCIO 현행 버전의 라이선스 최종 확인(매트릭스 "mixed permissive/LGPL" 표기의 해소) 및 LGPL 컴포넌트 존재 시 파일 분리 범위.
4. 서버 Provider(D) 운영 시 지역별 데이터 이전·보존 규정 검토(창작물 = 사용자 저작물).
