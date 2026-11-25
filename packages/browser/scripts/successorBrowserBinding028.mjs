/** Build-time binding shared by production bundles and isolated CSP consumers. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { foldStandaloneSchema028 } from './standaloneSchema028.mjs';

const kept = `import { admissionIndex, documentCatalogSemantics, isDocumentSymbolId, } from './document-symbols.js';`;
const setup = `import Ajv2020Import from 'ajv/dist/2020.js';
import candidateSchema from '../schemas/graph-ir-4.0.candidate.schema.json' with { type: 'json' };
${kept}
const Ajv2020 = Ajv2020Import.default ??
    Ajv2020Import;
const ajv = new Ajv2020({ allErrors: true, strict: false, strictNumbers: true,
    validateFormats: false });
const validateSchema = ajv.compile(candidateSchema);`;
const posix = (id) => id.replaceAll('\\', '/');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function createSuccessorBrowserBinding028(directory,
  coreDirectory = dirname(fileURLToPath(import.meta.resolve('@graph-ir/core')))) {
  mkdirSync(directory, { recursive: true });
  const schemaFile = resolve(coreDirectory, 'schemas/graph-ir-4.0.candidate.schema.json');
  const coreModule = resolve(coreDirectory, 'validation/successor-candidate.js');
  const bytes = readFileSync(schemaFile);
  const compiler = new Ajv2020({ allErrors: true, strict: false, strictNumbers: true,
    // Unrolling permits removal of raw schema objects. Referenced definitions
    // still share compiled functions; the schema itself is compiled unchanged.
    validateFormats: false, messages: true, inlineRefs: false, code: { source: true, optimize: 2 } });
  const standalone = foldStandaloneSchema028(standaloneCode(compiler, compiler.compile(JSON.parse(bytes))));
  const validatorModule = resolve(directory, 'successor-schema-validator.cjs');
  writeFileSync(validatorModule, standalone.code);
  const provenance = { schemaSha256: sha256(bytes), coreModuleSha256: sha256(readFileSync(coreModule)),
    validatorSha256: sha256(standalone.code), foldedStaticReferences: standalone.folded,
    compilerVersion: JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('ajv/package.json')))).version,
    foldingTypeScriptVersion: JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('typescript/package.json')))).version,
    compiler: 'Ajv2020 standalone; exact schema compilation runs at build time only' };
  writeFileSync(resolve(directory, 'successor-schema-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
  return { validatorModule, coreModule, provenance,
    transform(code, id) {
      if (posix(id) !== posix(coreModule)) return null;
      if (!code.startsWith(setup) || code.split(setup).length !== 2)
        throw new Error('Frozen Core successor schema setup changed; review the browser validation binding.');
      return `import validateSchema from ${JSON.stringify(validatorModule)};${kept}` + code.slice(setup.length);
    },
  };
}
