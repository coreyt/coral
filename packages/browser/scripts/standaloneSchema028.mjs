/** Fold Ajv's static schema references into the compiled program. The original
 * schema is compiled unchanged; no validation rule is removed or interpreted. */
import ts from 'typescript';

export function foldStandaloneSchema028(code) {
  const source = ts.createSourceFile('validator.cjs', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const schemas = new Map();
  const ownChecks = new Set();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const name = declaration.name.getText(source);
      if (/^schema\d+$/.test(name)) schemas.set(name, JSON.parse(declaration.initializer.getText(source)));
      if (declaration.initializer?.getText(source) === 'Object.prototype.hasOwnProperty') ownChecks.add(name);
    }
  }
  if (!schemas.size) throw new Error('Standalone schema constants were not found; review compiler binding.');
  const literal = (value) => {
    if (value === null) return ts.factory.createNull();
    if (typeof value === 'string') return ts.factory.createStringLiteral(value);
    if (typeof value === 'number') return value < 0
      ? ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, ts.factory.createNumericLiteral(-value))
      : ts.factory.createNumericLiteral(value);
    if (typeof value === 'boolean') return value ? ts.factory.createTrue() : ts.factory.createFalse();
    if (Array.isArray(value)) return ts.factory.createArrayLiteralExpression(value.map(literal));
    return ts.factory.createObjectLiteralExpression(Object.entries(value).map(([key, item]) =>
      ts.factory.createPropertyAssignment(key === '__proto__'
        ? ts.factory.createComputedPropertyName(ts.factory.createStringLiteral(key)) : ts.factory.createStringLiteral(key), literal(item))));
  };
  const staticValue = (node) => {
    const keys = [];
    while (ts.isPropertyAccessExpression(node)) { keys.unshift(node.name.text); node = node.expression; }
    if (!ts.isIdentifier(node) || !schemas.has(node.text)) return undefined;
    let value = schemas.get(node.text);
    for (const key of keys) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key))
        throw new Error(`Unknown standalone schema reference: ${node.text}.${keys.join('.')}`);
      value = value[key];
    }
    return { value };
  };
  let folded = 0;
  const transformed = ts.transform(source, [(context) => {
    const visit = (node) => {
      if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
        schemas.has(declaration.name.getText(source)))) {
        if (node.declarationList.declarations.length !== 1) throw new Error('Mixed schema declarations require review.');
        return undefined;
      }
      const constant = (ts.isPropertyAccessExpression(node) || ts.isIdentifier(node)) ? staticValue(node) : undefined;
      if (constant) {
        if (ts.isIdentifier(node)) throw new Error(`Bare standalone schema reference ${node.text} requires review.`);
        folded++;
        const parent = node.parent;
        // Object.prototype.hasOwnProperty.call reads only the property names.
        // Supplying the same own keys avoids retaining their schema definitions.
        const membership = ts.isCallExpression(parent) && parent.arguments[0] === node &&
          ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === 'call' &&
          ts.isIdentifier(parent.expression.expression) && ownChecks.has(parent.expression.expression.text);
        return literal(membership ? Object.fromEntries(Object.keys(constant.value).map((key) => [key, null])) : constant.value);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (root) => ts.visitNode(root, visit);
  }]);
  try {
    if (!folded) throw new Error('No standalone schema references were folded; review compiler binding.');
    return { code: ts.createPrinter({ removeComments: false }).printFile(transformed.transformed[0]), folded };
  } finally { transformed.dispose(); }
}
