# How to connect and route objects

Join two existing objects through compatible ports. Route editing depends on
whether the document owns Coral source or GraphIR interchange.

1. Open **Command palette** > **Create Edge**, choose the source and target
   objects and ports, then select **Create edge**. A connection appears when the
   notation permits the pair.

2. Select the connection, open **Command palette** > **Show Inspector**, and
   edit its label in **Properties panel**. The label changes on the canvas and
   in the DSL editor.
3. For saved Coral source, waypoint gestures are unavailable. Edit the authored
   route in the DSL editor, using the [spatial source forms](../reference/coral-dsl.md).
   For GraphIR interchange documents, use the admitted waypoint controls to
   change a manual route; a refused action leaves the document unchanged.
4. Run **Command palette** > **Reflow Layout**. Authored waypoints remain part
   of the document while computed routing is refreshed.

## Result

Two objects are joined by one labelled, notation-valid connection.

## Related

- [Understanding connection rules](../explain/connection-rules.md)
- [How to lay out and reflow](lay-out-and-reflow.md)
- [Coral DSL](../reference/coral-dsl.md)
