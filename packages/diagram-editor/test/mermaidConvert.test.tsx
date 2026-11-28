import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppView } from '../src/AppView';
import { EditorPane, type EditorPaneProps } from '../src/components/EditorPane';
import { EXPECTED_RELEASE_VERSION } from '../src/guidanceContent';
import { useEditorController } from '../src/useEditorController';
import { transpileAndVerifyMermaidToCoral } from '@coral-viz/render';

// Start from a clean Mermaid flowchart fixture so controller tests can exercise Mermaid conversion directly.
vi.mock('../src/startupSource', async () => ({
  startupSource: (await import('./fixtures/legacyStartupSource')).legacyStartupSource,
}));

function mockLayoutChildren(graph: {
  children?: Array<{
    id: string;
    width?: number;
    height?: number;
    children?: any[];
    ports?: any[];
    layoutOptions?: Record<string, string>;
  }>;
  layoutOptions?: Record<string, string>;
}): any[] {
  const rawChildren = graph.children ?? [];
  const padding = String(graph.layoutOptions?.['elk.padding'] ?? '');
  const inset = (side: string, fallback: number) =>
    Number(padding.match(new RegExp(`${side}=([\\d.]+)`))?.[1] ?? fallback);
  const padLeft = inset('left', 32);
  const padTop = inset('top', 48);

  const sized = rawChildren.map((child) => {
    if (!child.children?.length) {
      return {
        ...child,
        width: child.width ?? 160,
        height: child.height ?? 80,
      };
    }
    const laidChildren = mockLayoutChildren(child);
    const childPadding = String(child.layoutOptions?.['elk.padding'] ?? '');
    const childInset = (side: string, fallback: number) =>
      Number(childPadding.match(new RegExp(`${side}=([\\d.]+)`))?.[1] ?? fallback);
    const maxRight = Math.max(0, ...laidChildren.map((kid) => (kid.x ?? 0) + (kid.width ?? 0)));
    const maxBottom = Math.max(0, ...laidChildren.map((kid) => (kid.y ?? 0) + (kid.height ?? 0)));
    return {
      ...child,
      width: Math.max(child.width ?? 160, maxRight + childInset('right', 32)),
      height: Math.max(child.height ?? 80, maxBottom + childInset('bottom', 32)),
      children: laidChildren,
    };
  });

  let cursorX = padLeft;
  return sized.map((child) => {
    const placed = {
      ...child,
      x: cursorX,
      y: padTop,
    };
    cursorX += child.width + 80;
    return placed;
  });
}

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockELK {
    async layout(graph: any) {
      return {
        children: mockLayoutChildren(graph),
        edges: [],
      };
    }
  },
}));

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly === 'undefined') {
  (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly = class DOMMatrixReadOnly {
    m22 = 1;
    m41 = 0;
    m42 = 0;
  };
}

async function quiesce(result: { current: ReturnType<typeof useEditorController> }) {
  await waitFor(() => {
    expect(result.current.canvas.updateStatus).toBeNull();
    expect(result.current.canvas.isReflowing).toBe(false);
  }, { timeout: 5000 });
}

async function loadMermaidSource(
  result: { current: ReturnType<typeof useEditorController> },
  fileName: string,
  text: string,
) {
  let opened = false;
  act(() => {
    opened = result.current.header.onOpenFile({ name: fileName, text });
  });
  expect(opened).toBe(true);
  await waitFor(() => {
    expect(result.current.editor.dsl).toBe(text);
    expect(result.current.editor.dslType).toBe('mermaid');
  });
  await quiesce(result);
}

describe('SPEC-18: Diagram Editor deterministic Convert to Editable Coral', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('exposes Convert to Editable Coral in Command Palette only when dslType is mermaid', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    await quiesce(result);

    const mermaidCmd = result.current.commandPalette.commands.find(
      (cmd) => cmd.id === 'convert-mermaid-to-coral',
    );
    expect(mermaidCmd).toBeDefined();
    expect(mermaidCmd?.label).toBe('Convert to Editable Coral');
    expect(mermaidCmd?.disabled).toBe(false);

    // After converting to Coral, the command becomes disabled
    const simpleFlow = 'flowchart LR\n  start([Start]) --> done([Done])';
    await loadMermaidSource(result, 'simple.mmd', simpleFlow);

    // Enabled even when opened as source-owned .mmd file
    const openedCmd = result.current.commandPalette.commands.find(
      (cmd) => cmd.id === 'convert-mermaid-to-coral',
    );
    expect(result.current.editor.sourceOwnedImport).toBe(true);
    expect(openedCmd?.disabled).toBe(false);

    act(() => {
      openedCmd?.action();
    });
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    await quiesce(result);

    const coralCmd = result.current.commandPalette.commands.find(
      (cmd) => cmd.id === 'convert-mermaid-to-coral',
    );
    expect(coralCmd?.disabled).toBe(true);
  });

  it.each([
    [
      'flowchart',
      'flow.mmd',
      [
        'flowchart LR',
        '  start([Start]) --> check{Valid?}',
        '  subgraph backend [Backend]',
        '    api[API Call] --> sub[[Auth Check]]',
        '  end',
        '  check -->|Yes| api',
        '  check -.->|No| done([Done])',
        '  sub --> done',
      ].join('\n'),
      '@diagram flowchart',
      '@coralVersion "0.2.14"',
      'flowchart',
    ],
    [
      'sequence',
      'seq.mmd',
      [
        'sequenceDiagram',
        '  actor user as User',
        '  box Backend',
        '    participant api as API',
        '    participant db as Database',
        '  end',
        '  user->>+api: POST /orders',
        '  api->>db: INSERT order',
        '  db-->>api: 201 Created',
        '  api-->>-user: Response',
      ].join('\n'),
      '@diagram uml-sequence',
      '@coralVersion "0.2.14"',
      'uml-sequence',
    ],
    [
      'class',
      'class.mmd',
      [
        'classDiagram',
        '  namespace Banking {',
        '    class Account["Bank Account"] {',
        '      +String owner',
        '      -Decimal balance',
        '    }',
        '    class SavingsAccount',
        '  }',
        '  Account <|-- SavingsAccount',
      ].join('\n'),
      '@diagram uml-class',
      '@coralVersion "0.2.14"',
      'uml-class',
    ],
    [
      'er',
      'er.mmd',
      [
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
      ].join('\n'),
      '@diagram erd',
      '@coralVersion "0.2.14"',
      'erd',
    ],
    [
      'state (0.2.17 visual)',
      'state.mmd',
      [
        'stateDiagram-v2',
        '  [*] --> Idle',
        '  state Active {',
        '    [*] --> Running',
        '    Running --> Paused : pause',
        '  }',
        '  Idle --> Active : start',
        '  Active --> [*]',
      ].join('\n'),
      '@diagram uml-state',
      '@coralVersion "0.2.17"',
      'uml-state',
    ],
  ])(
    'converts %s Mermaid diagram cleanly with zero LLM calls and single atomic Undo',
    async (_label, fileName, mermaidSource, expectedHeader, expectedVersion, expectedNotation) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
      await quiesce(result);

      await loadMermaidSource(result, fileName, mermaidSource);
      expect(result.current.editor.dsl).toBe(mermaidSource);
      expect(result.current.editor.dslType).toBe('mermaid');

      // Trigger deterministic conversion
      act(() => {
        result.current.editor.onConvertMermaidToCoral();
      });

      await waitFor(() => {
        expect(result.current.editor.dslType).toBe('coral');
        expect(result.current.canvas.nodes.length).toBeGreaterThan(0);
      }, { timeout: 5000 });
      await quiesce(result);

      const convertedCoral = result.current.editor.dsl;
      expect(convertedCoral).toContain(expectedHeader);
      expect(convertedCoral).toContain(expectedVersion);
      expect(result.current.canvas.notation).toBe(expectedNotation);
      expect(result.current.editor.parseErrors.filter((e) => e.severity === 'error')).toEqual([]);
      expect(result.current.editor.mermaidConversion).toBeNull();
      // Zero LLM / network calls
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.current.editor.isGenerating).toBe(false);
      expect(result.current.editor.chatEntries).toEqual([]);

      // Single atomic Undo restores exact original Mermaid bytes and dslType === 'mermaid'
      act(() => {
        result.current.canvas.onUndo();
      });

      await waitFor(() => {
        expect(result.current.editor.dsl).toBe(mermaidSource);
        expect(result.current.editor.dslType).toBe('mermaid');
      });
      expect(result.current.editor.sourceOwnedImport).toBe(true);

      // Immediate Redo restores converted Coral cleanly (verifies J1 publication envelope snapshot!)
      act(() => {
        result.current.canvas.onRedo();
      });
      await waitFor(() => {
        expect(result.current.editor.dsl).toBe(convertedCoral);
        expect(result.current.editor.dslType).toBe('coral');
      });
      expect(result.current.canvas.notation).toBe(expectedNotation);
    },
  );

  it('shows pre-commit loss review for cylinder flowchart, supports Switch to Block / Architecture / Cancel / Convert Anyway, and undoes atomically', async () => {
    const cylinderMermaid = 'flowchart TD\n  api[Orders API] --> db[(Orders DB)]';
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    await quiesce(result);

    await loadMermaidSource(result, 'orders.mmd', cylinderMermaid);

    // 1. Trigger conversion -> lossy in default 'flowchart' target -> pre-commit review, buffer untouched!
    act(() => {
      result.current.editor.onConvertMermaidToCoral();
    });
    expect(result.current.editor.dsl).toBe(cylinderMermaid);
    expect(result.current.editor.dslType).toBe('mermaid');
    expect(result.current.editor.mermaidConversion?.kind).toBe('loss-review');
    expect(result.current.editor.mermaidConversion?.result.lossSummary.byCode).toMatchObject({
      'mermaid.flowchart.shape.degraded': 1,
    });

    // 2. Cancel leaves original text untouched and clears review
    act(() => {
      result.current.editor.onCancelMermaidConversion();
    });
    expect(result.current.editor.mermaidConversion).toBeNull();
    expect(result.current.editor.dsl).toBe(cylinderMermaid);
    expect(result.current.editor.dslType).toBe('mermaid');

    // 3. Switch to Block converts losslessly to @diagram block with cylinder & layout [direction: DOWN]
    act(() => {
      result.current.editor.onConvertMermaidToCoral();
    });
    expect(result.current.editor.mermaidConversion?.kind).toBe('loss-review');

    act(() => {
      result.current.editor.onConvertMermaidToCoral({ flowchartTarget: 'block' });
    });
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    await quiesce(result);

    expect(result.current.editor.dsl).toContain('@diagram block');
    expect(result.current.editor.dsl).toContain('layout [direction: DOWN]');
    expect(result.current.editor.dsl).toContain('db cylinder as "Orders DB"');
    expect(result.current.editor.mermaidConversion).toBeNull();

    // 4. Single Undo restores exact original Mermaid bytes
    act(() => {
      result.current.canvas.onUndo();
    });
    await waitFor(() => {
      expect(result.current.editor.dsl).toBe(cylinderMermaid);
      expect(result.current.editor.dslType).toBe('mermaid');
    });

    // 5. Switch to Architecture converts losslessly to @diagram architecture with database
    act(() => {
      result.current.editor.onConvertMermaidToCoral({ flowchartTarget: 'architecture' });
    });
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    await quiesce(result);

    expect(result.current.editor.dsl).toContain('@diagram architecture');
    expect(result.current.editor.dsl).toContain('db database as "Orders DB"');

    // 6. Undo again and test Convert Anyway (force: true) as flowchart
    act(() => {
      result.current.canvas.onUndo();
    });
    await waitFor(() => {
      expect(result.current.editor.dsl).toBe(cylinderMermaid);
      expect(result.current.editor.dslType).toBe('mermaid');
    });

    act(() => {
      result.current.editor.onConvertMermaidToCoral({ flowchartTarget: 'flowchart', force: true });
    });
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    await quiesce(result);

    expect(result.current.editor.dsl).toContain('@diagram flowchart');
    expect(result.current.editor.dsl).toContain('db process as "Orders DB"');
  });

  it('refuses unsupported Mermaid gantt cleanly while leaving original Mermaid text untouched', async () => {
    const gantt = 'gantt\n  title Roadmap\n  section Core\n  Task A :a1, 2026-01-01, 5d';
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    await quiesce(result);

    await loadMermaidSource(result, 'roadmap.mmd', gantt);

    act(() => {
      result.current.editor.onConvertMermaidToCoral();
    });

    expect(result.current.editor.dsl).toBe(gantt);
    expect(result.current.editor.dslType).toBe('mermaid');
    expect(result.current.editor.mermaidConversion?.kind).toBe('refused');
    expect(result.current.editor.mermaidConversion?.result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'mermaid.diagram.unsupported', severity: 'error' }),
    );

    // Editing Mermaid text clears stale conversion banner
    act(() => {
      result.current.editor.onDslChange(`${gantt}\n`);
    });
    await waitFor(() => {
      expect(result.current.editor.mermaidConversion).toBeNull();
    });
    await quiesce(result);

    // Re-trigger banner, then opening another file also clears stale banner
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    act(() => {
      result.current.editor.onConvertMermaidToCoral();
    });
    expect(result.current.editor.mermaidConversion?.kind).toBe('refused');
    await loadMermaidSource(result, 'next.mmd', 'flowchart TD\n  A[One] --> B[Two]');
    expect(result.current.editor.mermaidConversion).toBeNull();
    confirmSpy.mockRestore();
  });

  it('renders Convert to Editable Coral button and interactive loss-review / refusal banners in EditorPane', () => {
    const onConvert = vi.fn();
    const onCancel = vi.fn();
    const cylinderMermaid = 'flowchart TD\n  api[Orders API] --> db[(Orders DB)]';
    const lossyResult = transpileAndVerifyMermaidToCoral(cylinderMermaid);
    const refusedResult = transpileAndVerifyMermaidToCoral('gantt\n  title Roadmap\n  Task :a1, 2026-01-01, 5d');

    const baseProps: EditorPaneProps = {
      dsl: cylinderMermaid,
      dslType: 'mermaid',
      isDslReadOnly: false,
      parseErrors: [],
      editorAnalysis: { source: cylinderMermaid, language: 'mermaid', diagnostics: [], decorations: [], entityHighlighting: false },
      entityHighlightingEnabled: false,
      debugInfo: 'Parsed 2 nodes, 1 edge',
      onDslChange: vi.fn(),
      onDslTypeChange: vi.fn(),
      onConvertMermaidToCoral: onConvert,
      onCancelMermaidConversion: onCancel,
      mermaidConversion: null,
      bottomPanelTab: 'diagnostics',
      onBottomPanelTabChange: vi.fn(),
      diagnosticsCollapsed: true,
      onToggleDiagnostics: vi.fn(),
      diagnosticEntries: [],
      onDiagnosticHover: vi.fn(),
      onAskAboutDiagnostic: vi.fn(),
      chatEntries: [],
      turnCount: 0,
      isGenerating: false,
      hasApiKey: false,
      onPromptSubmit: vi.fn(),
      theme: {
        editorBg: '#fff',
        editorText: '#111',
        editorHeaderBg: '#f5f5f5',
        editorHeaderText: '#333',
        lineNumbersBg: '#f5f5f5',
        lineNumbersText: '#666',
        lineNumbersBorder: '#ddd',
        controlBg: '#eee',
        controlBgHover: '#ddd',
        controlBgActive: '#ccc',
        controlText: '#111',
        controlTextMuted: '#555',
        successBg: '#e6f4ea',
        successText: '#137333',
        errorBg: '#fce8e6',
        errorText: '#c5221f',
        warningText: '#b06000',
      },
    };

    const { rerender } = render(<EditorPane {...baseProps} />);
    const convertBtn = screen.getByRole('button', { name: 'Convert to Editable Coral' });
    fireEvent.click(convertBtn);
    expect(onConvert).toHaveBeenCalledTimes(1);

    // Loss-review banner shows grouped diagnostic and Switch to Block / Switch to Architecture / Convert Anyway / Cancel
    rerender(
      <EditorPane
        {...baseProps}
        mermaidConversion={{
          kind: 'loss-review',
          sourceText: cylinderMermaid,
          flowchartTarget: 'flowchart',
          result: lossyResult,
        }}
      />,
    );
    const banner = screen.getByTestId('mermaid-conversion-banner');
    expect(banner.textContent).toContain('mermaid.flowchart.shape.degraded');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Block' }));
    expect(onConvert).toHaveBeenLastCalledWith({ flowchartTarget: 'block' });

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Architecture' }));
    expect(onConvert).toHaveBeenLastCalledWith({ flowchartTarget: 'architecture' });

    fireEvent.click(screen.getByRole('button', { name: 'Convert Anyway (flowchart)' }));
    expect(onConvert).toHaveBeenLastCalledWith({ flowchartTarget: 'flowchart', force: true });

    // Switching to a still-lossy block target offers Switch to Flowchart and shows active target
    rerender(
      <EditorPane
        {...baseProps}
        mermaidConversion={{
          kind: 'loss-review',
          sourceText: cylinderMermaid,
          flowchartTarget: 'block',
          result: lossyResult,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Flowchart' }));
    expect(onConvert).toHaveBeenLastCalledWith({ flowchartTarget: 'flowchart' });
    fireEvent.click(screen.getByRole('button', { name: 'Convert Anyway (block)' }));
    expect(onConvert).toHaveBeenLastCalledWith({ flowchartTarget: 'block', force: true });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Refusal banner displays error code and Dismiss button
    rerender(
      <EditorPane
        {...baseProps}
        mermaidConversion={{
          kind: 'refused',
          sourceText: 'gantt\n  title Roadmap\n  Task :a1, 2026-01-01, 5d',
          flowchartTarget: 'flowchart',
          result: refusedResult,
        }}
      />,
    );
    const alertBanner = screen.getByRole('alert');
    expect(alertBanner.textContent).toContain('mermaid.diagram.unsupported');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onCancel).toHaveBeenCalledTimes(2);

    // Button is hidden when already in Coral mode
    rerender(<EditorPane {...baseProps} dslType="coral" mermaidConversion={null} />);
    expect(screen.queryByRole('button', { name: 'Convert to Editable Coral' })).toBeNull();
  });

  it('wires AppView end-to-end with Convert to Editable Coral button and atomic conversion', async () => {
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
    function TestShell() {
      return <AppView controller={useEditorController()} />;
    }
    render(<TestShell />);
    const convertBtn = await screen.findByRole('button', { name: 'Convert to Editable Coral' });
    const textarea = screen.getByLabelText('DSL editor') as HTMLTextAreaElement;
    const originalMermaid = textarea.value;
    expect(originalMermaid).toContain('flowchart TD');

    fireEvent.click(convertBtn);
    await waitFor(() => {
      expect((screen.getByLabelText('DSL editor') as HTMLTextAreaElement).value).toContain('@diagram flowchart');
    });
    expect(screen.queryByRole('button', { name: 'Convert to Editable Coral' })).toBeNull();

    // Pressing Ctrl+Z restores exact prior Mermaid source in one atomic step
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect((screen.getByLabelText('DSL editor') as HTMLTextAreaElement).value).toBe(originalMermaid);
    });
    expect(screen.getByRole('button', { name: 'Convert to Editable Coral' })).toBeDefined();
  });
});
