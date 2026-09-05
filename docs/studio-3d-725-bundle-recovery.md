# PR 725: specialist activation boundary

The core run 33946470247 at head 0b902eb passed architecture, lint, typecheck,
root Vitest, distributed coordination, Worker packaging and production build.
Its remaining bundle ratchet failure was BG3D activation: 3570.3 KiB raw and
1020.9 KiB gzip versus unchanged limits of 3564.9 / 1015.5 KiB.

The view shell keeps every tab panel mounted with the HTML `hidden` attribute.
Therefore splitting only the newly added workflow panels was insufficient:
the entire Pro Suite and its specialist imports were still in the eager graph.

This change moves the existing Pro Suite implementation without altering its
content, introduces a lazy shell, and supplies actual tab visibility from the
canonical view context. A never-opened hidden suite does not import its content.
After its first activation, it stays mounted so settings survive tab switches.
The shell also inherits capture, restoration, physics and batch locks.

Existing content assertions remain unchanged apart from importing the moved
implementation. A separate lazy-boundary test checks deferred import, retained
local edits and lock propagation. Bundle baselines, limits, CI gates and branch
protection are not changed. The new head must pass CI before merging.

## Final startup request correction

CI run 33958355889 passed root Vitest (3840 files, 21809 tests), lint,
typechecking and production build. Its bundle check reported 106 Studio
static JavaScript files/requests against the unchanged limit of 105.

The initial-primary-tool module contains two pure functions and only a type
import. It is synchronously used by workspace restoration and reused by the
preferences repository. Co-locating this tiny leaf with the existing eager
capability contracts removes its standalone startup request without importing
the preferences database, a panel or an engine. An AST regression test protects
both the explicit chunk membership and the dependency-free runtime boundary.

Integrate main af19e7aaff8bb43e6504384edf1bbda713821015, whose changed paths
since the common ancestor do not overlap the production workflow changes.
Retain its existing CI and product changes. The combined head requires a fresh
CI result; previous successful tests do not substitute for that verification.
