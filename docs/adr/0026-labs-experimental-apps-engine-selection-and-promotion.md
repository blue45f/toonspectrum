# ADR-0026: 실험 앱(character-lab·brush-lab)의 위치, 엔진 선택과 본 서비스 승격 프로세스

- 상태: Proposed
- 날짜: 2026-10-01
- 범위: `apps/character-lab`, `apps/brush-lab`, 두 앱의 엔진·물리·브러시 코어 선택, 상업 라이선스 정책,
  `packages/*`·`apps/web` 레인으로의 승격 절차, 관련 루트 문서·ratchet
- 관련: [ADR-0008](0008-license-isolation-policy.md)(라이선스 격리), [ADR-0017](0017-vello-gap-alternative-engine-lanes.md)(대안 엔진 레인),
  [ADR-0018](0018-no-automatic-engine-fallback-vello-primary.md)(자동 폴백 금지), [ADR-0019](0019-renderer-role-ledger-single-authority.md)(렌더러 역할 원장),
  [ADR-0021](0021-stroke-budget-myb-disposition-execution-profiles.md)(획 예산·실행 프로필),
  [엔진 대안 비교 보고서](../reports/character-lab-engine-alternatives-2026-10-01.md),
  [brush-lab 참고 문헌 원장](../engines/labs-brush-engine-references-2026-10-01.md),
  [character-lab 참고 문헌 원장](../engines/labs-character-engine-references-2026-10-01.md)

## 맥락

사용자 요구(2026-09-30)는 모노레포 안에 **서버 기능이 없는 독립 웹앱 두 개**를 두고 각각 다음을 실험하는 것이다.

- character-lab: 네이버웹툰 SHAPER(설치형)와 최대한 비슷한 3D 캐릭터 제작 흐름을 **웹에서** 게임엔진급 렌더링으로. 헤어·의상 2차 동작 물리를
  검토·구현하고, Blender 파이프라인(`tools/blender/toonstudio_blender_kit`)의 제작 에셋 레인을 활용한다. "설치형이면 SHAPER 대비 장점이 없다"가
  웹 선택의 이유다.
- brush-lab: 브러시 품질·성능만 테스트하는 구조. 처음부터 새로 만드는 차세대 브러시 엔진을 Vello처럼 **WebGPU compute 중심**으로 구현하고,
  CLIP STUDIO PAINT를 압도하는 종류·품질·성능을 목표로 한다. 여기서 검증한 브러시를 본 서비스에 적용하는 **승격 프로세스**를 둔다.
- 공통: 상업 이용에 문제없는 라이선스만, 논문·GitHub 참고 소스를 라이선스 안전 범위에서 최대한 활용.

2026-09-30 정찰과 2026-10-01 스펙 심사·연구 종합에서 확인한 사실은 다음과 같다.

- 저장소에는 이미 Babylon.js 9.19.0(Apache-2.0)이 exact pin으로 있고 WebGPU 엔진·MorphTargetManager·BoneIKController·MRT·CSM·SSAO2·TAA·glTF
  serializer가 lockfile 안에서 쓸 수 있으나 제품(`apps/web`)은 이 중 거의 아무것도 쓰지 않는다. 제품 캐릭터 경로는 three-vrm MToon의
  WebGPU/WebGL2 색 차이(최대 125/255) 때문에 WebGL2에 고정돼 있다.
- Vello 계열은 경로 채움 렌더러라 브러시의 본질인 per-pixel 상태(습식·smudge·획 불투명도 상한·안료 질량)를 표현할 API가 없다. 이 컨테이너에는
  `wasm-bindgen-cli`·`wasm-pack`이 없어 Rust 쪽 확장을 브라우저 산출물로 재현할 수 없다. 반면 순수 TS + WGSL 문자열 엔진은 Node(vitest)에서
  모의 `GPUDevice`로 바인딩·디스패치 계약을 검증할 수 있다.
- Skia Graphite는 웹 아티팩트가 없고(`BUILD GATE NOT PASSED`), Rive는 WebGPU 백엔드가 없으며, Impeller는 웹 연동이 non-goal, Forma는 아카이브됐다.
- 실험 앱 스캐폴딩(커밋 `7ccf9ccf`)은 이미 main에 있다: 독립 pnpm workspace, 자체 Vite·TypeScript·Vitest, 루트 스크립트, 경계 ratchet
  `characterLabToApps`/`brushLabToApps`/`appsToLabs` = 0.
- 이 컨테이너에는 GPU가 없다. WebGPU/WebGL 경로의 실기기 픽셀은 이 세션에서 검증할 수 없다.

## 결정

### A. 위치와 경계

1. 두 앱은 `apps/character-lab`(`@toonstudio/character-lab`)과 `apps/brush-lab`(`@toonstudio/brush-lab`)에 둔다. 자체 Vite·TypeScript·Vitest
   설정과 `dist/`를 소유하는 독립 workspace이며, 서버 기능이 없는 정적 앱이고 **운영 배포 대상이 아니다**. `deploy/`와 배포 정책은 실험 앱을 다루지 않는다.
2. `apps/web`, `apps/admin-web`, `apps/api`와 서로의 application source를 import하지 않는다. 공유 코드는 `packages/*`의 공개 진입점만 사용한다.
   [`config/architecture-boundary-ratchet.json`](../../config/architecture-boundary-ratchet.json)의 `characterLabToApps`, `brushLabToApps`, `appsToLabs`를
   0으로 고정하고 [`scripts/validate-app-boundaries.mjs`](../../scripts/validate-app-boundaries.mjs)가 검사한다.
3. `apps/web` 내부 커널(Babylon specialist entry, capture adapter, character-shaper 카탈로그, WebGPU dab 비닝 등)은 **참고 패턴**이지 import 대상이 아니다.
   같은 원리를 독립 재구현하고, 실제 두 번째 소비자가 생긴 범위만 focused package로 승격한다(루트 `AGENTS.md` §7).
4. 의존성 추가는 통합 담당(또는 메인 세션)이 이름·exact 버전·라이선스·이유를 받아 `pnpm install`과 lockfile을 함께 갱신한다. 작업자는 `pnpm install`을
   동시에 실행하지 않는다.

### B. character-lab 엔진 선택

5. 주 엔진은 **Babylon.js 9.19.0 `WebGPUEngine`**이며 사용자가 명시 선택한다. `Engine`(WebGL2)은 사용자가 명시 선택하는 독립 대안이다.
   capability 불일치·초기화 실패·device loss 뒤 다른 엔진을 같은 작업에서 자동 시도하지 않고 `unavailable`/`failed`로 노출한다(ADR-0018 결정 1·2·6).
   `NullEngine`은 테스트 전용이며 readback에 `provenance.synthetic=true`를 남긴다.
6. Three 0.184 `WebGPURenderer` + three-vrm(VRM 대조군), PlayCanvas, Bevy/wgpu는 이번 범위에서 **문서 비교 전용**이다. 코드 레인으로 올리려면
   exact pin·라이선스 감사·자동 폴백 차단(PlayCanvas)·`wasm-bindgen-cli` 도입(Bevy)을 별도 승인한다.
   레인 표는 `apps/character-lab/src/contracts/engine.ts`의 `ENGINE_LANES`가 단일 원천이고 문서·HUD는 같은 표기를 쓴다.
7. 캐릭터 소스는 **Blender 제작 레인**(`toonstudio_blender_kit` 패키지, CC0 Orion 포함)과 **절차 휴머노이드 레인**(스위프 로프트 + 스피어-메시
   프록시, 고정 토폴로지, 파라미터 ±1 morph 베이크) 두 가지이며, 둘 다 같은 15슬롯·morph 이름·본 이름 계약(`src/contracts/`)으로 취급한다.
   지원하지 않는 슬롯은 사유를 적고 무음 대체하지 않는다.
8. 물리는 **자체 결정적 PBD/XPBD 체인·클로스 솔버가 1급 엔진**이고, `@dimforge/rapier3d-deterministic-compat` 0.19.3은 소품·접지·접촉 전용
   보조 provider, `@babylonjs/havok`은 미설치 사유를 표시하는 `unavailable` provider다. 세 provider는 같은 카탈로그에서 하나만 선택되고
   실패는 `unavailable`로 노출된다(ADR-0018 결정 11). 캡처 기본은 CPU 참조 커널이며 settle 영수증(모델·포즈 해시, 스텝, 상태 해시)을 export 메타에 첨부한다.
9. 베타·실험 항목(IBL Shadows, OpenPBR, TAA, SSAO2, NodeMaterial 툰, `MeshUVSpaceRenderer` 페인트, VRM 부분 파서, Havok, pose 모델 SHA 미고정)은
   기본값 off이고 문서·HUD에 "베타"로 표기한다.

### C. brush-lab 브러시 코어 "Sumi"

10. 브러시 코어는 **자체 WebGPU compute 타일 파이프라인 "Sumi"**(`apps/brush-lab/src/engine/`, `SUMI_ENGINE_VERSION` 0.1.0-beta.1)다:
    dab 인스턴스(64 B 레이아웃) → 다단 스캔 비닝(안정 scatter, CSR) → 타일을 워크그룹이 배타 소유하는 fine 래스터(해석적 AA, 질감 mip·이방성 샘플링,
    선형 premultiplied f32 누적, 획 알파 상한, smudge·습식 상태) → 합성(Kubelka-Munk 자체 구현, 베타). 부동소수 원자 연산이 없는 WGSL 제약을
    타일 배타 소유로 우회하고 `dabIdx` 순서를 고정해 결정성을 얻는다. 결정성 검증 단위는 CPU `DabInstance[]`와 CPU 참조 래스터다.
11. `src/engine/`은 **승격 단위**다. `@toonstudio/*`·react·DOM 전역·`Math.random`·`Date.now`를 import·참조하지 않고 상대 import와 zod(2파일)만 쓴다.
    디렉터리 이동만으로 `packages/studio-brush-engine-sumi`가 되도록 유지한다. 레인 어댑터는 `src/lanes/`에 두고, 서비스 패키지
    (`@toonstudio/studio-brush-platform`, `studio-project-model`)는 `platform-baseline` 레인만 import한다.
12. 레인은 `src/lanes/lane.ts`의 `LaneId` 8종(`cpu-reference`, `platform-baseline`, `canvas2d`, `webgpu-compute`, `webgpu-instanced`,
    `webgl2-instanced`, `wasm-cpu`, `wasm-gpu-hybrid`)이며 `probe`는 절대 throw하지 않고 구조화 결과를 돌려준다. `unavailable` 상태에서 `init`을
    부르면 `LaneUnavailableError(code)`를 던지고 다른 레인으로 자동 전환하지 않는다. **WebGL2·Canvas2D는 "저품질 폴백"이 아니라 사용자가
    명시 선택하는 독립 비교 레인**이다(ADR-0018 결정 2).
13. Vello는 브러시 엔진으로 확장하지 않는다(설계안 B 기각). 커밋된 `crates/studio-engine-vello/pkg-gpu`를 재빌드 없이 `adoptGpuDevice`로 같은
    `GPUDevice`에 붙이는 **벡터 획·비교 레인**(설계안 C)만 후속 범위로 둔다. 상류 sparse strips가 "not yet suitable for production use"이고
    mask·filter·일부 blend에서 panic하므로 사전 capability 거부가 필요하다.
14. 브러시 프로그램은 zod 스키마(`BrushProgram`)로 정의한 **절차 프리셋 30종**(최소 요구 24종)이며 외부 브러시 파일·에셋을 포함하지 않는다.
    `.myb`(CC0 mypaint-brushes)는 캘리브레이션·패리티 fixture 입력으로만 쓴다.
15. 습식(수채·수묵·구아슈·유화), KM 안료 혼색, smudge, 임파스토, `shader-f16` 누적, compatibility 모드, `subgroups`, `timestamp-query` 실측은
    **베타·실험**으로 표기하고 각 기능이 없을 때도 CPU 참조 골든을 통과해야 한다. 측정 불가 값은 fallback이 아니라 `null` + 사유로 기록한다.

### D. 상업 라이선스 정책(두 앱 공통)

16. 직접 번들·재구현 허용: MIT, Apache-2.0(NOTICE 유지), BSD-2/3(고지 유지), ISC, Zlib(수정 사실 표기), CC0, Unlicense.
    ADR-0008의 4단 구분(직접 번들 / 동적·격리 검토 / 격리 필수 / reference-only)을 그대로 적용한다.
17. **금지**: Mixbox(CC BY-NC 4.0) — 코드·LUT·계수·문자열 일체 유입 금지(경계 테스트로 `mixbox` 문자열 검색). GPL/AGPL 저장소
    (Krita, GIMP, MyPaint 앱, Drawpile, harmony, Milton, Darkly, Ciallo, MakeHuman·MPFB2·MB-Lab, StarRailNPRShader, HoyoToon, Anime-SDF-Gen,
    mannequin.js, RigNet 등)는 코드 열람·복제 금지이고 공개 문서·논문의 **개념만** 쓴다. CC BY-SA 자료는 읽은 뒤 독자 구현한다.
18. 경쟁 제품(CLIP STUDIO PAINT, Procreate, Photoshop, Rebelle, SHAPER, VRoid Studio)의 코드·브러시 파일(.abr/.brush/.sut)·톤·UI 에셋·프리셋 복제와
    리버스엔지니어링을 하지 않는다. 공개 매뉴얼의 파라미터 의미와 기능 목록만 벤치마크 기준으로 쓴다. 비상업 모델(SMPL 계열, FLAME 학술판, BFM)은 전면 금지.
19. 특허 주의: NVIDIA decoupled look-back 스캔(US9928033B2)은 `experimental.chainedScan` 플래그로만 두고 승격 대상에서 제외, Adobe 절차적 벡터
    수채(US8917282B2·US8917283B2)·가상 붓모→벡터(US8605095B2·US8760438)는 미채택, Le-Hodgins CoR 스키닝은 실험 전용. 법무 검토 전에는 보수적 값을 택한다.
20. MIT 저장소의 샘플 에셋(three.js facecap, babylon-mmd MMD 모델, disfigure glb, NiloCat·lilToon 샘플)과 모델 가중치(MediaPipe `.task`, HF ONNX)는
    코드와 별개의 라이선스다. 모델 카드·URL·바이트 수·SHA-256을 기록하기 전에는 배포 경로에 넣지 않는다.
21. 저장소에 커밋하는 `.wasm`은 재현성 테스트와 `INTEGRITY.sha256` 봉인이 있어야 한다(`crates/studio-engine-vello/pkg` 관례).

### E. 검증·표기 의무

22. 모든 순수 로직은 vitest(Node)로 검증한다. 브라우저 전용 경로는 capability·오류 경로 단위 테스트까지만 Node에서 검증하고, README와 패리티
    체크리스트에 "브라우저 미검증"을 정직하게 표기한다. 실기기 픽셀을 검증했다고 보고하지 않는다.
23. 실브라우저 프로브(Playwright Chromium `--enable-unsafe-webgpu`, Linux `--use-webgpu-adapter=swiftshader`, 미지원 시 exit 2)는 로컬 실행 증거이며,
    소프트웨어 렌더러(`softwareRenderer: true`) 결과는 성능 증거로 쓰지 않는다.

### F. 본 서비스 승격 프로세스(개요)

brush-lab 상세 절차 문서는 brush-lab ui 작업자가 `apps/brush-lab/docs/drafts/brush-lab-promotion-process.md`에 초안 중이며 2026-10-01 현재
저장소에 없다. 이 ADR은 스펙 기준의 개요만 고정하고, 초안이 들어오면 상세 문서를 참조한다.

24. **brush-lab → 본 서비스**: 다음 게이트를 순서대로 통과해야 한다.
    1. 랩 실험: fixture 스트로크 로그(결정적, ≥5종) 골든 커밋, 같은 입력 재생 해시 동일.
    2. 인증 리포트: `BrushCertificationReport`(zod, `labSchemaVersion` 1.0.0)에서 전역 임계값(불투명도 누적 오차 ≤0.01, δ48 퍼지 불일치 ≤0.5%,
       ΔE2000 p99 <1.0, 결정성 해시 동일, 지연 p95 ≤16.7 ms)과 매체 가족 지표를 모두 PASS. `UNAVAILABLE` 항목이 있으면 승격 불가.
    3. 증거 커밋: `docs/evidence/brush-lab/<presetId>-<laneId>-<YYYYMMDD>.json`. 실 GPU(`softwareRenderer: false`) 리포트 최소 1개.
    4. 패키지 추출: `src/engine/` → `packages/studio-brush-engine-sumi`(경계 테스트·서비스 패키지 미의존 확인).
    5. 서비스 레인 연결 PR: `@toonstudio/studio-engine-registry`의 `providerDescriptorSchema`(라이선스 게이트 `evaluateLicenseGate`, `maturity`)로
       descriptor를 선언하고, 기존 토너먼트 장치(`createFuzzyNeighborhoodGate` δ48/0.5%, `HysteresisPolicy` 12%/120프레임, `PromotionRegistry`)와
       ADR-0018 단일 선택 규칙을 통과한다. 레지스트리 trusted-bootstrap audit은 `packages/` 경로만 허용하므로 4단계가 선행돼야 한다.
    6. 회귀 게이트: 픽셀 해시·δ48·성능 p95를 CI 샤드에 둔다.
    거부 조건: `UNAVAILABLE` 지표, 소프트웨어 렌더러 리포트만 존재, 결정성 실패, 라이선스 미확인, 브라우저 미검증. 롤백: descriptor 비활성·이전 엔진 유지·
    패키지 버전 고정. 리포트 스키마는 semver로 관리하고 두 번째 소비자가 생기면 `packages/contracts`로 승격한다.
25. **character-lab → 본 서비스**: 패리티 체크리스트(구현 상태 / Node 검증 / 브라우저 검증 날짜·기기·backend / 비고)가 단일 원천이다.
    엔진 어댑터·슬롯 카탈로그·캡처 계약은 "실제 두 번째 소비자" 원칙에 따라 focused package로만 승격하고, `apps/web` 캐릭터 경로의 교체는
    ADR-0019 렌더러 역할 원장 갱신과 별도 ADR로 결정한다. Blender 제작 패키지는 품질 게이트(`quality.passed`)와 SHA-256 검증을 통과한 것만 적재한다.

## 대안(검토 후 기각)

| 대안 | 기각 사유 |
| --- | --- |
| Unity / Godot / Unreal / Wonderland / Cocos 설치형·웹 export | WebGPU 상한 없음(Godot), experimental(Unity), 서버 GPU 영상(Unreal), 독점 EULA·로열티(Wonderland), 에디터 종속(Cocos) |
| Three + three-vrm을 주 엔진으로 | WebGPURenderer experimental, 커스텀 셰이더·EffectComposer 미지원, MToon WebGPU/WebGL2 색 차이 실측. VRM 대조군으로만 가치 |
| PlayCanvas 주 엔진 | 미설치·신규 pin, WebGPU Beta, 자동 폴백 기본(ADR-0018 충돌) |
| Bevy / wgpu WASM | `wasm-bindgen-cli` 없음, 캐릭터 툴링 없음, wasm 4.8MB+ |
| Vello를 브러시 엔진으로 확장(B) | 벡터 fill 렌더러라 per-pixel 상태 표현 불가, Rust 포크 + wasm 재빌드 필요(이 세션 재현 불가) |
| Skia Graphite / Rive / Impeller / Forma / Pathfinder | 웹 아티팩트 부재 / WebGPU 백엔드 없음 / 웹 non-goal / 아카이브 / 휴면 |
| Havok을 주 물리로 | cloth 없음, 결정성 보장 없음, ~4.4MB wasm 미설치 |
| Mixbox 안료 혼색 | CC BY-NC 4.0(비상업). MIT 수식(spectral.js·open-km)으로 KM 자체 구현 |
| 하나의 앱에 두 실험을 합치기 | 소유권·검증 범위가 다르고 의존성 집합이 겹치지 않음 |

## 결과와 트레이드오프

- 엔진 장애가 즉시 보이고 재현된다. 대신 자동 폴백이 없으므로 WebGPU 미지원 기기에서는 사용자가 WebGL2를 직접 골라야 하며 그 경로는
  결정성·습식·획 상한 일부를 포기하는 **다른 엔진**으로 문서화된다.
- Babylon 선택으로 VRM 의미 보존이 약해진다(부분 파서 베타). 대신 PBR·IBL·CSM·SSS·후처리·MRT·glTF export가 한 패키지(Apache-2.0)에서 나온다.
- 자체 compute 브러시 코어는 구현 난도가 가장 높지만 품질 상한(per-pixel 상태·습식·안료·상한)과 승격 용이성(wasm 툴체인 불필요)이 가장 좋다.
- GPU 없는 컨테이너라 Node 검증과 브라우저 검증이 분리된다. 문서·README의 "브라우저 미검증" 표기는 승격 게이트의 입력이지 결함 은폐가 아니다.
- `apps/web` 커널을 독립 재구현하므로 두 구현이 갈라질 수 있다. 승격 시 통합 비용을 받아들이고, 두 번째 소비자가 확정될 때 패키지로 합친다.

## 후속 조치

- brush-lab 승격 프로세스 상세 문서 초안이 들어오면 이 ADR의 F절에서 참조하고 `config/documentation-authority.json`에 등록한다.
- character-lab 패리티 체크리스트와 brush-lab 레인 상태 표(`LANE_REGISTRY`)가 커밋되면 README와 이 ADR의 표기를 대조한다.
- 첫 실브라우저 프로브 결과(WebGPU adapter·softwareRenderer 여부)가 나오면 베타 항목의 상태를 갱신한다.
- 이 ADR이 Accepted로 바뀌면 [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §3.6과 [렌더러 역할 원장](../engines/renderer-roles.md)의 생성 원장에 실험 레인을 반영한다.
