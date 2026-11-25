import { describe, expect, it } from 'vitest';
import { CORAL_SURFACE_CSS_029, renderHtml } from '../src/html/serialize.js';
import { splitFontFaceCss029 } from '../src/text/fonts.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';

// C4 HTML export boundary (c4-design.md "HTML export"): the drawing sits in a
// declarative shadow root; @font-face and print rules stay in the page.

const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"',
  '  size 60 x 40', '  label center', '  outline ellipse', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'g service [symbol: "local.probe"] as "Gate"', 'b service as "B"', 'g -> b', ''].join('\n');

async function html(text = SOURCE) {
  const graph = projectInstalledSourceToSuccessor028(text).graph!;
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
  const laidOut = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
  return renderHtml(laidOut, { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT', semanticGraph: display,
    successorSource: graph, title: 'Probe' });
}

describe('HTML export boundary', () => {
  it('draws inside one declarative shadow root with the svg sizing rule', async () => {
    const page = await html();
    expect(page.match(/<template shadowrootmode="open">/g)).toHaveLength(1);
    const template = page.slice(page.indexOf('<template'), page.indexOf('</template>'));
    expect(template).toContain(`<style>${CORAL_SURFACE_CSS_029}svg{max-width:100%;height:auto}</style>`);
    expect(template).toContain('<svg ');
    expect(template).toContain('coral-sym-probe');
    expect(page.indexOf('<svg ')).toBeGreaterThan(page.indexOf('<template'));
  });

  it('keeps every @font-face rule and the print block in the page style', async () => {
    const page = await html();
    const head = page.slice(0, page.indexOf('</head>'));
    const template = page.slice(page.indexOf('<template'), page.indexOf('</template>'));
    expect(template).not.toContain('@font-face');
    expect(head).toContain('@font-face');
    expect(head).toContain('@media print');
    expect(head).toContain('@page');
    // The shaping rule stays with the SVG text it applies to.
    expect(template).toContain(':where(.coral-font-text)');
  });

  it('splits generated font CSS exactly', () => {
    const css = "@font-face{font-family:'A';src:url('data:font/woff2;base64,AAAA') format('woff2')}" +
      "@font-face{font-family:'B';src:url('data:x')}:where(.coral-font-text){font-kerning:none}";
    expect(splitFontFaceCss029(css)).toEqual({
      faces: "@font-face{font-family:'A';src:url('data:font/woff2;base64,AAAA') format('woff2')}@font-face{font-family:'B';src:url('data:x')}",
      rest: ':where(.coral-font-text){font-kerning:none}',
    });
  });

  it('applies to a document without user symbols too', async () => {
    const page = await html(['@diagram architecture', 'a service', 'b service', 'a -> b', ''].join('\n'));
    expect(page.match(/<template shadowrootmode="open">/g)).toHaveLength(1);
  });
});
