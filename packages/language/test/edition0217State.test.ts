import { describe, expect, it } from 'vitest';
import { editionAdmits0217, HEADER_MANIFEST_028, parse } from '../src/index.js';
import { parseCandidate028 } from '../src/parser/candidate028.js';

const trustedDigests = Object.fromEntries(
  Object.values(HEADER_MANIFEST_028).flatMap((ed) =>
    Object.values(ed).flatMap((entry) =>
      entry.catalogs.map((c) => [`${c.id}@${c.version}`, c.digest]))),
);
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };

describe('Coral edition 0.2.17 UML State syntax & manifest', () => {
  it('gates editionAdmits0217 cleanly and preserves frozen 0.2.8/0.2.9/0.2.14 manifests', () => {
    expect(editionAdmits0217('0.2.8')).toBe(false);
    expect(editionAdmits0217('0.2.9')).toBe(false);
    expect(editionAdmits0217('0.2.14')).toBe(false);
    expect(editionAdmits0217('0.2.16')).toBe(false);
    expect(editionAdmits0217('0.2.17')).toBe(true);
    expect(editionAdmits0217('0.3.0')).toBe(true);
    expect(HEADER_MANIFEST_028['0.2.9']).toEqual(HEADER_MANIFEST_028['0.2.8']);
    expect(HEADER_MANIFEST_028['0.2.14']!['uml-state']!.catalogs[0]!.version).toBe('1.0.0');
    expect(HEADER_MANIFEST_028['0.2.17']).toBeDefined();
    expect(HEADER_MANIFEST_028['0.2.17']!['uml-state']!.catalogs[0]!.version).toBe('1.1.0');
    expect(Object.isFrozen(HEADER_MANIFEST_028['0.2.17'])).toBe(true);
  });

  it('parses hierarchical composite and group states with nested children and dot-qualified transitions in 0.2.17', () => {
    const source = [
      '@diagram uml-state',
      '@coralVersion "0.2.17"',
      'layout [direction: DOWN]',
      'start initial',
      'Idle state [description: "Waiting", style: "teal"] as "Idle"',
      'Active composite as "Active Session" {',
      '  entry initial',
      '  Running group as "Running" {',
      '    rStart initial',
      '    Streaming state as "Streaming"',
      '    rStart -> Streaming',
      '  }',
      '  exit final',
      '  entry -> Running',
      '  Running -> exit as "disconnect"',
      '}',
      'done final',
      'start -> Idle',
      'Idle -> Active as "connect"',
      'Active.Running.Streaming -> Idle as "abort [timeout]"',
      'Active -> done as "shutdown"',
      '',
    ].join('\n');
    const doc = parse(source, runtime);
    expect(doc.header.diagnostics).toEqual([]);
    expect(doc.header.header?.catalog.version).toBe('1.1.0');
    expect(doc.syntax.diagnostics).toEqual([]);
    expect(doc.syntax.layoutOptions028?.direction).toBe('DOWN');
    const active = doc.syntax.graph.nodes.find((n) => n.id === 'Active');
    expect(active?.type).toBe('composite');
    expect(active?.children?.map((c) => c.id)).toEqual(['Active.entry', 'Active.Running', 'Active.exit']);
    const running = active?.children?.find((c) => c.id === 'Active.Running');
    expect(running?.children?.map((c) => c.id)).toEqual(['Active.Running.rStart', 'Active.Running.Streaming']);
  });

  it('rejects composite { ... } container body in editions before 0.2.17', () => {
    const oldDoc = parseCandidate028([
      'Active composite as "Active" {',
      '  Idle state',
      '}',
    ].join('\n'), { profile: 'uml-state', edition: '0.2.14' });
    expect(oldDoc.diagnostics.map((d) => d.code)).toContain('coral.syntax.node.body.invalid');
  });

  it('parses choice/fork/join/note pseudostates, self-transitions, and transition/annotation relations', () => {
    const source = [
      '@diagram uml-state',
      '@coralVersion "0.2.17"',
      's initial',
      'Idle state [description: "Ready", style: "fill: #eef6ff; stroke: #2563eb"] as "Idle"',
      'c choice',
      'f fork',
      'a state as "Branch A"',
      'b state as "Branch B"',
      'j join',
      'e final',
      'n1 note as "Concurrency note"',
      's -> Idle [transition]',
      'Idle -> Idle as "tick / heartbeat()"',
      'Idle -> c as "evaluate"',
      'c -> f as "[ok]"',
      'c -> e as "[cancel]"',
      'f -> a',
      'f -> b',
      'a -> j',
      'b -> j',
      'j -> e',
      'n1 -.- j [annotation]',
      '',
    ].join('\n');
    const doc = parse(source, runtime);
    expect(doc.header.diagnostics).toEqual([]);
    expect(doc.syntax.diagnostics).toEqual([]);
    expect(doc.graph?.nodes).toHaveLength(9);
    const selfEdge = doc.graph?.edges.find((e) => e.source === 'Idle' && e.target === 'Idle');
    expect(selfEdge?.label).toBe('tick / heartbeat()');
    expect(selfEdge?.type).toBe('transition');
    const noteEdge = doc.graph?.edges.find((e) => e.source === 'n1' && e.target === 'j');
    expect(noteEdge?.type).toBe('annotation');
    expect(noteEdge?.style?.lineStyle).toBe('dashed');
  });
});
