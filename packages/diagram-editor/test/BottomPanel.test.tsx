/**
 * BottomPanel Tests
 *
 * Tests for the tabbed bottom panel (Diagnostics + AI).
 * Requirement: Issue #48 (LLM-Assisted Diagnostics)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomPanel, type ChatEntry, type BottomPanelTheme, type DiagnosticEntry } from '../src/BottomPanel';

const defaultTheme: BottomPanelTheme = {
  bg: '#1e1e1e',
  text: '#cccccc',
  textMuted: '#666666',
  border: '#333333',
  errorText: '#f48771',
  warningText: '#f0ad4e',
  hoverBg: '#2a2a2a',
  inputBg: '#252526',
  inputText: '#cccccc',
  buttonBg: '#0e639c',
  buttonText: '#ffffff',
  successText: '#22c55e',
  infoBg: '#1e293b',
  userBg: 'transparent',
  assistantBg: '#1a2332',
  codeBg: '#2d2d2d',
};

const sampleDiagnostics: DiagnosticEntry[] = [
  {
    edgeId: 'edge-1',
    severity: 'error',
    sourceLabel: 'End Node',
    targetLabel: 'Process',
    message: 'End terminal cannot have outgoing connections',
  },
  {
    edgeId: 'edge-2',
    severity: 'warning',
    sourceLabel: 'Process A',
    targetLabel: 'Process B',
    message: 'Node has reached maximum outgoing connections (1)',
  },
];

function renderBottomPanel(overrides = {}) {
  const defaultProps = {
    activeTab: 'diagnostics' as const,
    onTabChange: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    diagnosticEntries: sampleDiagnostics,
    onDiagnosticHover: vi.fn(),
    onAskAboutDiagnostic: vi.fn(),
    chatEntries: [] as ChatEntry[],
    isGenerating: false,
    hasApiKey: true,
    onSubmit: vi.fn(),
    theme: defaultTheme,
    ...overrides,
  };
  return render(<BottomPanel {...defaultProps} />);
}

describe('BottomPanel', () => {
  it('qualifies bounded conformance beside the claim status', () => {
    renderBottomPanel({ onCheckConformance: vi.fn(), canCheckConformance: true,
      conformanceReport: { evaluatedLevel: 'strict', claimStatus: 'conformant',
        findings: [], notices: [], exceptions: [], unverifiedObligations: [],
        ruleset: { id: 'coral-block', profileId: 'block', version: '0.2.8-bounded.1',
          scope: 'coral-bounded-profile' } } });
    expect(screen.getByRole('region', { name: 'Conformance report' }).textContent)
      .toContain('Coral bounded profile; full external-standard conformance is not claimed.');
  });

  it('says a user-symbol document was not conformance-checked, with no report', () => {
    renderBottomPanel({ onCheckConformance: vi.fn(), canCheckConformance: true, conformanceReport: null,
      conformanceNotChecked: 'not checked: document uses user symbols' });
    expect(screen.getByRole('status', { name: 'Conformance not checked' }).textContent)
      .toBe('Conformance check: not checked: document uses user symbols');
    expect(screen.queryByRole('region', { name: 'Conformance report' })).toBeNull();
  });

  it('shows the full explicit conformance report and offers a temporary level override', () => {
    const onCheckConformance = vi.fn();
    const onNotificationLevelChange = vi.fn();
    renderBottomPanel({ activeTab: 'diagnostics', onCheckConformance, canCheckConformance: true,
      notificationLevel: 'warning', onNotificationLevelChange,
      conformanceReport: {
        evaluatedLevel: 'strict', claimStatus: 'unverified',
        findings: [{ id: 'BPMN.EVENT.CONCRETE_KIND_REQUIRED', category: 'notation',
          severity: 'warning', message: 'Specify a concrete event kind' }],
        notices: [{ id: 'BPMN.EVENT.CONCRETE_KIND_REQUIRED', category: 'notation',
          severity: 'warning', message: 'Specify a concrete event kind' }], exceptions: [],
        unverifiedObligations: [{ id: 'BPMN.COVERAGE', message: 'More rules require review' }],
        ruleset: { id: 'bpmn', profileId: 'bpmn', version: '1.0.0' },
      },
    });
    expect(screen.getByText(/Strict · unverified/i)).toBeTruthy();
    expect(screen.getAllByText(/BPMN.EVENT.CONCRETE_KIND_REQUIRED/)).toHaveLength(2);
    expect(screen.getByText(/More rules require review/)).toBeTruthy();
    expect(screen.getByLabelText('Notices for last check').textContent).toContain('Notices for last check (1)');
    fireEvent.change(screen.getByLabelText('Conformance level for this check'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check conformance' }));
    expect(onCheckConformance).toHaveBeenCalledWith('none', 'warning');
    fireEvent.change(screen.getByLabelText('Notice threshold for this check'), { target: { value: 'info' } });
    expect(onNotificationLevelChange).toHaveBeenCalledWith('info');
  });
  // ============================================================================
  // Tab Rendering
  // ============================================================================

  it('renders the approved Diagnostics and Activity Log tabs', () => {
    renderBottomPanel();
    expect(screen.getByRole('tab', { name: /diagnostics/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /activity log/i })).toBeDefined();
  });

  it('renders bounded AI transaction outcomes without transcript contents', () => {
    renderBottomPanel({
      activeTab: 'activity',
      activityEntries: [{
        id: 7,
        transactionSequence: 7,
        label: 'AI diagram change (incremental layout)',
        status: 'reverted',
        at: 123,
      }],
    });
    expect(screen.getByRole('log', { name: 'Activity log' }).textContent)
      .toContain('AI diagram change (incremental layout) — reverted');
  });

  it('keeps inactive tab panels mounted while hiding them', () => {
    renderBottomPanel({ activeTab: 'diagnostics' });
    const diagnostics = screen.getByRole('tabpanel', { name: /diagnostics/i });
    const aiTrigger = screen.getByRole('tab', { name: /activity log/i });
    const ai = document.getElementById(aiTrigger.getAttribute('aria-controls')!)!;
    expect(diagnostics.hasAttribute('hidden')).toBe(false);
    expect(ai.hasAttribute('hidden')).toBe(true);
  });

  it('switches tabs on click', () => {
    const onTabChange = vi.fn();
    renderBottomPanel({ onTabChange });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /activity log/i }), { button: 0, ctrlKey: false });
    expect(onTabChange).toHaveBeenCalledWith('activity');
  });

  it('uses manual tab activation for arrow navigation', () => {
    const onTabChange = vi.fn();
    renderBottomPanel({ onTabChange });
    const diagnostics = screen.getByRole('tab', { name: /diagnostics/i });
    diagnostics.focus();
    fireEvent.keyDown(diagnostics, { key: 'ArrowRight' });
    expect(onTabChange).not.toHaveBeenCalled();
  });

  // ============================================================================
  // Diagnostics Tab
  // ============================================================================

  it('renders diagnostic entries on diagnostics tab', () => {
    renderBottomPanel();
    expect(screen.getByText('End Node → Process')).toBeDefined();
    expect(screen.getByText('Process A → Process B')).toBeDefined();
  });

  it('calls onDiagnosticHover on mouse enter/leave', () => {
    const onDiagnosticHover = vi.fn();
    renderBottomPanel({ onDiagnosticHover });
    const entry = screen.getByTestId('diagnostic-entry-edge-1');
    fireEvent.mouseEnter(entry);
    expect(onDiagnosticHover).toHaveBeenCalledWith('edge-1', 'error');
    fireEvent.mouseLeave(entry);
    expect(onDiagnosticHover).toHaveBeenCalledWith(null, null);
  });

  // Code review C52-5: a keyboard-focusable diagnostic has a role and name and
  // highlights its subject on focus, as it does on hover.
  it('names focusable diagnostics and highlights them on focus/blur', () => {
    const onDiagnosticHover = vi.fn();
    renderBottomPanel({ onDiagnosticHover, diagnosticEntries: [
      { ...sampleDiagnostics[0], code: 'coral.edge.end.invalid', position: { line: 3, column: 4, offset: 40 } },
      sampleDiagnostics[1],
      { edgeId: 'note-1', severity: 'info', sourceLabel: 'Source format', targetLabel: 'Target format', message: 'Converted' },
    ] });
    const error = screen.getByRole('group', {
      name: 'Error: [coral.edge.end.invalid] End terminal cannot have outgoing connections (End Node → Process, line 3, column 5)',
    });
    expect(error.tabIndex).toBe(0);
    fireEvent.focus(error);
    expect(onDiagnosticHover).toHaveBeenLastCalledWith('edge-1', 'error');
    fireEvent.blur(error);
    expect(onDiagnosticHover).toHaveBeenLastCalledWith(null, null);
    fireEvent.focus(screen.getByRole('group', {
      name: 'Warning: Node has reached maximum outgoing connections (1) (Process A → Process B)',
    }));
    expect(onDiagnosticHover).toHaveBeenLastCalledWith('edge-2', 'warning');
    fireEvent.focus(screen.getByRole('group', { name: 'Note: Converted (Source format → Target format)' }));
    expect(onDiagnosticHover).toHaveBeenLastCalledWith('note-1', null);
  });

  it('shows diagnostic counts in tab badge', () => {
    renderBottomPanel();
    const diagTab = screen.getByRole('tab', { name: /diagnostics/i });
    expect(diagTab.textContent).toContain('2');
  });

  // ============================================================================
  // Collapsed State
  // ============================================================================

  it('shows compact header when collapsed', () => {
    renderBottomPanel({ collapsed: true });
    // Should still show tabs but not content
    expect(screen.getByRole('tab', { name: /diagnostics/i })).toBeDefined();
    // Content area should not be visible
    expect(screen.queryByRole('log')).toBeNull();
  });

  it('calls onToggleCollapsed when toggle is clicked', () => {
    const onToggleCollapsed = vi.fn();
    renderBottomPanel({ onToggleCollapsed });
    fireEvent.click(screen.getByLabelText('Toggle bottom panel'));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('expands when a tab is clicked while collapsed', () => {
    const onToggleCollapsed = vi.fn();
    renderBottomPanel({ collapsed: true, onToggleCollapsed });
    fireEvent.click(screen.getByRole('tab', { name: /diagnostics/i }));
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it('shows no badge when counts are zero', () => {
    renderBottomPanel({ diagnosticEntries: [], chatEntries: [] });
    const diagTab = screen.getByRole('tab', { name: /diagnostics/i });
    // Should not show "(0)" - just the label
    expect(diagTab.textContent).toBe('Diagnostics');
  });

  // ============================================================================
  // Voice Input (#49)
  // ============================================================================

  it('hides mic button when speechMode is off', () => {
    renderBottomPanel({ activeTab: 'ai', speechMode: 'off' });
    expect(screen.queryByLabelText('Start voice input')).toBeNull();
  });

  it('hides mic button when speechMode is undefined (default off)', () => {
    renderBottomPanel({ activeTab: 'ai' });
    // Default speechMode is 'off', so mic button should not appear
    // (the hook returns isAvailable=false for 'off' mode)
    expect(screen.queryByLabelText('Start voice input')).toBeNull();
  });
});

describe('0.2.9 AI surface deferral', () => {
  it('keeps Diagnostics and Activity while exposing no AI tab, composer or Ask action', () => {
    renderBottomPanel({ activeTab: 'ai' });
    expect(screen.queryByRole('tab', { name: /AI Conversation/ })).toBeNull();
    expect(screen.queryByLabelText('AI prompt')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ask about/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Diagnostics/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Activity Log' })).toBeDefined();
  });
});
