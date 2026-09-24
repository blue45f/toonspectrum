# ToonStudio 결과물 중심 프로젝트 형식

- 상태: 구현됨
- 날짜: 2026-09-24
- 대상: `/studio/new`, 프로젝트 라이브러리, 로컬 편집기, `.toonstudio` 패키지

## 문제

기존 `StudioProjectKind`는 다음 세 개의 서로 다른 개념을 한 목록에 섞었다.

1. 최종 결과물: 웹툰, 일러스트, 애니메이션
2. 제작 단계·전문 도구: 스토리보드, 이미지 편집, 3D
3. 파생 산출물: 표지·홍보 디자인, 발표 자료

이 구조에서는 사용자가 웹툰과 스토리보드 중 무엇을 골라야 하는지, 웹툰 프로젝트 안에서 3D·홍보·모션 작업을 어떻게 이어야 하는지 알기 어려웠다.

## 결정

프로젝트는 독자·시청자가 받게 될 **최종 결과물 형식**으로 생성한다. 전문 도구는 프로젝트에 연결되는 **작업실**로 다룬다.

### 최상위 결과물

| ID | 표시 이름 | 기본 프로젝트 종류 | 핵심 단위 |
|---|---|---|---|
| `vertical-webtoon` | 세로 연재 웹툰 | `webtoon` | 작품 → 시즌 → 회차 → 장면 → 컷 |
| `cuttoon` | 컷툰·SNS 만화 | `webtoon` | 시리즈 → 게시물 → 카드 |
| `page-comic` | 페이지 만화 | `webtoon` | 작품 → 챕터 → 스프레드 → 페이지 → 컷 |
| `motion-toon` | 모션툰·세로 영상 | `animation` | 작품 → 에피소드 → 장면 → 샷 → 시간 |
| `illustration` | 일러스트·키비주얼 | `illustration` | 작품 → 아트보드 → 레이어 |

### 보조 작업실

다음 항목은 최상위 결과물이 아니라 단독 실행도 가능한 전문 작업실이다.

- 스토리보드
- 이미지 편집
- 3D 장면
- 표지·홍보 디자인
- 발표 자료

기존 딥링크는 유지한다. 예를 들어 `/studio/new?kind=slides&template=slides-pitch`는 발표 자료 단독 작업실로 열린다.

## 데이터 모델

`StudioProjectKind`는 기존 문서 런타임과 호환하기 위해 유지한다. 새 의미는 `StudioProjectDefinition`에 분리한다.

```ts
interface StudioProjectDefinition {
  schemaVersion: 1;
  format: StudioProjectFormat;
  purpose: "serial" | "portfolio" | "brand" | "client-work";
  startPoint: "idea" | "script" | "storyboard" | "files";
  collaboration: "solo" | "team" | "client";
  primaryWorkspace: StudioWorkspaceMode;
  enabledWorkspaces: readonly StudioWorkspaceMode[];
  deliveryProfileIds: readonly string[];
}
```

프로젝트 라이브러리 엔트리에 `definition`을 저장한다. 기존 프로젝트에는 `kind`와 `templateId`로 호환 정의를 계산한다.

- `webtoon-four-cut` → `cuttoon`
- `webtoon-page` → `page-comic`
- 일반 웹툰 → `vertical-webtoon`
- 애니메이션 → `motion-toon`
- 일러스트 → `illustration`

프로젝트를 다시 저장하거나 복제하면 계산된 정의도 함께 유지된다.

## 생성 플로우

`/studio/new`는 다음 네 단계로 구성한다.

1. 완성할 콘텐츠
2. 현재 가진 재료
3. 프로젝트 세부 설정
4. 준비되는 프로젝트 확인

모바일에서도 종류 이름만 보이는 `<select>`로 축약하지 않는다. 결과물의 실루엣, 작품 구조, 제작 흐름, 검사 항목과 출력 형식을 카드와 미리보기로 유지한다.

## 형식별 초기 문서

| 형식 | 초기 문서 |
|---|---|
| 세로 연재 웹툰 | 긴 원고 1개 |
| 컷툰·SNS 만화 | 선택한 4·8·10개의 카드 페이지 |
| 페이지 만화 | 선택한 8·24개의 페이지 |
| 모션툰·세로 영상 | 타임라인 문서 1개 |
| 일러스트·키비주얼 | 아트보드 1개 |

컷툰과 페이지 만화의 `pageCount`는 프로젝트 메타데이터뿐 아니라 실제 로컬 편집기 초기 페이지 배열에도 반영한다. 카드에는 카드 프레임을, 페이지 만화에는 출판 여백 프레임을 시드한다.

## 런타임 차별화

편집기 모드 패널은 프로젝트 정의가 있으면 다음 정보를 우선 표시한다.

- 결과물 형식 이름과 설명
- 연결된 작업실
- 현재 문서에서 전환 가능한 작업공간
- 형식별 내보내기 프로필
- 해당 프로젝트에서 허용된 이어 만들기 경로

프로젝트 라이브러리와 Creator 로비도 기존 `웹툰` 같은 넓은 종류 대신 `세로 연재 웹툰`, `컷툰·SNS 만화`, `페이지 만화`처럼 실제 형식명을 표시한다. 작업 미리보기가 아직 없으면 형식별 실루엣을 대신 보여 준다.

## 저장·이식성

`.toonstudio` 패키지의 `project/project.json`에 프로젝트 정의가 포함된다. 가져오기 시에도 정의를 새 프로젝트로 복원한다. 형식 정의가 없거나 손상된 예전 패키지는 기존 `kind`와 `templateId`로 호환 정의를 계산한다.

## 검증 범위

- 결과물 5종 생성 UI와 딥링크 호환
- 형식별 프로젝트 정의 저장
- 컷툰 4·8·10장 초기 페이지
- 페이지 만화 8·24페이지 초기 페이지
- 모션툰 타임라인 모드
- 브라우저 자동 저장
- 웹툰 제작 온보딩 유지
- 단독 발표 자료 등 보조 작업실 유지
- 프로젝트 패키지 내보내기·가져오기 정의 보존
- 프로젝트 라이브러리 형식명·빈 미리보기 표시
