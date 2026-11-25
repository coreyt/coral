/**
 * SettingsPanel Component (CORAL-REQ-009)
 *
 * Flat document settings panel showing:
 * - Notation selector
 * - Layout settings (LayoutSettingsForm)
 * - Annotation toggles
 *
 * Accepts an optional theme prop for dark-mode embedding.
 * User preferences have moved to PreferencesDialog in diagram-editor.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  type DiagramFontSettings,
  type DocumentSettings,
  type LayoutPresetId,
  type LayoutSettings,
  normalizeDiagramFontSettings,
} from '../file/schema.js';
import { LayoutSettingsForm } from './LayoutSettingsForm.js';
import { FontSettingsForm } from './FontSettingsForm.js';

export interface SettingsPanelTheme {
  bg: string;
  text: string;
  labelText: string;
  mutedText: string;
  inputBg: string;
  inputText: string;
  inputBorder: string;
  divider: string;
  accentText: string;
}

const lightTheme: SettingsPanelTheme = {
  bg: '#fff',
  text: '#333',
  labelText: '#555',
  mutedText: '#888',
  inputBg: '#fff',
  inputText: '#333',
  inputBorder: '#ccc',
  divider: '#e0e0e0',
  accentText: '#1976d2',
};

/**
 * Props for SettingsPanel
 */
export interface SettingsPanelProps {
  /** Current document settings */
  documentSettings: DocumentSettings;
  /** Currently selected layout preset */
  selectedPreset: LayoutPresetId;
  /** Available notations for dropdown */
  notations: Array<{ id: string; name: string }>;
  /** Callback when document settings change */
  onDocumentSettingsChange: (settings: DocumentSettings) => void;
  /** Callback when layout preset changes */
  onPresetChange: (presetId: LayoutPresetId) => void;
  /** Callback when Apply Layout is clicked */
  onApplyLayout?: () => void;
  /** Staged font settings controlled by an always-mounted parent */
  fontDraft?: DiagramFontSettings;
  /** Callback for controlled staged-font changes */
  onFontDraftChange?: (settings: DiagramFontSettings) => void;
  /** Atomic font transaction owner. When supplied, it replaces both legacy callbacks. */
  onFontCommit?: (settings: DiagramFontSettings) => void;
  /** Callback after requested font settings are committed */
  onApplyFont?: (settings: DiagramFontSettings) => void;
  /** Identity of the loaded document for resetting a standalone draft */
  documentKey?: string | number;
  /** Whether the panel is disabled */
  disabled?: boolean;
  /** Whether font changes are disabled (defaults to the semantic panel lock). */
  fontDisabled?: boolean;
  /** Panel width */
  width?: number | string;
  /** Theme colors for dark-mode embedding */
  theme?: Partial<SettingsPanelTheme>;
}

/**
 * SettingsPanel component — document settings only
 */
export function SettingsPanel({
  documentSettings,
  selectedPreset,
  notations,
  onDocumentSettingsChange,
  onPresetChange,
  onApplyLayout,
  fontDraft: controlledFontDraft,
  onFontDraftChange,
  onFontCommit,
  onApplyFont,
  documentKey,
  disabled = false,
  fontDisabled,
  width = 320,
  theme: themeProp,
}: SettingsPanelProps): React.ReactElement {
  const t = { ...lightTheme, ...themeProp };
  const [localFontDraft, setLocalFontDraft] = useState<DiagramFontSettings>(() =>
    normalizeDiagramFontSettings(documentSettings.font)
  );
  const usesControlledFontDraft = controlledFontDraft !== undefined
    && onFontDraftChange !== undefined;
  const fontDraft = usesControlledFontDraft ? controlledFontDraft : localFontDraft;

  useEffect(() => {
    setLocalFontDraft(normalizeDiagramFontSettings(documentSettings.font));
  }, [documentKey, documentSettings.font]);

  const labelStyles: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 500,
    color: t.labelText,
    marginBottom: '4px',
    display: 'block',
  };

  const inputStyles: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: '13px',
    borderRadius: '4px',
    border: `1px solid ${t.inputBorder}`,
    backgroundColor: t.inputBg,
    color: t.inputText,
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const formGroupStyles: React.CSSProperties = {
    marginBottom: '12px',
  };

  const checkboxGroupStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  };

  // Handle notation change
  const handleNotationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onDocumentSettingsChange({
        ...documentSettings,
        notation: e.target.value,
      });
    },
    [documentSettings, onDocumentSettingsChange]
  );

  // Handle layout settings change
  const handleLayoutChange = useCallback(
    (layout: LayoutSettings) => {
      onDocumentSettingsChange({
        ...documentSettings,
        layout,
      });
    },
    [documentSettings, onDocumentSettingsChange]
  );

  const handleFontDraftChange = useCallback((settings: DiagramFontSettings) => {
    if (usesControlledFontDraft) {
      onFontDraftChange(settings);
    } else {
      setLocalFontDraft(settings);
    }
  }, [onFontDraftChange, usesControlledFontDraft]);

  const handleApplyFont = useCallback(() => {
    const rawFont: Record<string, unknown> = isRecord(documentSettings.font)
      ? documentSettings.font as unknown as Record<string, unknown>
      : {};
    const rawDefault = isRecord(rawFont.default) ? rawFont.default : {};
    const committedRecord: Record<string, unknown> = {
      ...rawFont,
      default: {
        ...rawDefault,
        ...fontDraft.default,
      },
    };
    if (Object.prototype.hasOwnProperty.call(rawFont, 'symbolOverrides')) {
      committedRecord.symbolOverrides = rawFont.symbolOverrides;
    } else if (fontDraft.symbolOverrides !== undefined) {
      committedRecord.symbolOverrides = fontDraft.symbolOverrides;
    }
    const committedFont = committedRecord as unknown as DiagramFontSettings;
    if (onFontCommit) {
      onFontCommit(committedFont);
    } else {
      onDocumentSettingsChange({ ...documentSettings, font: committedFont });
      onApplyFont?.(committedFont);
    }
  }, [documentSettings, fontDraft, onApplyFont, onDocumentSettingsChange, onFontCommit]);

  return (
    <div
      style={{
        width,
        backgroundColor: t.bg,
        color: t.text,
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowY: 'auto' }}>
        <div style={{ padding: '12px' }}>
          {/* Notation Selection */}
          <div style={formGroupStyles}>
            <label style={labelStyles}>Notation</label>
            <select
              value={documentSettings.notation}
              onChange={handleNotationChange}
              disabled={disabled}
              style={inputStyles}
            >
              {notations.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          {/* Layout Settings */}
          <div style={{ marginTop: '16px', borderTop: `1px solid ${t.divider}`, paddingTop: '12px' }}>
            <div style={{ ...labelStyles, fontSize: '13px', marginBottom: '12px' }}>
              Layout Settings
            </div>
            <LayoutSettingsForm
              settings={documentSettings.layout}
              notation={documentSettings.notation}
              selectedPreset={selectedPreset}
              onChange={handleLayoutChange}
              onPresetChange={onPresetChange}
              onApply={onApplyLayout}
              disabled={disabled}
            />
          </div>

          {/* Font Settings */}
          <div style={{ marginTop: '16px', borderTop: `1px solid ${t.divider}`, paddingTop: '12px' }}>
            <div style={{ ...labelStyles, fontSize: '13px', marginBottom: '12px' }}>
              Font Settings
            </div>
            <FontSettingsForm
              settings={fontDraft}
              onChange={handleFontDraftChange}
              onApply={handleApplyFont}
              disabled={fontDisabled ?? disabled}
            />
          </div>

          {/* Annotations */}
          <div style={{ marginTop: '16px', borderTop: `1px solid ${t.divider}`, paddingTop: '12px' }}>
            <div style={{ ...labelStyles, fontSize: '13px', marginBottom: '8px' }}>
              Annotations
            </div>

            <label style={checkboxGroupStyles}>
              <input
                type="checkbox"
                checked={documentSettings.suppressErrorAnnotations ?? false}
                onChange={(e) => onDocumentSettingsChange({
                  ...documentSettings,
                  suppressErrorAnnotations: e.target.checked,
                })}
                disabled={disabled}
              />
              <span style={{ fontSize: '13px', color: t.text }}>Suppress error annotations</span>
            </label>

            <label style={checkboxGroupStyles}>
              <input
                type="checkbox"
                checked={documentSettings.suppressWarningAnnotations ?? false}
                onChange={(e) => onDocumentSettingsChange({
                  ...documentSettings,
                  suppressWarningAnnotations: e.target.checked,
                })}
                disabled={disabled}
              />
              <span style={{ fontSize: '13px', color: t.text }}>Suppress warning annotations</span>
            </label>

            <div style={{ fontSize: '11px', color: t.mutedText, marginTop: '4px' }}>
              When suppressed, edges render normally but issues still appear in the diagnostics log.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
