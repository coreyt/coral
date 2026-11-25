import { describe, expect, it } from 'vitest';
import { diffGraphIRSuccessor, validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { prepareSequenceScene028, projectInstalledSourceToSuccessor028,
  renderSvg, successorCatalogSnapshot028, successorSourceDisplay028 } from '../src/index.js';
import { SuccessorDisplayCapabilityError028 } from '../src/successorSourceDisplay028.js';

const recursiveSource = '@diagram uml-sequence\nclient participant\nserver participant\nworker participant\n' +
  'team = participants worker, server [label: "Operations"]\n' +
  'spawn = client -.-> worker [create]\n' +
  'phase = region "Review" {\n  choice = alt "approved" {\n' +
  '    work = activation worker {\n      call = worker -> server as "check"\n' +
  '      note "Recorded" on call\n    }\n  } else "retry" {\n' +
  '    reply = server -> worker as "retry"\n  }\n}\n' +
  'close = worker -> server [destroy]\n';

function reservedInteraction() {
  const projected = projectInstalledSourceToSuccessor028(
    '@diagram uml-sequence\nclient participant\nserver participant\nrequest = client -> server\n');
  expect(projected.diagnostics).toEqual([]);
  const graph = structuredClone(projected.graph!);
  graph.edges = [];
  graph.interaction!.messages = [
    { id: 'lost-message', kind: 'lost', senderParticipantId: 'client', missingReceiver: true },
    { id: 'found-message', kind: 'found', missingSender: true, receiverParticipantId: 'server' },
  ];
  graph.interaction!.items = [
    { kind: 'message', id: 'lost-message' }, { kind: 'message', id: 'found-message' },
  ];
  return graph;
}

describe('Slice30 portable successor contracts', () => {
  it('keeps both reserved lost/found forms byte-preserving, ordered, and structurally closed', () => {
    const graph = reservedInteraction();
    const snapshot = successorCatalogSnapshot028(graph);
    const checked = validateGraphIRSuccessorWithCatalog(graph, snapshot);
    expect(checked.errors).toEqual([]);
    expect(checked.verification).toMatchObject({ complete: false, obligations: [
      { code: 'INTERACTION_MISSING_END_CAPABILITY_UNVERIFIED', path: '/interaction/messages/0' },
      { code: 'INTERACTION_MISSING_END_CAPABILITY_UNVERIFIED', path: '/interaction/messages/1' },
    ] });

    const serialized = JSON.stringify(graph);
    const restored = JSON.parse(serialized);
    expect(restored).toEqual(graph);
    expect(diffGraphIRSuccessor(graph, restored).changes).toEqual([]);
    expect(restored.interaction.items).toEqual(graph.interaction!.items);

    const invalid = (mutate: (candidate: any) => void) => {
      const candidate = structuredClone(graph);
      mutate(candidate);
      expect(validateGraphIRSuccessorWithCatalog(candidate, snapshot).valid).toBe(false);
    };
    invalid((candidate) => { candidate.interaction.messages[0].receiverParticipantId = 'server'; });
    invalid((candidate) => { candidate.interaction.messages[1].senderParticipantId = 'client'; });
    invalid((candidate) => { delete candidate.interaction.messages[0].senderParticipantId; });
    invalid((candidate) => { delete candidate.interaction.messages[1].receiverParticipantId; });
    invalid((candidate) => { candidate.interaction.messages[0].senderParticipantId = 'absent'; });
    invalid((candidate) => { candidate.interaction.messages[1].receiverParticipantId = 'absent'; });
    invalid((candidate) => { candidate.interaction.messages[1].id = 'lost-message'; });
    invalid((candidate) => { candidate.interaction.items.push({ kind: 'message', id: 'lost-message' }); });
  });

  it('refuses reserved lost/found display with an explicit capability error, never endpoint invention', () => {
    const graph = reservedInteraction();
    expect(() => successorSourceDisplay028(graph)).toThrow(SuccessorDisplayCapabilityError028);
    try {
      successorSourceDisplay028(graph);
    } catch (error) {
      expect(error).toMatchObject({ code: 'render.capability.sequence-message-kind' });
    }
  });

  it('keeps one combined recursive timeline ordered and owned by the shared scene', () => {
    const projected = projectInstalledSourceToSuccessor028(recursiveSource);
    expect(projected.diagnostics).toEqual([]);
    const graph = projected.graph!;
    expect(validateGraphIRSuccessorWithCatalog(graph, successorCatalogSnapshot028(graph)).errors).toEqual([]);
    expect(graph.interaction!.items).toEqual([
      { kind: 'message', id: 'spawn' }, { kind: 'region', id: 'phase' },
      { kind: 'message', id: 'close' },
    ]);
    const display = successorSourceDisplay028(graph);
    const prepared = prepareSequenceScene028(display, { successorSource: graph });
    expect(prepared.scene.messages.map(({ id }) => id)).toEqual(['spawn', 'call', 'reply', 'close']);
    expect(prepared.scene.regions?.map(({ id }) => id)).toEqual(['phase']);
    expect(prepared.scene.fragments.map(({ id }) => id)).toEqual(['choice']);
    expect(prepared.scene.activations.map(({ id }) => id)).toEqual(['work']);
    expect(prepared.scene.groups?.map(({ id }) => id)).toEqual(['team']);
    expect(prepared.ownerLookup.hitBounds).toEqual(expect.objectContaining({
      'region:phase': expect.any(Object), 'fragment:choice': expect.any(Object),
      'activation:work': expect.any(Object), 'message:call': expect.any(Object),
    }));
    expect(renderSvg(display, { successorSource: graph })).toContain('data-coral-sequence-region="phase"');
  });
});
