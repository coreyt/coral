import type {
  FlowchartTargetNotation,
  MermaidTranspileResult,
  StateTargetEdition,
  TranspileDiagnostic,
} from '@coral-viz/language';

export interface MermaidConvertRequestOptions {
  flowchartTarget?: FlowchartTargetNotation;
  force?: boolean;
  stateTargetEdition?: StateTargetEdition;
}

export type MermaidConversionState =
  | {
    kind: 'loss-review';
    sourceText: string;
    flowchartTarget: FlowchartTargetNotation;
    result: MermaidTranspileResult;
  }
  | {
    kind: 'refused';
    sourceText: string;
    flowchartTarget: FlowchartTargetNotation;
    result: MermaidTranspileResult;
  };

export interface MermaidConversionBannerProps {
  conversion: MermaidConversionState;
  onConvert: (options?: MermaidConvertRequestOptions) => void;
  onCancel: () => void;
  theme: Record<string, string>;
}

interface GroupedDiagnostic {
  code: string;
  severity: TranspileDiagnostic['severity'];
  count: number;
  lines: number[];
  message: string;
}

function groupDiagnostics(diagnostics: readonly TranspileDiagnostic[], includeInfo: boolean): GroupedDiagnostic[] {
  const byCode = new Map<string, GroupedDiagnostic>();
  for (const diag of diagnostics) {
    if (!includeInfo && diag.severity === 'info') continue;
    const existing = byCode.get(diag.code);
    const line = diag.range?.start.line;
    if (existing) {
      existing.count += 1;
      if (line !== undefined && !existing.lines.includes(line)) existing.lines.push(line);
    } else {
      byCode.set(diag.code, {
        code: diag.code,
        severity: diag.severity,
        count: 1,
        lines: line !== undefined ? [line] : [],
        message: diag.message,
      });
    }
  }
  return [...byCode.values()];
}

export function MermaidConversionBanner({
  conversion,
  onConvert,
  onCancel,
  theme,
}: MermaidConversionBannerProps) {
  const isRefused = conversion.kind === 'refused';
  const groups = groupDiagnostics(conversion.result.diagnostics, false);
  const isFlowchart = conversion.result.detectedKind === 'flowchart';

  return (
    <div
      data-testid="mermaid-conversion-banner"
      role={isRefused ? 'alert' : 'region'}
      aria-label="Mermaid conversion review"
      style={{
        padding: '8px 12px',
        fontSize: '11px',
        background: isRefused ? theme.errorBg : theme.editorHeaderBg,
        color: isRefused ? theme.errorText : theme.editorText,
        borderBottom: `1px solid ${theme.lineNumbersBorder}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {isRefused
          ? 'Could not convert Mermaid to Coral (original Mermaid source untouched)'
          : `Review ${conversion.result.lossSummary.warningCount} conversion ${conversion.result.lossSummary.warningCount === 1 ? 'note' : 'notes'} before converting to Coral${isFlowchart ? ` (${conversion.flowchartTarget})` : ''}`}
      </div>
      {groups.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {groups.map((group) => (
            <li key={group.code}>
              {group.lines.length > 0 ? `Line ${group.lines.join(', ')}: ` : ''}
              [{group.code}]{group.count > 1 ? ` (\u00d7${group.count})` : ''} {group.message}
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        {isRefused ? (
          <button
            type="button"
            className="coral-button coral-button--quiet"
            onClick={onCancel}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              borderRadius: '3px',
              border: `1px solid ${theme.lineNumbersBorder}`,
              background: theme.controlBg,
              color: theme.controlText,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        ) : (
          <>
            {isFlowchart && conversion.flowchartTarget !== 'flowchart' && (
              <button
                type="button"
                className="coral-button coral-button--quiet"
                onClick={() => onConvert({ flowchartTarget: 'flowchart' })}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  borderRadius: '3px',
                  border: `1px solid ${theme.lineNumbersBorder}`,
                  background: theme.controlBgActive,
                  color: theme.controlText,
                  cursor: 'pointer',
                }}
              >
                Switch to Flowchart
              </button>
            )}
            {isFlowchart && conversion.flowchartTarget !== 'block' && (
              <button
                type="button"
                className="coral-button coral-button--quiet"
                onClick={() => onConvert({ flowchartTarget: 'block' })}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  borderRadius: '3px',
                  border: `1px solid ${theme.lineNumbersBorder}`,
                  background: theme.controlBgActive,
                  color: theme.controlText,
                  cursor: 'pointer',
                }}
              >
                Switch to Block
              </button>
            )}
            {isFlowchart && conversion.flowchartTarget !== 'architecture' && (
              <button
                type="button"
                className="coral-button coral-button--quiet"
                onClick={() => onConvert({ flowchartTarget: 'architecture' })}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  borderRadius: '3px',
                  border: `1px solid ${theme.lineNumbersBorder}`,
                  background: theme.controlBgActive,
                  color: theme.controlText,
                  cursor: 'pointer',
                }}
              >
                Switch to Architecture
              </button>
            )}
            <button
              type="button"
              className="coral-button coral-button--quiet"
              onClick={() => onConvert({ flowchartTarget: conversion.flowchartTarget, force: true })}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                borderRadius: '3px',
                border: `1px solid ${theme.lineNumbersBorder}`,
                background: theme.controlBg,
                color: theme.controlText,
                cursor: 'pointer',
              }}
            >
              {isFlowchart ? `Convert Anyway (${conversion.flowchartTarget})` : 'Convert Anyway'}
            </button>
            <button
              type="button"
              className="coral-button coral-button--quiet"
              onClick={onCancel}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                borderRadius: '3px',
                border: 'none',
                background: 'transparent',
                color: theme.controlTextMuted,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
