# Archived database migrations

This directory preserves superseded SQL files that must not participate in the
production numbered migration sequence.

- `0063_studio_project_graph_v3.superseded.sql` is an earlier ProjectGraph v3
  draft. The production sequence uses
  `migrations/0064_studio_project_graph_v3.sql`, whose review-comment anchor
  contract matches the current runtime model.

Keeping the superseded SQL here preserves the work and review history while
preventing duplicate migration sequence numbers from making the production
manifest ambiguous.
