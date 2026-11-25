import { createHash } from 'node:crypto';
import { matchesGlob, posix } from 'node:path';
import ts from 'typescript';

const SOURCE_PATTERNS = [
  'packages/**/*.test.ts',
  'packages/**/*.test.tsx',
  'packages/**/test/**/*.ts',
  'packages/**/test/**/*.tsx',
  'e2e/**/*.spec.ts',
  'e2e/**/*.spec.tsx',
];

export function isEmbeddedCoralSource(path) {
  return SOURCE_PATTERNS.some((pattern) => matchesGlob(path, pattern));
}

function unwrap(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
}

function isTypeQueryReference(node) {
  let current = node;
  while (ts.isQualifiedName(current.parent)) current = current.parent;
  return ts.isTypeQueryNode(current.parent);
}

function constBinding(node, checker) {
  const symbol = checker.getSymbolAtLocation(node);
  const declaration = symbol?.valueDeclaration;
  if (!symbol || !declaration || !ts.isVariableDeclaration(declaration) ||
    !ts.isVariableDeclarationList(declaration.parent) ||
    (declaration.parent.flags & ts.NodeFlags.Const) === 0 || !declaration.initializer) return undefined;
  return { symbol, declaration, initializer: declaration.initializer };
}

function isJoinOnlyArrayBinding(symbol, declaration, checker, file) {
  let safe = true;
  const visit = (node) => {
    if (!safe) return;
    if (ts.isIdentifier(node) && checker.getSymbolAtLocation(node) === symbol && node !== declaration.name) {
      const access = node.parent;
      if (!ts.isPropertyAccessExpression(access) || access.expression !== node || access.name.text !== 'join' ||
        !ts.isCallExpression(access.parent) || access.parent.expression !== access) {
        safe = false;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return safe;
}

function staticTextArray(node, context, seen = new Set()) {
  node = unwrap(node);
  if (ts.isIdentifier(node)) {
    const binding = constBinding(node, context.checker);
    if (!binding || seen.has(binding.symbol) ||
      !isJoinOnlyArrayBinding(binding.symbol, binding.declaration, context.checker, context.file)) return undefined;
    return staticTextArray(binding.initializer, context, new Set([...seen, binding.symbol]));
  }
  if (!ts.isArrayLiteralExpression(node)) return undefined;
  const values = [];
  for (const element of node.elements) {
    const value = staticText(element, context, seen);
    if (value === undefined) return undefined;
    values.push(value);
  }
  return values;
}

function staticText(node, context, seen = new Set()) {
  node = unwrap(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) {
    const binding = constBinding(node, context.checker);
    if (!binding || seen.has(binding.symbol)) return undefined;
    return staticText(binding.initializer, context, new Set([...seen, binding.symbol]));
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticText(node.left, context, seen);
    const right = staticText(node.right, context, seen);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = staticText(span.expression, context, seen);
      if (expression === undefined) return undefined;
      value += expression + span.literal.text;
    }
    return value;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'trim' && node.arguments.length === 0) {
    const value = staticText(node.expression.expression, context, seen);
    return value?.trim();
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'join' && node.arguments.length <= 1) {
    const values = staticTextArray(node.expression.expression, context, seen);
    const separator = node.arguments.length === 0 ? ',' : staticText(node.arguments[0], context, seen);
    return values === undefined || separator === undefined ? undefined : values.join(separator);
  }
  return undefined;
}

function isCoralParserImport(path, moduleName, imported) {
  if (moduleName === '@coral-viz/language' || moduleName === '@coral-viz/language/parser')
    return imported === 'parse';
  if (imported === 'parseCoralDSL' && path.startsWith('packages/diagram-editor/')) {
    const resolved = posix.normalize(posix.join(posix.dirname(path), moduleName))
      .replace(/\.[cm]?[jt]s$/, '');
    return resolved === 'packages/diagram-editor/src/parsers';
  }
  if (imported !== 'parse' || !path.startsWith('packages/language/')) return false;
  const resolved = posix.normalize(posix.join(posix.dirname(path), moduleName))
    .replace(/\.[cm]?[jt]s$/, '');
  return resolved === 'packages/language/src/index' ||
    resolved === 'packages/language/src/parser/index';
}

/** Discover statically resolvable strings passed to imported Coral parsers. */
export function embeddedCoralInputs(path, source) {
  if (!isEmbeddedCoralSource(path)) return [];
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const options = { target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext, noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options, true);
  host.fileExists = (fileName) => fileName === path;
  host.readFile = (fileName) => fileName === path ? source : undefined;
  host.getSourceFile = (fileName, languageVersion) => fileName === path
    ? ts.createSourceFile(fileName, source, languageVersion, true, kind)
    : undefined;
  const program = ts.createProgram([path], options, host);
  const file = program.getSourceFile(path);
  if (!file) return [];
  const checker = program.getTypeChecker();
  const context = { checker, file };
  const consumers = new Set();
  const namespaceConsumers = new Map();

  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings ||
      statement.importClause.isTypeOnly) continue;
    const moduleName = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
    const bindings = statement.importClause.namedBindings;
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        const imported = element.propertyName?.text ?? element.name.text;
        const symbol = checker.getSymbolAtLocation(element.name);
        if (symbol && isCoralParserImport(path, moduleName, imported)) consumers.add(symbol);
      }
    } else {
      const member = ['parse', 'parseCoralDSL']
        .find((candidate) => isCoralParserImport(path, moduleName, candidate));
      const symbol = checker.getSymbolAtLocation(bindings.name);
      if (symbol && member) namespaceConsumers.set(symbol, member);
    }
  }

  const found = new Map();
  const unsupportedReferences = [];
  const namespaceAccess = (node) => {
    if ((!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) ||
      !ts.isIdentifier(node.expression)) return undefined;
    const member = namespaceConsumers.get(checker.getSymbolAtLocation(node.expression));
    if (!member) return undefined;
    const accessed = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : (() => {
          const argument = node.argumentExpression && unwrap(node.argumentExpression);
          return argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
            ? argument.text
            : undefined;
        })();
    return { member, accessed };
  };
  const isParserExpression = (node) => {
    if (ts.isIdentifier(node)) return consumers.has(checker.getSymbolAtLocation(node));
    const access = namespaceAccess(node);
    return access !== undefined && access.accessed === access.member;
  };
  const visit = (node) => {
    if (ts.isIdentifier(node) && namespaceConsumers.has(checker.getSymbolAtLocation(node))) {
      const declaration = ts.isNamespaceImport(node.parent) && node.parent.name === node;
      const typeOnly = isTypeQueryReference(node);
      const access = (ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) &&
        node.parent.expression === node ? namespaceAccess(node.parent) : undefined;
      if (!declaration && !typeOnly && (!access || access.accessed === undefined)) {
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        unsupportedReferences.push(`${path}:${line} recognized Coral parser namespace must not escape`);
      }
    }
    if (isParserExpression(node)) {
      const declaration = ts.isImportSpecifier(node.parent) && node.parent.name === node;
      const directCall = ts.isCallExpression(node.parent) && node.parent.expression === node;
      const typeOnly = isTypeQueryReference(node);
      if (!declaration && !directCall && !typeOnly) {
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        unsupportedReferences.push(`${path}:${line} recognized Coral parser import must be called directly`);
      }
    }
    if (ts.isCallExpression(node) && isParserExpression(node.expression) && node.arguments.length > 0) {
      const text = staticText(node.arguments[0], context);
      if (text !== undefined) {
        const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
        const id = `${path}#${hash}`;
        const line = file.getLineAndCharacterOfPosition(node.arguments[0].getStart(file)).line + 1;
        if (!found.has(id)) found.set(id, { id, file: path, line, text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (unsupportedReferences.length > 0) throw new Error(unsupportedReferences.join('; '));
  return [...found.values()].sort((left, right) => left.id.localeCompare(right.id));
}
