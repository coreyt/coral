import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function assertNoPositiveDragCreationClaim(content, source) {
  const contradictions = content.split('\n').filter((line) => [
    /^\s*(?:[-*]\s+|\d+\.\s+)?(?:drag|drop)\s+(?!(?:an?\s+|the\s+|your\s+)?existing\b).*\b(?:symbol|shape|object)\b.*\bcanvas\b/i,
    /\b(?:Coral(?: 0\.2\.5)?|Slice 35|the (?:release|editor|application)) (?:ships|adds|provides|includes|supports) (?:a |an )?(?:notation[- ]library )?(?:palette|drag-to-create)/i,
    /\bobjects? (?:are|can be) created by (?:dragging|dropping)\b/i,
  ].some((pattern) => pattern.test(line)));

  assert.deepEqual(contradictions, [], `${source} contains an affirmative palette/drag creation claim`);
}

test('claim guard rejects creation promises without rejecting truthful drag boundaries', () => {
  for (const claim of [
    'Drag a symbol from the library onto the canvas.',
    'Coral 0.2.5 ships a drag-to-create interaction.',
    'Objects can be created by dropping them on the canvas.',
  ]) assert.throws(() => assertNoPositiveDragCreationClaim(claim, 'fixture'));

  assert.doesNotThrow(() => assertNoPositiveDragCreationClaim([
    'Coral does not ship a notation palette or drag-to-create interaction.',
    'Drag an existing object to move it on the canvas.',
    'Drag from a port to create a connection.',
  ].join('\n'), 'fixture'));
});

test('current guidance names the shipped object-creation path without inventing a drag gesture', async () => {
  const guide = await read('docs/use/how-to/place-and-edit-objects.md');

  assert.match(guide, /\*\*Command palette\*\*\s*>\s*\*\*Create Node\*\*/i);
  assert.match(guide, /Ctrl\/Command\+Alt\+N/);
  assert.match(guide, /does not (?:provide|include|ship)[\s\S]{0,100}drag-to-create/i);
  assertNoPositiveDragCreationClaim(guide, 'current user guide');
});

test('active design and style authorities record the command-driven object-creation path', async () => {
  const [design, style] = await Promise.all([
    read('dev/designs/canvas-object-creation.md'),
    read('dev/documentation-style.md'),
  ]);

  assert.match(design, /Status: accepted after independent Slice 35 design review/);
  for (const [source, content] of [
    ['creation design', design],
    ['documentation style', style],
  ]) assertNoPositiveDragCreationClaim(content, source);
});
