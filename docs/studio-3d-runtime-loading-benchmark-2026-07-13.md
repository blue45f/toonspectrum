# Studio 3D 런타임 지연 로딩·WebGPU 단계 도입 벤치마크

작성일: 2026-07-13
대상: `/studio` 초기 정적 JavaScript, 3D 배경 편집기 활성화 경계, WebGPU/Babylon 도입 결정

## 결론

프로덕션 3D 엔진은 **Three.js + React Three Fiber(R3F)를 유지하되 사용 시점에만 로드**한다.
3D 캡처 이미지의 도구·장면 메타데이터는 렌더러 무의존 모듈로 분리했고, 실제 primitive 생성과
`StudioBackground3D`, R3F, Three.js는 3D 배경 조작 의도가 생기기 전까지 Studio 정적 import
폐쇄에 포함되지 않는다.

WebGPU는 즉시 기본 렌더러로 전환하지 않는다. 렌더러와 무관한 비동기 캡처 어댑터와 WebGL 기준
pixel diff를 먼저 구축한 뒤, 대표 장면에서 Three `WebGPURenderer`를 점진적으로 비교한다. Babylon.js는
[기존 격리 번들 ADR](./studio-babylonjs-adoption-evaluation-2026-07-11.md)의 이중 엔진 비용이 해소되지
않았으므로 프로덕션 의존성에 추가하지 않고 lab-only 후보로 유지한다.

## production manifest 실측

동일한 Vite 8 production manifest에서 `StudioPage.tsx`를 루트로 잡고 `imports`만 재귀 순회했다.
`dynamicImports`는 초기 정적 폐쇄에서 제외했으며, 각 방출 JS 파일의 실제 byte와 Node.js gzip 결과를
합산했다.

| 구분 | 직전 배치 | 3D 분리 후 | 변화 | CI 예산 |
| --- | ---: | ---: | ---: | ---: |
| Studio 정적 청크 수 | 125 | **124** | -1 | 정보값 |
| Studio raw | 2,948,329B | **2,224,408B** | -723,921B (-24.6%) | 2,350,000B |
| Studio gzip | 893,614B | **710,282B** | -183,332B (-20.5%) | 750,000B |
| 앱 공통 청크 수 | — | **6** | — | 정보값 |
| 앱 공통 raw | 442,894B | **443,257B** | +363B | 500,000B |
| 앱 공통 gzip | 143,863B | **143,949B** | +86B | 170,000B |

Studio 예산은 새 측정값보다 raw 125,592B(5.6%), gzip 39,718B(5.6%)의 작은 변동 여유를 둔다.
초기 모바일 경로에서 제거한 raw 723,921B와 gzip 183,332B를 일반 기능 증가가 다시 소비하지 못하게
하는 수준이다.

이 수치는 네트워크 캐시, HTTP 압축 헤더, 런타임 파싱 시간, GPU 프레임 시간을 대신하지 않는다.
초기 정적 의존성 회귀를 검출하는 repeatable build 지표이며, 3D 도구를 실제로 열었을 때의 성능은
별도 상호작용 계측 대상으로 남는다.

## 로딩 경계

1. `studio-background-3d-metadata.ts`는 장면 타입, primitive 기본값, 캡처 해시 encode/parse만
   소유하며 Three.js, React, DOM을 import하지 않는다.
2. Studio 셸은 저장된 이미지가 VRM 포저인지 3D 배경인지 판별할 때 이 경량 모듈만 사용한다.
3. `studio-background-3d-loader.ts`의 literal `import("./StudioBackground3D")`는 하나의 promise를
   공유해 hover/focus/click의 중복 요청을 합친다.
4. 3D 배경 버튼의 `pointerenter`, `pointerdown`, `focus`는 best-effort intent preload를 실행한다.
   첫 클릭 지연은 줄이되 사용자가 3D 기능에 접근하지 않으면 런타임을 요청하지 않는다.
5. preload 실패는 삼키고 캐시를 비운다. 이후 명시적 활성화는 다시 import할 수 있으므로 오래된 배포
   청크나 일시적 네트워크 실패가 영구적인 기능 고장으로 고정되지 않는다.

## CI 회귀 가드

`pnpm run check:studio-bundle`은 크기 예산과 함께 Studio 정적 폐쇄에서 다음 식별자가 발견되면
실패한다.

- `studio-background-3d-primitives`
- `StudioBackground3D`
- `react-three-fiber`
- `three.module`

SVG/PSD 엔진과 앱 공통 인트로의 기존 정적 유입 가드도 유지한다. 이름 가드는 작은 청크 재배치로 총
크기가 예산 아래에 남는 경우에도 잘못된 static import를 즉시 설명하고, byte 예산은 이름이 바뀌거나
새 대형 의존성이 유입되는 경우를 함께 막는다.

## WebGPU 단계 도입 결정

Three.js의 공식 [WebGPURenderer 안내](https://threejs.org/manual/en/webgpurenderer)는 WebGPU를 우선
사용하고 필요할 때 WebGL 2로 폴백하는 렌더러, 비동기 초기화와 새 셰이딩 경로를 설명한다. R3F의 공식
[Canvas 문서](https://r3f.docs.pmnd.rs/api/canvas)는 `gl` 팩토리가 promise를 반환할 수 있으며
`WebGPURenderer`를 `await renderer.init()` 뒤 제공하는 구성을 예시한다. 따라서 현재 R3F 씬을 버리고
두 번째 프레임워크를 도입하지 않아도 격리된 WebGPU 실험이 가능하다.

다만 현재 3D 배경의 제품 계약은 단순 화면 표시가 아니라 PNG 캡처, 선화 결과, 장면 해시 round-trip,
undo/redo, 모바일 WebGL fallback까지 포함한다. 다음 순서를 통과하기 전에는 렌더러를 바꾸지 않는다.

1. 캡처 호출을 `Promise` 기반 renderer-independent adapter로 추출한다.
2. 대표 primitive·커스텀 모델·조명 장면의 WebGL 기준 이미지를 만들고 pixel diff 허용치를 고정한다.
3. 같은 문서에서 캡처, 재편집 해시, undo/redo 결과가 렌더러에 관계없이 동일한지 검증한다.
4. 지원 브라우저에서는 Three WebGPU를 비동기 초기화하고, 초기화·장치 손실 실패 시 사용자 데이터
   손실 없이 WebGL로 복구한다.
5. 실기기 frame time, 메모리, 캡처 시간과 활성화 시 다운로드 비용이 기존 WebGL 경로보다 유의하게
   나을 때만 점진 배포한다.

## Babylon.js 경계

Babylon의 공식 [WebGPU 지원 문서](https://doc.babylonjs.com/setup/support/webGPU/)는 비동기 엔진
초기화와 WebGPU 지원 범위를 제공하고, 공식 [ES6 패키지 문서](https://doc.babylonjs.com/setup/frameworkPackages/es6Support)는
모듈 단위 import와 tree-shaking 구성을 안내한다. 엔진 자체의 기능 부족이 보류 이유는 아니다.

현재 저장소의 격리 PoC에서는 Babylon creator WebGL 시작 경로가 1,278,690B raw / 305,625B gzip,
WebGPU-only 시작 경로가 1,127,507B / 270,933B였다. 이미 Three/R3F/VRM 생태계를 유지해야 하는
프로덕션에 이를 병행하면 두 씬 그래프와 렌더러가 공존한다. 그러므로 Babylon은 다음 조건에서만
`/labs` 독립 번들로 재검토한다.

- Babylon 고유 WebGPU/compute 기능이 구체적인 제품 장면에서 필요함
- 기존 Three 경로를 한 하위 시스템 전체에서 제거할 수 있음
- 동일 캡처·round-trip·fallback 계약을 지키면서 ADR의 성능/번들 채택 기준을 통과함

프로덕션 결론은 **Three/R3F on-demand**, WebGPU는 **캡처 어댑터와 pixel diff 이후 단계 도입**,
Babylon은 **lab-only**다.
