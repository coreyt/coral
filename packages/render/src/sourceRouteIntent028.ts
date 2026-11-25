import type { RouteIntent, RouteIntentSuccessor } from '@graph-ir/core';

/** The staging graph keeps written endpoints as source/target. Arrowheads
 * never swap these anchors or the authored waypoint order. */
export function successorRouteIntent028(route: RouteIntent): RouteIntentSuccessor {
  return { waypoints: route.waypoints.map(({ id, placement }) => ({ id,
    placement: placement.kind === 'absolute'
      ? { kind: 'absolute', position: { ...placement.position } }
      : { kind: 'relative', offset: { ...placement.offset }, anchor:
        placement.anchor.kind === 'source' ? { kind: 'first' }
          : placement.anchor.kind === 'target' ? { kind: 'second' } : { ...placement.anchor } },
  })) };
}

/** A derived spatial display retains written endpoint order. Sequence rule
 * views may reverse it to sender order; that conversion never changes source. */
export function displayRouteIntent028(route: RouteIntentSuccessor, reverse = false): RouteIntent {
  const exact = reverse ? [...route.waypoints].reverse() : route.waypoints;
  const waypoints = exact.filter(waypoint=>waypoint.placement.kind!=='relative'||waypoint.placement.anchor.kind!=='waypoint');
  return { waypoints: waypoints.map(({ id, placement }) => ({ id,
    placement: placement.kind === 'absolute'
      ? { kind: 'absolute', position: { ...placement.position } }
      : { kind: 'relative', offset: { ...placement.offset }, anchor:
        placement.anchor.kind === 'first' ? { kind: reverse ? 'target' : 'source' }
          : placement.anchor.kind === 'second' ? { kind: reverse ? 'source' : 'target' } : placement.anchor as Extract<import('@graph-ir/core').RouteAnchor,{kind:'node'|'port'}> },
  })) };
}
