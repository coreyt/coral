/** Staged source-only Coral 0.2.8 header, separate from the earlier A/B trial. */
export interface HeaderProfileIdentity028 { id: string; kind?: string; version: string }
export interface HeaderCatalogIdentity028 { id: string; version: string; digest: string }
export interface HeaderEdition028 {
  /** Kept in the manifest for exact source recognition but unavailable as a release document type. */
  enabled?: boolean;
  profiles: HeaderProfileIdentity028[];
  catalogs: HeaderCatalogIdentity028[];
  compatible: Array<readonly [profileVersion: string, catalogVersion: string]>;
  defaults: readonly [profileVersion: string, catalogVersion: string];
}
/** Immutable-by-release data supplied by the installed language/catalog adapter. */
export type HeaderManifest028 = Record<string, Record<string, HeaderEdition028>>;
export interface HeaderRuntime028 {
  manifest: HeaderManifest028;
  currentVersion: string;
  /** Trusted package digests, indexed by catalog ID and version. */
  trustedDigests: Record<string, string>;
}
/** One-based line, zero-based UTF-16 column, and absolute UTF-16 offset. */
export interface HeaderLocation028 { line: number; column: number; offset: number }
export interface HeaderRange028 { start: HeaderLocation028; end: HeaderLocation028 }
export interface HeaderDiagnostic028 {
  code: string;
  message: string;
  range: HeaderRange028;
  related?: Array<{ message: string; range: HeaderRange028 }>;
}
export interface ResolvedHeader028 {
  diagramType: string;
  effectiveCoralVersion: string;
  profile: HeaderProfileIdentity028;
  catalog: HeaderCatalogIdentity028;
  conformanceLevel: 'none' | 'typical' | 'strict';
  explicit: { coralVersion: boolean; profileVersion: boolean;
    catalogVersion: boolean; conformanceLevel: boolean };
  /** The authored `@conformanceLevel` key token; present only when explicit. */
  conformanceLevelRange029?: HeaderRange028;
  /** Insertion point immediately after the @diagram logical line. */
  diagramLineEndOffset: number;
}
/** Absolute half-open UTF-16 offsets. */
export interface HeaderOffsetSpan029 { start: number; end: number }
/** A raw `artwork <format> """` block inside a definition region. */
export interface SymbolRawBlock029 {
  /** From the `artwork` keyword to the opening quotes. */
  open: HeaderRange028;
  /** Every byte between the opening line and the closing line, untouched. */
  content: HeaderOffsetSpan029;
  /** The closing line, exactly three quotes; absent when the block is unclosed. */
  close?: HeaderRange028;
}
/** One `@symbol` definition region, owned and masked by the header scanner. */
export interface SymbolDefinitionRegion029 {
  /** Authored symbol ID; absent when the opening line is malformed. */
  id?: string;
  /** True when the region follows the first body statement. */
  late: boolean;
  /** From `@symbol` through the closing brace, or to the end of the source. */
  range: HeaderRange028;
  open: HeaderRange028;
  close?: HeaderRange028;
  rawBlocks: SymbolRawBlock029[];
}
export interface HeaderParseResult028 {
  source: string;
  header?: ResolvedHeader028;
  /** Effective edition whenever the header names a diagram, even if other header checks fail. */
  effectiveCoralVersion?: string;
  /** Edition 0.2.9 definition regions in authored order; omitted when the source has none. */
  definitionRegions?: SymbolDefinitionRegion029[];
  /** Exact authored diagram-type token, even when its installed edition is unavailable. */
  diagramTypeRange?: HeaderRange028;
  /** Header text is space-masked; all UTF-16 offsets and newline bytes remain. */
  body: string;
  diagnostics: HeaderDiagnostic028[];
}
export interface HeaderSaveResult028 {
  source: string;
  edit?: { at: number; insertedLength: number };
}

type Directive = 'coralVersion' | 'profileVersion' | 'catalogVersion' | 'conformanceLevel';
const DIRECTIVES: readonly Directive[] = ['coralVersion', 'profileVersion', 'catalogVersion', 'conformanceLevel'];
const LEVELS = new Set(['none', 'typical', 'strict']);
interface Line { text: string; start: number; end: number; number: number; newline: string }

function linesOf(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  let number = 1;
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== '\n') continue;
    const cr = index > start && source[index - 1] === '\r';
    lines.push({ text: source.slice(start, cr ? index - 1 : index), start,
      end: index + 1, number: number++, newline: cr ? '\r\n' : '\n' });
    start = index + 1;
  }
  lines.push({ text: source.slice(start), start, end: source.length, number, newline: '' });
  return lines;
}
function range(line: Line, start: number, end: number): HeaderRange028 {
  return { start: { line: line.number, column: start, offset: line.start + start },
    end: { line: line.number, column: end, offset: line.start + end } };
}
function isTrivia(text: string): boolean { return /^[ \t]*(?:\/\/.*)?$/.test(text); }
const INVALID_SPACING = /[\p{White_Space}\p{Default_Ignorable_Code_Point}\ufeff]/u;
function invalidHeaderSpacing(line: Line): HeaderRange028[] {
  const result: HeaderRange028[] = [];
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < line.text.length;) {
    const character = String.fromCodePoint(line.text.codePointAt(index)!);
    if (quote) {
      if (character === '\\') { index += Math.min(2, line.text.length - index); continue; }
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") quote = character;
    else if (character !== ' ' && character !== '\t' && INVALID_SPACING.test(character))
      result.push(range(line, index, index + character.length));
    index += character.length;
  }
  return result;
}
// Any non-word character after @symbol starts a definition attempt, so
// invalid spacing is reported as a malformed opening, not a directive.
const SYMBOL_LINE = /^([ \t]*)@symbol(?![A-Za-z0-9_])/;
const SYMBOL_OPEN = /^[ \t]*@symbol[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*\{[ \t]*(?:\/\/[^\r\n]*)?$/;
const REGION_OPENS = /\{[ \t]*(?:\/\/[^\r\n]*)?$/;
const REGION_CLOSE = /^([ \t]*)\}[ \t]*(?:\/\/[^\r\n]*)?$/;
/** Any definition line that starts with `artwork` opens raw content, so a
 * malformed opener never exposes artwork to a line reader. */
const RAW_OPEN = /^([ \t]*)(artwork\b[^\r\n]*?)[ \t]*$/;
const RAW_CLOSE = '"""';

/** Editions that admit `@symbol` regions and port label and connection-limit fields. */
export function editionAdmitsUserSymbols029(version: string): boolean {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number);
  if (!parts) return false;
  const [major, minor, patch] = parts as [number, number, number];
  return major > 0 || minor > 2 || minor === 2 && patch >= 9;
}

/** Editions that admit Coral 0.2.14 syntax (node style/technology/description/provider,
 * edge technology/description/endpoint labels, Crow's Foot ERD, cloud infrastructure,
 * camelCase relation mappings, and symmetric unnamed UML attribute visibility). */
export function editionAdmits0214(version: string): boolean {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number);
  if (!parts) return false;
  const [major, minor, patch] = parts as [number, number, number];
  return major > 0 || minor > 2 || minor === 2 && patch >= 14;
}

interface RegionScan {
  region?: SymbolDefinitionRegion029; lines: Line[];
  /** The opening line, from `@symbol` to its last non-space character. */
  opening: HeaderRange028;
  /** Malformed or missing ID, or no opening brace. */
  syntax: boolean;
  /** No closing brace, or (implying it) an unclosed raw block. */
  unclosed?: 'region' | 'raw';
}
/** Find one region's end. Raw lines are skipped without interpretation, so
 * no later consumer needs to tokenize artwork. */
function scanRegion(lines: readonly Line[], at: number, late: boolean, source: string): RegionScan {
  const opening = lines[at]!;
  const indent = SYMBOL_LINE.exec(opening.text)![1]!.length;
  const trimmedEnd = opening.text.trimEnd().length;
  const openRange = range(opening, indent, trimmedEnd);
  if (!REGION_OPENS.test(opening.text)) return { lines: [opening], opening: openRange, syntax: true };
  const id = SYMBOL_OPEN.exec(opening.text)?.[1];
  const consumed = [opening];
  const rawBlocks: SymbolRawBlock029[] = [];
  let raw: SymbolRawBlock029 | undefined;
  for (const line of lines.slice(at + 1)) {
    consumed.push(line);
    if (raw) {
      if (line.text !== RAW_CLOSE) continue;
      raw.content.end = line.start;
      raw.close = range(line, 0, RAW_CLOSE.length);
      raw = undefined;
      continue;
    }
    const close = REGION_CLOSE.exec(line.text);
    if (close) {
      const brace = close[1]!.length;
      return { lines: consumed, opening: openRange, syntax: !id, region: {
        ...(id ? { id } : {}), late,
        range: { start: range(opening, indent, indent).start, end: range(line, brace + 1, brace + 1).end },
        open: openRange, close: range(line, brace, brace + 1), rawBlocks } };
    }
    const artwork = RAW_OPEN.exec(line.text);
    if (artwork) {
      const start = artwork[1]!.length;
      raw = { open: range(line, start, start + artwork[2]!.length),
        content: { start: line.end, end: source.length } };
      rawBlocks.push(raw);
    }
  }
  const last = lines[lines.length - 1]!;
  return { lines: consumed, opening: openRange, syntax: !id, unclosed: raw ? 'raw' : 'region', region: {
    ...(id ? { id } : {}), late,
    range: { start: range(opening, indent, indent).start, end: range(last, last.text.length, last.text.length).end },
    open: openRange, rawBlocks } };
}

function mask(source: string, lines: readonly Line[]): string {
  // Slice indices and string lengths are UTF-16; spreading would reindex a
  // preceding non-BMP character as one code point and corrupt later ranges.
  let result = source;
  for (const line of [...lines].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, line.start) + ' '.repeat(line.text.length) +
      result.slice(line.start + line.text.length);
  }
  return result;
}
function quotedValue(raw: string): { value?: string;
  error?: 'quote' | 'syntax' | 'control' | 'invalid-scalar'; at?: number } {
  const delimiter = raw[0];
  if (delimiter !== '"' && delimiter !== "'") return { error: 'quote' };
  let decoded = '';
  for (let index = 1; index < raw.length; index++) {
    const character = raw[index]!;
    if (character === delimiter) {
      return index === raw.length - 1 ? { value: decoded } : { error: 'syntax' };
    }
    if (character === '\\') {
      const escaped = raw[++index];
      if (escaped === delimiter || escaped === '\\') decoded += escaped;
      else if (escaped === 'n') decoded += '\n';
      else return { error: 'quote' };
    } else {
      const unit = raw.charCodeAt(index);
      if (unit < 0x20 || unit >= 0x7f && unit <= 0x9f || unit === 0x2028 || unit === 0x2029)
        return { error: 'control', at: index };
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = raw.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff) return { error: 'invalid-scalar', at: index };
        decoded += raw.slice(index, index + 2);
        index++;
      } else if (unit >= 0xdc00 && unit <= 0xdfff)
        return { error: 'invalid-scalar', at: index };
      else decoded += character;
    }
  }
  return { error: 'quote' };
}
function commaItems(content: string): Array<{ text: string; start: number }> {
  const items: Array<{ text: string; start: number }> = [];
  let quote: '"' | "'" | undefined;
  let start = 0;
  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (quote && character === '\\') { index++; continue; }
    if (character === quote) { quote = undefined; continue; }
    if (!quote && (character === '"' || character === "'")) { quote = character; continue; }
    if (!quote && character === ',') {
      items.push({ text: content.slice(start, index), start });
      start = index + 1;
    }
  }
  items.push({ text: content.slice(start), start });
  return items;
}

export function parseHeader028(source: string, runtime: HeaderRuntime028): HeaderParseResult028 {
  const lines = linesOf(source);
  const diagnostics: HeaderDiagnostic028[] = [];
  const masked: Line[] = [];
  const report = (code: string, message: string, line: Line, start = 0, end = line.text.length,
    related?: HeaderRange028): void => {
    diagnostics.push({ code, message, range: range(line, start, end),
      ...(related ? { related: [{ message: 'First assignment', range: related }] } : {}) });
  };
  const diagramLine = lines.find((line) => !isTrivia(line.text));
  if (!diagramLine) {
    report('header.diagram.required', 'Provide @diagram and a diagram type.', lines[0]!);
    return { source, body: source, diagnostics };
  }
  for (const location of invalidHeaderSpacing(diagramLine)) diagnostics.push({
    code: 'header.spacing.invalid', message: 'Only ASCII spaces or tabs may separate Coral header syntax.',
    range: location,
  });
  const match = /^[ \t]*@diagram(?:[ \t]+([A-Za-z][A-Za-z0-9-]*))?([^\r\n]*)$/.exec(diagramLine.text);
  if (!match || !match[1]) {
    report('header.diagram.required', 'Provide @diagram and a diagram type.', diagramLine);
    return { source, body: source, diagnostics };
  }
  const diagramType = match[1];
  const typeStart = /^[ \t]*@diagram[ \t]+/.exec(diagramLine.text)![0].length;
  const diagramTypeRange = range(diagramLine, typeStart, typeStart + diagramType.length);
  const rawTail = match[2] ?? '';
  const tail = rawTail.trim();
  masked.push(diagramLine);
  if (tail && !/^[ \t]+/.test(rawTail))
    report('header.diagram.syntax', 'Separate diagram attributes from the type with a space.',
      diagramLine, diagramLine.text.indexOf(diagramType) + diagramType.length);
  if (tail) {
    const open = diagramLine.text.indexOf('[', diagramLine.text.indexOf(diagramType) + diagramType.length);
    if (open < 0 || !/^\[[^\r\n]*\]$/.test(tail)) {
      report('header.diagram.syntax', 'Expected an optional keyed bracket after the diagram type.', diagramLine,
        Math.max(0, diagramLine.text.indexOf(diagramType) + diagramType.length));
    } else {
      const content = tail.slice(1, -1);
      const attributes = commaItems(content);
      const firstKeys = new Map<string, HeaderRange028>();
      if (!content.trim()) report('header.attribute.empty', 'A diagram bracket cannot be empty.', diagramLine, open, open + 2);
      for (const [index, item] of attributes.entries()) {
        const itemStart = open + 1 + item.start;
        const trimmed = item.text.trim();
        if (!trimmed) {
          if (index === attributes.length - 1 && index > 0)
            report('header.attribute.trailing-comma', 'Remove the trailing comma.', diagramLine, itemStart - 1, itemStart);
          else report('header.attribute.empty-item', 'Every diagram attribute needs key: value.',
            diagramLine, itemStart, itemStart + 1);
          continue;
        }
        const field = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]*:[ \t]*([^\r\n]+)$/.exec(trimmed);
        if (!field) {
          report('header.attribute.colon-required', 'Use key: value in a diagram bracket.', diagramLine,
            itemStart, itemStart + item.text.length);
          continue;
        }
        const key = field[1]!;
        const start = itemStart + item.text.indexOf(key);
        const seen = firstKeys.get(key);
        if (seen) report('header.attribute.duplicate', `Duplicate diagram attribute ${key}.`,
          diagramLine, start, start + key.length, seen);
        else {
          firstKeys.set(key, range(diagramLine, start, start + key.length));
          const rawValue = field[2]!.trim();
          const quoted = quotedValue(rawValue);
          const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawValue) || quoted.value !== undefined;
          if (!valid && (quoted.error === 'control' || quoted.error === 'invalid-scalar')) {
            const at = itemStart + item.text.indexOf(rawValue, item.text.indexOf(key) + key.length) + quoted.at!;
            report(quoted.error === 'control' ? 'header.string.control' : 'header.string.invalid-scalar',
              quoted.error === 'control' ? 'Control character in quoted text.' :
                'Quoted text contains an isolated Unicode surrogate.', diagramLine, at, at + 1);
          } else if (!valid) report('header.attribute.value', 'Expected a Coral word or quoted value.', diagramLine,
            start + key.length, itemStart + item.text.length);
          else report('header.attribute.unsupported', `Diagram attribute ${key} is not yet supported.`,
            diagramLine, start, start + key.length);
        }
      }
    }
  }

  const fields = new Map<Directive, { value: string; line: Line; range: HeaderRange028 }>();
  const regions: SymbolDefinitionRegion029[] = [];
  let bodyStarted = false;
  let definitionsStarted = false;
  // In an edition that refuses definitions, the edition finding alone reports a late block.
  const lateFindings = new Set<HeaderDiagnostic028>();
  for (let index = lines.indexOf(diagramLine) + 1; index < lines.length; index++) {
    const line = lines[index]!;
    if (isTrivia(line.text)) continue;
    const trimmed = line.text.trimStart();
    if (!trimmed.startsWith('@')) { bodyStarted = true; continue; }
    for (const location of invalidHeaderSpacing(line)) diagnostics.push({
      code: 'header.spacing.invalid', message: 'Only ASCII spaces or tabs may separate Coral header syntax.',
      range: location,
    });
    const symbol = SYMBOL_LINE.exec(line.text);
    if (symbol) {
      const scan = scanRegion(lines, index, bodyStarted, source);
      masked.push(...scan.lines);
      index += scan.lines.length - 1;
      if (scan.region) regions.push(scan.region);
      if (!bodyStarted) definitionsStarted = true;
      const at = symbol[1]!.length;
      if (bodyStarted) {
        report('coral.symbol.local.late',
          'Symbol definitions must follow the directives and precede body statements.', line, at, at + 7);
        lateFindings.add(diagnostics[diagnostics.length - 1]!);
      }
      if (scan.syntax) diagnostics.push({ code: 'coral.symbol.local.syntax',
        message: 'Expected @symbol <id> { with an identifier and an opening brace.', range: scan.opening });
      if (scan.unclosed === 'raw') {
        const open = scan.region!.rawBlocks[scan.region!.rawBlocks.length - 1]!.open;
        diagnostics.push({ code: 'coral.symbol.local.artwork.unclosed',
          message: 'Close the artwork block with a line that is exactly """.', range: open });
      } else if (scan.unclosed === 'region') diagnostics.push({ code: 'coral.symbol.local.unclosed',
        message: 'Close the symbol definition with a closing brace alone on a later line.', range: scan.opening });
      continue;
    }
    if (bodyStarted || definitionsStarted) {
      report('header.directive.late', 'Header directives must precede body statements.', line);
      continue;
    }
    masked.push(line);
    const directive = /^[ \t]*@([A-Za-z][A-Za-z0-9]*)[ \t]+([^\r\n]+?)[ \t]*$/.exec(line.text);
    if (!directive) { report('header.directive.syntax', 'Expected @key value on one line.', line); continue; }
    const key = directive[1]!;
    if (!DIRECTIVES.includes(key as Directive)) {
      report('header.directive.unknown', `Unknown header directive @${key}.`, line); continue;
    }
    const field = key as Directive;
    const value = directive[2]!;
    const start = line.text.indexOf('@' + key);
    const location = range(line, start, start + key.length + 1);
    const prior = fields.get(field);
    if (prior) report('header.directive.duplicate', `Duplicate @${key}.`, line,
      start, start + key.length + 1, prior.range);
    else fields.set(field, { value, line, range: location });
  }

  const versionValue = (field: Extract<Directive, 'coralVersion' | 'profileVersion' | 'catalogVersion'>): string | undefined => {
    const entry = fields.get(field);
    if (!entry) return undefined;
    const decoded = quotedValue(entry.value);
    if (decoded.error) {
      if (decoded.error === 'control' || decoded.error === 'invalid-scalar') {
        const start = entry.line.text.indexOf(entry.value, entry.range.end.column);
        const at = start + decoded.at!;
        report(decoded.error === 'control' ? 'header.string.control' : 'header.string.invalid-scalar',
          decoded.error === 'control' ? 'Control character in quoted text.' :
            'Quoted text contains an isolated Unicode surrogate.', entry.line, at, at + 1);
      } else report(decoded.error === 'syntax' ? 'header.directive.syntax' : 'header.version.quote',
        `@${field} requires one paired-quoted version.`, entry.line);
    }
    return decoded.value;
  };
  const effectiveCoralVersion = versionValue('coralVersion') ?? runtime.currentVersion;
  const profileVersion = versionValue('profileVersion');
  const catalogVersion = versionValue('catalogVersion');
  const rawLevel = fields.get('conformanceLevel');
  if (rawLevel && !LEVELS.has(rawLevel.value))
    report('header.level.invalid', 'Expected none, typical, or strict.', rawLevel.line);
  const conformanceLevel = (rawLevel?.value ?? 'typical') as ResolvedHeader028['conformanceLevel'];
  const versions = runtime.manifest[effectiveCoralVersion];
  if (!versions) report('header.version.unavailable', `Coral ${effectiveCoralVersion} is unavailable.`,
    fields.get('coralVersion')?.line ?? diagramLine);
  else if (!editionAdmitsUserSymbols029(effectiveCoralVersion) && regions.length) {
    diagnostics.splice(0, diagnostics.length, ...diagnostics.filter((item) => !lateFindings.has(item)));
    for (const region of regions) diagnostics.push({ code: 'coral.symbol.local.edition',
      message: `Symbol definitions require @coralVersion "0.2.9"; this document is read as Coral ${effectiveCoralVersion}.`,
      range: { start: region.open.start, end: { ...region.open.start,
        column: region.open.start.column + 7, offset: region.open.start.offset + 7 } } });
  }
  const extra = { ...(versions ? { effectiveCoralVersion } : {}),
    ...(regions.length ? { definitionRegions: regions } : {}) };
  const edition = versions?.[diagramType];
  if (versions && !edition) report('header.diagram.unsupported',
    `Unknown diagram type ${diagramType}.`, diagramLine, typeStart, typeStart + diagramType.length);
  if (edition?.enabled === false) {
    report('header.diagram.disabled',
      `Diagram type ${diagramType} is disabled in Coral ${effectiveCoralVersion}. The source remains saveable as text.`,
      diagramLine, typeStart, typeStart + diagramType.length);
    return { source, body: mask(source, masked), diagnostics, diagramTypeRange, ...extra };
  }
  const desiredProfile = profileVersion ?? edition?.defaults[0];
  const desiredCatalog = catalogVersion ?? edition?.defaults[1];
  const profile = edition?.profiles.find((item) => item.version === desiredProfile);
  const catalog = edition?.catalogs.find((item) => item.version === desiredCatalog);
  if (edition && !profile) report('header.profile.unavailable', `Profile ${desiredProfile} is unavailable.`,
    fields.get('profileVersion')?.line ?? diagramLine);
  if (edition && !catalog) report('header.catalog.unavailable', `Catalog ${desiredCatalog} is unavailable.`,
    fields.get('catalogVersion')?.line ?? diagramLine);
  if (edition && profile && catalog && !edition.compatible.some(([a, b]) =>
    a === profile.version && b === catalog.version))
    report('header.versions.incompatible', 'Profile and catalog versions are incompatible.',
      fields.get('profileVersion')?.line ?? fields.get('catalogVersion')?.line ?? diagramLine);
  if (catalog) {
    const trusted = runtime.trustedDigests?.[`${catalog.id}@${catalog.version}`];
    if (!trusted)
      report('header.catalog.snapshot-unavailable', 'The exact catalog snapshot is not installed.',
        fields.get('catalogVersion')?.line ?? diagramLine);
    else if (trusted !== catalog.digest)
      report('header.catalog.digest-mismatch', 'Catalog content does not match its pinned digest.',
        fields.get('catalogVersion')?.line ?? diagramLine);
  }
  const body = mask(source, masked);
  if (diagnostics.length || !profile || !catalog) return { source, body, diagnostics, diagramTypeRange, ...extra };
  return { source, body, diagnostics, diagramTypeRange, ...extra, header: {
    diagramType, effectiveCoralVersion, profile: { ...profile }, catalog: { ...catalog }, conformanceLevel,
    explicit: {
      coralVersion: fields.has('coralVersion'), profileVersion: fields.has('profileVersion'),
      catalogVersion: fields.has('catalogVersion'), conformanceLevel: fields.has('conformanceLevel'),
    }, ...(fields.get('conformanceLevel') ? { conformanceLevelRange029: fields.get('conformanceLevel')!.range } : {}),
    diagramLineEndOffset: diagramLine.end,
  } };
}

export function prepareHeaderForSave028(source: string, parsed: HeaderParseResult028,
  runtime: HeaderRuntime028): HeaderSaveResult028 {
  if (parsed.source !== source || !parsed.header || parsed.diagnostics.length)
    throw new Error('Cannot pin an invalid or changed Coral header.');
  if (parsed.header.explicit.coralVersion) return { source };
  const at = parsed.header.diagramLineEndOffset;
  const diagramLine = linesOf(source).find((line) => line.end === at)!;
  const newline = diagramLine.newline || linesOf(source).find((line) => line.newline)?.newline || '\n';
  const insertion = diagramLine.newline
    ? `@coralVersion "${parsed.header.effectiveCoralVersion}"${newline}`
    : `${newline}@coralVersion "${parsed.header.effectiveCoralVersion}"`;
  const pinned = source.slice(0, at) + insertion + source.slice(at);
  const reparsed = parseHeader028(pinned, runtime);
  const meaning = (header: ResolvedHeader028) => JSON.stringify({
    diagramType: header.diagramType, effectiveCoralVersion: header.effectiveCoralVersion,
    profile: header.profile, catalog: header.catalog, conformanceLevel: header.conformanceLevel,
  });
  if (!reparsed.header || meaning(reparsed.header) !== meaning(parsed.header))
    throw new Error('Saving the version pin would change the document interpretation.');
  return { source: pinned, edit: { at, insertedLength: insertion.length } };
}

export interface HeaderPinResult029 {
  source: string;
  /** Replaced half-open span of the original source; absent when nothing changed. */
  edit?: { start: number; end: number; text: string };
}

/** Undoable header edit that pins an edition admitting user symbols. It inserts
 * the pin after the @diagram line or rewrites only an explicit pin's value.
 * Unlike prepareHeaderForSave028 it may change interpretation, but only from
 * an older edition to a superset edition with the same profiles and catalogs:
 * text that is valid in the older edition reads identically. */
export function pinHeaderEdition029(source: string, runtime: HeaderRuntime028,
  version = '0.2.9'): HeaderPinResult029 {
  const parsed = parseHeader028(source, runtime);
  if (!editionAdmitsUserSymbols029(version) || !runtime.manifest[version] ||
    parsed.diagnostics.some(({ code }) => code !== 'coral.symbol.local.edition') ||
    !parsed.effectiveCoralVersion)
    throw new Error('Cannot pin an invalid Coral header.');
  if (parsed.effectiveCoralVersion === version) return { source };
  if (editionAdmitsUserSymbols029(parsed.effectiveCoralVersion))
    throw new Error(`Coral ${parsed.effectiveCoralVersion} cannot be pinned to the older ${version}.`);
  const lines = linesOf(source);
  const regions = parsed.definitionRegions ?? [];
  const directive = lines.find((line) => /^[ \t]*@coralVersion[ \t]/.test(line.text) &&
    parsed.body.slice(line.start, line.start + line.text.length).trim() === '' &&
    !regions.some((region) => line.start >= region.range.start.offset && line.start <= region.range.end.offset));
  let edit: NonNullable<HeaderPinResult029['edit']>;
  if (directive) {
    const value = /^([ \t]*@coralVersion[ \t]+)("[^"]*"|'[^']*')/.exec(directive.text);
    if (!value) throw new Error('Cannot pin an invalid Coral header.');
    const start = directive.start + value[1]!.length;
    edit = { start, end: start + value[2]!.length, text: JSON.stringify(version) };
  } else {
    const at = parsed.header?.diagramLineEndOffset ??
      lines.find((line) => /^[ \t]*@diagram\b/.test(line.text))!.end;
    const diagramLine = lines.find((line) => line.end === at)!;
    const newline = diagramLine.newline || lines.find((line) => line.newline)?.newline || '\n';
    edit = { start: at, end: at, text: diagramLine.newline
      ? `@coralVersion ${JSON.stringify(version)}${newline}` : `${newline}@coralVersion ${JSON.stringify(version)}` };
  }
  const pinned = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const reparsed = parseHeader028(pinned, runtime);
  if (!reparsed.header || reparsed.header.effectiveCoralVersion !== version ||
    parsed.header && (reparsed.header.diagramType !== parsed.header.diagramType ||
      JSON.stringify([reparsed.header.profile, reparsed.header.catalog, reparsed.header.conformanceLevel]) !==
      JSON.stringify([parsed.header.profile, parsed.header.catalog, parsed.header.conformanceLevel])))
    throw new Error('Pinning the edition would change the document identity.');
  return { source: pinned, edit };
}
