/** Current production source review scope. Chen fixtures remain negative
 * acceptance inputs; their older positive captures are research evidence. */
export const ACTIVE_RENDERER_SOURCE_CASES_028 = Object.freeze([
  'flowchart-draft', 'flowchart-branch', 'flowchart-cycle', 'flowchart-proximity',
  'block-ports', 'block-branch', 'block-cycle',
  'uml-class-named', 'uml-class-chain', 'uml-class-fork', 'uml-class-mixed-anchors',
  'uml-sequence-flat', 'uml-sequence-nested', 'uml-sequence-loop', 'uml-sequence-proximity',
  'uml-sequence-created-after-nested', 'uml-sequence-activation-notes', 'uml-sequence-lifecycle',
  'uml-sequence-groups',
  'bpmn-event', 'bpmn-branch', 'bpmn-loop',
]);

export const DISABLED_RENDERER_SOURCE_CASES_028 = Object.freeze([
  'erd-relationship', 'erd-relationship-node', 'erd-hub',
]);

export const DISABLED_RENDERER_SOURCE_CODE_028 = 'header.diagram.disabled';

/** Negative source-entry acceptance; these strings must never select a retired reader. */
export const MISSING_HEADER_RENDERER_SOURCES_028 = Object.freeze([
  { name: 'headerless-current', source: 'api service' },
  { name: 'retired-kind-first', source: 'service "API" as api' },
  { name: 'retired-graph-header', source: '@graph {"id":"old"}\nservice "API" as api' },
  { name: 'comment-then-headerless', source: '// source\napi service' },
  { name: 'empty', source: '' },
  { name: 'blank', source: '  \n' },
]);

/** Package consumers must retain these approved sequence features, even if
 * several consumers were to omit the same feature consistently. */
export const REQUIRED_SOURCE_SCENE_MARKERS_028 = Object.freeze({
  'uml-sequence-activation-notes': [
    ['data-coral-sequence-activation', 'work'],
    ['data-coral-sequence-fragment', 'choice'],
    ['data-coral-sequence-note', 'note-1'],
  ],
  'uml-sequence-lifecycle': [
    ['data-coral-sequence-participant', 'worker'],
    ['data-coral-sequence-activation', 'work'],
    ['data-coral-sequence-fragment', 'choice'],
    ['data-coral-sequence-note', 'note-1'],
    ['data-coral-sequence-message', 'close'],
    ['data-coral-destruction', 'worker'],
    ['data-coral-destruction-message', 'close'],
  ],
  'uml-sequence-groups': [
    ['data-coral-sequence-group', 'team'],
    ['data-coral-group-member', 'worker'],
    ['data-coral-group-member', 'api'],
  ],
});
