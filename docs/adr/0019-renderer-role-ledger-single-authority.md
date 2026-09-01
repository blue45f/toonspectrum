# ADR-0019: 렌더러 역할 원장과 권위별 단일 primary

- 상태: Accepted
- 날짜: 2026-09-02
- 범위: Studio 2D/3D 렌더러, 브러시 픽셀 경로, 엔진 레지스트리, 실험 엔진 격리, 엔진 문서
- 관련: [ADR-0003](0003-one-primary-surface-owner.md), [ADR-0010](0010-next-gen-engine-risk-posture.md),
  [ADR-0011](0011-v12-frontier-quarantine-ledger.md), [ADR-0018](0018-no-automatic-engine-fallback-vello-primary.md),
  [외부 검토 2026-09-02](../architecture/studio-architecture-review-2026-09-02.md) §1·§5·§8

## 맥락

저장소에는 Konva/Canvas2D 제품 렌더러, raw WebGPU 브러시·필터 런타임, Hokusai Rust/WASM 자연 매체,
libmypaint WASM, CanvasKit, Vello CPU/Classic/Hybrid, Pixi, p5.brush, perfect-freehand, Rough.js,
Three/three-vrm, Babylon, WESL, Velato가 함께 있다. 각 엔진의 성숙도는 `ProviderDescriptor.maturity`와
E01–E28 후보 조사(`manifest/providers.json`)에 기록돼 있지만, **어떤 제품 권위(문서 표시, 포인터 입력,
래스터 브러시 커밋, 선택 오버레이, 3D 장면 …)를 누가 소유하는가**는 산문 문서(`docs/rewrite/current-studio-boundary.md`)
에만 있었다. 그 결과 사용자 매뉴얼은 캔버스를 "WebGPU 기반"이라 적고, 경계 감사는 Konva가 표시·포인터
권위를 유지한다고 적는 불일치가 생겼고, 실험 엔진이 제품 코드로 새는 것을 막는 기계적 계약도 없었다.

외부 검토(2026-09-02)의 핵심 결론은 "엔진이 부족한 것이 아니라 권위가 분산된 것"이며, 모든 렌더러를
`primary / provider / reference / lab` 중 하나로 고정하라는 것이다. 다만 검토는 Vello를 reference로만
분류했는데, 이 저장소는 ADR-0018에서 Vello WebGPU/WASM을 2D 문서 벡터 픽셀의 **목표** 엔진으로 이미
확정했다. 두 결정은 권위를 분리하면 양립한다: 벡터 장면과 래스터 브러시 커밋은 다른 권위다.

## 결정

1. `packages/studio-engine-registry/src/renderer-roles.ts`의 `STUDIO_RENDERER_ROLE_LEDGER`가 렌더러 역할의
   단일 진실이다. 항목마다 `role`(현재), `targetRole`(목표), `authorities`, `evidence`(존재해야 하는 경로),
   `moduleSpecifiers`, `productSymbols`, `candidateId`, `adr`, `note`를 갖는다.
2. 역할은 넷뿐이다.
   - **primary**: 해당 권위의 유일한 소유자. 권위당 정확히 하나.
   - **provider**: 게이트·island·명시 선택으로만 실행되는 전문 엔진. 문서 의미와 undo 히스토리를 소유하지 않는다.
   - **reference**: golden/oracle/parity 전용. 제품 권위 0개.
   - **lab**: 제품 import 사이트 0건. `src/`·`apps/`의 비테스트 코드가 `moduleSpecifiers`나 `productSymbols`를
     참조하면 테스트가 실패한다.
3. 현재 상태(current)와 목표 상태(target)를 같은 원장에 적는다. 권위는 잘게 나눈다:
   - 문서 벡터 island(`document-vector-island`) primary = Vello Classic WebGPU/WASM. 2026-09-02 원장
     작성 시점에 `studio-vello-hub-document-hybrid-v13`이 기본 활성이고 `documentAuthority=true`이므로
     이미 현재 primary다(08-11 경계 감사의 "selection-overlay island 한정"은 stale). ADR-0018의 목표는 유지된다.
   - 래스터 브러시 커밋(`raster-brush-commit`) 현재 primary = Canvas2D `StudioDrawNode`, 목표 primary =
     raw WebGPU 브러시 런타임(검토 §5·§6). 목표 승격은 P2 shadow compositor 근거가 있어야 한다.
   - 선택 오버레이 island(`selection-overlay-island`) primary = Pixi(상시 마운트 오버레이 호스트).
   - 좁은 단독 권위는 그 소유자를 primary로 적는다: CanvasKit=`path-ops-quality`, perfect-freehand=
     `stroke-geometry`, Rough.js=`shape-sketch`, Three=`scene-3d`, Babylon=`scene-3d-specialist`,
     Hokusai=`natural-media`.
   - Vello CPU, libmypaint = reference. p5.brush, Paper.js(동적 import 호출부 존재), raw WebGPU 브러시
     런타임 = provider. Vello Hybrid sparse-strip(upstream), WESL, Velato = lab.
   - `image-filter-island`는 소유자 없는 권위다(planner가 작업마다 provider 하나를 고른다).
   - Konva는 마이그레이션 동안 문서 표시·포인터 입력·선택/변형 chrome의 현재 primary이며, 브러시 픽셀
     권위에서 단계적으로 제거된다(로드맵 P3·P5).
4. 엔진 문서는 손으로 쓰지 않는다. `docs/engines/renderer-roles.md`는 `scripts/generate-studio-renderer-roles.mts`가
   원장에서 생성하고, 테스트가 커밋된 문서와 생성 결과의 동일성을 검사한다. `STUDIO_MANUAL.md`의 캔버스
   설명은 이 문서를 가리킨다.
5. 새 엔진을 추가하려면 먼저 원장에 역할을 적어야 한다. `lab`으로 들어온 엔진은 ADR-0011의 격리 원장과
   ADR-0018의 자동 폴백 금지를 그대로 따른다. `primary`로 승격하려면 기존 primary의 권위를 같은 커밋에서
   내려놓아야 한다(권위당 1 primary 불변식이 테스트로 강제된다).

## 결과

- 긍정: 매뉴얼·경계 문서·코드가 한 원장에서 갈라지지 않는다. 실험 엔진의 제품 유출이 CI에서 잡힌다.
  검토가 요구한 "Renderer Role Registry 고정"이 엔진 추가 전에 완료된다.
- 부정: 역할 변경마다 원장·문서 재생성·테스트 갱신이 필요하다. 원장은 코드 사실을 요약하므로, 사실이
  바뀌면 원장을 함께 고쳐야 한다(evidence 경로 존재 검사가 최소한의 부패 방지다).
- 후속: `studio-engine-registry`의 `ProviderDescriptor`에 `authorityRole`을 합쳐 런타임 activation 증거와
  같은 게이트로 묶는 것은 로드맵 P2에서 다룬다.
