import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { renderText, type RenderTextOptions } from '@coral-viz/render';
import { renderText as browserText } from '@coral-viz/browser';
import { handleRender } from '../../mcp-server/src/tools/render.js';
import { TextExportDialog } from '../src/components/TextExportDialog';
import { CHARACTER_GLYPH_ROLES_028, FONT_SHA_BY_FACE_029 } from '../../render/src/characterGlyphRoles028.js';

const root = resolve(import.meta.dirname, '../../..');
const source = '@diagram architecture\n' + Array.from({ length: 24 }, (_, i) =>
  `api${i} service as "Service ${i}"`).join('\n') + '\napi0 -> api23 as "Request"';
const context = createContext({ TextEncoder, Uint8Array, setTimeout, clearTimeout, console });
runInContext('globalThis.window = globalThis; globalThis.self = globalThis; globalThis.document = {};', context);
runInContext(readFileSync(resolve(root, 'packages/browser/dist/coral-browser.iife.js'), 'utf8'), context);

it.each(['ascii', 'utf8-box', 'monotrue-v1'] as const)('MCP and API match for %s', async charset => {
  const monoTrue = { profile: 'monotrue-v1', selected: true, face: 'Regular',
    fontSha256: FONT_SHA_BY_FACE_029.Regular, validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028) } as const;
  const options = { charset, monoTrue, pageWidth: 50, pageHeight: 30 } as const;
  const expected = await renderText(source, options);
  const response = await handleRender({ content: source, options: { format: 'txt', ...options } });
  expect(response.content[0].text).toBe(expected.text);
  expect(response.structuredContent).toMatchObject({ charset, pages: expected.pages });
});

it.each(['document', 'comment'] as const)('AC-9 five-surface byte parity for %s', async profile => {
  const doc = profile === 'document';
  const options: RenderTextOptions = doc ? { page: 'a4', profile } :
    { profile, commentStyle: 'hash', columns: 72, charset: 'ascii' };
  const expected = await renderText(source, options);
  expect((await browserText(source, options)).text).toBe(expected.text);
  expect((await context.Coral!.renderText(source, options)).text).toBe(expected.text);
  const cli = spawnSync(process.execPath, [resolve(root, 'packages/render/dist/cli.js'), 'render', '--format', 'txt',
    '--profile', profile, ...(doc ? ['--page', 'a4'] : ['--columns', '72', '--comment', 'hash', '--charset', 'ascii'])],
    { input: source, encoding: 'utf8' });
  expect(cli.status, cli.stderr).toBe(0); expect(cli.stdout).toBe(expected.text);
  const mcp = await handleRender({ content: source, options: { format: 'txt', ...options } });
  expect(mcp.content[0].text).toBe(expected.text);
  expect(mcp.structuredContent).toMatchObject({ pageCount: expected.pageCount, continuationLinks: expected.continuationLinks,
    diagnostics: expected.diagnostics });
  const download = vi.fn(), copy = vi.fn().mockResolvedValue(undefined);
  render(<TextExportDialog profile={profile} source={source} themeName="light" onDownload={download} onClose={() => {}} />);
  if (doc) {
    fireEvent.change(screen.getByLabelText('Page size'), { target: { value: 'a4' } });
    await waitFor(() => expect(screen.getByLabelText('Page 1').textContent).toBe(expected.pages[0]));
    fireEvent.click(screen.getByRole('button', { name: 'Download .txt' }));
    const [blob, extension] = download.mock.calls[0];
    expect(extension).toBe('txt');
    const reader = new FileReader();
    const bytes = new Promise(resolve => { reader.onload = () => resolve(reader.result); });
    reader.readAsText(blob); expect(await bytes).toBe(expected.text);
  } else {
    fireEvent.change(screen.getByLabelText('Comment syntax'), { target: { value: 'hash' } });
    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '72' } });
    fireEvent.change(screen.getByLabelText('Character set'), { target: { value: 'ascii' } });
    await waitFor(() => expect(screen.getByLabelText('Page 1').textContent).toBe(expected.text));
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { clipboard: { writeText: copy } }));
    try { fireEvent.click(screen.getByRole('button', { name: 'Copy comment' })); expect(copy).toHaveBeenCalledWith(expected.text); }
    finally { vi.unstubAllGlobals(); }
  }
});
