/** Phase P4 of coral.svg-artwork 1: IDs, reference targets, gradient
 * templates, cycles and template depth (profile §8 items 2–6). */
import type { SvgArtworkFailure029 } from './svgArtworkModel029.js';
import { describeValue029 } from './svgArtworkValues029.js';
import type { ArtworkNode029 } from './svgArtworkVocabulary029.js';

const GRADIENTS = new Set(['linearGradient', 'radialGradient']);

export interface ReferenceResult029 {
  ids: Map<string, ArtworkNode029>;
  failures: SvgArtworkFailure029[];
}

export function checkReferences029(nodes: readonly ArtworkNode029[], depthLimit: number): ReferenceResult029 {
  const failures: SvgArtworkFailure029[] = [];
  const ids = new Map<string, ArtworkNode029>();
  for (const node of nodes) {
    if (!node.id) continue;
    if (ids.has(node.id.value)) {
      failures.push({ code: 'coral.artwork.svg.reference.unsupported', phase: 'P4',
        detail: `id ${describeValue029(node.id.value)} is used twice`, start: node.id.start, end: node.id.end });
    } else ids.set(node.id.value, node);
  }

  for (const node of nodes) {
    for (const reference of node.references) {
      const target = ids.get(reference.id);
      const wanted = reference.name === 'clip-path' ? 'clipPath' : 'a gradient';
      const fits = target && (reference.name === 'clip-path' ? target.name === 'clipPath' : GRADIENTS.has(target.name));
      if (!fits) {
        failures.push({ code: 'coral.artwork.svg.reference.unsupported', phase: 'P4',
          detail: `<${node.name}> ${reference.name} names ${describeValue029(`#${reference.id}`)}, which is ${target ? `a <${target.name}>` : 'missing'}, not ${wanted}`,
          start: reference.start, end: reference.end });
      }
    }
  }

  // Template chains form a functional graph over gradients; each cycle is reported once at its first member.
  const next = (node: ArtworkNode029): ArtworkNode029 | undefined => {
    const target = node.href?.id ? ids.get(node.href.id) : undefined;
    return target && GRADIENTS.has(target.name) ? target : undefined;
  };
  const gradients = nodes.filter((node) => GRADIENTS.has(node.name));
  const state = new Map<ArtworkNode029, 'active' | 'cyclic' | 'done'>();
  const reported = new Set<ArtworkNode029>();
  const toCycle = new Set<ArtworkNode029>();
  for (const start of gradients) {
    if (state.has(start)) continue;
    const path: ArtworkNode029[] = [];
    let current: ArtworkNode029 | undefined = start;
    while (current && !state.has(current)) {
      state.set(current, 'active');
      path.push(current);
      current = next(current);
    }
    if (current && state.get(current) === 'active') {
      const cycle = path.slice(path.indexOf(current));
      for (const member of cycle) state.set(member, 'cyclic');
      const first = cycle.reduce((left, right) => left.raw.index <= right.raw.index ? left : right);
      if (!reported.has(first)) {
        reported.add(first);
        failures.push({ code: 'coral.artwork.svg.reference.cycle', phase: 'P4',
          detail: `gradient template chain from <${first.name}> revisits a gradient`, start: first.href!.start, end: first.href!.end });
      }
    }
    // A chain that ends in a cycle, directly or through another chain, has no depth.
    const ending = current && (state.get(current) === 'cyclic' || toCycle.has(current));
    for (const member of path) {
      if (state.get(member) === 'active') state.set(member, 'done');
      if (ending) toCycle.add(member);
    }
  }

  for (const gradient of gradients) {
    if (!gradient.href?.id || toCycle.has(gradient)) continue;
    let steps = 0;
    for (let current = next(gradient); current && steps <= depthLimit; current = next(current)) steps++;
    if (steps > depthLimit) {
      failures.push({ code: 'coral.artwork.svg.budget.exceeded', phase: 'P4',
        detail: `reference-depth over ${depthLimit}`, start: gradient.href.start, end: gradient.href.end,
        budgets: [{ name: 'reference-depth', measure: steps, limit: depthLimit }] });
    }
  }
  failures.sort((left, right) => left.start - right.start);
  return { ids, failures };
}

/** The template chain of a gradient, itself first; P4 guarantees it is finite. */
export function templateChain029(gradient: ArtworkNode029, ids: ReadonlyMap<string, ArtworkNode029>): ArtworkNode029[] {
  const chain = [gradient];
  for (let current = gradient; current.href?.id;) {
    const target = ids.get(current.href.id);
    if (!target || !GRADIENTS.has(target.name)) break;
    chain.push(target);
    current = target;
  }
  return chain;
}
