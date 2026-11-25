/**
 * Bounded inspector for UML sequence documents (Slice 70). Every control
 * issues one `SequenceOperation`; a refused operation leaves the document
 * unchanged and its reason stays visible.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SequenceSelection } from '@coral-viz/viz';
import type { SequenceDisplayTree028, SuccessorSourceInteraction028 } from '@coral-viz/render';
import type { GraphIR } from '../printer';
import type { SequenceOperation, SequenceOperationResult } from '../sequenceEditing';

export interface SequenceInspectorProps {
  graph: GraphIR;
  selected: SequenceSelection | null;
  error: string | null;
  mutationsDisabled?: boolean;
  /** Source-owned label transactions remain available while structural editing is locked. */
  sourceMessageLabelEditable?: boolean;
  onSourceMessageLabelEdit?: (messageId: string, label: string) => boolean;
  sourceMessageDeleteEditable?: boolean;
  onSourceMessageDelete?: (messageId: string) => boolean;
  sourceMessageInsertEditable?: boolean;
  onSourceAddMessageAfter?: (messageId: string) => void;
  sourceParticipantLabelEditable?: boolean;
  onSourceParticipantLabelEdit?: (participantId: string, label: string) => boolean;
  sourceParticipantDeleteEditable?: boolean;
  onSourceParticipantDelete?: (participantId: string) => boolean;
  onSelect: (selection: SequenceSelection | null) => void;
  onOperation: (operation: SequenceOperation) => SequenceOperationResult;
  onDismissError?: () => void;
}

const KINDS = [['sync', 'Synchronous'], ['async', 'Asynchronous'], ['return', 'Return']] as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="coral-field" style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

/** A text input that commits once, on Enter or blur, and only when changed. */
function CommitInput({ label, value, onCommit, disabled }: {
  label: string; value: string; onCommit: (value: string) => void | boolean; disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  useEffect(() => { setDraft(value); committed.current = value; }, [value]);
  const commit = () => {
    if (draft === committed.current) return;
    if (onCommit(draft) === false) setDraft(committed.current);
    else committed.current = draft;
  };
  return (
    <Row label={label}>
      <input
        className="coral-input"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(committed.current);
        }}
      />
    </Row>
  );
}

function Select({ label, value, options, onChange, disabled }: {
  label: string; value: string; options: readonly (readonly [string, string])[];
  onChange: (value: string) => void; disabled?: boolean;
}) {
  return (
    <Row label={label}>
      <select className="coral-input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </Row>
  );
}

function Button({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="coral-button coral-button--quiet" disabled={disabled} onClick={onClick}>{children}</button>;
}

export function SequenceInspector({
  graph, selected, error, mutationsDisabled = false, sourceMessageLabelEditable = false,
  onSourceMessageLabelEdit, sourceMessageDeleteEditable = false, onSourceMessageDelete,
  sourceMessageInsertEditable = false, onSourceAddMessageAfter,
  sourceParticipantLabelEditable = false, onSourceParticipantLabelEdit,
  sourceParticipantDeleteEditable = false, onSourceParticipantDelete,
  onSelect, onOperation, onDismissError,
}: SequenceInspectorProps) {
  const interaction = graph.interaction!;
  const recursiveFragments = (graph as GraphIR & { recursiveFragments028?: SequenceDisplayTree028 }).recursiveFragments028;
  const sourceTimeline = (graph as GraphIR & { sourceTimeline028?: SuccessorSourceInteraction028 }).sourceTimeline028;
  const disabled = mutationsDisabled || Boolean(sourceTimeline);
  const labelOf = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;
  const participants = interaction.participantOrder.map((id) => [id, labelOf(id)] as const);
  const messageName = (id: string) => {
    const edge = graph.edges.find((candidate) => candidate.id === id);
    const index = interaction.messageOrder.indexOf(id) + 1;
    return `${index}. ${labelOf(edge?.source ?? '')} → ${labelOf(edge?.target ?? '')}${edge?.label ? `: ${edge.label}` : ''}`;
  };
  const messages = interaction.messageOrder.map((id) => [id, messageName(id)] as const);
  const run = (operation: SequenceOperation) => { onOperation(operation); };

  const errorBanner = error ? (
    <div role="alert" className="coral-inline-error" style={{ marginBottom: 8 }}>
      {error}
      {onDismissError && <Button onClick={onDismissError}>Dismiss</Button>}
    </div>
  ) : null;

  let body: ReactNode;
  if (sourceTimeline && selected && ['activation', 'note', 'fragment', 'operand', 'region', 'group'].includes(selected.kind)) {
    const participantGroup = sourceTimeline.groups?.find((item) => item.id === selected.id);
    const region = sourceTimeline.regions?.find((item) => item.id === selected.id);
    const activation = sourceTimeline.activations?.find((item) => item.id === selected.id);
    const note = sourceTimeline.notes?.find((item) => item.id === selected.id);
    const fragment = sourceTimeline.fragments?.find((item) => item.id === selected.id ||
      item.operands.some((operand) => operand.id === selected.id));
    const operand = fragment?.operands.find((item) => item.id === selected.id);
    body = selected.kind === 'group' && participantGroup ? (
      <section aria-label="Participant group"><p>Participant group {participantGroup.id}</p>
        <CommitInput label="Label" value={participantGroup.label ?? ''} disabled onCommit={() => false} />
        <p>Members: {participantGroup.participantIds.join(', ') || 'none'}</p>
      </section>
    ) : selected.kind === 'region' && region ? (
      <section aria-label="Region"><p>Region {region.id}</p>
        <CommitInput label="Label" value={region.label ?? ''} disabled onCommit={() => false} />
        <p>{region.items.length} timeline items</p>
      </section>
    ) : selected.kind === 'activation' && activation ? (
      <section aria-label="Activation"><p>Activation of {labelOf(activation.participantId)}</p></section>
    ) : selected.kind === 'note' && note ? (
      <section aria-label="Note">
        <CommitInput label="Text" value={note.text} disabled onCommit={() => false} />
        <p>Targets: {[...(note.participantIds ?? []).map(labelOf),
          ...(note.messageIds ?? []).map((id) => `${id}: ${messageName(id)}`)].join(', ')}</p>
      </section>
    ) : selected.kind === 'fragment' && fragment ? (
      <section aria-label="Fragment">
        <p>{fragment.kind} fragment {fragment.id}</p>
        {fragment.operands.map((item, index) => <CommitInput key={item.id}
          label={`Guard ${index + 1}`} value={item.guard?.text ?? ''} disabled onCommit={() => false} />)}
      </section>
    ) : selected.kind === 'operand' && fragment && operand ? (
      <section aria-label="Operand">
        <p>Operand {fragment.operands.indexOf(operand) + 1} of {fragment.kind} fragment {fragment.id}</p>
        <CommitInput label="Guard" value={operand.guard?.text ?? ''} disabled onCommit={() => false} />
      </section>
    ) : null;
  } else if (selected?.kind === 'participant') {
    const node = graph.nodes.find((candidate) => candidate.id === selected.id);
    body = node && (
      <section aria-label="Participant">
        <CommitInput label="Name" value={node.label ?? node.id}
          disabled={disabled && !(sourceParticipantLabelEditable && onSourceParticipantLabelEdit)}
          onCommit={(label) => sourceParticipantLabelEditable && onSourceParticipantLabelEdit
            ? onSourceParticipantLabelEdit(node.id, label)
            : run({ type: 'updateParticipant', id: node.id, label })} />
        <Select label="Kind" value={node.type} disabled={disabled}
          options={[['participant', 'Participant'], ['actor', 'Actor']]}
          onChange={(kind) => run({ type: 'updateParticipant', id: node.id, kind: kind as 'participant' | 'actor' })} />
        <Button disabled={disabled} onClick={() => run({ type: 'moveParticipant', id: node.id, direction: -1 })}>Move left</Button>
        <Button disabled={disabled} onClick={() => run({ type: 'moveParticipant', id: node.id, direction: 1 })}>Move right</Button>
        <Button disabled={disabled} onClick={() => run({ type: 'addMessage', source: node.id })}>Add message from here</Button>
        <Button disabled={disabled && !(sourceParticipantDeleteEditable && onSourceParticipantDelete)}
          onClick={() => {
            if (sourceParticipantDeleteEditable && onSourceParticipantDelete)
              onSourceParticipantDelete(node.id);
            else run({ type: 'deleteParticipant', id: node.id });
          }}>Delete participant</Button>
      </section>
    );
  } else if (selected?.kind === 'message') {
    const edge = graph.edges.find((candidate) => candidate.id === selected.id);
    body = edge && <MessageEditor edge={edge} participants={participants} messages={messages}
      disabled={disabled} sourceMessageLabelEditable={sourceMessageLabelEditable}
      onSourceMessageLabelEdit={onSourceMessageLabelEdit}
      sourceMessageDeleteEditable={sourceMessageDeleteEditable}
      onSourceMessageDelete={onSourceMessageDelete}
      sourceMessageInsertEditable={sourceMessageInsertEditable}
      onSourceAddMessageAfter={onSourceAddMessageAfter} run={run} />;
  } else if (selected?.kind === 'activation') {
    const activation = interaction.activations?.find((candidate) => candidate.id === selected.id);
    body = activation && (
      <section aria-label="Activation">
        <p style={{ fontSize: 12 }}>Activation of {labelOf(activation.participantId)}</p>
        <Select label="Starts at" value={activation.startMessageId} options={messages} disabled={disabled}
          onChange={(startMessageId) => run({ type: 'updateActivation', id: activation.id, startMessageId })} />
        <Select label="Ends at" value={activation.endMessageId} options={messages} disabled={disabled}
          onChange={(endMessageId) => run({ type: 'updateActivation', id: activation.id, endMessageId })} />
        <Button disabled={disabled} onClick={() => run({ type: 'deleteActivation', id: activation.id })}>Delete activation</Button>
      </section>
    );
  } else if (selected?.kind === 'note') {
    const note = interaction.notes?.find((candidate) => candidate.id === selected.id);
    const targets = [...(note?.participantIds ?? []), ...(note?.messageIds ?? [])];
    body = note && (
      <section aria-label="Note">
        <CommitInput label="Text" value={note.text} disabled={disabled}
          onCommit={(text) => run({ type: 'updateNote', id: note.id, text })} />
        <fieldset style={{ border: 0, padding: 0 }}>
          <legend style={{ fontSize: 12 }}>Targets</legend>
          {[...participants, ...messages].map(([id, name]) => (
            <label key={id} style={{ display: 'block', fontSize: 12 }}>
              <input type="checkbox" checked={targets.includes(id)} disabled={disabled}
                onChange={(event) => run({
                  type: 'updateNote', id: note.id,
                  targets: event.target.checked ? [...targets, id] : targets.filter((target) => target !== id),
                })} />
              {' '}{name}
            </label>
          ))}
        </fieldset>
        <Button disabled={disabled} onClick={() => run({ type: 'deleteNote', id: note.id })}>Delete note</Button>
      </section>
    );
  } else if (selected?.kind === 'fragment') {
    const fragment = interaction.fragments?.find((candidate) => candidate.id === selected.id);
    const recursiveFragment = recursiveFragments?.fragments.find((candidate) => candidate.id === selected.id);
    body = fragment ? (
      <section aria-label="Fragment">
        <p style={{ fontSize: 12 }}>{fragment.kind} fragment</p>
        {fragment.operands.map((operand, index) => (
          <CommitInput key={operand.id} label={`Guard ${index + 1}`} value={operand.guard?.text ?? ''} disabled={disabled}
            onCommit={(guard) => run({ type: 'updateGuard', fragmentId: fragment.id, operandIndex: index, guard: guard || undefined })} />
        ))}
        {fragment.kind === 'alt' && (
          <Select label="Split a new branch at" value="" disabled={disabled}
            options={[['', 'Choose a message'], ...messages.filter(([id]) => fragment.operands.some((operand) => operand.messageIds.includes(id)))]}
            onChange={(messageId) => { if (messageId) run({ type: 'splitOperand', fragmentId: fragment.id, messageId }); }} />
        )}
        <Button disabled={disabled} onClick={() => run({ type: 'deleteFragment', id: fragment.id })}>Remove fragment (keep messages)</Button>
      </section>
    ) : recursiveFragment && (
      <section aria-label="Fragment">
        <p style={{ fontSize: 12 }}>{recursiveFragment.kind} fragment</p>
        {recursiveFragment.operands.map((operand, index) => (
          <CommitInput key={operand.id} label={`Guard ${index + 1}`} value={operand.guard}
            disabled onCommit={() => false} />
        ))}
      </section>
    );
  } else if (selected?.kind === 'operand') {
    const fragment = interaction.fragments?.find((candidate) =>
      candidate.operands.some((operand) => operand.id === selected.id));
    const index = fragment?.operands.findIndex((operand) => operand.id === selected.id) ?? -1;
    const operand = index >= 0 ? fragment?.operands[index] : undefined;
    const recursiveFragment = recursiveFragments?.fragments.find((candidate) =>
      candidate.operands.some((item) => item.id === selected.id));
    const recursiveIndex = recursiveFragment?.operands.findIndex((item) => item.id === selected.id) ?? -1;
    const recursiveOperand = recursiveIndex >= 0 ? recursiveFragment?.operands[recursiveIndex] : undefined;
    body = fragment && operand ? (
      <section aria-label="Operand">
        <p style={{ fontSize: 12 }}>Operand {index + 1} of {fragment.kind} fragment</p>
        <CommitInput label="Guard" value={operand.guard?.text ?? ''} disabled={disabled}
          onCommit={(guard) => run({ type: 'updateGuard', fragmentId: fragment.id,
            operandIndex: index, guard: guard || undefined })} />
      </section>
    ) : recursiveFragment && recursiveOperand && (
      <section aria-label="Operand">
        <p style={{ fontSize: 12 }}>Operand {recursiveIndex + 1} of {recursiveFragment.kind} fragment {recursiveFragment.id}</p>
        <CommitInput label="Guard" value={recursiveOperand.guard} disabled onCommit={() => false} />
      </section>
    );
  } else {
    body = (
      <section aria-label="Sequence diagram">
        <p style={{ fontSize: 12 }}>Select a participant, message, activation, note, fragment, or operand on the diagram.</p>
        <Button disabled={disabled} onClick={() => run({ type: 'addParticipant', kind: 'participant' })}>Add participant</Button>
        <Button disabled={disabled} onClick={() => run({ type: 'addParticipant', kind: 'actor' })}>Add actor</Button>
        <Button disabled={disabled || participants.length === 0} onClick={() => run({ type: 'addMessage' })}>Add message</Button>
        <Button disabled={disabled || participants.length === 0}
          onClick={() => run({ type: 'addNote', text: 'Note', targets: [participants[0][0]] })}>Add note</Button>
      </section>
    );
  }

  return (
    <div className="coral-sequence-inspector" style={{ padding: 8 }}>
      {errorBanner}
      {body ?? <Button onClick={() => onSelect(null)}>Clear selection</Button>}
    </div>
  );
}

function MessageEditor({ edge, participants, messages, disabled, sourceMessageLabelEditable,
  onSourceMessageLabelEdit, sourceMessageDeleteEditable, onSourceMessageDelete,
  sourceMessageInsertEditable, onSourceAddMessageAfter, run }: {
  edge: GraphIR['edges'][number];
  participants: readonly (readonly [string, string])[];
  messages: readonly (readonly [string, string])[];
  disabled: boolean;
  sourceMessageLabelEditable: boolean;
  onSourceMessageLabelEdit?: (messageId: string, label: string) => boolean;
  sourceMessageDeleteEditable: boolean;
  onSourceMessageDelete?: (messageId: string) => boolean;
  sourceMessageInsertEditable: boolean;
  onSourceAddMessageAfter?: (messageId: string) => void;
  run: (operation: SequenceOperation) => void;
}) {
  const [wrapKind, setWrapKind] = useState<'loop' | 'alt' | 'opt'>('opt');
  const [wrapLast, setWrapLast] = useState(edge.id);
  const [activationEnd, setActivationEnd] = useState(edge.id);
  useEffect(() => { setWrapLast(edge.id); setActivationEnd(edge.id); }, [edge.id]);
  const later = messages.slice(messages.findIndex(([id]) => id === edge.id));
  return (
    <section aria-label="Message">
      <CommitInput key={edge.id} label="Label" value={edge.label ?? ''}
        disabled={disabled && !(sourceMessageLabelEditable && onSourceMessageLabelEdit)}
        onCommit={(label) => {
          if (sourceMessageLabelEditable && onSourceMessageLabelEdit)
            return onSourceMessageLabelEdit(edge.id, label);
          return run({ type: 'updateMessage', id: edge.id, label });
        }} />
      <Select label="Kind" value={edge.type ?? 'sync'} options={edge.type === 'destroy' ? [...KINDS, ['destroy', 'Destruction']] : KINDS}
        disabled={disabled || edge.type === 'destroy'}
        onChange={(kind) => run({ type: 'updateMessage', id: edge.id, kind: kind as 'sync' | 'async' | 'return' })} />
      <Select label="From" value={edge.source} options={participants} disabled={disabled}
        onChange={(source) => run({ type: 'updateMessage', id: edge.id, source })} />
      <Select label="To" value={edge.target} options={participants} disabled={disabled}
        onChange={(target) => run({ type: 'updateMessage', id: edge.id, target })} />
      <Button disabled={disabled} onClick={() => run({ type: 'moveMessage', id: edge.id, direction: -1 })}>Move earlier</Button>
      <Button disabled={disabled} onClick={() => run({ type: 'moveMessage', id: edge.id, direction: 1 })}>Move later</Button>
      <Button disabled={disabled && !(sourceMessageInsertEditable && onSourceAddMessageAfter)}
        onClick={() => {
          if (sourceMessageInsertEditable && onSourceAddMessageAfter) onSourceAddMessageAfter(edge.id);
          else run({ type: 'addMessage', after: edge.id });
        }}>Add message after</Button>
      <Button disabled={disabled} onClick={() => run({ type: 'addNote', text: 'Note', targets: [edge.id] })}>Add note</Button>
      <Button disabled={disabled && !(sourceMessageDeleteEditable && onSourceMessageDelete)}
        onClick={() => {
          if (sourceMessageDeleteEditable && onSourceMessageDelete) onSourceMessageDelete(edge.id);
          else run({ type: 'deleteMessage', id: edge.id });
        }}>Delete message</Button>
      <fieldset style={{ border: 0, padding: 0, marginTop: 8 }}>
        <legend style={{ fontSize: 12 }}>Activate the receiver</legend>
        <Select label="Until message" value={activationEnd} options={later} disabled={disabled} onChange={setActivationEnd} />
        <Button disabled={disabled} onClick={() => run({
          type: 'addActivation', participantId: edge.target, startMessageId: edge.id, endMessageId: activationEnd,
        })}>Add activation</Button>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, marginTop: 8 }}>
        <legend style={{ fontSize: 12 }}>Wrap in a fragment</legend>
        <Select label="Kind" value={wrapKind} options={[['loop', 'loop'], ['alt', 'alt'], ['opt', 'opt']]} disabled={disabled}
          onChange={(kind) => setWrapKind(kind as 'loop' | 'alt' | 'opt')} />
        <Select label="Through message" value={wrapLast} options={later} disabled={disabled} onChange={setWrapLast} />
        <Button disabled={disabled} onClick={() => run({
          type: 'addFragment', kind: wrapKind, firstMessageId: edge.id, lastMessageId: wrapLast,
        })}>Add fragment</Button>
      </fieldset>
    </section>
  );
}
