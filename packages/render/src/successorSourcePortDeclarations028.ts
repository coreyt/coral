import type { CandidateNodeSyntax, CandidatePortSyntax } from '@coral-viz/language';
import type { DiagnosticRange } from '@coral-viz/language';
import type { NodeInterpretation028 } from './interpretation028.js';

export interface SourcePortDeclarationDiagnostic028 {
  code: string;
  message: string;
  subject: { kind: 'node'; id: string };
  range?: DiagnosticRange;
}

/** An explicit catalog choice is an author-visible capability error, not a
 * renderer fallback. Pin it to the exact bracket value in saved source. */
export function sourceNodeCatalogChoiceDiagnostics028(
  declarations: readonly CandidateNodeSyntax[],
  interpretations: ReadonlyMap<string, NodeInterpretation028>,
): SourcePortDeclarationDiagnostic028[] {
  return declarations.flatMap((declaration) => {
    const nodeId = declaration.qualifiedId ?? declaration.id.value;
    const interpretation = interpretations.get(nodeId);
    if (!interpretation) return [];
    return interpretation.diagnostics.flatMap((diagnostic) => {
      const token = diagnostic.code === 'coral.symbol.unknown' ? declaration.symbol
        : diagnostic.code === 'coral.variant.unknown' ? declaration.variant : undefined;
      return token ? [{ code: diagnostic.code, message: diagnostic.message,
        subject: { kind: 'node' as const, id: nodeId }, range: token.range }] : [];
    });
  });
}

/** Tie U1 resolver failures to the author's port token, never a derived
 * GraphIR 3 geometric port or a guessed node location. */
export function sourcePortDeclarationDiagnostics028(
  declarations: readonly CandidatePortSyntax[],
  interpretations: ReadonlyMap<string, NodeInterpretation028>,
): SourcePortDeclarationDiagnostic028[] {
  const authored = new Map<string, CandidatePortSyntax>();
  for (const declaration of declarations) {
    authored.set(`${declaration.ownerQualifiedId ?? declaration.owner.value}\0${declaration.id.value}`, declaration);
  }
  const findings: SourcePortDeclarationDiagnostic028[] = [];
  for (const [nodeId, interpretation] of interpretations) {
    for (const diagnostic of interpretation.diagnostics) {
      if (!diagnostic.code.startsWith('coral.port.')) continue;
      const declaration = diagnostic.portId
        ? authored.get(`${nodeId}\0${diagnostic.portId}`) : undefined;
      const token = diagnostic.code.startsWith('coral.port.anchor.')
        ? declaration?.anchor : declaration?.id;
      findings.push({ code: diagnostic.code, message: diagnostic.message,
        subject: { kind: 'node', id: nodeId },
        ...(token ? { range: token.range } : {}),
      });
    }
  }
  return findings;
}

/** The successor may store these ports, but the current sequence scene has no
 * semantic-port attachment path. Keep source meaning while refusing display. */
export function sequenceSourcePortCapabilityDiagnostics028(
  declarations: readonly CandidatePortSyntax[],
): SourcePortDeclarationDiagnostic028[] {
  return declarations.map((declaration) => ({
    code: 'render.capability.sequence-semantic-port',
    message: `Sequence participant port ${declaration.id.value} is preserved in source meaning, but the sequence scene cannot attach it yet`,
    subject: { kind: 'node', id: declaration.ownerQualifiedId ?? declaration.owner.value },
    range: declaration.id.range,
  }));
}
