import type { SequenceScene, SequenceSceneActivation, SequenceSceneFragment,
  SequenceSceneNote, SequenceSceneRegion } from './sequence.js';
import type { SuccessorSourceInteraction028 } from './successorSourceProjection028.js';
import { measureText } from './text/metrics.js';

type Item = SuccessorSourceInteraction028['items'][number];
type Event = Item | { kind: 'open' | 'close' | 'region-open' | 'region-close'; id: string; depth: number } |
  { kind: 'operand'; id: string; index: number } | { kind: 'space'; height: number };

/** Execute the source timeline's event order. The baseline contributes only
 * message/header measurements; the source tree owns frames and decorations. */
export function layoutSourceTimeline028(base: SequenceScene,
  interaction: SuccessorSourceInteraction028): SequenceScene {
  function fail(message: string): never { throw new Error(`coral.sequence.layout.invalid: ${message}`); }
  const fragmentsById = new Map((interaction.fragments ?? []).map((fragment) => [fragment.id, fragment]));
  const regionsById = new Map((interaction.regions ?? []).map((region) => [region.id, region]));
  const notesById = new Map((interaction.notes ?? []).map((note) => [note.id, note]));
  const activationsById = new Map((interaction.activations ?? []).map((activation) => [activation.id, activation]));
  const participants = new Map(base.participants.map((participant) => [participant.id, participant]));
  const messages = new Map(base.messages.map((message) => [message.id, message]));
  if (fragmentsById.size !== (interaction.fragments?.length ?? 0) ||
    regionsById.size !== (interaction.regions?.length ?? 0) ||
    notesById.size !== (interaction.notes?.length ?? 0) || activationsById.size !== (interaction.activations?.length ?? 0))
    fail('duplicate source timeline identity');
  if (interaction.participantOrder.length !== base.participants.length ||
    interaction.participantOrder.some((id, index) => id !== base.participants[index].id) ||
    interaction.messages.length !== base.messages.length || interaction.messages.some((message) => {
      const baseline = messages.get(message.id);
      return !baseline || baseline.kind !== message.kind || baseline.sourceId !== message.senderParticipantId ||
        baseline.targetId !== message.receiverParticipantId;
    })) fail('source timeline does not match its measured baseline');
  const itemIds = [...interaction.messages, ...(interaction.fragments ?? []), ...(interaction.regions ?? []),
    ...(interaction.notes ?? []), ...(interaction.activations ?? [])].map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length) fail('duplicate source timeline identity');
  const rootPositions = new Map<string, number>();
  const uses: Array<{ participantId: string; root: number; messageId?: string }> = [];
  const events: Event[] = [];
  const seen = new Set<string>();
  const seenRegions = new Set<string>();
  const seenNotes = new Set<string>();
  const started = new Set<string>();
  const ended = new Set<string>();
  let count = 0;
  const walk = (items: readonly Item[], depth: number, active: readonly string[] = [], root = -1): void => {
    if (depth > 128 || (count += items.length) > 10000) fail('source timeline exceeds safe traversal limits');
    const scopeMessages = new Set(items.filter((item) => item.kind === 'message').map((item) => item.id));
    const stack = [...active];
    for (const [position, item] of items.entries()) {
      const rootIndex = depth === 0 ? position : root;
      if (item.kind === 'message') {
        rootPositions.set(item.id, rootIndex);
        const message = messages.get(item.id);
        if (message) for (const participantId of [message.sourceId, message.targetId])
          uses.push({ participantId, root: rootIndex, messageId: item.id });
      } else if (item.kind === 'note') {
        for (const participantId of notesById.get(item.id)?.participantIds ?? [])
          uses.push({ participantId, root: rootIndex });
      } else if (item.kind === 'activation-start' || item.kind === 'activation-end') {
        const activation = activationsById.get(item.id);
        if (activation) uses.push({ participantId: activation.participantId, root: rootIndex });
      }
      if (item.kind === 'note') {
        if (!notesById.has(item.id) || seenNotes.has(item.id)) fail('missing or repeated source note');
        const note = notesById.get(item.id)!;
        if (note.messageIds?.some((id) => !scopeMessages.has(id))) fail('note targets a different timeline scope');
        seenNotes.add(item.id);
      } else if (item.kind === 'activation-start') {
        if (!activationsById.has(item.id) || started.has(item.id)) fail('missing or repeated source activation');
        started.add(item.id); stack.push(item.id);
      } else if (item.kind === 'activation-end') {
        const activation = activationsById.get(item.id);
        const last = stack.map((id) => activationsById.get(id)?.participantId).lastIndexOf(activation?.participantId);
        if (!activation || last < 0 || stack[last] !== item.id || ended.has(item.id)) fail('crossing or repeated source activation end');
        ended.add(item.id); stack.splice(last, 1);
      }
      if (item.kind === 'message' && depth > 0 &&
        ['create', 'destroy'].includes(messages.get(item.id)?.kind ?? '')) fail('lifecycle message must occur at root');
      if (item.kind === 'region') {
        const region = regionsById.get(item.id);
        if (!region || seenRegions.has(item.id)) fail('missing or repeated source region');
        seenRegions.add(item.id);
        events.push({ kind: 'region-open', id: item.id, depth });
        walk(region.items, depth + 1, stack, rootIndex);
        if (!region.items.length) events.push({ kind: 'space', height: 16 });
        events.push({ kind: 'region-close', id: item.id, depth });
        continue;
      }
      if (item.kind !== 'fragment') { events.push(item); continue; }
      const fragment = fragmentsById.get(item.id);
      if (!fragment || seen.has(item.id)) fail('missing or repeated source fragment');
      seen.add(item.id);
      events.push({ kind: 'open', id: item.id, depth });
      fragment.operands.forEach((operand, index) => {
        events.push({ kind: 'operand', id: item.id, index });
        walk(operand.items, depth + 1, stack, rootIndex);
        if (!operand.items.length) events.push({ kind: 'space', height: 16 });
      });
      events.push({ kind: 'close', id: item.id, depth });
    }
    if (stack.length !== active.length || stack.some((id, i) => id !== active[i]))
      fail('activation crosses a source operand boundary');
  };
  walk(interaction.items, 0);
  if (seen.size !== fragmentsById.size || seenRegions.size !== regionsById.size || seenNotes.size !== notesById.size ||
    started.size !== activationsById.size || ended.size !== activationsById.size)
    fail('source timeline omits a fragment, note or activation');
  for (const participant of interaction.participants) {
    for (const [field, kind] of [['createdByMessageId', 'create'], ['destroyedByMessageId', 'destroy']] as const) {
      const id = participant[field];
      if (id === undefined) continue;
      const message = messages.get(id);
      const root = rootPositions.get(id);
      if (!message || message.kind !== kind || message.targetId !== participant.id || root === undefined)
        fail('invalid participant lifecycle link');
      if (uses.some((use) => use.participantId === participant.id && use.messageId !== id &&
        (kind === 'create' ? use.root <= root : use.root >= root))) fail('participant used outside its lifetime');
    }
  }
  const ordered = events.flatMap((event) => event.kind === 'message' ? [event.id] : []);
  if (ordered.length !== base.messages.length || ordered.some((id, index) => id !== base.messages[index].id))
    fail('source timeline changes message order');
  const text = (value: string) => measureText({ text: value, fontSize: base.font.size,
    fontFamily: base.font.cssFamily, fontWeight: base.font.weight });
  // Collect the exact set of participating lifelines, notes, and messages inside each fragment/region
  // so frames scope tightly to their involved participants instead of spanning unrelated columns.
  const fragmentScope = new Map<string, { participants: Set<string>; messages: Set<string>; notes: Set<string>; childFragments: Set<string> }>();
  const regionScope = new Map<string, { participants: Set<string>; messages: Set<string>; notes: Set<string>; childFragments: Set<string> }>();
  const collectScope = (items: readonly Item[]): { participants: Set<string>; messages: Set<string>; notes: Set<string>; childFragments: Set<string> } => {
    const scope = { participants: new Set<string>(), messages: new Set<string>(), notes: new Set<string>(), childFragments: new Set<string>() };
    const merge = (child: { participants: Set<string>; messages: Set<string>; notes: Set<string>; childFragments: Set<string> }) => {
      for (const p of child.participants) scope.participants.add(p);
      for (const m of child.messages) scope.messages.add(m);
      for (const n of child.notes) scope.notes.add(n);
      for (const f of child.childFragments) scope.childFragments.add(f);
    };
    for (const item of items) {
      if (item.kind === 'message') {
        scope.messages.add(item.id);
        const msg = messages.get(item.id);
        if (msg) { scope.participants.add(msg.sourceId); scope.participants.add(msg.targetId); }
      } else if (item.kind === 'note') {
        scope.notes.add(item.id);
        const note = notesById.get(item.id);
        for (const p of note?.participantIds ?? []) scope.participants.add(p);
        for (const mid of note?.messageIds ?? []) {
          const msg = messages.get(mid);
          if (msg) { scope.participants.add(msg.sourceId); scope.participants.add(msg.targetId); }
        }
      } else if (item.kind === 'activation-start' || item.kind === 'activation-end') {
        const act = activationsById.get(item.id);
        if (act) scope.participants.add(act.participantId);
      } else if (item.kind === 'region') {
        const reg = regionsById.get(item.id)!;
        const sub = collectScope(reg.items);
        regionScope.set(item.id, sub);
        merge(sub);
      } else if (item.kind === 'fragment') {
        const frag = fragmentsById.get(item.id)!;
        const sub = { participants: new Set<string>(), messages: new Set<string>(), notes: new Set<string>(), childFragments: new Set<string>() };
        for (const op of frag.operands) {
          const opSub = collectScope(op.items);
          for (const p of opSub.participants) sub.participants.add(p);
          for (const m of opSub.messages) sub.messages.add(m);
          for (const n of opSub.notes) sub.notes.add(n);
          for (const f of opSub.childFragments) sub.childFragments.add(f);
        }
        fragmentScope.set(item.id, sub);
        merge(sub);
        scope.childFragments.add(item.id);
      }
    }
    return scope;
  };
  collectScope(interaction.items);

  const depth = Math.max(0, ...events.flatMap((event) => event.kind === 'open' || event.kind === 'region-open' ? [event.depth] : []));
  const firstParticipantId = interaction.participantOrder[0];
  // Only reserve left canvas margin for guards belonging to fragments that touch the leftmost lifeline
  // (or have no participating lifelines). Fragments starting at column >= 1 place their guard in the
  // open lane right of their first involved lifeline instead of stretching over unrelated columns.
  const col0Guards = [...fragmentsById.values()]
    .filter((fragment) => {
      const ps = fragmentScope.get(fragment.id)?.participants;
      return !ps || ps.size === 0 || (firstParticipantId !== undefined && ps.has(firstParticipantId));
    })
    .flatMap((fragment) => fragment.operands
      .flatMap((operand) => operand.guard ? [text(`[${operand.guard.text}]`).width] : []));
  const touchesCol0 = [...fragmentsById.values()].some((f) => {
    const ps = fragmentScope.get(f.id)?.participants;
    return !ps || ps.size === 0 || (firstParticipantId !== undefined && ps.has(firstParticipantId));
  }) || [...regionsById.values()].some((r) => {
    const ps = regionScope.get(r.id)?.participants;
    return !ps || ps.size === 0 || (firstParticipantId !== undefined && ps.has(firstParticipantId));
  });
  const inset = col0Guards.length > 0
    ? Math.max((depth + 1) * 12, Math.max(...col0Guards) + 24 + depth * 12)
    : touchesCol0 ? (depth + 1) * 12 : 0;
  const tabHeight = Math.max(20, base.lineHeight + 8);
  const rowTops = base.messages.map((message) => Math.min(
    Math.min(...message.points.map((point) => point.y)) - base.lineHeight - 10,
    message.label ? message.label.y - base.messageFont.lineHeight : Infinity));
  const frames = new Map<string, { top: number; bottom: number; depth: number;
    operands: SequenceSceneFragment['operands'] }>();
  const regionFrames = new Map<string, { top: number; bottom: number; depth: number; headingHeight: number }>();
  const bars = new Map<string, SequenceSceneActivation>();
  const active = new Set<string>();
  const activeAt = new Map<string, string[]>();
  const notes: SequenceSceneNote[] = [];
  const offsets = new Map<string, number>();
  let index = 0;
  let offset = 0;
  const anchor = () => (rowTops[index] ?? base.height - 24) + offset;
  for (const event of events) {
    if (event.kind === 'space') { offset += event.height; continue; }
    if (event.kind === 'region-open') {
      if (index > 0) offset += 8;
      const region = regionsById.get(event.id)!;
      const headingHeight = region.label !== undefined ? text(region.label).lines.length * base.lineHeight + 12 : 8;
      regionFrames.set(event.id, { top: anchor() - 4, bottom: 0, depth: event.depth, headingHeight });
      offset += headingHeight + 8;
    } else if (event.kind === 'region-close') {
      regionFrames.get(event.id)!.bottom = anchor() + 4;
      offset += 18;
    } else if (event.kind === 'open') {
      if (index > 0) offset += 8;
      frames.set(event.id, { top: anchor() - 4, bottom: 0, depth: event.depth, operands: [] });
      offset += tabHeight + 4;
    } else if (event.kind === 'operand') {
      const frame = frames.get(event.id)!;
      const operand = fragmentsById.get(event.id)!.operands[event.index];
      const displayed: SequenceSceneFragment['operands'][number] = { id: operand.id };
      if (event.index > 0) { displayed.separatorY = anchor(); offset += 8; }
      if (operand.guard) {
        const measured = text(`[${operand.guard.text}]`);
        displayed.guard = { lines: measured.lines, x: 0,
          y: anchor() + base.lineHeight - 4, anchor: 'start' };
        offset += measured.lines.length * base.lineHeight + 12;
      } else offset += 4;
      frame.operands.push(displayed);
    } else if (event.kind === 'close') {
      frames.get(event.id)!.bottom = anchor() + 4;
      offset += 18;
    } else if (event.kind === 'message') {
      offsets.set(event.id, offset);
      activeAt.set(event.id, [...active]);
      index++;
      const message = messages.get(event.id)!;
      if (message.kind === 'create') {
        const header = participants.get(message.targetId)!.header;
        const minimum = header.y + header.height + offsets.get(event.id)! + 12;
        if (anchor() < minimum) offset += minimum - anchor();
      }
    } else if (event.kind === 'activation-start') {
      const activation = activationsById.get(event.id);
      const participant = activation && participants.get(activation.participantId);
      if (!activation || !participant || bars.has(event.id)) fail('invalid activation start');
      const levels = new Set([...active].map((id) => bars.get(id)!)
        .filter((bar) => bar.participantId === participant.id)
        .map((bar) => Math.round((bar.x - participant.lifeline.x - inset + 5) / 5)));
      let level = 0;
      while (levels.has(level)) level++;
      bars.set(event.id, { id: event.id, participantId: participant.id,
        x: participant.lifeline.x + inset - 5 + level * 5, y: anchor(), width: 10, height: 0,
        accessibleName: `Activation of ${participant.label.lines.join(' ')} (${event.id})` });
      active.add(event.id);
      offset += 8;
    } else if (event.kind === 'activation-end') {
      const bar = bars.get(event.id);
      if (!bar || !active.has(event.id)) fail('invalid activation end');
      const minimum = bar.y + 16;
      if (anchor() < minimum) offset += minimum - anchor();
      bar.height = anchor() - bar.y;
      active.delete(event.id);
      offset += 8;
    } else if (event.kind === 'note') {
      const note = notesById.get(event.id);
      if (!note) fail('unresolved source note');
      const targets = [...(note.participantIds ?? []).map((id) => participants.get(id)),
        ...(note.messageIds ?? []).flatMap((id) => {
          const message = messages.get(id);
          return message ? [participants.get(message.sourceId), participants.get(message.targetId)] : [undefined];
        })];
      if (targets.some((target) => !target)) fail('unresolved note target');
      const xs = (targets.length ? targets : [...participants.values()]).map((target) => target!.lifeline.x + inset);
      if (!xs.length) xs.push(base.width / 2 + inset);
      const measured = text(note.text);
      const width = Math.max(80, measured.width + 16, Math.max(...xs) - Math.min(...xs) + 32);
      const height = measured.lines.length * base.lineHeight + 12;
      const left = (Math.min(...xs) + Math.max(...xs)) / 2 - width / 2;
      const targetNames = [...(note.participantIds ?? []).map((id) => participants.get(id)!.label.lines.join(' ')),
        ...(note.messageIds ?? []).map((id) => `message ${id}`)];
      notes.push({ id: note.id, x: left, y: anchor(), width, height,
        text: { lines: measured.lines, x: left + 8, y: anchor() + base.lineHeight + 2, anchor: 'start' },
        accessibleName: targetNames.length ? `Note ${note.id} on ${targetNames.join(', ')}: ${note.text}` : `Timeline note ${note.id}: ${note.text}` });
      offset += height + 12;
    } else fail('unsupported source timeline item');
  }
  if (active.size) fail('unclosed source activation');
  const extra = Math.max(0, 16 + depth * 12 - Math.min(Infinity, ...notes.map((note) => note.x)));
  const dx = inset + extra;
  const activations = [...bars.values()].map((bar) => ({ ...bar, x: bar.x + extra }));
  const deepest = (messageId: string, participantId: string) => (activeAt.get(messageId) ?? [])
    .map((id) => bars.get(id)!).filter((bar) => bar.participantId === participantId)
    .sort((a, b) => b.x - a.x)[0];
  const shiftedMessages = base.messages.map((message) => {
    const dy = offsets.get(message.id)!;
    const points = message.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
    const sender = deepest(message.id, message.sourceId);
    const receiver = deepest(message.id, message.targetId);
    if (sender) points[0].x = sender.x + extra + (points[1].x >= points[0].x ? sender.width : 0);
    if (receiver && message.kind !== 'create' && message.kind !== 'destroy') {
      const last = points.length - 1;
      points[last].x = receiver.x + extra + (points[last - 1].x <= points[last].x ? 0 : receiver.width);
    }
    if (message.self) {
      const outer = Math.max(...points.map((point) => point.x), points[0].x + 36);
      points.slice(1, -1).forEach((point) => { point.x = outer; });
    }
    return { ...message, points, ...(message.label ? { label: { ...message.label,
      x: message.self ? points[0].x + 36 : (points[0].x + points.at(-1)!.x) / 2,
      y: message.label.y + dy } } : {}) };
  });
  const shiftedNotes = notes.map((note) => ({ ...note, x: note.x + extra,
    text: { ...note.text, x: note.text.x + extra } }));
  const shiftedLifelineX = new Map(base.participants.map((p) => [p.id, p.lifeline.x + dx] as const));
  const sortedLifelines = [...base.participants].map((p) => ({ id: p.id, x: p.lifeline.x + dx })).sort((a, b) => a.x - b.x);
  const shiftedMsgById = new Map(shiftedMessages.map((m) => [m.id, m] as const));
  const shiftedNoteById = new Map(shiftedNotes.map((n) => [n.id, n] as const));
  const baseRightEdge = Math.max(
    base.width + dx,
    ...shiftedNotes.map((note) => note.x + note.width + 16 + depth * 12),
    ...shiftedMessages.flatMap((message) => message.points.map((point) => point.x + 24)),
    ...activations.map((bar) => bar.x + bar.width + 24),
    ...shiftedMessages.flatMap((message) => {
      if (!message.label) return [];
      const measured = measureText({ text: message.label.lines.join('\n'),
        fontSize: base.messageFont.size, fontFamily: base.messageFont.cssFamily,
        fontWeight: base.messageFont.weight });
      return [message.label.x + measured.width * (message.label.anchor === 'start' ? 1 :
        message.label.anchor === 'middle' ? 0.5 : 0) + 24];
    }),
  );

  const scopeExtent = (
    scope: { participants: Set<string>; messages: Set<string>; notes: Set<string> } | undefined,
    frameDepth: number,
  ): { minLifelineX: number; maxLifelineX: number; minContentX: number; maxContentX: number; hasParticipants: boolean } => {
    const xs = scope ? [...scope.participants].map((id) => shiftedLifelineX.get(id)).filter((v): v is number => v !== undefined) : [];
    const hasParticipants = xs.length > 0;
    const minLifelineX = hasParticipants ? Math.min(...xs) : (sortedLifelines[0]?.x ?? 40);
    const maxLifelineX = hasParticipants ? Math.max(...xs) : (sortedLifelines.at(-1)?.x ?? baseRightEdge - 24);
    const pad = Math.max(18, 28 - frameDepth * 4);
    let minContentX = minLifelineX - pad;
    let maxContentX = maxLifelineX + pad;
    if (scope) {
      for (const nid of scope.notes) {
        const n = shiftedNoteById.get(nid);
        if (n) {
          minContentX = Math.min(minContentX, n.x - 8);
          maxContentX = Math.max(maxContentX, n.x + n.width + 8);
        }
      }
      for (const mid of scope.messages) {
        const m = shiftedMsgById.get(mid);
        if (!m) continue;
        for (const pt of m.points) {
          minContentX = Math.min(minContentX, pt.x - 14);
          maxContentX = Math.max(maxContentX, pt.x + 14);
        }
        if (m.self && m.label) {
          const mw = measureText({ text: m.label.lines.join('\n'),
            fontSize: base.messageFont.size, fontFamily: base.messageFont.cssFamily,
            fontWeight: base.messageFont.weight }).width;
          maxContentX = Math.max(maxContentX, m.label.x + mw + 12);
        }
      }
    }
    return { minLifelineX, maxLifelineX, minContentX, maxContentX, hasParticipants };
  };

  const displayedFrames: SequenceSceneFragment[] = [...fragmentsById.values()].map((fragment) => {
    const frame = frames.get(fragment.id)!;
    const scope = fragmentScope.get(fragment.id);
    const ext = scopeExtent(scope, frame.depth);
    const tabWidth = measureText({ text: fragment.kind,
      fontSize: base.font.size, fontFamily: base.font.cssFamily, fontWeight: 700 }).width + 16;
    const maxGuardW = Math.max(0, ...frame.operands.map((op) =>
      op.guard ? text(op.guard.lines.join('\n')).width : 0));
    const includesCol0 = !ext.hasParticipants || (firstParticipantId !== undefined && scope!.participants.has(firstParticipantId));

    let left: number;
    let guardX: number;
    if (includesCol0) {
      left = 8 + frame.depth * 12;
      guardX = left + 8;
    } else {
      // Fragment starts at column >= 1 (e.g. s09 alt starting at Failover Controller):
      // keep left cleanly between the previous uninvolved lifeline and firstInvolvedX,
      // and place guards to the right of firstInvolvedX so lifelines never strike through them.
      const prevLifeline = [...sortedLifelines].reverse().find((l) => l.x < ext.minLifelineX - 1);
      const minAllowedLeft = prevLifeline ? prevLifeline.x + 16 : 8 + frame.depth * 12;
      left = Math.max(minAllowedLeft, Math.min(ext.minContentX, ext.minLifelineX - Math.max(tabWidth + 10, 44)));
      guardX = Math.max(left + 8, ext.minLifelineX + 10);
    }
    const right = Math.max(
      ext.maxContentX,
      left + tabWidth + 24,
      guardX + maxGuardW + 14,
    );
    return { id: fragment.id, kind: fragment.kind, x: left, y: frame.top,
      width: right - left, height: frame.bottom - frame.top,
      tab: { x: left, y: frame.top, width: tabWidth, height: tabHeight,
        text: { lines: [fragment.kind], x: left + 8, y: frame.top + base.lineHeight - 1, anchor: 'start' } },
      operands: frame.operands.map((operand) => ({ ...operand,
        ...(operand.guard ? { guard: { ...operand.guard, x: guardX } } : {}) })),
      accessibleName: `${fragment.kind} fragment ${fragment.id}, operands: ${fragment.operands
        .map((operand) => operand.guard ? `[${operand.guard.text}]` : 'unguarded').join(', ')}`,
    };
  });

  const frameById = new Map(displayedFrames.map((f) => [f.id, f] as const));
  const regions: SequenceSceneRegion[] = [...regionsById.values()].map((region) => {
    const frame = regionFrames.get(region.id)!;
    const scope = regionScope.get(region.id);
    const ext = scopeExtent(scope, frame.depth);
    const labelMetrics = region.label !== undefined ? text(region.label) : undefined;
    const prevLifeline = ext.hasParticipants
      ? [...sortedLifelines].reverse().find((l) => l.x < ext.minLifelineX - 1)
      : undefined;
    let left = ext.hasParticipants
      ? Math.max(prevLifeline ? prevLifeline.x + 14 : 8 + frame.depth * 12, ext.minContentX)
      : 8 + frame.depth * 12;
    let right = ext.maxContentX;
    for (const fid of scope?.childFragments ?? []) {
      const child = frameById.get(fid);
      if (child) {
        left = Math.min(left, Math.max(4, child.x - 10));
        right = Math.max(right, child.x + child.width + 10);
      }
    }
    // Place the region title badge in the open lane to the right of the first participating
    // lifeline so the badge never collides with or interrupts the vertical lifeline.
    const nextLifeline = ext.hasParticipants
      ? sortedLifelines.find((l) => l.x > ext.minLifelineX + 1)
      : undefined;
    const labelX = labelMetrics !== undefined && ext.hasParticipants && nextLifeline
      && (nextLifeline.x - ext.minLifelineX >= labelMetrics.width + 24)
      ? ext.minLifelineX + 14
      : left + 12;
    right = Math.max(
      right,
      labelMetrics !== undefined ? labelX + labelMetrics.width + 18 : left + 48,
    );
    return { id: region.id, x: left, y: frame.top, width: right - left,
      height: frame.bottom - frame.top, headingHeight: frame.headingHeight,
      ...(region.label !== undefined ? { label: { lines: labelMetrics!.lines,
        x: labelX, y: frame.top + base.lineHeight + 3, anchor: 'start' as const } } : {}),
      accessibleName: `Region ${region.id}${region.label !== undefined ? `: ${region.label}` : ''}` };
  });

  const width = Math.max(
    baseRightEdge,
    ...displayedFrames.map((f) => f.x + f.width + 16),
    ...regions.map((r) => r.x + r.width + 16),
  );
  const creationOffsets = new Map(base.messages.filter((message) => message.kind === 'create')
    .map((message) => [message.targetId, offsets.get(message.id)!]));
  const destructionOffsets = new Map(base.messages.filter((message) => message.kind === 'destroy')
    .map((message) => [message.targetId, offsets.get(message.id)!]));
  return { ...base, width, height: base.height + offset,
    description: `${base.description}, ${displayedFrames.length} source fragments, ${activations.length} activations, ${notes.length} notes, ${regions.length} regions`,
    participants: base.participants.map((participant) => {
      const dy = creationOffsets.get(participant.id) ?? 0;
      return { ...participant, header: { ...participant.header, x: participant.header.x + dx, y: participant.header.y + dy },
        label: { ...participant.label, x: participant.label.x + dx, y: participant.label.y + dy },
        lifeline: { x: participant.lifeline.x + dx, y1: participant.lifeline.y1 + dy,
          y2: participant.lifeline.y2 + (destructionOffsets.get(participant.id) ?? offset) } };
    }),
    messages: shiftedMessages, notes: shiftedNotes, activations, fragments: displayedFrames, regions,
  };
}
