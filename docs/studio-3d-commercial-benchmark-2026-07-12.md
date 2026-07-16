# ToonSpectrum Studio 3D 상용 기능 벤치마크

- 기준일: 2026-07-12
- 최신 구현 반영: 2026-07-16 (거리 안개/절차적 360° 환경/캡처 경계)
- 범위: 웹툰 배경 블록아웃, 안전한 3D 자산 반입, 카메라, 객체 관리, 선화·톤 출력, 모바일 성능
- 엔진 결정: [Babylon.js 도입 평가](./studio-babylonjs-adoption-evaluation-2026-07-11.md)에 따라 현재 Three.js + R3F를 유지한다.

## 제품 원칙

3D 도구의 목적은 범용 DCC를 브라우저에 복제하는 것이 아니라, 작가가 배경과 구도를 빠르게 잡고 웹툰 레이어로 안전하게 가져오는 것이다. 다음 계약을 우선한다.

1. 업로드한 파일은 엔진 파서보다 먼저 형식·크기·해시·복잡도 예산을 통과해야 한다.
2. 저장 문서에는 URL, Blob, File, IndexedDB 키, 자격 증명을 넣지 않는다.
3. 카메라·조명·객체·품질·선화/톤 설정은 엔진과 무관한 버전 문서로 왕복한다.
4. 모바일에서는 동일 문서를 사용하되 낮은 DPR·텍스처·그림자 예산을 적용한다.
5. 결과는 단일 미리보기뿐 아니라 선화와 톤을 분리해 후속 편집할 수 있어야 한다.

## 공식 제품 벤치마크

### Clip Studio Paint 3D 편집

Clip Studio Paint는 객체 목록과 화면 조작기를 함께 제공한다. 객체 또는 부품을 선택하고 이동·회전·크기를 바꾸며, 카메라 회전·이동·줌, 평면 이동, 접지, 3D 스냅을 조작기에서 수행한다. 고급 팔레트에는 Transform, Camera, Lens, Light Source, Fog, Panorama, Outline이 분리되어 있다.

- 공식 매뉴얼: [Editing a 3D material](https://help.clip-studio.com/en-us/manual_en/660_3d/Editing_a_3D_material.htm)
- ToonSpectrum 현재 강점: 프리미티브·완성형 장면 템플릿, 이동/회전/크기 기즈모, 수치 입력, 카메라 프리셋, undo/redo, 다중 선택, 표시·잠금, 접지·스텝 스냅, 초점 맞춤, 평행 투영, All Sides View, 트리 UI, 거리 안개, URL 없는 절차적 360° 환경과 수평 회전
- 남은 격차: 사용자 equirectangular image import·fisheye/UV authoring, 실제 parent transform 계층, 표면 직접 페인팅, normal map 편집, BVH pose sequence

Clip Studio Paint의 객체 목록은 복제, 표시/숨김, 잠금, 부모-자식 계층 연결, 여러 객체의 개별 피벗/중앙 피벗 변형, 재사용 가능한 3D 소재 등록을 제공한다.

- 공식 매뉴얼: [Useful features for 3D materials](https://help.clip-studio.com/en-us/manual_en/660_3d/Useful_features_for_3D_materials.htm)
- ToonSpectrum 현재 강점: 객체 복제·삭제, 표시·잠금 상태 저장, 다중 선택, 부모-자식 계층, 프리미티브와 업로드 모델 통합 히스토리, 권리 메타데이터가 있는 로컬 모델·장면 라이브러리
- 남은 격차: 다중 객체 부착점 편집과 물리 기반 충돌·파지

Clip Studio Paint EX의 All Sides View는 원근·정면·측면·상단 뷰와 카메라·초점 객체를 함께 보여주며 캔버스와 원근 뷰를 동기화한다.

- 공식 매뉴얼: [All Sides View palette](https://help.clip-studio.com/en-us/manual_en/660_3d/All_Sides_View_palette.htm)
- ToonSpectrum 현재 강점: 원근·정면·측면·상단 4분할, 선택 대상 중심 맞춤, 모바일 단일 뷰 전환
- 남은 격차: 카메라 프러스텀의 직접 편집과 뷰별 독립 표시 옵션

Clip Studio Paint는 3D 객체·배경·프리미티브·파노라마를 소재 팔레트에서 재사용한다. GLB/glTF/OBJ/FBX/VRM 등 다양한 입력을 지원하지만, ToonSpectrum 웹 런타임은 외부 참조와 파서 공격면을 줄이기 위해 신규 사용자 업로드를 자체 포함 GLB 2.0으로 제한한다.

- 공식 매뉴얼: [3D Tools](https://help.clip-studio.com/en-us/manual_en/660_3d/3D_Tools.htm)
- 공식 매뉴얼: [Importing 3D Files](https://help.clip-studio.com/en-us/manual_en/660_3d/Importing_3D_Files.htm)

### Clip Studio Paint 선화·톤 변환

Clip Studio Paint EX는 3D 레이어를 선화와 톤 레이어로 분리한다. 3D 선화에는 raster/vector, 선 폭·강도, 화면 크기에 따른 정밀도, 외곽선 강조, 깊이, 외곽선에만 깊이 적용, 스무딩이 있고, 텍스처 선과 톤은 별도로 켜고 조정한다. 톤에는 포스터라이즈 단계, 회색조 또는 점 패턴, 형태, 각도, 빈도가 있다.

- 공식 매뉴얼: [Convert to lines and tones](https://help.clip-studio.com/en-us/manual_en/390_filters/Convert_to_lines_and_tones_%28EX_only%29.htm)
- ToonSpectrum 현재 강점: 엔진 중립 장면 문서에 컬러·선화·텍스처 선·톤 설정과 프리셋을 저장하고, 컬러/톤/텍스처 선/주선을 편집 가능한 별도 PNG 레이어로 삽입
- 2026-07-12 수정: 기본 `tone.mode="none"`이 WebGL 재질색과 조명을 버려 선만 삽입하던 문제를 고쳤다. 신규 장면은 `flat + color`이며, 과거 선화 전용 장면에는 `컬러 렌더 켜기` 복구 동작을 제공한다.
- 남은 격차: 진짜 vector 선 결과, 깊이 기반 선 굵기, CSP 3D 레이어와 같은 비파괴 재편집, 사용자 정의 출력 프리셋 관리

### Khronos glTF/GLB 반입 품질

Khronos glTF 2.0 사양은 GLB 헤더 magic, container version, 전체 길이, JSON/BIN chunk 구조와 URI 자원을 정의한다. 공식 Validator는 사양 적합성, Asset Auditor는 용도별 모델·텍스처 예산 검사를 담당한다.

- 공식 사양: [glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- 공식 도구: [glTF Validator](https://github.khronos.org/glTF-Validator/)
- 공식 도구: [glTF Asset Auditor](https://www.khronos.org/gltf/gltf-asset-auditor/)

ToonSpectrum은 엔진 로더 호출 전에 다음을 자체 검증한다.

- 실제 바이트 길이와 선언 길이 일치
- SHA-256과 저장 메타데이터 일치
- GLB magic `0x46546C67`, container version 2, header total length
- JSON chunk 선두 배치, chunk 경계·정렬, embedded BIN만 허용
- `buffers[*].uri`, `images[*].uri` 등 외부·data·blob·file·http 참조 거부
- 노드, 삼각형, draw call, material, light, texture 개수·바이트·최대 치수 예산
- 검증 성공 후에만 Three `GLTFLoader` 호출

## 기능 격차와 구현 상태

| 영역 | 상용 기준 | 상태 | 합격 증거 |
| --- | --- | --- | --- |
| 장면 문서 | 카메라·렌더·배경·조명·품질·출력·예산·첨부·노드의 버전 문서 | 제품 UI·archive 왕복 연결 완료 | strict/lenient API 분리, UTF-8 256 KiB, 버전 우회·저장 키 유출·이모지 경계 테스트 |
| GLB 반입 | 실제 바이트·해시·GLB 구조·외부 URI·복잡도 검증 | 자체 포함 GLB 2.0 제품 경로 연결 완료 | 방어 복사, SHA-256, GLB 2.0, embedded-only, 모바일/데스크톱 예산, 디코드 메모리 폭탄 테스트 |
| 논리 첨부 ID | 저장 키와 장면 참조 분리 | 모델 라이브러리·scene round-trip 연결 완료 | 양방향 explicit mapping, identity/conflict 차단, 저장 키 비영속·legacy mapping 테스트 |
| 품질 프로필 | desktop/mobile DPR·그림자·텍스처·LOD·FPS 목표 | 문서·런타임 연결 완료 · 다기종 성능 표본 확대 필요 | 375×812 UI/터치 검증, 대표 Android/iPhone 프레임·메모리는 후속 측정 |
| LT 출력 | 컬러·선화·텍스처 선·톤 설정, 분리 결과 | raster 레이어 분리 삽입 완료 | 컬러→톤→텍스처 선→주선 순서, 컬러/셀 명암과 알파 보존, 회귀 테스트 |
| 객체 목록 | 표시·잠금·복제·삭제·검색 | 구현 완료 | 상태 왕복, 잠긴 객체 기즈모 차단, 44px 모바일 조작 |
| 다중 선택 | Shift/범위 선택, 함께 이동, 개별/중앙 피벗 | 구현 완료 | selectedIds Set 전환, 델타 변환, Shift 토글 완료 |
| 계층 | 부모-자식 연결과 함께 이동 | 구현 완료 | parentId UI 및 Three.js 재귀 렌더링 씬 그래프 연결 완료 |
| 접지·스냅 | 바닥 접지, 이동/회전 스텝, 객체 스냅 | 구현 완료 | 결정적 순수 함수와 기즈모 QA |
| 카메라 | position/target/FOV, preset, 초점, 평행 투영 | 구현 완료 | 사용자 카메라 왕복, 재열기 픽셀 근사 일치 |
| 공간 안개 | 시작·완전 혼합 거리, 대기색, 프리셋, 캡처 반영 | 구현 완료 | 장면 문서 유한 범위 제한, 렌더 경계 순서 보정, declarative R3F fog, 뷰포트·LT 컬러/톤 동시 반영 |
| 360° 환경 | equirectangular 배경, 회전, 캡처·투명/깊이 경계 | 절차적 프리셋 제품 연결 · 외부 이미지 authoring은 후속 | URL 없는 낮·노을·밤 DataTexture, 회전 왕복, 불투명 color/LT 포함, 투명·depth pass 제외, strict 문서에서 panorama URL 거부 |
| All Sides View | 원근+정면+측면+상단 동기화 | 구현 완료 | 선택 중심/카메라 프러스텀/모바일 단일뷰 전환 |
| 소재 라이브러리 | 장면·객체 재사용, 권리/출처, 검색/즐겨찾기 | 구현 완료 | 권리 경고, hash 중복 제거, 내보내기 포함 정책 |

## 단계별 구현 순서

### P0 — 안전한 상용 기반

1. 장면 문서 strict/repair API 분리와 결정적 byte budget
2. 논리 attachment ID와 IndexedDB storage key 분리
3. GLB-only 신규 업로드와 실제 바이트 validator
4. 엔진 파서 전 검증 및 실패 사유의 안전한 한국어 안내
5. 카메라·배경·선화/톤·품질 설정 round-trip

### P1 — 작가 작업 속도

1. 표시/잠금/이름 변경과 객체 검색
2. 접지, 초점 맞춤, 회전·이동 스텝 스냅
3. 다중 선택과 중앙/개별 피벗
4. 장면을 내 소재로 저장, hash 중복 제거, 권리 상태 배지
5. 모바일 저품질 편집 → 고품질 캡처의 명시적 전환

### P2 — 전문 배경 제작

1. 선화/텍스처 선/톤 분리 삽입과 프리셋
2. 깊이 기반 외곽선, 스무딩, scale-aware 정확도
3. 평행 투영·렌즈·안개·절차적 360° 환경(완료), 사용자 파노라마 import·fisheye/UV authoring
4. 4분할 All Sides View
5. 부모-자식 계층과 부착 지점

## 모바일·성능 합격 조건

- 375×812에서 주요 조작 44×44 CSS px 이상, 문서 가로 overflow 0
- 편집 기본 목표 30 FPS, 데스크톱 목표 60 FPS
- 모바일 DPR 상한과 `maxRenderPixels`를 동시에 적용
- 숨김 모달/백그라운드에서 render loop 중지
- 모달 종료 후 geometry/material/texture/object URL/WebGL context 참조 정리
- 거대 GLB는 파싱 전에 거부하며, 실패 후에도 같은 세션에서 정상 파일을 다시 올릴 수 있음
- 캡처 시 일시적으로 고품질 프로필을 적용하되 완료·실패 모두 편집 프로필로 복원

## Babylon.js 재검토 경계

위 기능은 Three/R3F로 먼저 구현한다. Babylon은 대형 대표 장면에서 p95 frame time 25% 이상 개선, 같은 메모리 한도에서 객체 수 2배, 동일 출력·undo·round-trip, 도구-open gzip 악화 15% 이내를 모두 실기기에서 증명할 때만 격리 실험에서 재검토한다. 프로덕션에서 두 엔진을 영구 병행하지 않는다.
