/**
 * Prompt Composition for LLM Diagram Generation
 *
 * Builds system and user prompts for Coral DSL generation.
 * Part of issue #46: LLM-powered diagram generation.
 */

import type { GenerateMode, GenerateRequest, OutputFormat } from './types';
import type { AppliedFix } from '@coral-viz/language';
import { composeNotationReference } from './notationRef';

/**
 * Coral DSL grammar reference, always included in the system prompt.
 * Documents base syntax only; notation-specific types are injected separately.
 */
export const CORAL_GRAMMAR_REFERENCE = `# Coral 0.2.8 saved source

Start with @diagram followed by one installed profile name, such as @diagram flowchart. Use the active notation named below when one is supplied. Write plain Coral source only.

## Nodes and identity
One declaration per line: api service as "API".
The ID comes first and is authored explicitly. It is never derived from a label. The optional form api = service as "API" has the same meaning.
Use as only for a paired-quoted rendered label. Omit it for the ID as the visible label.
Node fields go before the label. In architecture, api service [variant: "api"] as "API" selects an installed variant.
Use a keyed symbol only when the active notation reference names that installed symbol: gateway parallelGateway [symbol: "bpmn-gateway-parallel"] as "Split".
A group uses a block; child IDs are qualified by the group, and local references can omit its prefix.

## Edges
Write endpoints in source order: api -> store.
A plain connector is valid in every diagram profile. Its profile-specific relation meaning comes from that profile.
Optional edge ID: reads = api -> store.
A rendered label uses as "text": api -> store as "reads".
A relation uses one leading bare term or one keyed type: api -> store [type: data].
A dashed connector uses a period in the second shaft position: api -.-> store.
Do not use bracket labels such as [label: "text"] together with as "text".
Written endpoints remain fixed even when an arrow points backward.

## Arrangement and comments
Use arrange row: api, store or arrange column: api, store for a layout hint.
Comments start with // and remain authored source.

## Rules
Preserve existing IDs, labels, comments, source order, and unaffected lines during an edit.
Do not invent data clauses, label-derived IDs, kind-first declarations, or compatibility syntax.
If a requested feature cannot be written in the approved grammar, explain the limitation instead of silently changing meaning.

## Example
~~~coral
@diagram flowchart
start terminal as "Start"
review process as "Review order"
done terminal as "Done"
start -> review
review -> done as "approved"
~~~
`;

function coralGrammarFor(notationId?: string): string {
  if (!notationId || notationId === 'flowchart') return CORAL_GRAMMAR_REFERENCE;
  const exampleStart = CORAL_GRAMMAR_REFERENCE.indexOf('\n## Example\n');
  return CORAL_GRAMMAR_REFERENCE.slice(0, exampleStart)
    .replace('such as @diagram flowchart', `such as @diagram ${notationId}`);
}

export const MERMAID_GRAMMAR_REFERENCE = `# Mermaid Flowchart Specification

Begin with \`flowchart TD\`. Declare nodes as \`id[Label]\`, database nodes as
\`id[(Label)]\`, and decisions as \`id{Label}\`. Connect nodes with \`-->\` or
\`-.->\`; an edge label goes between vertical bars, as in
\`api -->|writes| db\`.

Use identifiers containing only letters, digits, and underscores, beginning
with a letter or underscore. Output raw Mermaid text with no Markdown fence or
explanation. Mermaid flowchart text cannot encode fixed pixel positions,
pinning, or edge waypoints.`;

/**
 * Compose the system prompt based on generation mode.
 */
export function composeSystemPrompt(
  mode: GenerateMode,
  existingDsl?: string,
  notationId?: string,
  format: OutputFormat = 'coral',
): string {
  const sections: string[] = [];

  const formatName = format === 'mermaid' ? 'Mermaid flowchart syntax' : 'Coral DSL';
  sections.push(format === 'mermaid' ? MERMAID_GRAMMAR_REFERENCE : coralGrammarFor(notationId));

  // Include notation-specific reference if available
  if (notationId && format === 'coral') {
    const notationRef = composeNotationReference(notationId);
    if (notationRef) {
      sections.push(notationRef);
    }
  }

  // Mode-specific instructions
  if (mode === 'generate') {
    sections.push(`## Instructions

You generate ${formatName} diagrams from natural language descriptions.

Output ONLY valid ${formatName}. No markdown, no code blocks, no explanations.
Output raw plain text without any code fences or surrounding markup.

Use appropriate node types for the described system components.
Create meaningful edge labels that describe relationships.
Add comments to organize sections of the diagram.`);
  } else {
    sections.push(`## Instructions

You adjust or modify an existing ${formatName} diagram based on the user's request.

CRITICAL RULES:
1. Do NOT add nodes that the user did not ask for.
2. Do NOT remove nodes that the user did not ask to remove.
3. Do NOT rename nodes that the user did not ask to rename.
4. Do NOT add or remove edges that the user did not ask for.
5. Copy every unchanged node and edge declaration EXACTLY as-is.
6. Only modify the specific things the user requested.

Output ONLY the complete updated ${formatName}. No markdown, no code blocks, no explanations.
Output raw plain text without any code fences or surrounding markup.

## Existing Diagram

${existingDsl}`);
  }

  return sections.join('\n\n');
}

/**
 * Compose the system prompt for help/explanation requests.
 * Returns a natural language explanation — no DSL output.
 */
export function composeHelpSystemPrompt(
  existingDsl?: string,
  diagnostics?: string,
  format: OutputFormat = 'coral',
): string {
  const sections: string[] = [];

  const formatName = format === 'mermaid' ? 'Mermaid' : 'Coral DSL';
  sections.push(`You are a diagramming assistant for Coral, a visual architecture tool.
Explain the issue concisely and clearly. Do NOT output any ${formatName} code.
Reference the specific warning or error if one is provided.`);

  if (existingDsl) {
    sections.push(`## Current Diagram

${existingDsl}`);
  }

  if (diagnostics) {
    sections.push(`## Active Diagnostics

${diagnostics}`);
  }

  return sections.join('\n\n');
}

/**
 * Compose the system prompt for fix requests.
 * Returns an explanation followed by corrected DSL in a \`\`\`coral code fence.
 */
export function composeFixSystemPrompt(
  existingDsl: string,
  diagnostics: string,
  notationId?: string,
  format: OutputFormat = 'coral',
  suggestion?: { proposedDsl: string; fixes: AppliedFix[] },
): string {
  const sections: string[] = [];

  const formatName = format === 'mermaid' ? 'Mermaid flowchart syntax' : 'Coral DSL';
  const fence = format === 'mermaid' ? 'mermaid' : 'coral';
  sections.push(format === 'mermaid' ? MERMAID_GRAMMAR_REFERENCE : coralGrammarFor(notationId));

  // Include notation-specific reference if available
  if (notationId && format === 'coral') {
    const notationRef = composeNotationReference(notationId);
    if (notationRef) {
      sections.push(notationRef);
    }
  }

  sections.push(`## Instructions

You are a diagramming assistant. Fix the issues described in the diagnostics below.

1. Explain what's wrong in 1-2 sentences.
2. Then output the complete corrected ${formatName} in a \`\`\`${fence} code fence.

Do NOT remove nodes or edges unless necessary to resolve the diagnostic issue.
Preserve the existing structure as much as possible.

## Existing Diagram (authoritative captured source)

${existingDsl}

## Active Diagnostics (from the captured source)

${diagnostics}`);

  if (suggestion) {
    const provenance = suggestion.fixes
      .map((fix) => `- ${fix.defectType} at line ${fix.location.line}, column ${fix.location.column}: ${fix.description}`)
      .join('\n');
    sections.push(`## Optional Deterministic Repair Suggestion (not applied)

This proposal is advisory. The captured source above remains authoritative,
and only your final corrected candidate can be applied.

### Proposed Coral DSL

${suggestion.proposedDsl}

### Deterministic repair provenance

${provenance}`);
  }

  return sections.join('\n\n');
}

/**
 * Compose the user prompt from natural language input.
 */
export function composeUserPrompt(userInput: string): string {
  return userInput;
}


/**
 * Describe where the nodes currently are, so the model can act on spatial
 * instructions ("below the gateway", "to the left of the queue").
 *
 * Positions were stripped before the prompt entirely, so any request phrased
 * spatially was answered blind.
 */
export function composeLayoutContext(
  layout: GenerateRequest['layout'],
  format: OutputFormat = 'coral',
): string {
  if (!layout || (layout.nodes.length === 0 && layout.edges.length === 0)) return '';

  const rows = layout.nodes
    .map((n) => `- ${n.id}${n.label ? ` ("${n.label}")` : ''} at (${Math.round(n.x)}, ${Math.round(n.y)})${n.pinned ? ' pinned' : ''}`)
    .join('\n');
  const routes = layout.edges
    .map((edge) => {
      const points = edge.routingPoints?.map((p) => `(${Math.round(p.x)}, ${Math.round(p.y)})`).join(' via ');
      return `- ${edge.id}: ${edge.source} -> ${edge.target}${points ? ` via ${points}` : ''}`;
    })
    .join('\n');

  return (
    '\n\nCurrent positions, in pixels, with x increasing to the right and y ' +
    'increasing downward:\n' +
    rows +
    (routes ? '\n\nCurrent edge routes:\n' + routes : '') +
    (format === 'coral'
      ? '\n\nUse these positions to understand the request. Coral source can express ' +
        'a simple arrangement as `arrange row: api, cache` or ' +
        '`arrange column: api, cache` when that matches the request. ' +
        'Do not invent coordinates or relative-position shorthand. ' +
        'The editor handles exact geometry through a separate verified plan.'
      : '\n\nUse these coordinates to interpret spatial requests, but keep the output ' +
        'valid Mermaid flowchart text. Mermaid cannot encode fixed pixel positions, ' +
        'pinning, or edge waypoints; preserve node and edge identity instead.')
  );
}
