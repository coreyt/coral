/**
 * coral_convert tool
 *
 * Convert supported diagram input to JSON, preserve valid Coral source, or
 * transpile Top-5 Mermaid diagrams (flowchart/graph, sequenceDiagram,
 * classDiagram, erDiagram, stateDiagram) to self-verified Coral source.
 */

import { z } from "zod";
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { formatDiagnostics, parseAs } from './diagnostics.js';
import {
  detectFormat as detectSharedFormat,
  type GraphIR,
  type Diagnostic,
} from "@coral-viz/language";
import {
  graphIrExportRefusal029,
  projectInstalledSourceToSuccessor028,
  successorCoreValidationInput029,
  transpileAndVerifyMermaidToCoral,
  verifyPortableSuccessorSource028,
  type SuccessorGraphIr029,
  type SuccessorSourceGraph028,
  type SuccessorSourceNode028,
} from '@coral-viz/render';

export const convertTool = {
  name: "coral_convert",
  description:
    "Convert Mermaid, Graphviz DOT, PlantUML, or Coral to JSON, or deterministically transpile Top-5 Mermaid diagrams (flowchart/graph, sequenceDiagram, classDiagram, erDiagram, stateDiagram/stateDiagram-v2) to self-verified Coral saved source. Saved @diagram Coral emits a GraphIR 4 candidate; Coral identity conversion preserves source.",
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
      flowchartTarget: {
        type: "string",
        enum: ["flowchart", "block", "architecture"],
        description:
          "Target Coral notation when transpiling Mermaid flowcharts to Coral (default: 'flowchart')",
        default: "flowchart",
      },
      edgeStyleMode: {
        type: "string",
        enum: ["visual-safe", "portable"],
        description:
          "Edge style emission policy when transpiling Mermaid to Coral: 'visual-safe' guarantees visual renderability; 'portable' preserves portable Coral 0.2.14 edge styles (default: 'visual-safe')",
        default: "visual-safe",
      },
      stateTargetEdition: {
        type: "string",
        enum: ["0.2.17", "0.2.8"],
        description:
          "Target Coral edition when transpiling Mermaid state diagrams: '0.2.17' (visual & hierarchical) or '0.2.8' (legacy flat character-compatible) (default: '0.2.17')",
        default: "0.2.17",
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
  flowchartTarget: z.enum(["flowchart", "block", "architecture"]).default("flowchart"),
  edgeStyleMode: z.enum(["visual-safe", "portable"]).default("visual-safe"),
  stateTargetEdition: z.enum(["0.2.17", "0.2.8"]).default("0.2.17"),
});

function countSuccessorNodes(nodes: readonly SuccessorSourceNode028[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children?.length) count += countSuccessorNodes(node.children);
  }
  return count;
}


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
  const { content, from, to, strict, flowchartTarget, edgeStyleMode, stateTargetEdition } = ConvertArgsSchema.parse(args);

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
  if (sourceFormat === 'mermaid' && to === 'coral') {
    const transpiled = transpileAndVerifyMermaidToCoral(content, {
      mode: strict ? 'strict' : 'best-effort',
      flowchartTarget,
      edgeStyleMode,
      stateTargetEdition,
    });
    const diagnostics: Diagnostic[] = transpiled.diagnostics.map((item) => ({
      severity: item.severity,
      code: item.code,
      message: item.message,
      ...(item.range ? { range: item.range, position: item.range.start } : {}),
    }));
    const sharedStructured = {
      from: sourceFormat,
      to,
      diagnostics,
      candidateVersion: '4.0.0' as const,
      detectedKind: transpiled.detectedKind,
      targetNotation: transpiled.targetNotation,
      targetEdition: transpiled.targetEdition,
      visualRenderable: transpiled.visualRenderable,
      ...(transpiled.characterRenderable !== undefined
        ? { characterRenderable: transpiled.characterRenderable }
        : {}),
      lossSummary: transpiled.lossSummary,
      idMap: transpiled.idMap,
    };
    if (!transpiled.ok || !transpiled.coral) {
      return {
        content: [{
          type: 'text' as const,
          text: `Could not convert from mermaid to coral: ${formatDiagnostics(diagnostics)}`,
        }],
        structuredContent: {
          ...sharedStructured,
          nodeCount: 0,
          edgeCount: 0,
        },
        isError: true as const,
      };
    }
    const projected = projectInstalledSourceToSuccessor028(transpiled.coral);
    const nodeCount = projected.graph ? countSuccessorNodes(projected.graph.nodes) : 0;
    const edgeCount = projected.graph?.edges.length ?? 0;
    const noteCount = diagnostics.filter((d) => d.severity !== 'error').length;
    const summary =
      `Converted from mermaid to coral: ${nodeCount} nodes, ${edgeCount} edges` +
      (noteCount > 0 ? `, ${noteCount} notes` : '');
    return {
      content: [{
        type: 'text' as const,
        text: `${summary}\n\n${transpiled.coral}${formatNotes({ diagnostics })}`,
      }],
      structuredContent: {
        ...sharedStructured,
        nodeCount,
        edgeCount,
      },
      isError: false as const,
    };
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
