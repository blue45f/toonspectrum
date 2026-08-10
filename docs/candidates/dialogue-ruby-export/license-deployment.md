# Dialogue ruby export license and deployment

## Inventory

| Component | Version/pin | License | Deployment | Notice/action |
|---|---:|---|---|---|
| ag-psd | 31.0.1 (workspace lock) | MIT | Existing browser PSD writer | Keep MIT attribution in the repository's generated notices; no new package added |
| canvaskit-wasm | 0.41.1 | BSD-3-Clause | Existing renderer, not selected for browser PDF because no SkPDF API is exposed | Keep existing BSD notice; reconsider only with a separately audited PDF-capable build |
| ToonSpectrum vector PDF/ruby bridge | Repository source | Project distribution terms | Existing Vite application | No new external code or asset |
| User/CJK font bytes | Per asset | Font-specific embedding rights | Embedded only through existing sfnt license gate | `fsType` policy remains authoritative; restricted fonts fail closed |

No dependency, package manifest or lockfile changed in this slice.

## Deployment behavior

- PDF lowering is DOM-free and may run in the existing worker/final-export path. It allocates native
  PDF text operations and a compact ToUnicode stream; no GPU readback is introduced.
- PSD keeps the existing per-element Konva capture and ag-psd write path. XMP is a small UTF-8 image
  resource merged with existing resolution metadata.
- Ruby XMP contains user-authored dialogue and readings. It is intentionally local to the exported
  document, is not uploaded by this module, and follows the same sensitivity as the PSD itself.
- Canonical serialization rejects cycles, `undefined`, functions, symbols and non-finite numbers.
  JSON-compatible malformed offsets are still preserved exactly and reported separately.
- Standard-14 PDF fonts cannot represent CJK/emoji. The writer now fails closed and requests an
  embedded CID TrueType font rather than silently substituting question marks.

## Unsupported and fallback declaration

- Native editable Photoshop ruby: unsupported by ag-psd's public model; visible raster + XMP source.
- Editable PDF vertical ruby semantics: not defined by the current writer/PDF primitive; positioned
  Unicode glyph overlays + explicit warning.
- CFF/OpenType CIDFontType0: remains governed by the existing PDF font gate; this change does not
  mispackage CFF as TrueType.
- Curved/path ruby: outside this helper's bounded box-text input and must remain an explicit format
  fallback in its owning exporter.

## Replacement and rollback

The code is additive to existing plain-text paths. Removing the ruby bridge restores prior raster
PSD behavior but would discard XMP metadata and explicit receipts, so rollback requires a documented
data-loss notice. A replacement provider must preserve all current reference pixels, Unicode,
metadata digests, warnings and font-license failures before promotion.
