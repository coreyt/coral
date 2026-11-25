# Import icons

Open **More → My Icons** to import SVG files or Coral icon bundles. You can
also drop files into that dialog. The preview shows each accepted icon on
light and dark backgrounds at four sizes. A refused file shows its reason.

Choose **Save imported icons** to keep the accepted previews in this browser.
Choose an icon, then **Place in diagram** to copy its definition into editable
Coral source and add an object. Undo removes that placement as one edit. The
initial size preserves the SVG view-box proportions within 64 diagram units.

**Edit icon details** opens the existing symbol editor for names, tags,
provenance, anchors and ports. Save the edited icon explicitly. When a document
contains another revision, choose whether to keep its revision, update it, or
save the library icon under a new ID. Updates that remove a connected port
are refused until you resolve those connections. Library edits and deletions
do not silently change existing diagrams.

Use **Export library** to create downloadable bundle links. Larger libraries
are divided into numbered parts; download every part. Import those files in
another browser to restore the library. **Export selected icon** creates a
bundle for one icon. Browser storage can be cleared or evicted. If storage
is unavailable or full, the current preview can still be placed in the
document or exported.

## Import limits

Each SVG allows 3,000 drawing operations, 100 rendered shapes, 128 KiB input
and saved artwork, and eight container/reference levels. Local shape copies
count after expansion. External resources, circular references, filters,
masks and clip paths are refused. Normalization preserves geometry and
converts ordinary equivalent colour forms.

The frame check permits 1% overhang according to the renderer's bounds
estimate. Stroke caps and acute joins can differ from that estimate; it is
not an exact painted-ink guarantee. Refusals leave the original file unchanged.
Use **Cancel import** to stop a batch. An import does not upload your files.

## Related

- [Place and edit objects](place-and-edit-objects.md)
- [Save, open, and recover](save-open-and-recover.md)
- [Privacy and storage](../explain/privacy-and-storage.md)
