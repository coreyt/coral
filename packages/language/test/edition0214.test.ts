import { describe, expect, it } from 'vitest';
import { editionAdmits0214, HEADER_MANIFEST_028, parse, parseCrowsFootConnector0214 } from '../src/index.js';
import { parseCandidate028 } from '../src/parser/candidate028.js';

const trustedDigests = Object.fromEntries(
  Object.values(HEADER_MANIFEST_028).flatMap((ed) =>
    Object.values(ed).flatMap((entry) =>
      entry.catalogs.map((c) => [`${c.id}@${c.version}`, c.digest]))),
);
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };

describe('Coral edition 0.2.14 syntax & manifest', () => {
  it('gates editionAdmits0214 cleanly and preserves frozen 0.2.8/0.2.9 manifests', () => {
    expect(editionAdmits0214('0.2.8')).toBe(false);
    expect(editionAdmits0214('0.2.9')).toBe(false);
    expect(editionAdmits0214('0.2.12')).toBe(false);
    expect(editionAdmits0214('0.2.14')).toBe(true);
    expect(editionAdmits0214('0.3.0')).toBe(true);
    expect(HEADER_MANIFEST_028['0.2.9']).toEqual(HEADER_MANIFEST_028['0.2.8']);
    expect(HEADER_MANIFEST_028['0.2.8']!.erd!.enabled).toBe(false);
    expect(HEADER_MANIFEST_028['0.2.14']!.erd!.enabled).toBeUndefined();
    expect(Object.isFrozen(HEADER_MANIFEST_028['0.2.14'])).toBe(true);
  });

  it('N2: parses node [style: ...] bare terms, hex colors, and recipes in edition 0.2.14', () => {
    const source = [
      '@diagram block',
      '@coralVersion "0.2.14"',
      'a block [style: "blue"] as "Blue Box"',
      'b block [style: "red, dashed, thick"] as "Alert"',
      'c block [style: "fill: #eef6ff; stroke: #2563eb; accent: teal"] as "Styled"',
      'a -> b',
      'b -> c',
      '',
    ].join('\n');
    const doc = parse(source, runtime);
    expect(doc.header.diagnostics).toEqual([]);
    expect(doc.syntax.diagnostics).toEqual([]);
    expect(doc.graph?.nodes).toHaveLength(3);
    expect(doc.graph?.nodes[0]?.properties?.coralStyle0214).toEqual({ strokeColor: '#0000FF' });
    expect(doc.graph?.nodes[1]?.properties?.coralStyle0214).toEqual({
      strokeColor: '#FF0000', lineStyle: 'dashed', strokeWeight: 'thick',
    });
    expect(doc.graph?.nodes[2]?.properties?.coralStyle0214).toEqual({
      fillColor: '#eef6ff', strokeColor: '#2563eb', accentColor: '#0F766E',
    });
  });

  it('N2/N3: rejects 0.2.14 node and edge fields under edition 0.2.8/0.2.9', () => {
    const source = [
      '@diagram architecture',
      '@coralVersion "0.2.9"',
      'a service [technology: "Go", style: "blue"]',
      'b database [description: "Main DB"]',
      'a -> b [technology: "SQL"]',
      '',
    ].join('\n');
    const doc = parse(source, runtime);
    const codes = doc.syntax.diagnostics.map((d) => d.code);
    expect(codes).toContain('coral.syntax.node.field.unknown');
    expect(codes).toContain('coral.syntax.bracket.unknown-field');
  });

  it('N3: parses architecture boundaries, technology, and description on nodes and edges', () => {
    const source = [
      '@diagram architecture',
      '@coralVersion "0.2.14"',
      'shopper person [description: "Buys online"] as "Shopper"',
      'stripe externalSystem [description: "Card processor"] as "Stripe"',
      'platform systemBoundary as "E-Commerce" {',
      '  web container [technology: "React SPA", description: "Storefront"] as "Web"',
      '  api container [technology: "Go / gRPC", description: "Orders API"] as "API"',
      '  db database [technology: "PostgreSQL"] as "Orders DB"',
      '}',
      'shopper -> platform.web [technology: "HTTPS"] as "Browses"',
      'platform.web -> platform.api [technology: "JSON / HTTPS", description: "Creates cart"] as "Submits"',
      'platform.api -> platform.db [data, technology: "SQL"] as "Reads/writes"',
      'platform.api -> stripe [technology: "HTTPS"] as "Charges"',
      '',
    ].join('\n');
    const doc = parse(source, runtime);
    expect(doc.header.diagnostics).toEqual([]);
    expect(doc.syntax.diagnostics).toEqual([]);
    expect(doc.graph?.nodes).toHaveLength(3);
    const platform = doc.graph?.nodes.find((n) => n.id === 'platform');
    expect(platform?.children?.map((c) => c.id)).toEqual(['platform.web', 'platform.api', 'platform.db']);
    expect(platform?.children?.[0]?.description).toBe('Storefront');
    expect(platform?.children?.[0]?.properties?.technology).toBe('React SPA');
    expect(doc.graph?.edges[1]?.properties?.technology).toBe('JSON / HTTPS');
    expect(doc.graph?.edges[1]?.description).toBe('Creates cart');
  });

  it('N4: parses provider field and nested cloud boundaries under edition 0.2.14', () => {
    const parsed = parseCandidate028([
      'vpc vpc [provider: "aws", technology: "10.0.0.0/16"] as "Prod VPC" {',
      '  pub subnet [variant: "public"] as "Public Subnet" {',
      '    alb loadBalancer [provider: "aws", technology: "ALB"] as "ALB"',
      '  }',
      '}',
      'bad vm [provider: "unknownCloud"]',
    ].join('\n'), { profile: 'infrastructure', edition: '0.2.14' });
    expect(parsed.diagnostics.map((d) => d.code)).toEqual(['coral.infrastructure.provider.unknown']);
    const vpc = parsed.graph.nodes.find((n) => n.id === 'vpc');
    expect(vpc?.properties?.provider).toBe('aws');
    expect(vpc?.children?.[0]?.children?.[0]?.id).toBe('vpc.pub.alb');
  });

  it('N5: parses Crow\'s Foot ERD columns, cardinality connectors, endpoint labels, and retires Chen', () => {
    expect(parseCrowsFootConnector0214('||--o{')).toMatchObject({
      stroke: 'solid',
      firstEnd: { kind: 'one' },
      secondEnd: { kind: 'zero-or-many' },
    });
    expect(parseCrowsFootConnector0214('||-.-|{')).toMatchObject({
      stroke: 'dashed',
      firstEnd: { kind: 'one' },
      secondEnd: { kind: 'one-or-many' },
    });
    const source = [
      '@diagram erd',
      '@coralVersion "0.2.14"',
      'users entity as "Users" {',
      '  columns {',
      '    id uuid [pk]',
      '    email varchar(255) [uk, not null]',
      '    bio text [null]',
      '  }',
      '}',
      'orders entity as "Orders" {',
      '  columns {',
      '    id uuid [pk]',
      '    user_id uuid [fk, not null]',
      '    total decimal(10, 2) [not null]',
      '  }',
      '}',
      'users ||--o{ orders [firstLabel: "1", secondLabel: "0..*"] as "places"',
      '',
    ].join('\n');
    const doc = parse(source, runtime);
    expect(doc.header.diagnostics).toEqual([]);
    expect(doc.syntax.diagnostics).toEqual([]);
    const users = doc.graph?.nodes[0];
    expect(users?.properties?.erdColumns0214).toEqual([
      { name: 'id', type: 'uuid', flags: ['pk'] },
      { name: 'email', type: 'varchar(255)', flags: ['uk', 'not null'] },
      { name: 'bio', type: 'text', flags: ['null'] },
    ]);
    const edge = doc.graph?.edges[0];
    expect(edge?.sourceEnd).toEqual({ marker: { kind: 'one', fill: 'unspecified' }, role: '1' });
    expect(edge?.targetEnd).toEqual({ marker: { kind: 'zero-or-many', fill: 'unspecified' }, role: '0..*' });

    // Chen retirement diagnostic
    const chen = parse('@diagram erd\n@coralVersion "0.2.14"\ncust entity\nemail attribute\n', runtime);
    expect(chen.syntax.diagnostics.map((d) => d.code)).toContain('coral.erd.chen.retired');
  });

  it('N6a-B: maps camelCase catalog relations, diagnoses hyphenated relations, warns on unknown relations', () => {
    const aiml = parse([
      '@diagram aiml',
      '@coralVersion "0.2.14"',
      'p prompt as "Prompt"',
      'm llm as "LLM"',
      't tool as "Search"',
      'p -> m [dataFlow]',
      'm -> t [toolUse]',
      'm -> p [trainng]',
      '',
    ].join('\n'), runtime);
    expect(aiml.header.diagnostics).toEqual([]);
    expect(aiml.syntax.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', 'coral.relation.unknown'],
    ]);
    expect(aiml.graph?.edges[0]?.type).toBe('data-flow');
    expect(aiml.graph?.edges[1]?.type).toBe('tool-use');

    const hyphenated = parse([
      '@diagram aiml',
      '@coralVersion "0.2.14"',
      'p prompt',
      'm llm',
      'p -> m [data-flow]',
      '',
    ].join('\n'), runtime);
    expect(hyphenated.syntax.diagnostics.map((d) => d.code)).toContain('coral.syntax.bracket.relation-hyphen');
  });

  it('N6c-1: accepts -, #, ~ unnamed UML class attributes in edition 0.2.14 while keeping 0.2.8 unchanged', () => {
    const uml0214 = parse([
      '@diagram uml-class',
      '@coralVersion "0.2.14"',
      'order class as "Order" {',
      '  attributes {',
      '    - id: UUID',
      '    # state: State',
      '    ~ version: Int',
      '    + total: Money',
      '  }',
      '}',
      '',
    ].join('\n'), runtime);
    expect(uml0214.header.diagnostics).toEqual([]);
    expect(uml0214.syntax.diagnostics).toEqual([]);
    const attrs = uml0214.graph?.nodes[0]?.classifier?.compartments
      .find((c) => c.kind === 'attributes')?.items;
    expect(attrs?.map((a) => (a as { visibility: string }).visibility)).toEqual([
      'private', 'protected', 'package', 'public',
    ]);

    const uml028 = parse([
      '@diagram uml-class',
      '@coralVersion "0.2.8"',
      'order class as "Order" {',
      '  attributes {',
      '    - id: UUID',
      '  }',
      '}',
      '',
    ].join('\n'), runtime);
    expect(uml028.syntax.diagnostics.map((d) => d.code)).toContain('coral.uml.member.invalid');
  });
});
