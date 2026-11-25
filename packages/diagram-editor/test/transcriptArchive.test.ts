import { describe, expect, it } from 'vitest';
import {
  ArchiveConflictError,
  ArchiveCorruptionError,
  ArchiveLimitError,
  createTranscriptArchive,
  openTranscriptArchive,
  purgeExpiredTranscriptArchives,
  recalculateTranscriptRetention,
  updateTranscriptArchive,
  validateTranscriptArchive,
} from '../src/transcriptArchive';

describe('Slice 47 transcript archive contract', () => {
  it('surfaces corrupt records instead of silently accepting them', () => {
    expect(() => validateTranscriptArchive({ schemaVersion: 99, archiveId: 'old' }))
      .toThrow(ArchiveCorruptionError);
  });
  it('defaults to 30 days, checks expiry before renewal, and clamps a backward clock', () => {
    const created = createTranscriptArchive('a', 1_000, 30);
    const expired = { ...created, expiresAt: 900, lastObservedWallNow: 2_000 };
    expect(openTranscriptArchive(expired, 500, 30)).toEqual({ status: 'expired' });

    const opened = openTranscriptArchive(created, 2_000, 30);
    expect(opened).toMatchObject({ status: 'open', archive: { openedAt: 2_000, lastObservedWallNow: 2_000 } });
    expect(opened.status === 'open' && opened.archive.expiresAt).toBe(2_000 + 30 * 86_400_000);
  });

  it('uses null expiry for zero days and never renews from a message write', () => {
    const archive = createTranscriptArchive('a', 1_000, 0);
    expect(archive.expiresAt).toBeNull();
    const updated = updateTranscriptArchive(archive, archive.revision, {
      id: 'm1', role: 'user', content: 'hello', createdAt: 2_000,
    });
    expect(updated.openedAt).toBe(archive.openedAt);
    expect(updated.expiresAt).toBeNull();
  });

  it('rejects stale-tab writes and capacity overflow instead of evicting', () => {
    const archive = createTranscriptArchive('a', 1_000, 30);
    expect(() => updateTranscriptArchive(archive, archive.revision + 1, {
      id: 'm1', role: 'user', content: 'hello', createdAt: 2_000,
    })).toThrow(ArchiveConflictError);
    expect(() => updateTranscriptArchive(archive, archive.revision, {
      id: 'm1', role: 'user', content: 'x'.repeat(2 * 1024 * 1024 + 1), createdAt: 2_000,
    })).toThrow(ArchiveLimitError);
  });

  it('recalculates retention from last open and never revives expired data', () => {
    const archive = { ...createTranscriptArchive('a', 1_000, 30), openedAt: 1_000 };
    const shortened = recalculateTranscriptRetention(archive, 2_000, 7);
    expect(shortened).toMatchObject({ status: 'open', archive: { expiresAt: 1_000 + 7 * 86_400_000 } });
    expect(recalculateTranscriptRetention({ ...archive, expiresAt: 1_500 }, 2_000, 30))
      .toEqual({ status: 'expired' });
  });

  it('purges expired archives before returning association choices', async () => {
    const expired = { ...createTranscriptArchive('old', 0, 30), expiresAt: 5 };
    const live = createTranscriptArchive('live', 10, 30);
    const records = new Map([[expired.archiveId, expired], [live.archiveId, live]]);
    const remaining = await purgeExpiredTranscriptArchives({
      get: async (id) => records.get(id),
      put: async () => undefined,
      delete: async (id) => { records.delete(id); },
      clear: async () => { records.clear(); },
      list: async () => [...records.values()],
    }, 10);
    expect(remaining.map((item) => item.archiveId)).toEqual(['live']);
    expect(records.has('old')).toBe(false);
  });
});
