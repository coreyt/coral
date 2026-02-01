/**
 * Tests for Armada integration (Phase 4)
 */

import { describe, it, expect } from "vitest";
import {
  transformContextToIR,
  transformDependenciesToIR,
  transformImpactToIR,
  transformTraceToIR,
} from "../src/armada/transformer.js";
import type {
  ContextResult,
  DependencyResult,
  ImpactResult,
  TraceResult,
  ArmadaNode,
  ArmadaEdge,
} from "../src/armada/client.js";

// Test fixtures
const mockNode = (id: string, type: string, name: string): ArmadaNode => ({
  id,
  type,
  name,
  path: `src/${name}.py`,
  language: "python",
});

const mockEdge = (source: string, target: string, type: string): ArmadaEdge => ({
  id: `${source}_${target}`,
  source,
  target,
  type,
});

describe("Armada Transformer", () => {
  describe("transformContextToIR", () => {
    it("should transform empty context result", () => {
      const result: ContextResult = {
        query: "test query",
        nodes: [],
        edges: [],
        confidence: 0,
      };

      const ir = transformContextToIR(result);

      expect(ir.version).toBe("1.0");
      expect(ir.nodes).toHaveLength(0);
      expect(ir.edges).toHaveLength(0);
      expect(ir.metadata?.description).toContain("test query");
    });

    it("should transform context with nodes and edges", () => {
      const result: ContextResult = {
        query: "authentication",
        scope: "src/auth",
        nodes: [
          mockNode("py:src/auth.py:AuthService", "class", "AuthService"),
          mockNode("py:src/auth.py:login", "function", "login"),
          mockNode("py:src/auth.py:verify_token", "function", "verify_token"),
        ],
        edges: [
          mockEdge("py:src/auth.py:AuthService", "py:src/auth.py:login", "calls"),
          mockEdge("py:src/auth.py:login", "py:src/auth.py:verify_token", "calls"),
        ],
        confidence: 0.95,
      };

      const ir = transformContextToIR(result);

      expect(ir.nodes.length).toBeGreaterThan(0);
      expect(ir.edges.length).toBeGreaterThan(0);
      expect(ir.metadata?.custom?.confidence).toBe(0.95);
    });

    it("should map Armada node types to Coral types", () => {
      const result: ContextResult = {
        query: "test",
        nodes: [
          mockNode("py:mod", "module", "mod"),
          mockNode("py:cls", "class", "cls"),
          mockNode("py:fn", "function", "fn"),
        ],
        edges: [],
        confidence: 1,
      };

      const ir = transformContextToIR(result, { groupBy: "none" });

      const types = ir.nodes.map((n) => n.type);
      expect(types).toContain("module");
      expect(types).toContain("service"); // class maps to service
    });

    it("should respect maxNodes option", () => {
      const nodes: ArmadaNode[] = [];
      for (let i = 0; i < 100; i++) {
        nodes.push(mockNode(`node_${i}`, "function", `func_${i}`));
      }

      const result: ContextResult = {
        query: "test",
        nodes,
        edges: [],
        confidence: 1,
      };

      const ir = transformContextToIR(result, { maxNodes: 10, groupBy: "none" });

      expect(ir.nodes).toHaveLength(10);
      expect(ir.metadata?.custom?.originalNodeCount).toBe(100);
    });

    it("should group nodes by module", () => {
      const result: ContextResult = {
        query: "test",
        nodes: [
          { ...mockNode("n1", "function", "func1"), path: "src/auth/login.py" },
          { ...mockNode("n2", "function", "func2"), path: "src/auth/verify.py" },
          { ...mockNode("n3", "function", "func3"), path: "src/users/create.py" },
        ],
        edges: [],
        confidence: 1,
      };

      const ir = transformContextToIR(result, { groupBy: "module" });

      // Should have group nodes
      const groupNodes = ir.nodes.filter((n) => n.type === "group");
      expect(groupNodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("transformDependenciesToIR", () => {
    it("should transform dependency result", () => {
      const result: DependencyResult = {
        symbol: "AuthService",
        direction: "downstream",
        nodes: [
          mockNode("py:auth", "class", "AuthService"),
          mockNode("py:user", "class", "UserService"),
        ],
        edges: [mockEdge("py:auth", "py:user", "calls")],
        depth: 2,
      };

      const ir = transformDependenciesToIR(result);

      expect(ir.name).toContain("AuthService");
      expect(ir.nodes.length).toBeGreaterThan(0);
      expect(ir.metadata?.custom?.direction).toBe("downstream");
    });

    it("should set layout direction based on dependency direction", () => {
      const upstreamResult: DependencyResult = {
        symbol: "test",
        direction: "upstream",
        nodes: [],
        edges: [],
        depth: 1,
      };

      const downstreamResult: DependencyResult = {
        symbol: "test",
        direction: "downstream",
        nodes: [],
        edges: [],
        depth: 1,
      };

      const upIR = transformDependenciesToIR(upstreamResult);
      const downIR = transformDependenciesToIR(downstreamResult);

      expect(upIR.layoutOptions?.direction).toBe("UP");
      expect(downIR.layoutOptions?.direction).toBe("DOWN");
    });
  });

  describe("transformImpactToIR", () => {
    it("should transform impact result", () => {
      const result: ImpactResult = {
        file: "src/auth.py",
        symbol: "login",
        impacted_nodes: [
          mockNode("py:auth", "function", "login"),
          mockNode("py:user", "function", "get_user"),
          mockNode("py:session", "function", "create_session"),
        ],
        impacted_edges: [
          mockEdge("py:auth", "py:user", "calls"),
          mockEdge("py:auth", "py:session", "calls"),
        ],
        blast_radius: 3,
      };

      const ir = transformImpactToIR(result);

      expect(ir.name).toContain("src/auth.py");
      expect(ir.metadata?.custom?.blastRadius).toBe(3);
      expect(ir.layoutOptions?.algorithm).toBe("radial");
    });

    it("should mark nodes as impacted", () => {
      const result: ImpactResult = {
        file: "test.py",
        impacted_nodes: [mockNode("n1", "function", "test")],
        impacted_edges: [],
        blast_radius: 1,
      };

      const ir = transformImpactToIR(result, { groupBy: "none" });

      expect(ir.nodes[0].properties?.impacted).toBe(true);
    });
  });

  describe("transformTraceToIR", () => {
    it("should transform trace result with paths", () => {
      const result: TraceResult = {
        source: "handleRequest",
        target: "saveToDb",
        paths: [
          {
            nodes: ["handleRequest", "processData", "saveToDb"],
            edges: [
              mockEdge("handleRequest", "processData", "calls"),
              mockEdge("processData", "saveToDb", "calls"),
            ],
          },
        ],
        found: true,
      };

      const ir = transformTraceToIR(result);

      expect(ir.name).toContain("handleRequest");
      expect(ir.name).toContain("saveToDb");
      expect(ir.nodes).toHaveLength(3);
      expect(ir.edges).toHaveLength(2);
      expect(ir.metadata?.custom?.found).toBe(true);
    });

    it("should handle trace with no paths found", () => {
      const result: TraceResult = {
        source: "a",
        target: "b",
        paths: [],
        found: false,
      };

      const ir = transformTraceToIR(result);

      expect(ir.nodes).toHaveLength(0);
      expect(ir.edges).toHaveLength(0);
      expect(ir.metadata?.custom?.found).toBe(false);
    });

    it("should use RIGHT direction for trace layout", () => {
      const result: TraceResult = {
        source: "a",
        target: "b",
        paths: [],
        found: false,
      };

      const ir = transformTraceToIR(result);

      expect(ir.layoutOptions?.direction).toBe("RIGHT");
    });
  });

  describe("Edge filtering", () => {
    it("should filter edges to only valid source/target", () => {
      const result: ContextResult = {
        query: "test",
        nodes: [mockNode("n1", "function", "func1")],
        edges: [
          mockEdge("n1", "n2", "calls"), // n2 doesn't exist
          mockEdge("n3", "n1", "calls"), // n3 doesn't exist
        ],
        confidence: 1,
      };

      const ir = transformContextToIR(result, { groupBy: "none" });

      expect(ir.edges).toHaveLength(0);
    });
  });

  describe("Edge type mapping", () => {
    it("should map Armada edge types to Coral relations", () => {
      const result: ContextResult = {
        query: "test",
        nodes: [
          mockNode("n1", "class", "Parent"),
          mockNode("n2", "class", "Child"),
        ],
        edges: [mockEdge("n2", "n1", "inherits")],
        confidence: 1,
      };

      const ir = transformContextToIR(result, { groupBy: "none" });

      expect(ir.edges[0].type).toBe("extends");
    });
  });
});
