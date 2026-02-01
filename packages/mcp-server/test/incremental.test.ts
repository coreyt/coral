/**
 * Tests for Incremental Update System (CORAL-REQ-005)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  IncrementalWatcher,
  checkForUpdates,
  type IncrementalWatcherConfig,
  type ArmadaNode,
  type ArmadaEdge,
  type IncrementalUpdateResult,
} from "../src/armada/index.js";

// Mock the ArmadaClient
vi.mock("../src/armada/client.js", () => ({
  ArmadaClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    impactOf: vi.fn().mockImplementation((file: string) => {
      // Return different results based on file
      if (file.includes("changed.ts")) {
        return Promise.resolve({
          file,
          impacted_nodes: [
            {
              id: "node-1",
              type: "function",
              name: "changedFunction",
              path: file,
              language: "typescript",
            },
          ],
          impacted_edges: [],
          blast_radius: 1,
        });
      }
      return Promise.resolve({
        file,
        impacted_nodes: [],
        impacted_edges: [],
        blast_radius: 0,
      });
    }),
  })),
  createArmadaClient: vi.fn(),
}));

describe("IncrementalWatcher", () => {
  const defaultConfig: IncrementalWatcherConfig = {
    rootDir: "/test/project",
    debounceMs: 10,
  };

  describe("constructor", () => {
    it("should create watcher with default config", () => {
      const watcher = new IncrementalWatcher(defaultConfig);
      expect(watcher).toBeInstanceOf(IncrementalWatcher);
      expect(watcher.isRunning()).toBe(false);
    });

    it("should apply custom patterns", () => {
      const watcher = new IncrementalWatcher({
        ...defaultConfig,
        patterns: ["**/*.custom"],
        ignore: ["**/custom_ignore/**"],
      });
      expect(watcher).toBeInstanceOf(IncrementalWatcher);
    });
  });

  describe("setBaseline", () => {
    it("should set baseline nodes and edges", () => {
      const watcher = new IncrementalWatcher(defaultConfig);

      const nodes: ArmadaNode[] = [
        { id: "n1", type: "function", name: "foo", path: "/test/foo.ts", language: "typescript" },
        { id: "n2", type: "class", name: "Bar", path: "/test/bar.ts", language: "typescript" },
      ];

      const edges: ArmadaEdge[] = [
        { id: "e1", source: "n1", target: "n2", type: "calls" },
      ];

      // Should not throw
      watcher.setBaseline(nodes, edges);
    });
  });

  describe("onUpdate", () => {
    it("should register callback and return unsubscribe function", () => {
      const watcher = new IncrementalWatcher(defaultConfig);
      const callback = vi.fn();

      const unsubscribe = watcher.onUpdate(callback);

      expect(typeof unsubscribe).toBe("function");

      // Calling unsubscribe should not throw
      unsubscribe();
    });
  });
});

describe("checkForUpdates", () => {
  // Create a mock client
  const createMockClient = (impactResults: Map<string, { nodes: ArmadaNode[]; edges: ArmadaEdge[] }>) => ({
    impactOf: vi.fn().mockImplementation((file: string) => {
      const result = impactResults.get(file) || { nodes: [], edges: [] };
      return Promise.resolve({
        file,
        impacted_nodes: result.nodes,
        impacted_edges: result.edges,
        blast_radius: result.nodes.length,
      });
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    getContext: vi.fn(),
    findDependencies: vi.fn(),
    search: vi.fn(),
    traceCalls: vi.fn(),
  });

  describe("detecting added nodes", () => {
    it("should detect new nodes from changed files", async () => {
      const impactResults = new Map([
        [
          "/test/new.ts",
          {
            nodes: [
              { id: "new-1", type: "function", name: "newFn", path: "/test/new.ts", language: "typescript" },
            ],
            edges: [],
          },
        ],
      ]);

      const client = createMockClient(impactResults) as any;
      const lastKnownNodes: ArmadaNode[] = [];
      const lastKnownEdges: ArmadaEdge[] = [];

      const result = await checkForUpdates(
        client,
        ["/test/new.ts"],
        lastKnownNodes,
        lastKnownEdges
      );

      expect(result.updated).toBe(true);
      expect(result.addedNodes).toContain("new-1");
      expect(result.removedNodes).toHaveLength(0);
      expect(result.modifiedNodes).toHaveLength(0);
    });
  });

  describe("detecting removed nodes", () => {
    it("should detect removed nodes", async () => {
      const impactResults = new Map<string, { nodes: ArmadaNode[]; edges: ArmadaEdge[] }>();
      // No impact results means the file/node was removed

      const client = createMockClient(impactResults) as any;
      const lastKnownNodes: ArmadaNode[] = [
        { id: "deleted-1", type: "function", name: "oldFn", path: "/test/old.ts", language: "typescript" },
      ];
      const lastKnownEdges: ArmadaEdge[] = [];

      const result = await checkForUpdates(
        client,
        ["/test/old.ts"],
        lastKnownNodes,
        lastKnownEdges
      );

      expect(result.updated).toBe(true);
      expect(result.removedNodes).toContain("deleted-1");
      expect(result.addedNodes).toHaveLength(0);
    });
  });

  describe("detecting modified nodes", () => {
    it("should detect modified nodes", async () => {
      const impactResults = new Map([
        [
          "/test/modified.ts",
          {
            nodes: [
              {
                id: "mod-1",
                type: "function",
                name: "modifiedFn",
                path: "/test/modified.ts",
                language: "typescript",
                signature: "modifiedFn(a: number): string", // Changed signature
              },
            ],
            edges: [],
          },
        ],
      ]);

      const client = createMockClient(impactResults) as any;
      const lastKnownNodes: ArmadaNode[] = [
        {
          id: "mod-1",
          type: "function",
          name: "modifiedFn",
          path: "/test/modified.ts",
          language: "typescript",
          signature: "modifiedFn(): void", // Original signature
        },
      ];
      const lastKnownEdges: ArmadaEdge[] = [];

      const result = await checkForUpdates(
        client,
        ["/test/modified.ts"],
        lastKnownNodes,
        lastKnownEdges
      );

      expect(result.updated).toBe(true);
      expect(result.modifiedNodes).toContain("mod-1");
    });
  });

  describe("no changes", () => {
    it("should return updated=false when nothing changed", async () => {
      const existingNode: ArmadaNode = {
        id: "same-1",
        type: "function",
        name: "sameFn",
        path: "/test/same.ts",
        language: "typescript",
      };

      const impactResults = new Map([
        [
          "/test/same.ts",
          {
            nodes: [existingNode],
            edges: [],
          },
        ],
      ]);

      const client = createMockClient(impactResults) as any;

      const result = await checkForUpdates(
        client,
        ["/test/same.ts"],
        [existingNode],
        []
      );

      expect(result.updated).toBe(false);
      expect(result.addedNodes).toHaveLength(0);
      expect(result.removedNodes).toHaveLength(0);
      expect(result.modifiedNodes).toHaveLength(0);
    });
  });

  describe("graphIR generation", () => {
    it("should generate Graph-IR when updates detected", async () => {
      const impactResults = new Map([
        [
          "/test/new.ts",
          {
            nodes: [
              { id: "new-1", type: "function", name: "newFn", path: "/test/new.ts", language: "typescript" },
            ],
            edges: [],
          },
        ],
      ]);

      const client = createMockClient(impactResults) as any;

      const result = await checkForUpdates(
        client,
        ["/test/new.ts"],
        [],
        []
      );

      expect(result.updated).toBe(true);
      expect(result.graphIR).toBeDefined();
      expect(result.graphIR?.nodes).toHaveLength(1);
    });

    it("should not generate Graph-IR when no updates", async () => {
      const existingNode: ArmadaNode = {
        id: "same-1",
        type: "function",
        name: "sameFn",
        path: "/test/same.ts",
        language: "typescript",
      };

      const impactResults = new Map([
        ["/test/same.ts", { nodes: [existingNode], edges: [] }],
      ]);

      const client = createMockClient(impactResults) as any;

      const result = await checkForUpdates(
        client,
        ["/test/same.ts"],
        [existingNode],
        []
      );

      expect(result.updated).toBe(false);
      expect(result.graphIR).toBeUndefined();
    });
  });

  describe("multiple file changes", () => {
    it("should handle multiple changed files", async () => {
      const impactResults = new Map([
        [
          "/test/file1.ts",
          {
            nodes: [
              { id: "f1-1", type: "function", name: "fn1", path: "/test/file1.ts", language: "typescript" },
            ],
            edges: [],
          },
        ],
        [
          "/test/file2.ts",
          {
            nodes: [
              { id: "f2-1", type: "class", name: "Class1", path: "/test/file2.ts", language: "typescript" },
            ],
            edges: [],
          },
        ],
      ]);

      const client = createMockClient(impactResults) as any;

      const result = await checkForUpdates(
        client,
        ["/test/file1.ts", "/test/file2.ts"],
        [],
        []
      );

      expect(result.updated).toBe(true);
      expect(result.addedNodes).toContain("f1-1");
      expect(result.addedNodes).toContain("f2-1");
      expect(result.changedFiles).toHaveLength(2);
    });
  });

  describe("edge handling", () => {
    it("should include edges in Graph-IR", async () => {
      const impactResults = new Map([
        [
          "/test/connected.ts",
          {
            nodes: [
              { id: "n1", type: "function", name: "caller", path: "/test/connected.ts", language: "typescript" },
              { id: "n2", type: "function", name: "callee", path: "/test/connected.ts", language: "typescript" },
            ],
            edges: [
              { id: "e1", source: "n1", target: "n2", type: "calls" },
            ],
          },
        ],
      ]);

      const client = createMockClient(impactResults) as any;

      const result = await checkForUpdates(
        client,
        ["/test/connected.ts"],
        [],
        []
      );

      expect(result.graphIR?.edges).toHaveLength(1);
      expect(result.graphIR?.edges[0].source).toBe("n1");
      expect(result.graphIR?.edges[0].target).toBe("n2");
    });
  });

  describe("timestamp", () => {
    it("should include timestamp in result", async () => {
      const client = createMockClient(new Map()) as any;
      const before = Date.now();

      const result = await checkForUpdates(client, [], [], []);

      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });
});

describe("IncrementalUpdateResult", () => {
  it("should have correct shape", () => {
    const result: IncrementalUpdateResult = {
      updated: true,
      changedFiles: ["/test/file.ts"],
      addedNodes: ["n1"],
      removedNodes: ["n2"],
      modifiedNodes: ["n3"],
      timestamp: Date.now(),
    };

    expect(result.updated).toBe(true);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.addedNodes).toHaveLength(1);
    expect(result.removedNodes).toHaveLength(1);
    expect(result.modifiedNodes).toHaveLength(1);
  });
});
