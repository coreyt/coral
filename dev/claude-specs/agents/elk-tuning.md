# ELK Tuning Agent

## Summary

Automatically experiments with ELK layout engine configurations to find optimal settings for a given diagram. ELK has 100+ configuration options; this agent systematically explores the parameter space to minimize edge crossings, improve readability, and match user preferences.

## Value Proposition

- **Reduces manual tuning**: Users don't need to learn ELK's complex options
- **Improves diagram quality**: Systematic search finds better layouts than manual trial-and-error
- **Documents configurations**: Provides explanations for why certain settings work
- **Learns patterns**: Can recommend settings based on diagram characteristics

## Use Cases

### UC1: Layout Optimization
User's diagram has too many edge crossings.

```
User: "This diagram is hard to read. Can you find better layout settings?"

Agent: [analyzes diagram, tries different configurations, reports best result]
```

### UC2: Direction Preference
User wants a specific flow direction.

```
User: "Make this flow left-to-right instead of top-to-bottom"

Agent: [adjusts direction, re-optimizes other settings for new direction]
```

### UC3: Space Optimization
User needs diagram to fit in a constrained space.

```
User: "Make this diagram fit in a 800x600 viewport"

Agent: [adjusts spacing, node sizes, and algorithm to fit constraints]
```

### UC4: Style Matching
User wants diagram to match a reference style.

```
User: "Make the layout similar to this example: [reference image]"

Agent: [infers settings from reference, applies to user's diagram]
```

### UC5: Bulk Optimization
User wants consistent settings across multiple diagrams.

```
User: "Find settings that work well for all our architecture diagrams"

Agent: [analyzes multiple diagrams, finds settings that work across all]
```

## Interface

### Input

```typescript
interface ElkTuningInput {
  /** The Graph-IR to optimize layout for */
  graph: CoralGraph;

  /** Current ELK options (if any) */
  currentOptions?: ElkLayoutOptions;

  /** What to optimize for */
  objectives?: {
    /** Minimize edge crossings (default: true) */
    minimizeCrossings?: boolean;
    /** Minimize total edge length */
    minimizeEdgeLength?: boolean;
    /** Minimize diagram area */
    minimizeArea?: boolean;
    /** Maximize node separation */
    maximizeSeparation?: boolean;
    /** Minimize edge bends */
    minimizeBends?: boolean;
  };

  /** Constraints */
  constraints?: {
    /** Maximum width in pixels */
    maxWidth?: number;
    /** Maximum height in pixels */
    maxHeight?: number;
    /** Required flow direction */
    direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
    /** Nodes that must be at specific layers */
    layerConstraints?: Record<string, number>;
  };

  /** Search parameters */
  search?: {
    /** Maximum configurations to try */
    maxIterations?: number;
    /** Time limit in milliseconds */
    timeLimit?: number;
    /** Search strategy */
    strategy?: 'exhaustive' | 'random' | 'genetic' | 'bayesian';
  };
}

type ElkLayoutOptions = Record<string, string | number | boolean>;
```

### Output

```typescript
interface ElkTuningOutput {
  /** Best configuration found */
  bestOptions: ElkLayoutOptions;

  /** Layout result with best configuration */
  layout: LayoutResult;

  /** Metrics for best configuration */
  metrics: LayoutMetrics;

  /** Explanation of why these settings were chosen */
  explanation: string;

  /** Alternative configurations considered */
  alternatives?: Array<{
    options: ElkLayoutOptions;
    metrics: LayoutMetrics;
    tradeoff: string;  // e.g., "fewer crossings but more area"
  }>;

  /** Search statistics */
  searchStats: {
    configurationsEvaluated: number;
    timeElapsedMs: number;
    improvementHistory: Array<{ iteration: number; score: number }>;
  };
}

interface LayoutMetrics {
  /** Number of edge crossings */
  crossings: number;
  /** Total edge length in pixels */
  totalEdgeLength: number;
  /** Bounding box dimensions */
  width: number;
  height: number;
  /** Area in pixels squared */
  area: number;
  /** Number of edge bends */
  bends: number;
  /** Average node separation */
  avgSeparation: number;
  /** Composite score (weighted combination) */
  score: number;
}

interface LayoutResult {
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  edges: Array<{ id: string; points: Array<{ x: number; y: number }> }>;
}
```

## Behavior

### Step 1: Analyze Diagram Characteristics
Before searching, understand the diagram:
- Number of nodes and edges
- Depth of hierarchy
- Edge density (sparse vs dense)
- Presence of clusters/groups
- Cyclic dependencies (back edges)

This informs which parameters are most impactful.

### Step 2: Define Search Space
Based on characteristics, select parameters to tune:

**For hierarchical diagrams (most common):**
```javascript
const searchSpace = {
  'elk.algorithm': ['layered'],
  'elk.direction': ['DOWN', 'RIGHT', 'UP', 'LEFT'],
  'elk.layered.crossingMinimization.strategy': ['LAYER_SWEEP', 'INTERACTIVE'],
  'elk.layered.nodePlacement.strategy': ['BRANDES_KOEPF', 'NETWORK_SIMPLEX', 'SIMPLE'],
  'elk.spacing.nodeNode': [40, 60, 80, 100, 120],
  'elk.layered.spacing.edgeEdgeBetweenLayers': [20, 30, 40, 50],
  'elk.layered.spacing.nodeNodeBetweenLayers': [60, 80, 100, 120],
};
```

**For dense/non-hierarchical diagrams:**
```javascript
const searchSpace = {
  'elk.algorithm': ['stress', 'force'],
  'elk.stress.desiredEdgeLength': [50, 75, 100, 150],
  'elk.spacing.nodeNode': [40, 60, 80],
};
```

### Step 3: Search Strategy

**Exhaustive (small search spaces):**
Try all combinations. Feasible when search space < 1000 configurations.

**Random (medium search spaces):**
Random sampling with early stopping when improvement plateaus.

**Bayesian Optimization (large search spaces):**
Use Gaussian Process to model score function, focus on promising regions.

**Genetic Algorithm (very large search spaces):**
Evolve population of configurations, crossover and mutate.

### Step 4: Evaluate Configurations
For each configuration:
1. Run ELK layout
2. Calculate metrics (crossings, edge length, area, bends)
3. Compute weighted score based on objectives
4. Track best configuration

### Step 5: Report Results
- Return best configuration with explanation
- Provide alternatives for different trade-offs
- Document what was tried and why

## Examples

### Example 1: Simple Optimization

**Input:**
```json
{
  "graph": { /* 10-node microservices diagram */ },
  "objectives": { "minimizeCrossings": true }
}
```

**Output:**
```json
{
  "bestOptions": {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    "elk.spacing.nodeNode": "80"
  },
  "metrics": {
    "crossings": 0,
    "totalEdgeLength": 1250,
    "width": 800,
    "height": 400,
    "score": 0.95
  },
  "explanation": "Left-to-right layout with layer sweep crossing minimization eliminated all crossings. The 10-node diagram fits well horizontally.",
  "searchStats": {
    "configurationsEvaluated": 48,
    "timeElapsedMs": 2300
  }
}
```

### Example 2: Constrained Optimization

**Input:**
```json
{
  "graph": { /* 25-node diagram */ },
  "constraints": {
    "maxWidth": 600,
    "maxHeight": 800,
    "direction": "DOWN"
  },
  "objectives": {
    "minimizeCrossings": true,
    "minimizeArea": true
  }
}
```

**Output:**
```json
{
  "bestOptions": {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.spacing.nodeNode": "40",
    "elk.layered.spacing.nodeNodeBetweenLayers": "60",
    "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH"
  },
  "metrics": {
    "crossings": 2,
    "width": 580,
    "height": 750,
    "score": 0.82
  },
  "explanation": "Reduced spacing and enabled compaction to fit within 600x800 constraint. Two crossings unavoidable given the graph structure.",
  "alternatives": [
    {
      "options": { /* wider spacing */ },
      "metrics": { "crossings": 0, "width": 720 },
      "tradeoff": "Zero crossings but exceeds width constraint by 120px"
    }
  ]
}
```

## Dependencies

### Required
- `elkjs` — ELK layout engine
- `@coral/ir` — Graph-IR types
- `@coral/viz` — IR to ELK conversion utilities

### Optional
- Web Worker support for parallel evaluation
- GPU acceleration for very large diagrams

## Implementation Notes

### Crossing Counting
ELK doesn't report crossings directly. Calculate by:
1. Get edge paths from layout result
2. For each pair of edges, check if line segments intersect
3. Complexity: O(E²) but typically fast for reasonable diagram sizes

### Caching
Cache layout results by (graph hash, options hash) to avoid re-computation.

### Parallelization
Different configurations can be evaluated in parallel:
```typescript
const results = await Promise.all(
  configurations.map(opts => runElkInWorker(graph, opts))
);
```

### Early Termination
Stop search early if:
- Perfect score achieved (0 crossings, meets all constraints)
- No improvement for N iterations
- Time limit reached

### Learning from History
Over time, build a model of which settings work well for which diagram characteristics:
```typescript
if (graph.nodes.length > 20 && edgeDensity > 0.3) {
  // Start with stress algorithm for dense graphs
  initialGuess = { 'elk.algorithm': 'stress' };
}
```

## Open Questions

1. **How to handle subjective aesthetics?**
   - "Looks good" is hard to quantify
   - Could use learned preferences from user feedback

2. **Should it support interactive tuning?**
   - Show live preview as settings change
   - Let user guide the search

3. **How to handle very large diagrams?**
   - 1000+ nodes makes evaluation slow
   - May need sampling or approximation

4. **Multi-objective optimization?**
   - Crossings vs area vs edge length are often conflicting
   - Pareto frontier visualization?

5. **Integration with visual editor?**
   - Button: "Optimize Layout"
   - Show progress and alternatives

## Related Specifications

- [diagram-generation agent](diagram-generation.md) — Generates diagrams that need layout
- [/coral skill](../skills/coral.md) — Could call this agent for layout optimization
