import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { validateIR } from '@graph-ir/core';
import {
  detectFormat,
  parseDot,
  parseMermaid,
  parsePlantUml,
  print,
} from '@coral-viz/language';
// This historical boundary fuzzes the GraphIR 3 text interchange contract.
import { parse } from '@coral-viz/language/parser';
import { renderSvg } from '@coral-viz/render';
import { render } from '@coral-viz/browser';
import { deserialize, migrateDocumentWithDiagnostics, validateDocument } from '@coral-viz/viz';

export const BOUNDARY_TARGETS = ['language', 'format-open', 'graphir', 'svg', 'browser'];
const TEXT_ATOMS = [
  'alpha', 'space value', 'quote"value', 'slash\\value', 'line\nbreak',
  'emoji-🪸', 'combining-e\u0301', '</text><script>alert(1)</script>',
];

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function generatedText(random, maxSize) {
  let text = '';
  while (text.length < maxSize) {
    const atom = TEXT_ATOMS[Math.floor(random() * TEXT_ATOMS.length)];
    const next = text ? `${text}|${atom}` : atom;
    if (next.length > maxSize) break;
    text = next;
  }
  return text || TEXT_ATOMS[Math.floor(random() * TEXT_ATOMS.length)].slice(0, maxSize);
}

export function buildTrace({ seed, target, cases, maxSize, timeoutMs = 10_000 }) {
  if (!BOUNDARY_TARGETS.includes(target) && target !== 'canary') {
    throw new Error(`unknown Slice 92 fuzz target: ${target}`);
  }
  boundedInteger(cases, 'cases', 1, 10_000);
  boundedInteger(maxSize, 'maxSize', 1, 4096);
  boundedInteger(timeoutMs, 'timeoutMs', 1, 300_000);
  const random = mulberry32(fnv1a(`${seed}:${target}`));
  const actions = Array.from({ length: cases }, (_, index) => ({
    index,
    operation: target,
    payload: {
      text: generatedText(random, maxSize),
      variant: Math.floor(random() * 8),
    },
  }));
  return {
    schemaVersion: 1,
    seed,
    target,
    budgets: { cases, maxSize, timeoutMs },
    actions,
  };
}

export async function replayTrace(trace, execute) {
  if (trace.schemaVersion !== 1 || !Array.isArray(trace.actions)) {
    throw new Error('invalid Slice 92 fuzz trace');
  }
  for (const [index, action] of trace.actions.entries()) {
    if (action.index !== index) throw new Error(`non-contiguous action index ${action.index}`);
    await execute(action);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function shrinkFailingTrace(trace, fails) {
  let result = clone(trace);
  for (let length = 1; length <= result.actions.length; length += 1) {
    const candidate = { ...result, actions: result.actions.slice(0, length) };
    if (await fails(candidate)) {
      result = candidate;
      break;
    }
  }
  const lastIndex = result.actions.length - 1;
  const payload = result.actions[lastIndex]?.payload;
  if (!payload || typeof payload !== 'object') return result;
  for (const key of Object.keys(payload)) {
    if (typeof payload[key] !== 'string') continue;
    let value = payload[key];
    let changed = true;
    while (changed && value.length > 0) {
      changed = false;
      for (let start = 0; start < value.length; start += 1) {
        const candidateValue = value.slice(0, start) + value.slice(start + 1);
        const candidate = clone(result);
        candidate.actions[lastIndex].payload[key] = candidateValue;
        if (await fails(candidate)) {
          result = candidate;
          value = candidateValue;
          changed = true;
          break;
        }
      }
    }
  }
  return result;
}

function equalJson(first, second, message) {
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error(message);
}

/** Input kinds the format-open target generates around the fuzzed text. */
export const FORMAT_OPEN_KINDS = [
  'coral', 'mermaid-flowchart', 'mermaid-class', 'mermaid-sequence', 'dot', 'plantuml',
  'graphir-json', 'coral-document', 'corrupt-document',
];

function documentFor(graph) {
  return {
    schemaVersion: '1.0.0',
    metadata: { name: 'Slice 92 fuzz', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
    content: { format: 'graph-ir', graphIR: graph },
    settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
  };
}

/** A generated file for one supported format, carrying the fuzzed text. */
export function formatOpenInput(text, variant) {
  const kind = FORMAT_OPEN_KINDS[variant % FORMAT_OPEN_KINDS.length];
  const quoted = JSON.stringify(text);
  const word = text.replace(/[^A-Za-z0-9_]/g, '_') || 'x';
  switch (kind) {
    case 'coral': return { kind, name: 'case.coral', source: `service ${quoted}` };
    case 'mermaid-flowchart': return { kind, name: 'case.mmd', source: `flowchart LR\n  a[${quoted}] --> b[End]` };
    case 'mermaid-class': return { kind, name: 'case.mmd', source: `classDiagram\nclass ${word}` };
    case 'mermaid-sequence': return { kind, name: 'case.mmd', source: `sequenceDiagram\nA->>B: ${text.replace(/\n/g, ' ')}` };
    case 'dot': return { kind, name: 'case.dot', source: `digraph G { a [label=${quoted}]; a -> b }` };
    case 'plantuml': return { kind, name: 'case.puml', source: `@startuml\nA -> B : ${text.replace(/\n/g, ' ')}\n@enduml` };
    case 'graphir-json': return { kind, name: 'case.json', source: JSON.stringify(graphFor(text, 0)) };
    case 'coral-document': return { kind, name: 'case.coral.json', source: JSON.stringify(documentFor(graphFor(text, 0))) };
    default: {
      // A document missing its required content must never open.
      const withoutContent = documentFor(graphFor(text, 0));
      delete withoutContent.content;
      return { kind, name: 'case.coral.json', source: JSON.stringify(withoutContent) };
    }
  }
}

/**
 * The library document-open boundary the editor's open plan relies on:
 * migrate, validate, and deserialize. It either opens with the labels intact
 * or refuses, and it never mutates the parsed input.
 */
export function openDocumentText(source) {
  let parsed;
  try { parsed = JSON.parse(source); } catch { return { ok: false, reason: 'invalid JSON' }; }
  const doc = parsed?.version === '3.0.0' && Array.isArray(parsed.nodes) ? documentFor(parsed) : parsed;
  const before = JSON.stringify(doc);
  try {
    const migrated = migrateDocumentWithDiagnostics(doc).document;
    const validation = validateDocument(migrated);
    if (JSON.stringify(doc) !== before) throw new Error('document open mutated its input');
    if (!validation.valid) return { ok: false, reason: validation.errors.join('; ') };
    const opened = deserialize(migrated);
    if (JSON.stringify(doc) !== before) throw new Error('document open mutated its input');
    return { ok: true, labels: opened.nodes.map((node) => node.data.label) };
  } catch (error) {
    if (JSON.stringify(doc) !== before) throw new Error('document open mutated its input', { cause: error });
    if (error instanceof Error && error.message === 'document open mutated its input') throw error;
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function graphFor(text, variant = 0) {
  const count = 1 + (variant % 4);
  return {
    version: '3.0.0',
    id: 'slice92-fuzz',
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `n${index}`,
      type: index % 2 ? 'database' : 'service',
      label: `${text}-${index}`,
      position: { x: index * 180, y: (index % 2) * 120 },
    })),
    edges: Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
      id: `e${index}`,
      source: `n${index}`,
      target: `n${index + 1}`,
      label: text,
    })),
  };
}

async function executeBoundaryAction(action) {
  const { text, variant } = action.payload;
  if (action.operation === 'language') {
    const graph = graphFor(text, variant);
    const source = print(graph);
    const first = parse(source);
    const second = parse(source);
    if (!first.success || !second.success) throw new Error('printed Coral did not parse');
    equalJson(first.graph, second.graph, 'Coral parse is nondeterministic');
    if (print(first.graph) !== print(second.graph)) throw new Error('Coral print is nondeterministic');
    return;
  }
  if (action.operation === 'format-open') {
    const input = formatOpenInput(text, variant);
    const first = detectFormat(input.source, { fileName: input.name });
    equalJson(first, detectFormat(input.source, { fileName: input.name }), 'format detection is nondeterministic');
    const parsers = { coral: parse, mermaid: parseMermaid, dot: parseDot, plantuml: parsePlantUml };
    if (parsers[first.format]) {
      equalJson(parsers[first.format](input.source), parsers[first.format](input.source), 'format parser is nondeterministic');
    } else if (first.format === 'coral-document' || first.format === 'graphir-json') {
      const opened = openDocumentText(input.source);
      equalJson(opened, openDocumentText(input.source), 'document open is nondeterministic');
      if (input.kind === 'corrupt-document' && opened.ok) throw new Error('a corrupt document silently opened');
      if (input.kind !== 'corrupt-document' && opened.ok && opened.labels[0] !== `${text}-0`) {
        throw new Error('document open changed a label');
      }
    } else {
      throw new Error(`${input.kind} input was not recognized`);
    }
    return;
  }
  if (action.operation === 'canary-safe') return;
  if (action.operation === 'canary-hang') {
    // Controlled defect for the time budget: never returns.
    for (;;) { /* hang */ }
  }
  if (action.operation === 'graphir') {
    const graph = graphFor(text, variant);
    if (variant % 3 === 0) graph.edges.push({ id: 'broken', source: 'missing', target: 'n0' });
    const first = validateIR(graph);
    const second = validateIR(clone(graph));
    equalJson(first, second, 'GraphIR validation is nondeterministic');
    if (variant % 3 === 0 && first.valid) throw new Error('invalid GraphIR silently passed');
    return;
  }
  if (action.operation === 'svg') {
    const graph = graphFor(text, variant);
    const first = renderSvg(graph);
    const second = renderSvg(clone(graph));
    if (first !== second) throw new Error('SVG serialization is nondeterministic');
    if (!first.startsWith('<svg') || /<script[\s>]/i.test(first)) throw new Error('SVG output is unsafe or malformed');
    return;
  }
  if (action.operation === 'browser') {
    const source = `@diagram architecture\nitem service as ${JSON.stringify(text)}\n`;
    const first = await render(source);
    const second = await render(source);
    if (first.svg !== second.svg) throw new Error('browser render is nondeterministic');
    if (/<script[\s>]/i.test(first.svg) || first.sourceGraph.nodes[0]?.label !== text) {
      throw new Error('browser render changed meaning or emitted executable markup');
    }
    return;
  }
  throw new Error(`no executor for ${action.operation}`);
}

/**
 * Replay a campaign in a worker so the time budget holds even when an action
 * never returns: at the deadline the worker is terminated and the failure
 * names the action that was running.
 */
const WORKER_STARTUP_MS = 60_000;

export async function runBoundaryCampaign(options) {
  const trace = options.trace ?? buildTrace(options);
  let started = performance.now();
  const failures = [];
  await new Promise((resolve) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { trace } });
    let current = -1;
    let settled = false;
    let deadline;
    const finish = (failure) => {
      if (settled) return;
      settled = true;
      clearTimeout(startup);
      clearTimeout(deadline);
      if (failure) failures.push(failure);
      resolve();
    };
    // Module loading is not charged to the campaign budget; the deadline is
    // armed once the worker reports that its imports resolved.
    const startup = setTimeout(() => {
      void worker.terminate();
      finish(`fuzz worker did not start within ${WORKER_STARTUP_MS}ms`);
    }, WORKER_STARTUP_MS);
    worker.on('message', (message) => {
      if (message.type === 'ready') {
        clearTimeout(startup);
        started = performance.now();
        deadline = setTimeout(() => {
          void worker.terminate();
          finish(`campaign exceeded ${trace.budgets.timeoutMs}ms; terminated during action ${current}`);
        }, trace.budgets.timeoutMs);
      } else if (message.type === 'start') current = message.index;
      else if (message.type === 'done') finish(message.error);
    });
    worker.on('error', (error) => finish(error instanceof Error ? error.message : String(error)));
    worker.on('exit', () => finish(settled ? undefined : 'fuzz worker exited early'));
  });
  const runtimeMs = performance.now() - started;
  return { target: trace.target, seed: trace.seed, cases: trace.actions.length, runtimeMs, failures, trace };
}

if (!isMainThread && workerData?.trace) {
  parentPort.postMessage({ type: 'ready' });
  try {
    await replayTrace(workerData.trace, async (action) => {
      parentPort.postMessage({ type: 'start', index: action.index });
      await executeBoundaryAction(action);
    });
    parentPort.postMessage({ type: 'done' });
  } catch (error) {
    parentPort.postMessage({ type: 'done', error: error instanceof Error ? error.message : String(error) });
  }
}

function option(args, name, fallback) {
  const prefix = `--${name}=`;
  return args.find(value => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const replayPath = option(args, 'replay', '');
  const targets = option(args, 'target', 'all') === 'all'
    ? BOUNDARY_TARGETS
    : [option(args, 'target', '')];
  const seed = option(args, 'seed', process.env.S92_FUZZ_SEED ?? 's92-boundary-smoke');
  const cases = Number(option(args, 'cases', process.env.S92_FUZZ_CASES ?? '12'));
  const maxSize = Number(option(args, 'max-size', process.env.S92_FUZZ_MAX_SIZE ?? '96'));
  const timeoutMs = Number(option(args, 'timeout-ms', process.env.S92_FUZZ_TIMEOUT_MS ?? '10000'));
  const results = [];
  if (replayPath) {
    const trace = JSON.parse(await readFile(replayPath, 'utf8'));
    results.push(await runBoundaryCampaign({ trace }));
  } else {
    for (const target of targets) {
      results.push(await runBoundaryCampaign({ seed, target, cases, maxSize, timeoutMs }));
    }
  }
  console.log(JSON.stringify({ schemaVersion: 1, results }, null, 2));
  if (results.some(result => result.failures.length)) process.exitCode = 1;
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) await main();
