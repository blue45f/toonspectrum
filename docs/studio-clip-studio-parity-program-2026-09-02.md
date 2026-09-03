# ToonSpectrum Studio × Clip Studio Paint 기능 패리티 프로그램

- 기준일: 2026-09-02
- Clip Studio Paint 기준: Ver. 5.1.2 (2026-08-06 공개)
- 제품 기준: `blue45f/toonspectrum`의 `/studio`
- 목표: 기능 이름 복제가 아니라 웹 기반 창작 도구로서 동등하거나 더 나은 작업 결과와 사용자 여정을 제공

## 1. 기준 자료

공식 공개 자료만 기능 기준의 1차 출처로 사용한다.

- 최신 릴리스 노트: https://www.clipstudio.net/en/dl/release_note/latest/
- 전체 릴리스 노트: https://www.clipstudio.net/en/dl/release_note/
- 공식 기능 페이지: https://www.clipstudio.net/en/functions/
- 공식 사용 설명서: https://help.clip-studio.com/en-us/manual_en/

저장소 내부 현재 상태는 다음 문서와 실제 코드/테스트를 함께 대조한다.

- `docs/studio-capability-audit-2026-07-12.md`
- `docs/studio-web-drawing-benchmark-2026-07-12.md`
- `docs/studio-competitor-features.md`
- `docs/reports/toonstudio-v12-final-evidence-2026-08-09.md`
- `package.json`의 `verify:studio-*` 명령

문서에 `완료`라고 적혀 있어도 현재 UI 진입점, 저장/복원, Undo/Redo, 오류 경계, 테스트 증거가 끊겼으면 다시 `부분`으로 내린다.

## 2. 판정 상태

- `완료`: 실제 UI→실행→저장/복원→오류 처리→검증까지 연결
- `부분`: 핵심 동작은 있으나 설정·정밀도·호환성·작업 흐름 중 격차가 있음
- `기반`: 코어/후보/실험 구현은 있으나 사용자 동선에 연결되지 않음
- `미구현`: 실행 가능한 제품 코드가 없음
- `외부 필요`: 모델, OAuth, 유료 API, 라이선스 또는 별도 서버가 필수
- `감사 필요`: 이름이 유사한 구현은 발견됐지만 패리티 증거가 불충분

## 3. 우선순위 규칙

### P0 — 데이터 손실·작업 중단

- 프로젝트 파일 손상
- 자동 저장/복원 실패
- Undo/Redo 불일치
- 빈 캔버스 또는 committed scene 누락
- WebGPU device lost 이후 복구 불가
- 내보낸 파일의 픽셀·레이어·색상 손실
- 모바일/인앱 브라우저에서 Studio 진입 불가

### P1 — 주력 제작 흐름의 핵심 격차

- 브러시 품질과 입력 지연
- 벡터 선화와 선 수정
- 선택·변형·마스크·클리핑
- 프레임·말풍선·텍스트·웹툰 페이지
- 소재 검색·등록·재사용
- 3D 포즈·카메라·배경·선화 추출
- 애니메이션 타임라인과 출력
- PSD/이미지/프로젝트 포맷 왕복
- 색 관리와 인쇄/플랫폼 출력

### P2 — 전문가 생산성·고급 품질

- Auto Action/매크로
- Quick Access/Command Bar 사용자화
- 다중 창·보조 화면·Companion
- 팀 작업과 역할/잠금/커서
- 고급 필터·조정 레이어·비파괴 편집
- 3D texture paint, mesh snap, UV 관련 도구
- 플러그인·외부 도구·클라우드 연동

## 4. Clip Studio Paint 5.0/5.1 신규 기능 감사 큐

아래 항목은 최신 버전 기준으로 반드시 현재 구현을 다시 확인한다. 초기 상태는 의도적으로 `감사 필요`로 둔다.

| 기능군 | Clip Studio 기준 동작 | 초기 판정 | ToonSpectrum 완료 조건 |
| --- | --- | --- | --- |
| Smart Shape | 브러시 스트로크 끝을 길게 눌러 직선·곡선·도형으로 보정하고 이후 편집 | 감사 필요 | 일반 브러시에서 hold 감지, 도형 후보 선택, 제어점 편집, raster/vector 출력, Undo/Redo, zoom/rotation 좌표 검증 |
| Smart Shape 명령 | 최근 stroke 보정, edit mode 진입, Command Bar/단축키 실행 | 감사 필요 | 메뉴·명령 registry·단축키·최근 stroke transaction 연결 |
| 3D hand model | 손 모양 조절, pose material, scanner, drawing figure에 부착 | 감사 필요 | 독립 손 모델, finger joint 편집, 좌우 mirror, 손 포즈 저장, VRM/drawing figure attachment, 저장 복원 |
| 3D surface painting | 다양한 3D 객체/캐릭터 표면에 직접 그림 | 부분 가능성 | UV hit-test, brush projection, seam 처리, texture undo, texture export, device lost 복구 |
| 3D texture batch export | 사용자 3D 모델의 texture 일괄 출력 | 감사 필요 | 모든 material/slot별 원본 해상도 export와 manifest |
| Height fog | 높이에 따른 위/아래 방향 fog | 감사 필요 | WebGPU/WebGL2 동일 파라미터, camera/scene 저장, 캡처 패리티 |
| Multi-layer tonal correction | 여러 레이어에 색 보정을 개별 적용 | 감사 필요 | multi-selection, per-layer processing, 취소 원자성, Undo/Redo, mask/locked layer 규칙 |
| Raster transform performance | raster 변형 처리 가속 | 부분 가능성 | 대형 레이어 이동/회전/mesh warp 벤치마크와 픽셀 패리티 |
| Recently used materials | 최근 사용 소재 폴더 | 감사 필요 | 실제 사용 이벤트 기반 MRU, 영속화, 삭제/복구, 동기화 안전성 |
| Material frequency sort | 사용 빈도순 정렬 | 감사 필요 | 결정적 count, 동일 count tie-break, 대량 catalog 성능 |
| Material source location | 등록 폴더 표시와 이동 | 감사 필요 | catalog breadcrumb, folder 이동, 중복/삭제/권한 오류 처리 |
| Tool-linked popup palettes | 선택 도구의 tool group/property/color palette 즉시 팝업 | 감사 필요 | 사용자 설정, 포인터/키보드 접근, viewport clamp, 모바일 대체 UI |
| Per-operation recovery | 매 작업마다 복구 데이터를 순차 기록 | 부분 가능성 | command commit과 recovery journal 원자 연결, crash fixture, replay idempotency |
| Draft layer batch toggle | 보이는 draft layer 전체 숨김 후 이전 상태 복원 | 감사 필요 | tri-state snapshot, 새 레이어 생성 중 동작, Undo/Redo와 저장 경계 |
| Watercolor edge vivid style | 고대비 선명한 watercolor edge | 감사 필요 | brush/layer border 양쪽 지원, WebGPU/committed parity, 확대 시 halo 회귀 없음 |
| Glow filter | 밝은 영역 발광 | 감사 필요 | 선택 영역, alpha, color space, preview/commit, GPU/CPU fallback |
| Inflate filter | 부풀린 질감 효과 | 감사 필요 | scale-aware displacement/shading, edge handling, preview/commit |
| Drop shadow filter | 즉시 그림자 효과 | 감사 필요 | offset/blur/spread/color/alpha, selection, layer bounds, non-destructive 후보 |
| Lab color sliders | L*a*b* 값 입력·표시·slider 기준 선택 | 감사 필요 | D50/D65 정책 명시, RGB↔Lab round-trip, gamut 표시, 색 관리 일관성 |
| 3D head replacement | figure head 숨김 및 head model parent-child 대체 | 감사 필요 | bone/socket attachment, show/hide, scale, shadow/light 일치, 저장 복원 |
| 3D hand/head drag attachment | figure 위 드롭 시 자동 parent-child 관계 | 감사 필요 | hit target, socket 선택, undoable hierarchy mutation, outliner 표시 |
| Follow-camera light | 카메라 방향을 따라 directional light 유지 | 감사 필요 | camera orbit 중 light update, keyframe 정책, export/capture 일치 |
| Material search filters | 이름·catalog·사용자 tag 분리 검색 | 감사 필요 | indexed search, filter chips, URL/state restore, keyboard flow |
| Material folder top pin | 즐겨 쓰는 폴더 상단 고정 | 감사 필요 | local persistence, reorder, mobile behavior |
| Material subtree display | 하위 폴더/소재 표시 방식 전환 | 감사 필요 | tree flatten 정책, 가상 스크롤, 검색과 조합 |
| Mesh transform editing | 이동 후에도 mesh point 수 변경, 다중점 bounding box 회전 정렬 | 감사 필요 | non-destructive remesh 또는 명시적 resample, selection transform, undo |
| Border effect opacity | 반투명 stroke 내부 edge 반영 개선 | 감사 필요 | premultiplied-alpha 규칙, raster/vector/mask 비교 fixture |
| Timelapse long presets | 120/180/300초 출력 | 감사 필요 | duration presets, frame sampling, memory bounded export, cancel/resume |

## 5. 장기 기능 도메인 기준표

### 5.1 브러시 엔진

감사 항목:

- brush tip image와 tip sequence
- spacing, scatter, angle, flip, rotation dynamics
- pressure/tilt/twist/speed/random 입력 매핑
- dual brush 조합 모드
- texture brightness/contrast와 blend mode
- color jitter와 stroke 단위 randomize
- paint amount, density, color stretch, smear, wet mixing
- watercolor edge, post correction, starting/ending taper
- stabilization과 input prediction
- ribbon, bristle, particle, spray, decoration, pattern brush
- `.abr` 등 공개 형식의 합법적 import 범위
- brush preset export/import와 소재 marketplace 연결

완료 증거:

- live/committed/undo/redo 픽셀 패리티
- pressure replay fixture
- 60/120/240Hz 입력과 긴 stroke latency
- WebGPU/WebGL2/Canvas2D fallback 결과
- preset round-trip

### 5.2 레이어와 비파괴 편집

감사 항목:

- raster/vector/text/frame/3D/reference/draft layer
- folder, clipping, alpha lock, layer mask, selection layer
- correction/adjustment layer
- layer style와 border effect
- blend mode 전체 매트릭스
- search layer와 multi-select
- smart object에 준하는 linked/embedded object
- merge/flatten/convert/duplicate/ungroup
- draft 일괄 표시 전환

완료 증거:

- tree mutation의 Undo/Redo
- PSD/import/export 보존 등급 명시
- locked/hidden/clipped/masked 조합 테스트
- 1,000+ layer 가상화와 선택 성능

### 5.3 벡터 선화와 도형

감사 항목:

- vector layer brush stroke
- control point add/delete/move/corner/smooth
- line width correction, redraw, simplify, connect
- vector eraser 교차점/전체 선 삭제
- vector magnet와 snap
- Smart Shape와 figure tool 통합
- balloon/frame border vector 편집
- SVG import/export와 자체 vector codec

완료 증거:

- control point edit 후 brush appearance 유지
- rasterize 결과 기준 픽셀 fixture
- pressure profile 보존
- zoom 독립 hit-test

### 5.4 선택·변형·채우기

감사 항목:

- rectangle/ellipse/lasso/polyline/brush selection
- color range, contiguous, referenced layers
- expand/shrink/feather/border
- quick mask와 selection launcher
- scale/rotate/skew/perspective/free/mesh transform
- content-aware 또는 투명 영역 기반 smart scaling
- fill, close gap, area scaling, color margin, reference layer
- gradient, contour, pattern, screen tone fill
- liquify와 warp

완료 증거:

- preview cancel 원복
- selection/mask bounds 밖 픽셀 불변
- transform matrix round-trip
- large raster tile memory bound

### 5.5 만화·웹툰 제작

감사 항목:

- multi-page project와 page manager
- page template, cover, bleed, crop, print guides
- frame border folder와 분할/결합
- balloon 종류, tail, text linking, story editor
- focus/speed lines, saturated lines
- tone, moiré 방지, monochrome expression color
- webtoon long canvas, page split, smartphone preview
- 플랫폼별 export preset와 파일명 규칙
- binding/3D book preview
- Teamwork의 페이지 할당과 상태

완료 증거:

- 긴 문서에서 편집 성능
- page reorder와 파일명/링크 무결성
- text overflow와 세로쓰기
- 플랫폼 제한값 validation

### 5.6 3D

감사 항목:

- GLB/glTF/VRM/OBJ/FBX 지원 범위
- drawing figure, head, hand, primitive, background
- hierarchy와 parent-child attachment
- IK/FK, joint limit, pose library, hand scanner
- camera, perspective ruler, multi-view, focal length
- light, shadow, outline, cel shading, fog, panorama
- mesh/object snap와 surface placement
- texture painting, UV validation, batch export
- LT conversion 또는 line/tone/color 분리 삽입
- physics, spring bone, collision
- 3D keyframe animation

완료 증거:

- 동일 scene의 WebGPU/WebGL2 캡처 패리티
- import→edit→save→reload→export
- hierarchy mutation Undo/Redo
- model/texture resource cleanup

### 5.7 애니메이션

감사 항목:

- timeline, animation folder, cel assignment
- onion skin, light table, flipbook
- hold/linear/smooth interpolation
- 2D camera folder와 parallax
- transform/opacity/camera/audio keyframes
- frame add/delete/duplicate/reorder
- timesheet와 batch cel export
- GIF/APNG/video/image sequence
- playback range, loop, frame rate, audio sync
- long animation 메모리와 background export

완료 증거:

- frame-accurate seek
- save/reload 후 keyframe 동일성
- export frame hash fixture
- 취소 가능한 bounded-memory encoder

### 5.8 색·필터·출력

감사 항목:

- RGB/HSL/HSV/CMYK preview/Lab
- ICC profile assign/convert/embed
- soft proof와 rendering intent
- level, curve, balance, channel mixer, HSL
- gradient map, posterize, threshold, binarize
- blur/sharpen/noise/artistic/line extraction
- glow/inflate/drop shadow
- selection-aware filter와 multi-layer correction
- PNG/JPEG/WebP/TIFF/PDF/PSD/GIF/APNG/video
- print size, dpi, bleed, CMYK PDF

완료 증거:

- color-managed reference fixture
- alpha/premultiplication 불변식
- GPU/CPU filter 허용 오차
- export metadata와 profile 검증

### 5.9 작업 공간과 생산성

감사 항목:

- palette dock/tab/pop-up/resize/lock
- workspace save/switch/import/export
- command bar와 quick access 사용자화
- shortcut/modifier/tool shift
- auto action 기록·편집·재생
- multi-window canvas와 companion window
- touch gesture와 palm rejection
- navigator/sub view/color mixing/history/info palettes
- keyboard-only와 screen-reader 접근
- 125/150/200% scaling과 multi-monitor

완료 증거:

- layout persistence와 손상 복구
- 모든 핵심 조작의 focus-visible
- mobile 320/390/768과 desktop 1280/1440/1920
- popup viewport clamp와 horizontal overflow 0

### 5.10 소재·클라우드·협업

감사 항목:

- local material database와 폴더/tag/favorite/MRU/frequency
- brush/image/tone/balloon/template/pose/3D material 등록
- marketplace 검색·다운로드·버전·license/provenance
- asset dependency manifest와 누락 복구
- cloud backup와 file history
- team role, invite, page/work assignment
- presence, cursor, selection, lock, comments
- CRDT와 raster conflict strategy
- offline queue와 reconnect

완료 증거:

- 권한 하향 시 fail-closed
- 동일 자산 중복 설치와 upgrade
- offline/reconnect convergence
- provenance와 license 표시

## 6. 실행 순서

### 단계 A — 자동 검증 기반

1. 변경 파일 위험 분류기
2. 고위험 targeted gate
3. 기존 전체 CI와 연결
4. Playwright 실패 trace/screenshot 수집
5. 프리뷰 smoke와 rollback 기준

### 단계 B — P0 무결성

1. per-operation recovery journal
2. project codec version/migration corpus
3. Undo/Redo transaction 통합 감사
4. WebGPU device-lost와 fallback
5. export round-trip fixture

### 단계 C — 최신 5.0/5.1 패리티

1. Smart Shape 전체 동선
2. watercolor vivid + glow/inflate/drop-shadow
3. Lab color
4. material MRU/frequency/search/pin
5. multi-layer tonal correction
6. 3D hand/head attachment
7. 3D painting/texture export
8. follow-camera light, height fog, mesh transform

### 단계 D — 전통 핵심 기능 격차

1. vector line 편집 완성
2. adjustment/smart object에 준하는 비파괴 구조
3. comic/page/story editor 강화
4. animation timeline 완성
5. 3D LT/surface snap/texture workflow
6. macro/auto action/quick access

### 단계 E — 장시간 품질과 배포

1. 10시간 soak
2. 대형 문서·대형 레이어·대형 3D scene
3. 모바일/인앱/저사양 fallback
4. 접근성·국제화·IME
5. production preview 및 smoke
6. capability audit 갱신

## 7. 작업 단위 Definition of Done

기능 PR은 최소한 다음을 포함한다.

- 사용자 문제와 경쟁 기준
- 기능 범위와 의도적으로 제외한 범위
- 상태/문서/렌더/저장 경계
- Undo/Redo 계약
- 마이그레이션 또는 포맷 영향
- GPU/폴백 영향
- 단위 테스트
- 필요한 Playwright 또는 픽셀 증거
- 성능 전후 수치 또는 성능 비영향 근거
- 접근성·모바일 확인
- 배포 및 rollback 메모

## 8. 패리티 완료 선언 규칙

`완료`는 다음 조건을 모두 만족할 때만 사용한다.

1. 최신 공식 기능 기준표의 P0/P1 항목이 모두 완료 또는 명시적 외부 blocker다.
2. blocker는 기술적으로 검증됐고 단순 추측이 아니다.
3. 문서 상태와 제품 UI, 저장 포맷, 테스트 코드가 일치한다.
4. 기존 Studio 핵심 여정과 회귀 테스트가 통과한다.
5. 프로덕션 프리뷰에서 동일 기능이 실행된다.
6. 성능·메모리·접근성 한도를 넘지 않는다.

새 Clip Studio Paint 버전이나 브라우저/GPU 환경 변화가 확인되면 이 기준표를 다시 연다.
