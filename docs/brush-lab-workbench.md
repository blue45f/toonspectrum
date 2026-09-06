# Brush Lab — 독립 조합형 브러시 제작실

검토일: 2026-09-06 (Asia/Seoul). 저장소: `blue45f/toonspectrum`, PR #786.
구현 기준: `bbcc48d542ca1fa11658ff277861181946d9d097`.
이 문서는 구현된 기능, 기존 기능의 재사용, 아직 구현되지 않은 확장을 구분한다.

## 라우트 결정

독립 제작실은 **`/studio/brush-lab`** 이다. 초기 초안의 `/studio/brushes` 등록은 기존 문서 편집기의 브러시 화면을 가로채므로 수정했다. `/studio/brushes`와 나머지 `/studio/*` 경로는 기존 StudioRouter 소유로 유지한다. 제작실은 별도 지연 로딩하되 브러시 상세 편집기, 속성 병합 함수, 물성 프로그램 UI, 정규화, 제품 브러시 저장소를 재사용한다.

권장 정보구조는 빠른 설정과 선택은 작품 캔버스, 깊은 제작과 실험은 별도 제작실이다. 이번 브랜치는 제작실의 독립 URL을 제공하지만 기존 편집기 메뉴의 새 진입 버튼, 작품별 scoped route, 편집 문서로 즉시 적용하는 handoff는 추가하지 않았다. 캔버스 열기는 새 탭으로 동작한다.

## 현재 구현 및 재사용

실제 페인트 카탈로그에서 기본 도포 방식인 캐리어를 선택한다. 확장 카탈로그는 지연 로딩하고 실패 시 기본 목록과 재시도를 제공한다. 8개 속성은 촉, 듀얼 촉, 종이·그레인, 색상·안료, 크기·불투명도, 도포·간격, 산포·방향, 시작·끝 테이퍼다. 서로 다른 브러시의 속성을 선택한 뒤 명시적으로 적용한다. 공통 입자 동역학을 지원하지 않는 캐리어는 해당 조합을 비활성화한다.

잠금, uint32 시드, 변경 속성 수, 4/8/12개의 최대 후보 수를 제공한다. 검색 결과의 ID 순 최대 256개 소스를 사용하며 탐색 시도에도 상한이 있다. 변경 가능한 행에서는 현재 소스와 다른 소스만 선택해 요청한 변경 수가 실제로 줄어드는 문제를 수정했다. 잠김 또는 대안이 없는 행은 보존한다. 완성 스냅샷 기준 중복도 제거하지만 서로 다른 설정이 시각적으로 다르다는 보증은 아니다.

후보는 사용자가 고르기 전까지 적용하지 않는다. 비동기 작업의 취소·진행 표시·요청 세대 검사를 제공한다. 취소 후 늦게 도착한 결과를 폐기하고 다음 소스 로드를 시작하지 않는다. 이미 진행 중인 dynamic import 자체가 중단된다고 주장하지 않는다. 후보 생성 배치 안에서는 같은 소스 로드를 공유한다.

기준 A 고정/복원, 현재 B 비교, 브러시 상태 undo/redo를 제공한다. 기록은 방향별 최대 24개, 양방향 합계 UTF-16 JSON 직렬화 추정 2MiB로 제한한다. 현재 브러시는 버리지 않는다. 큰 팁에서는 보관 단계가 줄며, 예산보다 큰 인접 상태를 건너뛰어 잘못 복원하지 않는다. 이는 실제 JS heap 측정값이 아니다. 같은 상태를 다시 적용할 때 불필요한 기록을 만들거나 redo를 지우지 않는다.

기존 상세 편집기의 PNG 촉, 필압·속도·기울기·질감 설정과 기본값 복원을 재사용한다. 유화는 기존 3개 물성 패스의 8개 조합 UI를 그대로 사용한다. 새로 중복된 유화 카드/행렬 모듈은 제거했다. 수채도 기존 프로그램 선택기와 블룸/정착 베이크의 동시 적용 제한을 재사용한다. 8개 조합은 8개의 새 외부 렌더링 엔진이 아니다.

공통 입자 미리보기는 호환 캐리어의 촉·동역학 비교용이다. 유화·수채를 동일한 간이 미리보기로 재현하는 것처럼 표시하지 않는다. 전체 불투명도, 혼색, 릴리프, 정착, 최종 합성은 실제 캔버스 검증이 필요하다. 실행 비용 패널도 설정 기반 추정이며 실제 프레임 시간이나 화질 벤치마크가 아니다.

## 저장과 호환성

완성 브러시 JSON과 제작 작업 파일을 구분한다. 네이티브 브러시 파일은 1MiB 이내이며 전체 스냅샷과 enginePrograms를 보관한다. 작업 파일은 3MiB 이내, schema version 1, generator revision 2로 현재 브러시, A 기준, 현재 8개 소스 선택, 잠금, 시드를 보관한다. 내부 각 브러시도 1MiB 제한과 네이티브 검증을 통과해야 한다. UTF-8 바이트 기준 상한을 적용한다.

작업 파일은 모든 과거 조합 이력, 후보 목록, 검색어, 변경 속성 수, 후보 수, 소스 카탈로그 버전 전체를 저장하지 않는다. 적용된 조합은 구체화된 스냅샷에 남고, 적용 후 소스 선택은 비운다. 카탈로그 또는 엔진 버전이 바뀐 뒤 후보·픽셀을 완전히 동일하게 재생하려면 자산 해시와 렌더러 버전까지 보관하는 별도 계약이 필요하다.

미래 버전, 잘못된 캐리어, 다른 매체 계열 프로그램, 수채 블룸/정착 충돌, 등록되지 않은 수채 프로그램 ID를 거부한다. 정규화로 보정되는 필드는 안내한다. 가져오기에 실패하면 현재 브러시를 덮어쓰지 않는다. 다운로드 요청을 보낸 것을 디스크 저장 완료로 간주하지 않으며 브라우저 종료 경고를 자동 해제하지 않는다. URL과 타이머는 해제한다.

기존 SQLite 제품 저장소를 사용하는 저장 카드를 재사용한다. 세션 대체 저장 경고는 유지한다. 새 저장소를 중복 도입하지 않는다.

검토 기준의 공통 writeBrushJson은 enginePrograms를 출력하지 않고 brushMatchesSnapshot 비교에도 해당 필드가 없다. Lab export 어댑터는 이 프로그램을 명시적으로 포함해 Lab 내보내기의 유실을 막는다. 공통 writer/동등성 비교의 전역 수정과 전체 호출부 회귀 검증까지 완료한 것은 아니다. 이 문제는 별도 추적이 필요하다.

## 공식 벤치마크에서 채택한 원칙

| 도구 | 참고할 강점 | 적용 판단 |
| --- | --- | --- |
| Procreate Brush Studio | 속성·설정·시험 패드의 분리, 설정 변경을 실제 시험 획에 반영 | 제작 공간 분리. 모든 매체를 실제 렌더링하는 시험 패드는 남은 핵심 과제 |
| CLIP STUDIO PAINT | 상세 속성, 이중 팁, 입력 매핑, 혼색 방식별 제한 | 조합 가능 여부를 명시. 듀얼 브러시는 Smear만 지원하는 사례처럼 모든 기능의 무조건 교차 조합은 피함 |
| Photoshop | 팁·질감·산포·듀얼 브러시 구성 | 팁 합성과 물감 혼색을 다른 단계로 모델링 |
| Krita | 서로 다른 용도의 브러시 엔진 | 기본 도포 엔진과 이동 가능한 속성을 분리 |

참고 자료는 기능 원리와 정보구조의 벤치마크다. 경쟁사의 엔진 코드, 상용 브러시 파일, UI 에셋을 복제한 작업이 아니다.

## 외부 엔진·라이브러리 확장 설계 — 아직 통합하지 않음

제안 파이프라인은 `입력 → 경로 → 팁/마스크 → 질감 → 매체/안료 → 합성 → 표시 백엔드`다. 각 단계마다 입력·출력, 시간/길이 단위, 알파, 색 공간, 시드, 소유 자원과 정리 방법을 정한다. 단순 팁 마스크 합성은 중첩할 수 있지만, 캔버스를 읽고 쓰는 두 습식 시뮬레이터는 상태와 실행 순서 계약 없이 동시에 켜지 않는다.

| 후보 | 적합한 역할 | 도입 조건 |
| --- | --- | --- |
| 기존 ToonStudio 코어 | 현재 브러시·문서·저장과 호환되는 기본 도포 | 가장 먼저 미리보기와 최종 출력의 같은 렌더 경로를 확보 |
| perfect-freehand | 압력 기반 획 외곽선 생성 | 실필압과 모의 필압 구분. 수채·종이·안료 엔진으로 표시하지 않음 |
| p5.brush standalone | 절차적 브러시, 해칭, 수채 채움, 흐름장 표현 | 공식 standalone은 p5.js 없이 WebGL2 사용. 별도 어댑터에서 좌표·시드·렌더 flush·수명 주기를 검증 |
| libmypaint | 실제 브러시 도포 라이브러리 | WASM 빌드와 표면 콜백·타일 변경·입력 바인딩을 구현/검증해야 함. 라이브러리는 ISC 라이선스이며 배포 자산은 별도 확인 |
| PixiJS | GPU 표시·합성 백엔드 후보 | WebGL/WebGPU 지원과 앱의 브러시 물성 구현은 별개. 백엔드 전환 전 표현·성능 검증 |
| CanvasKit/Skia | 경로·텍스트·래스터 그래픽 백엔드 후보 | WASM·GPU 자원 관리, 문서 출력과의 일치성 검증. 설치만으로 자연 물감 시뮬레이션이 생기지 않음 |

모든 패키지를 동시에 넣는 것보다 실제 새로운 표현을 만드는 어댑터부터 추가한다. 우선순위는 네이티브 시험 패드 일치성, p5.brush standalone 표현 확장, libmypaint WASM 타당성 검증이다. PixiJS/CanvasKit은 기존 렌더러를 교체할 근거가 확인될 때 선택한다. 이 PR은 외부 라이브러리 의존성을 추가하지 않았다.

후속 capability manifest에는 `id`, `version`, `stage`, `supportedInputs`, `supportedTraits`, `requires`, `excludes`, `backendSupport`, `replaySupport`, `exportSupport`, `assetHashes`, `licenseReview`를 둔다. 사용자가 요청한 백엔드와 실제 실행 백엔드, fallback 사유를 구분한다. UI용 가짜 엔진 목록을 렌더러와 별도로 복제하지 않는다. 임의 원격 JavaScript나 셰이더를 브러시 파일에서 실행하지 않는다.

## 검증 증거와 남은 게이트

이번 보강의 순수 로직 회귀 테스트 13개는 기존 코드에서 5개 통과/8개 실패, 수정 후 13개 통과했다. 작업 파일 계약 테스트 6개를 더해 최종 19개가 통과했다. 로컬 Node 22.16 환경에서 TypeScript를 변환하고 Vitest의 describe/it만 node:test로 치환해 실행했다. 제품 Vitest 환경을 실행한 결과라고 주장하지 않는다.

순수 recipe/workspace 모듈과 두 테스트 파일의 strict TypeScript 검사는 로컬 테스트 러너 선언을 사용해 통과했다. 변경된 React 페이지와 runtime은 TypeScript 구문 변환 진단 0개를 확인했다. 이는 전체 React 앱의 의미적 typecheck, ESLint, 빌드, 브라우저 테스트 통과가 아니다. 실제 프로젝트는 Node >=24.16.0과 pnpm 11.4.0을 요구한다.

원격 개발 장비가 연결되지 않았고 컨테이너에서 전체 저장소와 의존성을 확보하지 못했다. 전체 CI의 core/verify, 빌드, 실제 필압 장치, 시각적 전수 검수, 장시간 메모리 측정은 확인이 필요하다. 필수 체크 우회나 main 강제 병합은 하지 않는다.

프로젝트 환경에서 실행할 집중 검증:

```sh
pnpm exec vitest run tests/lib/studio-brush-lab-recipe.test.ts tests/lib/studio-brush-lab-runtime.test.ts tests/lib/studio-brush-lab-hardening.test.ts tests/lib/studio-brush-lab-workspace.test.ts
pnpm run validate:architecture
pnpm run lint
pnpm run typecheck
pnpm run build
```

추가 브라우저 게이트는 독립 라우트 새로고침과 기존 /studio/brushes 보존, 가져오기/내보내기/취소, 큰 PNG 팁 편집, A/B/undo/redo, 마우스·펜·터치, DPR·확대율, 컨텍스트 소실/복구, 장시간 반복 획, 최종 저장·다시 열기·내보내기의 동일 표현이다. 이 체크리스트는 아직 실행 완료하지 않았다.

Canva에서는 기존 Brush Lab 시안을 찾았으나 상세 시각 검수·편집을 완료하지 않았다. Context7으로 perfect-freehand와 p5.brush 문서를 조회했다. Deep Research 전용 실행 기능은 이번 연결의 검색에서 조회되지 않아 공식 문서 조사로 보완했다.

## 공식 출처

- Procreate: https://help.procreate.com/procreate/handbook/brushes/brush-studio
- CLIP STUDIO 설정: https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm
- CLIP STUDIO 혼색 제한: https://help.clip-studio.com/en-us/manual_en/240_brushes/Blending_tools.htm
- Photoshop 팁/질감/듀얼: https://helpx.adobe.com/photoshop/using/creating-textured-brushes.html
- Krita 엔진: https://docs.krita.org/en/reference_manual/brushes/brush_engines.html
- perfect-freehand: https://github.com/steveruizok/perfect-freehand
- p5.brush: https://github.com/acamposuribe/p5.brush
- p5.brush standalone: https://github.com/acamposuribe/p5.brush/blob/main/docs/standalone.md
- libmypaint: https://github.com/mypaint/libmypaint
- PixiJS: https://pixijs.com/8.x/guides/components/renderers
- CanvasKit: https://skia.org/docs/user/modules/canvaskit/
