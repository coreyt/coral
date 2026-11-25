/**
 * Semantic defect taxonomy (Slice 49, R-049.6 AC-1) -- Fable-5.1 subagent
 * Call 1's output, reviewed against the two criteria
 * `dev/designs/coral-defect-corpus.md` Step 7 specifies before use: (1) is
 * it expressible as a concrete mutation of an existing valid Coral DSL
 * diagram, and (2) is it distinguishable from every other accepted type.
 *
 * This is test-data-generation input only -- no semantic linter is built in
 * this slice. See the design doc's Step 7 and Review log for the full
 * review record.
 */

export interface SemanticDefectTypeDef {
  type: string;
  description: string;
  manifestsAs: string;
  distinguishingTest: string;
  /**
   * Set only for a type this corpus's retained diagrams cannot currently
   * exercise (no diagram has the structural feature the mutation needs) --
   * kept in the taxonomy for a future, larger corpus rather than deleted,
   * but excluded from Call 2's active batches.
   */
  inapplicableToCurrentCorpus?: string;
}

/**
 * Fifteen types proposed by Fable-5.1 (Call 1), all confirmed distinguishable;
 * fourteen are active against this corpus, one (`misplaced-in-group`) is
 * retained but currently inapplicable (see its `inapplicableToCurrentCorpus`
 * note), and one (`wrong-cardinality`) had its `manifestsAs` corrected during
 * review to match how this corpus actually represents cardinality (a
 * `data{}` JSON field, not a token embedded in the edge's printed label).
 */
export const SEMANTIC_DEFECT_TAXONOMY: readonly SemanticDefectTypeDef[] = [
  {
    type: 'orphan-node',
    description:
      "A declared node participates in no relationship, even though the diagram's purpose implies it should (a service nobody calls, an entity with no relations, a lifeline that never sends or receives).",
    manifestsAs:
      'Pick one node that currently has at least one edge and delete every edge whose source or target is that node, leaving the declaration intact.',
    distinguishingTest:
      'Exactly one node has degree zero while every remaining edge is otherwise unchanged; no edge was added, redirected, relabeled, or retyped.',
  },
  {
    type: 'missing-expected-connector',
    description:
      "Two nodes that, given their types, labels, and the diagram's purpose, clearly should be related (e.g. 'Payment Service' and 'Payment Database') have no edge between them, while both remain connected to other things.",
    manifestsAs:
      'Delete a single edge between two nodes that each keep at least one other edge, choosing an edge whose endpoints share a label stem, type pairing (service->database), or obvious role relationship.',
    distinguishingTest:
      'One edge is gone but both endpoints still have degree >= 1, so no node is orphaned and the flow/state graph may still be connected overall.',
  },
  {
    type: 'out-of-order-sequence',
    description:
      'In a flowchart, sequence, or pipeline diagram, steps occur in an order that contradicts the described process (charge payment before validating cart; send response before receiving request).',
    manifestsAs:
      "Select two consecutive ordered edges in a linear chain (A->B, B->C) and swap the middle node's position so the chain becomes A->C, C->B, without adding or removing any edge or node.",
    distinguishingTest:
      'Node and edge counts are unchanged and every node stays reachable, but the order of two labeled steps is inverted relative to the process the labels describe.',
  },
  {
    type: 'reversed-relationship-direction',
    description:
      "A single edge points the wrong way for what its label or endpoint types imply (database 'writes to' service; child class 'inherits from' its subclass).",
    manifestsAs: 'Pick one edge and swap its source and target while preserving its label and style exactly.',
    distinguishingTest:
      'Unlike out-of-order-sequence only one edge changes and it stays between the same two endpoints; unlike missing-expected-connector no edge is removed; the tell is a label/type pairing that only makes sense in the opposite direction.',
  },
  {
    type: 'unreachable-state',
    description:
      'In a state or flow diagram, a node has outgoing transitions but nothing leads into it from the start, so it can never actually be entered.',
    manifestsAs:
      'Choose a non-initial node with both incoming and outgoing edges and delete all of its incoming edges while keeping its outgoing ones.',
    distinguishingTest:
      'The node has in-degree zero and out-degree >= 1 and is not the designated start; orphan-node has degree zero, and dead-end-state is the mirror image.',
  },
  {
    type: 'dead-end-state',
    description:
      "In a state or flow diagram, a non-terminal node has incoming transitions but no outgoing ones, so the process silently stalls there (a 'Processing' state you can never leave).",
    manifestsAs:
      'Choose a non-terminal node with both incoming and outgoing edges and delete all of its outgoing edges while keeping its incoming ones.',
    distinguishingTest:
      'The node has out-degree zero and in-degree >= 1 and its label is not a terminal/end state; unreachable-state is the inverse and orphan-node has no edges at all.',
  },
  {
    type: 'missing-decision-branch',
    description:
      'A decision point (a branch node, a state with conditional exits) has only one outgoing path, so the alternative outcome its label implies (reject, failure, timeout, no) is never represented.',
    manifestsAs:
      'Find a node with two or more labeled outgoing edges whose labels are complementary (yes/no, approved/rejected) and delete all but one of those edges.',
    distinguishingTest:
      'The decision node keeps in-degree and out-degree >= 1 (so it is not a dead end) but its outgoing edge set no longer covers the complementary outcomes its remaining label(s) imply.',
  },
  {
    type: 'contradictory-relationship',
    description:
      "Two edges between the same pair of nodes make mutually exclusive claims (A extends B and B extends A; a transition labeled both 'approve' and 'reject' from the same guard).",
    manifestsAs:
      'For an existing edge A->B [label: "X"], add a second edge (A->B or B->A) carrying a label that logically excludes X.',
    distinguishingTest:
      'Edge count increases by one and the new edge shares both endpoints with an existing edge but carries a semantically incompatible label; duplicate-relationship\'s added edge carries the same or an equivalent label instead.',
  },
  {
    type: 'duplicate-relationship',
    description:
      'The same relationship is asserted more than once between the same two nodes with the same or equivalent meaning, implying a repeated call or duplicated association the author did not intend.',
    manifestsAs:
      "Copy an existing edge line verbatim (or with a trivially reworded label such as 'calls' vs 'invokes') and insert the copy elsewhere in the edge list.",
    distinguishingTest:
      'Edge count increases by one and the added edge has identical endpoints, direction, and equivalent label to an existing edge; contradictory-relationship\'s added edge conflicts in meaning instead of repeating it.',
  },
  {
    type: 'wrong-cardinality',
    description:
      'In an ER diagram, an edge\'s cardinality contradicts what the entities represent (a Customer has exactly one Order; a config singleton with "many" on both ends).',
    // Corrected during review: this corpus's ER edges carry cardinality as
    // `sourceCardinality`/`targetCardinality` bracket attributes (e.g.
    // `[relationship, label: "writes", sourceCardinality: "||", targetCardinality: "o{"]`,
    // see `packages/language/src/formats/mermaid.ts`'s `parseER`), not as a
    // token inside the edge's text label -- Fable's original wording
    // assumed a label-embedded cardinality token, which does not match how
    // this corpus's known-good DSL actually represents it (review
    // criterion 1: must be a mutation of a real diagram in this corpus, not
    // a hypothetical DSL shape).
    manifestsAs:
      'Pick one ER edge and change only its `sourceCardinality` and/or `targetCardinality` bracket-attribute value (e.g. "||" to "o{") to a different valid cardinality token, keeping the edge\'s label, endpoints, and direction unchanged.',
    distinguishingTest:
      "Only the cardinality attribute value(s) on one existing edge change; the edge is not added, removed, or reversed, and its printed label text is unchanged, unlike mislabeled-relationship.",
  },
  {
    type: 'mislabeled-relationship',
    description:
      "An edge's label names a relationship that does not fit its endpoints or the process described ('reads from' on an edge into a message queue publisher; 'logout' on the login->dashboard transition).",
    manifestsAs:
      'Pick one edge and replace its label with another label taken from elsewhere in the same diagram (or its antonym) so the label is plausible in isolation but wrong for these endpoints.',
    distinguishingTest:
      'Endpoints, direction, and edge count are unchanged and only the relation verb of one label differs; wrong-cardinality changes only a data{} field, and reversed-relationship-direction leaves the label untouched.',
  },
  {
    type: 'node-type-role-mismatch',
    description:
      "A node's declared type contradicts the role its label and edges give it (a 'Postgres' labeled as service, a human 'Customer' declared as database).",
    manifestsAs:
      "Change the type keyword of one node declaration to a different valid Coral type (still one of KNOWN_NODE_TYPES, so this stays syntactically valid) while leaving its label, properties, and every edge referencing it unchanged.",
    distinguishingTest:
      "Graph topology and all labels are identical to the original; the only diff is one node's type keyword, which no other defect type touches. (Distinct from the syntax corpus's misspelled-keyword/keyword-case-mutation: those produce an unrecognized type string; this produces a different, still-recognized, still-valid type.)",
  },
  {
    type: 'misplaced-in-group',
    description:
      "A node is nested inside a group whose meaning excludes it (a third-party payment gateway inside the 'Internal Services' VPC; a client browser inside the 'Database Tier' cluster).",
    manifestsAs:
      "Move one node's declaration line out of its current group block into a different group block (or from top level into a group) whose label describes a domain the node does not belong to, leaving all edges unchanged.",
    distinguishingTest:
      'Node set, types, labels, and edges are all unchanged; only the brace-nesting parent of one node differs, which no other defect type alters.',
    inapplicableToCurrentCorpus:
      "None of this corpus's retained diagrams use nested `group { }` blocks (flowchart authoring instructions explicitly excluded Mermaid `subgraph`/`end`, and no other diagram type in this corpus has a grouping construct) -- retained for a future corpus that includes grouped diagrams, not used in this slice's Call 2 batches.",
  },
  {
    type: 'label-structure-mismatch',
    description:
      "A node or group's own label makes a structural claim the diagram does not honor ('Load Balancer' with a single downstream; a 'Final'/terminal-sounding state with outgoing transitions).",
    manifestsAs:
      "Rename one node label to a term that implies a structure the surrounding edges do not exhibit (e.g. rename a single-downstream node to 'Load Balancer', or rename an interior state to 'Completed' while it still has outgoing transitions).",
    distinguishingTest:
      'Only a node label string changes, with types, nesting, and edges untouched; mislabeled-relationship changes an edge label instead, and node-type-role-mismatch changes a type keyword rather than a label.',
  },
  {
    type: 'missing-terminal-boundary',
    description:
      'A state or flow diagram lacks a coherent entry or exit: there is no node that acts as the start (everything has predecessors) or no node acts as the end (every path loops back), so the process never begins or never concludes.',
    manifestsAs:
      "Delete the diagram's start node (and its outgoing edges) or its end node (and its incoming edges), then add one edge from the last remaining step back to the first so the graph stays connected with no source or sink.",
    distinguishingTest:
      'Node count drops by one and the resulting graph has no zero-in-degree or no zero-out-degree node at all, whereas unreachable-state and dead-end-state each concern a single interior node while the start/end still exist.',
  },
];

/** The subset of `SEMANTIC_DEFECT_TAXONOMY` Call 2's batches actually draw from. */
export const ACTIVE_SEMANTIC_DEFECT_TYPES: readonly string[] = SEMANTIC_DEFECT_TAXONOMY.filter(
  (t) => !t.inapplicableToCurrentCorpus,
).map((t) => t.type);
