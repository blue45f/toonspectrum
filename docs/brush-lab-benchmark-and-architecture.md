# ToonStudio Brush Lab: 벤치마크와 조합형 제작실 설계

검토일: 2026-09-06. 코드 기준: `blue45f/toonspectrum@b814c165023dbb12b4a1a17cdead25e053d537e2`.
이 문서는 구현한 변경, 기존 기능 재사용, 후속 연구 대상을 구분한다.

## 결론

기존 `/studio/brushes`는 작품 편집기의 브러시 작업면으로 유지한다. 새 `/studio/brush-lab`는 문서 런타임을 열지 않는 독립 제작실로 추가한다. 작품과 리믹스 문맥이 필요하면 `/studio/work/:workId/brush-lab`, `/studio/remix/:sourceWorkId/brush-lab`를 사용한다. 기존 Studio route manifest가 유일한 라우트 해석 권위를 유지한다.

브러시 수를 별칭이나 이론적인 조합 수로 부풀리지 않는다. 기반 엔진, 다른 프리셋에서 가져오는 특성, 엔진별 물성 프로그램, 렌더 백엔드는 서로 다른 선택 축이다. 서로 다른 렌더러를 같은 획에 무작정 중첩하는 방식은 채택하지 않는다.

## 주요 벤치마크

| 서비스 / 라이브러리 | 확인한 구조 | ToonStudio에 반영할 판단 |
|---|---|---|
| Procreate Brush Studio | Shape + Grain, 획 경로, Dynamics, Wet Mix, 입력 및 Drawing Pad | 기반 선택–특성 편집–비교를 분리한다. 장기적으로 동일 입력을 재생하는 실제 Drawing Pad가 필요하다. |
| Procreate Dual Brush | 두 브러시를 합치되 각자의 형상·질감을 편집 | 보조 팁은 독립된 슬롯으로 둔다. 다른 엔진 전체를 자유롭게 섞는다는 의미로 확장 해석하지 않는다. |
| Krita | PaintOp 엔진과 옵션·센서, 마스킹 브러시 | 엔진별 capability에 따라 설정을 노출하고 지원되지 않는 속성을 비활성화한다. |
| CLIP STUDIO PAINT | 주 브러시에 보조 브러시 형태를 결합하는 dual brush | 주 촉 / 보조 촉 / 질감을 구분한다. 외부 포맷은 완전 호환으로 표시하지 않는다. |
| perfect-freehand | 압력 입력으로 획 외곽 폴리곤 생성 | 경로 생성 단계의 어댑터다. 수채 물리나 렌더러로 분류하지 않는다. 기존 어댑터를 유지한다. |
| p5.brush | 커스텀·이미지 팁, 산포·그레인·필압·흐름, p5 및 standalone WebGL2 빌드 | 표현 브러시 후보. 별도 상태·좌표·시드·출력 베이크 계약이 검증된 후 연결한다. |
| libmypaint | C 기반 브러시 라이브러리, ISC 라이선스 | 자연 매체 후보. WASM 포팅과 표면 어댑터·메모리 수명·좌표계 검증이 필요하다. GUI 앱의 라이선스와 혼동하지 않는다. |
| PixiJS | WebGL/WebGPU 렌더링과 GPU 장면 구성 | 입자·팁 배치용 렌더 백엔드 후보. 자체적으로 새로운 수채 브러시 엔진이 되지는 않는다. |
| CanvasKit | Skia의 WebAssembly API, Canvas/Paint/Path/Text | 패스와 출력 백엔드 후보. 현재 저장·내보내기 권위를 교체하지 않고 별도 어댑터 검증 후 도입한다. |

### 1차 자료

- Procreate Brush Studio: https://help.procreate.com/procreate/handbook/brushes/brush-studio
- Procreate settings: https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings
- Procreate dual brush: https://help.procreate.com/procreate/handbook/brushes/dual-brush
- Krita brush settings: https://docs.krita.org/en/reference_manual/brushes/brush_settings.html
- Krita masked brush: https://docs.krita.org/ko/reference_manual/brushes/brush_settings/masked_brush.html
- CLIP STUDIO dual brush: https://help.clip-studio.com/en-us/manual_en/810_subtools/Number.htm
- CLIP STUDIO customization: https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm
- perfect-freehand: https://github.com/steveruizok/perfect-freehand
- p5.brush: https://github.com/acamposuribe/p5.brush
- libmypaint: https://github.com/mypaint/libmypaint
- PixiJS renderers: https://pixijs.com/8.x/guides/components/renderers
- CanvasKit: https://docs.skia.org/docs/user/modules/canvaskit/

Context7에서도 perfect-freehand의 실제 압력 입력과 `simulatePressure: false`, 외곽점 반환, smoothing / streamline / taper 구성을 확인했다. 전용 Deep Research 도구의 실행 결과는 없으며, 이 문서의 벤치마크는 직접 확인한 공식 자료를 바탕으로 한다.

## 이번 변경의 구현 범위

### 독립 제작실

`StudioBrushLabPage`를 lazy route로 추가한다. 문서 저장 권한, 작품 데이터나 협업 런타임은 새로 만들지 않는다. 작품과 리믹스 식별자는 기존 `parseStudioWorkspaceRoute`를 통해 검증하며 충돌한 identity는 실패 처리한다. `returnTo`는 받아서 이동하지 않으며, 복귀 주소는 검증된 작품 경로에서만 만든다. 편집 캔버스는 새 탭으로 열어 작업 중인 제작실을 유지한다.

현재 진입은 전용 주소로 한다. 기존 전역 메뉴의 빠른 설정 모달을 독립 제작실로 강제 치환하지 않았다. 전역 메뉴에 별도 진입점을 노출하는 작업은 후속 통합 항목이다.

### 8개 독립 특성 슬롯

주 펜촉, 보조 펜촉, 종이 질감, 색상 변화, 굵기/농도, 도포/간격, 산포/방향, 시작/끝 테이퍼를 별도로 선택한다. 겹치는 material/expression/response 묶음을 새 조합 레시피에서는 받지 않는다. 실제 합성은 기존 `mergeStudioBrushMixTraitSection`을 호출한다. 이는 기반 캐리어, deposit pipeline, 프로그램 pin, preset identity와 seed를 함부로 바꾸는 deep merge가 아니다.

보수적인 조합 대상은 ink-particle, airbrush, dry-media 세 렌더 계열이다. 전체 기반 프리셋 탐색은 기존 공개 paint catalog를 사용하되 격리된 프리셋과 로딩 실패 항목은 제외한다. 유화·수채·벡터 계열까지 동일한 8슬롯을 소비한다고 표시하지 않는다.

### 트랜잭션과 되돌리기

모든 선택 소스를 먼저 확인하고, 하나라도 실패하면 일부 특성만 적용하지 않는다. 동일 소스를 여러 슬롯에서 참조해도 조합 트랜잭션의 소스 확인은 중복하지 않는다. 고정 슬롯 순서를 사용하여 JSON 키 순서로 결과가 달라지지 않는다.

새 요청, 기반 변경, 슬라이더 변경, 레시피 변경은 이전 요청의 revision을 무효화한다. 레거시 상세 설정 창의 늦은 콜백도 예상 snapshot이 현재 값과 다르면 history를 덮어쓰지 않는다. 되돌리기 기록은 방향별 최대 20개 및 UTF-16 직렬화 추정 2MiB로 제한한다. 이는 전체 앱 메모리 상한이 아니며 현재 snapshot·비교 기준은 별도로 보유한다.

### 변형 탐색

선택한 한 슬롯만 바꾸는 최대 12개 후보를 만든다. 검색한 소스에서 후보를 만들며, 정규화한 dynamics가 동일한 후보와 현재 설정과 동일한 후보는 제외한다. 설정이 다르다고 시각적으로 충분히 다르다는 보장은 없으므로 자동으로 고품질 브러시 12개를 확보했다고 표시하지 않는다. 후보는 사용자가 선택한 뒤에만 현재 브러시로 적용되고 명시적으로 저장한다.

### 저장과 가져오기

기존 `StudioBrushSaveAsCustomControls`와 `StudioBrushLibraryPanel`을 재사용한다. 원래의 SQLite/OPFS 저장소가 저장 브러시의 권위다. 앱 전용 JSON과 ABR/MYB/KPP 가져오기 동작은 기존 패널의 지원 범위와 경고를 따른다. 이 변경이 외부 포맷의 완전한 시각적 재현을 새로 제공하는 것은 아니다.

sessionStorage에는 버전이 있는 현재 편집 snapshot 초안만 임시 보관한다. 이는 공유 브러시 라이브러리가 아니다. 잘못된 JSON, 버전 불일치, 알 수 없는 brushId, 격리 브러시, 과대 용량은 안전한 기본 초안으로 복구한다. 저장소 접근 거부나 용량 부족은 사용자에게 표시한다. 이름 있는 저장과 파일 내보내기는 계속 필요하다.

### 기존 물성 프로그램의 재사용

유화에서는 기존의 붓털 물리, 물감 소모, 임파스토 boolean 조합을 제공한다. 기존 8개 조합을 이번에 새로 구현한 8개 엔진이라고 세지 않는다. 수채에서는 기존의 bloom 계열과 bake 계열 프로그램 UI를 사용한다. 동시에 충돌하는 두 물성 권위를 억지로 켜지 않는다.

## 미리보기의 한계

이번 화면은 기존 `StudioBrushDynamicsPreview`의 고정 입력 샘플을 재사용한다. 샘플 크기는 기존 컴포넌트의 최대 28px 표시 범위를 따른다. 전체 유화·수채 물성, 실기기 입력 보정, 최종 캔버스 export와의 픽셀 동등성을 의미하지 않는다. 전체 물성 미리보기가 연결되지 않은 계열에는 그 사실을 표시한다. `EngineStackPanel`의 품질·비용 값은 휴리스틱이지 측정된 지연시간이 아니다.

진짜 자유 드로잉 패드는 후속 핵심 작업이다. 별도 근사 렌더러를 만들지 않고 문서가 사용하는 정규화된 stroke snapshot, 동일 입력 재생, 동일 export 경로를 공유해야 한다.

## 엔진/라이브러리 확장 구조

권장하는 단계는 입력 보정 → 경로/도장 계획 → 기반 매체 → 선택적 팁/그레인/색상 특성 → 호환 물성 패스 → 합성/렌더 → 재생/내보내기다. 각 단계에 독립적인 모든 라이브러리를 곱해서 실행하지 않는다.

1. 선화 경로: 기존 perfect-freehand 어댑터와 Canvas2D/현재 renderer. 선의 외곽 생성과 렌더링 책임을 분리한다.
2. 도장·입자: 현재 동적 dab planner와 사용자 알파·보조 팁. GPU로 옮길 경우 Canvas2D 기준 출력과 오차를 측정한다.
3. 유화·수채: 현재 물성 프로그램을 우선한다. 외부 자연 매체 엔진은 별도 렌더 어댑터와 저장 호환성이 확인된 후 추가한다.
4. 표현형 브러시: p5.brush standalone 또는 p5 경로 중 하나를 택한다. 같은 엔진을 두 번 초기화하지 않고 seed·resize·context loss·cleanup을 검증한다.
5. 외부 브러시: libmypaint WASM 또는 이미 존재하는 플랫폼 어댑터를 재사용한다. MYB/KPP import 성공을 원래 프로그램의 모든 렌더 특성 지원으로 간주하지 않는다.
6. 백엔드: CanvasKit, PixiJS, WebGPU는 실제 장점이 입증된 해당 단계에만 배치한다. 새 backend 선택 스위치는 아직 제품에 연결하지 않았다.

프로그램과 리소스에는 버전, 호환 기반 계열, 입력 채널, 연산 상한, seed 계약, export 경로, cancellation/dispose, 라이선스 출처와 테스트 증거가 필요하다. 실행 코드를 외부 브러시 JSON에서 주입하거나 임의 URL에서 worker/shader를 내려받는 방식은 도입하지 않는다.

## 검증 기록과 병합 조건

실행한 검증:
- 의존성 없는 새 트랜잭션 모듈 strict TypeScript 검사.
- Node contract 20개 통과. 1만 회 history 편집과 큰 JSON 기록 상한 포함.
- 새/변경 TS/TSX 8개 파일의 TypeScript syntax transpilation: 진단 0개. 전체 import/type resolution 검증은 아니다.
- 별도 HTML UI 시안: Chromium에서 탭 전환, 계열 표시, 슬롯 8개, 1440/1024/768/390 너비에서 가로 넘침 없음. 시안 검증이지 제품 React 앱의 E2E가 아니다.

아직 실행하지 못한 검증:
- 저장소 전체 의존성 설치, 루트 tsc/lint/build와 Vitest.
- 새 제품 어댑터 및 확장한 라우트 계약 테스트의 실제 저장소 실행.
- 실제 사이트에서 OPFS 저장·다른 탭 라이브러리 갱신·펜 입력·장시간 드로잉·내보내기 동등성.
- Safari/Firefox/실제 iPad 입력, WebGL context loss와 Worker 회수.

원격 Mac은 확인 당시 오프라인이었고, 샌드박스에는 전체 저장소와 패키지 의존성이 없었다. 따라서 이 결과만으로 main 병합이나 배포 완료를 선언하지 않는다. 체크를 우회하지 않고 draft PR로 검토한다.

저장소 환경에서 실행할 명령:

```sh
node scripts/verify-studio-brush-lab.mjs
pnpm exec vitest run src/domains/creator/brush/studio-brush-lab-model.test.ts src/domains/creator/studio-router/studio-route-manifest.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
pnpm build
```

기존 필수 `core` CI와 린트 정책은 그대로 적용한다. 브러시 제작실에 대한 actual browser E2E와 기존 `/studio/brushes` 회귀 확인이 완료되어야 배포 대상으로 승격한다.

## 디자인 시안

Canva 가져오기 성공: `DAHUWtkwKdg`.
편집 링크: https://www.canva.com/d/LoACPGS9r630x9J
보기 링크: https://www.canva.com/d/DfCDkTTexYL1-UO

`brush-lab-design.html`은 인터랙션과 배치를 검토하는 독립 시안이며, 표시된 SVG는 제품 엔진 출력이 아니다. 제품 렌더 결과로 재사용하지 않는다.
