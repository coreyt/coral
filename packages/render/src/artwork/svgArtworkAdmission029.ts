/** Entry points of the coral.svg-artwork 1 admitter. Phases run in profile
 * order (§3) and admission stops after the first phase that fails. */
import { BoundedCache029, FAILURE_BYTES_029, REPORTED_FAILURES_029, textBytes029 } from './svgArtworkCache029.js';
import { buildCanonicalModel029, serializeCanonical029 } from './svgArtworkCanonical029.js';
import {
  SVG_ARTWORK_BUDGETS_029, SVG_ARTWORK_PROFILE_029, type SvgArtworkAdmission029, type SvgArtworkBudgetExcess029,
  type SvgArtworkFailure029,
} from './svgArtworkModel029.js';
import { checkGeometry029 } from './svgArtworkGeometry029.js';
import { checkReferences029 } from './svgArtworkReferences029.js';
import { resolveStyle029 } from './svgArtworkStyle029.js';
import {
  parseSvgArtworkXml029, SvgArtworkParseError029, utf8Length029, type RawDocument029,
} from './svgArtworkTokenizer029.js';
import { checkVocabulary029 } from './svgArtworkVocabulary029.js';

const refuse = (failures: SvgArtworkFailure029[]): SvgArtworkAdmission029 =>
  Object.freeze({ ok: false, failures: Object.freeze(failures.map((failure) => Object.freeze(failure))) });

/** Admission results by artwork text. Ingress refusals are never cached, and a
 * refusal is cached only when it has no more failures than source reporting
 * uses (64 reported plus the first suppressed one); larger refusals are kept,
 * truncated, by the source hook's own cache. Results are frozen. */
const cache = new BoundedCache029<SvgArtworkAdmission029>(512, 256 * 1024 * 1024);

/** Admit artwork text with coral.svg-artwork version 1. */
export function admitSvgArtwork029(text: string): SvgArtworkAdmission029 {
  const hit = cache.get(text);
  if (hit) return hit;
  const result = admit(text);
  if (result.ok) {
    const { canonicalText, measures } = result.artwork;
    cache.set(text, result, textBytes029(text) + textBytes029(canonicalText) + 256 * (measures.elements + measures.segments));
  } else if (result.failures[0]!.phase !== 'P1' && result.failures.length <= REPORTED_FAILURES_029 + 1) {
    cache.set(text, result, textBytes029(text) + FAILURE_BYTES_029 * result.failures.length);
  }
  return result;
}

function ingress(measure: number, end: number): SvgArtworkAdmission029 | undefined {
  const limit = SVG_ARTWORK_BUDGETS_029['input.bytes'];
  if (measure <= limit) return undefined;
  return refuse([{ code: 'coral.artwork.svg.budget.exceeded', phase: 'P1', detail: `input.bytes ${measure} > ${limit}`,
    start: 0, end, budgets: [{ name: 'input.bytes', measure, limit }] }]);
}

function admit(text: string): SvgArtworkAdmission029 {
  const refused = ingress(utf8Length029(text), text.length);
  if (refused) return refused;
  let document: RawDocument029;
  try {
    document = parseSvgArtworkXml029(text, { elements: SVG_ARTWORK_BUDGETS_029['input.elements'],
      nesting: SVG_ARTWORK_BUDGETS_029.nesting });
  } catch (error) {
    if (!(error instanceof SvgArtworkParseError029)) throw error;
    return refuse([error.budget
      ? { code: 'coral.artwork.svg.budget.exceeded', phase: 'P2', detail: `${error.budget.name} ${error.budget.measure} > ${error.budget.limit}`,
        start: error.start, end: error.end, budgets: [error.budget] }
      : { code: 'coral.artwork.svg.parse', phase: 'P2', detail: error.detail, start: error.start, end: error.end }]);
  }
  const vocabulary = checkVocabulary029(document.root, SVG_ARTWORK_BUDGETS_029['input.segments']);
  if (vocabulary.failures.length > 0) return refuse(vocabulary.failures);
  const references = checkReferences029(vocabulary.nodes, SVG_ARTWORK_BUDGETS_029['reference-depth']);
  if (references.failures.length > 0) return refuse(references.failures);
  const style = resolveStyle029(vocabulary.nodes);
  if (style.failures.length > 0) return refuse(style.failures);
  const geometry = checkGeometry029(vocabulary.root!, vocabulary.viewBox!, style.computed);
  if (geometry.length > 0) return refuse(geometry);

  // P7: canonical model, canonical text, measures and tier (profile §11, §12).
  const build = buildCanonicalModel029(vocabulary.root!, vocabulary.viewBox!, vocabulary.nodes, references.ids, style);
  const canonicalText = serializeCanonical029(build.model);
  const measures = { bytes: utf8Length029(canonicalText), elements: build.elements, segments: build.segments };
  const excess: SvgArtworkBudgetExcess029[] = (['bytes', 'elements', 'segments'] as const)
    .filter((name) => measures[name] > SVG_ARTWORK_BUDGETS_029[name].detailed)
    .map((name) => ({ name, measure: measures[name], limit: SVG_ARTWORK_BUDGETS_029[name].detailed }));
  if (excess.length > 0) {
    return refuse([{ code: 'coral.artwork.svg.budget.exceeded', phase: 'P7',
      detail: excess.map((item) => `${item.name} ${item.measure} > ${item.limit}`).join(', '), start: 0, end: text.length,
      budgets: excess }]);
  }
  const standard = (['bytes', 'elements', 'segments'] as const)
    .every((name) => measures[name] <= SVG_ARTWORK_BUDGETS_029[name].standard);
  const discarded = [...document.discarded, ...vocabulary.discarded, ...build.discarded].sort((left, right) => left.start - right.start);
  return { ok: true, artwork: Object.freeze({
    profile: SVG_ARTWORK_PROFILE_029, tier: standard ? 'standard' : 'detailed', canonicalText,
    inputIsCanonical: text === canonicalText, viewBox: build.model.viewBox, model: build.model,
    measures: Object.freeze(measures), discarded: Object.freeze(discarded),
  }) };
}

/** Bytes entry point: P1 measures the bytes, then strict UTF-8 decoding. */
export function admitSvgArtworkBytes029(bytes: Uint8Array): SvgArtworkAdmission029 {
  const refused = ingress(bytes.length, 0);
  if (refused) return refused;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return refuse([{ code: 'coral.artwork.svg.parse', phase: 'P2', detail: 'input is not well-formed UTF-8', start: 0, end: 0 }]);
  }
  return admitSvgArtwork029(text);
}
