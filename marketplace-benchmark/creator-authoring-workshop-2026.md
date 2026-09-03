# Creator Marketplace authoring benchmark and product target — 2026

This document records the product model used for ToonSpectrum's marketplace authoring overhaul. It intentionally compares **authoring, packaging, review, discovery, installation, and update lifecycle** rather than copying isolated upload forms.

## Services reviewed

| Product / marketplace | Strong pattern used as a benchmark | ToonSpectrum adoption |
| --- | --- | --- |
| Clip Studio Assets | Materials are created and registered in the drawing application before publishing; brush/tool materials remain editable and are distributed as reusable assets | Brush Studio is the source of truth; the marketplace receives the exact native snapshot plus a normalized compatibility graph |
| Procreate Brush Studio | One brush exposes multiple rendering systems and input dynamics; brushes can be combined into dual brushes and organized into sets | Multi-engine pipelines, input-channel mappings, layered tips/grains, deterministic seeds, dual-brush validation, and brush-set bundles |
| Krita resource bundles | Presets, patterns, gradients, palettes and related resources can be shipped together as a named bundle | Explicit required/optional dependencies and mixed-asset bundles with version ranges |
| Adobe Creative Cloud / Exchange | Product compatibility, versions, licensing and update information are first-class listing data | Runtime/backend/input compatibility matrix, minimum app version, release notes, migration notes and rights attestations |
| Unity Asset Store publisher portal | Package preparation, media, technical details, dependencies, validation and review are separate gates | Seven-step authoring workflow, hard diagnostics, reviewer notes and a publish-form handoff only after blocking errors are cleared |
| Epic Fab | Listings aggregate multi-engine assets, formats, media galleries, product metadata, license and update lifecycle | Asset-specific technical schemas, media scenario slots, structured rights, release lineage and installation targets |
| Blender Extensions | Manifest metadata, compatibility ranges, permissions and packaged source are validated before distribution | Source manifest retained in the package, version range checks and explicit capability declarations |
| Figma Community | Creation happens in the primary editor and publishing is a continuation of that workspace; updates remain connected to the original resource | Studio-to-market handoff with resumable draft token and return route; updates point to the previous marketplace resource |
| Canva Creators | Templates are reviewed as reusable systems rather than screenshots; discoverability and content policy are integral | Template/page/guide/font metadata, preview rights and searchable use/style tags |
| Sketch resources / libraries | Shared libraries keep reusable components connected to their source and version | Stable authoring draft, release lineage, dependency versions and non-destructive updates |
| Gumroad | Creator-focused product setup, previews, versions and update delivery are simple but complete | Fast default path with progressive disclosure, downloadable authoring draft and package manifest |
| itch.io | Draft publishing, metadata quality, uploads, channels and version changes are independently editable | Autosaved resumable drafts and explicit release/change-log step |
| ArtStation Marketplace | Strong presentation gallery, software/version metadata and creator usage context | Scenario-aware cover, before/after, stroke sheet, turntable and image/video media slots |
| Unreal Marketplace legacy workflow | Technical review checks content structure and engine compatibility before release | Compatibility diagnostics and reviewer notes are product data, not free-form support comments |
| Roblox Creator Store | Asset type, dependencies, permissions, moderation and updates are tied to an immutable resource identity | Structured bundle items, rights declarations and release ancestry |
| Godot Asset Library | Engine version, category, repository/source and licensing are visible before installation | Minimum app version, runtime backend, source identity and license surfaced in the authoring manifest |
| npm / VS Code Marketplace | Semantic versions, dependencies, compatibility engines, release notes and stable package identity | SemVer releases, version ranges, compatibility declarations and deterministic package manifest |
| Steam Workshop | The editor/game creates publishable content and maintains an updateable workshop item identity | Source workspace handoff, previous-resource update mode and migration notes |

## Product principles

### 1. The editor owns creation; the marketplace owns publication lifecycle

A creator must not rebuild a complex brush in a shallow marketplace form. Brush Studio remains authoritative for native engine programs, tip layers, grains, pressure/velocity/tilt/twist mappings, dual-brush composition, wet media, particles and post-processing. The marketplace keeps both:

1. the **exact native Studio snapshot**, used for lossless editing and future migrations; and
2. a **normalized authoring graph**, used for compatibility checks, previews, search facets and review.

The normalized graph never replaces the native program.

### 2. Registration is a resumable workshop, not one submission form

The workflow is split into:

1. source and listing identity;
2. recipe or asset-specific technical composition;
3. real-use preview scenarios;
4. package contents and dependencies;
5. runtime, device and application compatibility;
6. license, provenance and media rights;
7. versioning, review and release.

Every step can be revisited without losing the source package. The draft can be exported, restored and handed between Studio and the marketplace.

### 3. Brushes are programmable multi-engine products

Supported authoring nodes include solid path, vector outline, dab/stamp, image tip, procedural SDF tip, dry media, particles, wet media, watercolor diffusion, oil/impasto, living ink, dual brush, smudge, eraser, texture relief, glow and post-process passes.

Each node declares:

- rendering backend: portable, Canvas 2D, WebGL 2, WebGPU or WASM;
- blend/composition operator;
- editable parameters;
- pressure, velocity, direction, tilt, twist, distance, time and random mappings;
- layered shape/image/procedural/native tips;
- the exact source program when imported from Brush Studio.

Blocking validation rejects contradictory backend declarations, a dual brush without another input, loss of native engine programs, invalid releases and missing rights attestations.

### 4. Preview media proves use, not just appearance

A brush listing should include a deterministic stroke sheet across fast/slow strokes, taps, crossings, corners, long strokes, zoom, mouse, touch and stylus orientation. Other assets use equivalent scenarios: 3D turntables and LOD views, tone seam tests, palette contrast and color-space checks, template page/contact sheets, and bubble auto-fit/vertical-text examples.

### 5. Every asset uses the same lifecycle, but not the same schema

Shared lifecycle data includes identity, search metadata, source, media, dependencies, compatibility, rights, review and release. Technical fields remain specific:

- tone/pattern: repeat mode, DPI, line frequency, angle, seamlessness;
- palette: color space, swatch count, contrast and print checks;
- pose: rig and bone standard, camera, mirroring;
- 3D: format, polygon/texture budgets, units, rigging and LODs;
- background: dimensions, DPI, perspective and layer structure;
- bubble: tail variants, text insets, vertical text and auto-fit;
- template: pages, canvas preset, guides and required fonts;
- material bundle: contents, installation target, authoring application and portability.

## Gap assessment before this overhaul

| Previous behavior | Product risk | Replacement |
| --- | --- | --- |
| Marketplace brush registration reduced a brush to a few listing fields and an uploaded file | Native engine programs and advanced dynamics could disappear or become unreviewable | Lossless Brush Studio snapshot plus normalized engine graph |
| Brush Studio and marketplace were separate destinations | Creators had to export, find a page, re-enter metadata and could not reliably return | Explicit Studio handoff, resume token and return route |
| Preview was primarily visual decoration | Buyers could not judge pressure, spacing, crossing, grain or input-device behavior | Scenario-aware deterministic preview contract |
| Dependencies were implicit | Missing tips, textures, fonts or palettes caused partial installs | Required/optional bundle items with version ranges and roles |
| Compatibility was largely prose | GPU/backend/input failures appeared after install | Structured Canvas2D/WebGL2/WebGPU/WASM and mouse/touch/stylus contract |
| New publishing and updates were different mental models | Release history and migration guidance drifted | Shared release lineage, SemVer, changelog and migration notes |
| Rights were a broad agreement | Third-party materials and preview media attribution were hard to review | Separate original-work, preview-rights, redistribution, commercial and AI-training fields |
| Other asset types copied the same generic form | Technical quality could not be reviewed consistently | Shared lifecycle with asset-specific technical schemas |

## Acceptance gates

A marketplace authoring release is not complete until all of the following hold:

- Brush Studio native programs survive authoring draft → package manifest → install payload → reopened editor round trip.
- The normalized graph reports engines, tips, mappings and backend requirements without mutating the source program.
- Mobile and desktop paths expose the same steps and all interactive targets remain keyboard reachable.
- A draft survives reload and can be exported/imported without identity or release loss.
- Update mode requires an existing resource identity and valid SemVer.
- Required dependencies and unsupported runtimes are visible before install.
- Missing source/media rights, contradictory GPU declarations and incomplete dual brushes block submission.
- Existing marketplace clients continue to accept the package through the legacy publish API during migration.
