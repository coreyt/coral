import { describe, expect, it } from 'vitest';
import type { CandidatePortSyntax } from '@coral-viz/language';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { resolveSuccessorGraphNodes028 } from '../src/successorInterpretation028.js';
import { sourcePortDeclarationDiagnostics028 } from '../src/successorSourcePortDeclarations028.js';
import { sourceNodeCatalogChoiceDiagnostics028 } from '../src/successorSourcePortDeclarations028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';

describe('source-owned semantic-port declaration diagnostics', () => {
  it('locates a named anchor on a generic node without inventing a symbol', () => {
    const source = '@diagram architecture\nholder group {\n' +
      '  audit port [direction: out, anchor: missingPin]\n}';
    const document = parseInstalledDocument028(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const findings = sourcePortDeclarationDiagnostics028(
      document.syntax.statements.filter((item): item is CandidatePortSyntax => item.kind === 'port'),
      resolveSuccessorGraphNodes028(projected.graph!));
    expect(findings).toContainEqual(expect.objectContaining({ code: 'coral.port.anchor.symbol-unavailable',
      subject: { kind: 'node', id: 'holder' },
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('missingPin') }),
        end: expect.objectContaining({ offset: source.indexOf('missingPin') + 'missingPin'.length }) }),
    }));
  });

  it('locates an unregistered compass-word anchor without silently treating it as a generic pin', () => {
    const source = '@diagram architecture\napi service {\n' +
      '  audit port [direction: out, anchor: east]\n' +
      '  fixed port [direction: out, anchor: right]\n}';
    const document = parseInstalledDocument028(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const findings = sourcePortDeclarationDiagnostics028(
      document.syntax.statements.filter((item): item is CandidatePortSyntax => item.kind === 'port'),
      resolveSuccessorGraphNodes028(projected.graph!));
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'coral.port.anchor.symbol-unknown',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('anchor: east') + 'anchor: '.length,
      }) }),
    }));
    expect(findings.some((item) => item.range?.start.offset === source.indexOf('anchor: right') +
      'anchor: '.length)).toBe(false);
  });

  it('locates two unresolved named anchors at their own value tokens', () => {
    const source = '@diagram architecture\napi service {\n  audit port [direction: out, anchor: missingA]\n  trace port [direction: out, anchor: missingB]\n}';
    const document = parseInstalledDocument028(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const findings = sourcePortDeclarationDiagnostics028(
      document.syntax.statements.filter((item): item is CandidatePortSyntax => item.kind === 'port'),
      resolveSuccessorGraphNodes028(projected.graph!));
    expect(findings).toMatchObject([
      { code: 'coral.port.anchor.symbol-unknown', range: { start: { offset: source.indexOf('missingA') } } },
      { code: 'coral.port.anchor.symbol-unknown', range: { start: { offset: source.indexOf('missingB') } } },
    ]);
  });

  it('locates a grouped port anchor by its qualified owner identity', () => {
    const source = '@diagram architecture\nteam group {\n  api service {\n' +
      '    audit port [direction: out, anchor: missingPin]\n  }\n}';
    const document = parseInstalledDocument028(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const findings = sourcePortDeclarationDiagnostics028(
      document.syntax.statements.filter((item): item is CandidatePortSyntax => item.kind === 'port'),
      resolveSuccessorGraphNodes028(projected.graph!));
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'coral.port.anchor.symbol-unknown', subject: { kind: 'node', id: 'team.api' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('missingPin'),
      }) }),
    }));
  });

  it('locates an additive catalog-port collision inside a group', () => {
    const source = '@diagram architecture\nteam group {\n  api service {\n' +
      '    out port [direction: out]\n  }\n}';
    const document = parseInstalledDocument028(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const findings = sourcePortDeclarationDiagnostics028(
      document.syntax.statements.filter((item): item is CandidatePortSyntax => item.kind === 'port'),
      resolveSuccessorGraphNodes028(projected.graph!));
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'coral.port.duplicate', subject: { kind: 'node', id: 'team.api' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('out port'),
      }) }),
    }));
  });

  it('keeps omitted and explicit auto distinct in grouped source while sharing effective auto', () => {
    const source = '@diagram architecture\nteam group {\n  api service {\n' +
      '    omitted port [direction: out]\n' +
      '    explicit port [direction: out, anchor: auto]\n  }\n}';
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const child = projected.graph?.nodes[0]?.children?.[0];
    expect(child?.id).toBe('team.api');
    expect(child?.semanticPorts).toEqual([
      { id: 'omitted', direction: 'out' },
      { id: 'explicit', direction: 'out', anchor: { kind: 'auto' } },
    ]);
    const resolved = resolveSuccessorGraphNodes028(projected.graph!).get('team.api');
    expect(resolved?.semanticPorts.filter((port) => port.origin === 'authored')
      .map((port) => [port.id, port.anchor, port.anchorWasExplicit]))
      .toEqual([['omitted', 'auto', false], ['explicit', 'auto', true]]);
    expect(parseInstalledDocument028(source).header.source).toBe(source);
  });

  it('locates an unknown explicit symbol on a grouped child declaration', () => {
    const source = '@diagram architecture\nteam group {\n' +
      '  api service [symbol: "missingStencil"]\n}';
    const document = parseInstalledDocument028(source);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const findings = sourceNodeCatalogChoiceDiagnostics028(
      document.syntax.statements.filter((item) => item.kind === 'node'),
      resolveSuccessorGraphNodes028(projected.graph!));
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'coral.symbol.unknown', subject: { kind: 'node', id: 'team.api' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('"missingStencil"'),
      }) }),
    }));
  });
});
