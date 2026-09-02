# ToonSpectrum Studio 경쟁 기능 흡수 프로그램 — 2026-09-02

## 0. 목적

이 문서는 `docs/benchmarks/studio-competitor-registry.json`에 등록된 경쟁·인접 제품을 단순 나열하지
않고, ToonSpectrum Studio가 실제로 구현할 **제품 능력(capability)** 으로 변환한다.

벤치마크는 결과와 작업 흐름을 이해하기 위한 것이다. 다음은 흡수 대상이 아니다.

- 타사 소스코드, 셰이더, 모델 가중치, 학습 데이터, 브러시 파일, 소재, 아이콘, 상표
- 타사의 픽셀 단위 UI 복제
- 검증되지 않은 상업 이용 보증이나 라이선스 문구
- 브라우저에서 실행할 수 없거나 배포 권한이 없는 외부 서비스의 기능을 완료로 오표시하는 행위

기능은 다음 조건을 모두 만족할 때만 `완료`로 센다.

1. 실제 Studio UI에서 발견하고 실행할 수 있다.
2. 코어 엔진 또는 서버 실행 경로가 placeholder가 아니다.
3. 문서 상태가 저장·복원되거나, 비영속 기능임을 UI에 명확히 표시한다.
4. 편집 mutation은 Undo/Redo의 한 원자적 transaction으로 기록된다.
5. 실패·취소·미지원 환경의 복구 경로가 있다.
6. 단위 테스트, 통합 테스트, Playwright 실브라우저 증거가 있다.
7. 캔버스 지연, 메모리, 번들, 저장 크기 중 관련 예산을 악화시키지 않는다.
8. 배포 후 smoke와 되돌리기 기준이 있다.

## 1. 감사 범위

레지스트리는 12개 분야를 포함한다.

| 분야 | 핵심 질문 |
| --- | --- |
| 만화·드로잉 | 웹툰·만화 제작의 전 과정이 한 문서에서 이어지는가 |
| 범용 이미지 편집 | 비파괴 보정, 마스크, 스마트 객체, 포맷 왕복이 가능한가 |
| 모바일 드로잉 | 화면을 가리지 않는 제스처와 펜 중심 UX인가 |
| 자연매체 | 물·안료·점도·입체감이 stroke 상태로 유지되는가 |
| 벡터·무한 캔버스 | stroke를 그린 뒤에도 기하와 표현을 편집할 수 있는가 |
| 스토리보드 | 대본, 샷, 카메라, 타이밍, 검토가 연결되는가 |
| 2D 애니메이션 | 프레임·키프레임·카메라·오디오·출력이 연결되는가 |
| 리깅·아바타 | 변형자, 파라미터, 물리, 동작 동기화가 가능한가 |
| 3D DCC | 포즈뿐 아니라 UV·텍스처·재질·카메라·선화 변환까지 가능한가 |
| 소재 마켓 | 검색, 버전, 의존성, 라이선스, 출처가 추적되는가 |
| 협업 디자인 | presence, cursor, comment, history, branch가 작업을 방해하지 않는가 |
| 생성형 AI | 구조·마스크·레이어·참조를 보존하며 비용과 출처를 설명하는가 |

## 2. 2026-09 공식 기능 변화에서 바로 가져올 주제

### Clip Studio Paint

- Smart Shape: 펜 입력을 유지한 뒤 기본 도형으로 교정하고, 확정 후 제어점을 편집하는 흐름
- 고품질 3D 손 모델과 인체 부착
- 3D 표면 텍스처 페인팅과 텍스처 일괄 출력
- 수채 가장자리 표현과 Glow, Inflate, Drop Shadow 계열 필터
- Lab 색상 선택과 다중 레이어 색조 보정
- 소재 최근 사용·빈도·검색·상단 고정 UX
- 장시간 타임랩스 출력과 드래프트 레이어 일괄 전환

### Krita

- 캔버스 안에서 직접 편집하는 OpenType 텍스트와 도형 내부 텍스트
- 벡터 knife 도구와 원근 보조선
- gap-closing fill, 색 전파, 더 빠른 liquify
- 실시간 recorder와 PSD 텍스트 객체 호환 개선

### Adobe Photoshop·Affinity Photo·Photopea

- 조정 레이어와 live filter 기반 비파괴 편집
- 마스크 단위 AI 편집과 문맥형 작업 제안
- linked/embedded object와 원본 교체
- PSD 왕복 시 편집 가능성 등급 표시
- panorama, focus merge, macro/action처럼 반복 작업을 재현 가능한 graph로 기록

### Procreate·Adobe Fresco·Infinite Painter

- QuickShape와 캔버스 우선 UI
- 이미지에서 원근 grid를 추출하고 정렬·회전 snapping
- 프레임 애니메이션과 motion path를 한 timeline에서 편집
- 사용자 지정 도구 dock, gesture/modifier 설정
- RGB/HSB/Lab/CMYK/Hex와 고비트 색 관리
- 3D 모델 material channel에 직접 페인팅

### Corel Painter·Rebelle·ArtRage

- bristle별 접촉, paint loading, 점도, 압력·기울기·회전
- 물 번짐, 안료 침전, 종이 높이와 모세관 흐름
- spectral/pigment mixing과 glazing
- impasto height field, 조명과 soft shadow
- wet/dry/blow 같은 시간 기반 시뮬레이션

### Concepts·Illustrator·Affinity Designer

- 그린 뒤에도 편집 가능한 벡터 stroke
- Nudge, Slice, 제어점, 폭 프로필, appearance stack
- raster/vector hybrid 문서와 해상도 독립 출력
- 무한 캔버스, precision guide, 재사용 객체 라이브러리

### Storyboard Pro·Storyboarder·Moho·Harmony·Blender Grease Pencil

- 대본에서 장면·샷·패널을 생성하고 카메라·오디오·timing을 연결
- animatic과 revision 검토
- onion skin, light table, interpolation, graph editor
- 2D camera, parallax, motion path, bone/deformer, physics
- 2D stroke를 3D 공간과 카메라에서 편집

### Live2D Cubism·Spine·Rive

- warp/rotation deformer와 parameter blend
- mesh deformation, constraints, skins
- physics와 motion sync
- interactive state machine과 런타임 내보내기

### Blender·SketchUp·Magic Poser·PoseMy.Art

- 다중 캐릭터 포즈와 정확한 카메라·렌즈
- surface snap, parent-child attachment, constraint
- UV·material channel·texture painting
- geometry/scene preset과 line-art 출력

### Figma·Canva·Miro

- presence, remote cursor, comments, version history
- component/material library와 공유 preset
- template, bulk create, resize, publish pipeline
- 구조가 유지되는 import와 편집 가능한 생성 결과

### Firefly·ComfyUI·Krita AI Diffusion

- structure/style/reference image를 분리한 조건 입력
- selection/mask/region 단위 생성·수정
- layer로 되돌아오는 결과와 provenance
- local/cloud provider 선택, 비용·전송 경로·모델 표시
- 재현 가능한 node graph와 seed/parameter 기록

## 3. P0 구현 스트림

### P0-A. 문서 무결성과 자율 배포

**목표:** 어떤 신규 기능보다 먼저 사용자의 원고를 잃지 않는다.

구현 항목:

- operation 단위 recovery journal
- codec version과 forward migration, 이전 fixture corpus
- atomic write, checksum, interrupted-write replay
- 저장 중 탭 종료·브라우저 크래시·용량 부족·권한 철회 시나리오
- Undo/Redo transaction의 부분 적용 금지
- WebGPU `device.lost` 복구와 Canvas2D/WebGL2 fallback
- 대형 문서 10시간 soak와 메모리·GPU ledger

완료 증거:

- 이전 버전 fixture 읽기
- save → close → cold reload → hash 비교
- crash point별 replay
- undo all → redo all의 문서 hash 동등성
- device-lost 중 active stroke 취소·재진입·저장 검증

### P0-B. Smart Shape + 편집 가능한 벡터 stroke

**벤치마크:** Clip Studio Paint, Procreate, Concepts, Krita, Illustrator.

제품 결과:

1. 펜을 뗀 뒤 일정 시간 hold하면 후보 형상을 표시한다.
2. 선·사각형·타원·다각형·호·말풍선·패널 경계로 교정할 수 있다.
3. 확정된 결과는 raster stamp가 아니라 vector stroke/shape node다.
4. 제어점, 폭, taper, corner, fill/stroke, appearance를 다시 편집한다.
5. Nudge·Slice·vector eraser·line correction을 지원한다.
6. 원근자·대칭자·snap과 같은 좌표계에서 작동한다.

필수 테스트:

- pointer pressure/coalesced events 입력
- hold 임계값과 취소
- 교정 전후 geometry 오차
- control-point mutation Undo/Redo
- PSD/SVG/프로젝트 저장 등급
- WebGPU preview와 committed raster parity

### P0-C. 비파괴 보정·효과 graph

**벤치마크:** Photoshop, Affinity Photo, Photopea, Clip Studio Paint.

제품 결과:

- adjustment layer: Levels, Curves, HSL, Color Balance, Gradient Map, Lab 변환
- live filter: Blur, Sharpen, Glow, Inflate, Drop Shadow, distortion
- filter mask와 clipping 범위
- linked/embedded source object와 원본 교체
- effect stack 순서 변경, 개별 가시성, opacity/blend
- 다중 선택 레이어에 하나의 보정 transaction 적용
- unsupported PSD feature의 보존/flatten 경고

엔진 원칙:

- 원본 픽셀을 변경하지 않는다.
- preview와 export가 같은 parameter graph를 사용한다.
- GPU 경로와 CPU fallback의 허용 오차를 수치로 고정한다.
- 캐시 key는 source hash + graph hash + color space다.

### P0-D. 자연매체 상태 엔진

**벤치마크:** Rebelle, Corel Painter, Adobe Fresco, ArtRage, Krita.

상태 모델:

- pigment concentration
- water/solvent amount
- viscosity
- bristle/fiber contact
- paper height/absorption
- wetness age
- paint height와 normal
- local drying·diffusion·advection

단계별 구현:

1. 결정적 CPU reference solver
2. tile 단위 WebGPU compute solver
3. live stroke와 committed tile parity
4. pause/dry/blow/rewet 명령
5. spectral 또는 제한된 Kubelka–Munk 계열 안료 혼합
6. impasto lighting과 soft shadow

실패 경계:

- GPU 미지원 시 품질 preset을 낮추되 결과를 잃지 않는다.
- simulation step과 random seed를 문서에 저장한다.
- 장시간 idle tab 복귀 시 시간 폭주를 clamp한다.

### P0-E. 3D 표면 페인팅·포즈·카메라

**벤치마크:** Procreate 3D, Clip Studio Paint, Blender, Magic Poser, SketchUp.

제품 결과:

- GLB/VRM mesh surface raycast와 정확한 UV hit
- color, roughness, metallic, emission, opacity channel painting
- seam-aware brush projection과 texture dilation
- material·texture set 선택, solo, export
- hand/head/figure attachment와 parent-child graph
- surface snap, local/world transform, constraint
- camera lens, perspective ruler, LT/line-art output
- versioned texture archive와 원본 GLB 비파괴 보존

검증:

- known UV corpus에서 stroke 위치 오차
- seam 교차 stroke
- 2K/4K texture memory budget
- WebGPU/WebGL2 composited frame parity
- export 후 Blender/표준 glTF validator round-trip

### P0-F. 애니메이션·animatic timeline

**벤치마크:** Storyboard Pro, Harmony, Moho, Blender Grease Pencil, Fresco, ToonSquid.

제품 결과:

- frame-by-frame cel, exposure, hold, duplicate
- onion skin과 light table
- transform/opacity/camera keyframe
- curve/graph editor와 easing
- motion path와 parallax
- audio waveform, scrub, marker, lip-sync cue
- bone/deformer와 간단한 physics
- panel/shot/scene hierarchy와 revision
- GIF, MP4/WebM, PNG sequence, animatic PDF/export

문서 모델:

- 편집 문서와 재생 cache를 분리한다.
- timeline mutation도 일반 command registry를 사용한다.
- frame asset은 content-addressed storage로 중복 제거한다.

### P0-G. 구조적 AI 편집

**벤치마크:** Photoshop, Firefly, Canva, ComfyUI, Krita AI Diffusion.

제품 결과:

- prompt만 보내는 단일 버튼이 아니라 selection, mask, depth, pose, line art, palette,
  reference image를 명시적으로 조합한다.
- 결과를 한 장의 flatten 이미지가 아니라 새 layer, mask, variant group으로 받는다.
- provider, model, seed, parameters, prompt hash, reference hash, 비용 범주를 provenance에 기록한다.
- local/BYOK/server route와 외부 전송 항목을 실행 전에 표시한다.
- 취소와 timeout은 원본 문서를 변경하지 않는다.
- 같은 입력을 재실행하거나 graph/node preset으로 저장할 수 있다.

안전 경계:

- 상업 이용 가능성을 공급자 약관 확인 없이 보증하지 않는다.
- 얼굴·작가 스타일·저작권 소재에 대한 정책과 신고 경로를 분리한다.
- 생성 결과는 기본적으로 검토 대기 상태이며 자동 게시하지 않는다.

## 4. P1 구현 스트림

### P1-A. 만화·웹툰 편집 완결

- page manager와 작품 단위 template
- panel split/merge/gutter/bleed/safe area
- balloon vector tail, text fitting, vertical writing, ruby, OpenType
- 대본→장면→패널→말풍선 연결
- effect line, tone, pattern, border effect
- 긴 원고 분할 출력과 플랫폼 preset 버전 관리
- 검수 PDF, 주석, 수정 요청, lock

### P1-B. 작업공간·생산성

- Auto Action 기록·편집·재생
- Quick Access와 command bar 완전 사용자화
- shortcut/modifier/gesture profile
- TourBox/Stream Deck와 호환되는 command API
- dockable panels, multi-window, companion
- workspace snapshot과 장치별 복원
- command search와 최근 사용

### P1-C. 소재 생태계

- brush, tone, template, 3D, pose, palette, filter preset의 공통 package manifest
- semantic search, category, tag, MRU, frequency, pin
- dependency, version range, migration
- license, author, source, AI-assisted provenance
- project에서 사용 중인 material lockfile
- 삭제·업데이트 시 영향 분석
- preview corpus와 악성 package 격리

### P1-D. 실시간 협업

- 인증된 always-on Studio room
- presence, remote cursor, viewport, selection
- server-authoritative lease lock
- vector/metadata CRDT와 raster conflict 전략
- comments와 resolved thread
- revision branch, compare, restore
- offline queue와 reconnect
- 권한 하향·토큰 만료 중 fail-closed

### P1-E. 색·출력·포맷

- working/display/output profile 분리
- ICC, Lab, CMYK soft proof
- gamut warning
- 8/16/32-bit 문서 정책
- PSD/ORA/SVG/PDF/GLB/PNG/WebP/AVIF 출력 보존 등급
- font embedding/subsetting과 누락 글꼴 대체
- 인쇄 bleed/crop/color bar

## 5. 구현 순서

의존성과 사용자 손상 위험을 기준으로 다음 순서로 진행한다.

1. P0-A 문서 무결성·자동 복구·GPU fallback
2. P0-B Smart Shape와 vector stroke
3. P0-C 비파괴 adjustment/effect graph
4. P0-E 3D surface paint와 texture export
5. P0-D 자연매체 상태 엔진
6. P0-F animation/animatic timeline
7. P0-G 구조적 AI 편집
8. P1-A 만화·웹툰 완결
9. P1-B 생산성·작업공간
10. P1-C 소재 생태계
11. P1-D 협업
12. P1-E 색·포맷·출력

각 스트림은 하나의 거대 PR이 아니라 다음 단위로 자른다.

- 순수 문서 모델·codec
- reference implementation
- 실제 Studio 통합
- 브라우저 검증과 성능 증거
- migration·release flag·rollback

## 6. 커밋·병합 규칙

- 논리적으로 되돌릴 수 있는 한 변화마다 Conventional Commit을 남긴다.
- `codex/*` 브랜치에서 작업하고 PR 본문에 `<!-- studio-automerge -->`를 명시한다.
- `CI`, `Studio autonomous risk gate`, `SonarQube`가 모두 성공하고 충돌이 없을 때만 squash merge한다.
- 저장 포맷 변경은 codec과 migration, 이전 fixture, round-trip test를 같은 PR에 포함한다.
- WebGPU 변경은 CPU/WebGL2 fallback과 parity evidence를 같은 PR에 포함한다.
- feature flag를 제거하기 전 실제 프리뷰와 운영 smoke가 성공해야 한다.
- 자동 병합된 커밋이 운영 smoke를 깨면 마지막 검증 커밋으로 즉시 되돌린다.

## 7. 지속 감사

`Studio competitor watch` workflow는 공식 watch URL을 주기적으로 조회한다.

- 기본 주간 감사: P0 제품
- 수동 전체 감사: 모든 등록 제품
- ETag, Last-Modified, 정규화 content hash, 제목, HTTP 상태를 증거로 남긴다.
- fingerprint가 바뀌거나 source가 실패하면 Epic #555에 보고한다.
- 변경 감지는 기능 판정이 아니다. 공식 release note를 읽고 제품에 의미 있는 변화만 backlog로 전환한다.
- 공개 자료가 없는 기능은 추측으로 구현 완료 처리하지 않는다.

## 8. 완료 판정

“경쟁 제품에 있는 기능을 흡수했다”는 표현은 다음 상태만 가리킨다.

```text
official evidence
→ capability specification
→ original ToonSpectrum design
→ engine implementation
→ UI wiring
→ persistence + Undo/Redo
→ browser/performance evidence
→ safe merge
→ production smoke
```

문서, mock UI, 비활성 버튼, 테스트에서만 존재하는 코어는 완료가 아니다.
