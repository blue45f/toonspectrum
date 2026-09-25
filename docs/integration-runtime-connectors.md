# External integration runtime connectors

Status: source implementation complete; operator credentials, provider approval and real-account production receipts remain deployment gates.

This runtime is the execution layer underneath the existing integration catalogue and `/settings/integrations` page. It does not replace the catalogue, automation drafts, publishing package previews or developer manifest. It converts the non-overlapping providers below into explicit, project-authorized server operations.

## Implemented connectors

| Provider | Operation | Runtime behavior |
|---|---|---|
| Notion | `task.upsert` | Creates or updates a page in a data source explicitly shared with the integration. |
| Linear | `task.upsert` | Creates or updates an issue in a selected team. |
| Jira Cloud | `task.upsert` | Creates or updates a Jira Cloud issue with API-token Basic auth and ADF descriptions. |
| Trello | `task.upsert` | Creates or updates a card in a selected list. |
| Slack | `message.send` | Sends a bounded incoming-webhook message with link unfurling disabled. |
| Microsoft Teams | `message.send` | Sends a bounded Adaptive Card to an operator-configured workflow webhook. |
| Figma | `design.inspect` | Reads file or selected-node metadata and, when requested, returns temporary render URLs without downloading source assets. |
| Zoom | `meeting.create` | Obtains a server-to-server token and creates a scheduled review meeting; only the attendee join URL is retained. |
| Naver DataLab | `trends.read` | Reads dated search-interest ratios as an attributed external insight signal. |
| Wikidata | `trends.read` | Searches public entity metadata candidates. |
| Google Books | `trends.read` | Searches public book metadata candidates. |

Publishing, voice, music, 3D generation, publication-rights signing and creator messaging are intentionally not modified here because those areas are owned by active implementation sessions. This branch adds no competing plan, schema or placeholder for them.

## User surface

`/settings/integrations` now contains an execution workbench with:

1. project selection by production project ID;
2. server-reported connector readiness;
3. provider-specific editable JSON seeded from a safe example;
4. no-network dry-run planning;
5. explicit live-execution confirmation;
6. a stable mutation ID for safe retries;
7. normalized execution results;
8. actor-and-project-scoped durable receipt history.

The page never asks for an API key, password, OAuth refresh token or webhook URL. Those values are operator-only deployment secrets.

## HTTP API

All routes require the existing authenticated browser session.

```text
GET  /api/integrations/runtime-connectors
GET  /api/integrations/runtime-connectors/receipts?projectId=...&limit=30
POST /api/integrations/runtime-connectors/execute
```

Example dry run:

```json
{
  "projectId": "project-id",
  "mutationId": "11111111-1111-4111-8111-111111111111",
  "dryRun": true,
  "confirm": false,
  "request": {
    "providerId": "wikidata",
    "action": "trends.read",
    "input": {
      "query": "작품명",
      "language": "ko",
      "limit": 10
    }
  }
}
```

A live request must set `dryRun=false` and `confirm=true`. The server validates the exact provider/action/input contract again; the UI is not a trust boundary.

## Authorization

- Connector catalogue status requires an authenticated session.
- Receipt history requires access to the production project and is always scoped to the current actor.
- Read-only provider actions require project view access.
- Actions that change an external service require project edit access.
- No endpoint accepts a user ID, role or access claim from the request body.

## Durable execution receipts

The runtime reuses the existing `production_integration_receipt` relation. No new migration is required.

The primary fence is `(projectId, actorUserId, mutationId)`. A canonical SHA-256 digest covers the project and validated request. Behavior is:

- exact retry after success: return the persisted response without a second provider call;
- same mutation ID with different input: reject as an idempotency conflict;
- pending receipt: reject as already running;
- uncertain receipt: reject and require operator reconciliation;
- failed receipt with the same request: reopen the receipt for an explicit retry;
- dry run: no receipt and no provider call.

The four stored states are `pending`, `succeeded`, `failed` and `uncertain`. Network timeouts, redirects, throttling, incomplete responses and most provider 5xx responses are classified as uncertain because the provider may have committed the write.

New mutation IDs are also protected by a database-backed per-actor UTC daily ceiling. The default is 100 live executions and `INTEGRATION_RUNTIME_DAILY_EXECUTIONS_PER_ACTOR` accepts only values from 1 through 1,000. An actor/day advisory transaction lock makes the count atomic across API instances. Exact replay and an explicit retry of the same failed mutation do not consume another slot; dry runs never count. Invalid deployment values fail application bootstrap instead of silently disabling the ceiling.

## Outbound network boundary

The transport is shared by all runtime connectors and applies these rules:

- HTTPS only;
- explicit exact or suffix hostname allowlist per provider;
- no URL credentials or nonstandard ports;
- redirects are never followed;
- bounded request and response bodies;
- fixed timeout;
- JSON response validation;
- normalized results only.

Sensitive provider responses are reduced before persistence. In particular, Zoom access tokens and host `start_url` values, webhook URLs, API tokens and authorization headers never enter execution responses or receipts. Figma render URLs are returned only to the initiating live response; durable receipts retain node IDs and availability, not expiring signed URLs.

## Deployment configuration

Copy only the needed values from `deploy/integration-runtime-connectors.env.example` into the deployment secret store. Do not copy them into a browser build, checked-in `.env` file or support log.

Keep the default execution ceiling until real usage data justifies a change. The reset is always `00:00 UTC`, and a quota rejection returns HTTP 429 with the configured limit and exact reset timestamp.

After deployment:

1. open `/settings/integrations` and confirm connector readiness;
2. use a disposable production project with the smallest provider scope;
3. run a dry run and inspect the request digest and operation;
4. execute one provider action;
5. confirm the external object and the matching receipt;
6. repeat the exact request with the same mutation ID through an API test and confirm replay rather than duplication;
7. revoke the provider credential and confirm fail-closed behavior;
8. test a timeout or provider sandbox failure and reconcile the uncertain receipt manually.

## Validation

Focused source validation covers:

- DTO strictness and explicit live confirmation;
- provider URL, header and body contracts with network mocks;
- redirect, hostname, body-size, timeout and throttle classification;
- project permissions;
- durable idempotency and replay;
- secret redaction and normalized result shape;
- workbench request generation;
- API and Web type checks.

No test uses a real provider credential or claims a real provider-side production receipt.
