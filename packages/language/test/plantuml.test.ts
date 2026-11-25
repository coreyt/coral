import { describe, it, expect } from 'vitest';
import { parsePlantUml } from '../src/formats/plantuml.js';

/** PlantUML import - R-020. */

const codes = (r: ReturnType<typeof parsePlantUml>) => r.diagnostics.map((d) => d.code);

describe('R-020: PlantUML import', () => {
  describe('the supported subset', () => {
    it('imports declared elements with their types', () => {
      const r = parsePlantUml(`@startuml
component "API Gateway" as api
database "Orders" as db
actor Customer
queue "Events" as q
@enduml`);

      expect(r.success).toBe(true);
      const types = Object.fromEntries(r.graph!.nodes.map((n) => [n.label, n.type]));
      expect(types).toMatchObject({
        'API Gateway': 'service',
        Orders: 'database',
        Customer: 'actor',
        Events: 'queue',
      });
    });

    it('supports both PlantUML alias and label orders', () => {
      const r = parsePlantUml(`@startuml
component "Orders API" as orders
component billing as "Billing API"
orders --> billing
@enduml`);

      expect(r.graph!.nodes.map(({ id, label }) => ({ id, label }))).toEqual([
        { id: 'orders', label: 'Orders API' },
        { id: 'billing', label: 'Billing API' },
      ]);
      expect(r.graph!.edges[0]).toMatchObject({ source: 'orders', target: 'billing' });
    });

    it('imports the bracket and colon shorthands', () => {
      const r = parsePlantUml('@startuml\n[Web App]\n[Cache] as cache\n:Operator:\n() "REST" as rest\n@enduml');

      const labels = r.graph!.nodes.map((n) => n.label);
      expect(labels).toEqual(expect.arrayContaining(['Web App', 'Cache', 'Operator', 'REST']));
      expect(r.graph!.nodes.find((n) => n.label === 'Operator')!.type).toBe('actor');
    });

    it('imports the common use-case shorthand', () => {
      const r = parsePlantUml('@startuml\n(Place order) as place\n:Customer: --> place\n@enduml');

      expect(r.graph!.nodes.find((node) => node.id === 'place')).toMatchObject({
        label: 'Place order', type: 'module',
      });
      expect(r.graph!.edges).toHaveLength(1);
    });

    it('nests containers', () => {
      const r = parsePlantUml(`@startuml
package "Platform" as plat {
  component "Auth" as auth
  database "Sessions" as sess
}
component "Outside" as out
@enduml`);

      const plat = r.graph!.nodes.find((n) => n.label === 'Platform')!;
      expect(plat.children).toHaveLength(2);
      expect(plat.children!.map((c) => c.label)).toEqual(['Auth', 'Sessions']);
      expect(r.graph!.nodes.map((n) => n.label)).toContain('Outside');
    });

    it('imports arrows, labels and dotted styles', () => {
      const r = parsePlantUml(`@startuml
[A] --> [B] : calls
[B] ..> [C] : reads
@enduml`);

      expect(r.graph!.edges).toHaveLength(2);
      expect(r.graph!.edges[0].label).toBe('calls');
      expect(r.graph!.edges[1].style?.lineStyle).toBe('dotted');
    });

    it('reverses a backwards arrow', () => {
      const r = parsePlantUml('@startuml\n[A] <-- [B]\n@enduml');

      const edge = r.graph!.edges[0];
      const byId = new Map(r.graph!.nodes.map((n) => [n.id, n.label]));
      expect(byId.get(edge.source)).toBe('B');
      expect(byId.get(edge.target)).toBe('A');
    });

    it('takes the diagram name from a title', () => {
      expect(parsePlantUml('@startuml\ntitle Payments\n[A]\n@enduml').graph!.name).toBe('Payments');
    });
  });

  describe('what it reports rather than dropping in silence', () => {
    it.each([
      ['skinparam monochrome true', 'plantuml.skinparam.dropped'],
      ['!include foo.puml', 'plantuml.include.dropped'],
      ['!define X 1', 'plantuml.preprocessor.dropped'],
      ['legend right', 'plantuml.legend.dropped'],
      ['hide footbox', 'plantuml.hide-show.dropped'],
      ['scale 2', 'plantuml.scale.dropped'],
      ['together { }', 'plantuml.together.dropped'],
    ])('reports %s', (line, code) => {
      expect(codes(parsePlantUml(`@startuml\n${line}\n@enduml`))).toContain(code);
    });

    it('reports a stereotype', () => {
      const r = parsePlantUml('@startuml\ncomponent "Store" <<database>> as s\n@enduml');
      expect(codes(r)).toContain('plantuml.stereotype.dropped');
      expect(r.graph!.nodes[0].label).toBe('Store');
    });

    it('reports a direction hint but still creates the edge', () => {
      const r = parsePlantUml('@startuml\n[A] -down-> [B]\n@enduml');
      expect(codes(r)).toContain('plantuml.direction.degraded');
      expect(r.graph!.edges).toHaveLength(1);
    });

    it('reports an undirected association', () => {
      const r = parsePlantUml('@startuml\n[A] -- [B]\n@enduml');
      expect(codes(r)).toContain('plantuml.association.degraded');
      expect(r.graph!.edges).toHaveLength(1);
    });

    it('reports a line it does not recognise', () => {
      expect(codes(parsePlantUml('@startuml\n%%% nonsense %%%\n@enduml'))).toContain('plantuml.line.unparsed');
    });

    it('reports an unclosed brace', () => {
      const r = parsePlantUml('@startuml\npackage "P" {\n[A]\n@enduml');
      expect(r.success).toBe(false);
      expect(codes(r)).toContain('plantuml.brace.unparsed');
    });
  });

  describe('diagram kinds it refuses by name', () => {
    it.each([
      ['participant Alice\nAlice -> Bob: hi', 'plantuml.sequence.unsupported'],
      ['class Order {\n  +place()\n}', 'plantuml.class.unsupported'],
      ['class Order\nclass Refund\nOrder --> Refund', 'plantuml.class.unsupported'],
      ['Order <|-- Refund', 'plantuml.class.unsupported'],
      ['[*] --> Idle', 'plantuml.state.unsupported'],
      ['state Idle\nstate Running\nIdle --> Running', 'plantuml.state.unsupported'],
      ['Container(web, "Web", "React")', 'plantuml.c4.unsupported'],
    ])('refuses %s', (body, code) => {
      const r = parsePlantUml(`@startuml\n${body}\n@enduml`);

      expect(r.success).toBe(false);
      expect(codes(r)).toContain(code);
    });

    it('refuses rather than returning a confidently empty graph', () => {
      const r = parsePlantUml('@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob: hi\n@enduml');

      expect(r.success).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    });
  });
});

it.each([
  ['note right of api: private note', 'plantuml.note.dropped', true],
  ['component "API" as api #red', 'plantuml.colour.dropped', true],
  ['start\n:Process;\nstop', 'plantuml.activity.unsupported', false],
  ['Customer ||--o{ Order', 'plantuml.er.unsupported', false],
] as const)('reports the bounded PlantUML disposition for %s', (body, code, success) => {
  const result = parsePlantUml(`@startuml\ncomponent "API" as api\n${body}\n@enduml`);
  expect(result.success).toBe(success);
  expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  if (success) expect(result.graph!.nodes.some(node => node.id === 'api')).toBe(true);
});
