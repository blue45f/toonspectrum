# Creator adaptive workspace

## Decision

ToonSpectrum must not treat Student, Amateur, and Professional as mutually exclusive account tiers.
Personalization is modeled as three independent axes:

1. **Account context** — Individual, Education, Team/Studio.
2. **Creation experience** — Beginner, Experienced, Professional.
3. **Usage goals** — learning, first project, personal work, serialization, team production, education, outsourcing, and related intents.

A separate **workspace mode** controls presentation density: Guided, Creator, or Production.
Workspace mode changes navigation priority and guidance, never project authorization or tool ownership.

## Product principles

- No creator loses a professional tool because they selected Beginner or Education.
- A professional may use Guided mode, and a student may use Production mode.
- Account context is not a billing plan and must not grant project permissions.
- Project-specific roles and permissions remain authoritative over global personalization.
- Every recommendation is reversible in settings.
- Defaults should reduce cognitive load without creating a second, limited editor.
## Data model

Global creator workspace preference adds:

- `accountContext: "individual" | "education" | "studio"`
- existing `workspaceMode: "guided" | "creator" | "production"`
- existing multi-value `usageGoals`

Creator profile continues to own `experienceLevel: "beginner" | "experienced" | "professional"`.

The legacy `creatorStage` field remains readable for compatibility, but new adaptive onboarding no longer writes it.
Legacy values are mapped only when an unfinished onboarding needs an initial value:

- student / educator -> Education context
- studio -> Studio context
- other legacy stages -> Individual context
- student / hobbyist -> Beginner
- aspiring -> Experienced
- professional / studio / educator -> Professional

Existing completed users are not forced through onboarding again.

## Recommendation rules

Workspace recommendations are deliberately small and explainable:

- Studio context, studio-management goal, or team-production goal -> Production.
- Professional + serialization or outsourcing -> Production.
- Beginner + Education, learning, first-project, or drawing-practice -> Guided.
- Otherwise -> Creator.

The recommendation is applied until the user manually chooses a mode. A manual selection always wins.
## UX flow

### Adaptive onboarding

Step 1: account context + creation experience.
Step 2: one or more creator roles and a primary role.
Step 3: one or more usage goals.
Step 4: workspace mode with a Recommended badge.
Step 5: preview showing context, experience, role, and mode independently.

The copy explicitly states that selections tune guidance and information density without changing tool access.

### Personalization center

The global workspace settings expose Account context, Workspace mode, and Usage goals together.
The current recommendation is visible next to the mode selector so users can understand the system without losing control.

### Studio role workspace

The workspace header shows separate chips for role, account context, experience, and UI mode.
Education context prioritizes learning/practice entry points.
Studio context prioritizes Production workflows for assignment, deadline, review, and handoff status.
Individual Guided mode keeps a lightweight learning helper.

## Authorization and billing boundary

Do not use `accountContext`, `experienceLevel`, or `workspaceMode` as authorization checks.
Authorization must continue to use project/team membership and role permission systems.
Paid-plan eligibility must be modeled separately from these adaptive fields.
Education verification, discounts, storage quotas, and Studio billing can consume the context as a hint but require their own entitlement state.
## Persistence and migration

The creator workspace document stays version 1 for this additive change.
`accountContext` has a schema default of `individual`, so historical documents remain parseable.
The DB JSON constraint accepts the additive field, so no blocking migration is required.

A future workspace document version should only be introduced when a semantic migration cannot be represented by safe defaults.

## Analytics contract for follow-up

Recommended events:

- `creator_onboarding_context_selected`
- `creator_onboarding_experience_selected`
- `creator_workspace_mode_recommended`
- `creator_workspace_mode_overridden`
- `creator_workspace_mode_changed`
- `creator_context_changed`
- `creator_context_assist_opened`

Never attach private project content to these events. Measure funnel completion, override rate, time-to-first-project,
and task completion by mode to decide whether recommendations help.

## Rollout

1. Ship additive schema + normalization first.
2. Enable adaptive onboarding for incomplete/new profiles.
3. Expose the same controls in personalization settings.
4. Surface context-aware entry points in Studio.
5. Add analytics and evaluate recommendation override rates.
6. Only after evidence, consider separate Education verification or Studio billing/entitlement products.

## Non-goals

- Creating three separate editors.
- Locking advanced tools behind experience labels.
- Automatically converting Education or Studio context into a paid plan.
- Inferring professional status from revenue, age, school, or team membership.
- Replacing project roles, permissions, or collaboration access control.
