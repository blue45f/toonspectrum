# Admin domains

Keep administrator code logically grouped inside this app: `domain -> capability -> local feature files`.

Do not create `packages/domains/*` pre-emptively. Promote only stable, non-UI business code after a real second consumer appears. Cross-domain dependencies should target an explicit public/integration boundary rather than another domain's internal files.
