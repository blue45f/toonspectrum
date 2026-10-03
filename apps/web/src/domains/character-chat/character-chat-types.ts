/**
 * 캐릭터 토크(캐릭터 챗) 도메인 타입.
 *
 * 작가가 승인한 캐논(성격·말투·세계관·금지 주제) 위에서 팬이 작품 속 캐릭터와
 * 대화하는 파일럿 기능의 데이터 계약이다. 여기서 "승인"은 작가가 이 프로필을
 * 저장한 행위 자체를 뜻한다 — 저장되지 않은 설정은 챗 근거로 쓰지 않는다.
 *
 * 채팅 엔진(LLM)은 이 도메인 밖에 있다. 이 모듈은 계약만 정의하고 어떤
 * 제공자도 알지 않는다 (어댑터는 `character-chat-engine.ts`).
 */

/** 팬(사용자)과 캐릭터가 주고받는 대화 한 턴. */
export type CharacterChatRole = "fan" | "character";

/** 캐릭터 챗 프로필 한 건 — 작가 승인 캐논 스냅샷. */
export interface CharacterChatProfile {
  readonly id: string;
  /** 공개 표시용 캐릭터 이름. */
  readonly characterName: string;
  /** 캐릭터가 등장하는 작품 이름. */
  readonly workTitle: string;
  /** 작품 상세 URL 연결용 슬러그. 작품 페이지 진입 파라미터와 매칭한다. */
  readonly workSlug: string | null;
  /** 승인 출처를 밝히는 작가 표시 이름. */
  readonly authorName: string;
  /** 캐릭터 목록에 보여줄 한 줄 소개. */
  readonly description: string;
  /** 성격 — 예: "겉은 차갑지만 약자를 보면 못 지나친다". */
  readonly personality: string;
  /** 말투 — 예: "짧은 존댓말, 가끔 옛날식 말투가 섞인다". */
  readonly speechStyle: string;
  /** 세계관·배경·관계 등 대화의 근거가 되는 설정. */
  readonly worldview: string;
  /** 대화를 열 때 캐릭터가 먼저 건네는 인사. 비어 있으면 기본 인사 문구를 쓴다. */
  readonly greeting: string;
  /** 작가가 대화를 금지한 주제 — 입력/응답 양쪽에서 필터링한다. */
  readonly forbiddenTopics: readonly string[];
  /** 캐릭터가 처음 나왔을 때 팬이 알아보도록 하는 외모 단서(선택). */
  readonly appearanceHint: string;
  /** 캐릭터 이미지 URL — http(s) 또는 사이트 내 경로만 허용한다. */
  readonly avatarUrl: string | null;
  /** 스튜디오 캐릭터 캐논 시트와 연결할 때의 시트 ID (메타데이터만, 내용 복사 아님). */
  readonly canonSheetId: string | null;
  /** 챗 공개 여부 — 작가 opt-in. false면 팬 목록에 나오지 않는다. */
  readonly chatEnabled: boolean;
  /** 파일럿 데모용 시드 프로필 표시. */
  readonly isDemo: boolean;
  /**
   * 이 프로필을 만든 계정 ID. null이면 게스트 작성 또는 소유자 개념 도입 전의
   * 레거시(미귀속). 소유자가 있는 프로필은 그 계정만 수정·삭제·공개 토글할 수
   * 있다 — 같은 브라우저의 다른 계정에게 남의 프로필이 관리 화면에 뜨고
   * 서버 미러까지 남의 세션으로 다시 쓰이던 혼선을 막기 위해서다.
   */
  readonly ownerId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 프로필 편집 폼이 다루는 초안 — 저장 전 정규화 대상. */
export interface CharacterChatProfileDraft {
  readonly characterName: string;
  readonly workTitle: string;
  readonly workSlug: string;
  readonly authorName: string;
  readonly description: string;
  readonly personality: string;
  readonly speechStyle: string;
  readonly worldview: string;
  readonly greeting: string;
  readonly forbiddenTopics: readonly string[];
  readonly appearanceHint: string;
  readonly avatarUrl: string;
  readonly canonSheetId: string;
  readonly chatEnabled: boolean;
}

/** 대화 메시지 한 건. */
export interface CharacterChatMessage {
  readonly id: string;
  readonly role: CharacterChatRole;
  readonly text: string;
  readonly createdAt: string;
}

/** 한 캐릭터와의 대화 세션 — 브라우저에 그대로 남는다. */
export interface CharacterChatSession {
  readonly id: string;
  readonly profileId: string;
  /**
   * 대화를 나눈 팬의 계정 ID. null이면 게스트 또는 레거시(미귀속).
   * 대화 전문은 개인 기록이라 다른 계정이 이어 읽거나 이어 쓰면 안 된다.
   */
  readonly ownerId?: string | null;
  readonly messages: readonly CharacterChatMessage[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 작가 리포트용 활동 요약 — 무엇이 오갔는지가 아니라 얼마나·언제뿐이다(내용 미포함). */
export interface CharacterChatActivitySummary {
  readonly profileId: string;
  /** 이 캐릭터로 시작된 대화 수. */
  readonly sessionCount: number;
  /** 팬이 보낸 메시지 총수. */
  readonly fanMessageCount: number;
  /** 캐릭터가 답한 메시지 총수. */
  readonly characterMessageCount: number;
  /** 금지 주제 입력을 막은 횟수. */
  readonly blockedCount: number;
  /** 마지막 대화 시각(ISO). 대화가 없으면 null. */
  readonly lastActiveAt: string | null;
}
