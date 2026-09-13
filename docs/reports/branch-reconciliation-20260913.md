# Remaining branch reconciliation — 2026-09-13

This integration preserves the public-site changes from PR #1349 at 52fe8ba49858a0b095f83e8ce5ae1fd67f3f6fc8 and PR #1357 at b2196debf400f113ffa087105a412c1aff82205e. Its base includes main's legal recovery and PR #1363 local manuscript recovery. Both independently authored search test suites remain present. Public history restoration has one lifecycle owner; Studio ownership, background retention, appearance preferences, current-step navigation, keyboard focus and recovery safeguards remain intact.

The following temporary branches contained only one-shot audit/verification/staging workflows, not an independent product delta. Their exact commits are retained as ancestors for auditability, while obsolete operational workflows are intentionally excluded from the resulting product tree:

| Branch | Preserved head | Purpose |
| --- | --- | --- |
| fix/recovery-bundle-analysis-20260913 | 8451c7f49995249ad2b4b265b8795350cc0f78a9 | One-shot bundle analysis and candidate staging |
| ops/merge-all-audit-20260913 | 5adea167756bd07bc08abd75b83f27ed04eb924c | Remaining-branch and asset/product merge evidence |
| ops/toonstudio-db-recovery-inspect-20260913 | bcc3a01abda7d54a5ca12b1cebc85d1a405b5957 | One-shot recovery inspection and fixture validation |
| qa/character-production-20260913 | 6dd0dcf54ed5bcb507fba30022ffa5c296f2a027 | Production character verification |
| verification/production-3d-pr1348-20260913 | 0ddff15fd1086d97cde5c2233823d903273ccb08 | Production 3D evidence verification |
| ops/merge-final-check-20260913 | 959a128e4b6ebe30088518ee02080f694e0fb417 | Exact snapshot, overlap resolution, quarantine and obsolete-run checks |

Closed PR #1362 at 3e88027e9b074d3bb2599c4048a731388fd83d21 is also retained as historical ancestry, not reapplied as product code. Its owner closed it as superseded by PR #1361. The current fixed TermsDesk origin, bounded streaming parser, publication-hash validation, labeled original fallback copies and success/failure cache remain authoritative. No competing legal corpus, resolver, production credential, database mutation or alternate deployment is introduced here.

These records describe source reconciliation, not completed CI or production acceptance. A normal merge must wait for the exact integration head's required checks and relevant feature/browser suites. Source refs may be removed only after their recorded heads are reachable from main and still match the audited ref; newly advanced or independently active branches must be retained. Native-device, paid inference, GPU parity and present local worktree cleanup are not claimed.
