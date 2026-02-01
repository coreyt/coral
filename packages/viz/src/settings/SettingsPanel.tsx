/**
 * SettingsPanel Component (CORAL-REQ-009)
 *
 * Two-tab settings panel:
 * - Document Settings: Notation, layout (saved with file)
 * - User Preferences: Display settings, defaults (saved to localStorage)
 */

import React, { useState, useCallback } from 'react';
import {
  type DocumentSettings,
  type UserPreferences,
  type LayoutPresetId,
  type LayoutSettings,
  DEFAULT_LAYOUT_SETTINGS,
} from '../file/schema.js';
import { LayoutSettingsForm } from './LayoutSettingsForm.js';

/**
 * Tab identifier
 */
export type SettingsTab = 'document' | 'preferences';

/**
 * Props for SettingsPanel
 */
export interface SettingsPanelProps {
  /** Current document settings */
  documentSettings: DocumentSettings;
  /** Current user preferences */
  userPreferences: UserPreferences;
  /** Currently selected layout preset */
  selectedPreset: LayoutPresetId;
  /** Available notations for dropdown */
  notations: Array<{ id: string; name: string }>;
  /** Callback when document settings change */
  onDocumentSettingsChange: (settings: DocumentSettings) => void;
  /** Callback when user preferences change */
  onUserPreferencesChange: (prefs: Partial<UserPreferences>) => void;
  /** Callback when layout preset changes */
  onPresetChange: (presetId: LayoutPresetId) => void;
  /** Callback when Apply Layout is clicked */
  onApplyLayout?: () => void;
  /** Initial active tab */
  initialTab?: SettingsTab;
  /** Whether the panel is disabled */
  disabled?: boolean;
  /** Panel width */
  width?: number | string;
}

/**
 * Shared styles
 */
const labelStyles: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: '#555',
  marginBottom: '4px',
  display: 'block',
};

const inputStyles: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '13px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  backgroundColor: '#fff',
  width: '100%',
  boxSizing: 'border-box',
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

/**
 * SettingsPanel component
 */
export function SettingsPanel({
  documentSettings,
  userPreferences,
  selectedPreset,
  notations,
  onDocumentSettingsChange,
  onUserPreferencesChange,
  onPresetChange,
  onApplyLayout,
  initialTab = 'document',
  disabled = false,
  width = 320,
}: SettingsPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

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

  // Handle checkbox changes for user preferences
  const handleCheckboxChange = useCallback(
    (key: keyof UserPreferences) => (e: React.ChangeEvent<HTMLInputElement>) => {
      onUserPreferencesChange({ [key]: e.target.checked });
    },
    [onUserPreferencesChange]
  );

  // Handle default notation change
  const handleDefaultNotationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUserPreferencesChange({ defaultNotation: e.target.value });
    },
    [onUserPreferencesChange]
  );

  // Handle default preset change
  const handleDefaultPresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUserPreferencesChange({ defaultLayoutPreset: e.target.value as LayoutPresetId });
    },
    [onUserPreferencesChange]
  );

  // Handle theme change
  const handleThemeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUserPreferencesChange({ theme: e.target.value as 'light' | 'dark' | 'system' });
    },
    [onUserPreferencesChange]
  );

  // Tab styles
  const tabStyles = (isActive: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#1976d2' : '#666',
    backgroundColor: isActive ? '#fff' : '#f5f5f5',
    border: 'none',
    borderBottom: isActive ? '2px solid #1976d2' : '2px solid transparent',
    cursor: disabled ? 'default' : 'pointer',
    flex: 1,
    transition: 'all 0.2s',
  });

  return (
    <div
      style={{
        width,
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        overflow: 'hidden',
      }}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0' }}>
        <button
          type="button"
          onClick={() => setActiveTab('document')}
          disabled={disabled}
          style={tabStyles(activeTab === 'document')}
        >
          Document
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          disabled={disabled}
          style={tabStyles(activeTab === 'preferences')}
        >
          Preferences
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {activeTab === 'document' && (
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
            <div style={{ marginTop: '16px', borderTop: '1px solid #e0e0e0', paddingTop: '12px' }}>
              <div style={{ ...labelStyles, fontSize: '13px', marginBottom: '12px' }}>
                Layout Settings
              </div>
              <LayoutSettingsForm
                settings={documentSettings.layout}
                selectedPreset={selectedPreset}
                onChange={handleLayoutChange}
                onPresetChange={onPresetChange}
                onApply={onApplyLayout}
                disabled={disabled}
              />
            </div>
          </div>
        )}

        {activeTab === 'preferences' && (
          <div style={{ padding: '12px' }}>
            {/* Display Settings */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ ...labelStyles, fontSize: '13px', marginBottom: '8px' }}>
                Display
              </div>

              <label style={checkboxGroupStyles}>
                <input
                  type="checkbox"
                  checked={userPreferences.showMinimap}
                  onChange={handleCheckboxChange('showMinimap')}
                  disabled={disabled}
                />
                <span style={{ fontSize: '13px' }}>Show minimap</span>
              </label>

              <label style={checkboxGroupStyles}>
                <input
                  type="checkbox"
                  checked={userPreferences.showControls}
                  onChange={handleCheckboxChange('showControls')}
                  disabled={disabled}
                />
                <span style={{ fontSize: '13px' }}>Show controls</span>
              </label>

              <label style={checkboxGroupStyles}>
                <input
                  type="checkbox"
                  checked={userPreferences.fitViewOnLoad}
                  onChange={handleCheckboxChange('fitViewOnLoad')}
                  disabled={disabled}
                />
                <span style={{ fontSize: '13px' }}>Fit view on load</span>
              </label>
            </div>

            {/* Theme */}
            <div style={formGroupStyles}>
              <label style={labelStyles}>Theme</label>
              <select
                value={userPreferences.theme}
                onChange={handleThemeChange}
                disabled={disabled}
                style={inputStyles}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            {/* Defaults */}
            <div style={{ marginTop: '16px', borderTop: '1px solid #e0e0e0', paddingTop: '12px' }}>
              <div style={{ ...labelStyles, fontSize: '13px', marginBottom: '8px' }}>
                Defaults for New Diagrams
              </div>

              <div style={formGroupStyles}>
                <label style={labelStyles}>Default Notation</label>
                <select
                  value={userPreferences.defaultNotation}
                  onChange={handleDefaultNotationChange}
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

              <div style={formGroupStyles}>
                <label style={labelStyles}>Default Layout</label>
                <select
                  value={userPreferences.defaultLayoutPreset}
                  onChange={handleDefaultPresetChange}
                  disabled={disabled}
                  style={inputStyles}
                >
                  <option value="flowchart">Flowchart</option>
                  <option value="org-chart">Org Chart</option>
                  <option value="network">Network</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
            </div>

            {/* Recent Files (Read Only Info) */}
            {userPreferences.recentFiles.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid #e0e0e0', paddingTop: '12px' }}>
                <div style={{ ...labelStyles, fontSize: '13px', marginBottom: '8px' }}>
                  Recent Files ({userPreferences.recentFiles.length})
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  {userPreferences.recentFiles.slice(0, 3).map((f, i) => (
                    <div key={i} style={{ marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.split('/').pop()}
                    </div>
                  ))}
                  {userPreferences.recentFiles.length > 3 && (
                    <div style={{ fontStyle: 'italic' }}>
                      and {userPreferences.recentFiles.length - 3} more...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
