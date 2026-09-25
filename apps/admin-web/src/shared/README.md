# Admin Web shared

Reusable Admin-only UI primitives and pure helpers belong here when more than one Admin
domain actually consumes them. Shared code must not import `src/domains` or `src/app`.

Code needed by Web and Admin is not copied here and must not be imported from `apps/web`;
promote only the narrow runtime-neutral contract or primitive to a focused package.
