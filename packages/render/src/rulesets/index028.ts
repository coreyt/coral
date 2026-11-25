import type { GraphIR } from '@graph-ir/core';
import type { RulesetDefinition } from '../conformance028.js';
import { bpmnRuleset028, bpmnRulesetWithSourceDirections028 } from './bpmn028.js';
import { flowchartRuleset028, flowchartRulesetWithSourceDirections028 } from './flowchart028.js';
import { umlClassRuleset028 } from './umlClass028.js';
import { umlSequenceRuleset028 } from './umlSequence028.js';
import type { SourceEdgeDirection028 } from '../sourceDirection028.js';

/** Shared-only inventories explicitly approved in Slice 10. */
function sharedCard(profileId: string): RulesetDefinition<GraphIR> {
  return { id: `coral-${profileId}`, profileId, version: '0.2.8-bounded.1',
    scope: 'coral-bounded-profile', coverage: 'complete', obligations: [], rules: [] };
}

/** A partial card names the specific evidence boundary without claiming full UML. */
function partialCard(profileId: 'erd' | 'uml-state'): RulesetDefinition<GraphIR> {
  return { id: `coral-${profileId}`, profileId, version: profileId === 'uml-state' ? '0.2.8-state.1' : '0.2.8-research.1', coverage: 'partial',
    obligations: profileId === 'uml-state'
      ? [{ id: 'UML.STATE.PROFILE_RULES.UNVERIFIED',
        message: 'A complete bounded UML state notation-rule inventory and its evidence have not been approved; character subset admission does not establish UML state conformance.' }]
      : [{ id: 'CORAL.RULESET.ERD.UNREVIEWED',
        message: 'Chen source is disabled; its research rule card cannot establish conformance.' }],
    rules: [] };
}

/** A report's coverage must not change after a caller reads an installed card. */
function freezeCard(card: RulesetDefinition<GraphIR>): RulesetDefinition<GraphIR> {
  for (const obligation of card.obligations ?? []) Object.freeze(obligation);
  if (card.obligations) Object.freeze(card.obligations);
  for (const rule of card.rules) {
    Object.freeze(rule.provenance);
    Object.freeze(rule);
  }
  Object.freeze(card.rules);
  return Object.freeze(card);
}

const cards: Readonly<Record<string, RulesetDefinition<GraphIR>>> = Object.freeze({
  block: freezeCard(sharedCard('block')),
  flowchart: freezeCard(flowchartRuleset028),
  bpmn: freezeCard(bpmnRuleset028),
  erd: freezeCard(partialCard('erd')),
  code: freezeCard(sharedCard('code')),
  architecture: freezeCard(sharedCard('architecture')),
  infrastructure: freezeCard(sharedCard('infrastructure')),
  aiml: freezeCard(sharedCard('aiml')),
  'data-engineering': freezeCard(sharedCard('data-engineering')),
  sketch: freezeCard(sharedCard('sketch')),
  'uml-class': freezeCard(umlClassRuleset028),
  'uml-sequence': freezeCard(umlSequenceRuleset028),
  'uml-state': freezeCard(partialCard('uml-state')),
});

export function registeredProfileRuleCardIds028(): string[] {
  return Object.keys(cards);
}

export function profileRuleCard028(profileId: string,
  sourceDirections?: ReadonlyMap<string, SourceEdgeDirection028>): RulesetDefinition<GraphIR> {
  const card = Object.hasOwn(cards, profileId) ? cards[profileId] : undefined;
  if (!card) throw new Error(`Unreviewed conformance profile ${profileId}`);
  if (profileId === 'flowchart' && sourceDirections) return freezeCard(
    flowchartRulesetWithSourceDirections028(sourceDirections));
  if (profileId === 'bpmn' && sourceDirections) return freezeCard(
    bpmnRulesetWithSourceDirections028(sourceDirections));
  return card;
}
