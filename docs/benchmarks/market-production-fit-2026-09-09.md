# 마켓 제작 적합성 벤치마크와 구현 결정

- 기준일: 2026-09-09
- 대상: ToonSpectrum 공개 마켓의 탐색 → 판단 → 획득 전환 구간
- 구현 범위: 서버 manifest 기반 제작 적합성 패스포트, 전용 랩, 상세 사전점검, 카드 배지

## 1. 벤치마크한 서비스와 채택한 패턴

| 서비스 | 공식 흐름에서 확인한 패턴 | ToonSpectrum 적용 |
|---|---|---|
| CLIP STUDIO ASSETS | 팔레트/소재 종류 문맥에 맞는 탐색, 다운로드 소재와 기본 소재 구분, 캔버스·팔레트로 드래그하거나 추가, 즐겨찾기·My Downloads·재다운로드, 지원 버전 확인 | 리소스 종류만 고르는 수준을 넘어 현재 Studio 버전과 렌더러를 먼저 선언하고, 카드와 상세에서 같은 판정을 재사용한다. |
| Unity Asset Store / Package Manager | My Assets 검색·필터, Download와 Import 분리, 항목 선택 import, 진행 중 일시정지·재개·취소, 업데이트 확인, 완성 프로젝트는 임시 프로젝트에서 먼저 검사, Publisher Validator로 업로드 품질 검사 | 이번 MR은 획득·적용 전에 manifest 검사를 명시적으로 분리한다. 실제 다운로드·변환·삽입 원자 트랜잭션은 후속 Studio 작업으로 남기고 완료된 것처럼 표시하지 않는다. |
| Fab | 웹·런처·엔진 통합 탐색, 파일 형식 선택, Download / Add to Project / Install Plugin / Create Project처럼 자산 유형에 맞춘 동작, 다운로드 관리자에서 중지·취소·순서 변경 | 전달 방식(`builtin-ref`, `portable-json`, `procedural-recipe`)을 판정 근거로 노출하고, 독립 portable 패키지만 허용하는 제작 정책을 제공한다. |
| SketchUp 3D Warehouse | 컬렉션과 카탈로그를 통한 반복 탐색, 카탈로그 수준의 콘텐츠 관리와 분석 | 단순 최신순 목록에 그치지 않고 사용자가 선언한 제작 조건으로 현재 서버 결과를 재정렬하고 상태 필터로 반복 탐색한다. 팀 컬렉션은 기존 MKT-08 후속 범위로 유지한다. |

### 공식 참고 자료

- CLIP STUDIO PAINT User Guide — Loading materials: https://help.clip-studio.com/en-us/manual_en/630_material/How_to_load_materials.htm
- CLIP STUDIO TIPS — Managing downloaded materials: https://tips.clip-studio.com/en-us/articles/826
- Unity Manual — Asset Store packages: https://docs.unity3d.com/Manual/AssetStorePackages.html
- Unity Manual — Downloading Asset Store packages: https://docs.unity3d.com/Manual/upm-ui-download.html
- Unity Manual — Importing a complete project: https://docs.unity3d.com/Manual/upm-ui-import.html
- Unity Asset Store Publishing — Validate and upload assets: https://docs.unity3d.com/Packages/com.unity.asset-store-tools@latest/index.html
- Fab Documentation: https://dev.epicgames.com/documentation/en-us/fab/fab-documentation
- Fab in Launcher: https://dev.epicgames.com/documentation/en-us/fab/purchasing-and-downloading-assets-in-fab
- SketchUp Help — 3D Warehouse catalog analytics: https://help.sketchup.com/en/3d-warehouse/catalog-analytics
- SketchUp Help — Creating and sharing collections: https://help.sketchup.com/en/3d-warehouse/creating-and-sharing-collections

## 2. 기존 제품 감사

이미 존재하는 강점은 유지했다.

- 공개 목록과 상세는 서버 응답 또는 과거 서버 응답 캐시만 사용한다.
- 찜, 비교, 리뷰·댓글, 클라우드 라이브러리, 판매자 센터, Studio 획득 흐름이 분리되어 있다.
- 가격·평점·공식 인증·판매량을 근거 없이 만들지 않는 신뢰 경계가 있다.
- 리소스 manifest에 최소 Studio 버전, 렌더러, 사용권, AI 포함 여부, provenance, 전달 방식이 존재한다.

남은 핵심 격차는 manifest가 있어도 사용자가 자신의 제작 조건과 대조하기 어렵다는 점이었다. 탐색 화면은 종류·라이선스·태그 중심이었고, 상세 화면에서도 조건별 통과/확인/차단의 이유를 한눈에 비교하기 어려웠다.

## 3. 구현한 제작 적합성 패스포트

사용자 프로필은 결제·소유권·설치 상태가 아니라 로컬 탐색 선호다. 브라우저 저장소에만 저장하며 서버 권위 데이터와 섞지 않는다.

### 입력 조건

1. 현재 Studio 버전 — 비어 있거나 잘못된 SemVer면 호환으로 추정하지 않고 `확인 필요`
2. 필요한 렌더러 — 제한 없음, Canvas 2D, WebGL 2, WebGPU, Three.js
3. 작품 이용 범위 — 상업 또는 비상업
4. AI 정책 — 허용, 적용 전 확인, 제외
5. provenance 정책 — 원본·퍼미시브 허용 또는 배급자 원본만
6. 전달 정책 — 모든 manifest 방식 또는 독립 portable 패키지만
7. 저작자 표시 보존 가능 여부

### 판정 상태

- `ready`: 7개 검사에 차단이나 확인 항목이 없음
- `review`: 차단은 없지만 근거가 부족하거나 사람이 확인해야 하는 항목이 있음
- `blocked`: 한 개 이상의 명시적 조건 충돌이 있음

별점이나 불투명한 종합 점수는 만들지 않는다. 결과에는 충족·확인·차단 개수와 각 manifest 증거를 함께 표시한다.

## 4. 제품 흐름 변화

- `/market/fit`: 현재 불러온 서버 페이지를 제작 조건 일치 → 확인 필요 → 차단 순으로 재정렬한다.
- 모든 마켓 카드: 같은 프로필을 사용한 압축 배지와 7개 중 충족 개수를 표시한다.
- 리소스 상세: 획득 UI 앞에 7개 검사의 이유와 증거, 사용권 원문, permissive 원 출처 링크를 제공한다.
- 내비게이션: `제작 조건` 진입점을 추가한다.
- 저장 실패 복구: localStorage가 차단되어도 현재 탭의 연속 편집은 유지하며 지속성 저하를 명시한다.
- 오프라인 캐시: 기존 서버 사본 경고와 재시도 흐름을 그대로 유지한다.

## 5. 의도적으로 완료 처리하지 않은 범위

이번 MR은 MKT-02(입체적 호환성), MKT-03(권리·사용 범위 정보), MKT-06(비교·검색·필터)를 실질적으로 전진시키지만 다음 항목은 완료라고 주장하지 않는다.

- MKT-04: 선택한 실제 컷·카메라·팔레트에서의 샌드박스 미리 적용
- MKT-05: 검증 → 다운로드 → 변환 → 삽입의 취소·부분 실패·중복 클릭·재시도·Undo 원자 트랜잭션
- 기기 GPU/메모리 벤치마크와 실제 렌더 비용
- 구매 증빙, 컷별 사용 위치, 버전 pin/update/rollback 전 과정
- 팀 컬렉션과 권한 공유

패스포트의 `ready`는 오직 “사용자가 선언한 조건과 현재 manifest 필드가 충돌하지 않는다”는 뜻이며, 설치 성공이나 법률상 적법성을 보증하지 않는다.

## 6. 검증 항목

- SemVer 및 최소 Studio 버전 비교
- 렌더러 선언 충돌
- 상업 이용과 CC BY-NC 차단
- attribution 필수 사용권과 크레딧 보존 흐름
- AI 포함 정책의 review/block 분리
- original/permissive provenance 정책
- builtin/portable 전달 정책
- malformed/prototype 기반 로컬 프로필의 fail-closed 파싱
- 저장소 예외 격리
- 카드·상세·전용 랩·내비게이션 렌더링과 로컬 필터
