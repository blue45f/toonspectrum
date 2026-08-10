# renderer-2d 라이선스·배포 (License & Deployment)

- 담당 서브시스템: **renderer-2d** (E01~E06, E08, E13~E15, E28)
- 상위 정책: V11 §3.1 라이선스·안전성 하드 게이트, §11 라이선스와 배포
- 원칙: permissive 엔진은 browser/worker 직접 통합 우선. copyleft 계층은 실제 라이선스 의무에 맞는 배포 방식을 법무 검토로 결정. 모든 asset은 Rights BOM 보유.

## 1. 배포 방식 분류

| 방식 | 정의 | 적용 조건 |
| --- | --- | --- |
| 직접 WASM 번들 | 앱 번들에 WASM/JS로 포함, 메인 스레드 또는 Worker에서 로드 | permissive 라이선스 + 번들 예산 내 |
| Worker 격리 | 전용 Worker에 lazy load, 종료로 메모리 회수 | 대형 WASM·크래시 격리 필요 엔진 (V11 §9.1) |
| Local ToonBridge | 로컬 브릿지 프로세스에서 실행, 앱 번들과 프로세스 분리 | copyleft 의무 격리 또는 브라우저 통합 비용 과다 시 (V11 §11) |
| 서버 실행 | 서버측 Provider로 실행, 사용자 파일 전송 동의 필요 | 로컬 실행 불가 시 최후 수단. 파일 전송 여부는 하드 게이트 항목 (V11 §3.1) |

renderer-2d 후보는 **전원 permissive 계열**이므로 Local ToonBridge·서버 실행이 필요한 엔진이 없다. copyleft 격리 요구는 renderer-2d 범위 밖(libvips LGPL, G'MIC CeCILL, GEGL LGPL/GPL — filter/export 서브시스템 담당)에서 발생한다.

## 2. 후보별 라이선스 의무와 배포 방식

| 후보 (행) | License | 주요 의무 | 배포 방식 | 비고 |
| --- | --- | --- | --- | --- |
| CanvasKit / Skia (E01) | BSD 계열 | 저작권 고지·라이선스 사본 동봉. 소스 공개 의무 없음 | **직접 WASM 번들** (1차 실코드). 전용 Worker 상주 옵션 포함 | 서드파티 폰트·ICU 데이터 등 동봉 리소스의 개별 고지 포함 여부 확인 |
| Vello Classic (E02) | MIT / Apache-2.0 (듀얼) | 고지·NOTICE 유지(Apache-2.0 선택 시 특허 조항 포함) | 승격 시 직접 WASM 번들 + Worker | 알파 상태이므로 commit 고정·버전 표기 필수 |
| Vello Hybrid (E03) | MIT / Apache-2.0 | 동일 | 승격 시 직접 WASM 번들 + Worker | Classic과 동일 저장소 궤도 |
| vello_cpu (E04) | MIT / Apache-2.0 | 동일 | **wasm-pack 산출물을 Worker 격리 lazy load** (1차 실코드). 0.2.0 버전·hash 고정 | GPU 초기화 불필요 — 복구·export 경로에 안전 |
| Kurbo (E05) | MIT / Apache-2.0 | 동일 | 직접 번들 (Rust adapter crate에 정적 포함) | 렌더러 아님 — IR 어댑터의 일부 |
| Peniko + Linebender Color (E06) | MIT / Apache-2.0 | 동일 | 직접 번들 (adapter crate 포함) | 동일 |
| Glifo (E08) | permissive | 고지 유지 | 승격 시 GlyphCacheAdapter 뒤 Worker lazy load | 실험적 — 교체 가능 인터페이스 뒤에서만 |
| ThorVG (E13) | MIT | 고지 유지 | 승격 시 별도 WASM 번들, **Worker 격리 lazy load** | C++→WASM 번들 크기·크래시 격리 목적 |
| vello_svg + Velato (E14) | MIT / Apache-2.0 | 고지 유지 | Vello 승격 시 Vello 번들에 동반 | 단독 배포 없음 |
| resvg + tiny-skia (E15) | MIT / Apache-2.0 | 고지 유지 | **테스트·CI native 실행 우선** (1차: 하니스 자산). 런타임 SVG import preview에 쓰일 경우 Worker WASM | 프로덕션 상시 상주 아님 |
| wgpu / WebGPU + ToonGpuExtensions (E28) | wgpu: MIT/Apache-2.0, ToonGpuExtensions: internal | wgpu 고지 유지. 자체 코드는 내부 소유 | 앱 코어에 직접 포함 (얇은 pass) | WGSL 셰이더도 내부 자산으로 Rights BOM 등록 |

## 3. copyleft 격리 요구 (renderer-2d 관점)

1. **renderer-2d 직접 후보에는 copyleft가 없다.** E01~E06, E08, E13~E15, E28 전원이 BSD/MIT/Apache-2.0/ISC 계열 permissive이므로 직접 WASM 번들·정적 링크가 라이선스상 허용된다.
2. **경계 주의 지점**은 renderer-2d가 다른 서브시스템의 copyleft Provider와 결합하는 island 경계다.
   - libvips(LGPL-2.1-or-later, E17)·GEGL(LGPL/GPL, E19)·G'MIC(CeCILL, E18)의 결과물은 **이미지/타일 데이터로만** 수신한다. renderer-2d 번들과 이들 라이브러리를 한 링크 단위로 묶지 않는다.
   - 이들의 배포 형태(별도 WASM 모듈 동적 로드, Local ToonBridge, 서버)는 해당 서브시스템 문서와 법무 검토가 결정하며, renderer-2d는 어떤 형태든 동일한 island 인터페이스(ImageBitmap/타일 버퍼)로 수용한다.
3. **Krita GPL 코어**는 V11 §11에 따라 상용 웹 번들에 혼합하지 않는다. renderer-2d는 Krita를 format/behavior reference로만 참조한다.
4. 격리 검증: license scan(검증 게이트 공통 항목)에 "renderer-2d 번들 의존성 그래프에 copyleft 부재" 자동 검사를 포함한다.

## 4. 고지·BOM 운영

- 앱 내 오픈소스 고지 화면과 배포 아티팩트에 각 엔진의 LICENSE/NOTICE 사본을 포함한다 (Apache-2.0 NOTICE 파일 존재 시 원문 유지).
- ProviderDescriptor(V11 §2.2)의 `license / attribution / version / commit` 필드를 빌드 시 자동 수집해 Rights BOM을 생성한다.
- 엔진 버전 업 시 라이선스 변경 여부를 diff로 확인한다(듀얼 라이선스의 선택 명시: Vello 계열은 **Apache-2.0 선택**을 기본으로 통일해 특허 조항을 확보).
- 사용자 파일의 서버 전송 여부(V11 §3.1 하드 게이트): renderer-2d의 모든 1차 경로(CanvasKit, vello_cpu)는 **완전 로컬 실행**이며 서버 전송이 없음을 명시한다.

## 5. 배포 체크리스트 (1차 구현)

- [ ] CanvasKit WASM 번들: 버전 고정, brotli 크기 실측 기록, LICENSE 동봉
- [ ] vello_cpu 0.2.0: wasm-pack 산출물 hash 고정, Worker lazy load, Apache-2.0 NOTICE 동봉
- [ ] Kurbo·Peniko adapter crate: Cargo 의존성 라이선스 자동 스캔 통과
- [ ] resvg+tiny-skia: CI 전용 의존으로 분류(프로덕션 번들 미포함 확인)
- [ ] ToonGpuExtensions: 내부 코드 저작권 표기, wgpu 고지 포함
- [ ] license scan CI 게이트: copyleft 부재 검사 + 신규 의존성 라이선스 리뷰 필수화
- [ ] 오픈소스 고지 화면에 renderer-2d 전 엔진 반영
