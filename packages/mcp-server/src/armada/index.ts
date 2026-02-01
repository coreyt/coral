/**
 * Armada integration module
 *
 * Provides client and transformer for integrating Armada code understanding
 * capabilities with Coral diagram generation.
 */

export {
  ArmadaClient,
  createArmadaClient,
  type ArmadaClientConfig,
  type ArmadaTool,
  type ArmadaNode,
  type ArmadaEdge,
  type ContextResult,
  type DependencyResult,
  type ImpactResult,
  type TraceResult,
  type SearchResult,
} from "./client.js";

export {
  transformToIR,
  transformContextToIR,
  transformDependenciesToIR,
  transformImpactToIR,
  transformTraceToIR,
  type TransformOptions,
} from "./transformer.js";

export {
  IncrementalWatcher,
  createIncrementalWatcher,
  checkForUpdates,
  type IncrementalWatcherConfig,
  type IncrementalUpdateResult,
  type FileChangeEvent,
  type UpdateCallback,
} from "./incremental.js";
