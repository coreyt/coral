/**
 * Writes for the committed defect corpus. The corpus pipeline test rebuilds
 * files that other corpus test files read from parallel workers, so a write
 * must never expose a truncated or partly written file: an unchanged file is
 * left untouched, and a changed one is written to a temporary sibling and
 * renamed over the target, which is atomic on one filesystem.
 */

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Write `content` to `path` only if it differs, atomically. Returns true when written. */
export function writeCorpusFile(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, content, 'utf8');
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  return true;
}
