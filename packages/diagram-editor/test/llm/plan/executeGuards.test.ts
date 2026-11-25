import { describe, expect, it, vi } from 'vitest';
import { validatePlanResponse } from '../../../src/llm/plan/decode';
import { executePlan } from '../../../src/llm/plan/execute';
import { capturePlanSnapshot } from '../../../src/llm/plan/snapshot';

// A helper that misbehaves in one chosen way, to show the executor's own guards refuse it.
const fault = vi.hoisted(() => ({ kind: 'none' as 'none' | 'outside' | 'no-op' | 'newline' }));
vi.mock('../../../src/sourceOwnedEdits028', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/sourceOwnedEdits028')>();
  return { ...original, editSourceOwnedNodeLabel028: (source: string, id: string, label: string) => {
    const edited = original.editSourceOwnedNodeLabel028(source, id, label);
    if (fault.kind === 'outside') return edited.replace('// keep', '// kept');
    if (fault.kind === 'no-op') return source;
    if (fault.kind === 'newline') return edited.replace(`"${label}"\r\n`, `"${label}"\n`);
    return edited;
  } };
});

const SOURCE = '// keep\r\n@diagram flowchart\r\na process as "A"\r\nb process\r\n';

function refusalFor(kind: typeof fault.kind): string {
  const result = capturePlanSnapshot({ source: SOURCE, sourceRevision: 1, requestId: 'r' });
  if (!result.ok) throw new Error(result.refusal.message);
  const plan = validatePlanResponse({ protocol: 'coral-plan/1', snapshot: result.capture.token, kind: 'plan',
    operations: [{ id: 'o1', op: 'entity.label.set', target: { existing: 'n1' }, value: 'B' }] }, result.capture.view);
  fault.kind = kind;
  try {
    const executed = executePlan(result.capture, plan);
    return executed.ok ? 'compiled' : executed.refusal.code;
  } finally { fault.kind = 'none'; }
}

describe('plan executor guards', () => {
  it('refuses an edit outside its declaration, a meaning loss and a mixed newline', () => {
    expect(refusalFor('none')).toBe('compiled');
    expect(refusalFor('outside')).toBe('coral.plan.preservation');
    expect(refusalFor('no-op')).toBe('coral.plan.loss');
    expect(refusalFor('newline')).toBe('coral.plan.newline');
  });
});
