# 🧊 ToonSpectrum 하이브리드 3D DCC 엔진 — 종합 가이드 & 매뉴얼

ToonSpectrum 스튜디오는 2D 디지탈 작화와 3D 모델링, VRM 캐릭터 포징, CAD 배경 선화 추출 및 다중 컷(Multi-Shot) 카메라 연출을 통합 제공하는 **하이브리드 2D·3D DCC(Digital Content Creation) 전용 저작 엔진**입니다.

> 📘 **참고**: 이 문서는 ToonSpectrum의 3D DCC 기능에 대한 종합 사용자 매뉴얼입니다. 2D 드로잉, 브러시, 채색 등의 기본 스튜디오 기능은 [STUDIO_MANUAL.md](./STUDIO_MANUAL.md)를 참고하세요.

---

## 📌 목차

1. [하이브리드 3D DCC 엔진 개요](#1-하이브리드-3d-dcc-엔진-개요)
2. [다중 기하 커널과 Authority 구조](#2-다중-기하-커널과-authority-구조)
3. [SketchUp 스타일 추론 스냅 엔진](#3-sketchup-스타일-추론-스냅-엔진)
4. [3D Shot Override & 다중 카메라 컷 동기화](#4-3d-shot-override--다중-카메라-컷-동기화)
5. [3D CAD 선화 추출기 (STEP / IGES / SolidWorks)](#5-3d-cad-선화-추출기)
6. [VRM 캐릭터 포즈 & 웹캠 모션 캡처 활용](#6-vrm-캐릭터-포즈--웹캠-모션-캡처-활용)
7. [포맷 호환성 매니페스트 & Rights BOM](#7-포맷-호환성-매니페스트--rights-bom)
8. [3D Toon Multi-Pass 렌더링 파이프라인](#8-3d-toon-multi-pass-렌더링-파이프라인)
9. [파라메트릭 룸 & 빌딩 키트](#9-파라메트릭-룸--빌딩-키트)
10. [비파괴 Modifier DAG 스택](#10-비파괴-modifier-dag-스택)
11. [Live 2D↔3D Linked Ink Bridge](#11-live-2d3d-linked-ink-bridge)
12. [에셋 라이선스 & Rights BOM 레지스트리](#12-에셋-라이선스--rights-bom-레지스트리)
13. [.toon3d 네이티브 프로젝트 포맷](#13-toon3d-네이티브-프로젝트-포맷)
14. [성능 최적화 & WebGPU 파이프라인](#14-성능-최적화--webgpu-파이프라인)
15. [FAQ & 트러블슈팅](#15-faq--트러블슈팅)

---

## 1. 하이브리드 3D DCC 엔진 개요

ToonSpectrum Studio의 3D DCC 엔진은 단순히 외부 3D 파일을 불러와 보여주는 뷰어가 아닌, **웹툰 세트장 구축(Build Mode)부터 컷별 구도 조작(Shot Mode), 인체/소품 배치, 2D 만화 선화/톤 자동 추출(Toon Output)**까지 한 화면에서 처리합니다.

### 핵심 설계 원칙

1. **웹툰 작가를 위한 Live 2D↔3D Bridge**: 3D 배경이나 인체 포즈를 수정한 후에도 작가가 선화 위에 보정한 2D 드로잉 레이어가 파괴되지 않고 추적 유지됩니다.
2. **WebGPU 우선 렌더링 Engine**: Three.js WebGPURenderer와 TSL(Three Shading Language) 기반의 고성능 카툰 툰셰이딩을 브라우저 60fps로 제공합니다.
3. **단일 진실 공급원 (Single Source of Truth)**: 각 오브젝트는 한 시점에 하나의 Geometry Authority를 가지며, 양방향 자동 동기화로 인한 데이터 모순을 방지합니다.
4. **비파괴 편집 우선**: Modifier, Feature, Node, Shot Override, Material Override는 항상 원본 데이터를 보존합니다.

### 제품 모드 구분

| 모드 | 핵심 기능 | 참고 제품 |
|---|---|---|
| **Draw** | 브러시·지우개·벡터선·채색·레이어·말풍선·톤 | Clip Studio |
| **Model** | 폴리곤 직접 편집·Modifier·UV·retopo | Blender·3ds Max |
| **Build** | 방·건물·도로·가구·Push/Pull·snap·component | SketchUp·AutoCAD |
| **CAD** | 치수·constraint·B-Rep·NURBS·feature·assembly | SolidWorks·Rhino |
| **Sculpt** | brush·mask·face set·remesh·multires | ZBrush |
| **Character** | VRM·rig·IK/FK·retarget·표정·손·포즈·접촉 | Maya·VRM |
| **Garment** | 2D 패턴·봉제·직물·피팅·옷주름 | CLO·Marvelous |
| **Shot** | 카메라·렌즈·구도·Shot Override·continuity | Unity·Unreal·Maya |
| **Toon Output** | line·shadow·tone·depth·normal·ID·vectorize | Clip Studio LT |

---

## 2. 다중 기하 커널과 Authority 구조

3D 오브젝트의 표현 목적에 따라 7가지 권한(Geometry Authority)이 독립 관리됩니다:

| Authority 명칭 | 설명 및 사용 분야 | 대표 연동 포맷 | 편집 모드 |
|---|---|---|---|
| `editable-mesh` | 버텍스·엣지·페이스 직접 편집 폴리곤 메시 | glTF / GLB / OBJ | Model |
| `brep-feature` | OpenCascade 기반 정밀 곡면 및 B-Rep CAD 모델 | STEP / IGES / BREP | CAD |
| `parametric-generator` | 타입별 파라미터와 노드/레시피 그래프 기반 자동 생성 | Build/Procedural | Build |
| `manifold-solid` | 구멍 없는 견고한 3D 불리언(Boolean) 연산 | CSG / Manifold Solid | Model |
| `sculpt-volume` | Voxel/SDF 기반 자유 조형 스컬프팅 | Dynamic Voxel Mesh | Sculpt |
| `garment-pattern` | 2D 패턴 및 봉제선 기반 의상 물리 커널 | XPBD Cloth / DXF | Garment |
| `external-reference` | 외부 3D 앱 원본 에셋 주소 연동 | Blender / SketchUp Bridge | Reference |

### 변환 규칙 (주의사항)

- **B-Rep → Mesh**: 일반적으로 가능하지만, mesh → 원래 B-Rep feature history 복원은 보장하지 않습니다.
- **Sculpt → Retopo Mesh**: 별도 자산 버전으로 만들어집니다. Sculpt volume은 삭제되지 않습니다.
- **Procedural → Editable**: "Make Editable" 시 원본 recipe를 보존한 fork가 생성됩니다.
- **External Import**: 원본 binary를 보존하고 normalized Scene IR을 별도 생성합니다.

---

## 3. SketchUp 스타일 추론 스냅 엔진

건축 배경이나 소품을 배치할 때 직관적이고 빠른 맞춤 스냅을 지원합니다:

### 추론 포인트 유형

| 타입 | 색상 표시 | 설명 |
|---|---|---|
| **Endpoint** | 🟢 녹색 | 엣지의 시작점과 끝점 |
| **Midpoint** | 🔵 청록(Cyan) | 엣지의 정확한 중간점 |
| **Center** | 🟣 보라 | 원·타원·원호의 중심점 |
| **Intersection** | ❌ 빨강 | 두 엣지가 교차하는 점 |
| **Grid** | ⬜ 회색 | 지정 격자 간격 스냅 |

### 축 잠금 & 가이드 라인

- **X축(레드)**: `→` 방향키 또는 드래그 중 X축 근접 시 자동 잠금
- **Y축(그린)**: `↑` 방향키 또는 Y축 근접 시 자동 잠금
- **Z축(블루)**: `↓` 방향키 또는 Z축 근접 시 자동 잠금
- **수직(Perpendicular)**: 기존 엣지와 직각 자동 표시
- **평행(Parallel)**: 기존 엣지와 평행 자동 표시

### 키보드 단축키

| 단축키 | 기능 |
|---|---|
| `Tab` | 치수 직접 입력 모드 진입 |
| `Shift` | 축 잠금 토글 |
| `Alt` | 스냅 일시 해제 |
| `G` | 격자 스냅 간격 변경 |

---

## 4. 3D Shot Override & 다중 카메라 컷 동기화

하나의 3D 공간 세트장에 수십 개의 웹툰 연출 컷(Shot)을 생성하고 독립적으로 상태를 관리할 수 있습니다:

### Shot Override 가능 항목

| 항목 | 설명 | 예시 |
|---|---|---|
| **카메라** | focal length, FOV, 위치, 회전 | 정면/로우앵글/하이앵글 |
| **오브젝트 가시성** | 특정 컷에서만 벽/소품 표시/숨김 | Camera Wall Cutaway |
| **트랜스폼** | 컷별 위치/회전/스케일 미세 조정 | 강조를 위한 원근 과장 |
| **캐릭터 포즈** | 컷별 IK/FK 포즈 오버라이드 | 동일 씬에서 다른 동작 |
| **표정** | VRM expression 블렌드 값 오버라이드 | 컷별 감정 연기 |
| **재질/조명** | Material 패치, 조명 색상/세기 | 분위기 전환 |
| **톤 스타일** | 선화 두께, 톤 밀도, 그림자 단수 | 컷별 연출 차이 |

### 워크플로우

1. **Shot 생성**: `Shot Manager` 패널에서 `+ Shot 추가` 클릭
2. **카메라 설정**: 뷰포트에서 원하는 구도로 카메라를 조작한 후 `현재 뷰 저장`
3. **Override 적용**: Inspector 패널에서 변경한 속성에 🔶 아이콘이 표시됨
4. **일괄 렌더링**: `Shot → 전체 Shot 렌더` 메뉴로 일괄 선화/톤 출력
5. **연속성 검사**: `Shot → 연속성 비교` 로 이전/다음 컷의 속성 차이 확인

---

## 5. 3D CAD 선화 추출기

기계, 자동차, 아파트, 무기 등 정밀 3D CAD 모델(.STEP, .IGES)의 외곽선을 깔끔한 2D 만화 선화로 변환합니다:

### 단계별 사용법

1. `파일 → 3D CAD 모델 삽입` 클릭 후 `.step` 또는 `.iges` 파일 선택
2. OpenCascade.js WASM 엔진이 B-Rep 곡면을 분석하고 Tessellation 수행
3. `Line Art Extractor` 패널에서 파라미터 조정:

| 파라미터 | 설명 | 기본값 |
|---|---|---|
| **Outline Thickness** | 외곽선 두께 (px) | 1.5 |
| **Crease Angle** | 접선 각도 임계값 (°) | 35 |
| **Silhouette** | 실루엣 라인 활성화 | ✅ |
| **Hidden Line** | 은선(뒤쪽 라인) 점선 표시 | ❌ |
| **Section Plane** | 단면 절단면 활성화 | ❌ |

4. `선화 추출 실행` 클릭 → 결과가 독립 래스터/벡터 레이어로 생성
5. 레이어 패널에서 선화 레이어 위에 채색 레이어를 추가하여 작업

---

## 6. VRM 캐릭터 포즈 & 웹캠 모션 캡처 활용

### VRM 호환성

| 기능 | VRM 0.x | VRM 1.0 |
|---|---|---|
| Humanoid 본 매핑 | ✅ | ✅ |
| Expression (표정) | BlendShapeProxy | Expression |
| MToon 재질 | ✅ | ✅ |
| Spring Bone | ✅ | ✅ |
| Node Constraint | ❌ | ✅ |
| LookAt (시선) | ✅ | ✅ |

### IK/FK 포저 조작법

| 조작 | 방법 |
|---|---|
| **손/발 이동** | 엔드 이펙터 기즈모(Gizmo) 드래그 |
| **관절 회전** | 본 클릭 후 회전 기즈모 조작 |
| **손가락 포즈** | 🖐️ 핸드 패널에서 21 마디 개별/프리셋 조절 |
| **표정 조절** | 😀 Expression 슬라이더 (Happy, Sad, Angry 등) |
| **시선(LookAt)** | 🎯 LookAt 타겟 오브젝트 배치 또는 카메라 추적 |

### 웹캠 모션 캡처 기능

1. **📹 실시간 동작 인식**: MediaPipe Pose 기반 상반신 33개 랜드마크 추적
2. **🔒 포즈 순간 고정 (Freeze)**: 현재 캡처 포즈를 마네킹에 잠금
3. **↔️ 좌우 반전 (Mirror)**: 웹캠 미러 보정
4. **🖐️ 손가락 솔버**: MediaPipe Hand 21개 랜드마크 → VRM 손가락 리타겟
5. **😀 표정 맵핑**: MediaPipe Face 468개 랜드마크 → VRM Expression 블렌드

### 모션 캡처 팁

- 밝은 조명 환경에서 캡처 정확도가 높아집니다.
- 상반신이 웹캠에 완전히 보이도록 카메라 위치를 조정하세요.
- 포즈 고정 후 미세 조정은 IK/FK 포저에서 수동으로 보정 가능합니다.
- 복잡한 손 포즈는 손가락 솔버 활성화 후 캡처하면 정확도가 올라갑니다.

---

## 7. 포맷 호환성 매니페스트 & Rights BOM

### 호환성 등급 체계

| 등급 | 이름 | 의미 | UI 표시 |
|---|---|---|---|
| **N** | Native | `.toon3d`에서 기능·history·ID까지 무손실 | 🟢 네이티브 |
| **A** | Browser Direct | JS/WASM으로 구조적 import/export 가능 | 🔵 직접 지원 |
| **B** | Browser Import | geometry·material·animation 일부를 직접 읽음 | 🟡 부분 지원 |
| **C** | Source Bridge | 원본 앱 플러그인·로컬 사이드카로 변환 | 🟠 브리지 필요 |
| **D** | Server Convert | 업로드 후 격리된 변환 worker에서 처리 | ⚪ 변환 전용 |
| **P** | Preview Only | appearance 또는 cache만 보존 | ⬜ 미리보기 |
| **X** | Unsupported | 법적·기술적·품질상 지원하지 않음 | 🔴 미지원 |

### 주요 포맷별 호환성

| 포맷 | 확장자 | 등급 | 보존 범위 |
|---|---|---|---|
| glTF 2.0 | `.gltf` | A | scene, mesh, skin, morph, animation, PBR |
| GLB | `.glb` | A | binary self-contained runtime |
| VRM 1.0 | `.vrm` | A | humanoid, expression, MToon, spring bone |
| STEP | `.step/.stp` | A/B | B-Rep surface, assembly, name, color |
| IGES | `.igs/.iges` | B | surface, curve, name |
| OBJ | `.obj/.mtl` | A | mesh, UV, normals, basic material |
| FBX | `.fbx` | B/C | mesh, skin, animation, material subset |
| DXF | `.dxf` | B | 2D plan, layer, block, polyline |
| SketchUp | `.skp` | C | bridge plugin 필요 |
| Blender | `.blend` | C | bridge plugin 필요 |
| IFC (BIM) | `.ifc` | B | wall, door, window, space semantic |
| 3MF | `.3mf` | B | mesh, color, 3D print properties |
| USD | `.usd/.usda` | C/D | scene composition, sidecar 우선 |

---

## 8. 3D Toon Multi-Pass 렌더링 파이프라인

웹툰 컷 렌더링 시 독립 비주얼 채널을 레이어로 분리 획득하여 PSD 파일로 내보냅니다:

### 렌더 패스 목록

| 패스 | 채널명 | 비트 심도 | 용도 |
|---|---|---|---|
| **Beauty** | RGB Color | 8-bit | PBR/카툰 툰셰이딩 색상 |
| **Line Ink** | Line Ink Layer | 8-bit | 실루엣·크리즈·바운더리 선화 |
| **Shadow & AO** | Toon Shadow & AO | 8-bit | 카툰 섀도우 단수 및 AO |
| **Depth** | Linear Depth Map | 16-bit | 원근감·안개(Fog)·블러 연출 |
| **Object ID** | Object Mask ID | 8-bit | 인물/배경/소품 픽셀 마스크 |
| **Normal** | World Normal | 16-bit | 법선 맵 기반 후처리 |
| **Material ID** | Material Mask | 8-bit | 재질별 영역 분리 |
| **Motion Vector** | Motion Vector | 16-bit | 모션 블러·보간 |

### 렌더 품질 단계

| 단계 | 용도 | 특성 |
|---|---|---|
| **Draft** | 빠른 구도 확인 | 저해상도, 굵은 선, 빠른 렌더 |
| **Interactive** | 실시간 편집 | 풀 뷰포트, 60/30fps 예산 |
| **Final** | 최종 출판 | 고해상도, 슈퍼샘플링, 벡터 정리 |

---

## 9. 파라메트릭 룸 & 빌딩 키트

### 빠른 시작: 5분 만에 방 만들기

1. `Build` 모드 진입 → `방 생성기` 메뉴 클릭
2. 평면도 치수 입력 (가로 5m × 세로 4m × 높이 2.8m)
3. 자동으로 4개 벽 + 바닥 + 천장 생성
4. `문 배치` 도구로 남쪽 벽에 출입문 드래그 배치
5. `창문 배치` 도구로 북쪽 벽에 창문 드래그 배치

### 방 템플릿 프리셋

| 템플릿 | 기본 치수 | 포함 요소 |
|---|---|---|
| 🏫 교실 | 9m × 7m × 3m | 칠판, 책상 배열, 창문 |
| 🏥 병원 병실 | 6m × 5m × 2.8m | 침대, 커튼, 모니터 |
| ☕ 카페 | 8m × 6m × 3.2m | 카운터, 좌석, 진열대 |
| 🏠 원룸 | 4m × 3m × 2.5m | 주방, 욕실, 현관 |
| 🏢 사무실 | 12m × 8m × 2.8m | 파티션, 책상, 회의실 |

### 카메라 벽 자동 투명화

카메라 시점이 벽 뒤에 위치할 때 작가의 피사체 시야를 가리는 벽을 **자동 감지하여 투명화/숨김 처리**합니다.

- 투명화 대상 벽은 Inspector 패널에서 수동 선택도 가능
- 컷(Shot)별로 투명화 설정이 독립 저장됨
- 천장 on/off 역시 Shot Override로 컷별 제어 가능

---

## 10. 비파괴 Modifier DAG 스택

Blender/3ds Max 스타일의 비파괴 Modifier 연산 파이프라인입니다. 각 Modifier는 독립 파라미터를 가지며, 스택 순서에 따라 순차 적용됩니다.

### 지원 Modifier 목록

| Modifier | 한국어명 | 설명 | 우선순위 |
|---|---|---|---|
| **Mirror** | 거울 | X/Y/Z축 기준 대칭 복사 | P1 |
| **Array** | 배열 | 선형/방사형 반복 복사 | P1 |
| **Boolean** | 불리언 | 합집합/차집합/교집합 CSG | P1 |
| **Bevel** | 베벨 | 엣지 모따기/둥글리기 | P1 |
| **Solidify** | 두께 부여 | 얇은 면에 두께 부여 | P1 |
| **Subdivision** | 서브디비전 | Catmull-Clark 세분화 | P2 |
| **Decimate** | 폴리곤 간소화 | 삼각형 수 감축 | P2 |
| **Weld** | 정점 병합 | 임계값 내 정점 합치기 | P2 |
| **Simple Deform** | 단순 변형 | 비틀기/구부리기/테이퍼 | P2 |
| **Shrinkwrap** | 표면 붙이기 | 다른 메시 표면에 투영 | P2 |

### Modifier 스택 조작

- **순서 변경**: Modifier 이름을 드래그하여 순서 변경 (결과 즉시 반영)
- **일시 비활성화**: 👁️ 아이콘 클릭으로 토글
- **복제**: 우클릭 → `Modifier 복제`
- **적용 (Apply)**: 비파괴 상태를 확정하여 메시에 직접 반영
- **직렬화**: JSON으로 내보내기/불러오기 가능

---

## 11. Live 2D↔3D Linked Ink Bridge

> **💡 경쟁 차별화 핵심 기능**: Clip Studio를 이기는 포인트는 "3D 기능 수"가 아니라, **3D 수정 후에도 2D 작화 보정을 유지하는 Live 2D↔3D Bridge**입니다.

### 개요

Linked Ink Bridge는 3D 오브젝트의 edge/face와 2D 만화 선화(ink stroke) 사이의 **provenance(출처) 연결**을 관리합니다.

### 재생성 정책 (Regeneration Policy)

| 정책 | 동작 | 사용 시나리오 |
|---|---|---|
| **follow-3d** | 3D edge/face와 함께 이동 | 건물 외벽, 가구 윤곽선 |
| **screen-space** | 화면 구도 기준으로 고정 | 연출 효과, 스피드 라인 |
| **freeze** | 3D와 연결 끊고 일반 선으로 전환 | 작가 최종 확정 선 |

### 신뢰도(Confidence) 시스템

- 3D topology가 변경되면 각 Linked Ink 스트로크의 **신뢰도(0.0~1.0)**가 재평가됩니다.
- 신뢰도 < 0.5인 스트로크는 **수동 확인 UI**가 표시되어 작가가 검증/수정합니다.
- Persistent ID → Feature Provenance → Geometric Signature → Nearest Projection 순서로 재매칭을 시도합니다.

### 워크플로우 예시

1. 3D 방 배경에서 선화 자동 추출 (follow-3d 연결)
2. 작가가 선화 위에 수동 보정/추가 작화 (authoredDelta로 저장)
3. 3D 모델의 창문 크기 변경
4. Bridge 엔진이 영향 받는 스트로크만 자동 갱신
5. 작가의 수동 보정은 최대한 보존하여 재투영

---

## 12. 에셋 라이선스 & Rights BOM 레지스트리

### 개요

모든 임포트된 3D 에셋의 **원본 출처, 저작권, 라이선스, 사용 범위, 파생 이력**을 Rights BOM(Bill of Materials)으로 추적합니다.

### 라이선스 유형

| 라이선스 | 상용 사용 | 수정 가능 | 재배포 가능 | 주의사항 |
|---|---|---|---|---|
| CC0 | ✅ | ✅ | ✅ | 자유 사용 |
| CC-BY-4.0 | ✅ | ✅ | ✅ | 저작자 표기 필수 |
| CC-BY-SA-4.0 | ✅ | ✅ | ✅ | 동일 조건 공유 |
| CC-BY-NC-4.0 | ❌ | ✅ | ✅ | 비상업적 사용만 |
| MIT | ✅ | ✅ | ✅ | 라이선스 고지 |
| GPL-3.0 | ⚠️ | ✅ | ✅ | 소스 공개 의무 |
| Proprietary | ❓ | ❓ | ❓ | 개별 계약 확인 |

### 상용 출판 전 자동 검증

`Rights BOM → 상용 출판 검증` 실행 시 다음이 자동 체크됩니다:

- 🔴 **GPL 에셋의 상용 사용 충돌** (소스 공개 의무)
- 🔴 **NC(비상업) 에셋의 상용 사용 시도**
- 🟡 **라이선스 미확인 에셋** 존재
- 🟡 **저작자 표기 누락**
- 🔴 **만료된 라이선스**

---

## 13. .toon3d 네이티브 프로젝트 포맷

### 패키지 구조

```
project.toon3d (ZIP64 package)
├── manifest.json           # 버전, 단위, 축, 의존성, 권한
├── document/document.fb    # scene/layer/shot 그래프, Stable ID
├── journal/commands-*.bin  # event-sourced command segments
├── scene/runtime.glb       # 호환 가능한 런타임 스냅샷
├── geometry/
│   ├── editable/*.meshbin  # half-edge topology + attributes
│   ├── cad/*.brep          # OCCT B-Rep payload
│   ├── sculpt/*.vdbz       # sparse voxel/SDF bricks
│   └── cache/*.glb         # LOD/render proxy/animation cache
├── materials/*.mtlx        # MaterialX source (선택)
├── textures/
│   ├── source/*            # PNG/TIFF/EXR/PSD master
│   └── runtime/*.ktx2      # 디바이스별 압축 프로필
├── drawings/pages/*.layerbin  # raster tile/vector layer
├── shots/*.json            # Shot Override 및 render profile
├── previews/*.webp         # 썸네일/contact sheets
├── rights/rights-bom.json  # provenance/license/attribution
└── reports/
    ├── import-*.json       # 정규화 및 손실 보고서
    └── export-*.json       # 대상 호환성 보고서
```

### 설계 원칙

- `.toon3d`는 glTF를 대체하지 않음. glTF는 runtime interchange, `.toon3d`는 authoring package
- 원본 외부 파일은 hash와 URI를 저장하고 정책에 따라 embed 또는 link
- 모든 derived cache는 삭제 후 재생성 가능
- schema migration은 이전 버전을 덮어쓰지 않고 새 checkpoint를 생성

---

## 14. 성능 최적화 & WebGPU 파이프라인

### RenderCapabilityProfile

WebGPU와 WebGL2를 동일 기능으로 가장하지 않고, `RenderCapabilityProfile`로 기능을 등급화합니다:

| 기능 | WebGPU | WebGL2 Fallback |
|---|---|---|
| Compute Shader | ✅ | ❌ (CPU fallback) |
| Storage Buffer | ✅ | ❌ |
| MSAA | ✅ 4x-8x | ✅ 4x |
| Timestamp Query | ✅ | ❌ |
| TSL Node Material | ✅ Full | ✅ Subset |

### Worker 구조

| Worker | 역할 | 기술 |
|---|---|---|
| **UI Main Thread** | React, pointer routing, lightweight state | React 19 |
| **Render Worker** | OffscreenCanvas, Three.js renderer | WebGPU/WebGL2 |
| **Geometry Worker** | mesh, B-Rep, Manifold, UV, import parser | WASM |
| **Simulation Worker** | cloth, rigid body, animation bake | WASM/GPU |
| **Codec Worker** | image, PSD, compression, video | WASM |

### 성능 팁

- 대용량 mesh는 복사하지 않고 handle/arena ID로 전달
- WASM 모듈은 기능 사용 시 lazy load
- Worker crash 시 현재 command를 롤백하고 journal에서 복구
- LOD: meshoptimizer로 자동 생성, Editing 시 Full / Shot 시 Proxy 사용

---

## 15. FAQ & 트러블슈팅

### Q: 3D 모델 로드 시 브라우저가 멈춥니다
**A:** 대용량 모델(>100MB)은 Web Worker에서 비동기 파싱됩니다. 메인 스레드 차단이 발생하면 `설정 → 성능 → Worker 파싱 강제 활성화`를 확인하세요.

### Q: STEP 파일을 열 수 없습니다
**A:** OpenCascade.js WASM 모듈은 최초 사용 시 약 15MB를 다운로드합니다. 네트워크 연결을 확인하고, 브라우저 캐시가 충분한지 확인하세요.

### Q: VRM 캐릭터의 Spring Bone이 동작하지 않습니다
**A:** VRM 0.x 모델의 경우 자동으로 1.0 semantic으로 정규화됩니다. 정규화 과정에서 일부 Spring Bone 설정이 손실될 수 있으며, Inspector에서 수동 보정 가능합니다.

### Q: Modifier 적용 후 Undo가 되지 않습니다
**A:** Modifier `Apply(적용)`는 비가역 연산입니다. Apply 전에 자동으로 checkpoint가 생성되며, `파일 → 이전 Checkpoint로 복원`에서 되돌릴 수 있습니다.

### Q: 웹캠 모션 캡처 정확도가 낮습니다
**A:**
- 밝은 조명 환경에서 촬영하세요.
- 상반신 전체가 프레임에 들어오도록 카메라를 배치하세요.
- `손가락 솔버`를 활성화하면 손 인식 정확도가 향상됩니다.
- 배경이 단색인 환경이 인체 분리에 유리합니다.

### Q: 선화 추출 결과에 노이즈가 많습니다
**A:** `Crease Angle` 값을 높이면(45°→60°) 불필요한 내부 엣지가 제거됩니다. `Line Art Extractor → 노이즈 필터` 슬라이더도 조정해 보세요.

### Q: Linked Ink가 3D 수정 후 깨집니다
**A:** Topology가 크게 변경된 경우(vertex 삭제, Boolean 연산 등) 신뢰도가 낮아질 수 있습니다. `Linked Ink → 저신뢰도 스트로크 확인` 메뉴에서 수동 재매칭하거나, `freeze` 정책으로 전환하세요.

### Q: 상용 웹툰 출판 시 라이선스 문제가 우려됩니다
**A:** `Rights BOM → 상용 출판 검증` 기능을 사용하면 GPL, NC 등 상용 충돌 에셋을 자동 감지합니다. 출판 전 반드시 실행하세요.

---

*ToonSpectrum Studio Hybrid 3D DCC Documentation v2.0*
*Last Updated: 2026-08-02*
