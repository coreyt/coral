/** Ingress (P1) and the XML-subset tokenizer of coral.svg-artwork 1 (profile
 * §4). The tokenizer is one linear pass over UTF-16 code units with no
 * regular-expression backtracking. It never reads a DTD, expands an entity
 * other than the five predefined ones, or resolves a URI. */
import type { SvgArtworkDiscard029 } from './svgArtworkModel029.js';
import { describeValue029 } from './svgArtworkValues029.js';

/** A P2 failure: the tokenizer stops at the first one. */
export class SvgArtworkParseError029 extends Error {
  constructor(readonly detail: string, readonly start: number, readonly end: number,
    readonly budget?: { name: 'input.elements' | 'nesting'; measure: number; limit: number }) {
    super(detail);
  }
}

/** UTF-8 length of `text` as given; a lone surrogate counts as its three-byte replacement. */
export function utf8Length029(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
}

export interface RawAttribute029 {
  qname: string;
  prefix?: string;
  local: string;
  /** Resolved namespace; undefined for an unprefixed attribute. */
  namespace?: string;
  /** Normalized and decoded value (profile §4.2 item 9). */
  value: string;
  start: number;
  end: number;
}

export interface RawElement029 {
  qname: string;
  local: string;
  namespace?: string;
  attributes: RawAttribute029[];
  children: RawElement029[];
  parent?: RawElement029;
  /** The root has depth 1. */
  depth: number;
  /** Document order of the start tag. */
  index: number;
  /** The start tag. */
  start: number;
  end: number;
  /** The first character data that is not whitespace, when there is any. */
  text?: { start: number; end: number };
}

export interface RawDocument029 {
  root: RawElement029;
  elements: RawElement029[];
  discarded: SvgArtworkDiscard029[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };

const isSpace = (code: number) => code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
const isNameStart = (code: number) => (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x5f;
const isNameChar = (code: number) => isNameStart(code) || (code >= 0x30 && code <= 0x39) || code === 0x2e ||
  code === 0x2d || code === 0x3a;
const isXmlCodePoint = (code: number) => code === 0x09 || code === 0x0a || code === 0x0d ||
  (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);

/** `[A-Za-z_][A-Za-z0-9._-]*`, optionally twice around one `:` (profile §4.2 item 8). */
function splitName(name: string): { prefix?: string; local: string } | undefined {
  const parts = name.split(':');
  if (parts.length > 2) return undefined;
  for (const part of parts) {
    if (part.length === 0 || !isNameStart(part.charCodeAt(0))) return undefined;
  }
  return parts.length === 2 ? { prefix: parts[0]!, local: parts[1]! } : { local: parts[0]! };
}

/** Tokenize and parse (P2). Throws SvgArtworkParseError029 at the first failure. */
export function parseSvgArtworkXml029(text: string, limits: { elements: number; nesting: number }): RawDocument029 {
  const length = text.length;
  const discarded: SvgArtworkDiscard029[] = [];
  const elements: RawElement029[] = [];
  // Spans never run past the input, also for a failure at its end.
  const fail = (detail: string, start: number, end = start): never => {
    const from = Math.min(start, length);
    throw new SvgArtworkParseError029(detail, from, Math.min(Math.max(from, end), length));
  };
  let index = 0;

  /** Length of the XML Char at `at`, or fail. */
  const charAt = (at: number): number => {
    const code = text.charCodeAt(at);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = at + 1 < length ? text.charCodeAt(at + 1) : 0;
      if (low >= 0xdc00 && low <= 0xdfff) return 2;
      return fail('unpaired surrogate', at, at + 1);
    }
    if (code >= 0xdc00 && code <= 0xdfff) return fail('unpaired surrogate', at, at + 1);
    if (!isXmlCodePoint(code)) return fail(`character U+${code.toString(16).toUpperCase().padStart(4, '0')} is not an XML Char`, at, at + 1);
    return 1;
  };
  const checkChars = (from: number, to: number) => {
    for (let at = from; at < to;) at += charAt(at);
  };
  const startsWith = (prefix: string, at = index) => text.startsWith(prefix, at);
  const skipSpace = (): boolean => {
    const from = index;
    while (index < length && isSpace(text.charCodeAt(index))) index++;
    return index > from;
  };
  const readName = (): string => {
    const from = index;
    if (index < length && isNameStart(text.charCodeAt(index))) {
      index++;
      while (index < length && isNameChar(text.charCodeAt(index))) index++;
    }
    return text.slice(from, index);
  };
  /** Decode a reference at `index` (which is `&`); returns the replacement text. */
  const readReference = (): string => {
    const from = index;
    const semicolon = text.indexOf(';', from + 1);
    if (semicolon < 0 || semicolon - from > 12) return fail('entity reference without ";"', from, from + 1);
    const body = text.slice(from + 1, semicolon);
    index = semicolon + 1;
    if (body.startsWith('#')) {
      const hex = body.startsWith('#x');
      const digits = body.slice(hex ? 2 : 1);
      if (!(hex ? /^[0-9A-Fa-f]{1,8}$/ : /^[0-9]{1,10}$/).test(digits)) {
        return fail(`malformed character reference ${describeValue029(`&${body};`)}`, from, index);
      }
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (!isXmlCodePoint(code)) return fail(`character reference ${describeValue029(`&${body};`)} does not denote an XML Char`, from, index);
      return String.fromCodePoint(code);
    }
    const replacement = PREDEFINED[body];
    if (replacement === undefined) return fail(`entity reference ${describeValue029(`&${body};`)} is not one of the five predefined entities`, from, index);
    return replacement;
  };

  // Prolog: an optional XML declaration at offset 0 (profile §4.2 item 1).
  if (text.charCodeAt(0) === 0xfeff) fail('byte order mark', 0, 1);
  if (startsWith('<?xml') && (isSpace(text.charCodeAt(5)) || text.charCodeAt(5) === 0x3f)) {
    const close = text.indexOf('?>');
    if (close < 0) fail('unterminated XML declaration', 0, 5);
    const declaration = text.slice(5, close);
    checkChars(5, close);
    const match = /^[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(["'])1\.0\1(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(["'])([A-Za-z][A-Za-z0-9._-]*)\2)?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(["'])(yes|no)\4)?[ \t\r\n]*$/
      .exec(declaration);
    if (!match || (match[3] !== undefined && match[3].toUpperCase() !== 'UTF-8')) {
      fail('XML declaration must be version="1.0" with encoding UTF-8', 0, close + 2);
    }
    index = close + 2;
    discarded.push({ kind: 'xml-declaration', start: 0, end: index });
  }

  const stack: RawElement029[] = [];
  const bindings: Map<string, string>[] = [new Map([['xml', XML_NS]])];
  let root: RawElement029 | undefined;

  const startTag = () => {
    const start = index;
    index++;
    const qname = readName();
    if (qname.length === 0) fail('expected an element name after "<"', index, index + 1);
    const name = splitName(qname);
    if (!name) fail(`element name ${describeValue029(qname)} is not admitted`, start, index);
    const attributes: RawAttribute029[] = [];
    const seen = new Set<string>();
    let selfClosing = false;
    for (;;) {
      const spaced = skipSpace();
      if (index >= length) fail('unterminated start tag', start, index);
      if (startsWith('/>')) { index += 2; selfClosing = true; break; }
      if (text.charCodeAt(index) === 0x3e) { index++; break; }
      if (!spaced) fail('expected whitespace, "/>" or ">"', index, index + 1);
      const attributeStart = index;
      const attributeName = readName();
      if (attributeName.length === 0) fail('expected an attribute name', index, index + 1);
      const parts = splitName(attributeName);
      if (!parts) fail(`attribute name ${describeValue029(attributeName)} is not admitted`, attributeStart, index);
      skipSpace();
      if (text.charCodeAt(index) !== 0x3d) fail('expected "=" after the attribute name', index, index + 1);
      index++;
      skipSpace();
      const quote = text.charCodeAt(index);
      if (quote !== 0x22 && quote !== 0x27) fail('attribute value must be quoted', index, index + 1);
      index++;
      let value = '';
      let run = index;
      for (;;) {
        if (index >= length) fail('unterminated attribute value', attributeStart, index);
        const code = text.charCodeAt(index);
        if (code === quote) break;
        if (code === 0x3c) fail('"<" in an attribute value', index, index + 1);
        if (code === 0x26) {
          value += text.slice(run, index);
          value += readReference();
          run = index;
          continue;
        }
        if (code === 0x09 || code === 0x0a || code === 0x0d) {
          // Line ends normalize to LF first, so CR LF is one space (XML 1.0 §2.11, §3.3.3).
          value += text.slice(run, index) + ' ';
          index += code === 0x0d && text.charCodeAt(index + 1) === 0x0a ? 2 : 1;
          run = index;
          continue;
        }
        index += charAt(index);
      }
      value += text.slice(run, index);
      index++;
      if (seen.has(attributeName)) fail(`repeated attribute ${describeValue029(attributeName)}`, attributeStart, index);
      seen.add(attributeName);
      attributes.push({ qname: attributeName, ...parts!, value, start: attributeStart, end: index });
    }
    const end = index;
    if (root && stack.length === 0) fail('content after the root element', start, end);

    // Namespaces in XML 1.0.
    let scope = bindings[bindings.length - 1]!;
    let copied = false;
    for (const attribute of attributes) {
      const declared = attribute.qname === 'xmlns' ? '' : attribute.prefix === 'xmlns' ? attribute.local : undefined;
      if (declared === undefined) continue;
      if (declared === 'xmlns' || (declared === 'xml') !== (attribute.value === XML_NS) ||
        attribute.value === XMLNS_NS || (declared !== '' && attribute.value === '')) {
        fail(`namespace declaration ${describeValue029(attribute.qname)} = ${describeValue029(attribute.value)} is not allowed`, attribute.start, attribute.end);
      }
      if (!copied) { scope = new Map(scope); copied = true; }
      scope.set(declared, attribute.value);
    }
    if (name!.prefix === 'xmlns') fail(`element prefix xmlns is reserved`, start, end);
    const elementNamespace = name!.prefix === undefined ? scope.get('') || undefined : scope.get(name!.prefix);
    if (name!.prefix !== undefined && elementNamespace === undefined) fail(`unbound prefix ${describeValue029(name!.prefix)}`, start, end);
    const expanded = new Set<string>();
    for (const attribute of attributes) {
      if (attribute.qname === 'xmlns' || attribute.prefix === 'xmlns') {
        attribute.namespace = XMLNS_NS;
        continue;
      }
      if (attribute.prefix !== undefined) {
        attribute.namespace = scope.get(attribute.prefix);
        if (attribute.namespace === undefined) {
          fail(`unbound prefix ${describeValue029(attribute.prefix)}`, attribute.start, attribute.end);
        }
      }
      const key = `${attribute.namespace ?? ''} ${attribute.local}`;
      if (expanded.has(key)) fail(`repeated attribute ${describeValue029(attribute.qname)}`, attribute.start, attribute.end);
      expanded.add(key);
    }

    const parent = stack[stack.length - 1];
    if (!parent) {
      const declaredDefault = attributes.find((attribute) => attribute.qname === 'xmlns');
      if (name!.prefix !== undefined || name!.local !== 'svg' || declaredDefault?.value !== SVG_NS) {
        fail('the root must be svg in the SVG namespace, declared on the root', start, end);
      }
    }
    if (elements.length + 1 > limits.elements) {
      throw new SvgArtworkParseError029('input.elements', start, end,
        { name: 'input.elements', measure: elements.length + 1, limit: limits.elements });
    }
    const depth = stack.length + 1;
    if (depth > limits.nesting) {
      throw new SvgArtworkParseError029('nesting', start, end, { name: 'nesting', measure: depth, limit: limits.nesting });
    }
    const element: RawElement029 = { qname, local: name!.local, ...(elementNamespace ? { namespace: elementNamespace } : {}),
      attributes, children: [], ...(parent ? { parent } : {}), depth, index: elements.length, start, end };
    elements.push(element);
    if (parent) parent.children.push(element);
    else root = element;
    if (!selfClosing) {
      stack.push(element);
      bindings.push(scope);
    }
  };

  const endTag = () => {
    const start = index;
    index += 2;
    const qname = readName();
    skipSpace();
    if (text.charCodeAt(index) !== 0x3e) fail('malformed end tag', start, index + 1);
    index++;
    const open = stack[stack.length - 1];
    if (!open || open.qname !== qname) fail(`end tag ${describeValue029(qname)} does not match ${open ? describeValue029(open.qname) : 'any start tag'}`, start, index);
    stack.pop();
    bindings.pop();
  };

  const noteText = (start: number, end: number) => {
    const open = stack[stack.length - 1];
    if (!open) return fail('character data outside the root element', start, end);
    if (!open.text) open.text = { start, end };
  };

  while (index < length) {
    const code = text.charCodeAt(index);
    if (code === 0x3c) {
      if (startsWith('<!--')) {
        const start = index;
        const close = text.indexOf('--', index + 4);
        if (close < 0 || text.charCodeAt(close + 2) !== 0x3e) fail('comment contains "--" or is unterminated', start, start + 4);
        checkChars(start + 4, close);
        index = close + 3;
        discarded.push({ kind: 'comment', start, end: index });
      } else if (startsWith('<![CDATA[')) {
        const start = index;
        if (stack.length === 0) fail('CDATA section outside the root element', start, start + 9);
        const close = text.indexOf(']]>', index + 9);
        if (close < 0) fail('unterminated CDATA section', start, start + 9);
        checkChars(start + 9, close);
        for (let at = start + 9; at < close; at++) {
          if (!isSpace(text.charCodeAt(at))) { noteText(at, close); break; }
        }
        index = close + 3;
      } else if (startsWith('<!')) {
        fail('document type and markup declarations are not admitted', index, index + 2);
      } else if (startsWith('<?')) {
        fail('processing instructions are not admitted', index, index + 2);
      } else if (startsWith('</')) {
        endTag();
      } else {
        startTag();
      }
    } else if (code === 0x26) {
      const start = index;
      if (stack.length === 0) fail('character data outside the root element', start, start + 1);
      const replacement = readReference();
      if (!/^[ \t\n\r]*$/.test(replacement)) noteText(start, index);
    } else {
      const start = index;
      let firstText = -1;
      while (index < length) {
        const at = text.charCodeAt(index);
        if (at === 0x3c || at === 0x26) break;
        if (at === 0x3e && text.charCodeAt(index - 1) === 0x5d && text.charCodeAt(index - 2) === 0x5d && index - 2 >= start) {
          fail('"]]>" in character data', index - 2, index + 1);
        }
        if (!isSpace(at)) {
          if (stack.length === 0) fail('character data outside the root element', index, index + 1);
          if (firstText < 0) firstText = index;
        }
        index += charAt(index);
      }
      if (firstText >= 0) noteText(firstText, index);
    }
  }
  if (stack.length > 0) {
    const open = stack[stack.length - 1]!;
    fail(`element ${describeValue029(open.qname)} is not closed`, open.start, open.end);
  }
  if (!root) fail('no root element', length, length);
  return { root: root!, elements, discarded };
}
