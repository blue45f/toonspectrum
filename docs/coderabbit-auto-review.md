# CodeRabbit 자동 리뷰 설정

작성 2026-08-30 · 근거: PR #65 에서 CodeRabbit 이 리뷰를 두 번 건너뛴 실측

## 무엇이 막혀 있었나

PR #65 에서 CodeRabbit 은 **서로 다른 이유로 두 번** 리뷰를 건너뛰었다.

| 시점 | 봇이 남긴 이유 | 이 레포에서 고칠 수 있나 |
| --- | --- | --- |
| draft 상태 | "Draft PRs are not automatically reviewed by default." | **가능** — `.coderabbit.yaml` 로 해결 |
| ready 전환 후 | "This repository does not receive automatic reviews because it has fewer than 10 stars." | **불가능** — CodeRabbit 계정/티어 쪽 |

두 번째 메시지가 나올 때 봇이 같이 출력한 실행 설정은 다음과 같았다:

```
Configuration used: defaults
Review profile: CHILL
Plan: Pro Plus
```

## 1번은 해결했다 — `.coderabbit.yaml`

`reviews.auto_review.drafts` 의 스키마 기본값은 `false` 다(공식 스키마 실측). 이
레포의 에이전트 워크플로는 PR 을 draft 로 열고 CI 가 초록이 된 뒤에야 ready 로
바꾸므로, 기본값 그대로면 리뷰가 **가장 늦은 시점** — diff 를 고치는 비용이 가장 클 때
— 에야 시작된다. 실제로 #65 에서는 ready 전환이 띄운 Codex 리뷰가 끝나기 40초 전에
머지가 먼저 들어갔다.

그래서 `drafts: true` 로 뒤집었다. 리뷰 피드백이 아직 고치기 싼 지점으로 옮겨간다.

설정 파일은 공식 JSON 스키마(`https://storage.googleapis.com/coderabbit_public_assets/schema.v2.json`,
draft 2020-12)로 검증했다.

## 2번은 이 레포에서 해결할 수 없다

"fewer than 10 stars" 는 `.coderabbit.yaml` 의 어떤 키로도 바꿀 수 없다. 스키마에
star 임계값과 관련된 키 자체가 없다. 참고로 `enable_free_tier` 는 이 레버가 아니다 —
설명이 "Enable free tier features for users **not on a paid plan**" 이라 유료 플랜
사용자에게는 해당하지 않는다.

**주의: 이 메시지는 CodeRabbit 의 공개 문서와 모순된다.** 공식 OSS 페이지는 자격 조건을
이렇게 못박는다:

> "The repo is public. That's the whole bar CodeRabbit uses."
> "There's no application or approval queue: every public repository gets
> CodeRabbit Review free the moment you install it."

즉 문서상으로는 star 요건이 없다. `blue45f/toonspectrum` 은 public 이므로 문서 기준으로는
자동 리뷰 대상이어야 한다. 봇의 실제 동작과 문서가 어긋나므로, 다음 중 하나다:

- 최근 정책 변경이 문서에 반영되지 않았다
- 이 레포가 Pro Plus 구독에 편입되지 않고 OSS 경로로 평가되고 있다
- 봇 메시지가 부정확하다

**해야 할 일:** CodeRabbit 지원(support@coderabbit.ai) 또는 대시보드에서 이 레포가
Pro Plus 구독에 포함돼 있는지 확인하고, public 레포에 star 게이트가 적용되는 것이
의도된 동작인지 문의한다. 위 공식 문서 인용을 그대로 근거로 쓰면 된다.

## 그 전까지 쓰는 수동 트리거

자동 리뷰가 돌지 않는 동안에도 리뷰 자체는 받을 수 있다. PR 에 댓글로:

```
@coderabbitai review
```

CodeRabbit 이 PR 에 남기는 안내 코멘트의 `🔍 Trigger review` 체크박스를 켜도 같다.

## 참고: Codex 는 별도 경로다

이 레포에는 `chatgpt-codex-connector` 도 붙어 있고, **draft → ready 전환 때 자동으로**
리뷰를 돌린다. 다만 Codex 는 check run 이나 commit status 를 만들지 않고 **PR 코멘트와
이모지 반응으로만** 보고하므로, `get_check_runs` / `get_status` 만 보면 리뷰가 진행
중인지 알 수 없다. 머지 전에는 PR 코멘트 목록도 함께 확인해야 한다.
