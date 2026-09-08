# Studio 애플리케이션 설정 벤치마크 및 구현 기록

- 기준일: 2026-09-09
- 대상: `/studio` 애플리케이션 설정
- 원칙: 경쟁 제품의 정보 구조와 작업 흐름은 참고하되 상표·문구·시각 자산은 복제하지 않는다.
- 품질 기준: 실제 런타임에 연결되지 않는 장식성 토글을 만들지 않고 기존 SQLite/OPFS 설정 권위와 즉시 적용 경로를 사용한다.

## 비교 제품과 적용 패턴

| 제품 | 공식 자료 | 확인한 패턴 | 반영 내용 |
| --- | --- | --- | --- |
| Clip Studio Paint | <https://help.clip-studio.com/en-us/manual_en/720_preferences/Preferences.htm> | 왼쪽 카테고리 탐색, 커서·터치·정밀도·UI·개인정보를 한 설정 허브에서 관리 | 설정 홈, 기존 7개 카테고리, 전역 검색, 환경 진단 |
| Clip Studio Paint | <https://support.clip-studio.com/en-us/faq/articles/20200052> | 터치 조작에 맞춘 큰 UI와 장치별 입력 최적화 | coarse pointer 44px 타깃, 터치 우선·펜 디스플레이 프로필 |
| Clip Studio Paint | <https://help.clip-studio.com/en-us/manual_en/720_preferences/Modifier_Key_Settings.htm> | 보조키와 입력 장치 동작 사용자화 | 기존 단축키 녹화·충돌 탐지, 마우스 버튼·휠 설정 보존 |
| Adobe Photoshop | <https://helpx.adobe.com/photoshop/kb/optimize-photoshop-cc-performance.html> | 작업 환경에 맞춘 성능 설정과 변경 효과 안내 | 프로필의 대상·변경 범위 설명, 브라우저 capability 진단 |
| Adobe Photoshop | <https://helpx.adobe.com/photoshop/using/preferences.html> | 환경 설정 초기화 전 백업 권장, 범주별 복구 | 전체 초기화 외 탭별 초기화, 버전형 JSON 백업·복원 |
| Krita | <https://docs.krita.org/en/reference_manual/preferences.html> | 입력·디스플레이·성능·태블릿을 분리한 전문 설정 구조 | 일반·마우스·터치·그리드·필압/접근성 분리 유지 |
| Procreate | <https://help.procreate.com/procreate/handbook/interface-gestures/gesture-controls> | 제스처 역할과 터치/펜 동작 구성 | 한·두·세 손가락 동작, 손바닥 차단, 길게 누르기 설정 유지 |
| Procreate | <https://help.procreate.com/procreate/handbook/actions/actions-prefs> | 압력·제스처 등 창작자별 작업 환경 맞춤 | 펜 디스플레이·터치 우선·집중 접근성 프로필 |

## 기존 구현 진단

기존 구현의 강점은 다음과 같다.

- 설정 값이 UI 전용 상태가 아니라 Studio 입력·그리드·도구막대·단축키 런타임에 연결된다.
- SQLite/OPFS 영속화와 세션 한정 실패 상태를 구분한다.
- 모바일 하단 시트와 데스크톱 중앙 모달이 같은 접근성 대화상자 계약을 사용한다.
- 단축키 충돌 탐지, 터치 길게 누르기, 도구막대 표시/순서 편집을 제공한다.

개선이 필요한 지점은 다음과 같았다.

1. 원하는 설정의 위치를 알아야 접근할 수 있었다.
2. 장치가 바뀔 때 여러 탭을 순회해 수동 조정해야 했다.
3. 전체 초기화만 강조되어 부분 복구 비용이 컸다.
4. 설정을 다른 브라우저·기기로 이동하는 공식 경로가 없었다.
5. 현재 값이 기본값과 얼마나 다른지 파악하기 어려웠다.
6. 브라우저의 입력·저장 capability를 설정 화면에서 확인하기 어려웠다.

## 구현 범위

### 검색 가능한 설정 제어 센터

- 제목·설명·한국어/영문 별칭을 포함한 allowlisted 검색 인덱스
- 검색 결과 선택 시 기존 카테고리 편집기로 이동
- 결과 없음 상태와 입력 길이 제한
- 기존 7개 설정 탭과 저장 데이터 호환성 유지

### 작업 환경 프로필

다음 다섯 개 프로필을 제공한다.

- 균형형
- 펜 디스플레이
- 터치 우선
- 마우스·키보드
- 집중·접근성

프로필은 화면 밀도, 도구 설명, 커서, 선 보정 안내선, 마우스·터치, 정렬 가이드, 필압, 움직임 감소처럼 기존에 실제 적용되는 필드만 변경한다. 사용자가 만든 단축키와 도구막대 배치는 보존한다.

### 변경 가시성과 부분 복구

- 기본값과 다른 leaf 설정 수 표시
- 카테고리별 변경 수 표시
- 각 카테고리만 추천 기본값으로 되돌리는 동작
- 기존 전체 초기화와 파괴적 동작 확인 흐름 유지

### 설정 이동·복구

- `toonspectrum.studio-app-settings` kind와 명시적 version을 가진 JSON 포맷
- export 시 기존 정규화기를 통과한 설정만 기록
- import 최대 128KB
- JSON, kind, version, payload shape 검증
- 이전 plain-object 설정 파일 정규화 마이그레이션
- 알 수 없는 루트/필드는 기존 allowlist 정규화 과정에서 제거
- 프로젝트 데이터, 인증 정보, AI provider secret은 포함하지 않음

### 장치·브라우저 진단

권한을 요청하거나 브라우저 이름을 추정하지 않고 capability만 표시한다.

- 터치 포인트 수
- Pointer Events 지원
- coarse pointer 여부
- 운영체제 reduced-motion 요청
- File System Access 지원
- persistent storage API 지원

### 접근성·반응형

- 공용 modal-sheet의 배경 격리, 포커스 순환, Escape, 트리거 복귀 계약 유지
- 모바일/거친 포인터의 핵심 조작 44px 이상 유지
- 키보드 탐색 가능한 검색 결과와 카테고리 진입
- 상태·오류에 `status`/`alert` 역할 부여
- 설정 저장 중·저장 완료·세션 한정 상태 유지

## 의도적으로 제외한 항목

실제 런타임 권위가 없는 상태에서 UI 토글만 추가하면 제품 신뢰를 낮추므로 다음 항목은 제외했다.

- GPU 메모리 비율이나 타일 캐시 크기를 흉내 낸 가짜 성능 설정
- 서버 동기화가 없는 계정 설정 동기화 토글
- 자동저장 스케줄러와 연결되지 않은 자동저장 주기 토글
- 설정 화면 진입만으로 브라우저 권한을 선제 요청하는 동작

이 항목은 해당 엔진·저장·계정 런타임이 명시적 authority와 실패 UI를 제공할 때 별도 기능으로 도입한다.

## 검증 항목

- 설정 홈 렌더링·접근성·모바일 터치 타깃·지연 로딩 계약
- 기존 전용 진입점이 안정화된 카테고리 편집기로 직행하는지 검증
- 프로필의 단축키·도구막대 보존
- 탭별 초기화 격리
- 한국어·영문 검색
- 변경량 계산
- 버전형/legacy JSON 왕복, 미래 버전·손상 JSON·과대 파일 거부
- capability 진단의 결정적 입력
