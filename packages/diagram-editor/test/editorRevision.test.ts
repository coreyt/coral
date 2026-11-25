import { describe, expect, it, vi } from 'vitest';
import { EditorRevision } from '../src/editorRevision';

describe('EditorRevision', () => {
  it.each(['text', 'visual', 'inspector', 'format', 'document', 'recovery', 'undo', 'redo']) (
    'invalidates pending layout and LLM work for %s edits',
    () => {
      const abort = vi.fn();
      const revisions = new EditorRevision(abort);
      const layout = revisions.beginLayout('loading');
      const llm = revisions.currentLlm();

      revisions.invalidateEdit();

      expect(abort).toHaveBeenCalledOnce();
      expect(revisions.isCurrent(layout)).toBe(false);
      expect(revisions.finish('loading', layout)).toBe(false);
      expect(revisions.currentLlm()).toBeGreaterThan(llm);
    },
  );

  it('can retain the active generation while invalidating its document context', () => {
    const abort = vi.fn();
    const revisions = new EditorRevision(abort);
    revisions.invalidateEdit({ abortGeneration: false });
    expect(abort).not.toHaveBeenCalled();
  });

  it('lets only the current owner finish loading or reflow state', () => {
    const revisions = new EditorRevision(() => {});
    const stale = revisions.beginLayout('loading');
    const current = revisions.beginLayout('loading');
    expect(revisions.finish('loading', stale)).toBe(false);
    expect(revisions.finish('loading', current)).toBe(true);
    expect(revisions.finish('loading', current)).toBe(false);
  });

  it('invalidates only LLM work for font-only projection changes', () => {
    const revisions = new EditorRevision(() => {});
    const layout = revisions.beginLayout('loading');
    const llm = revisions.currentLlm();
    revisions.invalidateLlm();
    expect(revisions.currentLlm()).toBeGreaterThan(llm);
    expect(revisions.isCurrent(layout)).toBe(true);
  });

  it('retires layout authority independently on unmount', () => {
    const revisions = new EditorRevision(() => {});
    const layout = revisions.beginLayout('loading');

    revisions.invalidateLayouts();

    expect(revisions.isCurrent(layout)).toBe(false);
  });

  it('blocks export while current source is pending or invalid and publishes only its own revision', () => {
    const revisions = new EditorRevision(() => {});
    const first = revisions.beginSource().sourceRevision;
    const second = revisions.beginSource().sourceRevision;

    expect(revisions.currentExportDiagnostic()).toContain('current source');
    expect(revisions.publishSource(first)).toBe(false);
    expect(revisions.blockSource(second, 'Current source is invalid.')).toBe(true);
    expect(revisions.currentExportDiagnostic()).toBe('Current source is invalid.');

    const third = revisions.beginSource().sourceRevision;
    expect(revisions.publishSource(third)).toBe(true);
    expect(revisions.publicationEnvelope()).toEqual({
      sourceRevision: third,
      displayRevision: third,
      status: 'current',
    });
    expect(revisions.currentExportDiagnostic()).toBeNull();
  });

  it('never re-issues a source revision after an earlier publication is restored (DR94-F6)', () => {
    const revisions = new EditorRevision(() => {});
    const accepted = revisions.beginSource().sourceRevision;
    revisions.publishSource(accepted);
    const snapshot = revisions.publicationEnvelope();
    const abandoned = revisions.beginSource().sourceRevision;

    revisions.restorePublication(snapshot);
    expect(revisions.publicationEnvelope()).toEqual(snapshot);
    const next = revisions.beginSource().sourceRevision;

    expect(next).toBeGreaterThan(abandoned);
    expect(revisions.publishSource(abandoned)).toBe(false);
    expect(revisions.publishSource(next)).toBe(true);
  });
});
