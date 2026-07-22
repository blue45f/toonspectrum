# ToonSpectrum Studio 포맷 상호운용 감사 및 확장안

작성일: 2026-07-22

이 문서는 파일 확장자가 메뉴에 보이는지만 세지 않는다. 실제 저장소의 parser/writer, 안전 한도,
왕복 손실, 브라우저 의존성, UI 연결 상태를 함께 확인한다. 실행 시점의 단일 진실 원천은
`src/domains/creator/studio-interchange-capabilities.ts`이다.

## 상태 정의

| 상태 | 의미 |
| --- | --- |
| 사용 가능 | Studio UI에서 실제 가져오기/내보내기를 호출할 수 있고 엔진 테스트가 있음 |
| 부분 지원 | 동작하지만 원본의 일부 구조를 래스터화·근사·생략함 |
| 엔진 준비 | 안전한 codec과 테스트가 있으나 파일 메뉴 연결이 남아 있음 |
| 브리지 전용 | 독점 포맷을 직접 읽거나 쓰지 않고 공개 교환 포맷을 안내함 |
| 계획 | 아직 구현하지 않았으며 지원한다고 표시하면 안 됨 |

## 현재 지원 매트릭스

### 프로젝트·문서·출판

| 포맷 | 가져오기 | 내보내기 | 왕복 | 현재 손실·제약 |
| --- | --- | --- | --- | --- |
| `.toonproject.zip` | 사용 가능 | 사용 가능 | 무손실 | 현재 writer의 deterministic ZIP subset만 허용. 280MB archive, 256MB attachment 합계 한도 |
| ToonSpectrum `.json` | 사용 가능 | 사용 가능 | 부분 | 외부 URL/IndexedDB 원본은 JSON 한 파일에 포함되지 않을 수 있음 |
| PSD | 부분 | 부분 | 부분 | 텍스트·벡터·스마트 오브젝트·조정 레이어·일부 효과/그룹/마스크를 래스터화 또는 근사 |
| SVG | 미지원 | 사용 가능 | 없음 | 일부 브러시·래스터 효과를 근사 또는 이미지로 출력 |
| PDF 1.4 | 미지원 | 사용 가능 | 없음 | 페이지별 JPEG를 담은 공유·검토용 PDF. 편집 가능한 텍스트/벡터 및 PDF/X 아님 |
| CBZ | 사용 가능 | 사용 가능 | 없음 | PNG/JPEG/WebP/GIF를 natural order 페이지 이미지로 가져옴. 내부 레이어와 `ComicInfo.xml` metadata는 완전 왕복하지 않으며 export는 전체 페이지 평탄화 |
| OpenRaster `.ora` | 사용 가능 | 사용 가능 | 부분 | 레이어 위치·opacity·visibility·지원 blend와 PNG를 가져옴. 중첩 stack은 검증하지만 Studio 적용 시 경로명 단일 그룹으로 평탄화될 수 있고 export는 화면 합성 1레이어 |

관련 구현:

- `studio-project-file.ts`, `studio-project-archive.ts`, `studio-package-archive.ts`
- `studio-psd-import.ts`, `studio-psd-export.ts`
- `studio-svg-export.ts`, `studio-svg-export.worker.ts`
- `studio-pdf-export.ts`, `studio-review-pdf.ts`
- `studio-openraster-interchange.ts`, `studio-cbz-interchange.ts`, `studio-zip-reader.ts`

PSD·ORA·CBZ 가져오기는 같은 손실 미리보기를 거친다. 원본과 적용 결과의 페이지/레이어 수,
해상도, 알파, 색공간, 편집 가능성, 표시 프록시를 적용 전에 비교하고, 차단 조건이 있으면 확인
버튼을 비활성화한다. 프로젝트 JSON에 영구 포함되는 data URL 저장 payload 합계는 모바일 64MiB,
데스크톱 128MiB가 상한이다. codec의 원본 이미지 추출 한도는 base64의 약 4/3 팽창과 이미지별
header 여유를 먼저 차감한다. 이 한도는 ZIP parser의 일시적인 압축 해제 한도와 별개이며, 장시간
편집 중 localStorage/IndexedDB·브라우저 메모리가 계속 감당할 수 있는 프로젝트 크기를 위한
적용 단계 한도다.

ORA/CBZ 공통 ZIP reader는 ZIP32 단일 디스크와 STORE/DEFLATE만 허용한다. ZIP64, 암호화,
data descriptor, UTF-8 flag가 없는 legacy 경로, 지원하지 않는 압축 방식, CRC 불일치, 중복·절대·
경로 탈출 항목은 조용히 건너뛰지 않고 fail-closed 처리한다.

OpenRaster import는 중첩 stack을 group DTO로 검증하고 레이어 순서·좌표·지원 blend mode 및 조상
그룹까지 계산한 유효 opacity/visibility를 적용한다. 현재 Studio 그룹 모델은 중첩 트리를 직접
표현하지 않으므로 `상위 / 하위` 전체 경로명을 가진 단일 그룹으로 평탄화할 수 있다. 각 PNG의
IHDR·크기와 개별 16,777,216픽셀, 전체 RGBA 128MiB 예산을 브라우저 decode 전에 검사한다. 모든
그룹의 단위 opacity/blend는 자식 레이어 유효 값으로 근사하므로 겹치는 반투명 자식의 픽셀 결과가
달라질 수 있으며, 공통 손실 미리보기에서 이를 명시한다.

CBZ import는 확장자만 신뢰하지 않고 PNG/JPEG/WebP/GIF의 실제 header, dimension, frame/decoded
pixel 예산을 검사한 뒤 Unicode natural order로 페이지를 만든다. `ComicInfo.xml`은 strict UTF-8
XML로 읽고 element·depth·attribute·text 복잡도를 제한하며 제목·시리즈·권수·날짜·제작진·언어
등 허용 목록의 핵심 metadata만 요약한다. codec core의 절대 상한은 1,099페이지지만 Studio는 기존
페이지를 포함해 프로젝트당 200페이지까지만 허용한다. 헤더 검사 뒤 각 이미지를 브라우저 디코더로
순차 검증하고 실제 크기도 대조한 뒤 적용한다. 가져온 각 페이지는 원본 이미지 한 장을 가진 Studio
페이지이며 원본 만화의 내부 편집 레이어는 복원하지 않는다.

### 래스터·애니메이션

| 포맷 | 가져오기 | 내보내기 | 제약 |
| --- | --- | --- | --- |
| PNG | 사용 가능 | 사용 가능 | 레이어·벡터·텍스트 구조 평탄화, ICC/광색역 메타데이터 미보존 |
| JPEG | 사용 가능 | 사용 가능 | 손실 압축, 알파 제거, 기본 출력 품질 0.92 |
| WebP | 사용 가능 | 사용 가능 | 브라우저 codec 의존, 기본 출력 품질 0.92 |
| GIF | 사용 가능 | 미지원 | 서명 검증 후 캔버스/참고 애니메이션으로 사용. GIF encoder는 없음 |
| BMP / DIB | 사용 가능 | 사용 가능 | 24/32-bit 비압축 import, 24-bit export. import는 장변 1,280px WebP 표시 프록시로 변환 |
| TGA / ICB / VDA / VST | 사용 가능 | 사용 가능 | 비압축 24/32-bit true-color 범위. import는 장변 1,280px WebP 표시 프록시로 변환 |
| PPM / PAM | 사용 가능 | 사용 가능 | 8-bit binary Netpbm 범위. PPM export는 알파를 흰색에 합성하고 import는 표시 프록시로 변환 |
| QOI | 사용 가능 | 사용 가능 | sRGB 3/4-channel 범위. import는 장변 1,280px WebP 표시 프록시로 변환 |
| TIFF | 사용 가능 | 사용 가능 | TIFF 6.0 baseline 무압축 8-bit RGB/RGBA, II/MM·chunky/separated multi-strip import. import는 표시 프록시로 변환 |
| WebM (VP9/VP8) | 미지원 | 사용 가능 | MediaRecorder 지원에 따라 VP9→VP8→컨테이너 기본값 순 폴백 |
| GIF/APNG/MP4 출력 | 미지원 | 계획 | 추가 encoder/WebCodecs 및 muxer 검증 전에는 지원으로 표시하지 않음 |

일반 참고 이미지에는 12MB/파일, 48MB/배치 한도가 적용된다. 긴 페이지 출력은 브라우저 공통
Canvas 한 변 16,384px 한도 안에서 배율을 낮추거나 여러 파일로 분할한다.
브라우저가 기본 지원하지 않는 공개 래스터는 전용 Worker에서 decode/encode한다. Worker 없이
작은 1MP 이하 작업만 직접 처리하고, 큰 작업은 UI 멈춤을 피하기 위해 동기 fallback하지 않는다.
현재 캔버스 삽입물은 편집용 원본이 아니라 장변 1,280px, WebP quality 0.85 표시 프록시이므로
원본 픽셀·메타데이터·무손실 왕복을 보장하지 않는다.

### 브러시·팔레트

| 포맷 | 가져오기 | 내보내기 | 제약 |
| --- | --- | --- | --- |
| Photoshop ABR 6/7/9/10 | 부분 | 미지원 | 32MB, 256 브러시. Photoshop 전용 dynamics/dual brush/texture는 근사 또는 생략 |
| PNG 펜촉 | 사용 가능 | 미지원 | 4MB, 4,096px, 1,600만 source pixel → 최대 64×64 alpha mask |
| GIMP GPL | 사용 가능 | 사용 가능 | 기존 팔레트 라이브러리 UI와 연결됨 |
| Adobe ASE | 사용 가능 | 사용 가능 | RGB/Gray/CMYK/Lab import, 호환 RGB export. 팔레트 라이브러리 UI 연결됨 |
| Adobe ACO | 사용 가능 | 사용 가능 | RGB/HSB/CMYK/Lab/Gray import, v1+v2 RGB export. 팔레트 라이브러리 UI 연결됨 |
| Adobe ACT | 사용 가능 | 사용 가능 | 768/772-byte table, 최대 256색. 색 이름 미지원과 투명 인덱스 손실을 경고 |
| JASC-PAL | 사용 가능 | 사용 가능 | 최대 256색, 색 이름 미지원 손실을 경고 |
| CSS custom properties | 사용 가능 | 사용 가능 | `--name: <hex/rgb>` 교환. 팔레트 라이브러리 UI 연결됨 |
| ToonSpectrum palette JSON | 사용 가능 | 사용 가능 | versioned canonical schema. 팔레트 라이브러리 UI 연결됨 |

새 팔레트 엔진 `studio-palette-interchange.ts`의 공통 정책은 다음과 같다.

- 파일 최대 4MB, 색 최대 1,000개, ASE/ACO block 최대 4,096개
- UTF-8은 fatal decoder로 읽어 잘못된 바이트를 대체 문자로 숨기지 않음
- ASE/ACO의 선언 길이, UTF-16 종료 문자, 블록 끝, trailing bytes를 모두 검사
- 가져오기 결과에 `skippedColors`, `truncated`, 구조화된 `warnings`를 반환
- Studio 팔레트는 현재 불투명 8-bit sRGB이므로 알파, spot/global 분류, ICC/광색역은 조용히
  버리지 않고 손실 경고를 반환
- ASE의 Gray/CMYK/Lab과 ACO의 HSB/CMYK/Lab/Gray는 표시용 sRGB로 변환하고
  `non-rgb-converted` 경고를 남김
- GPL은 중복 parser를 만들지 않고 검증된 기존 `studio-palette-library.ts`에 위임

### 대사·연재 운영

| 포맷 | 가져오기 | 내보내기 | 제약 |
| --- | --- | --- | --- |
| versioned 대사 JSON | 사용 가능 | 사용 가능 | ID·페이지·컷·화자·메모·시간을 cue schema로 무손실 보존 |
| 대사 CSV/TSV | 사용 가능 | 사용 가능 | 수식 실행 위험 셀을 apostrophe로 중립화, quoted newline/quote 검증 |
| TXT/Markdown | 사용 가능 | 사용 가능 | 메모·시간 정보 손실 |
| Fountain | 사용 가능 | 사용 가능 | 페이지·컷 주석은 보존하지만 캔버스 좌표는 없음 |
| SRT/WebVTT | 사용 가능 | 사용 가능 | 페이지·컷 좌표가 없어 순서로 연결, 시간 미지정 출력은 3초 간격 생성 |
| `.toonaction.json` | 사용 가능 | 사용 가능 | 128,000 code units, 명령 64개, tree node/depth/work-unit 예산 |
| 연재 일정 `.ics` | 미지원 | 사용 가능 | RFC 5545, 최대 500건/2MB. 외부 플랫폼 예약 게시를 생성하지 않음 |
| 성과 CSV | 사용 가능 | 미지원 | 최대 10,000건. 원문 대신 허용된 정규화 지표/출처만 로컬 저장 |
| `.toonpkg.zip` 게시 패키지 | 미지원 | 사용 가능 | 결과 이미지·review PDF·manifest·공개 AI 요약용. 프로젝트 복구 포맷은 아님 |

대사 포맷은 `StudioDialogueBatchPanel`에 실제 연결되어 있다. CSV/TSV/JSON/Fountain/SRT/VTT/
Markdown/TXT parser는 8MB, cue 20,000개, field/timestamp 한도를 공유하고 malformed UTF-8,
NUL, 닫히지 않은 quote, 뒤집힌 시간 범위를 문서 변경 전에 거부한다.

### 3D

| 포맷 | 가져오기 | 내보내기 | 현재 처리 |
| --- | --- | --- | --- |
| GLB | 사용 가능 | 미지원 | 검증 후 canonical self-contained GLB로 보관 |
| glTF + BIN/texture | 사용 가능 | 미지원 | 연결 리소스를 검증하고 self-contained GLB로 변환 |
| OBJ + MTL/texture | 사용 가능 | 미지원 | 큰 파일 Worker 경계, MTL·재질·텍스처 검증 후 GLB 변환 |
| FBX | 사용 가능 | 미지원 | Three.js lazy loader → GLB 정규화 |
| COLLADA DAE | 사용 가능 | 미지원 | Three.js lazy loader → GLB 정규화 |
| STL | 사용 가능 | 미지원 | 큰 기하는 Worker 필수, GLB 정규화 |
| PLY | 사용 가능 | 미지원 | 큰 기하는 Worker 필수, GLB 정규화 |
| 3DS | 사용 가능 | 미지원 | Three.js lazy loader → GLB 정규화 |
| VRM | 사용 가능 | 미지원 | 업로드·포즈·표정·소품·렌더 지원. VRM authoring/export는 아님 |

한 번에 최대 256개 파일/32개 모델/300MB source batch를 계획하고, GLB 한 파일은 100MB,
변환 source는 일반적으로 32MB, decoded geometry는 256MB로 제한한다. 정점·삼각형·노드·재질·
애니메이션에도 별도 예산이 있다. 원본 포맷의 수정 가능한 구조를 보존하는 왕복이 아니라,
Studio 렌더링에 안전한 GLB로 정규화하는 import pipeline이다.

## 직접 지원하지 않는 독점 포맷

| 포맷 | 직접 지원 | 권장 브리지 |
| --- | --- | --- |
| CLIP STUDIO `.clip` | 없음 | 레이어 교환은 PSD, 결과물은 PNG, 벡터는 SVG |
| CLIP STUDIO brush `.sut` | 없음 | ABR 또는 PNG 펜촉 + Studio 브러시 설정 |
| Adobe Illustrator `.ai` | 없음 | SVG/PDF/PSD/PNG |

이 세 포맷은 공개 교환 규격과 달리 원본 프로그램의 독점 내부 구조에 의존한다. 확장자만 받아
평탄화한 뒤 “호환”이라고 표시하지 않는다. 원본 프로그램에서 공개 포맷으로 명시적으로
내보내고, Studio는 어떤 편집성이 손실되는지 사전에 보여주는 방향이 안전하다.

## 검증 범위

새 codec 테스트는 다음을 고정한다.

- ASE RGB 이름/순서 왕복, Gray/CMYK/Lab 변환, 잘린 헤더, 길이 위조, trailing bytes,
  unsupported version/색공간
- ACO v1 단독 import, v1+v2 이름 왕복, HSB/CMYK/Lab/Gray 변환, section 순서와 이름 길이 위조
- GPL 기존 codec 위임과 invalid magic/UTF-8
- CSS hex/rgb/alpha, 한글 변수명, invalid declaration, 안전하고 중복 없는 export name
- canonical JSON schema/version, 알파/광색역 손실, malformed/empty palette
- 4MB byte budget, 1,000색 truncation, invalid color skip 및 모든 손실 warning
- ORA stack 중첩·그룹 opacity/visibility/blend/좌표, PNG IHDR·개별/누적 decoded RGBA 예산,
  잘못된 XML/preview mismatch 및 abort
- CBZ PNG/JPEG/WebP/GIF header·dimension·frame budget, Unicode natural order, `ComicInfo.xml`
  허용 metadata, 페이지/encoded/decoded 총량 및 abort
- ZIP32 STORE/DEFLATE 정상 경로와 ZIP64·암호화·data descriptor·legacy non-UTF-8·unsupported
  compression·CRC/path 위조의 fail-closed 경로
- PSD/ORA/CBZ 공통 손실 미리보기의 해상도·레이어·페이지·프록시·편집성 요약과 기기별 영구
  포함 용량 차단
- registry id/extension 정규화, 상태 모순, 독점 포맷 bridge, 실제 runtime hard limit

## 후속 구현 우선순위

### 1. 완료된 1차 포맷 허브와 손실 미리보기

ASE/ACO/ACT/JASC-PAL/CSS/JSON 팔레트 양방향 UI와 CBZ/ORA import/export가 파일 메뉴에 연결됐다.
PSD/ORA/CBZ는 공통 손실 미리보기에서 해상도·알파·색공간·레이어/페이지·편집성·표시 프록시와
기기별 영구 포함 용량을 확인한 뒤 적용한다. codec은 초기 Studio bundle에 넣지 않고 파일을 선택할
때 dynamic import하는 원칙을 유지한다.

### 2. OpenRaster 고도화

- 완료: 중첩 stack DTO, group/layer opacity·visibility·지원 blend mode·좌표 mapping,
  `mergedimage.png`/`Thumbnails/thumbnail.png` 검증과 import summary
- 완료: 알 수 없는 XML extension, 지원하지 않는 blend/mask를 구조화된 warning으로 반환
- 완료: layer PNG 개별/총 decoded pixel/byte budget과 ZIP bomb/zip-slip/duplicate-path 차단
- 남음: Studio 내부 중첩 그룹 모델과 연결해 경로명 평탄화 없이 트리를 그대로 편집
- 남음: 현재 합성 1레이어 export를 실제 다층 ORA writer UI로 승격
- Studio 전용 벡터·말풍선·필터는 원본 편집 데이터를 프로젝트 archive에 유지하고 ORA에는
  렌더 레이어를 내보내는 dual-save workflow

### 3. CBZ·이미지 시퀀스

- 완료: PNG/JPEG/WebP/GIF signature·dimension·decoded 예산 검사와 Unicode natural order import
- 완료: zero-padding export path와 허용 목록 기반 `ComicInfo.xml` import/export
- 남음: PNG/JPEG/WebP 출력 선택과 전체 예상 용량 preflight
- 남음: 개인정보·AI provenance는 공개 정책이 확정된 `ComicInfo.xml` 필드만 명시적 opt-in
- 이미지 시퀀스 ZIP과 CBZ writer를 같은 streaming entry pipeline으로 공유

### 4. 애니메이션 교환

- APNG: 알파가 필요한 짧은 모션, frame/duration/decoded-memory budget
- GIF: 256색 quantization과 dithering을 Worker에 두고 예상 banding/파일 크기 표시
- MP4: WebCodecs `VideoEncoder` + 검증된 MP4 muxer가 가능한 브라우저에서만 노출,
  미지원 환경은 WebM 유지
- 모든 영상 출력은 취소/진행률/메모리 release와 모바일 해상도 profile을 선행

### 5. 3D 내보내기

- canonical GLB 다운로드부터 시작: 이미 검증·해시된 project attachment만 export
- OBJ/STL export는 애니메이션·PBR·rig가 손실됨을 preflight에서 명시
- glTF JSON + resource folder/ZIP은 경로 정규화, MIME/signature, license metadata가 준비된 뒤 추가
- FBX/DAE/3DS writer는 Three.js import와 대칭이 아니므로 “가져오기가 되니 내보내기도 된다”고
  가정하지 않음. Blender GLB bridge를 우선

### 6. 추가 후보

- AVIF/HEIC: `ImageDecoder`·Canvas encoder capability detection, 품질·알파 golden test와 WASM
  fallback의 번들·메모리 비용을 측정한 뒤 opt-in
- FDX: 현재의 대사 cue 모델로 매핑하되 Final Draft XML의 scene/character/action 구조 손실 preview 필요
- 대사 포맷 다음 단계: 위치가 없는 cue의 말풍선 자동 매핑 preview와 SRT/VTT 타임라인 drag sync
- 팔레트 다음 단계: ICC profile-aware color 관리 또는 Display-P3 내부 색 모델을 도입할 때만
  광색역 왕복을 `lossless`로 승격

## 완료 기준

새 포맷을 “지원”으로 바꾸려면 다음을 모두 만족해야 한다.

1. magic/signature와 declared length를 검사하고 malformed/truncated/trailing data가 fail-closed일 것
2. 파일·항목·decoded memory·dimension·시간 예산이 있을 것
3. round-trip golden test와 타사 앱에서 연 샘플 fixture가 있을 것
4. Worker가 필요한 크기에서 main-thread 무제한 fallback을 하지 않을 것
5. 취소·진행률·실패 후 재시도와 임시 메모리/URL 정리가 있을 것
6. 편집성·알파·색공간·레이어·애니메이션 손실을 사용자에게 저장 전에 보여줄 것
7. codec-only와 실제 메뉴 노출 상태를 capability registry에서 다르게 표시할 것
