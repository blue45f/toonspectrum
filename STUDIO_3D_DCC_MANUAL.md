# 🧊 ToonSpectrum 하이브리드 3D DCC 엔진 — 가이드 & 매뉴얼 (STUDIO 3D DCC MANUAL)

ToonSpectrum 스튜디오는 2D 디지탈 작화와 3D 모델링, VRM 캐릭터 포징, CAD 배경 선화 추출 및 다중 컷(Multi-Shot) 카메라 연출을 통합 제공하는 **하이브리드 2D·3D DCC(Digital Content Creation) 전용 저작 엔진**입니다.

---

## 📌 목차

1. [하이브리드 3D DCC 엔진 개요](#1-하이브리드-3d-dcc-엔진-개요)
2. [다중 기하 커널 (Multi-Geometry Kernels)과 Authority 구조](#2-다중-기하-커널-multi-geometry-kernels과-authority-구조)
3. [SketchUp 스타일 추론 시스템 (Inference Snap Engine)](#3-sketchup-스타일-추론-시스템-inference-snap-engine)
4. [3D Shot Override & 다중 카메라 컷 동기화](#4-3d-shot-override--다중-카메라-컷-동기화)
5. [3D CAD 선화 추출기 (STEP / IGES / SolidWorks)](#5-3d-cad-선화-추출기-step--iges--solidworks)
6. [VRM 캐릭터 포즈 & 웹캠 모션 캡처 활용](#6-vrm-캐릭터-포즈--웹캠-모션-캡처-활용)
7. [포맷 호환성 매니페스트 & Rights BOM](#7-포맷-호환성-매니페스트--rights-bom)

---

## 1. 하이브리드 3D DCC 엔진 개요

ToonSpectrum Studio의 3D DCC 엔진은 단순히 외부 3D 파일을 불러와 보여주는 뷰어가 아닌, **웹툰 세트장 구축(Build Mode)부터 컷별 구도 조작(Shot Mode), 인체/소품 배치, 2D 만화 선화/톤 자동 추출(Toon Output)**까지 한 화면에서 처리합니다.

- **웹툰 작가를 위한 Live 2D↔3D Bridge**: 3D 배경이나 인체 포즈를 수정한 후에도 작가가 선화 위에 보정한 2D 드로잉 레이어가 파괴되지 않고 추적 유지됩니다.
- **WebGPU 우선 렌더링 Engine**: Three.js WebGPURenderer와 TSL(Three Shading Language) 기반의 고성능 카툰 툰셰이딩을 브라우저 60fps로 제공합니다.

---

## 2. 다중 기하 커널 (Multi-Geometry Kernels)과 Authority 구조

3D 오브젝트의 표현 목적에 따라 7가지 권한(Geometry Authority)이 독립 관리됩니다:

| Authority 명칭 | 설명 및 사용 분야 | 대표 연동 포맷 |
|---|---|---|
| `editable-mesh` | 버텍스·엣지·페이스 직접 편집 폴리곤 메시 | glTF / GLB / OBJ |
| `brep-cad` | OpenCascade 기반 정밀 곡면 및 B-Rep CAD 모델 | STEP / IGES / BREP |
| `manifold-solid` | 구멍 없는 견고한 3D 불리언(Boolean) 연산 | CSG / Manifold Solid |
| `sculpt-volume` | Voxel/SDF 기반 자유 조형 스컬프팅 | Dynamic Voxel Mesh |
| `garment-pattern` | 2D 패턴 및 봉제선 기반 의상 물리 커널 | XPBD Cloth / DXF |
| `external-reference` | 외부 3D 앱 원본 에셋 주소 연동 | Blender / SketchUp Bridge |

---

## 3. SketchUp 스타일 추론 시스템 (Inference Snap Engine)

건축 배경이나 소품을 배치할 때 직관적이고 빠른 맞춤 스냅을 지원합니다:

- **Endpoint / Midpoint**: 엣지의 끝점(녹색) 및 중점(cyan) 자동 추적
- **Center / Grid**: 원형 구조 중심점 및 지정 격자(Grid) 스냅
- **Axis Lock**: `X`(레드), `Y`(그린), `Z`(블루) 축 평행 및 수직(Perpendicular) 가이드 라인 잠금

---

## 4. 3D Shot Override & 다중 카메라 컷 동기화

하나의 3D 공간 세트장에 수십 개의 웹툰 연출 컷(Shot)을 생성하고 독립적으로 상태를 관리할 수 있습니다:

1. **Shot 생성**: `Shot Manager`에서 `Shot 1 (정면)`, `Shot 2 (로우앵글)`, `Shot 3 (하이앵글 클로즈업)` 등록.
2. **Shot Override 적용**:
   - 특정 컷에서만 특정 벽을 숨기거나(`Camera Wall Cutaway`),
   - 컷별로 캐릭터 포즈/표정 및 조명 색상을 다르게 적용.
3. **일괄 렌더링**: 원터치 클릭으로 전체 Shot의 선화/섀도우/오브젝트 ID 패스를 한 번에 출력.

---

## 5. 3D CAD 선화 추출기 (STEP / IGES / SolidWorks)

기계, 자동차, 아파트, 무기 등 정밀 3D CAD 모델(.STEP, .IGES)의 외곽선을 깔끔한 2D 만화 선화로 변환합니다:

1. `3D CAD 모델 삽입` 클릭 후 `.step` 또는 `.iges` 파일 선택.
2. `Line Art Extractor` 활성화 후 외곽선 두께(Thickness) 및 감도(Crease Threshold) 조절.
3. 추출된 선화 레이어를 캔버스의 독립 래스터/벡터 레이어로 획득하여 채색.

---

## 6. VRM 캐릭터 포즈 & 웹캠 모션 캡처 활용

1. **VRM 1.0/0.x 호환**: 캐릭터 3D VRM 모델을 소환하고 21개 손가락 마디 포함 포즈 조정.
2. **웹캠 포즈 캡처**:
   - `📹 웹캠 실시간 동작 인식 시작` 클릭.
   - `🔒 포즈 순간 고정 (Freeze)`으로 마네킹 포즈 락 후 캔버스 트레이싱 레이어로 투영.
   - `↔️ 좌우 반전`, `🖐️ 손가락 정밀 솔버`, `😀 얼굴 표정 맵핑` 선택 조작.

---

## 7. 포맷 호환성 매니페스트 & Rights BOM

수입 및 수출하는 3D 에셋의 무손실 여부와 저작권(Rights BOM)을 한눈에 확인할 수 있습니다:

- **Grade A (직접 무손실 지원)**: glTF 2.0, GLB, VRM 1.0, STEP, IGES
- **Grade B (부분 변환 지원)**: FBX, OBJ, 3DS, DXF, IFC
- **Grade C (브리지 연동 필요)**: SketchUp (.skp), Blender (.blend)

---
*ToonSpectrum Studio Hybrid 3D DCC Documentation v1.0*
