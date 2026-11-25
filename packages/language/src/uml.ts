import type {
  Classifier,
  ClassifierAttribute,
  ClassifierCompartment,
  ClassifierLiteral,
  ClassifierOperation,
  ClassifierParameter,
  ClassifierKind,
} from './types.js';
import { quoteIfNeeded } from './strings.js';

export const UML_CLASS_PROFILE = { id: 'uml', kind: 'class', version: '1.0.0' } as const;
export const UML_CLASS_NOTATION = 'uml-class';

export function umlSymbolForKind(kind: ClassifierKind): string {
  return `uml-${kind}`;
}

const VISIBILITY = {
  '+': 'public', '-': 'private', '#': 'protected', '~': 'package',
} as const;
const VISIBILITY_SIGN = {
  public: '+', private: '-', protected: '#', package: '~',
} as const;

export type UmlMember = ClassifierAttribute | ClassifierOperation | ClassifierLiteral;
export type UmlMemberKind = 'attributes' | 'operations' | 'literals';
const UML_IDENTITY = '[A-Za-z_][\\w-]*|"(?:[^"\\\\]|\\\\.)*"';
const UML_IDENTIFIER = /^[A-Za-z_][\w-]*$/;
const UML_TYPE = /^[^\s{}<>,]+$/;

export function parseUmlIdentity(raw: string | undefined): { value?: string; error?: string } {
  if (raw === undefined) return {};
  if (!raw.startsWith('"')) return { value: raw };
  try { return { value: JSON.parse(raw) as string }; }
  catch { return { error: 'Classifier identity must use valid JSON string escapes' }; }
}

function orderedModifiers(value: unknown, allowed: readonly string[]): boolean {
  return value === undefined || (Array.isArray(value)
    && value.length > 0
    && value.every((token, index) => typeof token === 'string'
      && allowed.includes(token)
      && allowed.indexOf(token) > (index === 0 ? -1 : allowed.indexOf(value[index - 1]))));
}

/** True only for the exact structured classifier subset canonical Coral can preserve. */
export function isPrintableUmlClassifier(classifier: Classifier, nodeType: string, nodeLabel: string | undefined): boolean {
  if (!['class', 'interface', 'enum'].includes(classifier.kind)
      || nodeType !== classifier.kind || nodeLabel !== classifier.name
      || !orderedModifiers(classifier.modifiers, ['abstract', 'static'])
      || classifier.modifiers?.includes('abstract') && classifier.kind === 'enum'
      || classifier.modifiers?.includes('static') && classifier.kind !== 'class') return false;

  const allowedParts = classifier.kind === 'enum'
    ? new Set(['name', 'literals', 'operations'])
    : new Set(['name', 'attributes', 'operations']);
  const kinds = classifier.compartments.map((part) => part.kind);
  if (classifier.compartments[0]?.kind !== 'name'
      || classifier.compartments[0]?.id !== 'name'
      || kinds.filter((kind) => kind === 'name').length !== 1
      || kinds.some((kind) => !allowedParts.has(kind))
      || new Set(kinds).size !== kinds.length
      || classifier.kind === 'enum' && !kinds.includes('literals')) return false;

  const ids = new Set<string>();
  for (const part of classifier.compartments) {
    if (typeof part.id !== 'string' || part.id.length === 0 || ids.has(part.id)) return false;
    ids.add(part.id);
    if (part.kind === 'name') continue;
    for (const member of part.items) {
      if (typeof member.id !== 'string' || member.id.length === 0 || ids.has(member.id)) return false;
      ids.add(member.id);
      if (!UML_IDENTIFIER.test(member.name)) return false;
      if (part.kind === 'attributes') {
        if (member.kind !== 'attribute'
            || member.type !== undefined && !UML_TYPE.test(member.type)
            || !orderedModifiers(member.modifiers, ['static', 'readonly', 'derived'])) return false;
      } else if (part.kind === 'operations') {
        if (member.kind !== 'operation'
            || !Array.isArray(member.parameters)
            || member.returnType !== undefined && !UML_TYPE.test(member.returnType)
            || !orderedModifiers(member.modifiers, ['abstract', 'static'])
            || member.parameters.some((parameter) => !UML_IDENTIFIER.test(parameter.name)
              || parameter.type !== undefined && !UML_TYPE.test(parameter.type))) return false;
      } else if (member.kind !== 'literal' || member.value !== undefined && typeof member.value !== 'string') return false;
      if ('visibility' in member && member.visibility !== undefined
          && !['public', 'private', 'protected', 'package'].includes(member.visibility)) return false;
    }
  }
  return true;
}

export function classifierFor(
  kind: ClassifierKind,
  name: string,
  modifiers?: Classifier['modifiers'],
  includeEnumLiterals = true,
): Classifier {
  return {
    kind,
    name,
    ...(modifiers?.length ? { modifiers } : {}),
    compartments: [
      { id: 'name', kind: 'name' },
      ...(kind === 'enum' && includeEnumLiterals ? [{ id: 'literals', kind: 'literals' as const, items: [] }] : []),
    ],
  };
}

export function parseClassifierModifiers(raw: string): { value?: Classifier['modifiers']; error?: string } {
  if (!raw.trim()) return { error: 'Classifier modifier list must not be empty' };
  const tokens = raw.split(',').map((token) => token.trim());
  if (tokens.some((token) => token !== 'abstract' && token !== 'static')) {
    return { error: 'Classifier modifiers must be abstract and/or static' };
  }
  if (new Set(tokens).size !== tokens.length || tokens.join(',') !== [...tokens].sort((a, b) =>
    ['abstract', 'static'].indexOf(a) - ['abstract', 'static'].indexOf(b)).join(',')) {
    return { error: 'Classifier modifiers must be unique and ordered abstract, static' };
  }
  return { value: tokens as Classifier['modifiers'] };
}

function parseModifiers(raw: string | undefined, allowed: string[]): { value?: ClassifierAttribute['modifiers']; error?: string } {
  if (raw === undefined) return {};
  const tokens = raw.split(',').map((token) => token.trim());
  if (!tokens.length || tokens.some((token) => !allowed.includes(token))) {
    return { error: `Member modifiers must be ${allowed.join(', ')}` };
  }
  if (new Set(tokens).size !== tokens.length || tokens.some((token, index) => allowed.indexOf(token) < (index ? allowed.indexOf(tokens[index - 1]) : -1))) {
    return { error: `Member modifiers must be unique and ordered ${allowed.join(', ')}` };
  }
  return { value: tokens as ClassifierAttribute['modifiers'] };
}

function parameters(raw: string): { value?: ClassifierParameter[]; error?: string } {
  if (!raw.trim()) return { value: [] };
  const result: ClassifierParameter[] = [];
  for (const text of raw.split(',')) {
    const match = text.trim().match(/^([A-Za-z_][\w-]*)(?:\s*:\s*(\S+))?$/);
    if (!match) return { error: `Invalid operation parameter: ${text.trim()}` };
    if (match[2] && !UML_TYPE.test(match[2])) return { error: `Invalid operation parameter type: ${match[2]}` };
    result.push({ name: match[1], ...(match[2]?.trim() ? { type: match[2].trim() } : {}) });
  }
  return { value: result };
}

export function parseCoralUmlMember(
  line: string,
  compartment: UmlMemberKind,
  ordinal: number,
): { value?: UmlMember; error?: string } {
  if (compartment === 'literals') {
    const match = line.match(new RegExp(`^literal\\s+([A-Za-z_][\\w-]*)(?:\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)")?(?:\\s+as\\s+(${UML_IDENTITY}))?$`));
    if (!match) return { error: 'Literal must use: literal NAME [= "value"] [as id]' };
    const parsedId = parseUmlIdentity(match[3]);
    if (parsedId.error) return { error: parsedId.error };
    let value: string | undefined;
    if (match[2] !== undefined) {
      try { value = JSON.parse(`"${match[2]}"`) as string; }
      catch { return { error: 'Literal value must use valid JSON string escapes' }; }
    }
    return { value: {
      id: parsedId.value ?? `literal-${ordinal}`, kind: 'literal', name: match[1],
      ...(value !== undefined ? { value } : {}),
    } };
  }

  const operation = compartment === 'operations';
  const keyword = operation ? 'operation' : 'attribute';
  const head = `(?:([+\\-#~])\\s+|${keyword}\\s+)`;
  if (operation) {
    const match = line.match(new RegExp(`^${head}([A-Za-z_][\\w-]*)\\s*\\(([^)]*)\\)(?:\\s*:\\s*([^\\s{]+))?(?:\\s+as\\s+(${UML_IDENTITY}))?(?:\\s*\\{([^{}]+)\\})?$`));
    if (!match) return { error: 'Operation must use a visibility sign or operation keyword and a parameter list' };
    const parsedParameters = parameters(match[3]);
    if (!parsedParameters.value) return { error: parsedParameters.error };
    if (match[4] && !UML_TYPE.test(match[4])) return { error: `Invalid operation return type: ${match[4]}` };
    const modifiers = parseModifiers(match[6], ['abstract', 'static']);
    if (modifiers.error) return { error: modifiers.error };
    const parsedId = parseUmlIdentity(match[5]);
    if (parsedId.error) return { error: parsedId.error };
    return { value: {
      id: parsedId.value ?? `operation-${ordinal}`, kind: 'operation',
      ...(match[1] ? { visibility: VISIBILITY[match[1] as keyof typeof VISIBILITY] } : {}),
      name: match[2], parameters: parsedParameters.value,
      ...(match[4] ? { returnType: match[4] } : {}),
      ...(modifiers.value ? { modifiers: modifiers.value } : {}),
    } };
  }

  const match = line.match(new RegExp(`^${head}([A-Za-z_][\\w-]*)(?:\\s*:\\s*([^\\s{]+))?(?:\\s+as\\s+(${UML_IDENTITY}))?(?:\\s*\\{([^{}]+)\\})?$`));
  if (!match) return { error: 'Attribute must use a visibility sign or attribute keyword' };
  if (match[3] && !UML_TYPE.test(match[3])) return { error: `Invalid attribute type: ${match[3]}` };
  const modifiers = parseModifiers(match[5], ['static', 'readonly', 'derived']);
  if (modifiers.error) return { error: modifiers.error };
  const parsedId = parseUmlIdentity(match[4]);
  if (parsedId.error) return { error: parsedId.error };
  return { value: {
    id: parsedId.value ?? `attribute-${ordinal}`, kind: 'attribute',
    ...(match[1] ? { visibility: VISIBILITY[match[1] as keyof typeof VISIBILITY] } : {}),
    name: match[2], ...(match[3] ? { type: match[3] } : {}),
    ...(modifiers.value ? { modifiers: modifiers.value } : {}),
  } };
}

function modifierText(modifiers: readonly string[] | undefined): string {
  return modifiers?.length ? ` {${modifiers.join(', ')}}` : '';
}

export function formatUmlMember(member: UmlMember, expectedId: string): string {
  const id = member.id === expectedId ? '' : ` as ${quoteIfNeeded(member.id)}`;
  if (member.kind === 'literal') {
    return `literal ${member.name}${member.value === undefined ? '' : ` = ${JSON.stringify(member.value)}`}${id}`;
  }
  const prefix = member.visibility ? `${VISIBILITY_SIGN[member.visibility]} ` : `${member.kind === 'operation' ? 'operation' : 'attribute'} `;
  if (member.kind === 'attribute') {
    return `${prefix}${member.name}${member.type ? `: ${member.type}` : ''}${id}${modifierText(member.modifiers)}`;
  }
  const params = member.parameters.map((parameter) => `${parameter.name}${parameter.type ? `: ${parameter.type}` : ''}`).join(', ');
  return `${prefix}${member.name}(${params})${member.returnType ? `: ${member.returnType}` : ''}${id}${modifierText(member.modifiers)}`;
}

export function isClassifierCompartment(value: ClassifierCompartment, kind: UmlMemberKind): boolean {
  return value.kind === kind;
}
