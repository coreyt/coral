/**
 * Vocabulary-level defect injector for the Coral defect corpus (Slice 49,
 * R-049.5 AC-4's remaining two catalog types).
 *
 * `inject-syntax-defects.ts` covers the fifteen grammar-level defect types
 * `repairCoralDsl` (`@coral-viz/language`) resolves. The other two catalog
 * types -- `misspelled-keyword` and `keyword-case-mutation` -- are
 * vocabulary-level (a declared node type that isn't in the diagram-editor's
 * own `KNOWN_NODE_TYPES`), resolved by `repairKnownNodeTypeTypos`, not
 * `repairCoralDsl` (see `dev/designs/coral-defect-corpus.md` Step 5's
 * dependency-direction note). This module injects those two types and
 * verifies each candidate against the real `repairKnownNodeTypeTypos`
 * before accepting it, mirroring how `inject-syntax-defects.ts` verifies
 * each candidate against the real `parse()`.
 */

import { repairKnownNodeTypeTypos } from '../../src/parsers';

export type VocabularyDefectType = 'misspelled-keyword' | 'keyword-case-mutation';

export const ALL_VOCABULARY_DEFECT_TYPES: readonly VocabularyDefectType[] = [
  'misspelled-keyword',
  'keyword-case-mutation',
];

export interface InjectedDefectLocation {
  line: number;
  column: number;
  charOffset: number;
}

export interface InjectedDefect {
  defectType: VocabularyDefectType;
  location: InjectedDefectLocation;
  description: string;
}

export interface DefectInjectionResult {
  originalFilename: string;
  originalDsl: string;
  injectedDefects: InjectedDefect[];
  outputFilename: string;
  outputText: string;
}

/** A small, seeded PRNG (mulberry32) -- no `Math.random()` anywhere in this file. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NODE_DECL_RE = /^([A-Za-z_][\w-]*)(\s+)"((?:[^"\\]|\\.)*)"/;

interface NodeTypeToken {
  lineIndex: number;
  typeStart: number;
  typeEnd: number;
  typeToken: string;
  label: string;
}

function findNodeTypeTokens(lines: string[]): NodeTypeToken[] {
  const out: NodeTypeToken[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex];
    const trimmed = raw.trimStart();
    const leadingWs = raw.length - trimmed.length;
    const match = NODE_DECL_RE.exec(trimmed);
    if (!match) continue;
    out.push({
      lineIndex,
      typeStart: leadingWs,
      typeEnd: leadingWs + match[1].length,
      typeToken: match[1],
      label: match[3],
    });
  }
  return out;
}

function caseMutations(token: string): string[] {
  const alternating = token
    .split('')
    .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
    .join('');
  return [token.toUpperCase(), token[0].toUpperCase() + token.slice(1), alternating].filter((v) => v !== token);
}

function misspellMutations(token: string): string[] {
  const out: string[] = [];
  for (let i = 1; i < token.length - 1; i++) {
    out.push(token.slice(0, i) + token.slice(i + 1)); // delete
    out.push(token.slice(0, i) + token[i] + token.slice(i)); // duplicate
  }
  for (let i = 1; i < token.length - 2; i++) {
    out.push(token.slice(0, i) + token[i + 1] + token[i] + token.slice(i + 2)); // transpose
  }
  return out.filter((v) => v !== token && v.length > 0);
}

/** Replaces the type token on one line, leaving everything else untouched. */
function withMutatedType(lines: string[], lineIndex: number, typeStart: number, typeEnd: number, mutated: string): string[] {
  const copy = lines.slice();
  copy[lineIndex] = copy[lineIndex].slice(0, typeStart) + mutated + copy[lineIndex].slice(typeEnd);
  return copy;
}

/**
 * A mutation is only accepted if the real `repairKnownNodeTypeTypos`
 * confidently repairs it back to the original type on that exact line --
 * this is what makes the corpus's 100%-resolution claim (R-049.5 AC-5)
 * meaningful rather than assumed.
 */
function verifiedCandidateTypes(
  lines: string[],
  token: NodeTypeToken,
  mutations: string[],
): string[] {
  const verified: string[] = [];
  for (const mutated of mutations) {
    const candidateLines = withMutatedType(lines, token.lineIndex, token.typeStart, token.typeEnd, mutated);
    const result = repairKnownNodeTypeTypos(candidateLines.join('\n'));
    const fixedThisLine = result.appliedFixes.find(
      (f) => f.location.line === token.lineIndex + 1 && f.nodeLabel === token.label,
    );
    if (fixedThisLine && fixedThisLine.correctedType === token.typeToken) {
      verified.push(mutated);
    }
  }
  return verified;
}

function computeOffset(lines: string[], line1: number, column0: number): number {
  let offset = 0;
  for (let i = 0; i < line1 - 1; i++) offset += lines[i].length + 1;
  return offset + column0;
}

function withDefectSuffix(filename: string, defectType: VocabularyDefectType): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0) return `${filename}-${defectType}`;
  return `${filename.slice(0, dotIndex)}-${defectType}${filename.slice(dotIndex)}`;
}

/** Which node-type tokens in `dsl` have at least one verified mutation for `defectType`. */
function candidatesFor(dsl: string, defectType: VocabularyDefectType): Array<{ token: NodeTypeToken; verified: string[] }> {
  const lines = dsl.split('\n');
  const out: Array<{ token: NodeTypeToken; verified: string[] }> = [];
  for (const token of findNodeTypeTokens(lines)) {
    const mutations = defectType === 'keyword-case-mutation' ? caseMutations(token.typeToken) : misspellMutations(token.typeToken);
    const verified = verifiedCandidateTypes(lines, token, mutations);
    if (verified.length > 0) out.push({ token, verified });
  }
  return out;
}

/** Which of the two catalog types have at least one verified injection site in `dsl`. */
export function availableVocabularyDefectTypes(dsl: string): VocabularyDefectType[] {
  return ALL_VOCABULARY_DEFECT_TYPES.filter((type) => candidatesFor(dsl, type).length > 0);
}

/**
 * Injects exactly one occurrence of `defectType` into `originalDsl`,
 * choosing deterministically among every verified injection site using
 * `rng`. Throws if `defectType` has no verified injection site -- callers
 * should check `availableVocabularyDefectTypes` first (as
 * `selectAndInjectVocabularyDefect` does).
 */
export function injectVocabularyDefect(
  originalFilename: string,
  originalDsl: string,
  defectType: VocabularyDefectType,
  rng: () => number,
): DefectInjectionResult {
  const lines = originalDsl.split('\n');
  const candidates = candidatesFor(originalDsl, defectType);
  if (candidates.length === 0) {
    throw new Error(`No verified injection site for defect type "${defectType}" in the given DSL`);
  }
  const siteIndex = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  const { token, verified } = candidates[siteIndex];
  const mutationIndex = Math.min(verified.length - 1, Math.floor(rng() * verified.length));
  const mutated = verified[mutationIndex];

  const outputLines = withMutatedType(lines, token.lineIndex, token.typeStart, token.typeEnd, mutated);
  const outputText = outputLines.join('\n');
  const charOffset = computeOffset(lines, token.lineIndex + 1, token.typeStart);

  const description =
    defectType === 'keyword-case-mutation'
      ? `changed node type case from "${token.typeToken}" to "${mutated}" on node "${token.label}"`
      : `misspelled node type "${token.typeToken}" as "${mutated}" on node "${token.label}"`;

  return {
    originalFilename,
    originalDsl,
    injectedDefects: [{ defectType, location: { line: token.lineIndex + 1, column: token.typeStart, charOffset }, description }],
    outputFilename: withDefectSuffix(originalFilename, defectType),
    outputText,
  };
}

/**
 * Deterministically picks one available vocabulary defect type for
 * `originalDsl` using `seed`, then injects it. Returns `null` when neither
 * catalog type has a verified injection site.
 */
export function selectAndInjectVocabularyDefect(
  originalFilename: string,
  originalDsl: string,
  seed: number,
): DefectInjectionResult | null {
  const available = availableVocabularyDefectTypes(originalDsl);
  if (available.length === 0) return null;
  const rng = mulberry32(seed);
  const typeIndex = Math.min(available.length - 1, Math.floor(rng() * available.length));
  return injectVocabularyDefect(originalFilename, originalDsl, available[typeIndex], rng);
}
