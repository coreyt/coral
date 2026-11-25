/** Same portable mutations run against frozen Node Core and browser Core. */
export function successorBrowserCases028(base, catalog, additional = []) {
  const cases = [];
  const add = (id, mutate = () => {}, changeCatalog = () => {}) => {
    const graph = structuredClone(base), snapshot = structuredClone(catalog);
    mutate(graph); changeCatalog(snapshot);
    cases.push({ id, graph, snapshot });
  };
  add('valid-recursive-region-lifecycle-labels');
  add('valid-group-membership', (g) => { g.interaction.groups = [{ id: 'team', participantIds: ['c', 'a'] }]; });
  add('missing-version', (g) => { delete g.version; });
  add('wrong-version', (g) => { g.version = '3.0.0'; });
  add('unknown-root-field', (g) => { g.unrecognized = true; });
  add('prototype-name-root-field', (g) => { Object.defineProperty(g, '__proto__', { value: 'bad', enumerable: true }); });
  add('constructor-name-root-field', (g) => { g.constructor = 'bad'; });
  add('missing-node-type', (g) => { delete g.nodes[0].type; });
  add('non-numeric-position', (g) => { g.nodes[0].position = { x: 'bad', y: 0 }; });
  add('nan-position', (g) => { g.nodes[0].position = { x: NaN, y: 0 }; });
  add('infinite-position', (g) => { g.nodes[0].position = { x: Infinity, y: 0 }; });
  add('negative-dimensions', (g) => { g.nodes[0].dimensions = { width: -1, height: 20 }; });
  add('duplicate-node-id', (g) => { g.nodes[1].id = g.nodes[0].id; });
  add('unknown-endpoint', (g) => { g.edges[0].second.node = 'absent'; });
  add('unknown-semantic-port', (g) => { g.edges[0].first.port = 'absent'; });
  add('unknown-symbol', (g) => { g.nodes[0].symbol = 'absent'; });
  add('unknown-symbol-variant', (g) => { g.nodes[0].variant = 'absent'; });
  add('label-fraction-outside-range', (g) => { g.edges[0].labelPlacement.at = 2; });
  add('negative-label-offset', (g) => { g.edges[0].labelPlacement.offset = -1; });
  add('center-label-nonzero-offset', (g) => { g.edges[0].labelPlacement = { side: 'center', offset: 1 }; });
  add('region-missing-items', (g) => { delete g.interaction.regions[0].items; });
  add('unknown-timeline-kind', (g) => { g.interaction.regions[0].items[0].kind = 'unknown'; });
  add('duplicate-region-id', (g) => { g.interaction.regions.push(structuredClone(g.interaction.regions[0])); });
  add('region-cycle', (g) => { g.interaction.regions[0].items.push({ kind: 'region', id: g.interaction.regions[0].id }); });
  add('unknown-region-reference', (g) => { g.interaction.fragments[0].operands[0].items[0].id = 'absent'; });
  add('missing-destruction-link', (g) => { delete g.interaction.participants[1].destroyedByMessageId; });
  add('invalid-creation-link', (g) => { g.interaction.participants[0].createdByMessageId = 'absent'; });
  add('wrong-catalog-digest', (g) => { g.catalog.digest = 'sha256-' + '0'.repeat(64); });
  add('invalid-catalog-snapshot', () => {}, (c) => { c.allowedSymbolIds.push('absent'); });
  add('wrong-group-participant', (g) => { g.interaction.groups = [{ id: 'team', participantIds: ['absent'] }]; });
  add('cyclic-object', (g) => { g.nodes[0].children = [g.nodes[0]]; });
  return [...cases, ...additional];
}
