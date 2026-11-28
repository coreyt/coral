import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  formatDocument028,
  HEADER_MANIFEST_028,
  transpileMermaidToCoral,
  type HeaderRuntime028,
  type MermaidTranspileResult,
} from '../src/index.js';
import { verifyEmittedCoralStage4A } from '../src/transpile/mermaid/index.js';

function builtInRuntime(): HeaderRuntime028 {
  const trustedDigests: Record<string, string> = {};
  for (const edition of Object.values(HEADER_MANIFEST_028)) {
    for (const def of Object.values(edition)) {
      for (const catalog of def.catalogs) {
        trustedDigests[`${catalog.id}@${catalog.version}`] = catalog.digest;
      }
    }
  }
  return { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };
}

function codes(result: MermaidTranspileResult): string[] {
  return result.diagnostics.map((d) => d.code);
}

describe('detectFormat Mermaid 30-type & preamble coverage (TR-01)', () => {
  const all30Headers: Array<[string, string]> = [
    ['flowchart', 'flowchart LR\n  A --> B'],
    ['graph with dir', 'graph TD\n  A --> B'],
    ['bare graph', 'graph\n  A --> B'],
    ['sequenceDiagram', 'sequenceDiagram\n  A->>B: hi'],
    ['classDiagram', 'classDiagram\n  class A'],
    ['classDiagram-v2', 'classDiagram-v2\n  class A'],
    ['stateDiagram', 'stateDiagram\n  [*] --> A'],
    ['stateDiagram-v2', 'stateDiagram-v2\n  [*] --> A'],
    ['erDiagram', 'erDiagram\n  A ||--o{ B : rel'],
    ['journey', 'journey\n  title My day'],
    ['gantt', 'gantt\n  title Plan'],
    ['pie', 'pie title Pets\n  "Dogs" : 10'],
    ['quadrantChart', 'quadrantChart\n  title Reach'],
    ['requirementDiagram', 'requirementDiagram\n  requirement r1 {}'],
    ['gitGraph', 'gitGraph\n  commit'],
    ['C4Context', 'C4Context\n  title System'],
    ['C4Container', 'C4Container\n  title Container'],
    ['C4Component', 'C4Component\n  title Component'],
    ['C4Dynamic', 'C4Dynamic\n  title Dynamic'],
    ['C4Deployment', 'C4Deployment\n  title Deployment'],
    ['mindmap', 'mindmap\n  root'],
    ['timeline', 'timeline\n  title History'],
    ['zenuml', 'zenuml\n  A->B: hi'],
    ['sankey', 'sankey\n  A,B,10'],
    ['sankey-beta', 'sankey-beta\n  A,B,10'],
    ['xychart', 'xychart\n  x-axis [a, b]'],
    ['xychart-beta', 'xychart-beta\n  x-axis [a, b]'],
    ['block', 'block\n  a b'],
    ['block-beta', 'block-beta\n  a b'],
    ['packet', 'packet\n  0-15: "Src"'],
    ['packet-beta', 'packet-beta\n  0-15: "Src"'],
    ['kanban', 'kanban\n  Todo'],
    ['architecture-beta', 'architecture-beta\n  service api'],
    ['radar-beta', 'radar-beta\n  axis a, b'],
    ['treemap', 'treemap\n  "Root": 10'],
    ['treemap-beta', 'treemap-beta\n  "Root": 10'],
    ['venn-beta', 'venn-beta\n  set A'],
    ['ishikawa', 'ishikawa\n  Problem'],
    ['ishikawa-beta', 'ishikawa-beta\n  Problem'],
    ['usecase', 'usecase\n  actor User'],
    ['usecase-beta', 'usecase-beta\n  actor User'],
    ['eventmodeling', 'eventmodeling\n  slice s1'],
    ['treeView-beta', 'treeView-beta\n  root'],
    ['cynefin-beta', 'cynefin-beta\n  clear'],
    ['wardley-beta', 'wardley-beta\n  title Map'],
  ];

  it.each(all30Headers)('detectFormat detects %s as mermaid', (_name, src) => {
    expect(detectFormat(src)).toEqual({ format: 'mermaid', basis: 'content', candidates: [] });
  });

  it('detectFormat handles multi-line %%{init:...}%% preambles', () => {
    const src = [
      '%%{',
      '  init: {',
      '    "theme": "dark"',
      '  }',
      '}%%',
      'flowchart LR',
      '  A --> B',
    ].join('\n');
    expect(detectFormat(src)).toEqual({ format: 'mermaid', basis: 'content', candidates: [] });
  });

  it('still distinguishes DOT graph { ... } from Mermaid bare graph', () => {
    expect(detectFormat('graph G {\n  a -- b\n}')).toEqual({ format: 'dot', basis: 'content', candidates: [] });
    expect(detectFormat('graph {\n  a -- b\n}')).toEqual({ format: 'dot', basis: 'content', candidates: [] });
  });
});

describe('SPEC-01: Out-of-scope Mermaid types refuse cleanly', () => {
  const unsupportedTypes: Array<[string, string]> = [
    ['journey', 'journey\n  title Day'],
    ['gantt', 'gantt\n  title Plan'],
    ['pie', 'pie title Pets\n  "Dogs" : 10'],
    ['quadrantChart', 'quadrantChart\n  title Matrix'],
    ['requirementDiagram', 'requirementDiagram\n  requirement r1 {}'],
    ['gitGraph', 'gitGraph\n  commit'],
    ['C4Context', 'C4Context\n  title Sys'],
    ['C4Container', 'C4Container\n  title C'],
    ['C4Component', 'C4Component\n  title C'],
    ['C4Dynamic', 'C4Dynamic\n  title D'],
    ['C4Deployment', 'C4Deployment\n  title D'],
    ['mindmap', 'mindmap\n  root'],
    ['timeline', 'timeline\n  title T'],
    ['zenuml', 'zenuml\n  A->B: hi'],
    ['sankey', 'sankey\n  A,B,1'],
    ['sankey-beta', 'sankey-beta\n  A,B,1'],
    ['xychart', 'xychart\n  x-axis [a]'],
    ['xychart-beta', 'xychart-beta\n  x-axis [a]'],
    ['block', 'block\n  a'],
    ['block-beta', 'block-beta\n  a'],
    ['packet', 'packet\n  0-7: "x"'],
    ['packet-beta', 'packet-beta\n  0-7: "x"'],
    ['kanban', 'kanban\n  Todo'],
    ['architecture-beta', 'architecture-beta\n  service api'],
    ['radar-beta', 'radar-beta\n  axis a'],
    ['treemap', 'treemap\n  "A": 1'],
    ['treemap-beta', 'treemap-beta\n  "A": 1'],
    ['venn-beta', 'venn-beta\n  set A'],
    ['ishikawa', 'ishikawa\n  Root'],
    ['ishikawa-beta', 'ishikawa-beta\n  Root'],
    ['usecase', 'usecase\n  actor U'],
    ['usecase-beta', 'usecase-beta\n  actor U'],
    ['eventmodeling', 'eventmodeling\n  slice s'],
    ['treeView-beta', 'treeView-beta\n  root'],
    ['cynefin-beta', 'cynefin-beta\n  clear'],
    ['wardley-beta', 'wardley-beta\n  title M'],
  ];

  it.each(unsupportedTypes)('refuses %s with mermaid.diagram.unsupported', (kind, src) => {
    const res = transpileMermaidToCoral(src);
    expect(res.ok).toBe(false);
    expect(res.coral).toBeUndefined();
    expect(res.targetNotation).toBeNull();
    expect(res.targetEdition).toBeNull();
    expect(res.visualRenderable).toBe(false);
    const diag = res.diagnostics.find((d) => d.code === 'mermaid.diagram.unsupported');
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe('error');
    expect(diag!.range?.start.line).toBe(1);
    expect(diag!.message.toLowerCase()).toContain(kind.toLowerCase());
    expect(diag!.message).toContain('flowchart');
  });

  it('refuses empty and unrecognized inputs', () => {
    const empty = transpileMermaidToCoral('   \n  ');
    expect(empty.ok).toBe(false);
    expect(codes(empty)).toContain('mermaid.input.empty');

    const unknown = transpileMermaidToCoral('notADiagram foo\nA --> B');
    expect(unknown.ok).toBe(false);
    expect(codes(unknown)).toContain('mermaid.diagram.unrecognized');
  });
});

describe('SPEC-02: Frontmatter, multiline directives, accessibility, and exact UTF-16 line offsets', () => {
  it('tracks exact physical line numbers across frontmatter, init directive, and body', () => {
    const input = [
      '---',
      'title: Checkout',
      'config: { theme: dark }',
      '---',
      '%%{init: {"theme": "dark"}}%%',
      'flowchart TD',
      '  A[Start] --> B[End]',
      '  click A "https://example.com"',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    const titleDiag = res.diagnostics.find((d) => d.code === 'mermaid.frontmatter.title.dropped');
    const configDiag = res.diagnostics.find((d) => d.code === 'mermaid.frontmatter.config.dropped');
    const initDiag = res.diagnostics.find((d) => d.code === 'mermaid.directive.init.dropped');
    const clickDiag = res.diagnostics.find((d) => d.code === 'mermaid.flowchart.click.dropped');

    expect(titleDiag?.severity).toBe('info');
    expect(titleDiag?.range?.start.line).toBe(2);
    expect(configDiag?.severity).toBe('warning');
    expect(configDiag?.range?.start.line).toBe(3);
    expect(initDiag?.severity).toBe('warning');
    expect(initDiag?.range?.start.line).toBe(5);
    expect(clickDiag?.severity).toBe('warning');
    expect(clickDiag?.range?.start.line).toBe(8);
  });

  it('handles multi-line %%{init:...}%% directives and accTitle/accDescr blocks', () => {
    const input = [
      '%%{',
      '  init: { "theme": "forest" }',
      '}%%',
      'flowchart LR',
      '  accTitle: Billing Pipeline',
      '  accDescr {',
      '    Multi-line',
      '    description',
      '  }',
      '  A[Start] --> B[Done]',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(codes(res)).toContain('mermaid.directive.init.dropped');
    expect(codes(res)).toContain('mermaid.accessibility.dropped');
    expect(res.coral).toContain('A process as "Start"');
    expect(res.coral).toContain('B process as "Done"');
  });
});

describe('SPEC-03, SPEC-04, SPEC-05: Flowchart transpilation', () => {
  it('SPEC-03: Golden flowchart with subgraphs and dot-qualified root edges', () => {
    const input = [
      'flowchart LR',
      '  start([Start]) --> check{Valid?}',
      '  subgraph backend [Backend]',
      '    api[API Call] --> sub[[Auth Check]]',
      '  end',
      '  check -->|Yes| api',
      '  check -.->|No| done([Done])',
      '  sub --> done',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(res.detectedKind).toBe('flowchart');
    expect(res.targetNotation).toBe('flowchart');
    expect(res.targetEdition).toBe('0.2.14');
    expect(res.lossSummary.lossy).toBe(false);
    expect(res.idMap['backend.api']).toBe('api');
    expect(res.idMap['backend.sub']).toBe('sub');
    expect(res.idMap.backend).toBe('backend');
    expect(res.coral).toBe([
      '@diagram flowchart',
      '@coralVersion "0.2.14"',
      'layout [direction: RIGHT]',
      '',
      'start terminal [variant: "start"] as "Start"',
      'check decision as "Valid?"',
      'backend group as "Backend" {',
      '  api process as "API Call"',
      '  sub process [symbol: "flowchart-predefined"] as "Auth Check"',
      '}',
      'done terminal [variant: "end"] as "Done"',
      '',
      'start -> check',
      'backend.api -> backend.sub',
      'check -> backend.api as "Yes"',
      'check -.-> done as "No"',
      'backend.sub -> done',
    ].join('\n'));
  });

  it('SPEC-04: Flowchart target notation override (flowchart vs block vs architecture)', () => {
    const input = [
      'flowchart TD',
      '  api[Orders API] --> db[(Orders DB)]',
    ].join('\n');

    const asFlowchart = transpileMermaidToCoral(input);
    expect(asFlowchart.ok).toBe(true);
    expect(asFlowchart.targetNotation).toBe('flowchart');
    expect(asFlowchart.coral).toContain('db process as "Orders DB"');
    const shapeWarn = asFlowchart.diagnostics.find((d) => d.code === 'mermaid.flowchart.shape.degraded');
    expect(shapeWarn?.severity).toBe('warning');
    expect(shapeWarn?.message).toMatch(/block|architecture/i);

    const asBlock = transpileMermaidToCoral(input, { flowchartTarget: 'block' });
    expect(asBlock.ok).toBe(true);
    expect(asBlock.targetNotation).toBe('block');
    expect(asBlock.lossSummary.lossy).toBe(false);
    expect(asBlock.coral).toContain('@diagram block');
    expect(asBlock.coral).toContain('@coralVersion "0.2.14"');
    expect(asBlock.coral).toContain('layout [direction: DOWN]');
    expect(asBlock.coral).toContain('api box as "Orders API"');
    expect(asBlock.coral).toContain('db cylinder as "Orders DB"');
    expect(asBlock.coral).toContain('api -> db');

    const asArch = transpileMermaidToCoral(input, { flowchartTarget: 'architecture' });
    expect(asArch.ok).toBe(true);
    expect(asArch.targetNotation).toBe('architecture');
    expect(asArch.lossSummary.lossy).toBe(false);
    expect(asArch.coral).toContain('@diagram architecture');
    expect(asArch.coral).toContain('@coralVersion "0.2.14"');
    expect(asArch.coral).toContain('layout [direction: DOWN]');
    expect(asArch.coral).toContain('api service as "Orders API"');
    expect(asArch.coral).toContain('db database as "Orders DB"');
    expect(asArch.coral).toContain('api -> db');
  });

  it('emits layout [direction: DOWN] for bare graph when targeting block', () => {
    const res = transpileMermaidToCoral('graph\n  A[One] --> B[Two]', { flowchartTarget: 'block' });
    expect(res.ok).toBe(true);
    expect(res.coral).toContain('layout [direction: DOWN]');
  });

  it('SPEC-05: Fan-out, CSS colors, o--o, <-.->, v11.3+ edge IDs, visual-safe vs portable', () => {
    const input = [
      'flowchart LR',
      '  A & B ==> C',
      '  A e1@-.-> C',
      '  e1@{ animate: true }',
      '  A o--o D',
      '  B <-.-> D',
      '  A ~~~ D',
      '  B --x D',
      '  classDef hot fill:#f9f,stroke:red',
      '  class C hot',
    ].join('\n');

    const visualSafe = transpileMermaidToCoral(input);
    expect(visualSafe.ok).toBe(true);
    expect(visualSafe.coral).toContain('C process [style: "fill: #ff99ff; stroke: #ff0000"]');
    expect(visualSafe.coral).toContain('A -o D [firstEnd: circle]');
    expect(visualSafe.coral).toContain('B <-> D [style: "dashed"]');
    expect(visualSafe.coral).toContain('A -> C');
    expect(visualSafe.coral).toContain('B -> C');
    expect(visualSafe.coral).toContain('e1 = A -.-> C');
    expect(visualSafe.coral).not.toContain('thick');
    expect(visualSafe.coral).not.toContain('animated:forward');
    expect(codes(visualSafe)).toContain('mermaid.flowchart.edge-weight.degraded');
    expect(codes(visualSafe)).toContain('mermaid.flowchart.edge-animation.degraded');
    expect(codes(visualSafe)).toContain('mermaid.flowchart.edge.invisible.dropped');
    expect(codes(visualSafe)).toContain('mermaid.flowchart.marker.cross.degraded');

    const portable = transpileMermaidToCoral(input, { edgeStyleMode: 'portable' });
    expect(portable.ok).toBe(true);
    expect(portable.coral).toContain('A -> C [style: "thick"]');
    expect(portable.coral).toContain('B -> C [style: "thick"]');
    expect(portable.coral).toContain('e1 = A -.-> C [style: "animated:forward"]');
    expect(portable.coral).not.toContain('dashed; animated');
  });

  it('supports v11.3+ @{ shape: ... } nodes, inline edge labels, chains, and LCA reparenting', () => {
    const input = [
      'flowchart TD',
      '  d@{ shape: doc, label: "Spec Doc" } -- sends --> p@{ shape: proc, label: "Worker" } -. logs .-> c@{ shape: comment, label: "Note" }',
      '  subgraph sg1 [One]',
      '    shared[Shared] --> x[X]',
      '  end',
      '  subgraph sg2 [Two]',
      '    shared --> y[Y]',
      '  end',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(res.coral).toContain('d document as "Spec Doc"');
    expect(res.coral).toContain('c process [symbol: "flowchart-annotation"] as "Note"');
    expect(res.coral).toContain('d -> p as "sends"');
    expect(res.coral).toContain('p -.-> c as "logs"');
    expect(codes(res)).toContain('mermaid.flowchart.subgraph.reparented');
  });
});

describe('SPEC-06 & SPEC-07: Sequence Diagram transpilation', () => {
  it('SPEC-06: Golden sequence diagram with box, nested activation, alt/else, and note', () => {
    const input = [
      'sequenceDiagram',
      '  actor user as User',
      '  box Backend',
      '    participant api as API',
      '    participant db as Database',
      '  end',
      '  user->>+api: POST /orders',
      '  alt valid',
      '    api->>db: INSERT order',
      '    db-->>api: 201 Created',
      '  else invalid',
      '    Note over api: Rejected payload',
      '    api-->>user: Log warning',
      '  end',
      '  api-->>-user: Response',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(res.detectedKind).toBe('sequence');
    expect(res.targetNotation).toBe('uml-sequence');
    expect(res.targetEdition).toBe('0.2.14');
    expect(res.lossSummary.lossy).toBe(false);
    expect(res.diagnostics).toEqual([]);
    expect(res.coral).toBe([
      '@diagram uml-sequence',
      '@coralVersion "0.2.14"',
      '',
      'user actor as "User"',
      'api participant as "API"',
      'db participant as "Database"',
      '',
      'box_1 = participants api, db [label: "Backend"]',
      '',
      'activation api {',
      '  msg_1 = user -#> api as "POST /orders"',
      '  alt "valid" {',
      '    msg_2 = api -#> db as "INSERT order"',
      '    msg_3 = db -.-> api as "201 Created"',
      '  } else "invalid" {',
      '    note "Rejected payload" on api',
      '    msg_4 = api -.-> user as "Log warning"',
      '  }',
      '  msg_5 = api -.-> user as "Response"',
      '}',
    ].join('\n'));
  });

  it('SPEC-07: Interleaved activations, msg_1 collision avoidance, create/destroy, par/critical/break/rect', () => {
    const interleaved = [
      'sequenceDiagram',
      '  participant A',
      '  participant B',
      '  A->>B: one',
      '  activate A',
      '  A->>B: two',
      '  activate B',
      '  B-->>A: three',
      '  deactivate A',
      '  B-->>A: four',
      '  deactivate B',
    ].join('\n');
    const rInter = transpileMermaidToCoral(interleaved);
    expect(rInter.ok).toBe(true);
    expect(codes(rInter)).toContain('mermaid.sequence.activation.non-nested.dropped');
    expect(transpileMermaidToCoral(interleaved, { mode: 'strict' }).ok).toBe(false);

    const collision = [
      'sequenceDiagram',
      '  participant msg_1',
      '  participant B',
      '  msg_1->>B: hello',
    ].join('\n');
    const rCol = transpileMermaidToCoral(collision);
    expect(rCol.ok).toBe(true);
    expect(rCol.coral).toContain('msg_2 = msg_1 -#> B as "hello"');

    const lifecycle = [
      'sequenceDiagram',
      '  participant A',
      '  create actor U as User',
      '  A->>U: spawn',
      '  destroy U',
      '  A->>U: terminate',
    ].join('\n');
    const rLife = transpileMermaidToCoral(lifecycle);
    expect(rLife.ok).toBe(true);
    expect(rLife.coral).toContain('U actor as "User"');
    expect(rLife.coral).toContain('A -.-> U [create] as "spawn"');
    expect(rLife.coral).toContain('A -#> U [destroy] as "terminate"');
    expect(codes(rLife)).toContain('mermaid.sequence.create-arrow.normalized');

    const blocks = [
      'sequenceDiagram',
      '  participant A',
      '  participant B',
      '  par Notify',
      '    A->>B: email',
      '  and Audit',
      '    A->>B: log',
      '  end',
      '  critical Establish',
      '    A->>B: connect',
      '  option Timeout',
      '    A->>B: retry',
      '  end',
      '  break Failed',
      '    A->>B: abort',
      '  end',
      '  rect rgb(200, 220, 255)',
      '    A->>B: work',
      '  end',
    ].join('\n');
    const rBlocks = transpileMermaidToCoral(blocks);
    expect(rBlocks.ok).toBe(true);
    expect(rBlocks.coral).toContain('par "Notify" {');
    expect(rBlocks.coral).toContain('} and "Audit" {');
    expect(rBlocks.coral).toContain('critical "Establish" {');
    expect(rBlocks.coral).toContain('opt "Timeout" {');
    expect(rBlocks.coral).toContain('break "Failed" {');
    expect(rBlocks.coral).toContain('region {');
    expect(codes(rBlocks)).toContain('mermaid.sequence.critical-option.degraded');
    expect(codes(rBlocks)).toContain('mermaid.sequence.rect-color.dropped');
  });
});

describe('SPEC-08 & SPEC-09: Class Diagram transpilation', () => {
  it('SPEC-08: Golden class diagram with namespace group, compartments, polarity, and multiplicities', () => {
    const input = [
      'classDiagram',
      '  namespace Banking {',
      '    class Account["Bank Account"] {',
      '      +String owner',
      '      -Decimal balance',
      '      +deposit(Decimal amount) Boolean',
      '    }',
      '    class SavingsAccount',
      '  }',
      '  Account <|-- SavingsAccount',
      '  Customer "1" --> "0..*" Account : owns',
      '  Portfolio *-- Account',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(res.detectedKind).toBe('class');
    expect(res.targetNotation).toBe('uml-class');
    expect(res.targetEdition).toBe('0.2.14');
    expect(res.lossSummary.lossy).toBe(false);
    expect(res.coral).toBe([
      '@diagram uml-class',
      '@coralVersion "0.2.14"',
      '',
      'Banking group {',
      '  Account class as "Bank Account" {',
      '    attributes {',
      '      + owner: String',
      '      - balance: Decimal',
      '    }',
      '    operations {',
      '      + deposit(amount: Decimal): Boolean',
      '    }',
      '  }',
      '  SavingsAccount class',
      '}',
      'Customer class',
      'Portfolio class',
      '',
      'Banking.SavingsAccount -|> Banking.Account [inheritance]',
      'Customer -> Banking.Account [association, firstLabel: "1", secondLabel: "0..*"] as "owns"',
      'Portfolio -- Banking.Account [composition, firstEnd: filledDiamond]',
    ].join('\n'));
  });

  it('SPEC-09: Class 0.2.14 gaps, <..>, symmetric arrows, and strict refusal', () => {
    const input = [
      'classDiagram',
      '  class Status {',
      '    <<enumeration>>',
      '    OPEN',
      '    CLOSED',
      '  }',
      '  class Order {',
      '    <<abstract>>',
      '    +int count$',
      '    +List~Item~ items',
      '  }',
      '  note for Order "Immutable"',
      '  Order <..> Status',
      '  A *--* B',
      '  C o--o D',
      '  E <|--|> F',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(res.coral).toContain('Status enum');
    expect(res.coral).toContain('Order <-> Status [dependency, style: "dashed"]');
    expect(res.coral).toContain('A -#<> B [composition, firstEnd: filledDiamond]');
    expect(res.coral).toContain('C -<> D [aggregation, firstEnd: diamond]');
    expect(res.coral).toContain('E -|> F [inheritance, firstEnd: triangle]');
    expect(codes(res)).toContain('mermaid.class.enum-literals.dropped');
    expect(codes(res)).toContain('mermaid.class.modifier.abstract.dropped');
    expect(codes(res)).toContain('mermaid.class.member-modifier.dropped');
    expect(codes(res)).toContain('mermaid.class.member-type.sanitized');
    expect(codes(res)).toContain('mermaid.class.note.dropped');

    const strict = transpileMermaidToCoral(input, { mode: 'strict' });
    expect(strict.ok).toBe(false);
    expect(codes(strict)).toContain('coral.transpile.strict.refused');
  });
});

describe('SPEC-10 & SPEC-11: ER Diagram transpilation', () => {
  it('SPEC-10: Golden ER diagram with column inversion and native Crow\'s Foot', () => {
    const input = [
      'erDiagram',
      '  CUSTOMER {',
      '    uuid id PK',
      '    varchar(255) email UK',
      '  }',
      '  ORDER {',
      '    uuid id PK',
      '    uuid customer_id FK',
      '  }',
      '  CUSTOMER ||--o{ ORDER : places',
      '  ORDER ||..|{ LINE-ITEM : contains',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(res.detectedKind).toBe('er');
    expect(res.targetNotation).toBe('erd');
    expect(res.targetEdition).toBe('0.2.14');
    expect(res.lossSummary.lossy).toBe(false);
    expect(res.lossSummary.infoCount).toBe(1);
    expect(res.idMap.LINE_ITEM).toBe('LINE-ITEM');
    expect(res.coral).toBe([
      '@diagram erd',
      '@coralVersion "0.2.14"',
      '',
      'CUSTOMER entity {',
      '  columns {',
      '    id uuid [pk]',
      '    email varchar(255) [uk]',
      '  }',
      '}',
      'ORDER entity {',
      '  columns {',
      '    id uuid [pk]',
      '    customer_id uuid [fk]',
      '  }',
      '}',
      'LINE_ITEM entity as "LINE-ITEM"',
      '',
      'CUSTOMER ||--o{ ORDER as "places"',
      'ORDER ||..|{ LINE_ITEM as "contains"',
    ].join('\n'));
  });

  it('SPEC-11: ER column comments, array/generic types, duplicate columns, and English aliases', () => {
    const input = [
      'erDiagram',
      '  POST {',
      '    string[] tags "tag list"',
      '    string tags',
      '    List~int~ ids',
      '  }',
      '  USER one or more optionally to zero or many POST : writes',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(res.coral).toContain('tags string_array');
    expect(res.coral).toContain('ids List_int');
    expect(res.coral).toContain('USER }|..o{ POST as "writes"');
    expect(codes(res)).toContain('mermaid.er.column-type.sanitized');
    expect(codes(res)).toContain('mermaid.er.column-comment.dropped');
    expect(codes(res)).toContain('mermaid.er.column.duplicate.dropped');
  });
});

describe('State Diagram transpilation: Edition 0.2.17 (default) and 0.2.8 (legacy SPEC-12/13)', () => {
  it('Edition 0.2.17 (default): full visual composite, choice/fork/join, descriptions, note, layout, style', () => {
    const input = [
      'stateDiagram-v2',
      '  direction LR',
      '  [*] --> Idle',
      '  Idle : Waiting for input',
      '  Idle : Ready',
      '  state branch <<choice>>',
      '  state split <<fork>>',
      '  state merge <<join>>',
      '  state Active {',
      '    [*] --> Run',
      '    Run --> Pause : hold',
      '    --',
      '    [*] --> Log',
      '  }',
      '  note right of Idle : Entry state',
      '  Idle --> branch : submit',
      '  branch --> split : ok',
      '  branch --> Active : direct',
      '  split --> Active : a',
      '  split --> merge : b',
      '  Active --> merge : done',
      '  merge --> [*]',
      '  classDef warn fill:#fff1f2,stroke:#be123c',
      '  class Idle warn',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(res.detectedKind).toBe('state');
    expect(res.targetNotation).toBe('uml-state');
    expect(res.targetEdition).toBe('0.2.17');
    expect(res.coral).toContain('@diagram uml-state');
    expect(res.coral).toContain('@coralVersion "0.2.17"');
    expect(res.coral).toContain('layout [direction: RIGHT]');
    expect(res.coral).toContain('branch choice');
    expect(res.coral).toContain('split fork');
    expect(res.coral).toContain('merge join');
    expect(res.coral).toContain('Active composite as "Active" {');
    expect(res.coral).toContain('Active.Run -> Active.Pause as "hold"');
    expect(res.coral).toContain('description: "Waiting for input\\nReady"');
    expect(res.coral).toContain('style: "fill: #fff1f2; stroke: #be123c"');
    expect(res.coral).toContain('note_1 note as "Entry state"');
    expect(res.coral).toContain('note_1 -.- Idle [annotation]');
    expect(codes(res)).toContain('mermaid.state.concurrency.dropped');
    expect(codes(res)).not.toContain('mermaid.state.composite.flattened');
    expect(codes(res)).not.toContain('mermaid.state.pseudostate.degraded');
    expect(codes(res)).not.toContain('mermaid.state.note.dropped');
    expect(codes(res)).not.toContain('mermaid.state.direction.dropped');
  });

  it('SPEC-12: Explicit stateTargetEdition: 0.2.8 produces flat Edition 0.2.8 uml-state', () => {
    const input = [
      'stateDiagram-v2',
      '  [*] --> Idle',
      '  Idle --> Checking : submit',
      '  state "Validating Order" as Checking',
      '  Checking --> Done : valid',
      '  Done --> [*]',
    ].join('\n');

    const res = transpileMermaidToCoral(input, { stateTargetEdition: '0.2.8' });
    expect(res.ok).toBe(true);
    expect(res.targetNotation).toBe('uml-state');
    expect(res.targetEdition).toBe('0.2.8');
    expect(res.lossSummary.lossy).toBe(false);
    expect(res.coral).toBe([
      '@diagram uml-state',
      '',
      'start initial',
      'Idle state',
      'Checking state as "Validating Order"',
      'Done state',
      'finish final',
      '',
      'start -> Idle',
      'Idle -> Checking as "submit"',
      'Checking -> Done as "valid"',
      'Done -> finish',
    ].join('\n'));
  });

  it('SPEC-13: Explicit stateTargetEdition: 0.2.8 flattens composite and warns on 0.2.17 features', () => {
    const input = [
      'stateDiagram-v2',
      '  direction LR',
      '  state branch <<choice>>',
      '  state Active {',
      '    [*] --> Run',
      '    --',
      '    [*] --> Log',
      '  }',
      '  note right of Active : live',
      '  Active --> branch',
      '  branch --> [*]',
    ].join('\n');

    const res = transpileMermaidToCoral(input, { stateTargetEdition: '0.2.8' });
    expect(res.ok).toBe(true);
    expect(res.targetEdition).toBe('0.2.8');
    expect(res.coral).not.toContain('@coralVersion');
    expect(codes(res)).toContain('mermaid.state.composite.flattened');
    expect(codes(res)).toContain('mermaid.state.concurrency.dropped');
    expect(codes(res)).toContain('mermaid.state.pseudostate.degraded');
    expect(codes(res)).toContain('mermaid.state.direction.dropped');
    expect(codes(res)).toContain('mermaid.state.note.dropped');

    const strict = transpileMermaidToCoral(input, { stateTargetEdition: '0.2.8', mode: 'strict' });
    expect(strict.ok).toBe(false);
    expect(codes(strict)).toContain('coral.transpile.strict.refused');
  });
});

describe('SPEC-14, SPEC-15, SPEC-16, SPEC-19: Hygiene, Strict Mode, Determinism, Security & Perf', () => {
  it('SPEC-14: Reserved keywords, numeric IDs, collision loop, tabs, and strict escapes', () => {
    const input = [
      'flowchart LR',
      '  layout[Layout Engine] --> 123[Step One]',
      '  a-b[First] --> a_b_2[Preexisting]',
      '  a_b["a \\"quoted\\" C:\\\\path\tLine1<br/>Line2"] --> layout',
    ].join('\n');

    const res = transpileMermaidToCoral(input);
    expect(res.ok).toBe(true);
    expect(res.idMap.layout_id).toBe('layout');
    expect(res.idMap.n_123).toBe('123');
    expect(res.idMap.a_b).toBe('a-b');
    expect(res.idMap.a_b_2).toBe('a_b_2');
    expect(res.idMap.a_b_3).toBe('a_b');
    expect(codes(res)).toContain('mermaid.text.tab.normalized');
    expect(res.coral).not.toContain('\t');
    expect(res.coral).not.toContain('\\t');
    expect(res.coral).toContain('Line1\\nLine2');
  });

  it('SPEC-15: info diagnostics do not trigger strict-mode refusal', () => {
    const input = [
      'flowchart LR',
      '  accTitle: Billing',
      '  order-api[Orders API] --> pay-svc[Payments]',
    ].join('\n');

    const res = transpileMermaidToCoral(input, { mode: 'strict' });
    expect(res.ok).toBe(true);
    expect(res.lossSummary.lossy).toBe(false);
    expect(codes(res)).toContain('mermaid.accessibility.dropped');
    expect(codes(res)).toContain('mermaid.id.normalized');
  });

  it('SPEC-16: Determinism and formatDocument028 fixpoint across all 5 types', () => {
    const fixtures = [
      'flowchart LR\n  A[Start] --> B[End]',
      'sequenceDiagram\n  A->>B: hi',
      'classDiagram\n  Parent <|-- Child',
      'erDiagram\n  A ||--o{ B : has',
      'stateDiagram-v2\n  [*] --> Idle\n  Idle --> [*]',
    ];
    const runtime = builtInRuntime();
    for (const src of fixtures) {
      const r1 = transpileMermaidToCoral(src);
      const r2 = transpileMermaidToCoral(src);
      expect(r1.ok).toBe(true);
      expect(r1.coral).toBe(r2.coral);
      expect(formatDocument028(r1.coral!, runtime)).toBe(r1.coral);
    }
  });

  it('SPEC-19: Prototype pollution, ReDoS, nesting cap, XSS escaping, and 500-node budget', () => {
    // (a) Prototype pollution keys
    const protoSrc = [
      'flowchart LR',
      '  __proto__[Proto] --> constructor[Ctor]',
      '  toString[ToStr] --> hasOwnProperty[HasOwn]',
    ].join('\n');
    const rProto = transpileMermaidToCoral(protoSrc);
    expect(rProto.ok).toBe(true);
    expect(({} as Record<string, unknown>).Proto).toBeUndefined();

    // (b) 100 KB pathological unclosed bracket/quote string
    const pathological = `flowchart LR\n  A["${'['.repeat(100_000)}`;
    const t0 = performance.now();
    const rPath = transpileMermaidToCoral(pathological);
    const dtPath = performance.now() - t0;
    expect(dtPath).toBeLessThan(200);
    expect(rPath.diagnostics.length).toBeGreaterThan(0);

    // (c) 40-level nested subgraph hits maxNestingDepth
    const deep = [
      'flowchart TD',
      ...Array.from({ length: 40 }, (_, i) => `subgraph g${i}`),
      '  leaf[Leaf]',
      ...Array.from({ length: 40 }, () => 'end'),
    ].join('\n');
    const rDeep = transpileMermaidToCoral(deep);
    expect(rDeep.ok).toBe(false);
    expect(codes(rDeep)).toContain('mermaid.input.nesting-exceeded');

    // (d) Script tag stays literal quoted text
    const xss = 'flowchart LR\n  A["<script>alert(1)</script>"] --> B[Safe]';
    const rXss = transpileMermaidToCoral(xss);
    expect(rXss.ok).toBe(true);
    expect(rXss.coral).toContain('as "<script>alert(1)</script>"');

    // (e) 500-node flowchart performance budget
    const lines = ['flowchart LR'];
    for (let i = 0; i < 500; i++) {
      lines.push(`  n${i}[Node ${i}] --> n${i + 1}[Node ${i + 1}]`);
    }
    const bigSrc = lines.join('\n');
    const tBig = performance.now();
    const rBig = transpileMermaidToCoral(bigSrc);
    const dtBig = performance.now() - tBig;
    expect(rBig.ok).toBe(true);
    expect(dtBig).toBeLessThan(250);
  });
});

describe('FIX-1 Adversarial Security & Compiler Review Regressions (C1-C3, M1-M7)', () => {
  it('C1: enforces expanded edge budget on adversarial fan-out and merges repeated linkStyle default linearly', () => {
    const left = Array.from({ length: 200 }, (_, i) => `a${i}`).join(' & ');
    const right = Array.from({ length: 200 }, (_, i) => `b${i}`).join(' & ');
    const t0 = performance.now();
    const res = transpileMermaidToCoral(`flowchart LR\n  ${left} --> ${right}`);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(res.ok).toBe(false);
    expect(codes(res)).toContain('mermaid.input.too-large');

    // Repeated linkStyle default over 300 edges stays fast and preserves per-index override
    const lsLines = ['flowchart LR'];
    for (let i = 0; i < 300; i++) lsLines.push(`  n${i} --> n${i + 1}`);
    for (let i = 0; i < 200; i++) lsLines.push('  linkStyle default stroke:#00ff00');
    lsLines.push('  linkStyle 0 stroke:#ff0000');
    const t1 = performance.now();
    const rLs = transpileMermaidToCoral(lsLines.join('\n'), { edgeStyleMode: 'portable' });
    expect(performance.now() - t1).toBeLessThan(250);
    expect(rLs.ok).toBe(true);
    expect(rLs.coral).toContain('n0 -> n1 [style: "#ff0000"]');
    expect(rLs.coral).toContain('n1 -> n2 [style: "#00ff00"]');
  });

  it('C2: caps deeply nested sequence activations against maxNestingDepth without stack overflow', () => {
    const lines = ['sequenceDiagram', '  participant A', '  participant B'];
    for (let i = 0; i < 60; i++) {
      lines.push('  activate A');
      lines.push('  A->>B: ping');
    }
    for (let i = 0; i < 60; i++) {
      lines.push('  deactivate A');
    }
    const res = transpileMermaidToCoral(lines.join('\n'));
    expect(res.ok).toBe(false);
    expect(codes(res)).toContain('mermaid.input.nesting-exceeded');

    const plusLines = ['sequenceDiagram'];
    for (let i = 0; i < 50; i++) plusLines.push('  A->>+B: call');
    for (let i = 0; i < 50; i++) plusLines.push('  B-->>-A: ret');
    const rPlus = transpileMermaidToCoral(plusLines.join('\n'));
    expect(rPlus.ok).toBe(false);
    expect(codes(rPlus)).toContain('mermaid.input.nesting-exceeded');
  });

  it('C3: linear-time parsing under pathological whitespace for detect, class, sequence, ER, and state', () => {
    const spaces = ' '.repeat(50_000);
    const t0 = performance.now();
    detectFormat(`graph${spaces}x`);
    transpileMermaidToCoral(`flowchart LR\n  class A${spaces}`);
    transpileMermaidToCoral(`sequenceDiagram\n  participant A${spaces}B`);
    transpileMermaidToCoral(`classDiagram\n  namespace A${spaces}B`);
    transpileMermaidToCoral(`classDiagram\n  A${spaces}"1" --> B`);
    transpileMermaidToCoral(`erDiagram\n  class A${spaces}`);
    transpileMermaidToCoral(`stateDiagram-v2\n  class A${spaces}`);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('M1: ignores _testOverrideEmittedCoral on public API and tests Stage 4A directly via verifyEmittedCoralStage4A', () => {
    const res = transpileMermaidToCoral('flowchart LR\n  A --> B', {
      _testOverrideEmittedCoral: 'INVALID CORAL',
    } as Record<string, unknown>);
    expect(res.ok).toBe(true);
    expect(res.coral).toContain('A -> B');

    const check = verifyEmittedCoralStage4A('@diagram flowchart\n@coralVersion "0.2.14"\nINVALID {{{ SYNTAX');
    expect(check.ok).toBe(false);
    expect(check.errorMessage).toContain('Stage 4A');
  });

  it('M2: handles English apostrophes in semicolon-split statements and inline %% comments', () => {
    const flow = transpileMermaidToCoral("flowchart LR\n  A[User's Cart]; B[Checkout]\n  A --> B %% User's flow");
    expect(flow.ok).toBe(true);
    expect(flow.coral).toContain('A process as "User\'s Cart"');
    expect(flow.coral).toContain('B process as "Checkout"');

    const seq = transpileMermaidToCoral("sequenceDiagram\n  Alice->>Bob: It's done %% trailing comment");
    expect(seq.ok).toBe(true);
    expect(seq.coral).toContain('as "It\'s done"');
    expect(seq.coral).not.toContain('trailing comment');
  });

  it('M3: rejects U+FFFE/U+FFFF and control scalars in labels and preserved comments', () => {
    const badLabel = transpileMermaidToCoral('flowchart LR\n  A["bad\uFFFEtext"] --> B["ok\uFFFF"]');
    expect(badLabel.ok).toBe(false);
    expect(codes(badLabel)).toContain('mermaid.text.invalid-scalar');

    const badComment = transpileMermaidToCoral('flowchart LR\n  %% bad\u0007comment\n  A --> B', { preserveComments: true });
    expect(badComment.ok).toBe(false);
    expect(codes(badComment)).toContain('mermaid.text.invalid-scalar');

    const sepInRawId = transpileMermaidToCoral('flowchart LR\n  "foo\u2028bar" --> B');
    expect(sepInRawId.ok).toBe(true);
    expect(sepInRawId.coral).not.toContain('\u2028');
    expect(sepInRawId.coral).toContain('as "foo\\nbar"');
  });

  it('M4: preserves reverse/mixed flowchart arrows, earliest [/ \\] delimiters, forward subgraph refs, and rgb() linkStyle', () => {
    const arrows = transpileMermaidToCoral([
      'flowchart LR',
      '  A <-- B',
      '  A o--> C',
      '  A <--o D',
      '  A <-.- E',
      '  A <== F',
    ].join('\n'));
    expect(arrows.ok).toBe(true);
    expect(arrows.coral).toContain('A <- B');
    expect(arrows.coral).toContain('A -> C [firstEnd: circle]');
    expect(arrows.coral).toContain('D -> A [firstEnd: circle]');
    expect(arrows.coral).toContain('A <- E [style: "dashed"]');
    expect(arrows.coral).toContain('A <- F');

    const traps = transpileMermaidToCoral('flowchart LR\n  A[/Trap\\] --> B[/Para/]');
    expect(traps.ok).toBe(true);
    expect(traps.coral).toContain('A process as "Trap"');
    expect(traps.coral).toContain('B io as "Para"');
    expect(traps.coral).toContain('A -> B');

    const fwdSub = transpileMermaidToCoral([
      'flowchart LR',
      '  client[Client] --> backend',
      '  subgraph backend [Backend]',
      '    api[API]',
      '  end',
    ].join('\n'));
    expect(fwdSub.ok).toBe(true);
    expect(fwdSub.coral).toContain('backend group as "Backend"');
    expect(fwdSub.coral).toContain('client -> backend');

    const rgbLink = transpileMermaidToCoral('flowchart LR\n  A --> B\n  linkStyle 0 stroke:rgb(255, 0, 0)', {
      edgeStyleMode: 'portable',
    });
    expect(rgbLink.ok).toBe(true);
    expect(rgbLink.coral).toContain('A -> B [style: "#ff0000"]');
  });

  it('M5: defaults empty first alt guard and records activate in usedBeforeIndex before create', () => {
    const unlabeledAlt = transpileMermaidToCoral([
      'sequenceDiagram',
      '  alt',
      '    A->>B: one',
      '  else',
      '    A->>B: two',
      '  end',
    ].join('\n'));
    expect(unlabeledAlt.ok).toBe(true);
    expect(unlabeledAlt.coral).toContain('alt "alt" {');
    expect(codes(unlabeledAlt)).toContain('mermaid.sequence.guard.defaulted');

    const activateThenCreate = transpileMermaidToCoral([
      'sequenceDiagram',
      '  participant A',
      '  activate W',
      '  A->>B: work',
      '  deactivate W',
      '  create participant W',
      '  A->>W: spawn',
    ].join('\n'));
    expect(activateThenCreate.ok).toBe(true);
    expect(activateThenCreate.coral).not.toContain('[create]');
    expect(codes(activateThenCreate)).toContain('mermaid.sequence.create.root-only.dropped');
  });

  it('M6: handles -> in state descriptions, cross-composite root references, styled composites, and empty composites', () => {
    const src = [
      'stateDiagram-v2',
      '  [*] --> Idle',
      '  Idle : Maps input -> output',
      '  state Active:::warn {',
      '    [*] --> Run',
      '    Run --> Idle : cancel',
      '  }',
      '  state Empty {}',
      '  Idle --> Active : start',
      '  Active --> Empty : pause',
      '  Empty --> [*]',
      '  classDef warn fill:#fff1f2,stroke:#be123c',
    ].join('\n');
    const res = transpileMermaidToCoral(src);
    expect(res.ok).toBe(true);
    expect(res.coral).toContain('Idle state [description: "Maps input -> output"]');
    expect(res.coral).toContain('Active composite [style: "fill: #fff1f2; stroke: #be123c"] as "Active" {');
    expect(res.coral).toContain('Empty composite as "Empty" {');
    // Run --> Idle resolves to root Idle, NOT Active.Idle
    expect(res.coral).toContain('Active.Run -> Idle as "cancel"');
    expect(res.coral).not.toContain('Active.Idle');
  });

  it('M7: handles ER spaceless }, decimal(10, 2), invalid numeric(10/2), English aliases, Class spaceless *--, and duplicate member warning', () => {
    const er = transpileMermaidToCoral([
      'erDiagram',
      '  ORDER {',
      '    decimal(10, 2) price PK',
      '    numeric(10/2) ratio',
      '  }',
      '  ORDER}|--||CUSTOMER : belongs_to',
      '  CUSTOMER one to many(0+) ITEM : likes',
      '  ITEM many(1+) optionally to one TAG : tagged',
    ].join('\n'));
    expect(er.ok).toBe(true);
    expect(er.coral).toContain('price decimal(10, 2) [pk]');
    expect(er.coral).toContain('ratio numeric_10_2');
    expect(codes(er)).toContain('mermaid.er.column-type.sanitized');
    expect(er.coral).toContain('ORDER }|--|| CUSTOMER as "belongs_to"');
    expect(er.coral).toContain('CUSTOMER ||--o{ ITEM as "likes"');
    expect(er.coral).toContain('ITEM }|..|| TAG as "tagged"');

    const cls = transpileMermaidToCoral([
      'classDiagram',
      '  class Box {',
      '    +String id',
      '    +int id',
      '  }',
      '  Order*--LineItem',
    ].join('\n'));
    expect(cls.ok).toBe(true);
    expect(cls.coral).toContain('Order -- LineItem [composition, firstEnd: filledDiamond]');
    expect(codes(cls)).toContain('mermaid.class.member.duplicate.dropped');
    expect(transpileMermaidToCoral('classDiagram\n  class Box {\n    +String id\n    +int id\n  }', { mode: 'strict' }).ok).toBe(false);
  });
});
