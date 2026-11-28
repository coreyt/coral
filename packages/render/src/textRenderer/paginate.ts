import { key, wrap, type Settings } from './format.js';
import { TextRenderError, type Band, type ContinuationLink, type Frame, type TextEdge, type TextScene, unfit } from './types.js';

export function portal(link: ContinuationLink, exit: boolean) {
  const back = link.toPage < link.fromPage;
  return exit ? `[-> p.${link.toPage}:${link.key}${back ? ' ^' : ''}]` :
    `[${back ? 'v ' : ''}p.${link.fromPage}:${link.key} ->]`;
}

function linksFor(scene: TextScene, pages: Band[][]) {
  const pageOf = new Map(pages.flatMap((page, index) => page.map(b => [b.id, index + 1] as const)));
  const links = new Map<string, ContinuationLink>();
  for (const edge of scene.edges) {
    const fromPage = pageOf.get(edge.source)!, toPage = pageOf.get(edge.target)!;
    if (!fromPage || !toPage) throw new TextRenderError('text.edge.invalid', 'Unknown endpoint.', edge.id);
    if (fromPage !== toPage) links.set(edge.id, { key: key(links.size), edgeId: edge.id, fromPage, toPage });
  }
  return links;
}

function pageRows(scene: TextScene, cfg: Settings, pages: Band[][], index: number,
  links: Map<string, ContinuationLink>) {
  const page = pages[index], number = index + 1, g = cfg.glyph;
  const rows: string[] = [], footer: string[] = [];
  const before = pages[index - 1]?.at(-1)?.frames ?? [], after = pages[index + 1]?.[0]?.frames ?? [];
  const heads = new Map<string, string[]>(), tails = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, id: string, row: string) => {
    const entries = map.get(id) ?? [];
    entries.push(row); map.set(id, entries);
  };
  const indices = new Map(page.map((band, i) => [band.id, i]));
  // Orthogonal tracks run to the left of the node bands. Reuse a track
  // as soon as the previous route has ended.
  const routes: { edge: TextEdge; lane: number; lo: number; hi: number; endpoints: number[] }[] = [];
  for (const edge of scene.edges) {
    const start = indices.get(edge.source), end = indices.get(edge.target);
    if (start === undefined && end === undefined) continue;
    const link = links.get(edge.id);
    if (link) {
      const exit = start !== undefined;
      add(exit ? tails : heads, exit ? edge.source : edge.target, '  ' + portal(link, exit));
      const description = `${exit ? 'Cont' : 'From'}: [${link.key}] ${cfg.encode(edge.source)} -> ${cfg.encode(edge.target)} (p.${exit ? link.toPage : link.fromPage})${edge.label ? ' ' + edge.label : ''}`;
      footer.push(...wrap(description, cfg.width, edge.id));
    } else if (start !== undefined && end !== undefined) {
      if (end === start + 1 && page[start].frames.at(-1)?.id === page[end].frames.at(-1)?.id) {
        add(tails, edge.source, '  ' + (edge.marker || g.down) + (edge.label ? ' ' + edge.label : ''));
      } else {
        const lo = Math.min(start, end), hi = Math.max(start, end);
        let lane = 0;
        while (routes.some(r => r.lane === lane && lo <= r.hi && hi >= r.lo)) lane++;
        routes.push({ edge, lane, lo, hi, endpoints: [] });
      }
    }
  }
  if (cfg.header) {
    const counter = `Page ${number} of ${pages.length}`;
    if (scene.title.length + 2 + counter.length <= cfg.width) rows.push(scene.title.padEnd(cfg.width - counter.length) + counter);
    else rows.push(...wrap(scene.title, cfg.width, 'title'), counter);
  }
  rows.push(...scene.repeated);
  const laneWidth = routes.reduce((n, r) => Math.max(n, r.lane + 2), 0);
  let frames: Frame[] = [];
  const width = (depth: number) => cfg.width - laneWidth - depth * 4;
  function emit(value: string, band: number, edge?: TextEdge) {
    const lanes = Array<string>(laneWidth).fill(' ');
    if (edge) {
      const route = routes.find(r => r.edge === edge)!;
      route.endpoints.push(rows.length);
      lanes[route.lane] = '+';
      lanes.fill(g.h, route.lane + 1);
    }
    const space = width(frames.length);
    if (space < 1 || value.length > space) unfit(page[band]?.id ?? 'frame', cfg.width + value.length - space, 'band exceeds the available width');
    const wall = edge ? '+' + g.h : g.v + ' ';
    rows.push(lanes.join('') + wall.repeat(frames.length) + (frames.length ? value.padEnd(space) : value) +
      (' ' + g.v).repeat(frames.length));
  }
  function border(title: string, opening: boolean, i: number) {
    const available = width(frames.length) - 2;
    const lines = wrap(title, available - 2, page[i].id);
    for (const value of lines) {
      const content = value ? ` ${value} ` : '';
      emit((opening ? g.tl : g.bl) + content.padEnd(available, g.h) + (opening ? g.tr : g.br), i);
    }
  }
  function close(keep: number, i: number, next: Frame[]) {
    while (frames.length > keep) {
      const frame = frames.pop()!;
      border(next.some(f => f.id === frame.id) ? `(cont. p.${number + 1}: ${frame.title})` : '', false, i);
    }
  }
  for (const [i, band] of page.entries()) {
    let common = 0;
    while (common < frames.length && frames[common].id === band.frames[common]?.id) common++;
    close(common, i, []);
    for (const frame of band.frames.slice(common)) {
      border(frame.title + (i === 0 && before.some(f => f.id === frame.id) ? ` (cont. from p.${index})` : ''), true, i);
      frames.push(frame);
    }
    for (const line of heads.get(band.id) ?? []) emit(line, i);
    for (const route of routes.filter(r => r.edge.target === band.id)) emit(g.h + g.h + (route.edge.marker || g.down), i, route.edge);
    for (const row of band.rows) emit(row, i);
    for (const route of routes.filter(r => r.edge.source === band.id)) {
      const label = g.h + g.h + '+' + (route.edge.label ? ' ' + route.edge.label : '');
      wrap(label, width(frames.length), route.edge.id).forEach((line, n) => emit(line, i, n === 0 ? route.edge : undefined));
    }
    for (const row of tails.get(band.id) ?? []) {
      for (const line of wrap(row, width(frames.length), band.id)) emit(line, i);
    }
    footer.push(...band.notes);
  }
  close(0, page.length - 1, after);
  for (const route of routes) {
    const [a, b] = route.endpoints;
    for (let y = Math.min(a, b) + 1; y < Math.max(a, b); y++) {
      const ch = rows[y][route.lane] === ' ' ? g.v : '+';
      rows[y] = rows[y].slice(0, route.lane) + ch + rows[y].slice(route.lane + 1);
    }
  }
  rows.push(...footer);
  const body = rows.map(row => cfg.neutralize(cfg.prefix + row, true).trimEnd());
  if (cfg.style === 'html') return ['<!--', ...body, '-->'];
  if (cfg.style === 'block-c') return ['/*', ...body, ' */'];
  return body;
}

/** Cuts move only earlier. Re-measure actual frames, keys and footers after
 * every cut, including any increase in the number of page-number digits. */
export function paginate(scene: TextScene, cfg: Settings) {
  const pages: Band[][] = [[]];
  let roughHeight = scene.repeated.length + Number(cfg.header);
  for (const band of scene.bands) {
    if (pages.at(-1)!.length && roughHeight + band.rows.length > cfg.height) {
      pages.push([]); roughHeight = scene.repeated.length + Number(cfg.header);
    }
    pages.at(-1)!.push(band);
    roughHeight += band.rows.length + band.notes.length;
  }
  for (;;) {
    const links = linksFor(scene, pages);
    const rows: string[][] = [];
    let cut = false;
    for (const [i, page] of pages.entries()) {
      let rendered: string[] | undefined;
      try { rendered = pageRows(scene, cfg, pages, i, links); }
      catch (error) {
        // Cutting a page can free route columns as well as rows.
        if (!(error instanceof TextRenderError) || error.code !== 'text.width.unfit' || page.length < 2) throw error;
      }
      if (rendered && rendered.length <= cfg.height) { rows.push(rendered); continue; }
      if (page.length === 1 && page[0].notes.length) {
        // Keep the node intact and flow its keyed definitions into the
        // document legend when they cannot share even a freshly opened page.
        const owner = page[0];
        const legend = owner.notes.map((row, n) => ({ id: '\0' + owner.id + ':' + n, rows: [row], notes: [], frames: [] }));
        page[0] = { ...owner, notes: [] };
        pages.push(legend);
        cut = true;
        break;
      }
      if (page.length < 2) unfit(page[0]?.id ?? 'header', cfg.columns, `atomic band and footer require ${rendered?.length} rows`);
      (pages[i + 1] ??= []).unshift(page.pop()!);
      cut = true;
      break;
    }
    if (!cut) return { rows, links: [...links.values()] };
  }
}
