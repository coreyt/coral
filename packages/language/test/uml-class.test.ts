import { describe, expect, it } from 'vitest';
import { parseCoralUmlMember, parseMermaid, print, printWithDiagnostics } from '../src/index.js';
import { parse } from '../src/parser/index.js';

const source = `@graph {"id":"orders","metadata":{"notation":"uml-class"}}

class "Order" as Order modifiers {abstract} {
  attributes {
    + id: UUID {readonly}
    attribute createdAt: Instant
  }
  operations {
    + add(item: LineItem, count: Int): Void
    operation cancel()
  }
}

enum "OrderState" as OrderState {
  literals {
    literal OPEN = "open"
    literal CLOSED
  }
}

Order (1 "owner") -> OrderState (0..* "states" nav) [association]`;

describe('UML class Coral syntax', () => {
  it('parses structured classifiers and derives the profile', () => {
    const result = parse(source);
    expect(result.errors).toEqual([]);
    expect(result.graph?.profile).toEqual({ id: 'uml', kind: 'class', version: '1.0.0' });
    expect(result.graph?.nodes[0].classifier).toEqual({
      kind: 'class', name: 'Order', modifiers: ['abstract'],
      compartments: [
        { id: 'name', kind: 'name' },
        { id: 'attributes', kind: 'attributes', items: [
          { id: 'attribute-1', kind: 'attribute', visibility: 'public', name: 'id', type: 'UUID', modifiers: ['readonly'] },
          { id: 'attribute-2', kind: 'attribute', name: 'createdAt', type: 'Instant' },
        ] },
        { id: 'operations', kind: 'operations', items: [
          { id: 'operation-1', kind: 'operation', visibility: 'public', name: 'add', parameters: [
            { name: 'item', type: 'LineItem' }, { name: 'count', type: 'Int' },
          ], returnType: 'Void' },
          { id: 'operation-2', kind: 'operation', name: 'cancel', parameters: [] },
        ] },
      ],
    });
    expect(parse(print(result.graph!)).graph).toEqual(result.graph);
  });

  it('rejects repeated or kind-inapplicable compartments', () => {
    for (const body of [
      'class "A" as A {\n  attributes {\n  }\n  attributes {\n  }\n}',
      'enum "E" as E {\n  attributes {\n  }\n  literals {\n  }\n}',
    ]) {
      const result = parse(`@graph {"id":"bad","metadata":{"notation":"uml-class"}}\n${body}`);
      expect(result.success).toBe(false);
      expect(result.diagnostics.some((d) => d.code.startsWith('coral.uml.compartment.'))).toBe(true);
    }
  });

  it('rejects invalid classifier modifiers and identity collisions', () => {
    const cases = [
      ['coral.uml.classifier.modifier.invalid', 'enum "E" as E modifiers {abstract} {\n  literals {\n  }\n}'],
      ['coral.uml.compartment.id.invalid', 'class "A" as A {\n  attributes as name {\n  }\n}'],
      ['coral.uml.compartment.id.invalid', 'class "A" as A {\n  attributes as "" {\n  }\n}'],
      ['coral.uml.member.id.invalid', 'class "A" as A {\n  attributes {\n    attribute first as shared\n  }\n  operations {\n    operation second() as shared\n  }\n}'],
      ['coral.uml.member.id.invalid', 'class "A" as A {\n  attributes {\n    attribute first as ""\n  }\n}'],
      ['coral.uml.compartment.id.invalid', 'class "A" as A {\n  attributes as "\\q" {\n  }\n}'],
      ['coral.uml.member.invalid', 'class "A" as A {\n  attributes {\n    attribute first as "\\q"\n  }\n}'],
      ['coral.uml.member.invalid', 'class "A" as A {\n  operations {\n    operation find(value: Some Type)\n  }\n}'],
      ['coral.uml.classifier.nested.invalid', 'class "A" as A {\n  class "B" as B\n}'],
    ];
    for (const [code, body] of cases) {
      const result = parse(`@graph {"id":"invalid","metadata":{"notation":"uml-class"}}\n${body}`);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code), body).toContain(code);
    }
  });

  it.each([
    ['literal BAD = "\\q"', 'literals' as const],
    ['attribute value as "\\q"', 'attributes' as const],
  ])('keeps malformed inspector member escapes as validation results: %s', (line, compartment) => {
    expect(() => parseCoralUmlMember(line, compartment, 1)).not.toThrow();
    expect(parseCoralUmlMember(line, compartment, 1)).toMatchObject({ error: expect.any(String) });
  });

  it('preserves enum operations and quoted compartment identities', () => {
    const result = parse(`@graph {"id":"enum","metadata":{"notation":"uml-class"}}
enum "State" as State {
  operations as "enum operations" {
    operation label(): String as "display label"
  }
  literals {
    literal OPEN
  }
}`);
    expect(result.errors).toEqual([]);
    expect(result.graph?.nodes[0].classifier?.compartments).toMatchObject([
      { id: 'name', kind: 'name' },
      { id: 'enum operations', kind: 'operations', items: [expect.objectContaining({ id: 'display label' })] },
      { id: 'literals', kind: 'literals' },
    ]);
    expect(parse(print(result.graph!)).graph).toEqual(result.graph);
  });

  it('derives symbols without redundant source data and diagnoses incompatible external classifiers', () => {
    const parsed = parse(source).graph!;
    expect(print(parsed)).not.toContain('"symbol"');

    const mismatched = structuredClone(parsed);
    mismatched.nodes[0].symbol = 'uml-interface';
    expect(printWithDiagnostics(mismatched).diagnostics.map((diagnostic) => diagnostic.code))
      .toContain('coral.node.symbol.dropped');

    const unsupported = structuredClone(parsed);
    const attributes = unsupported.nodes[0].classifier!.compartments.find((part) => part.kind === 'attributes');
    if (attributes?.kind === 'attributes') attributes.items[0].modifiers = ['abstract'];
    const blocked = printWithDiagnostics(unsupported);
    expect(blocked.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.node.classifier.unsupported', severity: 'error',
    }));
    expect(parse(blocked.text).errors).toEqual([]);

    const enumWithInvalidModifier = parse(`@graph {"id":"enum","metadata":{"notation":"uml-class"}}
enum "State" as State {
  literals {
    literal OPEN
  }
}`).graph!;
    enumWithInvalidModifier.nodes[0].classifier!.modifiers = ['abstract'];
    const blockedEnum = printWithDiagnostics(enumWithInvalidModifier);
    expect(blockedEnum.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.node.classifier.unsupported', severity: 'error',
    }));
    expect(parse(blockedEnum.text).errors).toEqual([]);

    for (const profile of [undefined, { id: 'uml', kind: 'sequence', version: '1.0.0' }]) {
      const invalidProfile = structuredClone(parsed);
      invalidProfile.profile = profile as typeof invalidProfile.profile;
      expect(printWithDiagnostics(invalidProfile).diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.graph.profile.unsupported', severity: 'error',
      }));
    }

    const profileOnly = structuredClone(parsed);
    delete profileOnly.metadata;
    expect(printWithDiagnostics(profileOnly).diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.graph.profile.dropped', severity: 'error',
      subject: { kind: 'graph', id: profileOnly.id },
    }));
    expect(() => print(profileOnly)).toThrow('coral.graph.profile.dropped');

    const authoredMismatch = parse(`@graph {"id":"bad-symbol","metadata":{"notation":"uml-class"}}
class "Wrong" as Wrong data {"symbol":"uml-interface"}`);
    expect(authoredMismatch.diagnostics.map((diagnostic) => diagnostic.code))
      .toContain('coral.uml.classifier.symbol.invalid');
  });
});

describe('Mermaid UML class import', () => {
  it('creates structured classifiers with oriented endpoints', () => {
    const result = parseMermaid(`classDiagram
class Animal {
  <<abstract>>
  +String name
  +speak(): String*
}
class Dog {
  +fetch(item: String): Boolean
}
Animal <|-- "0..*" Dog : inherits`);
    expect(result.errors).toEqual([]);
    expect(result.graph?.profile).toEqual({ id: 'uml', kind: 'class', version: '1.0.0' });
    expect(result.graph?.nodes[0].classifier?.compartments.map((c) => c.kind))
      .toEqual(['name', 'attributes', 'operations']);
    expect(result.graph?.edges[0]).toMatchObject({
      source: 'Dog', target: 'Animal', type: 'inheritance', label: 'inherits',
      sourceEnd: { multiplicity: { lower: 0, upper: '*' } },
      targetEnd: { marker: { kind: 'triangle', fill: 'open' } },
    });
  });

  it('places right-hand composition at the target without retaining the default source diamond', () => {
    const result = parseMermaid(`classDiagram
Part --* Whole`);
    expect(result.errors).toEqual([]);
    expect(result.graph?.edges[0]).toMatchObject({
      source: 'Part', target: 'Whole', type: 'composition',
      sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      targetEnd: { marker: { kind: 'diamond', fill: 'filled' } },
    });
  });

  it.each([
    ['--', 'A', 'B', 'association', undefined, undefined, undefined],
    ['-->', 'A', 'B', 'association', undefined, 'arrow', undefined],
    ['..>', 'A', 'B', 'dependency', undefined, 'arrow', 'dashed'],
    ['<..', 'B', 'A', 'dependency', undefined, 'arrow', 'dashed'],
    ['<|--', 'B', 'A', 'inheritance', undefined, 'triangle', undefined],
    ['--|>', 'A', 'B', 'inheritance', undefined, 'triangle', undefined],
    ['<|..', 'B', 'A', 'realization', undefined, 'triangle', 'dashed'],
    ['..|>', 'A', 'B', 'realization', undefined, 'triangle', 'dashed'],
    ['*--', 'A', 'B', 'composition', 'diamond', undefined, undefined],
    ['--*', 'A', 'B', 'composition', 'none', 'diamond', undefined],
    ['o--', 'A', 'B', 'aggregation', 'diamond', undefined, undefined],
    ['--o', 'A', 'B', 'aggregation', 'none', 'diamond', undefined],
  ] as const)('maps the finite relation operator %s', (operator, sourceId, targetId, type, sourceMarker, targetMarker, lineStyle) => {
    const result = parseMermaid(`classDiagram\nA ${operator} B`);
    expect(result.errors).toEqual([]);
    const edge = result.graph?.edges[0];
    expect(edge).toMatchObject({ source: sourceId, target: targetId, type });
    expect(edge?.sourceEnd?.marker?.kind).toBe(sourceMarker);
    expect(edge?.targetEnd?.marker?.kind).toBe(targetMarker);
    expect(edge?.style?.lineStyle).toBe(lineStyle);
  });

  it('imports aliases, later declarations, interface members, and enum members in the finite subset', () => {
    const result = parseMermaid(`classDiagram
Invoice --> Customer
class Customer["Customer account"] {
  <<interface>>
  +UUID id
  +find(id: UUID): Invoice
}
class Invoice {
  +Money total
}
class State {
  <<enumeration>>
  OPEN = "open"
  label(): String
}`);
    expect(result.errors).toEqual([]);
    expect(result.graph?.nodes.find((node) => node.id === 'Customer')).toMatchObject({
      label: 'Customer account', type: 'interface',
      classifier: { kind: 'interface', compartments: [
        { kind: 'name' },
        { kind: 'attributes', items: [expect.objectContaining({ name: 'id', type: 'UUID' })] },
        { kind: 'operations', items: [expect.objectContaining({ name: 'find', returnType: 'Invoice' })] },
      ] },
    });
    expect(result.graph?.nodes.find((node) => node.id === 'State')?.classifier?.compartments)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'literals', items: [expect.objectContaining({ name: 'OPEN', value: 'open' })] }),
        expect.objectContaining({ kind: 'operations', items: [expect.objectContaining({ name: 'label' })] }),
      ]));
  });

  it('imports alternate attribute spelling, member suffix modifiers, and bare enum literals', () => {
    const result = parseMermaid(`classDiagram
class Utility {
  +id: UUID$
  +compute(): Result*$
}
class State {
  <<enum>>
  OPEN
}`);
    expect(result.errors).toEqual([]);
    expect(result.graph?.nodes.find((node) => node.id === 'Utility')?.classifier?.compartments)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'attributes', items: [expect.objectContaining({
          name: 'id', type: 'UUID', modifiers: ['static'],
        })] }),
        expect.objectContaining({ kind: 'operations', items: [expect.objectContaining({
          name: 'compute', returnType: 'Result', modifiers: ['abstract', 'static'],
        })] }),
      ]));
    expect(result.graph?.nodes.find((node) => node.id === 'State')?.classifier?.compartments)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        kind: 'literals', items: [expect.objectContaining({ name: 'OPEN' })],
      })]));
  });

  it.each([
    ['member runs', `class A {\n  +String name\n  save()\n  +String other\n}`, 'mermaid.class.member.interleaved'],
    ['duplicate declarations', 'class A\nclass A {\n}', 'mermaid.class.declaration.duplicate'],
    ['invalid multiplicity', '"2..1" A --> B', 'mermaid.class.multiplicity.invalid'],
    ['direction loss', 'direction LR', 'mermaid.class.direction.dropped'],
    ['unsupported directives', 'note for A "unsupported"', 'mermaid.class.syntax.unsupported'],
    ['unclosed class bodies', 'class A {\n  +String name', 'mermaid.class.brace.unclosed'],
    ['template attribute types', 'class A {\n  +List<Item> items\n}', 'mermaid.class.member.invalid'],
    ['template parameter and return types', 'class A {\n  +find(arg: List<Item>): Map<Key,Value>\n}', 'mermaid.class.member.invalid'],
  ])('diagnoses %s', (_name, body, code) => {
    const result = parseMermaid(`classDiagram\n${body}`);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code }));
  });

  it('rejects repeated stereotypes and syntax outside the finite relation subset with exact positions', () => {
    const result = parseMermaid(`classDiagram
  class A {
    <<interface>>
    <<enum>>
  }
  A .. B`);
    expect(result.success).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'mermaid.class.stereotype.position.invalid',
      'mermaid.class.syntax.unsupported',
    ]));
    for (const diagnostic of result.diagnostics) {
      expect(diagnostic.position.column).toBeGreaterThan(0);
      expect(diagnostic.position.offset).toBeGreaterThan(0);
    }
  });

  it.each(['BAD = "\\q"', 'BAD = "\\uZZZZ"'])('diagnoses invalid enum literal escapes: %s', (literal) => {
    const result = parseMermaid(`classDiagram
class E {
  <<enum>>
  ${literal}
}`);
    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'mermaid.class.member.invalid', severity: 'error',
    }));
  });

  it('reports class diagnostics against the original leading whitespace and CRLF source', () => {
    const original = `\r\nclassDiagram\r\n  class E {\r\n    <<enum>>\r\n    BAD = "\\q"\r\n  }`;
    const result = parseMermaid(original);
    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'mermaid.class.member.invalid',
      position: { line: 5, column: 4, offset: original.indexOf('BAD') },
    }));

    const unknown = `\n  notADiagram`;
    expect(parseMermaid(unknown).diagnostics[0]?.position).toEqual({
      line: 2, column: 2, offset: unknown.indexOf('notADiagram'),
    });
  });

  it('rejects trailing classDiagram header text and generic Coral member types', () => {
    expect(parseMermaid('classDiagram trailing garbage\nclass A').diagnostics)
      .toContainEqual(expect.objectContaining({ code: 'mermaid.diagram.unparsed', severity: 'error' }));
    for (const header of ['classdiagram', 'CLASSDIAGRAM']) {
      expect(parseMermaid(`${header}\nclass A`).diagnostics, header)
        .toContainEqual(expect.objectContaining({ code: 'mermaid.diagram.unparsed', severity: 'error' }));
    }
    const generic = parse(`@graph {"id":"generic","metadata":{"notation":"uml-class"}}
class "A" as A {
  attributes {
    + items: List<Item>
  }
}`);
    expect(generic.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.uml.member.invalid', severity: 'error',
    }));
  });

  it('locates identical invalid multiplicities at their distinct endpoints', () => {
    const input = 'classDiagram\n"2..1" A --> "2..1" B';
    const diagnostics = parseMermaid(input).diagnostics
      .filter((diagnostic) => diagnostic.code === 'mermaid.class.multiplicity.invalid');
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((diagnostic) => diagnostic.position.offset))
      .toEqual([input.indexOf('2..1'), input.lastIndexOf('2..1')]);
  });
});
