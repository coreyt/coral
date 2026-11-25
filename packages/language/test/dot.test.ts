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

  describe('unterminated strings', () => {
    it('reports error for unterminated quoted string', () => {
      const source = `
digraph G {
    A [label="unclosed];
    A -> B;
}
`;
      const result = parseDot(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Unterminated');
    });
  });

  describe('escape sequences', () => {
    it('handles escaped quotes in labels', () => {
      const source = `
digraph G {
    A [label="He said \\"Hi\\""];
}
`;
      const result = parseDot(source);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes.find(n => n.id === 'A')?.label).toBe('He said "Hi"');
    });

    it('handles escaped backslash before quote', () => {
      const source = `
digraph G {
    A [label="path\\\\"];
}
`;
      const result = parseDot(source);
      expect(result.success).toBe(true);
      // DOT source has path\\\\ which is two escaped backslashes → path\\
      expect(result.graph?.nodes.find(n => n.id === 'A')?.label).toBe('path\\');
    });
  });

  describe('comments', () => {
    it('ignores line comments', () => {
      const source = `
digraph G {
    // this is a comment
    A -> B;
}
`;
      const result = parseDot(source);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2);
      expect(result.graph?.edges).toHaveLength(1);
    });

    it('ignores block comments', () => {
      const source = `
digraph G {
    /* multi-line
       block comment */
    A -> B;
}
`;
      const result = parseDot(source);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(2);
      expect(result.graph?.edges).toHaveLength(1);
    });

    it('handles comment before graph keyword', () => {
      const source = `// header comment
digraph G {
    A;
}
`;
      const result = parseDot(source);
      expect(result.success).toBe(true);
      expect(result.graph?.nodes).toHaveLength(1);
    });
  });
});

describe('R-009 AC-8: DOT recovery and positions', () => {
  it('reports an out-of-input failure at the token it reached, not line 1', () => {
    const result = parseDot('digraph G {\n  a -> b;\n  c ->\n');

    expect(result.success).toBe(false);
    expect(result.errors[0].line).toBeGreaterThan(1);
    expect(result.errors[0].code).toBe('dot.input.unparsed');
  });

  it('keeps the statements completed before the failure', () => {
    const result = parseDot('digraph G {\n  a -> b;\n  c ->\n');

    expect(result.graph).toBeDefined();
    expect(result.graph!.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('reports a stray token instead of turning it into a node', () => {
    const result = parseDot('digraph G {\n a -> b;\n ;\n b -> c;\n}');

    expect(result.graph!.nodes.map((n) => n.id)).not.toContain(';');
    expect(result.diagnostics.some((d) => d.code === 'dot.token.unparsed')).toBe(true);
  });

  it('positions a diagnostic past a comment correctly', () => {
    const result = parseDot('digraph G {\n  // a comment\n  a -> b;\n  ;\n}');
    const stray = result.diagnostics.find((d) => d.code === 'dot.token.unparsed');

    expect(stray).toBeDefined();
    expect(stray!.position.line).toBe(4);
  });
});
