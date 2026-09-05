# Brush Lab — 독립 조합형 브러시 제작실

기준 코드: `blue45f/toonspectrum`, `dbd5e75a207950b00360516a4353af872ff67e60`.
검토일: 2026-09-06 (Asia/Seoul).

## 결정

`/studio/brushes`를 앱 라우트에 명시적으로 등록한다. `/studio/*`의 문서 편집기 라우터와 별도로 지연 로딩한다. 기존 브러시 상세 편집기, 실제 속성 병합 함수, 매체 프로그램 UI, 정규화 규칙, 제품 브러시 저장소를 재사용한다. 새로운 드로잉 엔진이나 제품과 다른 두 번째 저장소는 만들지 않는다.

독립 라우트의 목적은 큰 속성 조합표, 후보 비교, 안전한 변형 실험에 공간을 주는 것이다. 작품 캔버스 안의 빠른 브러시 조정 모달은 유지한다. 따라서 **빠른 설정은 기존 모달, 깊은 제작·탐색은 독립 제작실**이라는 두 진입점을 권장한다. 이번 변경은 새 URL을 등록하지만 기존 편집기 내부의 탐색 메뉴에 새 진입 버튼을 추가하지는 않는다.

## 구현 범위

- 실제 카탈로그의 페인트 캐리어 선택. 확장 목록은 별도 import하며 실패해도 기본 목록은 유지하고 재시도할 수 있다.
- 8개의 중복되지 않는 속성 소스: 촉, 듀얼 촉·팁 레이어, 종이·그레인, 색상·안료, 크기·불투명도, 도포·간격, 산포·방향, 시작·끝 테이퍼.
- 각 속성을 다른 소스에서 가져오는 명시적 적용. 소스가 하나라도 없으면 부분 적용하지 않는다.
- 속성 잠금, 정수 시드, 변경할 속성 수, 검색 결과를 후보 풀로 사용하는 결정적 변형 탐색.
- 한 번에 최대 8개 UI 후보. 핵심 API는 최대 12개, 탐색 시도·소스 수에 상한을 둔다. 수량은 화질을 의미하지 않는다.
- 완성된 설정 기준 중복 제거. 서로 다른 설정도 동일한 이미지가 될 수 있으므로 시각적 다양성 보증으로 표시하지 않는다.
- 기준 A 고정·복원, 현재 B 비교, 최대 24단계 브러시 상태 되돌리기·다시 적용.
- 기존 상세 편집기로 PNG 촉, 필압·속도·틸트, 질감 등 기존 편집 기능 접근.
- 기존 유화 3개 물성 패스 조합과 수채 프로그램 선택 UI 재사용. 입자 속성을 실제 지원하지 않는 캐리어에서는 해당 조합 UI를 비활성화한다.
- 기존 SQLite 제품 저장소를 사용하는 저장 카드 재사용. 세션 대체 저장 경고를 그대로 보존한다.
- 엔진 프로그램을 포함하는 네이티브 호환 JSON 내보내기. 가져오기는 1MB 상한, 미래 포맷·알 수 없는 캐리어·다른 계열 프로그램·수채 프로그램 충돌을 거부한다.
- 비동기 요청 세대 검사로 다른 선택이나 화면 종료 이후 도착한 결과가 새 설정을 덮어쓰지 않게 한다. 객체 URL과 타이머를 정리한다.

후보 적용 또는 수동 편집 후에는 현재 스냅샷을 새 기준으로 삼고 소스 선택은 비운다. 잠금은 같은 캐리어 안에서 유지한다. 이 정책은 예전에 고른 소스가 나중의 수동 수정을 다시 덮어쓰는 것을 막는다. 캐리어를 바꾸면 프로그램 오버라이드를 초기화하고, 원래 캐리어는 되돌리기로 복원할 수 있다.

## 저장 경로에서 발견한 결함과 이번 보호 범위

기존 `studio-brush-library.ts`의 `StudioBrushSnapshot`과 정규화 함수는 `enginePrograms`를 지원한다. 그러나 검토 기준 커밋의 `writeBrushJson`은 해당 필드를 출력하지 않는다. 기존 `brushMatchesSnapshot` 비교에도 해당 필드가 없다.

새 `writeBrushLabJson`은 네이티브 writer의 결과에 정규화된 프로그램 스냅샷을 명시적으로 포함한다. 기존 importer는 이미 이 필드를 소비하므로 호환된다. 이번 변경은 **Lab에서 내보낸 파일의 유실을 방지하는 어댑터**이며, 모든 기존 화면의 공통 writer·동등성 비교를 전역 수정했다고 주장하지 않는다. 전역 writer와 동등성 비교의 수정 및 기존 호출부 회귀 검증은 별도 후속 과제로 남는다. 제품 저장소에 직접 저장하는 경로는 기존 스냅샷 전체를 사용한다.

실행 가능한 코드를 담는 플러그인 URL, 임의 셰이더, 임의 스크립트를 가져오지 않는다. 소스 ID만 보관해 나중에 재해석하는 대신, 저장 결과는 완전히 구체화된 스냅샷이다. 이 때문에 카탈로그가 바뀌어도 원래 속성이 파일 안에 남는다. 단, 렌더러 버전이 바뀐 뒤 픽셀 단위로 동일하게 보이는지는 별도의 엔진 버전·골든 이미지 계약이 필요하다.

## 벤치마킹과 반영

| 참고 도구 | 공식 자료에서 확인한 패턴 | 이번 반영 또는 남은 항목 |
| --- | --- | --- |
| Procreate | 속성, 설정, 시험 캔버스의 3영역; 브러시 속성·입력 매핑; 듀얼 브러시 | 독립 작업 공간과 조합/비교 분리. 모든 캐리어를 재현하는 라이브 시험 캔버스는 아직 미구현 |
| CLIP STUDIO PAINT | 상세 도구 속성, 별도 듀얼 팁, 질감, 필압·속도·틸트 매핑, 일부 조합 제한 | 독립 속성 슬롯과 매체 호환성 구분. 경쟁사의 엔진·브러시 포맷을 그대로 실행한다고 주장하지 않음 |
| Photoshop | 촉·질감·산포·듀얼 브러시, 프리셋 변경 시 속성 잠금 | 마음에 드는 속성을 고정하고 변형만 탐색. 새 Lab 잠금은 후보 소스 선택에 적용 |
| Krita | 서로 다른 목적을 가진 다수의 브러시 엔진 | 캐리어와 그 위에 얹는 이동 가능한 속성을 구분. 모든 엔진을 무작정 동일 합성기로 실행하지 않음 |
| perfect-freehand | 스트로크 외곽선 생성, 실필압과 시뮬레이션 필압의 구분 | 기하 생성 라이브러리는 수채 물성 엔진과 같은 계층이 아님을 설계 원칙으로 명시 |

공식 자료:
- Procreate Brush Studio: https://help.procreate.com/procreate/handbook/brushes/brush-studio
- Procreate Dual Brush: https://help.procreate.com/procreate/handbook/brushes/dual-brush
- CLIP STUDIO custom brush settings: https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm
- CLIP STUDIO dual brush details: https://help.clip-studio.com/en-us/manual_en/810_subtools/Number.htm
- Photoshop custom brush settings and locking (2026-02-23 update): https://helpx.adobe.com/photoshop/desktop/apply-painting-techniques/brushes-presets/create-brush-set-painting-options.html
- Photoshop texture / dual brush: https://helpx.adobe.com/photoshop/using/creating-textured-brushes.html
- Krita brush engines: https://docs.krita.org/en/reference_manual/brushes/brush_engines.html
- perfect-freehand: https://github.com/steveruizok/perfect-freehand
- p5.brush: https://github.com/acamposuribe/p5.brush

Canva에서는 기존 `ToonStudio Brush Lab — 조합형 제작실 UI 설계 시안`을 발견했다. 텍스트 추출 결과가 비어 있어 해당 시안의 상세 시각 내용을 검증하거나 수정했다고 보지는 않는다. Context7에서는 perfect-freehand의 실필압과 외곽선 생성 계약을 확인했다. 별도의 Deep Research 플러그인은 검색 결과에 없어 공식 자료를 직접 조사했다.

## 엔진·라이브러리 조합의 확장 설계

최대 조합 수를 만들려면 모든 라이브러리를 동시에 켜는 UI보다, **단계별 계약과 호환성**이 먼저 필요하다. 아래 내용은 추가 어댑터 구현의 설계이며 이번 브랜치에서 새 외부 엔진을 도입했다는 뜻이 아니다.

1. 입력 단계: 원시 PointerEvent, 실필압 우선, 속도 추정, 기울기·회전, 손떨림 보정. 여기서는 입력 의미와 시간 단위를 고정한다. 보정기를 두 개 직렬 연결하면 지연이 누적되므로 명시적인 선택 관계를 둔다.
2. 기하 단계: 스트로크 외곽선, 곡선 피팅, 리샘플링, 리본·입자 경로. perfect-freehand, Paper.js, bezier-js, fit-curve, simplify-js 등은 필요한 작업별 어댑터 후보이며 전부 브러시 물성 엔진인 것은 아니다.
3. 도포 단계: 하나의 기본 캐리어를 권위로 선택한다. 입자 스탬프, 리본·붓털, 수채 등 기존 캐리어는 같은 속성의 지원 범위가 다를 수 있다.
4. 재질 단계: 알파 팁·듀얼 팁·추가 팁 레이어, 종이·그레인, 안료, 건조·소모·릴리프. 충돌 없는 프로그램은 순서가 고정된 패스로 조합하고, 서로 다른 정착 권위는 동시 활성화를 금지한다.
5. 표시·가속 단계: Canvas2D, Pixi, CanvasKit/Skia, Vello 계열은 각각의 백엔드 계약과 테스트가 필요한 대상으로 관리한다. 패키지 설치만으로 모든 브러시가 해당 백엔드에서 동등하게 작동한다는 뜻은 아니다.
6. 외부 예술 엔진: p5.brush 등은 별도 컨텍스트, 라이선스·배포 조건, 재생·내보내기, 컨텍스트 소실 복구까지 검토한 뒤 기능 플래그로 도입한다. 이번 변경에는 새 p5/GPU 실행 토글을 만들지 않았다.

다음 확장의 capability manifest에는 `id`, `version`, `stage`, `supportedInputs`, `supportedTraits`, `requires`, `excludes`, `backendSupport`, `deterministicReplay`, `exportSupport`, `licenseReview`, `costClass`를 두는 것이 적절하다. 선택 전에 호환성 이유를 계산하고, 렌더러가 실제 소비하는 설정만 활성화해야 한다. UI용 설명과 엔진의 실행 조건을 별도 배열로 복제하지 않는 것이 중요하다.

추천 조합 예시는 구현 완료 주장과 구분한다. 웹툰 펜선은 낮은 지연의 입력 보정 + 외곽선/입자 캐리어 + 테이퍼; 연필은 입자 도포 + 종이 고정 그레인 + 압력에 따른 농도; 자연 수채는 수채 캐리어 + 하나의 정착 권위; 임파스토는 유화 캐리어 + 붓털 + 소모 + 릴리프; 장식 브러시는 스탬프 + 듀얼 팁 + 방향·산포가 된다. 실제 결과는 동일 시험 스트로크로 비교해야 한다.

## 검증 상태와 실행 명령

로컬에서 실행한 것:
- 순수 `brush-lab-recipe.ts`의 TypeScript strict 검사 통과.
- 저장소용 레시피 테스트 16개를 Node의 `node:test` 하네스로 실행하여 16/16 통과. Vitest 패키지가 있는 전체 앱에서 실행한 결과와 구분한다.
- 새 페이지·어댑터·라우트의 TypeScript 파서/트랜스파일 구문 검사 통과. 이것은 앱 전체 타입 검사나 번들 빌드가 아니다.

추가한 앱 통합 회귀 테스트:
- 실제 기본 캐리어 존재
- 엔진 프로그램 JSON 왕복
- 캐리어 교체 시 프로그램 초기화
- 지우개 혼입 거부
- 다른 캐리어의 레시피 거부
- 빈 레시피 적용의 정체성 유지
- 파일 크기·미래 버전·알 수 없는 캐리어 거부

저장소 환경에서 실행할 명령:
```sh
pnpm exec vitest run tests/lib/studio-brush-lab-recipe.test.ts tests/lib/studio-brush-lab-runtime.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec eslint src/domains/creator/brush-lab src/app/routes/groups/creator.routes.tsx tests/lib/studio-brush-lab-*.test.ts
```

## 배포 전 반드시 남은 확인

- 앱 전체 타입 검사·린트·기존 회귀 테스트·프로덕션 번들 결과.
- 실브라우저에서 독립 URL 새로고침, 기본·확장 카탈로그, 상세 모달, 파일 다운로드/가져오기, 저장 후 캔버스 재선택.
- 데스크톱·태블릿·모바일 확대, 키보드 포커스, 실제 펜 장치의 필압·틸트.
- 같은 입력 스트로크를 실제 각 캐리어에서 재생하는 통합 시험 패드. 현 비교 화면은 공통 도장·펜촉·동역학 SVG이며 전체 불투명도·유화 릴리프·수채 정착·최종 합성을 포함하지 않는다.
- 장시간 그리기, GPU 컨텍스트 소실, OPFS 불가 환경, 저장 용량 부족. 품질 점수와 mark/dab 추정치를 측정된 성능으로 보고하지 않는다.
- 기존 편집기 안의 제작실 진입점 및 프로젝트를 잃지 않는 양방향 적용 경로. 현재 캔버스 열기는 새 탭이고 자동 브러시 적용은 하지 않는다.
- 공통 JSON writer와 브러시 동등성 비교의 enginePrograms 누락을 전역에서 수정하고 기존 내보내기 화면까지 검증.

작업 PC가 오프라인인 상태였으므로 로컬 미커밋 파일을 수정하지 않았다. 이 변경은 별도 기능 브랜치에서 검토하며, 검증하지 않은 상태로 보호된 main을 우회하거나 배포하지 않는다.
