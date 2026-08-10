# ToonStudio V11 — text-layout 라이선스·배포 (License & Deployment)

- 기준일: 2026-08-07
- 담당 서브시스템: **text-layout**
- 관련 매트릭스 행: E01, E07, E08
- 상위 정책: 아키텍처 V11 §3.1 (라이선스·안전성 하드 게이트), §11 (라이선스와 배포)

## 0. 결론 요약

- text-layout 후보군은 **전원 permissive 라이선스**다. copyleft(GPL/LGPL/CeCILL) 격리가 필요한 후보가 **없다** — 이 서브시스템에는 Local ToonBridge·서버 실행 경로가 라이선스 사유로는 불필요하다.
- 따라서 아키텍처 §11 첫 원칙("permissive 엔진은 browser/worker 직접 통합을 우선한다")에 따라 **전 후보 직접 WASM 번들 + Worker 격리(성능·메모리 사유)**로 배포한다.
- 라이선스 리스크의 실질 소재는 엔진이 아니라 **폰트**다. 폰트는 Rights BOM으로 별도 관리한다(§4).

## 1. 후보별 라이선스 의무와 배포 방식

| Candidate | License | 주요 의무 | 배포 방식 | Copyleft 격리 |
| --- | --- | --- | --- | --- |
| Skia / CanvasKit (Paragraph 포함) | BSD-3-Clause | 저작권 고지·라이선스 사본 동봉(바이너리 배포 시 NOTICE), 상표 보증 문구 금지 | **직접 WASM 번들** (렌더 코어와 동일 번들 — 텍스트용 추가 배포물 없음. Paragraph 포함 빌드 플래그로 자체 빌드·commit 고정) | 불필요 |
| Parley | MIT OR Apache-2.0 | 고지 동봉. Apache-2.0 선택 시 특허 조항 자동 적용(방어에 유리) | Rust→WASM **별도 모듈, Worker 상주·lazy load** (Phase 1은 벤치 하니스에만 포함, 프로덕션 번들 제외) | 불필요 |
| Fontique | MIT OR Apache-2.0 | 고지 동봉 | Parley 스택 모듈 동봉 | 불필요 |
| HarfRust 0.10.0 | MIT (crate manifest/LICENSE 핀 확인) | 저작권·MIT 고지 동봉 | Parley의 간접 사용과 직접 TTB 세로 셰이핑을 동일 WASM 모듈에 통합 | 불필요 |
| Skrifa (fontations) | MIT OR Apache-2.0 | 고지 동봉 | Parley 스택 모듈 동봉 | 불필요 |
| ICU4X | Unicode License (Unicode-3.0, permissive) | 고지·데이터 파일 라이선스 동봉 | **독립 소형 WASM/데이터 팩** — KinsokuEngine 기반으로 Phase 1부터 프로덕션 포함 가능. datagen으로 필요 로케일(ko/ja/zh + 대상 시장)만 슬라이스해 번들 최소화 | 불필요 |
| Glifo | permissive (매트릭스 E08 기준 — 배포 전 저장소 LICENSE 재확인 필수, 실험적 프로젝트라 라이선스 변동 감시 대상) | 고지 동봉 | Parley 스택 모듈 동봉 (GlyphCacheAdapter 뒤 격리, 프로덕션 기본 비활성) | 불필요 |
| (자체 구현) KinsokuEngine · VerticalTextLayoutIR | internal (사내) | — | 코어 번들 포함. 외부 표준 문서(JIS X 4051·W3C JLREQ/KLREQ)는 규범 참조일 뿐 코드 포함물이 아니므로 라이선스 의무 없음 | 해당 없음 |

### 배포 방식 선택 근거 (아키텍처 §11·§9.1 매핑)

1. **직접 WASM 번들**: CanvasKit·ICU4X — Phase 1 프로덕션 필수 경로. permissive이므로 정적 포함에 제약 없음.
2. **Worker 격리**: Parley 스택 전체 — 라이선스 사유가 아니라 **메모리 회수(Worker 종료)·lazy load·크래시 격리** 사유(§9.1 "대형 WASM Provider는 lazy load하고 Worker 종료로 메모리 회수"). 승격 전에는 벤치 하니스 전용.
3. **Local ToonBridge / 서버**: text-layout에는 **미사용**. (G'MIC·GEGL 같은 copyleft 계층 전용 경로이며 이 서브시스템 후보에는 해당 없음. 단, 서버 사이드 텍스트 렌더가 미래에 필요하면 Vello CPU/resvg 계열 기준선 사상과 동일하게 CanvasKit Software를 서버에서 재사용 — 라이선스 제약 없음.)

## 2. 하드 게이트 점검 (아키텍처 §3.1)

| 게이트 | 판정 |
| --- | --- |
| 상용 배포 가능 여부 | 전 후보 가능 (permissive) |
| 사용자 파일의 서버 전송 여부 | **없음.** 텍스트·폰트 처리 전부 로컬(브라우저/Worker). 사용자 임베드 폰트는 절대 서버로 전송하지 않는다 — 클라우드 백업 시에도 폰트 파일은 사용자 소유 자산으로 암호화 저장·권리 표시 |
| copyleft 격리 요구 | 해당 없음 (§0) |
| codec·asset의 별도 라이선스 | 폰트가 유일한 자산 계층 — §4 Rights BOM으로 관리 |
| 메모리 안전성·sandbox | Rust 후보군(Parley 스택)은 메모리 안전 우위. CanvasKit(C++)은 WASM sandbox 내 실행으로 완화. 전 후보 Worker sandbox 실행 가능 |
| 원본 데이터 손실 가능성 | 없음 — 저장 원본은 TextIR(§2.1), 엔진 객체는 cache. 어떤 Provider 장애도 텍스트 원본을 파괴하지 않음 |

## 3. Provider 선언 의무 (아키텍처 §2.2)

각 text-layout Provider는 다음을 ProviderDescriptor에 고정한다. license scan 게이트(매트릭스 공통 검증 게이트)가 CI에서 검사한다.

```text
canvaskit-adapter(text):
  version/commit: Skia 릴리스 태그 + 자체 빌드 플래그 해시
  license: BSD-3-Clause  attribution: Skia NOTICE 동봉
  supported: paragraph, decoration, placeholder, fallback-chain
  unsupported: vertical-writing, custom-kinsoku(주입식), ruby
  fallback: canvaskit-software → baked-glyph-cache

parley-stack-adapter:
  version/commit: crate lockfile 해시 (parley/fontique/harfrust/skrifa/icu4x 개별 버전 명시)
  license: MIT/Apache-2.0/Unicode 혼합  attribution: 통합 NOTICE 생성(cargo-about 등으로 자동화)
  supported: shaping, line-breaking(BreakPlan 주입), bidi, selection-model
  unsupported: vertical-writing, ruby, renderer(글리프 런까지만)
  maturity: 벤치 후보 (프로덕션 비활성)
  fallback: canvaskit-adapter(text)

icu4x-segmenter:
  version/commit: crate 버전 + 데이터 팩 해시 (로케일 슬라이스 목록 명시)
  license: Unicode-3.0
  supported: uax14-break, uax29-segmentation
  unsupported: jis-x-4051 세분 규칙 (KinsokuEngine이 담당)

glifo-cache:
  maturity: experimental  기본 비활성, GlyphCacheAdapter 뒤 격리
  license: 저장소 LICENSE 재확인 후 기입 (미확인 상태로 프로덕션 포함 금지)
```

## 4. 폰트 Rights BOM (이 서브시스템 최대의 라이선스 리스크)

아키텍처 §11 "모든 asset·brush·font·3D·AI model은 Rights BOM을 가진다"의 텍스트 적용:

1. **번들 폰트**: Noto CJK 등 SIL OFL 1.1 폰트만 기본 번들. OFL 의무 — 폰트 단독 판매 금지(소프트웨어 동봉은 허용), Reserved Font Name 변경 규칙 준수, 라이선스 사본 동봉. 앱 번들에 OFL 전문 포함.
2. **사용자 임포트 폰트**: 프로젝트에 임베드 시 Rights BOM에 `이름/버전/해시/출처/라이선스/임베드 허용 범위` 기록. 임베드 불가 라이선스(일부 상용 폰트) 감지 시 참조-only 모드(해시 참조 + 로컬 존재 시에만 렌더, 협업 상대에게는 대체 폰트 + 경고).
3. **서브셋팅**: export 시 폰트 서브셋 임베드는 해당 폰트 라이선스의 수정·재배포 조항을 따른다. OFL은 서브셋 허용(RFN 규칙 하), 상용 폰트는 기본 비허용으로 두고 라이선스 필드가 명시 허용할 때만 활성.
4. **마켓플레이스**: 소재 마켓의 텍스트 스타일 프리셋이 폰트를 참조할 때, 패키지에 폰트 자체를 넣지 않고 폰트 식별자 + 라이선스 요구를 넣는다(매트릭스 소재 정책 "provider/version/license 고정"과 정합).

## 5. 운영 체크리스트

- [ ] CI license scan: 전 crate/모듈 SPDX 식별자 수집 → 허용 목록(BSD/MIT/Apache-2.0/ISC/Unicode/OFL[폰트]) 외 검출 시 빌드 실패
- [ ] Glifo LICENSE 원문 확인 결과를 이 문서에 반영. HarfRust 0.10.0 MIT 확인은 완료
- [ ] NOTICE/attribution 자동 생성 파이프라인 (cargo-about + JS 의존성 라이선스 수집 통합)
- [ ] ICU4X 데이터 팩 슬라이스 목록과 해시를 릴리스 노트에 기록
- [ ] 폰트 Rights BOM 스키마를 AssetPackageIR/FormatInteropIR과 공유 (아키텍처 §2 IR 계층)
- [ ] 버전 업그레이드 시 라이선스 변경 diff 검사 (특히 실험적 프로젝트 Glifo)

## 6. V12 세로쓰기 품질 하니스의 시스템 글꼴 처리

`tests/benchmarks/results/text-vertical-quality.json`은 두 로컬 시스템 글꼴을 **입력으로만** 썼고
글꼴 파일은 저장소에 복사하지 않았다.

| 용도 | 로컬 경로 | SHA-256 / bytes | 배포 판정 |
| --- | --- | --- | --- |
| Parley/Skrifa WASM CJK shaping | `/System/Library/Fonts/Supplemental/AppleGothic.ttf` | `def69dc2b5e12746049a5dcb189f95341ec460589f47587938567313af3020b1` / 15,255,648B | Apple 시스템 글꼴의 재배포 권리를 주장하지 않음. 하니스가 로컬에서 읽고 PathIR/측정값만 커밋 |
| Chromium 제품 reference | `/System/Library/Fonts/Supplemental/Arial Unicode.ttf` | `876af2cd4854644e7f3e7feb2f688997fdb3343c6df6693611209c9dfb47ccec` / 23,278,008B | Microsoft/Apple 시스템 글꼴의 재배포 권리를 주장하지 않음. 하니스 Vite 서버가 실행 중 메모리 응답으로만 제공; 글꼴 파일 미커밋 |

AppleGothic은 Skrifa에서는 정상 파싱되지만 Chromium의 network `FontFace` OTS 경로에서 거부되어,
제품 reference에는 같은 Mac의 CJK-capable Arial Unicode를 사용했다. 이 차이를 숨기지 않고 raw
artifact에 두 path/hash를 별도 기록한다. 커밋되는 PNG는 측정 증거이며 폰트 바이너리나 재사용
가능한 글리프 atlas가 아니다. 배포 앱의 번들 기본 글꼴 정책은 §4의 OFL 폰트 원칙을 그대로
따르며, 이 로컬 벤치 입력을 제품 번들 후보로 승격하지 않는다.

다른 OS/버전에서 재실행할 때는 `TOON_CJK_FONT`·`TOON_BROWSER_CJK_FONT`로 로컬 설치 글꼴을
주입하고 path/SHA/size를 새 artifact에 기록해야 한다. 해시가 달라진 결과를 기존 reference와
동일 환경 결과로 간주하면 안 된다.
