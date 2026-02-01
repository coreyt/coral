/**
 * Settings Module (CORAL-REQ-009)
 *
 * Provides settings management for Coral diagrams:
 * - useSettings hook for state management
 * - SettingsPanel component for settings UI
 * - LayoutSettingsForm component for layout configuration
 */

export {
  useSettings,
  type UseSettingsOptions,
  type UseSettingsResult,
} from './useSettings.js';

export {
  LayoutSettingsForm,
  type LayoutSettingsFormProps,
} from './LayoutSettingsForm.js';

export {
  SettingsPanel,
  type SettingsPanelProps,
  type SettingsTab,
} from './SettingsPanel.js';
