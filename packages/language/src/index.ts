/**
 * @coral-viz/language - Coral DSL parser and printer
 */

// Saved-source parser. The older GraphIR 3 text reader is confined to the
// explicit parser-only entry for derived interchange paths.
export { labelToId } from './parser/index.js';
export { CORAL_LANGUAGE_VERSION } from './spellings.js';
export { parseDocument028 as parse, parseDocument028, formatDocument028 } from './parser/document028.js';
export { setCandidateLabel } from './parser/candidate028.js';
export { isDashedOpenArrow028 } from './parser/connector028.js';
export type { CandidateEdgeSyntax, CandidateFragmentSyntax, CandidateNodeSyntax,
  CandidateParticipantGroupSyntax,
  CandidatePortSyntax, CandidateSequenceItemSyntax } from './parser/candidate028.js';
export { editionAdmitsUserSymbols029, parseHeader028, pinHeaderEdition029,
  prepareHeaderForSave028 } from './parser/header028.js';
export { parseSymbolDefinitions029 } from './parser/symbolDefinitions029.js';
export type {
  ArtworkAdmissionInput029, SymbolDefinitionCheckLines029, SymbolDefinitionOptions029, SymbolDefinitionResult029,
  UserSymbolAnchor, UserSymbolArtwork, UserSymbolDefinition, UserSymbolLabelPlacement,
  UserSymbolOutline, UserSymbolPort, UserSymbolSide, UserSymbolTint,
} from './parser/symbolDefinitions029.js';
export { HEADER_MANIFEST_028 } from './parser/header-manifest028.js';
export type {
  HeaderCatalogIdentity028, HeaderDiagnostic028, HeaderEdition028,
  HeaderManifest028, HeaderParseResult028, HeaderProfileIdentity028,
  HeaderRuntime028, HeaderSaveResult028, ResolvedHeader028,
  HeaderOffsetSpan029, HeaderPinResult029, SymbolDefinitionRegion029, SymbolRawBlock029,
} from './parser/header028.js';
export { unescapeString } from './strings.js';
export {
  formatUmlMember,
  parseCoralUmlMember,
  type UmlMember,
  type UmlMemberKind,
} from './uml.js';
export {
  UML_SEQUENCE_NOTATION,
  UML_SEQUENCE_PROFILE,
  SEQUENCE_MESSAGE_TOKENS,
  deriveSequenceCore,
  finalizeSequenceInteraction,
  isSequenceGraph,
  sortCanonicalInteraction,
  guardId,
  operandId,
  sequenceMessageKind,
  sequenceMessageToken,
  validateSequenceInteraction,
  type SequenceIssue,
  type SequenceEntityKind,
  type SequenceMessageToken,
} from './sequence.js';

// Printer
export { print, printWithDiagnostics, prettyPrint, type PrintOptions, type PrintResult, type FormatOptions } from './printer/index.js';

// Format Importers
export { parseMermaid, type MermaidParseOptions } from './formats/mermaid.js';
export { canonicalSimpleMermaidSequence028 } from './formats/mermaid-sequence-028.js';
export { writeSupplementalMermaidSequence028 } from './formats/mermaid-sequence-supplemental-028.js';
export { parseDot, type DotParseOptions } from './formats/dot.js';
export { parsePlantUml, type PlantUmlParseOptions } from './formats/plantuml.js';
export { detectFormat, OPEN_FILE_ACCEPT, SOURCE_FORMATS, type SourceFormat, type FormatDetection } from './detect.js';

// Diagnostics
export {
  parseDiagnostic,
  printDiagnostic,
  finishParse,
  type Diagnostic,
  type ParseDiagnostic,
  type ParseDiagnosticInput,
  type DiagnosticSeverity,
  type DiagnosticSubject,
  type SourcePosition,
  type DiagnosticRange,
  type DiagnosticRelatedLocation,
} from './diagnostics.js';

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
  GraphIR2,
  NotationProfile,
  Classifier,
  ClassifierKind,
  ClassifierCompartment,
  ClassifierAttribute,
  ClassifierOperation,
  ClassifierParameter,
  ClassifierLiteral,
  RelationshipEnd,
  Multiplicity,
  EndpointMarker,
  Interaction,
  InteractionParticipant,
  InteractionMessage,
  InteractionActivation,
  InteractionFragment,
  InteractionOperand,
  InteractionGuard,
  InteractionNote,
  ParseOptions,
  ParseResult,
  ParseError,
} from './types.js';

// Syntax repair (Slice 49 local S49-AC4)
export {
  repairCoralDsl,
  type SyntaxDefectType,
  type AppliedFix,
  type RepairResult,
} from './repair.js';
