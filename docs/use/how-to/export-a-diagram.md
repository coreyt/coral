# How to export a diagram

Create a graphic or interoperable GraphIR copy from the current verified
Coral source.

1. Review the current source and resolve any blocking diagnostic. If its
   meaning is invalid, stale, or unsupported, Coral refuses export instead of
   substituting an earlier canvas result. The source remains saveable as text.
2. Open **More actions** and choose **Export Graph-IR**, **Export SVG**,
   **Export HTML**, **Export PNG**, or **Export JPEG**. The browser prepares the
   selected output from verified meaning and geometry.
3. Open the saved output and compare its labels and connections with the
   canvas. The exported result contains the current accepted diagram.

Graphic export is not a Coral document. Use **Save** when positions, settings,
and document metadata must be reopened in Coral.

Exported label measurement covers the shipped Latin text subset. Non-Latin
labels can be mis-sized in graphics, so inspect those exports before sharing.

## Result

The browser saves the selected export without changing the Coral document.

## Related

- [File and export formats](../reference/file-and-export-formats.md)
- [How to save, open, and recover](save-open-and-recover.md)
- [Understanding conversion loss](../explain/conversion-loss.md)
