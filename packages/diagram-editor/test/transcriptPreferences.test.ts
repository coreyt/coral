import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_PREFERENCES,
  readTranscriptPreferences,
  TRANSCRIPT_PREFERENCES_KEY,
  writeTranscriptPreferences,
} from '../src/transcriptPreferences';

describe('transcript preferences', () => {
  it('is private, local, and disabled by default', () => {
    expect(readTranscriptPreferences({ getItem: () => null })).toEqual(DEFAULT_TRANSCRIPT_PREFERENCES);
  });

  it('retains zero as no age deadline and bounds unreasonable input', () => {
    expect(readTranscriptPreferences({ getItem: () => '{"enabled":true,"retentionDays":0}' }))
      .toEqual({ enabled: true, retentionDays: 0 });
    expect(readTranscriptPreferences({ getItem: () => '{"enabled":true,"retentionDays":999}' }).retentionDays)
      .toBe(365);
  });

  it('writes only the private preference record', () => {
    const setItem = vi.fn();
    writeTranscriptPreferences({ setItem }, { enabled: true, retentionDays: 14 });
    expect(setItem).toHaveBeenCalledWith(
      TRANSCRIPT_PREFERENCES_KEY,
      '{"enabled":true,"retentionDays":14}',
    );
  });
});
