/**
 * The on-device model opt-in (R-066 AC-2), stored per browser profile under
 * its own key rather than in the version-1 workspace layout record, which
 * rejects unknown fields. Off unless the build includes the feature and the
 * user accepted the enable dialog. This module never imports the feature.
 */
import { ON_DEVICE_MODEL_AVAILABLE } from './releaseFeatures029';

export const ON_DEVICE_PREFERENCE_KEY = 'coral.onDeviceModel.v1';

export function readOnDevicePreference(): boolean {
  if (!ON_DEVICE_MODEL_AVAILABLE) return false;
  try { return window.localStorage.getItem(ON_DEVICE_PREFERENCE_KEY) === 'on'; } catch { return false; }
}

export function writeOnDevicePreference(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(ON_DEVICE_PREFERENCE_KEY, 'on');
    else window.localStorage.removeItem(ON_DEVICE_PREFERENCE_KEY);
  } catch { /* storage unavailable: the choice lasts for this page */ }
}
