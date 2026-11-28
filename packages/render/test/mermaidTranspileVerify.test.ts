import { describe, it, expect } from 'vitest';
import {
  projectInstalledSourceToSuccessor028,
  renderInstalledCharacterPreview028,
  renderSvg,
  successorSourceDisplay028,
  successorSourceDisplayWithSemanticPorts028,
  transpileAndVerifyMermaidToCoral,
} from '../src/index.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { verifyEmittedCoralStage4B } from '../src/transpileMermaid0214.js';

async function renderCoralToSvg(coral: string): Promise<string> {
  const projected = projectInstalledSourceToSuccessor028(coral);
  expect(projected.diagnostics).toEqual([]);
  expect(projected.graph).toBeDefined();
  const display = projected.graph!.interaction
    ? successorSourceDisplay028(projected.graph!)
    : successorSourceDisplayWithSemanticPorts028(projected.graph!).display;
  const laidOut = await layoutGraphForSvg(display);
  const svg = renderSvg(laidOut);
  expect(svg).toContain('<svg');
  return svg;
}

describe('transpileAndVerifyMermaidToCoral Stage 4B end-to-end verification', () => {
  it('verifies and renders Flowchart across flowchart, block, and architecture targets', async () => {
    const flowSrc = [
      'flowchart LR',
      '  start([Start]) --> check{Valid?}',
      '  subgraph backend [Backend]',
      '    api[API Call] --> sub[[Auth Check]]',
      '  end',
      '  check -->|Yes| api',
      '  check -.->|No| done([Done])',
      '  sub --> done',
    ].join('\n');

    const rFlow = transpileAndVerifyMermaidToCoral(flowSrc);
    expect(rFlow.ok).toBe(true);
    expect(rFlow.visualRenderable).toBe(true);
    expect(rFlow.targetNotation).toBe('flowchart');
    expect(rFlow.targetEdition).toBe('0.2.14');
    await renderCoralToSvg(rFlow.coral!);

    const dbSrc = 'flowchart TD\n  api[Orders API] --> db[(Orders DB)]';
    const rBlock = transpileAndVerifyMermaidToCoral(dbSrc, { flowchartTarget: 'block' });
    expect(rBlock.ok).toBe(true);
    expect(rBlock.visualRenderable).toBe(true);
    expect(rBlock.targetNotation).toBe('block');
    await renderCoralToSvg(rBlock.coral!);

    const rArch = transpileAndVerifyMermaidToCoral(dbSrc, { flowchartTarget: 'architecture' });
    expect(rArch.ok).toBe(true);
    expect(rArch.visualRenderable).toBe(true);
    expect(rArch.targetNotation).toBe('architecture');
    await renderCoralToSvg(rArch.coral!);
  });

  it('honestly marks edgeStyleMode: portable as visualRenderable: false with info advisory', () => {
    const src = 'flowchart LR\n  A ==> B\n  A e1@-.-> B\n  e1@{ animate: true }';
    const res = transpileAndVerifyMermaidToCoral(src, { edgeStyleMode: 'portable' });
    expect(res.ok).toBe(true);
    expect(res.visualRenderable).toBe(false);
    expect(res.diagnostics.some((d) => d.code === 'coral.edge-style.visual-unavailable' && d.severity === 'info')).toBe(true);
  });

  it('verifies and renders Sequence diagram via successorSourceDisplay028 seam', async () => {
    const src = [
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

    const res = transpileAndVerifyMermaidToCoral(src);
    expect(res.ok).toBe(true);
    expect(res.visualRenderable).toBe(true);
    expect(res.targetNotation).toBe('uml-sequence');
    expect(res.targetEdition).toBe('0.2.14');
    await renderCoralToSvg(res.coral!);
  });

  it('verifies and renders Class diagram with namespace group and [inheritance]', async () => {
    const src = [
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

    const res = transpileAndVerifyMermaidToCoral(src);
    expect(res.ok).toBe(true);
    expect(res.visualRenderable).toBe(true);
    expect(res.targetNotation).toBe('uml-class');
    expect(res.targetEdition).toBe('0.2.14');
    expect(res.diagnostics).toEqual([]);
    await renderCoralToSvg(res.coral!);
  });

  it('verifies and renders ER diagram with columns and native Crow\'s Foot', async () => {
    const src = [
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

    const res = transpileAndVerifyMermaidToCoral(src);
    expect(res.ok).toBe(true);
    expect(res.visualRenderable).toBe(true);
    expect(res.targetNotation).toBe('erd');
    expect(res.targetEdition).toBe('0.2.14');
    await renderCoralToSvg(res.coral!);
  });

  it('verifies and renders State diagram under default Edition 0.2.17 with visualRenderable: true', async () => {
    const src = [
      'stateDiagram-v2',
      '  direction LR',
      '  [*] --> Idle',
      '  Idle : Waiting for work',
      '  state check <<choice>>',
      '  state Active {',
      '    [*] --> Run',
      '    Run --> Pause : hold',
      '  }',
      '  note right of Idle : Initial idle state',
      '  Idle --> check : submit',
      '  check --> Active : valid',
      '  check --> Failed : invalid',
      '  Active --> [*]',
      '  Failed --> [*]',
    ].join('\n');

    const res = transpileAndVerifyMermaidToCoral(src);
    expect(res.ok).toBe(true);
    expect(res.targetNotation).toBe('uml-state');
    expect(res.targetEdition).toBe('0.2.17');
    expect(res.visualRenderable).toBe(true);
    const svg = await renderCoralToSvg(res.coral!);
    expect(svg).toContain('Active');
  });

  it('verifies legacy stateTargetEdition: 0.2.8 with visualRenderable: false and accurate characterRenderable', async () => {
    const chainSrc = [
      'stateDiagram-v2',
      '  [*] --> Idle',
      '  Idle --> Checking : submit',
      '  state "Validating Order" as Checking',
      '  Checking --> Done : valid',
      '  Done --> [*]',
    ].join('\n');

    const rChain = transpileAndVerifyMermaidToCoral(chainSrc, { stateTargetEdition: '0.2.8' });
    expect(rChain.ok).toBe(true);
    expect(rChain.targetEdition).toBe('0.2.8');
    expect(rChain.visualRenderable).toBe(false);
    expect(rChain.characterRenderable).toBe(true);
    expect(rChain.diagnostics.some((d) => d.code === 'coral.uml-state.visual-unavailable' && d.severity === 'info')).toBe(true);
    const preview = await renderInstalledCharacterPreview028(rChain.coral!, { columns: 80 });
    expect(preview.text).toContain('CHAR-PREVIEW/1 uml-state');

    const selfLoopSrc = [
      'stateDiagram-v2',
      '  [*] --> Idle',
      '  Idle --> Idle : tick',
      '  Idle --> [*]',
    ].join('\n');
    const rLoop = transpileAndVerifyMermaidToCoral(selfLoopSrc, { stateTargetEdition: '0.2.8' });
    expect(rLoop.ok).toBe(true);
    expect(rLoop.visualRenderable).toBe(false);
    expect(rLoop.characterRenderable).toBe(false);
    expect(rLoop.diagnostics.some((d) => d.code === 'coral.uml-state.character-bounds.exceeded' && d.severity === 'info')).toBe(true);
  });

  it('M1 + Minor 2: Stage 4B fails closed via verifyEmittedCoralStage4B on malformed Coral or non-edge display capability errors', () => {
    // Public API ignores _testOverrideEmittedCoral (M1: backdoor removed)
    const ignored = transpileAndVerifyMermaidToCoral('flowchart LR\n  A --> B', {
      _testOverrideEmittedCoral: 'INVALID',
    } as Record<string, unknown>);
    expect(ignored.ok).toBe(true);

    // Direct Stage 4B verifier fails closed on malformed Coral
    const malformed = verifyEmittedCoralStage4B({
      ok: true,
      detectedKind: 'flowchart',
      targetNotation: 'flowchart',
      targetEdition: '0.2.14',
      coral: '@diagram flowchart\n@coralVersion "0.2.14"\nINVALID {{{ SYNTAX',
      idMap: Object.freeze(Object.create(null)),
      diagnostics: Object.freeze([]),
      lossSummary: Object.freeze({ lossy: false, errorCount: 0, warningCount: 0, infoCount: 0, byCode: Object.freeze(Object.create(null)) }),
      visualRenderable: true,
    });
    expect(malformed.ok).toBe(false);
    expect(malformed.coral).toBeUndefined();
    expect(malformed.visualRenderable).toBe(false);
    expect(malformed.diagnostics.some((d) => d.code === 'coral.transpile.self-check.failed' && d.severity === 'error')).toBe(true);

    // Minor 2: Non-edge SuccessorDisplayCapabilityError028 (e.g. reserved `lost` sequence message kind) fails closed
    const lostSeq = verifyEmittedCoralStage4B({
      ok: true,
      detectedKind: 'sequence',
      targetNotation: 'uml-sequence',
      targetEdition: '0.2.14',
      coral: '@diagram uml-sequence\n@coralVersion "0.2.14"\n\nA participant\nB participant\n\nmsg_1 = A -> B [lost] as "gone"',
      idMap: Object.freeze(Object.create(null)),
      diagnostics: Object.freeze([]),
      lossSummary: Object.freeze({ lossy: false, errorCount: 0, warningCount: 0, infoCount: 0, byCode: Object.freeze(Object.create(null)) }),
      visualRenderable: true,
    });
    expect(lostSeq.ok).toBe(false);
    expect(lostSeq.diagnostics.some((d) => d.code === 'coral.transpile.self-check.failed')).toBe(true);
  });

  it('M4 + M6 Stage 4B end-to-end: renders reverse/mixed flowchart arrows and cross-composite state machines to SVG', async () => {
    const flowArrows = transpileAndVerifyMermaidToCoral([
      'flowchart LR',
      '  A <-- B',
      '  A o--> C',
      '  A <--o D',
      '  A <-.- E',
      '  A[/Trap\\] --> B[/Para/]',
    ].join('\n'));
    expect(flowArrows.ok).toBe(true);
    expect(flowArrows.visualRenderable).toBe(true);
    await renderCoralToSvg(flowArrows.coral!);

    const stateCross = transpileAndVerifyMermaidToCoral([
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
    ].join('\n'));
    expect(stateCross.ok).toBe(true);
    expect(stateCross.visualRenderable).toBe(true);
    await renderCoralToSvg(stateCross.coral!);
  });

  it('refuses in strict mode on warnings while allowing info diagnostics', () => {
    const infoOnly = 'flowchart LR\n  accTitle: Hello\n  my-node[My Node] --> other[Other]';
    expect(transpileAndVerifyMermaidToCoral(infoOnly, { mode: 'strict' }).ok).toBe(true);

    const withWarn = 'flowchart LR\n  A ==> B';
    const strictRefused = transpileAndVerifyMermaidToCoral(withWarn, { mode: 'strict' });
    expect(strictRefused.ok).toBe(false);
    expect(strictRefused.coral).toBeUndefined();
    expect(strictRefused.diagnostics.some((d) => d.code === 'coral.transpile.strict.refused')).toBe(true);
  });

  it('verifies and renders extended flowchart inline arrows, class realization -.-|>, and nested ER subgraphs to SVG', async () => {
    const flow = transpileAndVerifyMermaidToCoral('flowchart TD\n  A[Start] --> B{Check}\n  B -- No ----> E[End]\n');
    expect(flow.ok).toBe(true);
    expect(flow.visualRenderable).toBe(true);
    await renderCoralToSvg(flow.coral!);

    const cls = transpileAndVerifyMermaidToCoral('classDiagram\n  Service ..|> IService : implements\n  Impl <|.. Base\n');
    expect(cls.ok).toBe(true);
    expect(cls.visualRenderable).toBe(true);
    await renderCoralToSvg(cls.coral!);

    const er = transpileAndVerifyMermaidToCoral([
      'erDiagram',
      '  subgraph "Customer Domain"',
      '    CUSTOMER {',
      '      string name',
      '    }',
      '  end',
      '  subgraph title2',
      '    CAR ||--o{ NAMED-DRIVER : allows',
      '    subgraph title3',
      '      PERSON {',
      '        string firstName',
      '      }',
      '    end',
      '  end',
    ].join('\n'));
    expect(er.ok).toBe(true);
    expect(er.visualRenderable).toBe(true);
    await renderCoralToSvg(er.coral!);
  });
});
