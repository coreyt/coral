/**
 * LayoutSettingsForm Component (CORAL-REQ-009)
 *
 * Form for configuring ELK layout settings with:
 * - Preset dropdown
 * - Algorithm selection
 * - Direction selection
 * - Spacing configuration
 * - Edge routing options
 * - Advanced ELK options (JSON editor)
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  type LayoutSettings,
  type LayoutSpacing,
  type LayoutPresetId,
  type LayoutAlgorithm,
  type LayoutDirection,
  type EdgeRouting,
  LAYOUT_PRESETS,
  getLayoutPreset,
  DEFAULT_LAYOUT_SETTINGS,
} from '../file/schema.js';
import type { SizingMode } from '../types.js';

/**
 * Props for LayoutSettingsForm
 */
export interface LayoutSettingsFormProps {
  /** Current layout settings */
  settings: LayoutSettings;
  /** Currently selected preset */
  selectedPreset: LayoutPresetId;
  /** Callback when settings change */
  onChange: (settings: LayoutSettings) => void;
  /** Callback when preset is selected */
  onPresetChange: (presetId: LayoutPresetId) => void;
  /** Callback when Apply is clicked */
  onApply?: () => void;
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Show advanced options by default */
  showAdvanced?: boolean;
}

/**
 * Algorithm options for dropdown
 */
const ALGORITHM_OPTIONS: Array<{ value: LayoutAlgorithm; label: string; description: string }> = [
  { value: 'layered', label: 'Layered', description: 'Best for hierarchical structures' },
  { value: 'mrtree', label: 'Tree', description: 'Best for strict tree structures' },
  { value: 'stress', label: 'Stress', description: 'Force-directed, good for networks' },
  { value: 'force', label: 'Force', description: 'Force simulation layout' },
  { value: 'radial', label: 'Radial', description: 'Circular/radial layout' },
  { value: 'box', label: 'Box', description: 'Simple box packing' },
];

/**
 * Direction options for dropdown
 */
const DIRECTION_OPTIONS: Array<{ value: LayoutDirection; label: string }> = [
  { value: 'DOWN', label: 'Top to Bottom' },
  { value: 'UP', label: 'Bottom to Top' },
  { value: 'RIGHT', label: 'Left to Right' },
  { value: 'LEFT', label: 'Right to Left' },
];

/**
 * Edge routing options for dropdown
 */
const EDGE_ROUTING_OPTIONS: Array<{ value: EdgeRouting; label: string }> = [
  { value: 'ORTHOGONAL', label: 'Orthogonal (right angles)' },
  { value: 'POLYLINE', label: 'Polyline (straight lines)' },
  { value: 'SPLINES', label: 'Splines (curves)' },
];

/**
 * Node sizing mode options for dropdown (CORAL-REQ-011)
 */
const SIZING_MODE_OPTIONS: Array<{ value: SizingMode; label: string; description: string }> = [
  { value: 'adaptive', label: 'Adaptive', description: 'Each node sized to fit its text content' },
  { value: 'uniform', label: 'Uniform', description: 'All nodes of same shape have same size' },
  { value: 'hybrid', label: 'Hybrid', description: 'Adaptive width, uniform height per shape' },
];

/**
 * Shared input styles
 */
const inputStyles: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '13px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  backgroundColor: '#fff',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyles: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: '#555',
  marginBottom: '4px',
  display: 'block',
};

const formGroupStyles: React.CSSProperties = {
  marginBottom: '12px',
};

/**
 * LayoutSettingsForm component
 */
export function LayoutSettingsForm({
  settings,
  selectedPreset,
  onChange,
  onPresetChange,
  onApply,
  disabled = false,
  showAdvanced: initialShowAdvanced = false,
}: LayoutSettingsFormProps): React.ReactElement {
  const [showAdvanced, setShowAdvanced] = useState(initialShowAdvanced);
  const [elkOptionsJson, setElkOptionsJson] = useState(() =>
    JSON.stringify(settings.elkOptions || {}, null, 2)
  );
  const [elkOptionsError, setElkOptionsError] = useState<string | null>(null);

  // Memoize preset options
  const presetOptions = useMemo(
    () =>
      LAYOUT_PRESETS.map((p) => ({
        value: p.id,
        label: p.name,
        description: p.description,
      })),
    []
  );

  // Handle preset change
  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const presetId = e.target.value as LayoutPresetId;
      onPresetChange(presetId);

      // Update the JSON editor with new preset's elkOptions
      const preset = getLayoutPreset(presetId);
      if (preset) {
        setElkOptionsJson(JSON.stringify(preset.settings.elkOptions || {}, null, 2));
        setElkOptionsError(null);
      }
    },
    [onPresetChange]
  );

  // Handle individual setting changes
  const handleAlgorithmChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...settings, algorithm: e.target.value as LayoutAlgorithm });
    },
    [settings, onChange]
  );

  const handleDirectionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...settings, direction: e.target.value as LayoutDirection });
    },
    [settings, onChange]
  );

  const handleSpacingChange = useCallback(
    (key: keyof LayoutSpacing, value: number) => {
      onChange({
        ...settings,
        spacing: { ...settings.spacing, [key]: value },
      });
    },
    [settings, onChange]
  );

  const handleEdgeRoutingChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const routing = e.target.value as EdgeRouting;
      onChange({
        ...settings,
        elkOptions: { ...settings.elkOptions, 'elk.edgeRouting': routing },
      });
    },
    [settings, onChange]
  );

  const handleSizingModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const sizingMode = e.target.value as SizingMode;
      onChange({ ...settings, sizingMode });
    },
    [settings, onChange]
  );

  // Handle ELK options JSON change
  const handleElkOptionsChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const json = e.target.value;
      setElkOptionsJson(json);

      try {
        const parsed = JSON.parse(json);
        setElkOptionsError(null);
        onChange({ ...settings, elkOptions: parsed });
      } catch {
        setElkOptionsError('Invalid JSON');
      }
    },
    [settings, onChange]
  );

  // Get current edge routing value
  const currentEdgeRouting =
    (settings.elkOptions?.['elk.edgeRouting'] as EdgeRouting) || 'ORTHOGONAL';

  return (
    <div style={{ padding: '12px' }}>
      {/* Preset Selection */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Preset</label>
        <select
          value={selectedPreset}
          onChange={handlePresetChange}
          disabled={disabled}
          style={inputStyles}
        >
          {presetOptions.map((opt) => (
            <option key={opt.value} value={opt.value} title={opt.description}>
              {opt.label}
            </option>
          ))}
        </select>
        {selectedPreset !== 'custom' && (
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
            {presetOptions.find((p) => p.value === selectedPreset)?.description}
          </div>
        )}
      </div>

      {/* Algorithm */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Algorithm</label>
        <select
          value={settings.algorithm}
          onChange={handleAlgorithmChange}
          disabled={disabled}
          style={inputStyles}
        >
          {ALGORITHM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} title={opt.description}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Direction */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Direction</label>
        <select
          value={settings.direction}
          onChange={handleDirectionChange}
          disabled={disabled}
          style={inputStyles}
        >
          {DIRECTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Spacing */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Node Spacing</label>
        <input
          type="range"
          min="20"
          max="150"
          value={settings.spacing?.nodeNode ?? 50}
          onChange={(e) => handleSpacingChange('nodeNode', parseInt(e.target.value, 10))}
          disabled={disabled}
          style={{ width: '100%' }}
        />
        <div style={{ fontSize: '11px', color: '#666', textAlign: 'right' }}>
          {settings.spacing?.nodeNode ?? 50}px
        </div>
      </div>

      <div style={formGroupStyles}>
        <label style={labelStyles}>Layer Spacing</label>
        <input
          type="range"
          min="30"
          max="200"
          value={settings.spacing?.layerSpacing ?? 70}
          onChange={(e) => handleSpacingChange('layerSpacing', parseInt(e.target.value, 10))}
          disabled={disabled}
          style={{ width: '100%' }}
        />
        <div style={{ fontSize: '11px', color: '#666', textAlign: 'right' }}>
          {settings.spacing?.layerSpacing ?? 70}px
        </div>
      </div>

      {/* Edge Routing */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Edge Routing</label>
        <select
          value={currentEdgeRouting}
          onChange={handleEdgeRoutingChange}
          disabled={disabled}
          style={inputStyles}
        >
          {EDGE_ROUTING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Node Sizing Mode (CORAL-REQ-011) */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Node Sizing</label>
        <select
          value={settings.sizingMode ?? 'adaptive'}
          onChange={handleSizingModeChange}
          disabled={disabled}
          style={inputStyles}
        >
          {SIZING_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} title={opt.description}>
              {opt.label}
            </option>
          ))}
        </select>
        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
          {SIZING_MODE_OPTIONS.find((o) => o.value === (settings.sizingMode ?? 'adaptive'))?.description}
        </div>
      </div>

      {/* Advanced Options Toggle */}
      <div style={{ marginTop: '16px', marginBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          disabled={disabled}
          style={{
            background: 'none',
            border: 'none',
            color: '#1976d2',
            cursor: disabled ? 'default' : 'pointer',
            fontSize: '12px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ transform: showAdvanced ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
            &#9654;
          </span>
          Advanced ELK Options
        </button>
      </div>

      {/* Advanced ELK Options (JSON Editor) */}
      {showAdvanced && (
        <div style={formGroupStyles}>
          <label style={labelStyles}>ELK Options (JSON)</label>
          <textarea
            value={elkOptionsJson}
            onChange={handleElkOptionsChange}
            disabled={disabled}
            placeholder='{"elk.option": "value"}'
            style={{
              ...inputStyles,
              height: '100px',
              fontFamily: 'monospace',
              fontSize: '11px',
              resize: 'vertical',
              borderColor: elkOptionsError ? '#d32f2f' : '#ccc',
            }}
          />
          {elkOptionsError && (
            <div style={{ fontSize: '11px', color: '#d32f2f', marginTop: '4px' }}>
              {elkOptionsError}
            </div>
          )}
        </div>
      )}

      {/* Apply Button */}
      {onApply && (
        <div style={{ marginTop: '16px' }}>
          <button
            type="button"
            onClick={onApply}
            disabled={disabled || !!elkOptionsError}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '4px',
              border: 'none',
              backgroundColor: disabled || elkOptionsError ? '#ccc' : '#1976d2',
              color: '#fff',
              cursor: disabled || elkOptionsError ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            Apply Layout
          </button>
        </div>
      )}
    </div>
  );
}
