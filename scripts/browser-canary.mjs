import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function checkBrowserCanaries({ read = readFileSync, exists = existsSync } = {}) {
  const errors = [];
  const normal = read('playwright.config.ts', 'utf8');
  const performance = read('playwright.performance.config.ts', 'utf8');
  const normalPort = "const port = process.env.CORAL_E2E_PORT ?? '4173';";
  const normalOrigin = 'const origin = `http://127.0.0.1:${port}`;';
  if (!normal.includes(normalPort) || !normal.includes(normalOrigin) ||
      !normal.includes('baseURL: origin,') || !normal.includes('url: origin,') ||
      !normal.includes('--port ${port} --strictPort')) {
    errors.push('playwright.config.ts: preview origin is inconsistent');
  }
  // The performance run inherits the normal origin and server; it may change
  // only selection, parallelism and server reuse, never where it points.
  const inheritsBase = /^import base from '\.\/playwright\.config\.js';$/m.test(performance)
    && /^\s*\.\.\.base,$/m.test(performance)
    && /webServer: \{ \.\.\.base\.webServer(?:,|\s*\})/.test(performance);
  const overridesOrigin = /\b(?:baseURL|url|command|use|port)\s*:|--port|--strictPort|127\.0\.0\.1|localhost/
    .test(performance);
  if (!inheritsBase || overridesOrigin) {
    errors.push('playwright.performance.config.ts: preview origin is inconsistent');
  }
  if (!exists('e2e/slice60-performance.spec.ts')) {
    errors.push('performance fixture is not addressable');
  }
  // A retained smoke must be a plain top-level test (not skip/fixme), and no
  // focused test in its file may exclude it.
  const active = (text, title) => new RegExp(`(?:^|\\n)test\\(\\s*'${title}`).test(text)
    && !/\btest\.(?:describe\.)?only\s*\(/.test(text);
  if (!active(read('e2e/editor.spec.ts', 'utf8'), 'reports a syntax error without blanking the canvas')) {
    errors.push('escaped-source/nonblanking smoke is missing or inactive');
  }
  if (!active(read('e2e/slice40-guidance.spec.ts', 'utf8'), 'Blank diagram enters source-first authoring')) {
    errors.push('Blank-diagram smoke is missing or inactive');
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkBrowserCanaries();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('Browser preview, performance fixture, and retained smoke canaries pass.');
}
