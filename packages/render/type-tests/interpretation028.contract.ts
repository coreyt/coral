import { resolveNotationNode028 } from '../src/index.js';

const interpreted = resolveNotationNode028({ id: 'api', type: 'service',
  authoredPorts: [{ id: 'audit', direction: 'out', anchor: 'side' }] }, 'architecture');

const origin: 'catalog' | 'authored' | undefined = interpreted.semanticPorts[0]?.origin;
void origin;
