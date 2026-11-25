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
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'schemaPath' &&
        ts.isStringLiteral(node.initializer)) {
        return undefined;
      }
      // Core only reads keywords that append a property to the diagnostic path.
      // Other keywords do not affect validation or the preserved Ajv message.
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'keyword' &&
        ts.isStringLiteral(node.initializer) &&
        !['required', 'additionalProperties'].includes(node.initializer.text)) return undefined;
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'params' &&
        ts.isObjectLiteralExpression(node.initializer)) {
        const keep = node.initializer.properties.some((p) =>
          ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) &&
          (p.name.text === 'missingProperty' || p.name.text === 'additionalProperty'));
        if (!keep) return undefined;
      }
      // Factor repeated error-object keys without changing Core's observable
      // paths or Ajv-generated messages. No validation branch is rewritten.
      if (ts.isObjectLiteralExpression(node)) {
        const props = new Map(node.properties.filter((p) =>
          ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
          .map((p) => [p.name.getText(source), p]));
        if (props.has('instancePath') && props.has('keyword') && props.has('message')) {
          const value = (key) => {
            const p = props.get(key);
            return ts.isShorthandPropertyAssignment(p) ? p.name : ts.visitNode(p.initializer, visit);
          };
          const args = [value('instancePath'), value('message')];
          const keyword = props.get('keyword').initializer.text;
          if (['required', 'additionalProperties'].includes(keyword)) {
            const key = keyword === 'required' ? 'missingProperty' : 'additionalProperty';
            const param = props.get('params').initializer.properties.find((p) => p.name.getText(source) === key);
            args.push(ts.factory.createNumericLiteral(keyword === 'required' ? 1 : 2), ts.visitNode(param.initializer, visit));
          }
          return ts.factory.createCallExpression(ts.factory.createIdentifier('_e'), undefined, args);
        }
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
    let out = ts.createPrinter({ removeComments: false }).printFile(transformed.transformed[0]);
    const helper = 'function _p(v,e){return v===null?[e]:(v.push(e),v);}' +
      'function _e(p,m,k,v){const e={instancePath:p,message:m};if(k){e.keyword=k===1?"required":"additionalProperties";e.params=k===1?{missingProperty:v}:{additionalProperty:v};}return e;}\n';
    out = out
      .replace(/const err\d+ = (_e\([^;]+\));\s*if \(vErrors === null\) \{\s*vErrors = \[err\d+\];\s*\}\s*else \{\s*vErrors\.push\(err\d+\);\s*\}\s*errors\+\+;/g, 'vErrors=_p(vErrors,$1);errors++;');
    return { code: out.replace('"use strict";', `"use strict";\n${helper}`), folded };
  } finally { transformed.dispose(); }
}
