/**
 * Field occurrences (R-063 AC-5).
 *
 * Every parser store of an authored GraphIR field goes through `assign`, which
 * records the spelling and stores only the first occurrence of a path on one
 * object. `derive` stores a value the source did not state, such as a default
 * or a derived id, and records no occurrence, so it never collides.
 *
 * Internal; not exported from the package entry point.
 */

import type { SPELLINGS } from './spellings.js';

export type SpellingPair = (typeof SPELLINGS)[number];

/** Recorded in place of a value that failed its validator: counted, never stored. */
export const INVALID: unique symbol = Symbol('invalid');

/** The spelling's own token: its 1-based line, 0-based column, and text. */
export interface SpellingToken {
  line: number;
  column: number;
  text: string;
}

export interface Occurrence {
  path: string;
  /** The spelling's name, such as `attribute:label` or `parameter:gap`. */
  spelling: string;
  token: SpellingToken;
}

/**
 * The occurrences stated on one object, indexed by path: `has` and `add` are
 * constant time, so an object with many fields parses in linear time.
 */
export class Occurrences {
  private readonly byPath = new Map<string, Occurrence[]>();

  has(path: string): boolean {
    return this.byPath.has(path);
  }

  /** Record one occurrence; returns true when it is the first for its path. */
  add(path: string, spelling: string, token: SpellingToken): boolean {
    const group = this.byPath.get(path);
    if (group) {
      group.push({ path, spelling, token });
      return false;
    }
    this.byPath.set(path, [{ path, spelling, token }]);
    return true;
  }

  /** Every path stated more than once, with its occurrences in source order. */
  duplicates(): Occurrence[][] {
    return [...this.byPath.values()].filter((group) => group.length > 1);
  }
}

export interface SpellingEvent {
  kind: 'assign' | 'derive';
  target: object;
  path: string;
  pair?: SpellingPair;
}

let recorder: ((event: SpellingEvent) => void) | undefined;

/**
 * Test builds install a recorder to prove that every stored field is
 * explained by a recorded `assign` or `derive` (spelling guard check 3).
 * Returns the function that removes it.
 */
export function recordSpellings(listener: (event: SpellingEvent) => void): () => void {
  recorder = listener;
  return () => {
    if (recorder === listener) recorder = undefined;
  };
}

/** Containers whose keys are separate units: `properties.<key>` and `style.<part>`. */
const CONTAINERS = ['properties', 'style'] as const;

function store(target: object, path: string, value: unknown): void {
  const container = CONTAINERS.find((name) => path.startsWith(`${name}.`));
  let owner = target as Record<string, unknown>;
  let key = path;
  if (container) {
    const existing = owner[container];
    if (existing === undefined) {
      owner[container] = {};
    }
    owner = owner[container] as Record<string, unknown>;
    key = path.slice(container.length + 1);
  }
  Object.defineProperty(owner, key, { value, enumerable: true, writable: true, configurable: true });
}

export function assign(
  occurrences: Occurrences,
  target: object,
  path: string,
  pair: SpellingPair,
  value: unknown,
  token: SpellingToken,
): void {
  const first = occurrences.add(path, pair[1], token);
  recorder?.({ kind: 'assign', target, path, pair });
  if (first && value !== INVALID) store(target, path, value);
}

export function derive(target: object, path: string, value: unknown): void {
  recorder?.({ kind: 'derive', target, path });
  store(target, path, value);
}
