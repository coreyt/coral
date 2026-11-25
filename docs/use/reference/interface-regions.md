# Interface regions

Names used by Coral instructions; individual object fields are covered by their
task pages.

| Name | Purpose | How to reach it |
| --- | --- | --- |
| Diagram editor | Canvas and visual selection | Main application region |
| DSL editor region | Coral or Mermaid source | Upper-left source region |
| Properties panel | Selected diagram and object fields | Right side |
| Bottom panel tabs | Diagnostics and activity | Lower region |
| Canvas controls | Zoom and fit actions | Lower-right of the canvas |
| Resize source | Changes source width | Separator beside the DSL editor |
| Resize Properties | Changes Properties width | Separator beside Properties |
| Resize bottom panel | Changes lower-panel height | Horizontal separator |

The source pane, canvas or sequence pane, Properties panel, bottom panel,
and header/dialogs form the five main editor areas. The controller coordinates
source edits, parsing, layout, history, save and stale-result rejection; panels
do not own a separate saved graph.

At narrow widths, **Save** and **More actions** remain in the header while
secondary actions move under **More actions**. Requested panel sizes are kept
when the viewport temporarily clamps their effective size.

## Related

- [How to use Coral with the keyboard](../how-to/use-coral-with-the-keyboard.md)
- [Preferences](preferences.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
