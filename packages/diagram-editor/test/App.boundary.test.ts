import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appPath = resolve(process.cwd(), 'src/App.tsx');
const controllerPath = resolve(process.cwd(), 'src/useEditorController.ts');

describe('App composition boundary (R-037)', () => {
  it('keeps App at or below 500 lines and delegates state and presentation', () => {
    const source = readFileSync(appPath, 'utf8');
    expect(source.split('\n').length).toBeLessThanOrEqual(500);
    expect(source).toContain("from './useEditorController'");
    expect(source).toContain("from './AppView'");
    expect(source).not.toMatch(/parseCoralDSL|layoutNodes|useAutoRecovery|useLayoutHistory|serialize\(|setTimeout/);
  });

  it('has a live non-test caller for the extracted controller', () => {
    const app = readFileSync(appPath, 'utf8');
    const controller = readFileSync(controllerPath, 'utf8');
    expect(app).toContain('useEditorController()');
    expect(controller).toContain('export function useEditorController()');
    expect(controller).toContain('new EditorRevision(');
  });
});
