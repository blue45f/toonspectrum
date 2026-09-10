# Pending-stroke lifecycle recovery invariant

Studio route transitions can overlap asynchronous OPFS or SQLite autosave writes. A synchronous browser-storage lifecycle snapshot may therefore contain completed strokes that are not yet present in the latest durable candidate.

Recovery may prefer that compatibility snapshot only when all of the following are true:

- it carries both `pendingStrokeDurability` and `lifecycleDurability` receipts;
- the receipts agree on reason, timestamp, page, and the complete unique stroke-ID set;
- every recorded stroke ID exists in the persisted page elements;
- the compatibility snapshot is not older than the durable candidate; and
- it restores at least one receipt-backed stroke missing from the durable candidate.

Generic localStorage snapshots remain compatibility-only and never replace a healthy OPFS or SQLite authority. The browser durability suite covers two distinct delayed strokes followed by immediate route navigation, while focused unit tests cover newer, equal-timestamp, stale, generic, and malformed recovery candidates.
