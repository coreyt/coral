/**
 * coral_convert tool
 *
 * Convert supported diagram input to JSON, preserve valid Coral source, or
 * write bounded Mermaid sequence messages, pre-message notes, and flat fragments as Coral.
 */

import { z } from "zod";
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { formatDiagnostics, parseAs } from './diagnostics.js';
import {
  detectFormat as detectSharedFormat,
  canonicalSimpleMermaidSequence028,
  writeSupplementalMermaidSequence028,
  type GraphIR,
  type Diagnostic,
} from "@coral-viz/language";
import { graphIrExportRefusal029, printInstalledSource028, successorCoreValidationInput029,
  verifyPortableSuccessorSource028, type SuccessorGraphIr029, type SuccessorSourceGraph028 } from '@coral-viz/render';

export const convertTool = {
  name: "coral_convert",
  description:
    "Convert Mermaid, Graphviz DOT, PlantUML, or Coral to JSON. Saved @diagram Coral emits a GraphIR 4 candidate; Coral identity conversion preserves source. Bounded Mermaid sequence messages, pre-message participant notes, and successive flat alt, loop, or opt fragments can be written as Coral.",
  inputSchema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "The diagram content to convert",
      },
      from: {
        type: "string",
        enum: ["mermaid", "dot", "plantuml", "coral", "auto"],
        description: "Source format (use 'auto' to detect)",
        default: "auto",
      },
      to: {
        type: "string",
        enum: ["coral", "json"],
        description: "Target format",
        default: "coral",
      },
      strict: {
        type: "boolean",
        description:
          "Fail the conversion when anything is lost, rather than reporting it and continuing",
        default: false,
      },
    },
    required: ["content"],
  },
};

const ConvertArgsSchema = z.object({
  content: z.string(),
  from: z.enum(["mermaid", "dot", "plantuml", "coral", "auto"]).default("auto"),
  to: z.enum(["coral", "json"]).default("coral"),
  strict: z.boolean().default(false),
});


/** Detect the source format with the detector the editor also uses (R-064 AC-1). */
export function detectFormat(source: string): "mermaid" | "dot" | "plantuml" | "coral" {
  const { format } = detectSharedFormat(source);
  return format === "mermaid" || format === "dot" || format === "plantuml" ? format : "coral";
}

/** Human-readable notes, so a lossy conversion says what it lost. */
function formatNotes(result: { diagnostics: Diagnostic[] }): string {
  const notes = result.diagnostics.filter((d) => d.severity !== "error");
  if (notes.length === 0) return "";

  return `\n\n## Conversion notes\n${formatDiagnostics(notes)}`;
}

/** The source/U1 check and the exact installed successor schema are separate gates. */
export function verifySuccessorCandidateForConversion028(graph: SuccessorSourceGraph028): {
  valid: boolean;
  diagnostics: Diagnostic[];
  verification?: { scope: string; complete: boolean };
  /** The GraphIR 4 candidate form, present when it verified. */
  graph?: SuccessorGraphIr029;
} {
  try {
    const core = successorCoreValidationInput029(graph, { limits: true });
    const result = validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options);
    const verification = { scope: result.verification.scope, complete: result.verification.complete };
    if (result.valid && verification.scope === 'full' && verification.complete)
      return { valid: true, diagnostics: [], verification, graph: core.graph };
    const findings = [...result.errors, ...result.verification.obligations];
    const diagnostics: Diagnostic[] = findings.map(({ code, path, message }) => ({
      severity: 'error', code: `GRAPHIR.${code}`, message: `${message} at ${path}`,
    }));
    if (!diagnostics.length) diagnostics.push({ severity: 'error',
      code: 'mcp.coral028.export.unverified',
      message: 'The installed GraphIR successor did not complete full schema and catalog verification.' });
    return { valid: false, diagnostics, verification };
  } catch (cause) {
    return { valid: false, diagnostics: [{ severity: 'error',
      code: 'mcp.coral028.export.unverified',
      message: cause instanceof Error ? cause.message : 'GraphIR successor verification failed.',
    }] };
  }
}

export async function handleConvert(args: unknown) {
  const { content, from, to, strict } = ConvertArgsSchema.parse(args);

  const detected = from === "auto" ? detectSharedFormat(content) : null;
  if (detected && detected.format === null) {
    const diagnostic = {
      severity: "error" as const, code: "mcp.input.unrecognized",
      message: `The input matches no supported format; expected one of: ${detected.candidates.join(", ")}.`,
    };
    return {
      content: [{ type: "text" as const, text: `Could not convert: ${formatDiagnostics([diagnostic])}` }],
      structuredContent: { from: "unrecognized", to, nodeCount: 0, diagnostics: [diagnostic] },
      isError: true as const,
    };
  }
  if (detected && (detected.format === "graphir-json" || detected.format === "coral-document")) {
    const diagnostic = {
      severity: "error" as const,
      code: "mcp.input.unsupported-format",
      message: `coral_convert does not accept ${detected.format} input; pass Coral, Mermaid, DOT, or PlantUML text.`,
    };
    return {
      content: [{ type: "text" as const, text: `Could not convert: ${formatDiagnostics([diagnostic])}` }],
      structuredContent: { from: detected.format, to, nodeCount: 0, diagnostics: [diagnostic] },
      isError: true as const,
    };
  }
  const sourceFormat = from === "auto" ? detectFormat(content) : from;
  // Coral conversion has one installed, source-owned meaning. A retired or
  // missing header must fail here before any importer can produce GraphIR 3.
  if (sourceFormat === 'coral') {
    const verified = verifyPortableSuccessorSource028(content);
    if (!verified.graph || verified.diagnostics.length) {
      const diagnostics: Diagnostic[] = verified.diagnostics.map((item) => ({
        severity: 'error', code: item.code, message: item.message,
        ...(item.range ? { range: item.range, position: item.range.start } : {}),
        ...(item.related?.length ? { related: item.related.map((related) => ({
          message: related.message, range: related.range,
          position: related.range.start,
        })) } : {}),
      }));
      return { content: [{ type: 'text' as const,
        text: `Could not convert saved Coral source to ${to}: ${formatDiagnostics(diagnostics)}` }],
      structuredContent: { from: sourceFormat, to, nodeCount: 0, edgeCount: 0, diagnostics },
      isError: true as const };
    }
    const graph = verified.graph;
    if (to === 'coral') return { content: [{ type: 'text' as const,
      text: `Converted from coral to coral: ${graph.nodes.length} nodes, ${graph.edges.length} edges\n\n${content}` }],
    structuredContent: { from: sourceFormat, to, nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length, diagnostics: [] as Diagnostic[], candidateVersion: '4.0.0' } };
    const refusals: Diagnostic[] = graphIrExportRefusal029(graph, content).map(({ related, ...refusal }) => ({
      ...refusal, ...(refusal.range ? { position: refusal.range.start } : {}),
      ...(related ? { related: related.map((item) => ({ ...item, position: item.range.start })) } : {}) }));
    if (refusals.length) return { content: [{ type: 'text' as const,
      text: `Could not convert saved Coral source to json: ${formatDiagnostics(refusals)}` }],
    structuredContent: { from: sourceFormat, to, nodeCount: 0, edgeCount: 0, diagnostics: refusals },
    isError: true as const };
    const model = verifySuccessorCandidateForConversion028(graph);
    if (!model.valid) return { content: [{ type: 'text' as const,
      text: `Could not verify saved Coral source as GraphIR 4 candidate JSON: ${formatDiagnostics(model.diagnostics)}` }],
    structuredContent: { from: sourceFormat, to, nodeCount: 0, edgeCount: 0,
      diagnostics: model.diagnostics }, isError: true as const };
    return { content: [{ type: 'text' as const,
      text: `Converted from coral to json: ${graph.nodes.length} nodes, ${graph.edges.length} edges` +
        ` (GraphIR 4 candidate; exact installed schema and catalog verified)\n\n${JSON.stringify(model.graph, null, 2)}` }],
    structuredContent: { from: sourceFormat, to, nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length, diagnostics: [] as Diagnostic[], candidateVersion: '4.0.0',
      modelVerification: model.verification } };
  }
  const result = parseAs(sourceFormat, content);

  if (!result.graph || result.graph.nodes.length === 0 || !result.success) {
    const why = result.diagnostics.length ? formatDiagnostics(result.diagnostics) : "no nodes were produced";
    return {
      content: [
        {
          type: "text",
          text: `Could not convert from ${sourceFormat}: ${why}`,
        },
      ],
      structuredContent: {
        from: sourceFormat,
        to,
        nodeCount: result.graph?.nodes.length ?? 0,
        edgeCount: result.graph?.edges.length ?? 0,
        diagnostics: result.diagnostics,
      },
      isError: true,
    };
  }

  const graph: GraphIR = result.graph;
  if (to === "coral") {
    if (sourceFormat === 'mermaid' && graph.metadata?.notation === 'uml-sequence') {
      const canonical = result.diagnostics.length === 0 ? canonicalSimpleMermaidSequence028(graph) : undefined;
      const supplemental = result.diagnostics.length === 0 ? writeSupplementalMermaidSequence028(graph) : undefined;
      const written = canonical ? printInstalledSource028(canonical, 'uml-sequence') :
        supplemental ? { text: supplemental, diagnostics: [] as Diagnostic[] } : undefined;
      const verified = written?.text ? verifyPortableSuccessorSource028(written.text) : undefined;
      const model = verified?.graph && verified.diagnostics.length === 0
        ? (() => { const core = successorCoreValidationInput029(verified.graph!);
          return validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options); })()
        : undefined;
      if (written?.text && verified?.graph && verified.diagnostics.length === 0 && model?.valid &&
          model.verification.complete && model.verification.scope === 'full') {
        return { content: [{ type: 'text' as const,
          text: `Converted from mermaid to coral: ${graph.nodes.length} nodes, ${graph.edges.length} edges\n\n${written.text}` }],
        structuredContent: { from: sourceFormat, to, nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length, diagnostics: [] as Diagnostic[], candidateVersion: '4.0.0' },
        isError: false as const };
      }
      const unverified = model && (!model.valid || !model.verification.complete || model.verification.scope !== 'full');
      const diagnostic: Diagnostic = unverified
        ? { severity: 'error', code: 'mcp.coral028.import.unverified',
          message: [...model.errors, ...model.warnings, ...model.verification.obligations]
            .map(({ code, path }) => `${code} at ${path}`).join('; ') ||
            'The installed GraphIR successor did not verify the imported source.' }
        : { severity: 'error', code: 'mcp.coral028.import.unsupported',
          message: result.diagnostics.length
            ? 'The Mermaid import has unclassified losses; no Coral source was written.'
            : 'This Mermaid sequence is outside the verified message, pre-message note, or flat alt/loop/opt fragment subset.' };
      const diagnostics = [...result.diagnostics, ...(written?.diagnostics ?? []),
        ...(verified?.diagnostics ?? []).map((item): Diagnostic => ({ severity: 'error',
          code: item.code, message: item.message })), diagnostic];
      return { content: [{ type: 'text' as const,
        text: `Could not convert to Coral: ${formatDiagnostics(diagnostics)}` }],
      structuredContent: { from: sourceFormat, to, nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length, diagnostics }, isError: true as const };
    }
    const diagnostic = {
      severity: "error" as const,
      code: "mcp.coral028.writer.unavailable",
      message: "Imported graphs cannot yet be printed as Coral 0.2.8 source without losing unsupported fields.",
    };
    const diagnostics = [...result.diagnostics, diagnostic];
    return {
      content: [{ type: "text" as const, text: `Could not convert to Coral: ${formatDiagnostics(diagnostics)}` }],
      structuredContent: { from: sourceFormat, to, nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length, diagnostics },
      isError: true as const,
    };
  }
  const diagnostics = [...result.diagnostics];
  const combined = { diagnostics };
  const lossy = diagnostics.some((d) => d.severity !== "error");

  if (strict && lossy) {
    return {
      content: [
        {
          type: "text",
          text:
            `Refusing a lossy conversion from ${sourceFormat} in strict mode.` +
            formatNotes(combined),
        },
      ],
      structuredContent: {
        from: sourceFormat,
        to,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        diagnostics,
      },
      isError: true,
    };
  }

  const output = to === "json" ? JSON.stringify(graph, null, 2) : content;
  const summary =
    `Converted from ${sourceFormat} to ${to}: ` +
    `${graph.nodes.length} nodes, ${graph.edges.length} edges` +
    (lossy ? `, ${diagnostics.filter((d) => d.severity !== "error").length} notes` : "");

  return {
    content: [{ type: "text", text: `${summary}\n\n${output}${formatNotes(combined)}` }],
    structuredContent: {
      from: sourceFormat,
      to,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      diagnostics,
    },
    isError: !result.success,
  };
}
