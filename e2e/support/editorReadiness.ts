import { expect, type Page } from '@playwright/test';

/** The editor's own Reflow refusal while any update owner is live. */
export const UPDATE_IN_PROGRESS_REFLOW = 'Finish the current diagram update before Reflow.';

/**
 * Wait until no editor update owner is live, read from one DOM snapshot of the
 * product's existing visible state:
 * - `updating...`: the document layout is loading;
 * - `visible-update-status`: a source parse or structural layout owns the
 *   update (claimed in the same event that changes the source text);
 * - the Reflow refusal title: also a passive visual owner, which spans a
 *   canvas edit's print-back debounce and has no other display;
 * - `Laying out the diagram`: a Reflow is running;
 * - `data-coral-scene-transient`: a node drag has not been released.
 * Each owner is claimed synchronously by the action that starts its work, so
 * an absence observed after that action cannot precede a pending debounce.
 * There is no quiet-time window: a pending signal must clear.
 */
export async function waitForEditorSettled(page: Page, { timeout = 15_000 } = {}) {
  await expect.poll(() => page.evaluate((reflowRefusal) => {
    const pending: string[] = [];
    if ([...document.querySelectorAll('span')].some(element => element.textContent === 'updating...')) {
      pending.push('layout loading');
    }
    for (const status of document.querySelectorAll('[data-testid="visible-update-status"]')) {
      pending.push(`update owner ${status.getAttribute('data-update-kind') ?? 'unknown'}`);
    }
    if (document.querySelector('button[aria-label="Reflow layout"]')?.getAttribute('title') === reflowRefusal) {
      pending.push('diagram update');
    }
    if (document.querySelector('[data-testid="canvas-status"]')?.textContent === 'Laying out the diagram') {
      pending.push('reflow');
    }
    if (document.querySelector('[data-coral-scene-transient="true"]')) pending.push('scene transient');
    return pending;
  }, UPDATE_IN_PROGRESS_REFLOW), { timeout, intervals: [50, 100, 200] }).toEqual([]);
}

/** Wait until the debounced auto-recovery draft holds exactly `dsl`. */
export async function waitForRecoveryDraft(page: Page, dsl: string, { timeout = 10_000 } = {}) {
  await expect.poll(() => page.evaluate(() => {
    const stored = localStorage.getItem('coral-diagram-recovery');
    if (!stored) return null;
    const draft = JSON.parse(stored) as { dsl?: unknown; dslType?: unknown };
    return { dsl: draft.dsl, dslType: draft.dslType };
  }), { timeout }).toEqual({ dsl, dslType: 'coral' });
}
