# ToonStudio V11 — text-layout 하이브리드 설계 (Hybrid Design)

- 기준일: 2026-08-07
- 담당 서브시스템: **text-layout**
- 관련 매트릭스 행: E01, E07, E08
- 상위 원칙: 검증 엔진 우선 평가 → 장점별 하이브리드 조합 → 증거 기반 선택적 자체 구현 (아키텍처 V11 §0)

## 0. 설계 요약

- **Phase 1: 텍스트는 CanvasKit Paragraph 단일 기준선.** vello 어댑터는 CapabilityRegistry에 `text: unsupported`로 등록되고, HybridExecutionPlanner는 텍스트가 포함된 island를 CanvasKit Surface로 라우팅한다.
- **후속 단계: Parley 스택(Parley + Fontique + HarfRust + Skrifa + ICU4X)을 후보 레이아웃 경로로 병행 탑재**하고, CanvasKit Paragraph를 기준선·폴백으로 유지한 채 벤치 게이트 통과 시 승격한다(매트릭스 E07 "Parley 레이아웃을 Vello/Glifo로 실시간 렌더하고 CanvasKit Paragraph를 기준선·폴백으로 사용한다").
- **세로쓰기·금칙은 엔진이 아니라 제품 계층(KinsokuEngine, VerticalTextLayoutIR)이 소유**한다. 어떤 레이아웃 엔진 위에서도 동작하도록 엔진 중립 IR로 설계한다.

## 1. 단계별 파이프라인 (입력 → 처리 → 렌더 → 출력)

```text
[입력]
TextIR (아키텍처 §2: PathIR/ShapeIR/TextIR 계층의 일부)
├─ rich text 런: 문자열 + 스타일 스팬(폰트 패밀리·크기·자간·행간·색·데코레이션)
├─ 언어·스크립트 태그, writing-mode(horizontal | vertical), 정렬·오버플로 정책
├─ 컨테이너 제약: 말풍선 내부 영역(ShapeIR 참조), 최대 폭/높이, 자동 줄바꿈 여부
└─ 폰트 참조: 프로젝트 폰트 잠금 목록(Rights BOM에 고정, 시스템 폰트 비의존)
        │
        ▼
[처리 1 — 정규화·분석]  (엔진 중립, 순수 함수)
├─ Unicode 정규화(NFC), 스크립트 런 분할, bidi 준비
├─ ICU4X segmenter: UAX #14 줄바꿈 후보(break opportunity) 산출
└─ KinsokuEngine: JIS X 4051/KLREQ 기반 커스텀 금칙 테이블로 후보 필터링·가중치 부여
   → 산출물: 엔진 중립 BreakPlan (어느 레이아웃 엔진에도 주입 가능)
        │
        ▼
[처리 2 — 레이아웃]  (Provider 선택 지점)
├─ 기본 경로(Phase 1): CanvasKit Paragraph
│   ParagraphBuilder에 스타일 런 투입 → BreakPlan은 허용 지점에 U+200B 삽입/치환 등
│   builder 전처리로 반영(Paragraph가 커스텀 breaker 주입을 제한하므로 전처리 방식)
├─ 후보 경로(벤치 전용 → 승격 시 활성): Parley 스택
│   Fontique 폰트 해석 → HarfRust 셰이핑 → Parley 줄 배치(BreakPlan 직접 주입) → 글리프 런
└─ 세로쓰기 경로(제품 확장): VerticalTextLayoutIR
    글리프 단위 세로 배치·약물 회전·縦中横 → 셰이핑은 HarfRust(vert/vrt2 feature) 또는
    CanvasKit 글리프 API 재사용, 줄(=세로 행) 나눔은 동일 BreakPlan 사용
        │
        ▼
[처리 3 — 줄 조정]  (제품 계층)
└─ KinsokuEngine 후처리: 행말 매달림(ぶら下がり)·추입/추출(오이코미/오이다시)·
   말풍선 형상 맞춤(줄별 가용 폭 재질의) → 최종 배치 확정
        │
        ▼
[렌더]  (island 소유권 §3 참조)
├─ Phase 1: CanvasKit Surface가 Paragraph를 직접 페인트 (레이아웃=렌더 동일 엔진, 무복사)
├─ 승격 후: Parley 글리프 런 → Glifo atlas(GlyphCacheAdapter 뒤 격리) → Vello 렌더,
│   CanvasKit Paragraph 결과와 상시 cross-diff
└─ Vello 벡터 장면(말풍선 외곽·꼬리·효과선)과의 합성은 §3의 두 가지 병합 전략을 따름
        │
        ▼
[출력]
├─ Preview: 화면 Surface에 직접 (아래 §2)
├─ Final/Export: 동일 레이아웃 엔진·동일 버전·동일 폰트로 재실행(WYSIWYG 보장),
│   libvips 대형 출력 파이프라인에는 래스터화된 텍스트 island로 전달
└─ Golden: CanvasKit Software(CPU) 렌더를 결정적 기준 이미지로 기록 (E04·E15와 같은
    "필수 기준선" 사상 — 텍스트의 CPU 기준은 CanvasKit Software가 담당)
```

핵심 불변식 (아키텍처 §2.1): **저장 원본은 TextIR + BreakPlan 파라미터이며, Paragraph 객체·글리프 런·atlas는 전부 재생성 가능한 cache다.** 어떤 엔진 객체도 프로젝트 파일에 직렬화하지 않는다.

## 2. Preview / Final 분리

| 구분 | Preview (편집 중) | Final (출력·검증) |
| --- | --- | --- |
| Phase 1 소유자 | CanvasKit Paragraph (GPU Surface) | CanvasKit Paragraph — GPU 렌더 + CanvasKit Software(CPU) golden 기록 |
| 승격 후 소유자 | Parley + Glifo/Vello (실시간) | CanvasKit Paragraph 기준 검증 diff를 통과한 결과만 출력. 불일치 시 Final은 CanvasKit으로 강제 |
| 재레이아웃 정책 | 편집 중인 문단만 증분 재레이아웃. 캐럿·선택 오버레이는 레이아웃 결과의 캐시된 cluster 맵 사용 | 문서 전체 재레이아웃 후 export. 폰트·엔진 버전 핀 고정 |
| 금칙 | BreakPlan은 Preview·Final이 **동일 산출물을 공유** — 미리보기와 출력의 줄바꿈이 달라지는 것을 원천 차단 | 동일 |
| 성능 게이트 | 아키텍처 §9.3의 입력→첫 preview p50 4ms/p95 8ms 목표를 텍스트 편집(키 입력→재레이아웃→페인트)에도 적용 | export 시간은 대형 출력 게이트(libvips 파이프라인)에서 관리 |

WYSIWYG 원칙: **텍스트만큼은 Preview와 Final이 항상 같은 레이아웃 엔진을 사용한다.** 다른 서브시스템처럼 "저품질 proxy → 고품질 final" 이원화를 하면 줄바꿈이 달라져 말풍선 조판이 깨지므로, 텍스트의 Preview/Final 분리는 품질 이원화가 아니라 **검증 이원화**(GPU 실화면 vs CPU golden, 후보 엔진 vs 기준 엔진)로만 운용한다.

## 3. Island 소유권

아키텍처 §1.1 "한 Surface 또는 큰 Island에 주 소유자 하나" 원칙의 텍스트 적용:

1. **텍스트 island의 주 소유자는 CanvasKit이다(Phase 1 고정).**
   - CapabilityRegistry 선언: `canvaskit-adapter: { text: { paragraph: supported, vertical: unsupported } }`, `vello-adapter: { text: unsupported }`.
   - RenderIslandCompiler는 TextIR이 포함된 서브트리를 만나면 해당 island 전체를 CanvasKit으로 컴파일한다. Vello가 주 소유자인 벡터 장면 안에 텍스트가 있으면 planner가 island 경계를 재분할한다.
2. **말풍선 = 벡터(외곽·꼬리) + 텍스트(내용)의 합성 문제.** 두 병합 전략을 문서·장면별로 선택한다(복사 비용 사다리 §9.2 준수).
   - **전략 A — 텍스트 우세 장면:** 말풍선 벡터까지 CanvasKit island로 흡수(CanvasKit은 Path·Paint도 지원, E01). island 수 최소화. 대사가 많은 일반 웹툰 페이지의 기본값.
   - **전략 B — 벡터 우세 장면:** Vello가 말풍선·효과선 장면을 소유하고, CanvasKit이 렌더한 텍스트 블록을 texture island로 Vello 장면에 배치(매트릭스 E01 "Vello 벡터 아일랜드…를 이미지/텍스처로 받아 최종 합성"의 역방향 적용). 효과선·가이드가 지배적인 장면에서 사용. GPU texture 공유 → ImageBitmap → readback 순의 복사 비용 사다리를 지키고, hot path readback은 금지.
3. **선택·캐럿·IME 조성 오버레이:** 텍스트 island 소유자(CanvasKit)가 cluster/caret 지오메트리를 산출하고, 오버레이 그리기는 해당 Surface의 주 소유자가 담당한다. 소유자가 다른 엔진 간에 캐럿 지오메트리만 넘기고 픽셀은 넘기지 않는다.
4. **승격 이후:** Parley 스택이 주력이 되면 텍스트 island 소유자는 "Parley 레이아웃 + Vello/Glifo 렌더" 조합으로 바뀌되, island 경계 규칙 자체는 동일하다. CanvasKit은 기준 검증·폴백 소유자로 남는다.

## 4. 세로쓰기·금칙 확장의 소유권 (엔진 중립 제품 계층)

capability-survey.md §3에서 확인한 대로 세로쓰기·금칙은 모든 후보의 공백이다. 따라서:

```text
KinsokuEngine (제품 소유, Rust crate, 엔진 중립)
├─ 입력: ICU4X UAX #14 break opportunity + 문자 클래스
├─ 규칙: JIS X 4051 / W3C JLREQ·KLREQ 기반 금칙 테이블(행두 금칙·행말 금칙·분리 금지)
│         + 작품/언어별 오버라이드(사용자 정의 금칙 문자 집합)
├─ 출력: BreakPlan (허용/금지/패널티 가중 break 지점)
└─ 후처리: 행말 매달림·추입/추출 — 줄 확정 후 조정 단계

VerticalTextLayoutIR (제품 소유)
├─ 세로 행 배치(우→좌 행 진행), 글리프 회전 규칙(약물·라틴 회전, 縦中横)
├─ 셰이핑 재사용: HarfRust vert/vrt2/vpal feature 경로 우선, CanvasKit 글리프 API 폴백
└─ 렌더 재사용: 배치가 끝난 글리프를 positioned-glyph 목록으로 CanvasKit/Vello에 전달
```

이 두 계층은 아키텍처 §3.3 조건(기존 엔진에 없는 기능)에 근거한 **증거 기반 자체 구현**이며, 특정 레이아웃 엔진에 결합하지 않으므로 Parley 승격 여부와 독립적으로 자산이 유지된다.

## 5. 폴백 체인

```text
[레이아웃 폴백]
Parley 스택 (승격 후 주력)
  → CanvasKit Paragraph (기준선·상시 폴백 — Phase 1에서는 이것이 1순위)
    → CanvasKit Software 백엔드 (GPU context loss·WebGPU/WebGL 불가 환경)
      → 최후 복구: 마지막 정상 레이아웃의 bake된 글리프 위치 캐시 + CPU 래스터
        (CommandJournal/RecoveryIR로 TextIR은 항상 보존되므로 데이터 손실 없음)

[세로쓰기 폴백]
VerticalTextLayoutIR + HarfRust vert feature
  → VerticalTextLayoutIR + CanvasKit 글리프 API (회전 배치 폴백)
    → 가로쓰기 강제 전환 + 사용자 고지 (기능 저하 모드, 문서 저장은 세로쓰기 의도 유지)

[금칙 폴백]
KinsokuEngine (커스텀 테이블)
  → ICU4X UAX #14 기본 규칙만 적용
    → 엔진 내장 breaker (CanvasKit ICU) — 최소 보장선

[폰트 폴백]
프로젝트 잠금 폰트 (Rights BOM 고정)
  → Fontique/CanvasKit 폴백 체인 (스크립트 매칭)
    → 번들 Noto 서브셋 (최후 보장 — 두부(tofu) 방지)
      → .notdef 렌더 + 결손 글리프 진단 리포트

[Glifo 폴백]
GlyphCacheAdapter[Glifo]
  → GlyphCacheAdapter[내장 단순 atlas]  (Glifo는 실험적 — 매트릭스 E08 지침대로 어댑터 뒤 격리)
```

폴백 발동은 전부 CapabilityRegistry·ProviderBenchmarkRegistry의 선언·계측에 근거해 planner가 수행하며, 폴백 시에도 BreakPlan·TextIR은 동일하므로 **줄바꿈 의미는 폴백 체인 어디서든 보존**된다(비파괴 의미 보존 — 아키텍처 §3.3 조건 4의 예방 설계).

## 6. 단계별 도입 계획 (아키텍처 §13과 정렬)

| Phase | text-layout 작업 |
| --- | --- |
| Phase 0 | 텍스트 corpus 구축(benchmark-plan.md §1), CanvasKit Paragraph·Parley 스택 하니스 탑재, capability 선언 초안 |
| Phase 1 | CanvasKit Paragraph 기준선 가동. vello 어댑터 `text: unsupported` 등록 → planner 라우팅 검증. Parley text는 하니스 전용(아키텍처 Phase 1 "Parley text와 Kurbo path"는 벤치 기준 수립 맥락) |
| Phase 2~3 | ICU4X + KinsokuEngine 1차(가로쓰기 금칙), cross-engine diff 상설화 |
| Phase 4 (Comic) | 말풍선 독서 순서·컷 연결과 통합, 세로쓰기 VerticalTextLayoutIR 1차, Parley 스택 승격 평가 게이트 실행 |
| Phase 7 | CSP blind test에 조판 품질 항목 포함, 장시간 soak에 IME·대량 텍스트 편집 시나리오 포함 |
