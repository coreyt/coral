/**
 * FontSettingsForm Component (CORAL-REQ-012)
 *
 * Form for configuring diagram font settings:
 * - Font family preset selection
 * - Font size preset or custom
 * - Font weight toggle
 */

import React, { useCallback, useMemo } from 'react';
import {
  type FontSettings,
  type DiagramFontSettings,
  DEFAULT_FONT_SETTINGS,
  FONT_FAMILY_PRESETS,
  FONT_SIZE_PRESETS,
} from '../file/schema.js';

/**
 * Props for FontSettingsForm
 */
export interface FontSettingsFormProps {
  /** Current font settings */
  settings: DiagramFontSettings;
  /** Callback when settings change */
  onChange: (settings: DiagramFontSettings) => void;
  /** Callback when Apply is clicked */
  onApply?: () => void;
  /** Whether the form is disabled */
  disabled?: boolean;
}

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
 * Find the preset ID that matches a font family, or 'custom'
 */
function findFontFamilyPresetId(family: string): string {
  const preset = FONT_FAMILY_PRESETS.find((p) => p.family === family);
  return preset?.id ?? 'custom';
}

/**
 * Find the preset ID that matches a font size, or 'custom'
 */
function findFontSizePresetId(size: number): string {
  const preset = FONT_SIZE_PRESETS.find((p) => p.size === size);
  return preset?.id ?? 'custom';
}

/**
 * FontSettingsForm component
 */
export function FontSettingsForm({
  settings,
  onChange,
  onApply,
  disabled = false,
}: FontSettingsFormProps): React.ReactElement {
  const fontSettings = settings.default;

  // Determine current preset selections
  const currentFamilyPreset = useMemo(
    () => findFontFamilyPresetId(fontSettings.family),
    [fontSettings.family]
  );

  const currentSizePreset = useMemo(
    () => findFontSizePresetId(fontSettings.size),
    [fontSettings.size]
  );

  // Handle font family change
  const handleFamilyChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const presetId = e.target.value;
      const preset = FONT_FAMILY_PRESETS.find((p) => p.id === presetId);

      if (preset) {
        onChange({
          ...settings,
          default: { ...fontSettings, family: preset.family },
        });
      }
    },
    [settings, fontSettings, onChange]
  );

  // Handle font size preset change
  const handleSizePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const presetId = e.target.value;

      if (presetId === 'custom') {
        // Keep current size when switching to custom
        return;
      }

      const preset = FONT_SIZE_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        onChange({
          ...settings,
          default: { ...fontSettings, size: preset.size },
        });
      }
    },
    [settings, fontSettings, onChange]
  );

  // Handle custom font size change
  const handleCustomSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const size = parseInt(e.target.value, 10);
      if (!isNaN(size) && size >= 8 && size <= 32) {
        onChange({
          ...settings,
          default: { ...fontSettings, size },
        });
      }
    },
    [settings, fontSettings, onChange]
  );

  // Handle font weight change
  const handleWeightChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const weight = e.target.value === 'bold' ? 'bold' : 'normal';
      onChange({
        ...settings,
        default: { ...fontSettings, weight },
      });
    },
    [settings, fontSettings, onChange]
  );

  // Handle line height change
  const handleLineHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const lineHeight = parseFloat(e.target.value);
      if (!isNaN(lineHeight) && lineHeight >= 1.0 && lineHeight <= 2.5) {
        onChange({
          ...settings,
          default: { ...fontSettings, lineHeight },
        });
      }
    },
    [settings, fontSettings, onChange]
  );

  return (
    <div style={{ padding: '12px' }}>
      {/* Font Family */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Font Family</label>
        <select
          value={currentFamilyPreset}
          onChange={handleFamilyChange}
          disabled={disabled}
          style={inputStyles}
          aria-label="Font Family"
        >
          {FONT_FAMILY_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        {/* Font preview */}
        <div
          style={{
            fontSize: '13px',
            marginTop: '6px',
            padding: '8px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            fontFamily: fontSettings.family,
          }}
        >
          The quick brown fox jumps over the lazy dog
        </div>
      </div>

      {/* Font Size */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Font Size</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={currentSizePreset}
            onChange={handleSizePresetChange}
            disabled={disabled}
            style={{ ...inputStyles, flex: 1 }}
            aria-label="Font Size Preset"
          >
            {FONT_SIZE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} ({preset.size}px)
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          <input
            type="number"
            min={8}
            max={32}
            value={fontSettings.size}
            onChange={handleCustomSizeChange}
            disabled={disabled}
            style={{ ...inputStyles, width: '70px', flex: 'none' }}
            aria-label="Custom Font Size"
          />
          <span style={{ fontSize: '12px', color: '#666' }}>px</span>
        </div>
      </div>

      {/* Font Weight */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Font Weight</label>
        <select
          value={fontSettings.weight === 'bold' || (typeof fontSettings.weight === 'number' && fontSettings.weight >= 600) ? 'bold' : 'normal'}
          onChange={handleWeightChange}
          disabled={disabled}
          style={inputStyles}
          aria-label="Font Weight"
        >
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
        </select>
      </div>

      {/* Line Height */}
      <div style={formGroupStyles}>
        <label style={labelStyles}>Line Height</label>
        <input
          type="range"
          min="1.0"
          max="2.0"
          step="0.1"
          value={fontSettings.lineHeight}
          onChange={handleLineHeightChange}
          disabled={disabled}
          style={{ width: '100%' }}
          aria-label="Line Height"
        />
        <div style={{ fontSize: '11px', color: '#666', textAlign: 'right' }}>
          {fontSettings.lineHeight.toFixed(1)}
        </div>
      </div>

      {/* Apply Button */}
      {onApply && (
        <div style={{ marginTop: '16px' }}>
          <button
            type="button"
            onClick={onApply}
            disabled={disabled}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '4px',
              border: 'none',
              backgroundColor: disabled ? '#ccc' : '#1976d2',
              color: '#fff',
              cursor: disabled ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            Apply Font Changes
          </button>
        </div>
      )}
    </div>
  );
}
