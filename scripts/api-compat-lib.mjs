import { gunzipSync } from 'node:zlib';
import { access, stat } from 'node:fs/promises';
import pathApi, { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

function fail(message) {
  throw new Error(`API compatibility: ${message}`);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

function contractPath(parent, key) {
  if (parent === 'exports' && key.startsWith('.')) return `${parent}${key}`;
  return `${parent}.${key}`;
}

function assertContractKeys(baseline, current, path) {
  if (typeof baseline === 'string') {
    if (typeof current !== 'string') {
      fail(`${path} no longer resolves to a target`);
    }
    return;
  }
  if (baseline === null) {
    if (typeof current !== 'string' && current !== null) fail(`${path} changed contract shape`);
    return;
  }
  if (typeof baseline !== 'object') {
    if (current !== baseline) fail(`${path} changed from ${String(baseline)} to ${String(current)}`);
    return;
  }
  if (Array.isArray(baseline)) {
    if (!Array.isArray(current) || current.length === 0) fail(`${path} target alternatives were removed`);
    return;
  }
  if (!baseline || typeof baseline !== 'object' || !current || typeof current !== 'object') {
    fail(`${path} changed contract shape`);
  }
  for (const [key, value] of Object.entries(baseline)) {
    const childPath = contractPath(path, key);
    if (!hasOwn(current, key)) fail(`${childPath} was removed`);
    assertContractKeys(value, current[key], childPath);
  }
}

export function assertManifestCompatibility(
  baseline,
  current,
  candidateVersion,
  publicNames,
  approvedDependencyChanges = new Map(),
) {
  if (current.name !== baseline.name) fail(`name changed from ${baseline.name} to ${current.name}`);
  if (current.version !== candidateVersion) {
    fail(`${current.name}.version must be candidate ${candidateVersion}; found ${current.version}`);
  }
  for (const field of ['main', 'types']) {
    if (hasOwn(baseline, field) && typeof current[field] !== 'string') {
      fail(`${current.name}.${field} no longer resolves to a target`);
    }
  }
  if (hasOwn(baseline, 'bin')) assertContractKeys(baseline.bin, current.bin, 'bin');
  if (hasOwn(baseline, 'exports')) assertContractKeys(baseline.exports, current.exports, 'exports');
  if (hasOwn(baseline, 'peerDependenciesMeta')) {
    assertContractKeys(baseline.peerDependenciesMeta, current.peerDependenciesMeta, 'peerDependenciesMeta');
  }

  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(baseline[section] ?? {})) {
      const path = `${section}.${name}`;
      if (!hasOwn(current[section], name)) fail(`${path} was removed or changed dependency class`);
      const expected = publicNames.has(name) ? candidateVersion : version;
      if (current[section][name] !== expected) {
        const approval = approvedDependencyChanges.get(`${current.name}:${section}:${name}`);
        const approved = approval?.from === version && approval?.to === current[section][name];
        if (!approved) fail(`${path} must remain ${expected}; found ${current[section][name]}`);
      }
    }
  }

  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(current[section] ?? {})) {
      if (publicNames.has(name) && version !== candidateVersion) {
        fail(`${current.name}.${section}.${name} must match candidate ${candidateVersion}; found ${version}`);
      }
    }
  }
  if (current.dependencies?.['@graph-ir/core'] !== undefined
      && current.dependencies['@graph-ir/core'] !== '0.2.1') {
    fail(`${current.name}.dependencies.@graph-ir/core must be adopted at exact 0.2.1`);
  }
}

export function declarationGraphsUnchanged(baselineEntries, currentEntries) {
  const declarations = (entries) => new Map(entries
    .filter((entry) => entry.type === '0' && entry.name.endsWith('.d.ts'))
    .map((entry) => [entry.name, entry.data]));
  const baseline = declarations(baselineEntries);
  const current = declarations(currentEntries);
  return baseline.size > 0 && [...baseline].every(([path, data]) => current.get(path)?.equals(data));
}

export function declarationPairUnchanged(graphUnchanged, baselinePath, currentPath) {
  return graphUnchanged && baselinePath === currentPath;
}

/** An explicit selection names each known case exactly once; unset selects all. */
export function selectNamedCases(cases, selection) {
  if (selection === undefined) return cases;
  const requested = String(selection).split(',').map((name) => name.trim()).filter(Boolean);
  if (requested.length === 0) fail('consumer case selection must select at least one case');
  const duplicates = requested.filter((name, index) => requested.indexOf(name) !== index);
  if (duplicates.length) fail(`Duplicate consumer case: ${[...new Set(duplicates)].join(', ')}`);
  const known = new Map(cases.map((item) => [item.name, item]));
  const unknown = requested.filter((name) => !known.has(name));
  if (unknown.length) fail(`Unknown consumer case: ${unknown.join(', ')}`);
  return requested.map((name) => known.get(name));
}

/** Whether a case exercises this artifact generation, browser package and Core. */
export function consumerCaseApplies(item, { artifactVersion, browserPublished, coreVersion }) {
  return (!item.artifactVersions || item.artifactVersions.includes(artifactVersion))
    && (!item.requiresBrowser || browserPublished)
    && (!item.coreVersions || item.coreVersions.includes(coreVersion));
}

/**
 * Without a selection, every applicable case runs (developer use). An explicit
 * selection is an obligation: a named case that cannot run for this generation
 * fails instead of being dropped.
 */
export function selectConsumerCases(cases, selection, context) {
  if (selection === undefined) {
    const applicable = cases.filter((item) => consumerCaseApplies(item, context));
    if (applicable.length === 0) fail(`No consumer cases apply to Coral ${context.artifactVersion}`);
    return applicable;
  }
  const requested = selectNamedCases(cases, selection);
  const inapplicable = requested.filter((item) => !consumerCaseApplies(item, context));
  if (inapplicable.length) {
    fail(`Consumer cases do not apply to Coral ${context.artifactVersion} with Core ${context.coreVersion}`
      + `${context.browserPublished ? '' : ' without @coral-viz/browser'}: `
      + inapplicable.map(({ name }) => name).join(', '));
  }
  return requested;
}

const PUBLISHED_WORKSPACES = [
  '@coral-viz/language', '@coral-viz/render', '@coral-viz/viz', '@coral-viz/mcp-server', 'tree-sitter-coral',
];

/**
 * The workspaces a consumer-smoke artifact set must contain. Every
 * repository-built set includes @coral-viz/browser (new in 0.2.6); only the
 * API-compatibility runs, whose sets hold exactly the packages published in
 * the 0.2.5 baseline, declare `CORAL_ARTIFACT_SCOPE=api-compat` to omit it.
 */
export function consumerWorkspaces(env) {
  const scope = env.CORAL_ARTIFACT_SCOPE;
  if (scope !== undefined && scope !== 'api-compat') fail(`Unknown CORAL_ARTIFACT_SCOPE: ${scope}`);
  return scope === 'api-compat' ? [...PUBLISHED_WORKSPACES] : [...PUBLISHED_WORKSPACES, '@coral-viz/browser'];
}

const releaseDocumentationEntries = new Map([
  ['@coral-viz/language', [
    'package/SPEC.md',
    'package/spec/grammar.ebnf',
    'package/spec/diagnostics.json',
    'package/spec/conformance/manifest.json',
  ]],
  ['@coral-viz/render', [
    'package/third_party/fonts/handwritten-OFL-1.1.txt',
    'package/third_party/fonts/mono-OFL-1.1.txt',
    'package/third_party/fonts/sans-OFL-1.1.txt',
    'package/third_party/fonts/serif-OFL-1.1.txt',
  ]],
  ['@coral-viz/browser', [
    'package/THIRD_PARTY_NOTICES.md',
    'package/dist/coral-browser.js',
    'package/dist/coral-browser.iife.js',
    'package/dist/index.d.ts',
  ]],
]);

function versionAtLeast025(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-|$)/.exec(version);
  if (!match) fail(`artifact version is not semantic: ${version}`);
  const [, major, minor, patch] = match.map(Number);
  return major > 0 || minor > 2 || (minor === 2 && patch >= 5);
}

export function assertArtifactContent(entries, packageName, version) {
  const present = new Set(entries);
  const required = ['package/package.json', 'package/README.md', 'package/LICENSE'];
  if (versionAtLeast025(version)) {
    required.push(...(releaseDocumentationEntries.get(packageName) ?? []));
  }
  for (const path of required) {
    if (!present.has(path)) fail(`${packageName}@${version} artifact is missing ${path}`);
  }
}

function leafTargets(value, kind, output = []) {
  if (typeof value === 'string') output.push({ target: value, kind });
  else if (Array.isArray(value)) value.forEach((item) => leafTargets(item, kind, output));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      leafTargets(item, key === 'types' ? 'types' : kind, output);
    }
  }
  return output;
}

export function isPathWithin(directory, target, paths = pathApi) {
  const child = paths.relative(directory, target);
  return child === '' || (child !== '..' && !child.startsWith(`..${paths.sep}`) && !paths.isAbsolute(child));
}

export async function assertManifestTargets(manifest, directory) {
  const targets = [
    ...(manifest.main ? [{ target: manifest.main, kind: 'main' }] : []),
    ...(manifest.types ? [{ target: manifest.types, kind: 'types' }] : []),
    ...leafTargets(manifest.bin, 'bin'),
    ...leafTargets(manifest.exports, 'runtime'),
  ];
  for (const { target, kind } of targets) {
    const path = resolve(directory, target.replace(/^\.\//, ''));
    if (!isPathWithin(directory, path)) fail(`Unsafe manifest target ${target}`);
    await access(path);
    const targetStat = await stat(path);
    if (targetStat.isFile()) continue;
    if (!targetStat.isDirectory() || (kind !== 'main' && kind !== 'types')) {
      fail(`Manifest target is not a resolvable regular file: ${target}`);
    }
    const indexPath = resolve(path, kind === 'types' ? 'index.d.ts' : 'index.js');
    await access(indexPath);
    if (!(await stat(indexPath)).isFile()) fail(`Manifest target is not a resolvable regular file: ${target}`);
  }
}

function typeTarget(value) {
  if (typeof value === 'string') return value.endsWith('.d.ts') ? value : undefined;
  if (Array.isArray(value)) return value.map(typeTarget).find(Boolean);
  if (value && typeof value === 'object') {
    if (typeof value.types === 'string') return value.types;
    return Object.values(value).map(typeTarget).find(Boolean);
  }
  return undefined;
}

export function exportedTypeEntries(manifest, entries, requiredSubpaths) {
  if (manifest.exports) {
    return Object.entries(manifest.exports).flatMap(([subpath, value]) => {
      if (requiredSubpaths && !requiredSubpaths.has(subpath)) return [];
      const target = typeTarget(value);
      return target ? [{ subpath, path: target.replace(/^\.\//, '') }] : [];
    });
  }
  const files = new Set(entries.filter(({ type }) => type === '0').map(({ name }) => name.slice('package/'.length)));
  const declarationEntries = [...files].filter((name) => name.endsWith('.d.ts') && files.has(name.slice(0, -5) + '.js'));
  const manifestTypes = manifest.types
    ? manifest.types.endsWith('.d.ts')
      ? manifest.types
      : `${manifest.types.replace(/\/$/, '')}/index.d.ts`
    : undefined;
  if (manifestTypes && files.has(manifestTypes)) declarationEntries.push(manifestTypes);
  return [...new Set(declarationEntries)].sort().map((path) => ({ subpath: `./${path.replace(/\.d\.ts$/, '')}`, path }));
}

export function publishedRuntimeTargets(baseline, current, kind = 'runtime', output = []) {
  if (typeof baseline === 'string') {
    if (kind !== 'types' && typeof current === 'string') output.push(current);
    return output;
  }
  if (Array.isArray(baseline)) {
    baseline.forEach((item, index) => publishedRuntimeTargets(item, current?.[index], kind, output));
    return output;
  }
  if (baseline && typeof baseline === 'object') {
    for (const [key, value] of Object.entries(baseline)) {
      publishedRuntimeTargets(value, current?.[key], key === 'types' ? 'types' : kind, output);
    }
  }
  return output;
}

export function standaloneManifestEntries(baseline, current) {
  return {
    runtime: typeof baseline.main === 'string' && typeof current.main === 'string'
      ? [current.main]
      : [],
    declarations: typeof baseline.types === 'string' && typeof current.types === 'string'
      ? [{ baseline: baseline.types, current: current.types }]
      : [],
  };
}

function tarString(buffer, start, length) {
  const end = buffer.indexOf(0, start);
  return buffer.toString('utf8', start, end >= start && end < start + length ? end : start + length);
}

function tarNumber(buffer, start, length) {
  const value = tarString(buffer, start, length).trim();
  if (!/^[0-7]*$/.test(value)) fail('Unsafe tar numeric header');
  return value ? Number.parseInt(value, 8) : 0;
}

function assertSafeTarPath(name) {
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/')) {
    fail(`Unsafe tar path: ${JSON.stringify(name)}`);
  }
  const parts = name.split('/');
  if (parts.some((part) => part === '..') || parts[0] !== 'package') {
    fail(`Unsafe tar path: ${name}`);
  }
}

export function readSafeTarball(archive) {
  let tar;
  try {
    tar = gunzipSync(archive);
  } catch (error) {
    fail(`Unsafe tar compression: ${error.message}`);
  }
  const entries = [];
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = [tarString(header, 345, 155), tarString(header, 0, 100)]
      .filter(Boolean).join('/');
    assertSafeTarPath(name);
    const type = tarString(header, 156, 1) || '0';
    if (type !== '0' && type !== '5') fail(`Unsafe tar member type ${type} at ${name}`);
    const size = tarNumber(header, 124, 12);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (!Number.isSafeInteger(size) || dataEnd > tar.length) fail(`Unsafe tar size at ${name}`);
    if (type === '5' && size !== 0) fail(`Unsafe tar directory payload at ${name}`);
    entries.push({ name, type, data: type === '0' ? tar.subarray(dataStart, dataEnd) : undefined });
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  if (!entries.length) fail('Unsafe tar has no package entries');
  return entries;
}

function moduleExports(checker, sourceFile) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile) ?? sourceFile.symbol;
  if (!moduleSymbol) return new Map();
  return new Map(checker.getExportsOfModule(moduleSymbol).map((symbol) => [symbol.name, symbol]));
}

function resolvedSymbol(checker, symbol) {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function isTypeOnlyAlias(symbol) {
  if (!(symbol.flags & ts.SymbolFlags.Alias)) return false;
  return (symbol.declarations ?? []).every((declaration) => {
    if (ts.isExportSpecifier(declaration)) return declaration.isTypeOnly || declaration.parent.parent.isTypeOnly;
    if (ts.isExportDeclaration(declaration)) return declaration.isTypeOnly;
    return false;
  });
}

function declarationFor(symbol, fallback) {
  return symbol.valueDeclaration ?? symbol.declarations?.[0] ?? fallback;
}

function addFinding(findings, context, rule, contractPath, message, direction = 'both') {
  findings.push({
    packageName: context.packageName,
    subpath: context.subpath,
    exportName: context.exportName,
    meaning: context.meaning,
    contractPath,
    direction,
    rule,
    label: context.label,
    message,
  });
}

export function declarationFindingId(finding) {
  return [
    finding.packageName,
    finding.subpath,
    finding.exportName,
    finding.meaning,
    finding.contractPath,
    finding.direction,
    finding.rule,
  ].map((value) => JSON.stringify(value ?? '')).join('|');
}

export function formatDeclarationFinding(finding) {
  const symbol = finding.exportName
    ? `${finding.label} export ${finding.exportName}`
    : finding.label;
  const path = finding.contractPath && !['type', 'value', 'export', 'entry'].includes(finding.contractPath)
    ? ` ${finding.contractPath}`
    : '';
  return `${symbol}${path}: ${finding.message}`;
}

function compareTypeParameters(checker, baselineSymbol, currentSymbol, context, findings) {
  const baselineDeclaration = baselineSymbol.declarations?.find((item) => item.typeParameters);
  const currentDeclaration = currentSymbol.declarations?.find((item) => item.typeParameters);
  const baselineParameters = baselineDeclaration?.typeParameters ?? [];
  const currentParameters = currentDeclaration?.typeParameters ?? [];
  if (baselineParameters.length !== currentParameters.length) {
    addFinding(findings, context, 'generic.parameter-count', 'typeParameters', 'generic parameter count changed');
    return;
  }
  for (let index = 0; index < baselineParameters.length; index += 1) {
    const baselineConstraint = baselineParameters[index].constraint;
    const currentConstraint = currentParameters[index].constraint;
    if (Boolean(baselineConstraint) !== Boolean(currentConstraint)) {
      addFinding(
        findings, context, 'generic.constraint-presence', `typeParameters[${index}].constraint`,
        `generic constraint ${index + 1} changed`,
      );
      continue;
    }
    if (baselineConstraint) {
      const baselineType = checker.getTypeFromTypeNode(baselineConstraint);
      const currentType = checker.getTypeFromTypeNode(currentConstraint);
      if (!checker.isTypeAssignableTo(baselineType, currentType)
          || !checker.isTypeAssignableTo(currentType, baselineType)) {
        addFinding(
          findings, context, 'generic.constraint', `typeParameters[${index}].constraint`,
          `generic constraint ${index + 1} is incompatible`,
        );
      }
    }
    const baselineDefault = baselineParameters[index].default;
    const currentDefault = currentParameters[index].default;
    if (Boolean(baselineDefault) !== Boolean(currentDefault)) {
      addFinding(
        findings, context, 'generic.default-presence', `typeParameters[${index}].default`,
        `generic default ${index + 1} changed`,
      );
    } else if (baselineDefault) {
      const baselineType = checker.getTypeFromTypeNode(baselineDefault);
      const currentType = checker.getTypeFromTypeNode(currentDefault);
      if (!checker.isTypeAssignableTo(baselineType, currentType)
          || !checker.isTypeAssignableTo(currentType, baselineType)) {
        addFinding(
          findings, context, 'generic.default', `typeParameters[${index}].default`,
          `generic default ${index + 1} is incompatible`,
        );
      }
    }
  }
}

function resolvedReferenceSymbols(checker, declaration) {
  const symbols = [];
  function addReference(node) {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) {
      symbols.push(node);
      return;
    }
    const resolved = resolvedSymbol(checker, symbol);
    const local = (resolved.declarations ?? []).some((item) =>
      item.getSourceFile() === declaration.getSourceFile()
      && item.pos >= declaration.pos && item.end <= declaration.end);
    if (!local) symbols.push(resolved);
  }
  function visit(node) {
    if (ts.isIdentifier(node)) addReference(node);
    if (ts.isImportTypeNode(node)) addReference(node.argument);
    ts.forEachChild(node, visit);
  }
  visit(declaration);
  return symbols;
}

function normalizedGenericText(declaration) {
  const parameters = declaration.typeParameters ?? [];
  let text = declaration.getText().replace(/\s+/g, ' ');
  parameters.forEach((parameter, index) => {
    text = text.replaceAll(new RegExp(`\\b${parameter.name.text}\\b`, 'g'), `$T${index}`);
  });
  return text;
}

function declarationPairKey(baselineDeclaration, currentDeclaration) {
  return `${baselineDeclaration.getSourceFile().fileName}:${baselineDeclaration.pos}:${baselineDeclaration.end}`
    + `=>${currentDeclaration.getSourceFile().fileName}:${currentDeclaration.pos}:${currentDeclaration.end}`;
}

function pathWithin(path, roots) {
  return roots.some((root) => {
    const child = relative(root, path);
    return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
  });
}

function isApprovedDeclarationPair(baselineDeclaration, currentDeclaration, graphIsolation) {
  if (!graphIsolation) return true;
  const baselinePath = baselineDeclaration.getSourceFile().fileName;
  const currentPath = currentDeclaration.getSourceFile().fileName;
  return (graphIsolation.declarationPairs ?? []).some((pair) => {
    if (!pathWithin(baselinePath, [pair.baselineRoot])
        || !pathWithin(currentPath, [pair.candidateRoot])) return false;
    return relative(pair.baselineRoot, baselinePath)
      === relative(pair.candidateRoot, currentPath);
  });
}

function sameReferencedSymbol(checker, baselineReference, currentReference, seen, graphIsolation) {
  if (baselineReference === currentReference) return true;
  const baselineIsNode = typeof baselineReference?.kind === 'number' && typeof baselineReference?.getText === 'function';
  const currentIsNode = typeof currentReference?.kind === 'number' && typeof currentReference?.getText === 'function';
  if (baselineIsNode || currentIsNode) {
    return baselineIsNode && currentIsNode
      && baselineReference.kind === currentReference.kind
      && baselineReference.getText() === currentReference.getText();
  }
  const baselineDeclarations = baselineReference.declarations ?? [];
  const currentDeclarations = currentReference.declarations ?? [];
  if (baselineDeclarations.length !== currentDeclarations.length || baselineDeclarations.length === 0) return false;
  return baselineDeclarations.every((baselineDeclaration, index) => {
    const currentDeclaration = currentDeclarations[index];
    if (!isApprovedDeclarationPair(baselineDeclaration, currentDeclaration, graphIsolation)) return false;
    const key = declarationPairKey(baselineDeclaration, currentDeclaration);
    if (seen.has(key)) return true;
    seen.add(key);
    if (normalizedGenericText(baselineDeclaration) !== normalizedGenericText(currentDeclaration)) return false;
    const baselineReferences = resolvedReferenceSymbols(checker, baselineDeclaration);
    const currentReferences = resolvedReferenceSymbols(checker, currentDeclaration);
    return baselineReferences.length === currentReferences.length
      && baselineReferences.every((reference, referenceIndex) =>
        sameReferencedSymbol(
          checker, reference, currentReferences[referenceIndex], seen, graphIsolation,
        ));
  });
}

function sameGenericNodes(checker, baselineDeclaration, currentDeclaration, graphIsolation) {
  if (!baselineDeclaration?.typeParameters?.length || !currentDeclaration?.typeParameters?.length) {
    return false;
  }
  if (normalizedGenericText(baselineDeclaration) !== normalizedGenericText(currentDeclaration)) return false;
  const baselineReferences = resolvedReferenceSymbols(checker, baselineDeclaration);
  const currentReferences = resolvedReferenceSymbols(checker, currentDeclaration);
  return baselineReferences.length === currentReferences.length
    && baselineReferences.every((symbol, index) =>
      sameReferencedSymbol(checker, symbol, currentReferences[index], new Set(), graphIsolation));
}

function sameGenericDeclaration(checker, baselineSymbol, currentSymbol, graphIsolation) {
  const baselineDeclaration = baselineSymbol.declarations?.find((item) => item.typeParameters?.length);
  const currentDeclaration = currentSymbol.declarations?.find((item) => item.typeParameters?.length);
  return sameGenericNodes(checker, baselineDeclaration, currentDeclaration, graphIsolation);
}

function isReadonlyProperty(symbol, containingType) {
  if (ts.getCheckFlags(symbol) & ts.CheckFlags.Readonly) return true;
  const declarations = symbol.declarations ?? [];
  if (declarations.some(ts.isGetAccessorDeclaration)
      && !declarations.some(ts.isSetAccessorDeclaration)) return true;
  if (declarations.some((declaration) =>
    declaration.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ReadonlyKeyword))) return true;
  const token = containingType.declaration?.readonlyToken;
  return Boolean(token && token.kind !== ts.SyntaxKind.MinusToken);
}

function compareSignatureGroups(
  checker, baselineType, currentType, context, findings, options, contractPath = '',
) {
  for (const [kind, baselineSignatures, currentSignatures] of [
    ['call', checker.getSignaturesOfType(baselineType, ts.SignatureKind.Call), checker.getSignaturesOfType(currentType, ts.SignatureKind.Call)],
    ['construct', checker.getSignaturesOfType(baselineType, ts.SignatureKind.Construct), checker.getSignaturesOfType(currentType, ts.SignatureKind.Construct)],
  ]) {
    if (baselineSignatures.length !== currentSignatures.length) {
      addFinding(
        findings, context, 'signature.count', `${contractPath}${contractPath ? '.' : ''}${kind}`,
        `${kind} signature count changed`,
      );
      continue;
    }
    baselineSignatures.forEach((baselineSignature, index) => {
      const currentSignature = currentSignatures[index];
      if (sameGenericNodes(
        checker, baselineSignature.declaration, currentSignature.declaration, options.graphIsolation,
      )) return;
      const baselineParameters = baselineSignature.getParameters();
      const currentParameters = currentSignature.getParameters();
      let incompatible = baselineSignature.minArgumentCount !== currentSignature.minArgumentCount
        || baselineParameters.length !== currentParameters.length;
      if (!incompatible) {
        baselineParameters.forEach((baselineParameter, parameterIndex) => {
          const currentParameter = currentParameters[parameterIndex];
          const baselineParameterType = checker.getTypeOfSymbolAtLocation(
            baselineParameter, declarationFor(baselineParameter, baselineParameter.declarations?.[0]),
          );
          const currentParameterType = checker.getTypeOfSymbolAtLocation(
            currentParameter, declarationFor(currentParameter, currentParameter.declarations?.[0]),
          );
          if (!checker.isTypeAssignableTo(baselineParameterType, currentParameterType)
              || !checker.isTypeAssignableTo(currentParameterType, baselineParameterType)) incompatible = true;
        });
      }
      const baselineReturn = baselineSignature.getReturnType();
      const currentReturn = currentSignature.getReturnType();
      if (!checker.isTypeAssignableTo(baselineReturn, currentReturn)
          || !checker.isTypeAssignableTo(currentReturn, baselineReturn)) incompatible = true;
      if (incompatible) {
        addFinding(
          findings, context, 'signature.incompatible',
          `${contractPath}${contractPath ? '.' : ''}${kind}[${index}]`,
          `${kind} signature ${index + 1} changed incompatibly`,
        );
      }
    });
  }
}

function stablePropertyName(symbol, allowedNames) {
  for (const declaration of symbol.declarations ?? []) {
    const name = declaration.name;
    if (!name || !ts.isComputedPropertyName(name) || !ts.isIdentifier(name.expression)) continue;
    if (allowedNames.has(name.expression.text)) return `stable:${name.expression.text}`;
  }
  return symbol.name;
}

function stableRule(options, context) {
  return (options.stableSymbols ?? []).find((rule) =>
    rule.packageName === context.packageName
    && rule.subpath === context.subpath
    && (rule.valueExport === context.exportName || rule.typeExport === context.exportName));
}

function isUniqueSymbolDeclaration(symbol) {
  return (symbol.declarations ?? []).some((declaration) => {
    if (!ts.isVariableDeclaration(declaration)) return false;
    const type = declaration.type;
    return Boolean(type && ts.isTypeOperatorNode(type) && type.operator === ts.SyntaxKind.UniqueKeyword);
  });
}

function compareObjectDetails(
  checker, baselineType, currentType, context, findings, options, sameGeneric = false,
) {
  const approvedStable = stableRule(options, context);
  const allowedNames = new Set(approvedStable?.typeExport === context.exportName
    ? [approvedStable.valueExport] : []);
  const currentProperties = new Map(
    checker.getPropertiesOfType(currentType).map((symbol) => [stablePropertyName(symbol, allowedNames), symbol]),
  );
  const baselinePropertyNames = new Set();
  for (const baselineProperty of checker.getPropertiesOfType(baselineType)) {
    const propertyName = stablePropertyName(baselineProperty, allowedNames);
    baselinePropertyNames.add(propertyName);
    const currentProperty = currentProperties.get(propertyName);
    if (!currentProperty) {
      addFinding(
        findings, context, 'property.removed', `property.${propertyName}`,
        `property ${baselineProperty.name} was removed`,
      );
      continue;
    }
    if (Boolean(baselineProperty.flags & ts.SymbolFlags.Optional)
        !== Boolean(currentProperty.flags & ts.SymbolFlags.Optional)) {
      addFinding(
        findings, context, 'property.optionality', `property.${propertyName}`,
        `property ${baselineProperty.name} optionality changed`,
      );
    }
    if (isReadonlyProperty(baselineProperty, baselineType)
        !== isReadonlyProperty(currentProperty, currentType)) {
      addFinding(
        findings, context, 'property.readonly', `property.${propertyName}`,
        `property ${baselineProperty.name} readonly state changed`,
      );
    }
    const baselinePropertyType = checker.getTypeOfSymbolAtLocation(
      baselineProperty, declarationFor(baselineProperty, baselineProperty.declarations?.[0]),
    );
    const currentPropertyType = checker.getTypeOfSymbolAtLocation(
      currentProperty, declarationFor(currentProperty, currentProperty.declarations?.[0]),
    );
    if (!checker.isTypeAssignableTo(baselinePropertyType, currentPropertyType)
        || !checker.isTypeAssignableTo(currentPropertyType, baselinePropertyType)) {
      const baselineText = checker.typeToString(baselinePropertyType, undefined, ts.TypeFormatFlags.NoTruncation);
      const currentText = checker.typeToString(currentPropertyType, undefined, ts.TypeFormatFlags.NoTruncation);
      if (baselineText !== currentText) {
        addFinding(
          findings, context, 'property.type', `property.${propertyName}`,
          `property ${baselineProperty.name} type changed incompatibly`,
        );
      }
    }
    if (!sameGeneric) {
      compareSignatureGroups(
        checker, baselinePropertyType, currentPropertyType, context, findings, options,
        `property.${propertyName}`,
      );
    }
  }

  for (const [propertyName, currentProperty] of currentProperties) {
    if (baselinePropertyNames.has(propertyName) || currentProperty.flags & ts.SymbolFlags.Optional) continue;
    addFinding(
      findings, context, 'property.added-required', `property.${propertyName}`,
      `required property ${currentProperty.name} was added`, 'baseline-to-candidate',
    );
  }

  const baselineIndexes = checker.getIndexInfosOfType(baselineType);
  const currentIndexes = checker.getIndexInfosOfType(currentType);
  if (baselineIndexes.length !== currentIndexes.length) {
    addFinding(findings, context, 'index.count', 'index', 'index signature count changed');
  } else {
    baselineIndexes.forEach((baselineIndex, index) => {
      const currentIndex = currentIndexes[index];
      if (baselineIndex.isReadonly !== currentIndex.isReadonly
          || !checker.isTypeAssignableTo(baselineIndex.keyType, currentIndex.keyType)
          || !checker.isTypeAssignableTo(currentIndex.keyType, baselineIndex.keyType)
          || !checker.isTypeAssignableTo(baselineIndex.type, currentIndex.type)
          || !checker.isTypeAssignableTo(currentIndex.type, baselineIndex.type)) {
        addFinding(
          findings, context, 'index.incompatible', `index[${index}]`,
          `index signature ${index + 1} changed incompatibly`,
        );
      }
    });
  }
  if (!sameGeneric) compareSignatureGroups(
    checker, baselineType, currentType, context, findings, options,
  );
}

function declarationModuleSpecifiers(sourceFile) {
  const specifiers = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isImportTypeNode(node)
        && ts.isLiteralTypeNode(node.argument)
        && ts.isStringLiteral(node.argument.literal)) {
      specifiers.push(node.argument.literal.text);
    } else if (ts.isExternalModuleReference(node) && ts.isStringLiteral(node.expression)) {
      specifiers.push(node.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function assertDeclarationGraphIsolation(program, compilerOptions, graphIsolation) {
  if (!graphIsolation) return;
  const stageRoots = [graphIsolation.stageRoot];
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile && sourceFile.hasNoDefaultLib) continue;
    const sourcePath = sourceFile.fileName;
    const sourceGroup = pathWithin(sourcePath, graphIsolation.baselineRoots)
      ? 'baseline'
      : pathWithin(sourcePath, graphIsolation.candidateRoots) ? 'candidate' : 'external';
    const assertTarget = (specifier, target) => {
      if (!pathWithin(target, stageRoots)) return;
      const allowedRoots = sourceGroup === 'baseline'
        ? graphIsolation.baselineRoots
        : sourceGroup === 'candidate' ? graphIsolation.candidateRoots : [];
      if (!pathWithin(target, allowedRoots)) {
        throw new Error(
          `Declaration graph isolation failed: ${sourceGroup} ${sourcePath} resolves ${specifier} to ${target}`,
        );
      }
    };
    for (const specifier of declarationModuleSpecifiers(sourceFile)) {
      const resolvedModule = ts.resolveModuleName(
        specifier, sourcePath, compilerOptions, ts.sys,
      ).resolvedModule;
      if (resolvedModule) assertTarget(specifier, resolvedModule.resolvedFileName);
    }
    for (const reference of sourceFile.referencedFiles) {
      assertTarget(
        `/// <reference path=${JSON.stringify(reference.fileName)}>`,
        resolve(dirname(sourcePath), reference.fileName),
      );
    }
    for (const reference of sourceFile.typeReferenceDirectives) {
      const resolvedReference = ts.resolveTypeReferenceDirective(
        reference.fileName, sourcePath, compilerOptions, ts.sys,
      ).resolvedTypeReferenceDirective;
      if (resolvedReference) {
        assertTarget(
          `/// <reference types=${JSON.stringify(reference.fileName)}>`,
          resolvedReference.resolvedFileName,
        );
      }
    }
  }
}

export function analyzeDeclarationEntries(entries, options = {}) {
  const rootNames = entries.flatMap(({ baselinePath, currentPath }) => [baselinePath, currentPath]);
  let declarationRoot = dirname(rootNames[0]);
  while (!rootNames.every((name) => {
    const path = relative(declarationRoot, name);
    return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  })) declarationRoot = dirname(declarationRoot);
  const compilerOptions = {
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  };
  const program = ts.createProgram(rootNames, compilerOptions);
  assertDeclarationGraphIsolation(program, compilerOptions, options.graphIsolation);
  const checker = program.getTypeChecker();
  const findings = ts.getPreEmitDiagnostics(program)
    .filter((diagnostic) => {
      if (!diagnostic.file) return false;
      const path = relative(declarationRoot, diagnostic.file.fileName);
      return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
    })
    .map((diagnostic) => ({
      packageName: '<compiler>',
      subpath: '.',
      exportName: '',
      meaning: 'compiler',
      contractPath: diagnostic.file
        ? `${relative(declarationRoot, diagnostic.file.fileName)}:${diagnostic.start ?? 0}`
        : '<global>',
      direction: 'none',
      rule: `compiler.${diagnostic.code}`,
      label: 'compiler diagnostic',
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    }));

  for (const {
    label,
    packageName = label,
    subpath = '.',
    baselinePath,
    currentPath,
    declarationGraphUnchanged = false,
  } of entries) {
    const baselineFile = program.getSourceFile(baselinePath);
    const currentFile = program.getSourceFile(currentPath);
    if (!baselineFile || !currentFile) {
      addFinding(
        findings,
        { packageName, subpath, exportName: '', meaning: 'compiler', label },
        'declaration.unresolved', 'entry', 'declaration entry could not be loaded', 'none',
      );
      continue;
    }
    if (declarationGraphUnchanged) continue;
    const baselineExports = moduleExports(checker, baselineFile);
    const currentExports = moduleExports(checker, currentFile);
    for (const [name, baselineAlias] of baselineExports) {
      const currentAlias = currentExports.get(name);
      if (!currentAlias) {
        addFinding(
          findings,
          { packageName, subpath, exportName: name, meaning: 'both', label },
          'export.removed', 'export', 'removed', 'candidate',
        );
        continue;
      }
      const baseline = resolvedSymbol(checker, baselineAlias);
      const current = resolvedSymbol(checker, currentAlias);
      const baselineHasValue = Boolean(baseline.flags & ts.SymbolFlags.Value) && !isTypeOnlyAlias(baselineAlias);
      const currentHasValue = Boolean(current.flags & ts.SymbolFlags.Value) && !isTypeOnlyAlias(currentAlias);
      const baselineHasType = Boolean(baseline.flags & ts.SymbolFlags.Type);
      const currentHasType = Boolean(current.flags & ts.SymbolFlags.Type);
      if (baselineHasValue && !currentHasValue) {
        addFinding(
          findings, { packageName, subpath, exportName: name, meaning: 'value', label },
          'meaning.removed', 'value', 'value meaning removed', 'candidate',
        );
      }
      if (baselineHasType && !currentHasType) {
        addFinding(
          findings, { packageName, subpath, exportName: name, meaning: 'type', label },
          'meaning.removed', 'type', 'type meaning removed', 'candidate',
        );
      }

      if (baselineHasValue && currentHasValue) {
        const context = { packageName, subpath, exportName: name, meaning: 'value', label };
        const baselineType = checker.getTypeOfSymbolAtLocation(
          baseline, declarationFor(baseline, baselineFile),
        );
        const currentType = checker.getTypeOfSymbolAtLocation(
          current, declarationFor(current, currentFile),
        );
        if (!checker.isTypeAssignableTo(currentType, baselineType)) {
          const approvedStable = stableRule(options, context);
          if (!(approvedStable?.valueExport === name
              && isUniqueSymbolDeclaration(baseline)
              && isUniqueSymbolDeclaration(current))) {
            addFinding(
              findings, context, 'value.assignability', 'value',
              'current value is not assignable to published value', 'candidate-to-baseline',
            );
          }
        }
      }
      if (baselineHasType && currentHasType) {
        const context = { packageName, subpath, exportName: name, meaning: 'type', label };
        const baselineType = checker.getDeclaredTypeOfSymbol(baseline);
        const currentType = checker.getDeclaredTypeOfSymbol(current);
        const sameGeneric = sameGenericDeclaration(
          checker, baseline, current, options.graphIsolation,
        );
        if (!checker.isTypeAssignableTo(baselineType, currentType)
            || !checker.isTypeAssignableTo(currentType, baselineType)) {
          const approvedStable = stableRule(options, context);
          if (!sameGeneric && approvedStable?.typeExport !== name) {
            addFinding(
              findings, context, 'type.assignability', 'type',
              'type meanings are not mutually assignable', 'both',
            );
          }
        }
        compareObjectDetails(checker, baselineType, currentType, context, findings, options, sameGeneric);
      }
      if ((baselineHasValue && currentHasValue) || (baselineHasType && currentHasType)) {
        compareTypeParameters(
          checker, baseline, current,
          {
            packageName, subpath, exportName: name,
            meaning: baselineHasType && currentHasType ? 'type' : 'value', label,
          },
          findings,
        );
      }
    }
  }
  return findings;
}

export function compareDeclarationEntries(entries, options = {}) {
  return analyzeDeclarationEntries(entries, options).map(formatDeclarationFinding);
}
