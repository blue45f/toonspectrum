# Membership operations hardening

This document describes the operational layer that sits on top of the membership
and wallet policy.

## Account storage authority

Membership storage is enforced by the API, not only by client-side Studio checks.

The current account usage calculation includes:

- durable Studio work-asset payload bytes owned by the user's works
- durable raster-asset payload bytes owned by the user's works
- active generated `derived` and `export` private-storage objects, deduplicated
  by purpose and digest for the same owner

Source private-storage objects are not counted a second time because their source
payload is already represented by the durable Studio work-asset row.

Every newly admitted Studio work asset or raster asset is checked in the same
database transaction that persists it. A per-user PostgreSQL advisory lock
serializes concurrent uploads across different works so parallel requests cannot
independently pass the same remaining-capacity check.

Daily upload accounting uses successful upload receipts and the Asia/Seoul day
boundary. Generated server outputs count toward account storage but do not consume
the user's daily upload budget.

Format-specific technical safety limits remain independent. The effective limit is
always the stricter of the feature safety limit and the membership account limit.

## Downgrade and over-quota behavior

A plan downgrade never deletes existing user data.

Resource state is derived as:

- `normal`: below the warning threshold
- `warning`: at or above the configured storage warning ratio
- `grace`: existing data is above the current membership limit, with a 7-day
  cleanup grace window
- `read_only`: the grace deadline has passed while the account remains over quota

Over-quota accounts keep read/download access. New durable storage is rejected
until usage is back within the active plan limit. This avoids destructive
downgrade behavior while keeping storage growth bounded.

## Reward reversal

Activity rewards use append-only correction semantics.

When a rewarded work, community post, or comment is deleted, or a rewarded work
is explicitly unpublished, the service attempts to reverse the matching activity
reward. Existing wallet ledger entries are never edited.

If enough Reward Point balance is available, a new `reversal` ledger entry is
appended. If the user has already spent or lost part of the rewarded points, the
uncollectable amount is recorded as `pendingAmount` in
`membership_reward_reversal`.

A database trigger applies pending recovery to future Reward Point grants before
those new points remain available. This prevents repeated create/reward/delete
cycles from turning into a permanent negative-balance bypass while preserving an
append-only audit trail.

The original product mutation remains authoritative: a reward-ledger failure must
not resurrect a deleted post or fail an otherwise valid content mutation.

## Usage dashboard and notices

Authenticated users can open `/membership/usage` to see:

- actual account storage usage and current plan limit
- today's successful upload usage and remaining daily budget
- per-activity daily Reward Point grant counts
- storage warning / over-quota / read-only notices
- membership expiry notices

Notices are deduplicated in the database and can be marked as seen by their owner.

## Policy history and operations

Every insert/update/delete of `membership_policy_override` is captured in
`membership_policy_change` by a database trigger. The history stores before and
after values, active flags, actor, timestamp, and a monotonic revision.

Admin-only read APIs expose:

- membership policy change history
- pending reward-recovery debt

This gives operators a concrete audit path without making mutable policy rows
the historical source of truth.

## Production migration

Migration `0077_membership_operations.sql` adds the operational tables and
triggers. Migration `0076_creator_role_profile_v2.sql` adopts the previously
unmanaged creator-profile v2 upgrade into the continuous production sequence.
The production migration manifest and readiness relation set include migrations
0074–0077 and their runtime relations so a deployment cannot silently skip the
creator ecosystem or membership foundation.

The migration runner also normalizes a dedicated membership runtime ACL after
every deployment. Reward and usage receipts remain append-only, policy history is
read-only to the application role, wallet lifecycle updates are limited to the
reviewed mutable columns, and no membership table or history sequence is exposed
through PUBLIC privileges. Trigger-owned policy history and pending-recovery
updates execute as SECURITY DEFINER functions with an explicit safe search path.
