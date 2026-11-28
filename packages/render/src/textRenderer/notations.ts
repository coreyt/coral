import type { GraphEdge, GraphNode } from '@graph-ir/core';
import { effectiveClassifierPresentation0214 } from '../scene.js';
import type { Settings } from './format.js';
import type { NodeContent } from './textScene.js';

export const textNotations = ['architecture', 'infrastructure', 'flowchart', 'erd', 'uml-class', 'uml-state', 'uml-sequence',
  'block', 'bpmn', 'aiml', 'data-engineering', 'code', 'sketch'];

export function notationNode(notation: string, node: GraphNode, label: string, cfg: Settings): NodeContent {
  const secondary: string[] = [];
  const props = node.properties;
  if (props?.technology) secondary.push(`[${props.technology}]`);
  if (node.description) secondary.push(node.description);
  let title = label, cue: string | undefined;
  if (['block', 'aiml', 'data-engineering', 'code'].includes(notation)) {
    cue = '[' + node.type + (node.variant ? ':' + node.variant : '') + ']';
  }
  if (notation === 'bpmn') {
    const cues: Record<string, string> = { startEvent: '(o)', endEvent: '((o))', intermediateEvent: '(O)',
      exclusiveGateway: '<X>', parallelGateway: '<+>', inclusiveGateway: '<O>', eventBasedGateway: '<*>',
      gateway: '<X>', boundaryEvent: '(boundary)', message: '[message]', dataObject: '[data]' };
    cue = cues[node.type] ?? '[' + node.type + ']';
  }
  if (notation === 'sketch') {
    const cues: Record<string, string> = { cloud: '(~)', decision: '<>', note: '[note]', step: '[step]' };
    cue = cues[node.type] ?? '[' + node.type + ']';
  }
  const tabular = effectiveClassifierPresentation0214(node);
  if (tabular) {
    const stereotype = tabular.stereotype?.replace('«', '<<').replace('»', '>>');
    title = [stereotype, tabular.abstract && '{abstract}', tabular.static && '{static}', label].filter(Boolean).join(' ');
    const compartments = tabular.compartments.map(c => c.rows);
    const demotableRows = notation === 'erd' ? new Set(compartments.flat().filter(r => !/^(PK|FK)\b/.test(r))) : undefined;
    return { title, secondary, compartments, demotableRows };
  }
  if (notation === 'flowchart') {
    const shapes: Record<string, [string, string]> = { terminal: ['( ', ' )'], decision: ['< ', ' >'],
      io: ['[/ ', ' /]'], database: ['[(', ')]'] };
    const shape = shapes[node.type];
    if (shape && !(node.type === 'decision' && cfg.density === 'standard')) title = shape[0] + label + shape[1];
  }
  if (notation === 'uml-state') {
    const cues: Record<string, string> = { initial: '(*)', final: '((o))', choice: '<>', fork: '====', join: '====', note: '[note]' };
    cue = cues[node.type];
    if (cfg.charset !== 'ascii') cue = ({ initial: '●', final: '◉', choice: '◇' } as Record<string, string>)[node.type] ?? cue;
  }
  if (notation === 'architecture' && ['person', 'actor', 'externalSystem'].includes(node.type))
    title = (node.type === 'externalSystem' ? '(ext) ' : '(actor) ') + label;
  if (props?.provider) {
    const provider = String(props.provider);
    const names: Record<string, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP', k8s: 'K8s' };
    title = `[${names[provider.toLowerCase()] ?? provider}] ${title}`;
  }
  return { title, secondary, cue, decision: ['flowchart', 'sketch'].includes(notation) && node.type === 'decision' };
}

export function notationEdge(edge: GraphEdge, cfg: Settings) {
  const ends: Record<string, string> = { one: '||', 'zero-or-one': 'o|', 'one-or-many': '|<', 'zero-or-many': 'o<',
    'crow-foot': '<', triangle: '|>', bar: '|', diamond: '<>', circle: 'o' };
  const first = edge.sourceEnd?.marker, last = edge.targetEnd?.marker;
  const shaft = edge.style?.lineStyle === 'dashed' || edge.type === 'annotation' || edge.type === 'realization' ? '..' : '--';
  if (first && ends[first.kind] || last && ends[last.kind]) {
    const marker = (m: typeof first) => m?.kind === 'diamond' && m.fill === 'filled' ? '<#>' : ends[m?.kind ?? ''] ?? '';
    return marker(first) + shaft + marker(last);
  }
  if (first?.kind === 'arrow' && last?.kind === 'arrow') return '<->';
  if (first?.kind === 'none' && last?.kind === 'none') return shaft;
  if (shaft === '..') return '..' + cfg.glyph.right;
  return '';
}
