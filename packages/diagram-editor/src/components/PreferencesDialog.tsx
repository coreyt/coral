/**
 * PreferencesDialog - Modal dialog for user preferences (Ctrl+,)
 *
 * Sections: Appearance, Defaults, AI Generation, Recent Files.
 * Reuses CommandPalette overlay pattern. Colors derived from theme.
 */

import { AI_FEATURES_AVAILABLE } from '../releaseFeatures029.js';
import React, { useCallback, useMemo, type ReactNode } from 'react';
import type {
  UserPreferences,
  LayoutPresetId,
  LLMProviderPreference,
  SpeechRecognitionMode,
} from '@coral-viz/viz';
import { CoralDialog } from '../ui/CoralDialog';
import type { TranscriptPreferences } from '../transcriptPreferences';

export interface LLMProviderInfo {
  id: string;
  name: string;
  models: Array<{ id: string; name: string }>;
}

export interface PreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  restoreFocusTo?: HTMLElement | null;
  userPreferences: UserPreferences;
  onUserPreferencesChange: (prefs: Partial<UserPreferences>) => void;
  notations: Array<{ id: string; name: string }>;
  llmProviders: LLMProviderInfo[];
  llmApiKey: string;
  onLlmApiKeyChange: (key: string) => void;
  onLlmApiKeyPersistenceChange: (enabled: boolean) => boolean;
  llmApiKeyPersistenceError?: string;
  theme: Record<string, string>;
  themeName?: 'light' | 'dark';
  onResetWorkspace?: () => void;
  transcriptPreferences?: TranscriptPreferences;
  onTranscriptPreferencesChange?: (preferences: TranscriptPreferences) => void;
  onClearTranscripts?: () => void;
  transcriptArchives?: Array<{ id: string; updatedAt: number; messageCount: number }>;
  associatedTranscriptId?: string | null;
  onAssociateTranscript?: (archiveId: string) => void;
  onClearCurrentTranscript?: () => void;
  onDeleteAssociatedTranscript?: () => void;
  /** The on-device model's section; present only when the build includes the feature. */
  onDeviceSection?: ReactNode;
}

export function PreferencesDialog({
  isOpen,
  onClose,
  restoreFocusTo,
  userPreferences,
  onUserPreferencesChange,
  notations,
  llmProviders,
  llmApiKey,
  onLlmApiKeyChange,
  onLlmApiKeyPersistenceChange,
  llmApiKeyPersistenceError,
  theme,
  themeName,
  onResetWorkspace,
  transcriptPreferences,
  onTranscriptPreferencesChange,
  onClearTranscripts,
  transcriptArchives = [],
  associatedTranscriptId = null,
  onAssociateTranscript,
  onClearCurrentTranscript,
  onDeleteAssociatedTranscript,
  onDeviceSection,
}: PreferencesDialogProps) {
  // Derive form styles from theme
  const labelStyles = useMemo<React.CSSProperties>(() => ({
    fontSize: '12px',
    fontWeight: 500,
    color: theme.tabInactiveText || 'var(--coral-muted)',
    marginBottom: '4px',
    display: 'block',
  }), [theme.tabInactiveText]);

  const inputStyles = useMemo<React.CSSProperties>(() => ({
    padding: '6px 10px',
    fontSize: '13px',
    borderRadius: '4px',
    border: `1px solid ${theme.inspectorBorder || 'var(--coral-border-strong)'}`,
    backgroundColor: theme.controlBg || 'var(--coral-surface-subtle)',
    color: theme.inspectorText || 'var(--coral-text)',
    width: '100%',
    boxSizing: 'border-box' as const,
  }), [theme.inspectorBorder, theme.controlBg, theme.inspectorText]);

  const formGroupStyles: React.CSSProperties = {
    marginBottom: '12px',
  };

  const checkboxGroupStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  };

  const sectionHeaderStyles = useMemo<React.CSSProperties>(() => ({
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '12px',
    paddingBottom: '4px',
    borderBottom: `1px solid ${theme.inspectorBorder || 'var(--coral-border)'}`,
    color: theme.inspectorText || 'var(--coral-text)',
  }), [theme.inspectorBorder, theme.inspectorText]);

  const handleCheckboxChange = useCallback(
    (key: keyof UserPreferences) => (e: React.ChangeEvent<HTMLInputElement>) => {
      onUserPreferencesChange({ [key]: e.target.checked });
    },
    [onUserPreferencesChange],
  );

  const handleThemeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUserPreferencesChange({ theme: e.target.value as 'light' | 'dark' | 'system' });
    },
    [onUserPreferencesChange],
  );

  const handleDefaultNotationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUserPreferencesChange({ defaultNotation: e.target.value });
    },
    [onUserPreferencesChange],
  );

  const handleDefaultPresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUserPreferencesChange({ defaultLayoutPreset: e.target.value as LayoutPresetId });
    },
    [onUserPreferencesChange],
  );

  const handleLlmProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newProvider = e.target.value as LLMProviderPreference;
      const providerConfig = llmProviders?.find((p) => p.id === newProvider);
      const firstModel = providerConfig?.models[0]?.id || '';
      onUserPreferencesChange({ llmProvider: newProvider, llmModel: firstModel });
    },
    [onUserPreferencesChange, llmProviders],
  );

  const handleLlmModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUserPreferencesChange({ llmModel: e.target.value });
    },
    [onUserPreferencesChange],
  );

  const handleLlmRetriesChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUserPreferencesChange({ llmMaxRetries: Number(e.target.value) });
    },
    [onUserPreferencesChange],
  );

  const handleLlmSaveKeyToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onLlmApiKeyPersistenceChange(e.target.checked);
    },
    [onLlmApiKeyPersistenceChange],
  );

  const handleSpeechModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUserPreferencesChange({ speechRecognitionMode: e.target.value as SpeechRecognitionMode });
    },
    [onUserPreferencesChange],
  );

  if (!isOpen) return null;

  const mutedText = theme.controlTextMuted || theme.tabInactiveText || 'var(--coral-muted)';

  return (
    <CoralDialog
      themeName={themeName}
      open={isOpen}
      title="Preferences"
      closeLabel="Close preferences"
      onClose={onClose}
      restoreFocusTo={restoreFocusTo}
      initialFocus="first"
      overlayTestId="preferences-overlay"
    >
      <div
        style={{
          width: '480px',
          maxWidth: '100%',
        }}
      >
        <div style={{ padding: '16px 20px' }}>
          {/* Appearance */}
          <div style={{ marginBottom: '20px' }}>
            <div style={sectionHeaderStyles}>Appearance</div>

            <div style={formGroupStyles}>
              <label style={labelStyles}>Theme</label>
              <select data-initial-focus value={userPreferences.theme} onChange={handleThemeChange} style={inputStyles}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <label style={checkboxGroupStyles}>
              <input
                type="checkbox"
                checked={userPreferences.showMinimap}
                onChange={handleCheckboxChange('showMinimap')}
              />
              <span style={{ fontSize: '13px' }}>Show minimap</span>
            </label>

            <label style={checkboxGroupStyles}>
              <input
                type="checkbox"
                checked={userPreferences.showControls}
                onChange={handleCheckboxChange('showControls')}
              />
              <span style={{ fontSize: '13px' }}>Show controls</span>
            </label>

            <label style={checkboxGroupStyles}>
              <input
                type="checkbox"
                checked={userPreferences.fitViewOnLoad}
                onChange={handleCheckboxChange('fitViewOnLoad')}
              />
              <span style={{ fontSize: '13px' }}>Fit view on load</span>
            </label>

            <label style={checkboxGroupStyles}>
              <input
                type="checkbox"
                checked={userPreferences.editorEntityHighlighting === true}
                onChange={handleCheckboxChange('editorEntityHighlighting')}
              />
              <span style={{ fontSize: '13px' }}>Entity highlighting</span>
            </label>
            {onResetWorkspace && (
              <button type="button" className="coral-button" onClick={onResetWorkspace}>
                Reset workspace layout
              </button>
            )}
          </div>

          {/* Defaults */}
          <div style={{ marginBottom: '20px' }}>
            <div style={sectionHeaderStyles}>Defaults for New Diagrams</div>

            <div style={formGroupStyles}>
              <label style={labelStyles}>Default Notation</label>
              <select
                value={userPreferences.defaultNotation}
                onChange={handleDefaultNotationChange}
                style={inputStyles}
              >
                {notations.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>

            <div style={formGroupStyles}>
              <label style={labelStyles}>Default Layout</label>
              <select
                value={userPreferences.defaultLayoutPreset}
                onChange={handleDefaultPresetChange}
                style={inputStyles}
              >
                <option value="flowchart">Flowchart</option>
                <option value="org-chart">Org Chart</option>
                <option value="network">Network</option>
                <option value="radial">Radial</option>
              </select>
            </div>
          </div>

          {onDeviceSection && (
            <div style={{ marginBottom: '20px' }}>
              <div style={sectionHeaderStyles}>On-device AI</div>
              {onDeviceSection}
            </div>
          )}

          {/* AI Generation */}
          {AI_FEATURES_AVAILABLE && llmProviders.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={sectionHeaderStyles}>AI Generation</div>

              <div style={formGroupStyles}>
                <label style={labelStyles}>Provider</label>
                <select
                  value={userPreferences.llmProvider}
                  onChange={handleLlmProviderChange}
                  style={inputStyles}
                >
                  {llmProviders.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={formGroupStyles}>
                <label style={labelStyles}>Model</label>
                <select
                  value={userPreferences.llmModel}
                  onChange={handleLlmModelChange}
                  style={inputStyles}
                >
                  {(llmProviders.find((p) => p.id === userPreferences.llmProvider)?.models || []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div style={formGroupStyles}>
                <label style={labelStyles}>API Key</label>
                <input
                  type="password"
                  value={llmApiKey || ''}
                  onChange={(e) => onLlmApiKeyChange(e.target.value)}
                  placeholder="Enter API key..."
                  style={inputStyles}
                />
              </div>

              <div style={formGroupStyles}>
                <label htmlFor="generation-retries" style={labelStyles}>Generation retries</label>
                <select
                  id="generation-retries"
                  aria-label="Generation retries"
                  value={userPreferences.llmMaxRetries ?? 2}
                  onChange={handleLlmRetriesChange}
                  style={inputStyles}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>

              <label style={checkboxGroupStyles}>
                <input
                  type="checkbox"
                  checked={userPreferences.llmSaveApiKey}
                  onChange={handleLlmSaveKeyToggle}
                />
                <span style={{ fontSize: '13px' }}>Save API key to localStorage</span>
              </label>
              {userPreferences.llmSaveApiKey && (
                <div style={{
                  fontSize: '11px',
                  color: theme.errorText || 'var(--coral-error)',
                  padding: '4px 8px',
                  backgroundColor: theme.errorBg || 'var(--coral-surface-subtle)',
                  borderRadius: '4px',
                  marginBottom: '8px',
                }}>
                  Warning: API key will be stored in browser localStorage in plain text.
                  Only use on trusted devices.
                </div>
              )}
              {llmApiKeyPersistenceError && (
                <div role="alert" style={{ color: theme.errorText || 'var(--coral-error)', marginBottom: '8px' }}>
                  {llmApiKeyPersistenceError}
                </div>
              )}

              {transcriptPreferences && onTranscriptPreferencesChange && (
                <div style={{ ...formGroupStyles, marginTop: '12px' }}>
                  <label style={checkboxGroupStyles}>
                    <input
                      type="checkbox"
                      checked={transcriptPreferences.enabled}
                      onChange={(event) => onTranscriptPreferencesChange({
                        ...transcriptPreferences,
                        enabled: event.target.checked,
                      })}
                    />
                    <span style={{ fontSize: '13px' }}>Keep AI transcripts on this device</span>
                  </label>
                  <label htmlFor="transcript-retention" style={labelStyles}>Transcript retention</label>
                  <select
                    id="transcript-retention"
                    value={transcriptPreferences.retentionDays}
                    disabled={!transcriptPreferences.enabled}
                    onChange={(event) => onTranscriptPreferencesChange({
                      ...transcriptPreferences,
                      retentionDays: Number(event.target.value),
                    })}
                    style={inputStyles}
                  >
                    <option value={30}>30 days</option>
                    <option value={14}>14 days</option>
                    <option value={7}>7 days</option>
                    <option value={0}>No age deadline</option>
                  </select>
                  <div style={{ fontSize: '11px', color: mutedText, marginTop: '4px' }}>
                    Off by default. Opened and downloaded documents start a new conversation unless you explicitly associate one.
                  </div>
                  {transcriptPreferences.enabled && onAssociateTranscript && (
                    <>
                      <label htmlFor="transcript-association" style={labelStyles}>Conversation association</label>
                      <select
                        id="transcript-association"
                        value={associatedTranscriptId ?? ''}
                        onChange={(event) => onAssociateTranscript(event.target.value)}
                        style={inputStyles}
                      >
                        <option value="">New conversation</option>
                        {transcriptArchives.map((archive) => (
                          <option key={archive.id} value={archive.id}>
                            {new Date(archive.updatedAt).toLocaleString()} · {archive.messageCount} messages
                          </option>
                        ))}
                      </select>
                      {associatedTranscriptId && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button type="button" className="coral-button coral-button--quiet" onClick={onClearCurrentTranscript}>
                            Clear current
                          </button>
                          <button type="button" className="coral-button coral-button--quiet" onClick={onDeleteAssociatedTranscript}>
                            Delete associated
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {onClearTranscripts && (
                    <button type="button" className="coral-button coral-button--quiet" onClick={onClearTranscripts}>
                      Delete all saved transcripts
                    </button>
                  )}
                </div>
              )}

              {/* Voice Input */}
              <div style={{ ...formGroupStyles, marginTop: '12px' }}>
                <label style={labelStyles}>Voice Input</label>
                <select
                  value={userPreferences.speechRecognitionMode}
                  onChange={handleSpeechModeChange}
                  style={inputStyles}
                  aria-label="Voice input mode"
                >
                  <option value="local">Local (Whisper, on-device)</option>
                  <option value="browser">Browser (Web Speech API)</option>
                  <option value="off">Off</option>
                </select>
                {userPreferences.speechRecognitionMode === 'local' && (
                  <div style={{ fontSize: '11px', color: mutedText, marginTop: '4px' }}>
                    Uses an on-device Whisper model downloaded for each model load; a network
                    connection is required. Audio never leaves your machine.
                  </div>
                )}
                {userPreferences.speechRecognitionMode === 'browser' && (
                  <div style={{
                    fontSize: '11px',
                    color: theme.warningText || 'var(--coral-warning)',
                    padding: '4px 8px',
                    backgroundColor: theme.errorBg || 'var(--coral-surface-subtle)',
                    borderRadius: '4px',
                    marginTop: '4px',
                  }}>
                    Audio is sent to your browser vendor's cloud for recognition.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Files */}
          {userPreferences.recentFiles.length > 0 && (
            <div>
              <div style={sectionHeaderStyles}>
                Recent Files ({userPreferences.recentFiles.length})
              </div>
              <div style={{ fontSize: '12px', color: mutedText }}>
                {userPreferences.recentFiles.slice(0, 5).map((f, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.split('/').pop()}
                  </div>
                ))}
                {userPreferences.recentFiles.length > 5 && (
                  <div style={{ fontStyle: 'italic' }}>
                    and {userPreferences.recentFiles.length - 5} more...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </CoralDialog>
  );
}
