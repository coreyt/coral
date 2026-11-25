// Operation registry for the proposed `coral-plan/1` wire contract
// (dev/releases/0.2.10/design.md, "Versioned instruction schema"). This is
// the single declaration that drives both response validation (decode.mjs)
// and the model-facing contract text (prompt.mjs).
//
// Field kinds: ref | ref-or-null | handle | string | type | symbol | endpoint
// | direction | spacing | members | relation | axis | order | side | scope.
// A trailing `?` marks an optional field.

export const PROTOCOL = 'coral-plan/1';

export const LIMITS = {
  responseBytes: 65_536,
  stringBytes: 4_096,
  nesting: 16,
  operations: 32,
  identifier: /^[A-Za-z0-9_-]{1,64}$/,
};

export const OPS = {
  'node.add': {
    fields: { as: 'handle', parent: 'ref-or-null', type: 'type', label: 'string?', symbol: 'symbol?' },
    describe: 'Add one node of a capability type under the root (parent null) or one existing group; `as` names the new handle.',
  },
  'entity.label.set': {
    fields: { target: 'ref', value: 'string' },
    describe: 'Set exactly one node or relation label to the given string (an empty string is a visible empty label).',
  },
  'entity.label.unset': {
    fields: { target: 'ref' },
    describe: 'Remove the authored label of one node or relation; the default display returns.',
  },
  'edge.add': {
    fields: { as: 'handle', type: 'type', first: 'endpoint', second: 'endpoint', direction: 'direction', label: 'string?' },
    describe: 'Add one relation of a capability relation type between two endpoints with an explicit direction; `as` names the new handle.',
  },
  'edge.remove': {
    fields: { target: 'ref' },
    describe: 'Remove exactly one relation.',
  },
  'node.remove': {
    fields: { target: 'ref' },
    describe: 'Remove exactly one node that has no children and no incident relations. Removal never cascades; remove dependents explicitly first.',
  },
  'layout.relative': {
    fields: { subject: 'ref', target: 'ref', relation: 'relation', spacing: 'spacing' },
    describe: 'Place one subject node above, below, left-of or right-of one fixed target node with the named spacing.',
  },
  'layout.arrange': {
    fields: { members: 'members', axis: 'axis', direction: 'order', spacing: 'spacing' },
    describe: 'Arrange at least two distinct member nodes (no ancestor/descendant pairs) along a row or column in the listed order.',
  },
  'layout.boundary': {
    fields: { subject: 'ref', side: 'side', scope: 'scope', spacing: 'spacing' },
    describe: 'Move one subject node to the named side of the diagram or of one group it belongs to.',
  },
};

export const ENUMS = {
  direction: ['none', 'first-to-second', 'second-to-first', 'both'],
  spacing: ['compact', 'normal', 'wide'],
  relation: ['above', 'below', 'left-of', 'right-of'],
  axis: ['row', 'column'],
  order: ['forward', 'reverse'],
  side: ['top', 'bottom', 'left', 'right'],
};

export const RESPONSE_KINDS = {
  plan: { fields: { operations: 'operations' }, describe: 'An ordered atomic program of 1 to 32 operations.' },
  clarify: {
    fields: { reason: 'clarify-reason', question: 'string', choices: 'choices?', contextRefs: 'context-refs?' },
    describe: 'A question. `ambiguous` may offer choices (existing references) and must not request context; '
      + '`missing-context` must list existing references whose details you need and must not offer choices.',
  },
  no_change: {
    fields: { reason: 'no-change-reason', message: 'string' },
    describe: 'No edit: `already-satisfied`, `unsupported` (the request needs an operation this contract does not offer), or `explanation`.',
  },
};

export const CLARIFY_REASONS = ['ambiguous', 'missing-context'];
export const NO_CHANGE_REASONS = ['already-satisfied', 'explanation', 'unsupported'];

// Experimental capability manifest for the flowchart profile. `containers`
// lists node types that may be a parent; `edgeDirections` lists the only
// direction values the adapter advertises for creation.
export const CAPABILITIES = {
  'flowchart-plan-v1': {
    id: 'flowchart-plan-v1',
    version: 1,
    profile: 'flowchart',
    nodeTypes: {
      terminal: 'start or end of a flow',
      process: 'an action step',
      decision: 'a branch with yes/no ports',
      datastore: 'a database or store',
      group: 'a container for other nodes',
    },
    containers: ['group'],
    relationTypes: { flow: 'a directed flow between two nodes' },
    edgeDirections: ['first-to-second'],
    symbols: [],
    unsupported: ['reparenting a node', 'renaming a source ID', 'style or property changes', 'cascading deletion'],
  },
};
