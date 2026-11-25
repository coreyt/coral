export const TRANSCRIPT_PREFERENCES_KEY = 'coral-transcript-preferences:0.2.5';

export interface TranscriptPreferences {
  enabled: boolean;
  retentionDays: number;
}

export const DEFAULT_TRANSCRIPT_PREFERENCES: TranscriptPreferences = {
  enabled: false,
  retentionDays: 30,
};

export function readTranscriptPreferences(storage: Pick<Storage, 'getItem'>): TranscriptPreferences {
  try {
    const value = JSON.parse(storage.getItem(TRANSCRIPT_PREFERENCES_KEY) ?? 'null') as Partial<TranscriptPreferences> | null;
    if (!value) return { ...DEFAULT_TRANSCRIPT_PREFERENCES };
    return {
      enabled: value.enabled === true,
      retentionDays: Number.isInteger(value.retentionDays) && (value.retentionDays ?? -1) >= 0
        ? Math.min(value.retentionDays!, 365)
        : DEFAULT_TRANSCRIPT_PREFERENCES.retentionDays,
    };
  } catch {
    return { ...DEFAULT_TRANSCRIPT_PREFERENCES };
  }
}

export function writeTranscriptPreferences(
  storage: Pick<Storage, 'setItem'>,
  preferences: TranscriptPreferences,
): void {
  storage.setItem(TRANSCRIPT_PREFERENCES_KEY, JSON.stringify(preferences));
}
