import { describe, it, expect } from 'vitest';
import { parseMermaid } from '../src/formats/mermaid.js';

describe('Mermaid Importer', () => {
  describe('diagram type detection', () => {
    it('returns error for unsupported diagram types', () => {
      const result = parseMermaid('gantt\n  title Project');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Unsupported');
      expect(result.errors[0].message).toContain('Gantt');
    });

    it('returns error for unknown diagram types', () => {
      const result = parseMermaid('unknownDiagram\n  foo');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Could not detect');
    });

    it('handles empty input', () => {
      const result = parseMermaid('');
      expect(result.success).toBe(false);
    });
  });

  describe('flowchart parsing', () => {
    it('parses a simple flowchart', () => {
      const result = parseMermaid('flowchart LR\n    A --> B');
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2);
      expect(result.graph?.edges).toHaveLength(1);
    });

    it('parses nodes with labels', () => {
      const result = parseMermaid('flowchart LR\n    A[Web App] --> B[API Gateway]');
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({ id: 'A', label: 'Web App' });
      expect(result.graph?.nodes[1]).toMatchObject({ id: 'B', label: 'API Gateway' });
    });

    it('parses database shape nodes', () => {
      const result = parseMermaid('flowchart LR\n    A[(Database)]');
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({ id: 'A', type: 'database', label: 'Database' });
    });

    it('parses stadium shape as service', () => {
      const result = parseMermaid('flowchart LR\n    A([Service])');
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({ id: 'A', type: 'service', label: 'Service' });
    });

    it('parses edge labels', () => {
      const result = parseMermaid('flowchart LR\n    A -->|HTTP| B');
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({ source: 'A', target: 'B', label: 'HTTP' });
    });

    it('parses subgraphs as groups', () => {
      const result = parseMermaid(`flowchart LR
    subgraph Backend
        A[API]
        B[Worker]
    end`);
      expect(result.success).toBe(true);
      const backend = result.graph?.nodes.find(n => n.id === 'Backend');
      expect(backend?.type).toBe('group');
      expect(backend?.children).toHaveLength(2);
    });

    it('handles TD direction', () => {
      const result = parseMermaid('flowchart TD\n    A --> B');
      expect(result.graph?.layoutOptions?.direction).toBe('DOWN');
    });

    it('handles LR direction', () => {
      const result = parseMermaid('flowchart LR\n    A --> B');
      expect(result.graph?.layoutOptions?.direction).toBe('RIGHT');
    });

    it('parses graph as flowchart', () => {
      const result = parseMermaid('graph LR\n    A --> B');
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2);
    });

    it('parses chained edges: A --> B --> C', () => {
      const result = parseMermaid('flowchart LR\n    A --> B --> C');
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(3);
      expect(result.graph?.edges).toHaveLength(2);
      expect(result.graph?.edges[0]).toMatchObject({ source: 'A', target: 'B' });
      expect(result.graph?.edges[1]).toMatchObject({ source: 'B', target: 'C' });
    });

    it('parses long chains: A --> B --> C --> D --> E', () => {
      const result = parseMermaid('flowchart LR\n    A --> B --> C --> D --> E');
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(5);
      expect(result.graph?.edges).toHaveLength(4);
      expect(result.graph?.edges[0]).toMatchObject({ source: 'A', target: 'B' });
      expect(result.graph?.edges[1]).toMatchObject({ source: 'B', target: 'C' });
      expect(result.graph?.edges[2]).toMatchObject({ source: 'C', target: 'D' });
      expect(result.graph?.edges[3]).toMatchObject({ source: 'D', target: 'E' });
    });

    it('parses chained edges with labels on each segment', () => {
      const result = parseMermaid('flowchart LR\n    A -->|step1| B -->|step2| C');
      expect(result.success).toBe(true);
      expect(result.graph?.edges).toHaveLength(2);
      expect(result.graph?.edges[0]).toMatchObject({ source: 'A', target: 'B', label: 'step1' });
      expect(result.graph?.edges[1]).toMatchObject({ source: 'B', target: 'C', label: 'step2' });
    });

    it('parses chained edges with shapes', () => {
      const result = parseMermaid('flowchart LR\n    A[(DB)] --> B{Decision} --> C[Result]');
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(3);
      expect(result.graph?.nodes.find(n => n.id === 'A')?.type).toBe('database');
      expect(result.graph?.nodes.find(n => n.id === 'B')?.type).toBe('module');
      expect(result.graph?.edges).toHaveLength(2);
    });

    it('parses mixed arrow types in chain', () => {
      const result = parseMermaid('flowchart LR\n    A --> B -.-> C ==> D');
      expect(result.success).toBe(true);
      expect(result.graph?.edges).toHaveLength(3);
      expect(result.graph?.edges[0]).toMatchObject({ source: 'A', target: 'B' });
      expect(result.graph?.edges[1]).toMatchObject({ source: 'B', target: 'C' });
      expect(result.graph?.edges[1].style?.lineStyle).toBe('dashed');
      expect(result.graph?.edges[2]).toMatchObject({ source: 'C', target: 'D' });
    });
  });

  // Sequence import is owned by mermaid-sequence.test.ts (Slice 70, R-060).

  describe('class diagram parsing', () => {
    it('parses simple class', () => {
      const result = parseMermaid(`classDiagram
    class Animal`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({
        id: 'Animal', type: 'class', symbol: 'uml-class',
        classifier: { kind: 'class', name: 'Animal' },
      });
      expect(result.graph?.metadata?.notation).toBe('uml-class');
      expect(result.graph?.profile).toEqual({ id: 'uml', kind: 'class', version: '1.0.0' });
    });

    it('parses class with body', () => {
      const result = parseMermaid(`classDiagram
    class Animal {
      +String name
      +eat()
    }`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0].classifier?.compartments).toEqual([
        { id: 'name', kind: 'name' },
        { id: 'attributes', kind: 'attributes', items: [
          expect.objectContaining({ kind: 'attribute', name: 'name', type: 'String' }),
        ] },
        { id: 'operations', kind: 'operations', items: [
          expect.objectContaining({ kind: 'operation', name: 'eat', parameters: [] }),
        ] },
      ]);
    });

    it('parses inheritance relationship', () => {
      const result = parseMermaid(`classDiagram
    Animal <|-- Dog`);
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'Dog',
        target: 'Animal',
        type: 'inheritance',
      });
    });

    it('parses composition relationship', () => {
      const result = parseMermaid(`classDiagram
    Car *-- Engine`);
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0].type).toBe('composition');
    });
  });

  describe('state diagram parsing', () => {
    it('parses states', () => {
      const result = parseMermaid(`stateDiagram-v2
    state Still`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({ id: 'Still', type: 'module' });
      expect(result.graph?.metadata?.custom?.diagramType).toBe('state');
    });

    it('parses transitions', () => {
      const result = parseMermaid(`stateDiagram-v2
    Still --> Moving`);
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'Still',
        target: 'Moving',
        type: 'transition',
      });
    });

    it('parses start/end states', () => {
      const result = parseMermaid(`stateDiagram-v2
    [*] --> Still
    Moving --> [*]`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes.find(n => n.id === '_start_')).toMatchObject({ type: 'actor', label: 'Start' });
      expect(result.graph?.nodes.find(n => n.id === '_end_')).toMatchObject({ type: 'actor', label: 'End' });
    });

    it('reports dropped state constructs at their original source positions', () => {
      const source = '\n\nstateDiagram-v2\n  direction LR\n  state "Running" as Active\n  Active : description\n  classDef marked fill:red\n  unknown statement';
      const result = parseMermaid(source);
      expect(result.diagnostics.map(({ code, position }) => [code, position?.line, position?.column])).toEqual([
        ['mermaid.state.direction.unsupported', 4, 2],
        ['mermaid.state.alias.unsupported', 5, 2],
        ['mermaid.state.description.unsupported', 6, 2],
        ['mermaid.state.style.unsupported', 7, 2],
        ['mermaid.state.statement.unsupported', 8, 2],
      ]);
      for (const diagnostic of result.diagnostics) {
        expect(diagnostic.severity).toBe('warning');
        const { line, column, offset } = diagnostic.position!;
        expect(offset).toBe(source.split('\n').slice(0, line - 1).reduce((size, value) => size + value.length + 1, 0) + column);
      }
    });

    it('diagnoses composite flattening, nested pseudostates and styled transitions', () => {
      const result = parseMermaid('stateDiagram-v2\nstate Active {\n  [*] --> Idle\n  Idle:::marked --> Busy:::marked : work\n  Busy --> [*]\n  --\n}\nstate Choice <<choice>>');
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        'mermaid.state.composite.unsupported', 'mermaid.state.composite.unsupported',
        'mermaid.state.style.unsupported', 'mermaid.state.style.unsupported',
        'mermaid.state.composite.unsupported', 'mermaid.state.concurrency.unsupported',
        'mermaid.state.pseudostate.unsupported',
      ]);
      expect(result.graph?.edges).toHaveLength(3);
      expect(result.graph?.edges[1]).toMatchObject({ source: 'Idle', target: 'Busy', label: 'work' });
    });

    it('does not interpret note or accessibility-description contents as states', () => {
      const result = parseMermaid('stateDiagram-v2\nnote right of A\n  Fake --> Phantom\nend note\naccDescr {\n  Hidden --> Ghost\n}\nA --> B');
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        'mermaid.state.note.unsupported', 'mermaid.state.statement.unsupported',
      ]);
      expect(result.graph?.nodes.map(({ id }) => id)).toEqual(['A', 'B']);
      expect(result.graph?.edges).toHaveLength(1);
    });

    it('continues parsing statements after a single-line note without end note', () => {
      const result = parseMermaid('stateDiagram-v2\nnote right of A\nA --> B');
      expect(result.diagnostics.map(({ code }) => code)).toEqual(['mermaid.state.note.unsupported']);
      expect(result.graph?.edges).toHaveLength(1);
    });

    it('parses transition labels', () => {
      const result = parseMermaid(`stateDiagram-v2
    Still --> Moving: accelerate`);
      expect(result.graph?.edges[0].label).toBe('accelerate');
    });
  });

  describe('ER diagram parsing', () => {
    it('parses entities', () => {
      const result = parseMermaid(`erDiagram
    CUSTOMER {
      int id PK
      string name
    }`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({ id: 'CUSTOMER', type: 'database' });
      expect(result.graph?.nodes[0].properties?.attributes).toHaveLength(2);
      expect(result.graph?.metadata?.custom?.diagramType).toBe('er');
    });

    it('parses relationships', () => {
      const result = parseMermaid(`erDiagram
    CUSTOMER ||--o{ ORDER : places`);
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'CUSTOMER',
        target: 'ORDER',
        label: 'places',
        type: 'relationship',
      });
    });
  });

  describe('timeline parsing', () => {
    it('parses time periods', () => {
      const result = parseMermaid(`timeline
    2023 : Project started
    2024 : MVP released`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2);
      expect(result.graph?.metadata?.custom?.diagramType).toBe('timeline');
    });

    it('parses sections', () => {
      const result = parseMermaid(`timeline
    section Development
        2023 : Started`);
      expect(result.success).toBe(true);
      const section = result.graph?.nodes.find(n => n.type === 'group');
      expect(section?.children).toHaveLength(1);
    });
  });

  describe('block diagram parsing', () => {
    it('parses blocks', () => {
      const result = parseMermaid(`block-beta
    A["Block A"]`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({ id: 'A', label: 'Block A' });
      expect(result.graph?.metadata?.custom?.diagramType).toBe('block');
    });

    it('parses block edges', () => {
      const result = parseMermaid(`block-beta
    A["Block A"] --> B["Block B"]`);
      expect(result.success).toBe(true);
      expect(result.graph?.edges).toHaveLength(1);
    });
  });

  describe('packet diagram parsing', () => {
    it('parses range syntax', () => {
      const result = parseMermaid(`packet-beta
    0-15: "Header"
    16-31: "Payload"`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2);
      expect(result.graph?.nodes[0].properties).toMatchObject({
        bitStart: 0,
        bitEnd: 15,
        bitWidth: 16,
      });
      expect(result.graph?.metadata?.custom?.diagramType).toBe('packet');
    });

    it('parses relative syntax', () => {
      const result = parseMermaid(`packet-beta
    +8: "Version"
    +8: "Type"`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0].properties?.bitStart).toBe(0);
      expect(result.graph?.nodes[1].properties?.bitStart).toBe(8);
    });
  });

  describe('kanban parsing', () => {
    it('parses columns and tasks', () => {
      const result = parseMermaid(`kanban
    todo[Todo]
        task1[Write tests]
    done[Done]
        task2[Setup project]`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2); // 2 columns
      expect(result.graph?.nodes[0].children).toHaveLength(1);
      expect(result.graph?.nodes[1].children).toHaveLength(1);
      expect(result.graph?.metadata?.custom?.diagramType).toBe('kanban');
    });

    it('parses task metadata', () => {
      const result = parseMermaid(`kanban
    todo[Todo]
        task1[Fix bug]@{assigned: "John", priority: "High"}`);
      expect(result.success).toBe(true);
      const task = result.graph?.nodes[0].children?.[0];
      expect(task?.properties?.metadata).toMatchObject({
        assigned: 'John',
        priority: 'High',
      });
    });
  });

  describe('decision diamond labels remain distinct from semantic ports', () => {
    it('preserves a Yes label without inventing source or target ports', () => {
      const result = parseMermaid('flowchart TD\n    A{Decision} -->|Yes| B[Process]');
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
        label: 'Yes',
      });
      expect(result.graph?.edges[0].sourcePort).toBeUndefined();
      expect(result.graph?.edges[0].targetPort).toBeUndefined();
    });

    it('preserves a No label without inventing a port', () => {
      const result = parseMermaid('flowchart TD\n    A{Decision} -->|No| B[Process]');
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
        label: 'No',
      });
      expect(result.graph?.edges[0].sourcePort).toBeUndefined();
    });

    it('preserves differently cased labels without inferring ports', () => {
      const result = parseMermaid('flowchart TD\n    A{Decision} -->|yes| B\n    A -->|NO| C');
      expect(result.success).toBe(true);
      expect(result.graph?.edges.map(edge => edge.label)).toEqual(['yes', 'NO']);
      expect(result.graph?.edges.every(edge => edge.sourcePort === undefined)).toBe(true);
    });

    it('preserves other labels without inventing an alternate port', () => {
      const result = parseMermaid('flowchart TD\n    A{Decision} -->|Maybe| B[Process]');
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
        label: 'Maybe',
      });
      expect(result.graph?.edges[0].sourcePort).toBeUndefined();
    });

    it('does not set sourcePort for non-diamond source nodes', () => {
      const result = parseMermaid('flowchart TD\n    A[Process] -->|Yes| B[Process]');
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0].sourcePort).toBeUndefined();
    });

    it('does not infer an input port on a non-diamond target', () => {
      const result = parseMermaid('flowchart TD\n    A{Decision} -->|Yes| B[Process]');
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0].targetPort).toBeUndefined();
    });

    it('handles chained diamond edges', () => {
      const result = parseMermaid('flowchart TD\n    A{First} -->|Yes| B{Second} -->|No| C[End]');
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
      });
      expect(result.graph?.edges[0].sourcePort).toBeUndefined();
      expect(result.graph?.edges[1]).toMatchObject({
        source: 'B',
        target: 'C',
      });
      expect(result.graph?.edges[1].sourcePort).toBeUndefined();
      expect(result.graph?.edges[1].targetPort).toBeUndefined();
    });

    it('handles real-world Mermaid decision flowchart', () => {
      const mermaid = `flowchart TD
    Start[Start] --> Check{Is valid?}
    Check -->|Yes| Process[Process data]
    Check -->|No| Error[Show error]
    Process --> End[Done]
    Error --> End`;
      const result = parseMermaid(mermaid);
      expect(result.success).toBe(true);
      const yesEdge = result.graph?.edges.find(e => e.label === 'Yes');
      const noEdge = result.graph?.edges.find(e => e.label === 'No');
      expect(yesEdge?.sourcePort).toBeUndefined();
      expect(yesEdge?.targetPort).toBeUndefined();
      expect(noEdge?.sourcePort).toBeUndefined();
      expect(noEdge?.targetPort).toBeUndefined();
      // Non-decision edges should not have sourcePort
      const startEdge = result.graph?.edges.find(e => e.source === 'Start');
      expect(startEdge?.sourcePort).toBeUndefined();
    });

    it('does not reinterpret y, true, n, or false as ports', () => {
      const result = parseMermaid('flowchart TD\n    A{Check} -->|true| B\n    A -->|false| C\n    D{Other} -->|y| E\n    D -->|n| F');
      expect(result.success).toBe(true);
      expect(result.graph?.edges.map(edge => edge.label)).toEqual(['true', 'false', 'y', 'n']);
      expect(result.graph?.edges.every(edge => edge.sourcePort === undefined && edge.targetPort === undefined)).toBe(true);
    });
  });

  describe('architecture diagram parsing', () => {
    it('parses services', () => {
      const result = parseMermaid(`architecture-beta
    service api(server)[API Server]`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({
        id: 'api',
        type: 'service',
        label: 'API Server',
      });
      expect(result.graph?.nodes[0].properties?.icon).toBe('server');
      expect(result.graph?.metadata?.custom?.diagramType).toBe('architecture');
    });

    it('parses groups', () => {
      const result = parseMermaid(`architecture-beta
    group cloud(cloud)[Cloud Infrastructure]`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({
        id: 'cloud',
        type: 'group',
        label: 'Cloud Infrastructure',
      });
    });

    it('parses nested services', () => {
      const result = parseMermaid(`architecture-beta
    group cloud(cloud)[Cloud]
    service api(server)[API] in cloud`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0].children?.[0]).toMatchObject({
        id: 'api',
        parent: 'cloud',
      });
    });

    it('parses edges with sides', () => {
      const result = parseMermaid(`architecture-beta
    service api(server)[API]
    service db(database)[Database]
    api:R --> L:db`);
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0].properties).toMatchObject({
        sourceSide: 'R',
        targetSide: 'L',
      });
    });
  });
});
