/**
 * Incremental Update System (CORAL-REQ-005)
 *
 * Provides change detection and incremental diagram updates
 * when codebase files change. Uses Armada's impact analysis
 * to determine what needs updating.
 */

import { watch, type FSWatcher } from 'fs';
import { resolve, relative } from 'path';
import { ArmadaClient, type ArmadaNode, type ArmadaEdge } from './client.js';
import type { GraphIR, GraphNode, GraphEdge } from '../types.js';

/**
 * Options for transforming Armada data to Graph-IR
 */
export interface TransformerOptions {
  /** Include source file information in node metadata */
  includeSourceInfo?: boolean;
  /** Group nodes by file or module */
  groupBy?: 'file' | 'module' | 'language' | 'none';
  /** Maximum nodes to include (for large results) */
  maxNodes?: number;
  /** Layout algorithm preference */
  layout?: 'layered' | 'radial' | 'force' | 'tree';
  /** Layout direction */
  direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
}

/**
 * Map Armada node types to Coral node types
 */
const ARMADA_TO_CORAL_TYPE: Record<string, string> = {
  module: 'module',
  class: 'service',
  function: 'service',
  method: 'service',
  interface: 'service',
  type_alias: 'service',
  struct: 'service',
  file: 'module',
  package: 'group',
  directory: 'group',
};

/**
 * Map Armada edge types to Coral relation types
 */
const ARMADA_TO_CORAL_RELATION: Record<string, string> = {
  imports: 'dependency',
  calls: 'http_request',
  inherits: 'extends',
  extends: 'extends',
  implements: 'implements',
  exports: 'dependency',
  belongs_to: 'contains',
  embeds: 'contains',
};

/**
 * Transform raw Armada nodes and edges to Graph-IR
 */
function transformRawToIR(
  nodes: ArmadaNode[],
  edges: ArmadaEdge[],
  options: TransformerOptions = {}
): GraphIR {
  const graphNodes: GraphNode[] = nodes.map((node) => ({
    id: node.id,
    type: ARMADA_TO_CORAL_TYPE[node.type] || 'service',
    label: node.name,
    properties: {
      language: node.language,
      path: node.path,
      armadaType: node.type,
      ...(node.signature && { signature: node.signature }),
      ...(node.docstring && { docstring: node.docstring }),
    },
  }));

  const graphEdges: GraphEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    relation: ARMADA_TO_CORAL_RELATION[edge.type] || 'dependency',
    properties: edge.metadata,
  }));

  return {
    id: `incremental_${Date.now()}`,
    name: 'Incremental Update',
    nodes: graphNodes,
    edges: graphEdges,
    metadata: {
      description: 'Incremental diagram update',
      custom: {
        source: 'armada-incremental',
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
    },
    layoutOptions: {
      algorithm: options.layout || 'layered',
      direction: options.direction || 'DOWN',
    },
  };
}

/**
 * File change event
 */
export interface FileChangeEvent {
  /** Type of change */
  type: 'add' | 'change' | 'unlink';
  /** Absolute path to the changed file */
  path: string;
  /** Relative path from watched directory */
  relativePath: string;
  /** Timestamp of the change */
  timestamp: number;
}

/**
 * Diagram update result from incremental change
 */
export interface IncrementalUpdateResult {
  /** Whether an update occurred */
  updated: boolean;
  /** Files that changed */
  changedFiles: string[];
  /** Nodes that were added */
  addedNodes: string[];
  /** Nodes that were removed */
  removedNodes: string[];
  /** Nodes that were modified */
  modifiedNodes: string[];
  /** New Graph-IR if updated */
  graphIR?: GraphIR;
  /** Timestamp of the update */
  timestamp: number;
}

/**
 * Configuration for incremental watcher
 */
export interface IncrementalWatcherConfig {
  /** Root directory to watch */
  rootDir: string;
  /** File patterns to watch (glob patterns) */
  patterns?: string[];
  /** File patterns to ignore */
  ignore?: string[];
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Armada client configuration */
  armadaConfig?: {
    serverCommand?: string;
    serverArgs?: string[];
  };
  /** Transformer options for generating IR */
  transformerOptions?: TransformerOptions;
}

/**
 * Callback for diagram updates
 */
export type UpdateCallback = (result: IncrementalUpdateResult) => void | Promise<void>;

/**
 * Default patterns for code files to watch
 */
const DEFAULT_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.py',
  '**/*.go',
  '**/*.rs',
  '**/*.java',
  '**/*.kt',
  '**/*.swift',
  '**/*.c',
  '**/*.cpp',
  '**/*.h',
  '**/*.hpp',
];

/**
 * Default patterns to ignore
 */
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/__pycache__/**',
  '**/.venv/**',
];

/**
 * Incremental watcher for file changes
 *
 * Monitors a directory for file changes and triggers
 * diagram updates using Armada impact analysis.
 */
export class IncrementalWatcher {
  private config: Required<IncrementalWatcherConfig>;
  private watcher: FSWatcher | null = null;
  private client: ArmadaClient | null = null;
  private callbacks: Set<UpdateCallback> = new Set();
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastKnownNodes: Map<string, ArmadaNode> = new Map();
  private lastKnownEdges: Map<string, ArmadaEdge> = new Map();
  private running = false;

  constructor(config: IncrementalWatcherConfig) {
    this.config = {
      rootDir: resolve(config.rootDir),
      patterns: config.patterns || DEFAULT_PATTERNS,
      ignore: config.ignore || DEFAULT_IGNORE,
      debounceMs: config.debounceMs ?? 500,
      armadaConfig: config.armadaConfig || {},
      transformerOptions: config.transformerOptions || {},
    };
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Create Armada client
    this.client = new ArmadaClient(this.config.armadaConfig);
    await this.client.connect();

    // Start file watcher
    this.watcher = watch(
      this.config.rootDir,
      { recursive: true },
      (eventType, filename) => {
        if (filename) {
          this.handleFileChange(eventType, filename);
        }
      }
    );

    this.running = true;
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }

    this.running = false;
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Register a callback for diagram updates
   */
  onUpdate(callback: UpdateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Set the baseline graph state (for diffing)
   */
  setBaseline(nodes: ArmadaNode[], edges: ArmadaEdge[]): void {
    this.lastKnownNodes.clear();
    this.lastKnownEdges.clear();

    for (const node of nodes) {
      this.lastKnownNodes.set(node.id, node);
    }

    for (const edge of edges) {
      this.lastKnownEdges.set(edge.id, edge);
    }
  }

  /**
   * Handle a file change event
   */
  private handleFileChange(eventType: string, filename: string): void {
    const absolutePath = resolve(this.config.rootDir, filename);
    const relativePath = relative(this.config.rootDir, absolutePath);

    // Check if file matches patterns
    if (!this.matchesPatterns(relativePath)) {
      return;
    }

    // Check if file should be ignored
    if (this.shouldIgnore(relativePath)) {
      return;
    }

    // Record the change
    const changeType = eventType === 'rename' ? 'add' : 'change';
    this.pendingChanges.set(absolutePath, {
      type: changeType,
      path: absolutePath,
      relativePath,
      timestamp: Date.now(),
    });

    // Debounce processing
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.config.debounceMs);
  }

  /**
   * Check if a path matches watched patterns
   */
  private matchesPatterns(path: string): boolean {
    // Simple extension-based matching for now
    const extension = path.split('.').pop()?.toLowerCase();
    if (!extension) return false;

    const watchedExtensions = new Set([
      'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs',
      'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
    ]);

    return watchedExtensions.has(extension);
  }

  /**
   * Check if a path should be ignored
   */
  private shouldIgnore(path: string): boolean {
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'target', '__pycache__', '.venv'];
    return ignoreDirs.some((dir) => path.includes(`/${dir}/`) || path.startsWith(`${dir}/`));
  }

  /**
   * Process accumulated file changes
   */
  private async processPendingChanges(): Promise<void> {
    if (!this.client || this.pendingChanges.size === 0) {
      return;
    }

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    try {
      // Get impact analysis for all changed files
      const allImpactedNodes = new Map<string, ArmadaNode>();
      const allImpactedEdges = new Map<string, ArmadaEdge>();

      for (const change of changes) {
        try {
          const impact = await this.client.impactOf(change.path);

          for (const node of impact.impacted_nodes) {
            allImpactedNodes.set(node.id, node);
          }

          for (const edge of impact.impacted_edges) {
            allImpactedEdges.set(edge.id, edge);
          }
        } catch (error) {
          // File might have been deleted or not indexed yet
          console.warn(`Could not get impact for ${change.path}:`, error);
        }
      }

      // Compare with baseline to find added/removed/modified nodes
      const result = this.computeDiff(
        Array.from(allImpactedNodes.values()),
        Array.from(allImpactedEdges.values()),
        changes
      );

      // Notify callbacks
      for (const callback of this.callbacks) {
        try {
          await callback(result);
        } catch (error) {
          console.error('Error in update callback:', error);
        }
      }

      // Update baseline with new state
      if (result.updated) {
        for (const node of allImpactedNodes.values()) {
          this.lastKnownNodes.set(node.id, node);
        }
        for (const edge of allImpactedEdges.values()) {
          this.lastKnownEdges.set(edge.id, edge);
        }
      }
    } catch (error) {
      console.error('Error processing file changes:', error);
    }
  }

  /**
   * Compute diff between current and new state
   */
  private computeDiff(
    newNodes: ArmadaNode[],
    newEdges: ArmadaEdge[],
    changes: FileChangeEvent[]
  ): IncrementalUpdateResult {
    const newNodeIds = new Set(newNodes.map((n) => n.id));
    const oldNodeIds = new Set(this.lastKnownNodes.keys());

    // Find added nodes
    const addedNodes = newNodes
      .filter((n) => !oldNodeIds.has(n.id))
      .map((n) => n.id);

    // Find removed nodes
    const removedNodes = Array.from(oldNodeIds)
      .filter((id) => !newNodeIds.has(id));

    // Find modified nodes (same ID, different content)
    const modifiedNodes: string[] = [];
    for (const node of newNodes) {
      const oldNode = this.lastKnownNodes.get(node.id);
      if (oldNode && !this.nodesEqual(oldNode, node)) {
        modifiedNodes.push(node.id);
      }
    }

    const updated = addedNodes.length > 0 || removedNodes.length > 0 || modifiedNodes.length > 0;

    // Generate new Graph-IR if there were changes
    let graphIR: GraphIR | undefined;
    if (updated) {
      graphIR = transformRawToIR(
        newNodes,
        newEdges,
        this.config.transformerOptions
      );
    }

    return {
      updated,
      changedFiles: changes.map((c) => c.relativePath),
      addedNodes,
      removedNodes,
      modifiedNodes,
      graphIR,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if two nodes are equal
   */
  private nodesEqual(a: ArmadaNode, b: ArmadaNode): boolean {
    return (
      a.type === b.type &&
      a.name === b.name &&
      a.path === b.path &&
      a.signature === b.signature &&
      a.docstring === b.docstring
    );
  }
}

/**
 * Create an incremental watcher and start it
 */
export async function createIncrementalWatcher(
  config: IncrementalWatcherConfig
): Promise<IncrementalWatcher> {
  const watcher = new IncrementalWatcher(config);
  await watcher.start();
  return watcher;
}

/**
 * Manual trigger for incremental update
 *
 * Use this when you want to check for changes without
 * setting up a file watcher (e.g., on command).
 */
export async function checkForUpdates(
  client: ArmadaClient,
  changedFiles: string[],
  lastKnownNodes: ArmadaNode[],
  lastKnownEdges: ArmadaEdge[],
  transformerOptions?: TransformerOptions
): Promise<IncrementalUpdateResult> {
  const allImpactedNodes = new Map<string, ArmadaNode>();
  const allImpactedEdges = new Map<string, ArmadaEdge>();

  for (const file of changedFiles) {
    try {
      const impact = await client.impactOf(file);

      for (const node of impact.impacted_nodes) {
        allImpactedNodes.set(node.id, node);
      }

      for (const edge of impact.impacted_edges) {
        allImpactedEdges.set(edge.id, edge);
      }
    } catch (error) {
      console.warn(`Could not get impact for ${file}:`, error);
    }
  }

  // Build last known maps
  const lastKnownNodeMap = new Map(lastKnownNodes.map((n) => [n.id, n]));
  const newNodes = Array.from(allImpactedNodes.values());
  const newEdges = Array.from(allImpactedEdges.values());

  const newNodeIds = new Set(newNodes.map((n) => n.id));
  const oldNodeIds = new Set(lastKnownNodeMap.keys());

  const addedNodes = newNodes
    .filter((n) => !oldNodeIds.has(n.id))
    .map((n) => n.id);

  const removedNodes = Array.from(oldNodeIds)
    .filter((id) => !newNodeIds.has(id));

  const modifiedNodes: string[] = [];
  for (const node of newNodes) {
    const oldNode = lastKnownNodeMap.get(node.id);
    if (oldNode) {
      const equal =
        oldNode.type === node.type &&
        oldNode.name === node.name &&
        oldNode.path === node.path &&
        oldNode.signature === node.signature &&
        oldNode.docstring === node.docstring;
      if (!equal) {
        modifiedNodes.push(node.id);
      }
    }
  }

  const updated = addedNodes.length > 0 || removedNodes.length > 0 || modifiedNodes.length > 0;

  let graphIR: GraphIR | undefined;
  if (updated) {
    graphIR = transformRawToIR(
      newNodes,
      newEdges,
      transformerOptions
    );
  }

  return {
    updated,
    changedFiles,
    addedNodes,
    removedNodes,
    modifiedNodes,
    graphIR,
    timestamp: Date.now(),
  };
}
