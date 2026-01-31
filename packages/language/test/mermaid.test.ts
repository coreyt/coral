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
  });

  describe('sequence diagram parsing', () => {
    it('parses participants', () => {
      const result = parseMermaid(`sequenceDiagram
    participant A
    participant B`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2);
      expect(result.graph?.metadata?.custom?.diagramType).toBe('sequence');
    });

    it('parses actors', () => {
      const result = parseMermaid(`sequenceDiagram
    actor User`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({ id: 'User', type: 'actor' });
    });

    it('parses messages', () => {
      const result = parseMermaid(`sequenceDiagram
    A->>B: Hello`);
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
        label: 'Hello',
        type: 'message',
      });
    });

    it('parses dashed messages', () => {
      const result = parseMermaid(`sequenceDiagram
    A-->>B: Response`);
      expect(result.success).toBe(true);
      expect(result.graph?.edges[0].style?.lineStyle).toBe('dashed');
    });
  });

  describe('class diagram parsing', () => {
    it('parses simple class', () => {
      const result = parseMermaid(`classDiagram
    class Animal`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0]).toMatchObject({ id: 'Animal', type: 'module' });
      expect(result.graph?.metadata?.custom?.diagramType).toBe('class');
    });

    it('parses class with body', () => {
      const result = parseMermaid(`classDiagram
    class Animal {
      +String name
      +eat()
    }`);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes[0].properties?.members).toHaveLength(2);
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
      expect(result.graph?.nodes.find(n => n.id === '_start_')).toBeDefined();
      expect(result.graph?.nodes.find(n => n.id === '_end_')).toBeDefined();
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
