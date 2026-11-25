import { describe, expect, it } from 'vitest';
import {
  computeNodeSize,
  layoutNodeLabel,
} from '../src/text/sizing.js';
import { fontMetrics, resolveFont } from '../src/text/fonts.js';
import { measureText } from '../src/text/metrics.js';
import { shapeRegistry } from '../src/shapes/index.js';
import { stencilAnchorPoint028, stencilFit028, stencilFitPoint028 } from '../src/stencilAnchorGeometry028.js';
import { CANONICAL_GLYPH_BOX_0210, captionedStencilFrame029, stencilCaptionHeight028 } from '../src/stencilLabelGeometry028.js';

describe('R-033 shared shape-aware label layout', () => {
  it('uses the selected font and line height to grow an adaptive node', () => {
    const small = computeNodeSize({
      text: 'Payment Processing Service',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      fontSize: 11,
      fontFamily: 'sans-serif',
      lineHeight: 1.2,
    });
    const large = computeNodeSize({
      text: 'Payment Processing Service',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      fontSize: 24,
      fontFamily: 'serif',
      lineHeight: 1.8,
    });

    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
  });

  it('applies shape text bounds to both derived dimensions and display lines', () => {
    const rectangle = layoutNodeLabel({
      text: 'A label that wraps predictably',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      fontSize: 14,
      fontFamily: 'sans-serif',
    });
    const diamond = layoutNodeLabel({
      text: 'A label that wraps predictably',
      shapeId: 'diamond',
      sizingMode: 'adaptive',
      fontSize: 14,
      fontFamily: 'sans-serif',
    });

    expect(diamond.width).toBeGreaterThan(rectangle.width);
    expect(diamond.textBox.width).toBeLessThan(diamond.width);
    expect(diamond.lines.join(' ')).toBe('A label that wraps predictably');
    expect(diamond.baselines).toHaveLength(diamond.lines.length);
  });

  it('uses explicit dimensions while keeping deterministic newlines and long words', () => {
    const result = layoutNodeLabel({
      text: 'First line\nSupercalifragilisticexpialidocious',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      dimensions: { width: 140, height: 90 },
      fontSize: 14,
      fontFamily: 'monospace',
      lineHeight: 1.5,
    });

    expect(result).toMatchObject({ width: 140, height: 90 });
    expect(result.lines[0]).toBe('First line');
    expect(result.lines[1]).toBe('Supercalifragilisticexpialidocious');
    expect(result.lines).toHaveLength(2);
  });

  it('prevents hybrid sizing from clipping tall text', () => {
    const result = layoutNodeLabel({
      text: 'First\nSecond\nThird',
      shapeId: 'rectangle',
      sizingMode: 'hybrid',
      fontSize: 24,
      fontFamily: 'handwritten',
      lineHeight: 2.25,
    });

    expect(result.textBox.height).toBeGreaterThanOrEqual(result.textHeight);
    expect(result.height).toBeGreaterThan(60);
  });

  it('keeps glyph ascent and descent inside the safe box for tiny positive line heights', () => {
    const fontSize = 100;
    const result = layoutNodeLabel({
      text: 'First\nSecond',
      shapeId: 'rectangle',
      sizingMode: 'adaptive',
      fontSize,
      fontFamily: 'serif',
      lineHeight: 0.1,
    });
    const font = resolveFont({ family: 'serif', size: fontSize });
    const metrics = fontMetrics(font.id, font.weight);
    const top = result.baselines[0] - metrics.ascent * fontSize;
    const bottom = result.baselines.at(-1)! + metrics.descent * fontSize;

    expect(top).toBeGreaterThanOrEqual(result.textBox.y);
    expect(bottom).toBeLessThanOrEqual(result.textBox.y + result.textBox.height);
    expect(result.textHeight).toBeGreaterThanOrEqual(
      (metrics.ascent + metrics.descent) * fontSize + result.lineHeightPx,
    );
  });

  it.each([
    { family: 'Coral Lowfi Caveat', size: 26, weight: 500,
      text: 'Long customer reference number', caseName: 'ordinary' },
    { family: 'Coral Inter', size: 18, weight: 700,
      text: 'Long customer reference number', caseName: 'ordinary' },
    { family: 'Coral Lowfi Caveat', size: 100, weight: 500,
      text: Array(4).fill('MMMMMMMMMMMMM').join('\n'), caseName: 'large multiline' },
    { family: 'Coral Inter', size: 100, weight: 700,
      text: Array(4).fill('MMMMMMMMMM').join('\n'), caseName: 'large multiline' },
  ])('keeps $caseName Chen attribute ink inside the painted ellipse with $family',
    ({ family, size, weight, text }) => {
      const options = { text, shapeId: 'ellipse', sizingMode: 'adaptive' as const,
        fontFamily: family, fontSize: size, fontWeight: weight, lineHeight: 1.4 };
      const dimensions = computeNodeSize(options);
      const layout = layoutNodeLabel({ ...options, dimensions });
      const font = resolveFont({ family, size, weight, lineHeight: 1.4 });
      const metrics = fontMetrics(font.id, font.weight);
      const fit = stencilFit028(shapeRegistry.get('ellipse')!,
        dimensions.width, dimensions.height);
      const rx = fit.fittedWidth / 2;
      const ry = fit.fittedHeight / 2;
      const centerY = fit.offsetY + ry;
      for (const [index, line] of layout.lines.entries()) {
        const inkWidth = measureText({ text: line, fontFamily: font.cssFamily,
          fontSize: size, fontWeight: weight }).width;
        const top = layout.baselines[index]! - metrics.ascent * size;
        const bottom = layout.baselines[index]! + metrics.descent * size;
        for (const x of [-inkWidth / 2, inkWidth / 2]) {
          for (const y of [top - centerY, bottom - centerY]) {
            expect((x / rx) ** 2 + (y / ry) ** 2).toBeLessThan(0.95);
          }
        }
      }
    });
});

describe('0.2.10 text-region stencils size to a stable label box (RR-1)', () => {
  const labels = {
    5: 'Model',
    26: 'coralsmol fine-tuned model',
    67: 'SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus',
    100: 'SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus with LoRA rank 16, 3 epochs, cosine',
  } as const;
  const shapes = ['brain', 'actor', 'funnel', 'neural-net', 'cylinder', 'document', 'stadium', 'parallelogram', 'hexagon'];

  it.each(shapes)('%s grows at most linearly with label length', (shapeId) => {
    const area = (text: string) => {
      const size = computeNodeSize({ text, shapeId, sizingMode: 'adaptive' });
      return size.width * size.height;
    };
    // 0.2.9 drew a 100-character brain at 543×706 (383k px²).
    expect(area(labels[100]), shapeId).toBeLessThanOrEqual(70_000);
    expect(area(labels[100]) / area(labels[67]), shapeId).toBeLessThanOrEqual((100 / 67) * 1.25);
    expect(area(labels[67]) / area(labels[26]), shapeId).toBeLessThanOrEqual((67 / 26) * 1.25);
  });

  it.each(shapes)('%s sizing and painted layout use the same wrap', (shapeId) => {
    for (const text of Object.values(labels)) {
      const size = computeNodeSize({ text, shapeId, sizingMode: 'adaptive' });
      const painted = layoutNodeLabel({ text, shapeId, sizingMode: 'adaptive', dimensions: size });
      expect(painted.textWidth, `${shapeId}: ${text}`).toBeLessThanOrEqual(painted.textBox.width + 1e-6);
      expect(painted.textHeight, `${shapeId}: ${text}`).toBeLessThanOrEqual(painted.textBox.height + 1e-6);
    }
  });

  it('keeps a label that fits the default column on one line', () => {
    const text = 'Send response';
    const width = measureText({ text, fontFamily: 'Coral Inter', fontSize: 12 }).width;
    for (const shapeId of shapes) {
      const shape = shapeRegistry.get(shapeId)!;
      if (shape.defaultSize.width - shape.sizing!.padding.x * 2 < width) continue;
      expect(layoutNodeLabel({ text, shapeId, sizingMode: 'adaptive' }).lines, shapeId).toHaveLength(1);
    }
  });
});

describe('0.2.10 Phase 5: independent symbol and caption sizing (REQ-B1 / ISC-1..ISC-6)', () => {
  const captionedShapes = ['brain', 'actor', 'funnel', 'neural-net'] as const;
  const captionCases = [
    { name: 'empty', text: '' },
    { name: 'short (5)', text: 'Model' },
    { name: 'medium (26)', text: 'coralsmol fine-tuned model' },
    { name: 'long (67)', text: 'SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus' },
    { name: 'very long (100)', text: 'SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus with LoRA rank 16, 3 epochs, cosine' },
    { name: 'multiline', text: 'Stage 1: tokenize\nStage 2: fine-tune\nStage 3: evaluate' },
    { name: 'unbroken token', text: 'SmolLM2_135M_checkpoint_v2_2026_11_22_final_quantized_q4' },
    { name: 'unbroken token with words', text: 'Base model SmolLM2_135M_checkpoint_v2_2026_11_22_final_quantized_q4 ready' },
  ] as const;

  it.each(captionedShapes)('%s keeps painted glyph dimensions and relative port geometry invariant across captions (ISC-1, ISC-2, ISC-3)', (shapeId) => {
    const shape = shapeRegistry.get(shapeId)!;
    const [, , viewWidth, viewHeight] = shape.viewBox.split(/\s+/).map(Number);
    const expectedScale = Math.min(CANONICAL_GLYPH_BOX_0210.width / viewWidth!, CANONICAL_GLYPH_BOX_0210.height / viewHeight!);
    const expectedW = viewWidth! * expectedScale;
    const expectedH = viewHeight! * expectedScale;
    const anchors = ['N', 'S', 'E', 'W'] as const;
    const expectedRelativePorts = Object.fromEntries(anchors.map((anchor) => {
      const contour = stencilAnchorPoint028(shape, anchor);
      return [anchor, { x: contour.x * expectedW, y: contour.y * expectedH }];
    }));

    for (const sizingMode of ['adaptive', 'hybrid'] as const) {
      for (const { name, text } of captionCases) {
        const size = computeNodeSize({ text, shapeId, sizingMode });
        const frame = captionedStencilFrame029(shape, size.width, size.height);
        const fit = stencilFit028(shape, size.width, size.height);

        // ISC-1 / DRQ-10: glyph normalizes to the canonical 100x80 box and stays invariant across captions.
        expect(frame.scale, `${shapeId}/${sizingMode}/${name}`).toBeCloseTo(expectedScale, 8);
        expect(frame.glyph.width, `${shapeId}/${sizingMode}/${name}`).toBeCloseTo(expectedW, 8);
        expect(frame.glyph.height, `${shapeId}/${sizingMode}/${name}`).toBeCloseTo(expectedH, 8);
        expect(fit.fittedWidth).toBeCloseTo(expectedW, 8);
        expect(fit.fittedHeight).toBeCloseTo(expectedH, 8);

        // ISC-1: port coordinates relative to glyph origin stay identical.
        for (const anchor of anchors) {
          const contour = stencilAnchorPoint028(shape, anchor);
          const fitted = stencilFitPoint028(shape, contour, size.width, size.height);
          const relX = fitted.x * size.width - fit.offsetX;
          const relY = fitted.y * size.height - fit.offsetY;
          expect(relX, `${shapeId}/${anchor}/${name}:x`).toBeCloseTo(expectedRelativePorts[anchor]!.x, 8);
          expect(relY, `${shapeId}/${anchor}/${name}:y`).toBeCloseTo(expectedRelativePorts[anchor]!.y, 8);
        }

        // ISC-2 & ISC-3: sizing and painted layout agree on line breaks and full label coverage.
        const painted = layoutNodeLabel({ text, shapeId, sizingMode, dimensions: size });
        expect(painted.textBox).toEqual(size.textBox);
        expect(painted.textBox.y).toBeGreaterThanOrEqual(frame.glyph.y + frame.glyph.height + 4);
        expect(painted.textWidth, `${shapeId}/${name}:w`).toBeLessThanOrEqual(painted.textBox.width + 1e-6);
        expect(painted.textHeight, `${shapeId}/${name}:h`).toBeLessThanOrEqual(painted.textBox.height + 1e-6);
        if (text.length > 0) {
          expect(painted.lines.join(' ').replace(/\s+/g, ' '))
            .toBe(text.replace(/\s+/g, ' '));
        }
      }
    }
  });

  it.each(captionedShapes)('%s keeps uniform-mode glyphs invariant across mixed short and long labels (ISC-1)', (shapeId) => {
    const shape = shapeRegistry.get(shapeId)!;
    const [, , viewWidth, viewHeight] = shape.viewBox.split(/\s+/).map(Number);
    const expectedScale = Math.min(CANONICAL_GLYPH_BOX_0210.width / viewWidth!, CANONICAL_GLYPH_BOX_0210.height / viewHeight!);
    const expectedW = viewWidth! * expectedScale;
    const expectedH = viewHeight! * expectedScale;
    const shortSize = computeNodeSize({ text: 'Model', shapeId, sizingMode: 'adaptive' });
    const longSize = computeNodeSize({
      text: 'SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus',
      shapeId,
      sizingMode: 'adaptive',
    });
    const uniformSizes = new Map([[shapeId, {
      width: Math.max(shortSize.width, longSize.width),
      height: Math.max(shortSize.height, longSize.height),
    }]]);
    const uniformShort = computeNodeSize({ text: 'Model', shapeId, sizingMode: 'uniform', uniformSizes });
    const uniformLong = computeNodeSize({
      text: 'SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus',
      shapeId,
      sizingMode: 'uniform',
      uniformSizes,
    });
    const fitShort = stencilFit028(shape, uniformShort.width, uniformShort.height);
    const fitLong = stencilFit028(shape, uniformLong.width, uniformLong.height);
    expect(fitShort.fittedWidth).toBeCloseTo(expectedW, 8);
    expect(fitShort.fittedHeight).toBeCloseTo(expectedH, 8);
    expect(fitLong.fittedWidth).toBeCloseTo(expectedW, 8);
    expect(fitLong.fittedHeight).toBeCloseTo(expectedH, 8);
    expect(fitShort.offsetX).toBe(fitLong.offsetX);
    expect(fitShort.offsetY).toBe(fitLong.offsetY);
  });

  it('applies Option 2 notation-aware placement: uniform 100x80 captions in domain notations, interior text in flowchart/bpmn (DRQ-10)', () => {
    for (const shapeId of ['cylinder', 'diamond', 'hexagon', 'cloud', 'parallelogram'] as const) {
      expect(stencilCaptionHeight028(shapeId, { notationId: 'aiml' })).toBeGreaterThan(0);
      expect(stencilCaptionHeight028(shapeId, { notationId: 'architecture' })).toBeGreaterThan(0);
      expect(stencilCaptionHeight028(shapeId, { notationId: 'data-engineering' })).toBeGreaterThan(0);
      expect(stencilCaptionHeight028(shapeId, { notationId: 'flowchart' })).toBe(0);
      expect(stencilCaptionHeight028(shapeId, { notationId: 'bpmn' })).toBe(0);
      expect(stencilCaptionHeight028(shapeId)).toBe(0);
    }
    expect(stencilCaptionHeight028('cylinder', { symbolId: 'aiml-dataset' })).toBeGreaterThan(0);
    expect(stencilCaptionHeight028('diamond', { symbolId: 'aiml-evaluator' })).toBeGreaterThan(0);
    expect(stencilCaptionHeight028('hexagon', { symbolId: 'aiml-inference' })).toBeGreaterThan(0);
    expect(stencilCaptionHeight028('diamond', { symbolId: 'flowchart-decision' })).toBe(0);
    expect(stencilCaptionHeight028('rectangle', { notationId: 'aiml', symbolId: 'aiml-training' })).toBe(0);
  });

  it.each(captionedShapes)('%s preserves caption typography and wrap width when glyph size changes (ISC-5)', (shapeId) => {
    const shape = shapeRegistry.get(shapeId)!;
    const text = 'SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus';
    const baseSize = computeNodeSize({ text, shapeId, sizingMode: 'adaptive' });
    const enlargedGlyph = { width: 200, height: 180 };
    const resizedSize = computeNodeSize({ text, shapeId, sizingMode: 'adaptive', glyphSize: enlargedGlyph });
    const baseLabel = layoutNodeLabel({ text, shapeId, sizingMode: 'adaptive', dimensions: baseSize });
    const resizedLabel = layoutNodeLabel({
      text,
      shapeId,
      sizingMode: 'adaptive',
      dimensions: resizedSize,
      glyphSize: enlargedGlyph,
    });
    const resizedFrame = captionedStencilFrame029(shape, resizedSize.width, resizedSize.height, {
      glyphSize: enlargedGlyph,
      captionWrapWidth: 144,
    });
    expect(resizedFrame.glyph.width).toBeGreaterThan(shape.defaultSize.width);
    expect(resizedLabel.lines).toEqual(baseLabel.lines);
    expect(resizedLabel.textWidth).toBe(baseLabel.textWidth);
    expect(resizedLabel.textHeight).toBe(baseLabel.textHeight);
    expect(resizedLabel.lineHeightPx).toBe(baseLabel.lineHeightPx);
  });
});
