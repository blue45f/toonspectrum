# ToonSpectrum OpenWiki instructions

Source code and tests are the authority for current runtime behavior. ADRs record accepted decisions. Architecture documents may describe both current and target states. OpenWiki is a navigation, explanation and evidence layer; it must never override source, tests or accepted ADRs.

For every architecture statement, explicitly distinguish one of these states:

- **current** — implemented and verifiable in source/tests now.
- **migration** — partially implemented, with legacy and target paths coexisting.
- **target** — intended architecture that must not be described as already complete.
- **legacy exception** — intentionally retained debt guarded by a ratchet.

Organize repository explanations by `Application -> Domain -> Capability -> Surface/Runtime -> Source`.

The current strategic constraints are:

1. Keep logical domains inside `apps/web`, `apps/admin`, and `apps/api`; do not invent `packages/domains/*`.
2. Web, Admin and API must not import one another's application source.
3. Promote shared contracts/primitives only when there is a real second consumer.
4. `shared` code must remain independent of business domains.
5. Studio is a runtime-oriented subsystem; preserve its document/command/history/storage/rendering boundaries and focused core packages.
6. Report architecture-ratchet counts and legacy exceptions instead of hiding them.
7. Operational deployment policy in `AGENTS.md` remains authoritative and must not be weakened by generated documentation.

When a page describes a migration, link both the current source and the target architecture document where possible. Prefer short paths and direct evidence over generic framework advice.
