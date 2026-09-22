# 창작물 검토 서비스의 후속 벤치마크

상태: **current 공식 문서 조사 / target 후속 수락 조건**. 2026-09-20에 아래 공식 도움말을 열람했다. 비교 기준은 THIRD `e210784e4`의 source와 [30개 요구 완료 원장](virtual-studio-design-closure-ledger-20260920.md)이다. 현재 별도 작업트리의 비공개 대화·작업 완료 근거·실제 저장소 검증은 진행 중이며 이 조사로 완료 판정을 올리지 않는다. 실제 서비스 가입·체험이나 성능 측정은 하지 않았다.

공간 서비스에 관한 [기존 벤치마크](virtual-studio-benchmark-20260920.md)에 창작물 검토 접점을 보충한다. 비교 제품의 기능·권한을 그대로 가져오는 것이 아니라, 원설계의 세 경로에서 사용자가 다음 행동과 결과를 확인할 수 있는지를 살핀다.

| 공식 문서에서 확인한 동작 | ToonStudio 적용 판단과 연결 요구 |
| --- | --- |
| [Frame.io V4 Shares](https://help.frame.io/en/articles/9105232-shares-in-frame-io)는 선택한 미디어의 외부 링크에 만료·암호·댓글·다운로드·버전 표시 설정을 제공한다. 링크 활동 기록에는 열기, 미디어 보기, 댓글, 다운로드가 별도 행동으로 나타난다. | **VS-13/08/27 target.** 외부 검토 링크의 고정 제출본과 댓글·다운로드 허용 범위를 각각 표시한다. 링크 열람을 인수나 승인으로 바꾸지 않는다. 내부 작업실 전체 권한이나 현재 원고의 자동 노출을 추가하지 않는다. |
| SyncSketch는 [Presentation Mode](https://support.syncsketch.com/hc/en-us/articles/32393876830100-Presentation-Mode)와 [Leave Sync / Join Sync](https://support.syncsketch.com/hc/en-us/articles/32393989404564-How-do-real-time-Reviews-Work)를 설명한다. 일반 동기화에서는 [확대·이동도 다른 참가자에게 반영](https://support.syncsketch.com/hc/en-us/articles/32393764950164-Can-other-people-see-what-I-m-zooming-in-on)되므로 개인 탐색에는 동기화 해제가 필요하다. | **VS-01/02 target.** 고정 입력본을 먼저 확인한 뒤 참가자가 명시적으로 진행자를 따라본다. 개인 탐색·해제·재참여가 즉시 가능해야 한다. 같은 검수본을 보고 있다는 표시와 따라보기 상태를 분리하며 문서 편집·마이크 권한은 늘리지 않는다. |
| SyncSketch는 [검토 항목의 특정 프레임·시점과 의견으로 돌아가는 링크](https://support.syncsketch.com/hc/en-us/articles/32394111936788-What-are-Workspaces-Projects-and-Reviews)를 제공한다. | **VS-03/04/06 target.** page/cut/object/point/region의 현재 source mapping을 사용해 정확한 원 의견과 수정본으로 돌아간다. 콘티 순서·대사와 3D 시점은 각 도메인의 고정 참조를 추가로 요구하며 임의의 화면 좌표만 저장하지 않는다. |
| SyncSketch는 [세션에서 내보내기와 접근권 회수](https://support.syncsketch.com/hc/en-us/articles/32393771409684-Disconnecting-Users-From-Reviews)를 구분한다. 내보내기만으로 재입장을 차단하지는 않는다고 명시한다. | **VS-12/13/26 target.** 현재 대화 종료와 이 방문의 차단, 검토 링크 회수, 작품 권한 회수를 서로 다른 결과로 보여 준다. 현재 서버 권한을 다시 검사하고 늦은 응답이 로컬 철회를 되돌리지 못해야 한다. |
| SyncSketch의 [3D 모델 검토](https://support.syncsketch.com/hc/en-us/articles/32393818685588-Reviewing-3D-Models-and-Animations)는 동기화된 시점과 그 시점의 주석으로 복귀하는 기능을 설명한다. | **VS-21 target.** 기존 scene/camera/shot 참조를 사용하고 선택된 출력 컷의 검수본과 연결한다. 단순 3D 도구 이동 링크를 완료로 세지 않는다. 이탈·권한 회수 때 해당 검토 runtime을 해제하는 실제 수명 검증이 필요하다. |

Frame.io Legacy 문서의 승인 상태나 다운로드 동작을 V4 기능으로 합쳐 설명하지 않는다.

후속 구현에는 다음 세 흐름의 증거가 필요하다.

1. **같은 컷 검토→수정→재검토.** 저장된 원 의견의 정확한 대상과 최신 수정 캡처를 사용자가 열어 보고, 실제 기준 확인 후 작업 완료를 기록한다. 과거 완료 근거는 보존한다. 기준을 바꿨다가 되돌려도 예전 확인을 되살리지 않으며, 무관한 제목 편집은 재확인을 요구하지 않는다.
2. **산출물 제출→인수인계→다른 시간의 후속 작업.** 송신자와 다른 실제 수신자가 고정 입력·산출물·미해결 사항·사용 조건을 읽고 인수를 명시한다. 발송·열람·인수·완료를 각각 서버 결과로 복구한다. 화면 열기와 작성자가 선택한 `accepted` 문자열은 수신자의 인수 증거가 아니다.
3. **팀 템플릿→도구 배치→권한 있는 공동 세션.** 초안 미리보기·명시 게시·정확한 게시본 채택을 거친다. 세션에 고정 입력·참가자·목적을 저장하고, 따라보기와 대화는 각자의 별도 동의를 사용한다. 장치 프롬프트가 열린 동안 철회·이탈·계정 변경이 일어나면 늦은 승인이 재연결하지 못해야 한다.

비교 제품의 유료 등급은 기능 비용을 추정하거나 ToonStudio 기능을 축소하는 근거로 사용하지 않는다. 이 문서는 외부 초대 발송, 운영 링크 공개, 서비스 가입, 유료 인프라, DB 마이그레이션 실행 또는 배포를 승인하지 않는다.
