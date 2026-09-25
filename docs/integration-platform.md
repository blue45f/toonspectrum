# External integration platform

Status: **implemented source; provider credentials, approval and production activation are separate gates**.

## Product surfaces

- `/settings/integrations` — provider catalogue, capability, configuration and approval state
- `/automation` — event/action recipes with provider selection and server validation
- `/publish` — channel-aware publication package plus RSS, JSON Feed and ActivityPub previews
- `/developers` — scopes, events, actions, webhook and MCP safety contract
- `/admin/integrations` — redirect to the administrator operations surface

The implementation deliberately lives in the new Web `integrations` domain and API
`integration-platform` module. It does not modify Studio drawing, 3D authoring, virtual
studio, publication accessibility/rights metadata, database migrations or release-gate
work owned by concurrent sessions.

## Provider coverage

The catalogue covers storage, project management, communication, design handoff,
meetings, localization, publication, provenance, trend data, asset discovery,
membership, payments, payouts, merchandise and developer APIs.

Existing source-backed capabilities are linked instead of duplicated, including Google
Workspace, personal cloud providers, Discord, ntfy, signed generic webhooks, Documenso,
Toss Payments, Openverse, Google Books and Poly Haven.

## Runtime states

Every provider resolves to one of four explicit states:

- `ready` — source capability is available and required configuration is present
- `manual` — a human-confirmed handoff can complete without provider credentials
- `configuration-required` — operator credentials or endpoints are missing
- `approval-required` — credentials alone do not replace provider review or audit

The catalogue returns environment variable **names and status only**. Secret values are
never serialized. Catalogue, recipe validation, package and feed endpoints require a
verified user session; runtime configuration state additionally requires the existing
administrator authorization boundary. A connected account must not be presented as
executable until its capability, deployment configuration and provider approval are all
satisfied.

## Automation contract

Recipes use a canonical trigger and one or more actions. The API validates that the
selected provider owns the capability required by each action, then separately reports
whether the provider is currently executable. Browser storage is only a recipe draft
store; it is not an execution queue or proof of delivery.

External writes must use an idempotency key, canonical request digest and result receipt.
Delivery outcomes distinguish `succeeded`, `failed` and `uncertain`; an uncertain result
must be reconciled before retrying an operation that may create a duplicate.

## Publication boundary

Official API channels can become directly executable only after OAuth/API configuration
and provider approval. Platforms without an approved creator API remain a validated
package flow: export files, copy metadata, open the provider console and store a human
confirmation receipt. ToonSpectrum does not accept third-party passwords or use a
headless browser to bypass upload controls.

The package builder records selected channel mode, configuration state, notices and a
SHA-256 digest. Feed generation is local product functionality and emits RSS 2.0, JSON
Feed 1.1 and ActivityStreams preview payloads without claiming that an ActivityPub
delivery worker is deployed.

## Activation checklist

1. Register only the providers needed by a deployment.
2. Store credentials in the deployment secret store, never Git or `VITE_` variables.
3. Complete provider review, redirect URI and privacy-policy requirements.
4. Verify least-privilege scopes and token revocation.
5. Exercise webhook signatures, replay windows, idempotency and uncertain-result recovery.
6. Run real-account quota, permission-revocation and long-running delivery tests.
7. Enable provider execution with an explicit operator decision.
8. Keep manual handoff available when the external provider is unavailable.

No production provider, database migration or deployment is activated by this source
change.
