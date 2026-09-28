# 2026-09-29 기술 세미나 진행 가이드

상태: current — 발표용 작업 브랜치의 기능과 검증 절차. 운영 배포 완료를 의미하지 않는다.

## 발표 시작

`/about/technology/deck?audience=seminar&duration=30`에서 시작한다. 15분은 12장, 30분은 25장, 45분은 30장이다. 분량 선택은 자동 재생 시간이 아니라 권장 범위이며 영상과 질문 시간을 포함해 리허설한다.

발표자 노트에는 슬라이드 요약과 별도로 설명 대본, 청중 질문, 데모에서 관찰할 결과와 실패 시 대안이 있다. 데모는 새 탭에서 열어 발표 위치를 유지한다. 청중 화면에는 노트를 노출하지 않는다.

| 구간 | 설명의 중심 | 자료 |
| --- | --- | --- |
| 창작자의 문제 | 한 컷의 기획·작업·검수 맥락이 왜 끊기는가 | 서비스 소개, 24초 브랜드 필름 |
| 드로잉 | 입력 샘플, 선의 형상, 재료 표현, 미리보기와 확정 | 제품투어 1:48, 브러시 구현 근거 |
| 브라우저 한계 | Worker와 WASM, 로컬 저장과 동기화, 오프라인 준비 | 저장·Worker·PWA 기술 스토리 |
| 3D | 장면 문서, 모델·카메라·조명·포즈, 2D 연결 | 제품투어 3:48, Three.js·VRM·Blender 자료 |
| AI와 협업 | 도구의 역할, 실행 경계, 권한, 사람의 결과 검수 | 제품투어 5:00, CRDT·로컬 추론·MCP 자료 |
| 검증과 재사용 | 실제 성공 기준, 실패 복구와 다른 제품에 적용할 원칙 | 코드·테스트 링크, 용어 사전, 공식 자료 |

## 발표 조작과 비상 경로

- 방향키·Page Up/Down·Space·Home·End로 이동한다. 버튼·입력·선택 요소를 조작할 때는 해당 컨트롤의 키보드 동작을 유지한다.
- 슬라이드 선택 메뉴로 중간에 이동하고 현재 슬라이드 링크를 복사할 수 있다. 기존 `#deck=seminar:9` 형태도 지원한다.
- 집중 화면은 일반 브라우저에서도 작동한다. 브라우저 전체 화면 API가 허용되지 않으면 집중 화면을 유지한다.
- 오프라인 발표본 버튼은 외부 폰트·영상·스크립트 요청이 없는 HTML을 만든다. 외부 서비스, 동영상, 새 AI 생성까지 오프라인으로 제공하는 것은 아니다.
- 네트워크 실패 시 읽을 수 있는 설명과 스토리보드로 전환한다. 로컬 편집의 오프라인 시연은 별도 샘플 문서·브러시·모델을 사전에 준비한 경우에만 진행한다.

## 영상 리허설

브랜드 필름은 무음 24초 소개이고, 제품투어는 내레이션·BGM을 포함한 별도 영상이다. 기술 영상 페이지의 검수용 렌더 파이프라인과 공개 재생 가능한 영상도 구분한다.

제품투어 딥링크 예시는 `/product-tour?t=228#product-tour-video`이며 호환 MP4는 `/product-tour?t=228&player=mp4#product-tour-video`이다. 링크를 열었다고 자동으로 소리를 내지 않으며 재생 버튼에서 시작한다.

운영 미디어의 Range 요청이 전체 200 응답으로 돌아오는 경우를 재현 대상으로 삼았다. 공개 브랜드 미디어를 처음 재생할 때 완전한 파일로 준비해 Blob URL로 연결한다. 파일 MIME, 빈 파일, 부분 응답, 용량과 타임아웃을 검사하고 교체·이탈 시 요청을 취소하고 URL을 해제한다. 초기 로딩과 메모리 사용이 늘어나는 대가가 있으므로 자동 미리 다운로드는 하지 않는다.

Remotion에서는 최초 요청 프레임을 마운트에 전달하고 오디오 준비 중 타임라인 진행을 막는다. 탐색 상태를 반영한 뒤 같은 사용자 입력에서 재생하며 이전 요청의 늦은 결과가 최신 위치를 덮지 않게 한다. MP4 전환 시 정지 상태를 보존하고, MP4의 합쳐진 음성·음악을 개별 믹싱으로 오해하지 않도록 안내한다.

필수 확인은 최초 3:48 시작, 1:48로 역방향 이동, 여러 챕터 연속 선택, 일시정지, 호환 전환, 브랜드 필름 닫기·다시 열기이다. 실제 오디오 시각과 장면 프레임을 확인하며 버튼 클릭 성공만으로 재생 성공을 판정하지 않는다.

## 구현과 검증 근거

- [발표 콘텐츠](../../apps/web/src/domains/legal/technology/engineering-seminar-curriculum.ts)
- [발표 상태와 기존 링크 처리](../../apps/web/src/domains/legal/technology/engineering-deck-state.ts)
- [오프라인 발표 출력](../../apps/web/src/domains/legal/technology/engineering-deck-export.ts)
- [공개 미디어 파일 준비](../../apps/web/src/domains/marketing/seekable-media-asset.ts)
- [브라우저 시나리오](../../e2e/engineering-seminar.spec.ts)

저장소 루트에서 다음 명령으로 검증한다. 운영 DB나 공급자 설정을 변경하지 않는다. 브라우저 시나리오의 API는 제한된 응답으로 대체하며 운영 인증·결제·외부 AI 성공을 검증하는 테스트가 아니다.

```sh
pnpm harness:verify
pnpm exec vitest run apps/web/src/domains/legal/technology apps/web/src/domains/marketing --maxWorkers=2
pnpm exec playwright test --config playwright.seminar.config.ts
```

## 공식 배경 자료

[Remotion 버퍼 상태](https://www.remotion.dev/docs/use-buffer-state), [Player API](https://www.remotion.dev/docs/player/player), [React의 외부 시스템 연동과 flushSync](https://react.dev/reference/react-dom/flushSync), [HTTP Range 요청](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests)을 참고한다. 발표 페이지에는 3D·드로잉·저장·AI·생성 도구·자산 사이트의 공식 자료 26개와 용어 설명이 추가로 연결되어 있다.

## 운영 반영

PR 병합과 운영 배포는 별도 단계다. 운영 반영 전에 최신 main과 통합하고 검사 결과, 승인된 SHA와 배포 정책을 확인한다. DB 연결·환경변수·마이그레이션·외부 AI 결제는 이 변경의 범위에 포함하지 않는다.
