/** Public, self-contained declaration for the authored GraphIR 4 candidate. */
import type { GraphEdge, GraphIR, GraphNode, InteractionMessage, RelationshipEnd, SpatialConstraintSuccessor, LayoutOptionsSuccessor, RouteIntentSuccessor } from '@graph-ir/core';
import type { SuccessorSourceGraph028 } from '@coral-viz/render';

type CoralSourcePort028 = {
  id: string;
  direction: 'in' | 'out' | 'inout';
  label?: string;
  anchor?:
    | { kind: 'auto' | 'side' | 'corner' }
    | { kind: 'exact'; position: 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' }
    | { kind: 'symbol'; id: string };
};

type CoralSourceNode028 = Omit<GraphNode, 'ports' | 'children'> & {
  semanticPorts?: readonly CoralSourcePort028[];
  children?: CoralSourceNode028[];
};

type CoralSourceEdge028 = Omit<GraphEdge,
  'source' | 'target' | 'sourcePort' | 'targetPort' | 'sourceEnd' | 'targetEnd' | 'routeIntent' | 'style'> & {
  first: { node: string; port?: string };
  second: { node: string; port?: string };
  direction: 'first-to-second' | 'second-to-first' | 'both' | 'none';
  proximityHint?: 1 | 2 | 3 | 4 | 5 | 6;
  routeIntent?: RouteIntentSuccessor;
  firstEnd?: RelationshipEnd;
  secondEnd?: RelationshipEnd;
  style?: NonNullable<GraphEdge['style']> & {
    strokeColor?: string;
    strokeWeight?: 'regular' | 'thick';
    motion?: { kind: 'static' } | { kind: 'animated';
      direction: 'auto' | 'first-to-second' | 'second-to-first' };
  };
};

type CoralSourceItem028 = {
  kind: 'message' | 'fragment' | 'note' | 'activation-start' | 'activation-end' | 'region';
  id: string;
};
type CoralSourceOperand028 = {
  id: string;
  guard?: { id: string; text: string };
  items: CoralSourceItem028[];
};
type CoralSourceFragment028 =
  | { id: string; kind: 'loop' | 'opt' | 'critical' | 'break'; operands: [CoralSourceOperand028] }
  | { id: string; kind: 'alt' | 'par';
      operands: [CoralSourceOperand028, CoralSourceOperand028, ...CoralSourceOperand028[]] };
type CoralSourceInteraction028 = {
  participants: Array<{ id: string; nodeId: string;
    createdByMessageId?: string; destroyedByMessageId?: string }>;
  participantOrder: string[];
  messages: Array<{ id: string; edgeId: string;
    kind: NonNullable<InteractionMessage['kind']> &
      ('synchronous' | 'asynchronous' | 'return' | 'create' | 'destroy');
    senderParticipantId: string; receiverParticipantId: string }>;
  fragments?: CoralSourceFragment028[];
  notes?: Array<{ id: string; text: string; participantIds?: string[]; messageIds?: string[] }>;
  activations?: Array<{ id: string; participantId: string }>;
  regions?: Array<{ id: string; label?: string; items: CoralSourceItem028[] }>;
  groups?: Array<{ id: string; label?: string; participantIds: string[] }>;
  items: CoralSourceItem028[];
};

/** Exact authored meaning returned by the browser API, independent of render package declarations. */
export type CoralSourceGraphView028 = Omit<GraphIR,
  'version' | 'profile' | 'nodes' | 'edges' | 'interaction' | 'constraints' | 'layoutOptions'> & {
  version: '4.0.0';
  constraints?: SpatialConstraintSuccessor[];
  layoutOptions?: LayoutOptionsSuccessor;
  profile: { id: string; kind?: string; version: string };
  catalog: { id: string; version: string; digest: string };
  conformanceLevel: 'none' | 'typical' | 'strict';
  conformanceExceptions?: Array<{ kind: 'explicit-symbol'; nodeId: string; symbol: string }>;
  nodes: CoralSourceNode028[];
  edges: CoralSourceEdge028[];
  interaction?: CoralSourceInteraction028;
};

// Build-time bidirectional check: the standalone declaration must track the
// source compiler contract until the private successor has a public package.
type AssertAssignable<Actual extends Expected, Expected> = Actual;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time contract assertion
type _CompilerToBrowser = AssertAssignable<SuccessorSourceGraph028, CoralSourceGraphView028>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time contract assertion
type _BrowserToCompiler = AssertAssignable<CoralSourceGraphView028, SuccessorSourceGraph028>;
