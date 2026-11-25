# Understanding connection rules

Connections are accepted only when their endpoints, ports, and active notation
permit the relationship.

## Ports carry direction and capacity

Each symbol exposes compatible source and target ports. Coral refuses a
connection when a port has the wrong direction, lacks capacity, or cannot pair
with the selected endpoint.

## Notations add semantic rules

BPMN, ERD, architecture, and other notation libraries can require particular
connection types or diagram structure. A visible diagnostic explains a refused
gesture; changing the symbol or endpoint may make the connection valid.

## Routes are separate from relationships

The edge records which objects are related. Route intent records how the
connection travels through the diagram. Reflow can recompute ordinary routing
while preserving authored waypoints and anchors.

## Related

- [How to connect and route objects](../how-to/connect-and-route-objects.md)
- [Notation libraries](../reference/notations.md)
- [Troubleshooting](../reference/troubleshooting.md)
