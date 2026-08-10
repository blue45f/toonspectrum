# Dialogue ruby export hybrid design

## Data flow

```text
text + rubySpans + writing mode
  -> existing horizontal/vertical product planners
  -> explicit placements + warnings + unsupported ranges
       | PDF: CID Unicode text ops + matrices + ActualText/ToUnicode
       | PSD: authoritative raster layer + canonical XMP source manifest
  -> format-specific loss/approximation receipt
```

No exporter owns an independent ruby layout algorithm. Horizontal placement delegates to
`planDialogueRubyOverlayPlacements`; vertical base layout delegates to `layoutVerticalText`; and
vertical-rl ruby delegates to `planDialogueVerticalRubyOverlayPlacements`. Therefore Konva, SVG,
PDF and the PSD receipt share one geometry source.

## PDF semantics

- Horizontal base lines and ruby readings are emitted as separate native PDF text operations.
- Vertical CJK glyphs are emitted upright at product-core cell coordinates.
- Rotated Latin runs use a Studio-coordinate text matrix.
- One-to-four ASCII digits use the `verticalTextItemGeometry` tate-chu-yoko scale and remain one
  text operation/cell.
- Vertical ruby is emitted as upright, right-side glyph overlays. PDF has no native editable ruby
  primitive, so the plan reports `pdf-vertical-glyph-overlays`.
- Every text operation carries `/ActualText <FEFF...>`; embedded CID fonts receive a deterministic
  glyph-id-to-Unicode `/ToUnicode` CMap. A Standard-14 font receiving non-WinAnsi text fails closed
  instead of becoming question marks.
- Positioning uses product coordinates converted at 0.75pt per CSS px. A caller can inject an
  actual font measurer; otherwise the existing deterministic CJK advance estimate is used and
  reported.

## PSD semantics

- The visible layer remains the exact Konva `toCanvas()` result, so horizontal ruby, vertical-rl
  ruby and tate-chu-yoko remain visible.
- A type descriptor is deliberately not attached to a ruby layer. ag-psd cannot represent the
  base/reading relationship; a base-only descriptor could cause Photoshop to regenerate and erase
  the visible reading.
- A document XMP packet stores version, element ID, layer name, original Unicode text, writing mode,
  exact source `rubySpans`, and the disposition `visible-raster-metadata-psd`.
- XMP records are snapshotted before asynchronous capture, recursively canonicalized, sorted by
  element ID, XML-escaped, and round-trip parsed in tests.
- The result includes one `rubyReceipt` per source element: appearance path, editability level,
  metadata status, placement count, tate-chu-yoko count, warnings and unsupported ranges.

## Malformed and boundary behavior

- Offsets are UTF-16, matching the editor selection model.
- Fractional, non-finite, inverted and out-of-range offsets are rejected visibly.
- Offsets that split surrogate pairs are rejected.
- Overlaps use the first accepted range after deterministic ordering; every later overlap receives
  an explicit issue.
- Horizontal spans crossing a newline are retained in metadata but not painted as a false single
  overlay.
- Vertical spans crossing columns are split only by the existing vertical planner; all reading
  glyphs are retained and `span-split-across-columns` is reported.
- Plain text takes the previous single-text path and produces no ruby metadata/receipt.

## Replacement conditions

Replace the PSD fallback only when a public writer can round-trip native Photoshop ruby through at
least two supported Photoshop versions without changing text, offsets, writing direction or pixels.
Replace the PDF positioned overlay only when a deployed browser PDF backend exposes shaped vertical
runs and passes the same Unicode extraction, visual-diff and deterministic-output corpus.
