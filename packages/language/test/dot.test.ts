import { describe, it, expect } from 'vitest';
import { parseDot } from '../src/formats/dot.js';

describe('DOT Importer', () => {
  describe('digraph parsing', () => {
    it('parses a simple digraph', () => {
      const source = `
digraph G {
    A -> B;
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2);
      expect(result.graph?.edges).toHaveLength(1);
    });

    it('parses nodes with labels', () => {
      const source = `
digraph G {
    A [label="Web App"];
    B [label="API Gateway"];
    A -> B;
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes.find(n => n.id === 'A')).toMatchObject({
        id: 'A',
        label: 'Web App',
      });
    });

    it('parses node shapes to types', () => {
      const source = `
digraph G {
    db [shape=cylinder, label="Database"];
    svc [shape=box, label="Service"];
    user [shape=ellipse, label="User"];
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes.find(n => n.id === 'db')?.type).toBe('database');
      expect(result.graph?.nodes.find(n => n.id === 'svc')?.type).toBe('service');
      expect(result.graph?.nodes.find(n => n.id === 'user')?.type).toBe('actor');
    });

    it('parses edge labels', () => {
      const source = `
digraph G {
    A -> B [label="HTTP Request"];
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
        label: 'HTTP Request',
      });
    });

    it('parses multiple edges from one statement', () => {
      const source = `
digraph G {
    A -> B -> C;
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.edges).toHaveLength(2);
      expect(result.graph?.edges[0]).toMatchObject({ source: 'A', target: 'B' });
      expect(result.graph?.edges[1]).toMatchObject({ source: 'B', target: 'C' });
    });

    it('uses graph name as ID', () => {
      const source = `
digraph MyArchitecture {
    A -> B;
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.id).toBe('MyArchitecture');
    });
  });

  describe('undirected graph', () => {
    it('parses graph (undirected)', () => {
      const source = `
graph G {
    A -- B;
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.edges).toHaveLength(1);
    });
  });

  describe('subgraph/cluster parsing', () => {
    it('parses clusters as groups', () => {
      const source = `
digraph G {
    subgraph cluster_backend {
        label = "Backend";
        A;
        B;
    }
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      const backend = result.graph?.nodes.find(n => n.id === 'cluster_backend');
      expect(backend).toBeDefined();
      expect(backend?.type).toBe('group');
      expect(backend?.label).toBe('Backend');
      expect(backend?.children).toHaveLength(2);
    });
  });

  describe('graph attributes', () => {
    it('parses rankdir as layout direction', () => {
      const source = `
digraph G {
    rankdir=LR;
    A -> B;
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.layoutOptions?.direction).toBe('RIGHT');
    });

    it('parses rankdir TB', () => {
      const source = `
digraph G {
    rankdir=TB;
    A -> B;
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.layoutOptions?.direction).toBe('DOWN');
    });
  });

  describe('edge styles', () => {
    it('parses dashed edge style', () => {
      const source = `
digraph G {
    A -> B [style=dashed];
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.edges[0].style?.lineStyle).toBe('dashed');
    });

    it('parses dotted edge style', () => {
      const source = `
digraph G {
    A -> B [style=dotted];
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.edges[0].style?.lineStyle).toBe('dotted');
    });
  });

  describe('error handling', () => {
    it('handles empty input', () => {
      const result = parseDot('');

      expect(result.success).toBe(false);
    });

    it('handles malformed input', () => {
      const result = parseDot('not valid dot');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('quoted identifiers', () => {
    it('parses quoted node IDs', () => {
      const source = `
digraph G {
    "web-app" -> "api-gateway";
}
`;
      const result = parseDot(source);

      expect(result.success).toBe(true);
      expect(result.graph?.nodes.map(n => n.id)).toContain('web-app');
    });
  });
});
