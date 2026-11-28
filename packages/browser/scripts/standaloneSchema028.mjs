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
  const messagePool = [];
  const messageIndex = new Map();
  // 1-based indices so 0 stays reserved for standard required/additionalProperties messages.
  const internMessage = (text) => {
    let idx = messageIndex.get(text);
    if (idx === undefined) {
      idx = messagePool.length + 1;
      messagePool.push(text);
      messageIndex.set(text, idx);
    }
    return ts.factory.createNumericLiteral(idx);
  };
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
      // Factor repeated error-object keys and repeated static Ajv messages
      // without changing Core's observable paths or Ajv-generated messages.
      // No validation branch is rewritten.
      if (ts.isObjectLiteralExpression(node)) {
        const props = new Map(node.properties.filter((p) =>
          ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
          .map((p) => [p.name.getText(source), p]));
        if (props.has('instancePath') && props.has('keyword') && props.has('message')) {
          const value = (key) => {
            const p = props.get(key);
            return ts.isShorthandPropertyAssignment(p) ? p.name : ts.visitNode(p.initializer, visit);
          };
          const msgNode = value('message');
          const keyword = props.get('keyword').initializer.text;
          if (keyword === 'required' || keyword === 'additionalProperties') {
            const key = keyword === 'required' ? 'missingProperty' : 'additionalProperty';
            const param = props.get('params').initializer.properties.find((p) => p.name.getText(source) === key);
            const paramNode = ts.visitNode(param.initializer, visit);
            const requiredPropText = (() => {
              if (!ts.isStringLiteral(paramNode)) return undefined;
              if (ts.isStringLiteral(msgNode) && msgNode.text === `must have required property '${paramNode.text}'`) return paramNode.text;
              // Ajv emits `"must have required property '" + "prop" + "'"` as nested BinaryExpression.
              if (ts.isBinaryExpression(msgNode) && msgNode.operatorToken.kind === ts.SyntaxKind.PlusToken
                && ts.isStringLiteral(msgNode.right) && msgNode.right.text === "'"
                && ts.isBinaryExpression(msgNode.left) && msgNode.left.operatorToken.kind === ts.SyntaxKind.PlusToken
                && ts.isStringLiteral(msgNode.left.left) && msgNode.left.left.text === "must have required property '"
                && ts.isStringLiteral(msgNode.left.right) && msgNode.left.right.text === paramNode.text) {
                return paramNode.text;
              }
              return undefined;
            })();
            const standardRequired = keyword === 'required' && requiredPropText !== undefined;
            const standardAdditional = keyword === 'additionalProperties' && ts.isStringLiteral(msgNode)
              && msgNode.text === 'must NOT have additional properties';
            const msgArg = (standardRequired || standardAdditional)
              ? ts.factory.createNumericLiteral(0)
              : (ts.isStringLiteral(msgNode) ? internMessage(msgNode.text) : msgNode);
            return ts.factory.createCallExpression(ts.factory.createIdentifier('_e'), undefined, [
              value('instancePath'),
              msgArg,
              ts.factory.createNumericLiteral(keyword === 'required' ? 1 : 2),
              paramNode,
            ]);
          }
          const msgArg = ts.isStringLiteral(msgNode) ? internMessage(msgNode.text) : msgNode;
          return ts.factory.createCallExpression(ts.factory.createIdentifier('_e'), undefined, [
            value('instancePath'),
            msgArg,
          ]);
        }
      }
      // Factor pure `ident === "a" || ident === "b" || ...` chains (enum and
      // additionalProperties membership checks) without altering semantics.
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
        const unwrap = (expr) => ts.isParenthesizedExpression(expr) ? unwrap(expr.expression) : expr;
        const collectEqChain = (expr) => {
          const e = unwrap(expr);
          if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
            const left = collectEqChain(e.left);
            const right = collectEqChain(e.right);
            if (left && right && left.id === right.id) return { id: left.id, values: [...left.values, ...right.values] };
            return null;
          }
          if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
            const l = unwrap(e.left);
            const r = unwrap(e.right);
            if (ts.isIdentifier(l) && ts.isStringLiteral(r) && !r.text.includes('|')) return { id: l.text, values: [r.text] };
          }
          return null;
        };
        const chain = collectEqChain(node);
        if (chain && chain.values.length >= 2) {
          return ts.factory.createCallExpression(ts.factory.createIdentifier('_in'), undefined, [
            ts.factory.createIdentifier(chain.id),
            ts.factory.createStringLiteral(chain.values.join('|')),
          ]);
        }
      }
      // Replace `Object.prototype.hasOwnProperty.call(schemaX.properties, key)`
      // with `_in(key, "k1|k2|...")` so neither schema definitions nor dummy
      // `{k:null}` lookup maps are retained.
      if (ts.isCallExpression(node) && node.arguments.length === 2 &&
        ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'call' &&
        ts.isIdentifier(node.expression.expression) && ownChecks.has(node.expression.expression.text) &&
        ts.isPropertyAccessExpression(node.arguments[0])) {
        const target = staticValue(node.arguments[0]);
        if (target && target.value && typeof target.value === 'object' && !Array.isArray(target.value)) {
          const keys = Object.keys(target.value);
          if (keys.every((k) => !k.includes('|'))) {
            folded++;
            return ts.factory.createCallExpression(ts.factory.createIdentifier('_in'), undefined, [
              ts.visitNode(node.arguments[1], visit),
              ts.factory.createStringLiteral(keys.join('|')),
            ]);
          }
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
    const mStr = messageIndex.get('must be string') ?? 0;
    const mEnum = messageIndex.get('must be equal to one of the allowed values') ?? 0;
    const mNum = messageIndex.get('must be number') ?? 0;
    const mGe0 = messageIndex.get('must be >= 0') ?? 0;
    const mConst = messageIndex.get('must be equal to constant') ?? 0;
    const mArr = messageIndex.get('must be array') ?? 0;
    const helper = `const _m=${JSON.stringify(messagePool)};let _d=0,_v=null;` +
      'function _p(v,e){return v===null?[e]:(v.push(e),v);}' +
      'function _c(v,e){return v===null?e:v.concat(e);}' +
      'function _s(f,d,p,v){return f(d,p)?0:((_v=_c(v,f.errors)),1);}' +
      'function _t(v,n){return v?(n?(v.length=n,v):null):null;}' +
      'function _r(e){if(e.dynamicProps)e.props=void 0;if(e.dynamicItems)e.items=void 0;return e;}' +
      'function _ev(f,p,d){f.evaluated=p?{props:true,dynamicProps:!!d,dynamicItems:false}:{dynamicProps:!!d,dynamicItems:false};}' +
      'function _o(d){return Boolean(d&&typeof d==="object"&&!Array.isArray(d));}' +
      'function _n(d){return typeof d==="number"&&isFinite(d);}' +
      'function _in(v,s){return typeof v==="string"&&("|"+s+"|").includes("|"+v+"|");}' +
      'function _e(p,m,k,v){const e={instancePath:p,message:m===0?(k===1?"must have required property \'"+v+"\'":"must NOT have additional properties"):typeof m==="number"?_m[m-1]:m};if(k){e.keyword=k===1?"required":"additionalProperties";e.params=k===1?{missingProperty:v}:{additionalProperty:v};}return e;}' +
      'function _pe(v,p,m,k,x){return _p(v,_e(p,m,k,x));}' +
      'function _rq(d,p,s,v){_d=0;for(const k of s.split("|"))if(d[k]===void 0){v=_pe(v,p,0,1,k);_d++;}return v;}' +
      'function _ak(d,p,s,v){_d=0;for(const k in d)if(!_in(k,s)){v=_pe(v,p,0,2,k);_d++;}return v;}' +
      'function _ops(d,p,v,e,a){_d=e;for(let i=0;i<a.length;i+=2){const k=a[i];if(d[k]!==void 0&&_s(a[i+1],d[k],p+"/"+k,v)){v=_v;_d=v.length;}}return v;}' +
      `function _en(d,p,s,v){_d=0;if(typeof d!=="string"){v=_pe(v,p,${mStr});_d++;}if(!_in(d,s)){v=_pe(v,p,${mEnum});_d++;}return v;}` +
      `function _nn(d,p,v){_d=0;if(!_n(d)){v=_pe(v,p,${mNum});_d=1;}else if(d<0){v=_pe(v,p,${mGe0});_d=1;}return v;}` +
      `function _ck(d,k,c,p,v){_d=0;if(d[k]!==void 0&&c!==d[k]){v=_pe(v,p+"/"+k,${mConst});_d=1;}return v;}` +
      `function _as(a,p,f,v,e){_d=e;for(let i=0;i<a.length;i++)if(_s(f,a[i],p+"/"+i,v)){v=_v;_d=v.length;}return v;}` +
      `function _ar(d,k,p,f,v,e){_d=e;if(d[k]!==void 0){const a=d[k];if(Array.isArray(a))v=_as(a,p+"/"+k,f,v,e);else{v=_pe(v,p+"/"+k,${mArr});_d=e+1;}}return v;}` +
      'function _uq(a,p,eq,v){_d=0;for(let i=a.length;i--;)for(let j=i;j--;)if(eq(a[i],a[j])){_d=1;return _pe(v,p,_dm(j,i));}return v;}' +
      'function _dm(j,i){return "must NOT have duplicate items (items ## "+j+" and "+i+" are identical)";}\n';
    // Only strip unused Ajv context params when no schema rule reads them.
    const unusedCtx = !/\b(parentData|parentDataProperty|rootData|dynamicAnchors)\b/.test(
      out
        .replace(/function validate\d+\(data, \{ instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = \{\} \} = \{\}\)/g, '')
        .replace(/\{ instancePath[^}]*parentData[^}]*dynamicAnchors \}/g, ''),
    );
    out = out
      .replace(/const err\d+ = (_e\([^;]+\));\s*if \(vErrors === null\) \{\s*vErrors = \[err\d+\];\s*\}\s*else \{\s*vErrors\.push\(err\d+\);\s*\}\s*errors\+\+;/g, 'vErrors=_p(vErrors,$1);errors++;')
      .replace(/const err\d+ = \{\};\s*if \(vErrors === null\) \{\s*vErrors = \[err\d+\];\s*\}\s*else \{\s*vErrors\.push\(err\d+\);\s*\}\s*errors\+\+;/g, 'vErrors=_p(vErrors,{});errors++;')
      .replace(/vErrors = vErrors === null \? ((?:validate\d+|wrapper\d+\.validate)\.errors) : vErrors\.concat\(\1\);/g, 'vErrors=_c(vErrors,$1);')
      .replace(/if \(vErrors !== null\) \{\s*if \((_errs\d+)\) \{\s*vErrors\.length = \1;\s*\}\s*else \{\s*vErrors = null;\s*\}\s*\}/g, 'vErrors=_t(vErrors,$1);')
      .replace(/const evaluated0 = (validate\d+\.evaluated); if \(evaluated0\.dynamicProps\) \{\s*evaluated0\.props = undefined;\s*\} if \(evaluated0\.dynamicItems\) \{\s*evaluated0\.items = undefined;\s*\}/g, 'const evaluated0=_r($1);')
      .replace(/\b(\w+) && typeof \1 == "object" && !Array\.isArray\(\1\)/g, '_o($1)')
      .replace(/\(typeof (\w+) == "number"\) && \(isFinite\(\1\)\)/g, '_n($1)');
    if (unusedCtx) {
      const rootExport = /module\.exports\s*=\s*(validate\d+);/.exec(out)?.[1];
      out = out
        .replace(/function (validate\d+)\(data, \{ instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = \{\} \} = \{\}\)/g, (_, name) =>
          name === rootExport
            ? `function ${name}(data, { instancePath = "" } = {})`
            : `function ${name}(data, instancePath = "")`)
        .replace(/((?:validate\d+|wrapper\d+\.validate))\(([^,]+), \{ instancePath: ([^,]+), parentData: [^,]+, parentDataProperty: [^,]+, rootData, dynamicAnchors \}\)/g, (_, fn, d, p) =>
          fn === rootExport ? `${fn}(${d},{instancePath:${p}})` : `${fn}(${d},${p})`)
        .replace(/((?:validate\d+|wrapper\d+\.validate))\(([^,]+), \{ instancePath, parentData, parentDataProperty, rootData, dynamicAnchors \}\)/g, (_, fn, d) =>
          fn === rootExport ? `${fn}(${d},{instancePath})` : `${fn}(${d},instancePath)`);
    }
    out = out.replace(/if \(!\(((?:validate\d+|wrapper\d+\.validate))\(([^,]+),([^)]+)\)\)\) \{\s*vErrors=_c\(vErrors,\1\.errors\);\s*errors = vErrors\.length;\s*\}/g,
      'if(_s($1,$2,$3,vErrors))errors=(vErrors=_v).length;');
    out = out.replace(/vErrors=_p\(vErrors,_e\(([^;]+)\)\);errors\+\+;/g, 'vErrors=_pe(vErrors,$1);errors++;');
    // Collapse consecutive required-property checks on the same object & path.
    out = out.replace(/(?:if \((data\d*)\.([A-Za-z0-9_]+) === undefined\) \{\s*vErrors=_pe\(vErrors,(instancePath(?:\s*\+\s*"[^"]*")?),\s*0,\s*1,\s*"\2"\);errors\+\+;\s*\}\s*){2,}/g, (block) => {
      const items = [...block.matchAll(/if \((data\d*)\.([A-Za-z0-9_]+) === undefined\) \{\s*vErrors=_pe\(vErrors,(instancePath(?:\s*\+\s*"[^"]*")?),\s*0,\s*1,\s*"\2"\);errors\+\+;\s*\}/g)];
      if (items.length < 2) return block;
      const target = items[0][1];
      const pathExpr = items[0][3];
      if (items.some((m) => m[1] !== target || m[3] !== pathExpr)) return block;
      const keys = items.map((m) => m[2]).join('|');
      return `vErrors=_rq(${target},${pathExpr},"${keys}",vErrors);errors+=_d;\n`;
    });
    // Collapse consecutive optional-property sub-validator calls on the same object & path.
    out = out.replace(/(?:if \((data\d*)\.([A-Za-z0-9_]+) !== undefined\) \{\s*if\(_s\(((?:validate\d+|wrapper\d+\.validate)),\1\.\2,(instancePath(?:\s*\+\s*"[^"]*")?)\s*\+\s*"\/\2",vErrors\)\)errors=\(vErrors=_v\)\.length;\s*\}\s*)+/g, (block) => {
      const items = [...block.matchAll(/if \((data\d*)\.([A-Za-z0-9_]+) !== undefined\) \{\s*if\(_s\(((?:validate\d+|wrapper\d+\.validate)),\1\.\2,(instancePath(?:\s*\+\s*"[^"]*")?)\s*\+\s*"\/\2",vErrors\)\)errors=\(vErrors=_v\)\.length;\s*\}/g)];
      if (!items.length) return block;
      const groups = [];
      for (const m of items) {
        const [, target, prop, fn, pathExpr] = m;
        const last = groups.at(-1);
        if (last && last.target === target && last.pathExpr === pathExpr) {
          last.pairs.push(`${JSON.stringify(prop)},${fn}`);
        } else {
          groups.push({ target, pathExpr, pairs: [`${JSON.stringify(prop)},${fn}`] });
        }
      }
      return groups.map((g) => `vErrors=_ops(${g.target},${g.pathExpr},vErrors,errors,[${g.pairs.join(',')}]);errors=_d;\n`).join('');
    });
    if (mStr && mEnum) {
      out = out.replace(
        new RegExp(`if \\(typeof (data\\d*) !== "string"\\) \\{\\s*vErrors=_pe\\(vErrors,([^,]+),\\s*${mStr}\\);errors\\+\\+;\\s*\\}\\s*if \\(!\\(_in\\(\\1, ("[^"]+")\\)\\)\\) \\{\\s*vErrors=_pe\\(vErrors,\\2,\\s*${mEnum}\\);errors\\+\\+;\\s*\\}`, 'g'),
        'vErrors=_en($1,$2,$3,vErrors);errors+=_d;',
      );
    }
    if (mNum && mGe0) {
      out = out.replace(
        new RegExp(`if \\(_n\\((data\\d*)\\)\\) \\{\\s*if \\(\\1 < 0 \\|\\| isNaN\\(\\1\\)\\) \\{\\s*vErrors=_pe\\(vErrors,([^,]+),\\s*${mGe0}\\);errors\\+\\+;\\s*\\}\\s*\\}\\s*else \\{\\s*vErrors=_pe\\(vErrors,\\2,\\s*${mNum}\\);errors\\+\\+;\\s*\\}`, 'g'),
        'vErrors=_nn($1,$2,vErrors);errors+=_d;',
      );
    }
    if (mConst) {
      out = out.replace(
        new RegExp(`if \\((data\\d*)\\.([A-Za-z0-9_]+) !== undefined\\) \\{\\s*if \\(("[^"]+") !== \\1\\.\\2\\) \\{\\s*vErrors=_pe\\(vErrors,(instancePath(?:\\s*\\+\\s*"[^"]*")?)\\s*\\+\\s*"\\/\\2",\\s*${mConst}\\);errors\\+\\+;\\s*\\}\\s*\\}`, 'g'),
        'vErrors=_ck($1,"$2",$3,$4,vErrors);errors+=_d;',
      );
    }
    out = out.replace(
      /const len\d+ = (data\d+)\.length;\s*for \(let (i\d+) = 0; \2 < len\d+; \2\+\+\) \{\s*if\(_s\(((?:validate\d+|wrapper\d+\.validate)),\1\[\2\],([^,]+)\s*\+\s*"\/"\s*\+\s*\2,vErrors\)\)errors=\(vErrors=_v\)\.length;\s*\}/g,
      'vErrors=_as($1,$4,$3,vErrors,errors);errors=_d;',
    );
    if (mArr) {
      out = out.replace(
        new RegExp(`if \\((data\\d*)\\.([A-Za-z0-9_]+) !== undefined\\) \\{\\s*let (data\\d+) = \\1\\.\\2;\\s*if \\(Array\\.isArray\\(\\3\\)\\) \\{\\s*vErrors=_as\\(\\3,(instancePath(?:\\s*\\+\\s*"[^"]*")?)\\s*\\+\\s*"\\/\\2",((?:validate\\d+|wrapper\\d+\\.validate)),vErrors,errors\\);errors=_d;\\s*\\}\\s*else \\{\\s*vErrors=_pe\\(vErrors,\\4\\s*\\+\\s*"\\/\\2",\\s*${mArr}\\);errors\\+\\+;\\s*\\}\\s*\\}`, 'g'),
        'vErrors=_ar($1,"$2",$4,$5,vErrors,errors);errors=_d;',
      );
    }
    // Factor additionalProperties allowlist loops and evaluated metadata.
    out = out
      .replace(/for \(const (key\d+) in (data\d*)\) \{\s*if \(!\(_in\(\1, ("[^"]+")\)\)\) \{\s*vErrors=_pe\(vErrors,(instancePath(?:\s*\+\s*"[^"]*")?),\s*0,\s*2,\s*\1\);errors\+\+;\s*\}\s*\}/g,
        'vErrors=_ak($2,$4,$3,vErrors);errors+=_d;')
      .replace(/(validate\d+)\.evaluated = \{ "props": true, "dynamicProps": false, "dynamicItems": false \};/g, '_ev($1,1);')
      .replace(/(validate\d+)\.evaluated = \{ "dynamicProps": false, "dynamicItems": false \};/g, '_ev($1);')
      .replace(/(validate\d+)\.evaluated = \{ "dynamicProps": true, "dynamicItems": false \};/g, '_ev($1,0,1);')
      .replace(/"must NOT have duplicate items \(items ## " \+ (j\d+) \+ " and " \+ (i\d+) \+ " are identical\)"/g, '_dm($1,$2)')
      .replace(/let (i\d+) = (data\d+)\.length;\s*let (j\d+);\s*if \(\1 > 1\) \{\s*outer\d+: for \(; \1--;\) \{\s*for \(\3 = \1; \3--;\) \{\s*if \((func\d+)\(\2\[\1\], \2\[\3\]\)\) \{\s*vErrors=_pe\(vErrors,([^,]+),\s*_dm\(\3,\1\)\);errors\+\+;\s*break outer\d+;\s*\}\s*\}\s*\}\s*\}/g,
        'vErrors=_uq($2,$5,$4,vErrors);errors+=_d;');
    for (const own of ownChecks) {
      if ((out.match(new RegExp(`\\b${own}\\b`, 'g')) || []).length === 1) {
        out = out.replace(new RegExp(`const ${own} = Object\\.prototype\\.hasOwnProperty;\\s*`), '');
      }
    }
    return { code: out.replace('"use strict";', `"use strict";\n${helper}`), folded };
  } finally { transformed.dispose(); }
}
