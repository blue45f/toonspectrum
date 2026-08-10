# ADR 0003 — Surface/Island당 주 소유자 1개, 객체별 렌더러 전환 금지, hot path readback 금지

## 상태

승인 (2026-08-07)

## 맥락

V11은 하이브리드 아키텍처를 "엔진을 많이 상주시키는 구조가 아니다"라고 정의한다(§1.1): "한 화면에서 CanvasKit, Vello, ThorVG, OpenCV, G'MIC, Three.js를 모두 매 프레임 전체 화면 렌더러로 실행하지 않는다. 한 Surface 또는 큰 Island에 주 소유자 하나를 두고 다른 엔진은 path, mesh, mask, tile, texture, scene fragment, command buffer 같은 중간 결과를 전달한다."

마스터 프롬프트는 이를 `ONE_PRIMARY_SURFACE_OWNER=TRUE`와 절대 규칙 7("객체마다 renderer를 전환하지 말고 큰 island 또는 workspace별로 선택한다"), 규칙 8("hot path에서 GPU→CPU pixel readback을 하지 않는다")로 고정한다. 성능 아키텍처 §9.1도 "한 Surface의 주 compositor는 하나", "엔진 전환은 객체별이 아니라 Island별", "hot path에서 GPU→CPU pixel readback 금지"를 명시한다.

다중 엔진 하이브리드에서 이 규칙이 없으면: 객체별 렌더러 혼용으로 프레임마다 엔진 간 픽셀 왕복이 발생하고, 복사 비용(§9.2 사다리의 최하단인 CPU readback)이 파이프라인 전체를 지배하며, 시각 일관성(AA·색공간 차이)이 객체 경계마다 깨진다.

## 결정

1. **모든 Surface/큰 Island는 주 소유자(primary owner)를 정확히 하나 갖는다.** 소유자는 RenderIslandCompiler가 문서·워크스페이스 프로필 단위로 배정하고, 소유자만 해당 Surface에 최종 합성한다.
2. **객체별 렌더러 전환을 금지한다.** 같은 Island 내 개별 객체가 다른 렌더러를 쓰지 않는다. 다른 엔진의 기여는 중간 결과(path/mesh/mask/tile/texture/scene fragment/command buffer)로 소유자에게 전달된다.
3. **hot path에서 GPU→CPU pixel readback을 금지한다.** 일반 편집 시나리오의 readback 허용 횟수는 0이다(§9.3 게이트). readback은 final/export 경계(libvips 인계, 파일 저장)에서만 허용된다.
4. Island 간 데이터 이동은 §9.2 복사 비용 사다리를 따른다: 동일 GPU texture/view → encoded command buffer/external texture → ImageBitmap/VideoFrame → SharedArrayBuffer tile → (최후) CPU readback.
5. 엔진 전환(예: Vello Classic↔Hybrid↔CanvasKit)은 Island 재컴파일로만 수행하며, IR 원본(ADR 0002) 덕분에 전환은 무손실이다.

## 근거

- §9.2가 복사 비용을 명시적 우선순위로 규정한 이유가 바로 이 결정이다 — 객체별 혼용은 구조적으로 사다리 최하단(CPU readback)을 hot path에 끌어들인다.
- 자체 구현 승인 조건 3("엔진 간 복사 비용 때문에 전체 파이프라인이 느려진다", §3.3)이 보여주듯, interop copy는 V11이 인정하는 최대 병목 후보다. 소유권 규칙은 이 병목을 설계 단계에서 차단한다.
- 시각 품질 게이트(golden image·cross-renderer diff)는 렌더러별 AA·색 처리 차이를 전제한다. 한 Island 안에서 렌더러가 섞이면 객체 경계마다 이 차이가 노출되어 diff 기준 자체가 성립하지 않는다.
- 성능 게이트 "입력→첫 preview p50 4ms/p95 8ms"(§9.3)는 프레임당 엔진 왕복이 없어야 달성 가능한 수준이다.

## 결과

- hybrid-design.md §4의 Island 소유권 표가 규범이 된다: 기본 페인팅 Surface=CanvasKit, 벡터 장면 허브=Vello, 3D island=Three.js, 분석 island=OpenCV(렌더 비소유), final island=libvips/G'MIC/GEGL(격리).
- RenderIslandCompiler·ResourceResidencyManager가 소유권 배정과 texture 상주를 관리하는 필수 컴포넌트가 된다.
- 계측이 필요하다: 일반 편집 중 readback 계수를 benchmark 하니스가 기록하고, 0 초과 시 게이트 실패로 처리한다.
- 일부 기능은 "가장 좋은 렌더러"를 객체 단위로 쓰지 못하는 비용을 감수한다 — 예: Vello 장면 안의 특정 마스크가 CanvasKit에서 더 나아도, 그 구간은 Island 분할 또는 소유자 유지 중에서 Planner가 선택해야 한다.
- Island 경계 설계(어디를 큰 Island로 자를 것인가)가 새로운 설계 책임이 된다. 경계가 너무 잘면 소유권 규칙이 무력화되고, 너무 크면 폴백 단위가 커진다.

## 재검토 조건

- Island 단위 전환의 입도가 실제 문서에서 너무 커서(예: 전체 캔버스 단위 폴백만 가능) 품질·성능 회귀가 실측될 때(경계 입도 재설계).
- WebGPU 생태계에서 zero-copy 엔진 간 texture 공유가 보편화되어 "객체별 혼용"의 복사 비용 전제가 무너질 때(금지 완화 검토).
- readback 0 게이트가 특정 필수 기능(예: 일부 분석 필터의 interactive 경로)과 양립 불가능함이 실측으로 입증될 때(해당 시나리오를 hot path 정의에서 제외하는 명시적 예외 목록 도입).
