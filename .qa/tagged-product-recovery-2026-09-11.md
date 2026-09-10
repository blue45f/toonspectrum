# Tagged product recovery — 2026-09-11

Product changes reconstructed on the final convergence branch:

- Studio 3D insertion quality policy: `a8c475dc38060d46e50406b3802ead1867ab2515`
- Studio effects workspace payload: `f76a78bc047d42dcc74cda6002307d50fb491cd8`
- Unified Studio 3D entry: `1b71d831407324fb4b2d9e5b4f0c1cabb5dd1d52`

Existing convergence coverage was retained for VRM model/thumbnail admission,
VRM atomic preview transitions, BG3D WebGL recovery, and batch insertion races.
One-shot recovery workflows and transport payloads are intentionally excluded
from the final product tree.
