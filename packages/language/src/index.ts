/**
 * @coral/language - Coral DSL parser and printer
 */

// Parser
export { parse, parseAsync, labelToId } from './parser/index.js';

// Printer
export { print, prettyPrint, type PrintOptions, type FormatOptions } from './printer/index.js';

// Format Importers
export { parseMermaid, type MermaidParseOptions } from './formats/mermaid.js';
export { parseDot, type DotParseOptions } from './formats/dot.js';

// Types
export type {
  GraphIR,
  GraphNode,
  GraphEdge,
  Port,
  PortSide,
  Dimensions,
  Position,
  EdgeStyle,
  LayoutOptions,
  SpacingOptions,
  NodeLayoutOptions,
  GraphMetadata,
  SourceInfo,
  SourceRange,
  Comment,
  ParseOptions,
  ParseResult,
  ParseError,
} from './types.js';
