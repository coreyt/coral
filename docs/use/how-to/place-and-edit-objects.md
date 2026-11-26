# How to place and edit objects

Create an object, change its label, and choose whether its position is authored
or left to layout.

Press `Ctrl/Command+Alt+N` to open the same create-node dialog directly.

1. Open **Command palette** > **Create Node**, choose **Process**, enter a label,
   and select **Create node**. The object appears on the canvas and in Coral DSL.

   Example Coral source (generated IDs may differ):

   ```coral
   @diagram flowchart
   checkout process as "Checkout"
   ```

2. Double-click the object to edit its label, or open **Command palette** >
   **Show Inspector** to edit its fields in **Properties panel**. You can also
   edit its declaration in **DSL editor region**. The canvas and source show
   the committed label.
3. Drag the existing object to author an Exact position. **Properties panel**
   shows the position and offers **Pin** or **Release position**.
4. Select **Release position** to return position ownership to layout. The
   object stays visible at its current view position until a later Reflow.

Coral does not ship a notation palette or drag-to-create interaction.

## Place an explicit label

1. Select an object whose Coral declaration has nonempty explicit label text,
   such as `api service as "API"`. In **Properties panel**, choose **Label side**,
   enter **Label offset**, and select **Apply label placement**. The source and
   canvas show the accepted placement together:

   ```coral
   @diagram architecture
   api service as "API" label below offset 12
   ```

2. For an external label, drag its **Move label for api** handle inward or
   outward. The handle follows the selected side's axis and changes only its
   offset. Arrow keys move the focused handle by one unit; Shift plus an arrow
   moves it by ten units. **Label offset** shows the accepted value.
3. Undo and redo the placement, then save and reopen. The exact surrounding
   source and authored positions remain intact. An unavailable or colliding
   placement is refused without adding a history entry.

Classifier headings and sequence participants do not offer this placement
control. Labels derived from an omitted label are not independently movable;
add explicit label text first. A stale gesture or changed viewport cancels the
placement rather than applying it to another selection.

## Result

The document contains one edited object with explicit or layout-owned position.

## Related

- [How to connect and route objects](connect-and-route-objects.md)
- [Coral DSL](../reference/coral-dsl.md)
- [Understanding history and undo](../explain/history-and-undo.md)
