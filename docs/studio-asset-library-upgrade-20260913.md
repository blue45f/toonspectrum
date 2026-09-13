# Studio asset-library upgrade — 2026-09-13

## Delivered in this change
- Persistent 2D deletion keeps failed rows and favorites retryable instead of silently switching storage authority to memory. Mutation completion fences stale hydration reads.
- 3D deletion explains operation contention, preserves scene-removal preflight, and distinguishes committed source deletion from failed library refresh.
- The live insertion hub exposes personal management with confirmed individual/batch deletion, search, sorting, pagination and truthful deletion summaries. Unmounting stops unstarted batch deletions.
- Complete library projection replaces the premature 240-item recommendation cap. Rendering remains paginated. Recent history retains the newest 40 valid entries, even from unsorted storage.
- Templates/backgrounds have dedicated complete-corpus browsing, thematic queries and enlarged previews. Scene templates explicitly open their existing preview tool rather than pretending to insert immediately.
- Existing CC0 catalog controls are surfaced directly. External discovery links are explicitly not installed inventory.
- Eight distinct native vector environments are added: bookstore, hospital corridor, train platform, rainy neon alley, hanok courtyard, rooftop greenhouse, laboratory and observatory.
- The generated-2D subset grows from 67 to 75 assets; generated backgrounds grow from 17 to 25. These are not counts for the entire product library.
- New backgrounds are 1280×720 self-contained, scalable illustrated SVG, not photographic renders or newly imported GLB models. No remote fonts, images, scripts or external SVG references are used.

## Benchmark sources and applied decisions
Reviewed first-party documentation on 2026-09-13; focused on relevant creation workflows, not an exhaustive crawl of every site.
| Source | Applied decision |
| --- | --- |
| [Figma](https://help.figma.com/hc/en-us/articles/360039150173-Create-and-insert-component-instances) | Search-first asset navigation and preview before insertion. |
| [Canva](https://www.canva.com/pt_br/help/move-designs-to-trash/) | Explicit selection and confirmation. This change does not add a recycle bin or undo for permanent source deletion. |
| [Blender Asset Browser](https://docs.blender.org/manual/en/latest/editors/asset_browser.html) | Distinguish catalogs, metadata, preview and use actions. |
| [Spline material library](https://docs.spline.design/materials-shading/basics/material-library) | Surface curated collections and material/source distinctions. |
| [CLIP STUDIO ASSETS](https://assets.clip-studio.com/ko-kr/recommended-materials/three-d/) | Scene/prop/3D discovery paths. External items retain their own licenses. |
| [Poly Haven](https://polyhaven.com/license) | Separate CC0 downloadable assets from website content and API terms. No website scraping or copied preview inventory. |
| [ambientCG](https://docs.ambientcg.com/license/) | Link to clearly licensed PBR material sources. |
| [Kenney](https://kenney.nl/support) | Link to clearly licensed stylized prop/environment sources. |
| [Blendkit / BlenderKit](https://www.blendkit.com/) | Separate model/material/HDRI discovery and free/paid source conditions. |

## Verification and boundaries
The scoped workflow runs deletion, discovery, scene inventory, UI interaction, existing insertion-hub tests and the dependency-free SVG safety contract. Existing main CI gates are preserved. Real user assets and database records are not deleted for tests. Browser-local SQLite/OPFS remains authoritative; no Neon migration is needed. Merge and production deployment are separate outcomes and must be verified against their actual GitHub/Vercel status.
