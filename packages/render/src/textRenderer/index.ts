import type { GraphIR } from '@graph-ir/core';
import { effectiveGraphNotationId028 } from '../graphNotation028.js';
import { notationEdge, notationNode, textNotations } from './notations.js';
import { sequenceScene } from './sequenceText.js';
import { parseInstalledDocument028, type InstalledDocument028 } from '../installedDocument028.js';
import { settings } from './format.js';
import { makeScene } from './textScene.js';
import { compactLayout } from './cellLayout.js';
import { paginate } from './paginate.js';
import { verifyTextOutput } from './verifyTextOutput.js';
import { TextRenderError, type RenderTextOptions, type RenderTextResult, type TextDiagnostic } from './types.js';

export { TextRenderError } from './types.js';
export type { ContinuationLink, MonoTrueCapability, RenderTextOptions, RenderTextResult, TextCharset,
  TextCommentStyle, TextDensity, TextDiagnostic, TextPagePreset, TextProfile } from './types.js';

async function render(graph: GraphIR, options: RenderTextOptions, diagnostics: TextDiagnostic[], doc?: InstalledDocument028): Promise<RenderTextResult> {
  const cfg = settings(options, diagnostics);
  const notation = effectiveGraphNotationId028(graph) ?? '';
  if (!textNotations.includes(notation))
    throw new TextRenderError('text.notation.unsupported', `No text adapter for ${notation || 'unspecified notation'}.`);
  const scene = notation === 'uml-sequence' ? sequenceScene(graph, cfg, doc) :
    makeScene(graph, cfg, diagnostics, (node, label) => notationNode(notation, node, label, cfg), notationEdge);
  const { rows, links } = paginate(diagnostics.some(d => d.code === 'text.geometry.ignored') ? scene : await compactLayout(scene, cfg), cfg);
  if (options.strict && diagnostics.length) throw new TextRenderError(diagnostics[0].code, diagnostics[0].message, diagnostics[0].path);
  return { ...verifyTextOutput(rows, links, cfg), profile: cfg.profile, charset: cfg.charset, pageCount: rows.length,
    continuationLinks: links, diagnostics };
}

export async function renderTextGraph(graph: GraphIR, options: RenderTextOptions = {}): Promise<RenderTextResult> {
  return render(graph, options, []);
}

export async function renderText(source: string, options: RenderTextOptions = {}): Promise<RenderTextResult> {
  const document = parseInstalledDocument028(source);
  const issues = [...document.header.diagnostics, ...document.syntax.diagnostics];
  const error = issues.find(d => !('severity' in d) || d.severity === 'error');
  if (error || !document.header.header) throw new TextRenderError(error?.code ?? 'text.source.invalid', error?.message ?? 'Invalid source header.');
  const diagnostics: TextDiagnostic[] = issues.map(d => ({ code: d.code, message: d.message, severity: 'warning' }));
  if (document.definitions?.length) diagnostics.push({ code: 'text.artwork.ignored', severity: 'info', message: 'Custom symbols use labelled boxes.' });
  for (const s of document.syntax.statements) {
    if ((s.kind === 'node' || s.kind === 'edge') && s.style) diagnostics.push({ code: 'text.style.ignored', severity: 'info',
      message: 'Omitted authored visual style.', path: s.qualifiedId });
    if (s.kind === 'layout' || s.kind === 'route' || s.kind === 'constraint' || s.kind === 'arrangement')
      diagnostics.push({ code: 'text.geometry.ignored', severity: 'info', message: 'Omitted authored pixel layout.' });
  }
  return render(document.syntax.graph, options, diagnostics, document);
}
