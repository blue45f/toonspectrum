# Admin Web 도메인

관리자 기능은 `domain -> capability -> local UI/model/API/test` 순서로 구성한다. 현재 첫 capability는
`operations/operation-policy`다. 이후 기능도 `members`, `trust-safety`, `monetization`, `analytics`,
`engagement`, `growth`, `operations`, `security`처럼 명시적 책임 아래에 둔다.

component, hook, model, test는 해당 capability 옆에 둔다. 다른 domain 접근은 `public` 또는
`integrations` 경계를 사용하며 다른 domain page 내부를 deep import하지 않는다.
`packages/domains/*`를 만들지 않는다.
