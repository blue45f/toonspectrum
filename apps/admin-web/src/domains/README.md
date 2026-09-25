# Admin Web domains

Administrator code is organized as `domain -> capability -> local UI/model/API files`.
The current first capability is `operations/operation-policy`. Future capabilities belong
under explicit responsibilities such as `members`, `trust-safety`, `monetization`,
`analytics`, `engagement`, `growth`, `operations`, and `security`.

Keep components, hooks, models and tests beside the capability that owns them. Cross-domain
access must use an explicit `public` or `integrations` boundary; do not import another
domain's page internals. Do not create `packages/domains/*`.
