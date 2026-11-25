import { defineConfig } from 'vitepress';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const languageRoot = fileURLToPath(new URL('../../packages/language/', import.meta.url));

export default defineConfig({
  title: 'Coral',
  description: 'Documentation for Coral diagram tooling',
  base: '/coral/docs/',
  cleanUrls: true,
  async buildEnd(site) {
    // Publish the exact package-owned normative files alongside the included
    // specification. Keep generated downloads out of authored docs/public.
    const manifest = JSON.parse(await readFile(join(languageRoot, 'package.json'), 'utf8'));
    const conformance = JSON.parse(await readFile(join(languageRoot, 'spec/conformance/manifest.json'), 'utf8'));
    const destination = join(site.outDir, 'language', conformance.languageVersion);
    await mkdir(destination, { recursive: true });
    for (const asset of manifest.files.filter((file: string) => file === 'SPEC.md' || file.startsWith('spec/'))) {
      if (asset.split('/').some((part: string) => part === '..' || part === '.') || asset.includes('\\'))
        throw new Error('Invalid normative language asset path');
      const target = join(destination, asset);
      await mkdir(join(target, '..'), { recursive: true });
      await cp(join(languageRoot, asset), target, { recursive: true });
    }
  },
  lastUpdated: false,
  buildConcurrency: 1,
  cacheDir: process.env.CORAL_DOCS_CACHE_DIR,
  themeConfig: {
    search: { provider: 'local' },
    nav: [
      { text: 'Use Coral', link: '/use/' },
      { text: 'Embed Coral', link: '/embed/' },
      { text: 'Contribute', link: '/contribute/' },
      { text: 'Generated API', link: '/api/', target: '_self' },
    ],
    sidebar: {
      '/contribute/': [
        {
          text: 'Get started', items: [
            { text: 'Contribute to Coral', link: '/contribute/' },
            { text: 'Get started', link: '/contribute/get-started' },
            { text: 'Build and preview', link: '/contribute/how-to/build-and-preview' },
          ],
        },
        {
          text: 'Maintain Coral', items: [
            { text: 'Architecture', link: '/contribute/reference/architecture' },
            { text: 'Commands and tests', link: '/contribute/reference/testing' },
            { text: 'Generated assets and dependencies', link: '/contribute/reference/generated-assets-and-dependencies' },
            { text: 'Documentation governance', link: '/contribute/reference/documentation-governance' },
            { text: 'Language evolution', link: '/contribute/reference/language-evolution' },
            { text: 'Release and recover', link: '/contribute/how-to/release-and-recover' },
          ],
        },
      ],
      '/embed/': [
        {
          text: 'Get started', items: [
            { text: 'Embed Coral', link: '/embed/' },
            { text: 'Render a diagram', link: '/embed/how-to/render-a-diagram' },
            { text: 'Render in a browser', link: '/embed/how-to/render-in-a-browser' },
            { text: 'Embed the React editor', link: '/embed/how-to/embed-the-react-editor' },
          ],
        },
        {
          text: 'API reference', items: [
            { text: 'Language API', link: '/embed/reference/language-api' },
            { text: 'Language Specification 1.3.0', link: '/embed/reference/language-specification-1.3.0' },
            { text: 'Render API', link: '/embed/reference/render-api' },
            { text: 'Viz API', link: '/embed/reference/viz-api' },
            { text: 'MCP server', link: '/embed/reference/mcp-server' },
            { text: 'Tree-sitter grammar', link: '/embed/reference/tree-sitter' },
          ],
        },
      ],
      '/use/': [
        {
          text: 'Get started', items: [
            { text: 'Use Coral', link: '/use/' },
            { text: 'Get started', link: '/use/get-started' },
            { text: 'Install or use the web app', link: '/use/how-to/install-or-use-the-web-app' },
            { text: 'Start from an example', link: '/use/how-to/start-from-an-example' },
          ],
        },
        {
          text: 'Build diagrams', items: [
            { text: 'Place and edit objects', link: '/use/how-to/place-and-edit-objects' },
            { text: 'Import icons', link: '/use/how-to/import-icons' },
            { text: 'Connect and route objects', link: '/use/how-to/connect-and-route-objects' },
            { text: 'Lay out and reflow', link: '/use/how-to/lay-out-and-reflow' },
          ],
        },
        {
          text: 'Bring in other formats', items: [
            { text: 'Convert from Mermaid', link: '/use/how-to/convert-from-mermaid' },
            { text: 'Conversion support', link: '/use/reference/conversion-support' },
            { text: 'Conversion loss', link: '/use/explain/conversion-loss' },
          ],
        },
        {
          text: 'Share and export', items: [
            { text: 'Save, open, and recover', link: '/use/how-to/save-open-and-recover' },
            { text: 'Export a diagram', link: '/use/how-to/export-a-diagram' },
            { text: 'File and export formats', link: '/use/reference/file-and-export-formats' },
          ],
        },
        {
          text: 'AI and voice', items: [
            { text: 'Edit with the on-device model', link: '/use/how-to/edit-with-the-on-device-model' },
            { text: 'On-device editing model', link: '/use/explain/on-device-editing-model' },
            { text: 'AI availability', link: '/use/how-to/generate-with-ai' },
            { text: 'Voice availability', link: '/use/how-to/use-voice-input' },
            { text: 'Privacy and storage', link: '/use/explain/privacy-and-storage' },
          ],
        },
        {
          text: 'Browse notations', items: [
            { text: 'Notation libraries', link: '/use/reference/notations' },
            { text: 'Capability matrix', link: '/use/reference/capabilities' },
            { text: 'Shape primitives', link: '/use/reference/shape-primitives' },
            { text: 'Coral DSL', link: '/use/reference/coral-dsl' },
          ],
        },
        {
          text: 'Look things up', items: [
            { text: 'Interface regions', link: '/use/reference/interface-regions' },
            { text: 'Keyboard shortcuts', link: '/use/reference/keyboard-shortcuts' },
            { text: 'Preferences', link: '/use/reference/preferences' },
            { text: 'Browser support', link: '/use/reference/browser-support' },
            { text: 'Troubleshooting', link: '/use/reference/troubleshooting' },
          ],
        },
        {
          text: 'Understand Coral', items: [
            { text: 'Why Coral', link: '/use/explain/why-coral' },
            { text: 'Connection rules', link: '/use/explain/connection-rules' },
            { text: 'History and undo', link: '/use/explain/history-and-undo' },
            { text: 'Accessibility status', link: '/use/explain/accessibility-status' },
          ],
        },
      ],
    },
  },
});
