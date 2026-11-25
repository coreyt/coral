/**
 * Single named source of truth for which Mermaid diagram types the harness
 * will actually run (Slice 49, aspect (b)). Slice 45 D07 approves flowchart
 * only. This gates fixture type, not every supported Mermaid construct or
 * production validation; those acceptance gates remain with Slices 47/48.
 */
export const MERMAID_ALLOWLIST: readonly string[] = ['flowchart'];
