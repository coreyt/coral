import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = resolve(import.meta.dirname, '..');
const allowedContainers = new Set(['code-group', 'danger', 'details', 'info', 'tip', 'warning']);

// Mechanical transclusion is limited to these canonical language references.
// Other comments/includes remain prohibited on public Markdown surfaces.
const canonicalIncludes = new Map([
  ['docs/embed/reference/language-specification-1.3.0.md', {
    directive: '<!-- @include: ../../../packages/language/SPEC.md{3,} -->',
    target: '../../../packages/language/SPEC.md', startLine: 3,
  }],
  ['docs/contribute/reference/language-evolution.md', {
    directive: '<!-- @include: ../../../dev/designs/language-design-and-evolution.md#policy -->',
    target: '../../../dev/designs/language-design-and-evolution.md', region: 'policy',
  }],
]);

const diagnostic = (file, line, message) => `${file}:${line}: ${message}`;

function isEscaped(value, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor--) slashes++;
  return slashes % 2 === 1;
}

function markdownUnescape(value) {
  return value.replace(/\\([!"#$%&'()*+,./:;<=>?@[\]\\^_`{|}~-])/g, '$1');
}

function headingSlug(value) {
  return value
    .replace(/\s+\{#[^}]+\}\s*$/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function targetParts(raw) {
  const target = raw.trim();
  const hash = target.indexOf('#');
  return {
    path: hash === -1 ? target : target.slice(0, hash),
    fragment: hash === -1 ? '' : target.slice(hash + 1),
  };
}

function withoutInlineCode(source) {
  const masked = source.split('');
  const eligible = new Array(source.length).fill(true);
  let offset = 0;
  let fence;
  for (const line of source.split('\n')) {
    const match = /^ {0,3}(`{3,})(.*)$/.exec(line);
    if (fence || match) {
      eligible.fill(false, offset, offset + line.length);
      if (!fence) fence = match[1].length;
      else if (match && match[1].length >= fence && match[2].trim() === '') fence = undefined;
    }
    offset += line.length + 1;
  }

  for (let index = 0; index < source.length;) {
    if (!eligible[index] || source[index] !== '`' || isEscaped(source, index)) {
      index++;
      continue;
    }
    let width = 1;
    while (eligible[index + width] && source[index + width] === '`') width++;
    let close = index + width;
    let crossedFence = false;
    while (close < source.length) {
      if (!eligible[close] && source[close] !== '\n') crossedFence = true;
      if (crossedFence) break;
      if (eligible[close] && !isEscaped(source, close)
          && source.startsWith('`'.repeat(width), close)
          && source[close - 1] !== '`' && source[close + width] !== '`') break;
      close++;
    }
    if (crossedFence || close >= source.length) {
      index += width;
      continue;
    }
    for (let cursor = index; cursor < close + width; cursor++) {
      if (masked[cursor] !== '\n') masked[cursor] = ' ';
    }
    index = close + width;
  }
  return masked.join('');
}

function inlineLinkDestinations(line) {
  const destinations = [];
  for (let index = 0; index < line.length - 1; index++) {
    if (line[index] !== '[' || isEscaped(line, index)) continue;
    let labelDepth = 0;
    let labelClose = -1;
    for (let cursor = index + 1; cursor < line.length; cursor++) {
      if (isEscaped(line, cursor)) continue;
      if (line[cursor] === '[') labelDepth++;
      else if (line[cursor] === ']' && labelDepth > 0) labelDepth--;
      else if (line[cursor] === ']') {
        labelClose = cursor;
        break;
      }
    }
    if (labelClose === -1 || line[labelClose + 1] !== '(') continue;
    const start = labelClose + 2;
    let cursor = start;
    let raw;

    if (line[cursor] === '<') {
      cursor++;
      while (cursor < line.length && (line[cursor] !== '>' || isEscaped(line, cursor))) cursor++;
      if (cursor >= line.length) continue;
      raw = line.slice(start + 1, cursor);
      cursor++;
      const titleGap = cursor;
      while (/\s/.test(line[cursor] ?? '')) cursor++;
      if (cursor > titleGap && (line[cursor] === '"' || line[cursor] === "'")) {
        const quote = line[cursor++];
        while (cursor < line.length && (line[cursor] !== quote || isEscaped(line, cursor))) cursor++;
        if (cursor >= line.length) continue;
        cursor++;
        while (/\s/.test(line[cursor] ?? '')) cursor++;
      }
      if (line[cursor] !== ')') continue;
    } else {
      let depth = 0;
      let complete = false;
      for (; cursor < line.length; cursor++) {
        const character = line[cursor];
        if (/\s/.test(character)) {
          if (depth > 0) break;
          const destinationEnd = cursor;
          while (/\s/.test(line[cursor] ?? '')) cursor++;
          if (line[cursor] !== '"' && line[cursor] !== "'") break;
          const quote = line[cursor++];
          while (cursor < line.length && (line[cursor] !== quote || isEscaped(line, cursor))) cursor++;
          if (cursor >= line.length) break;
          cursor++;
          while (/\s/.test(line[cursor] ?? '')) cursor++;
          if (line[cursor] !== ')') break;
          raw = line.slice(start, destinationEnd);
          complete = true;
          break;
        }
        if (isEscaped(line, cursor)) continue;
        if (character === '(') depth++;
        else if (character === ')' && depth > 0) depth--;
        else if (character === ')') {
          raw = line.slice(start, cursor);
          complete = true;
          break;
        }
      }
      if (!complete) continue;
    }
    destinations.push(raw);
    index = cursor;
  }
  return destinations;
}

function analyze(file, source, strict) {
  const failures = [];
  const anchors = new Map();
  const links = [];
  const containers = [];
  const lines = source.split('\n');
  const proseLines = withoutInlineCode(source).split('\n');
  let fence;
  let frontmatter = lines[0]?.trim() === '---';

  if (strict && source.endsWith('\n\n')) {
    failures.push(diagnostic(file, lines.length - 1, 'multiple trailing newlines are prohibited'));
  }

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (frontmatter) {
      if (lineNumber > 1 && line.trim() === '---') frontmatter = false;
      continue;
    }

    const fenceMatch = /^ {0,3}(`{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1].length;
      else if (fenceMatch[1].length >= fence && fenceMatch[2].trim() === '') fence = undefined;
      continue;
    }
    if (fence) continue;

    const prose = proseLines[index];

    if (strict && /\[\[toc\]\]/i.test(prose)) {
      failures.push(diagnostic(file, lineNumber, '[[toc]] is prohibited'));
    }
    if (strict && /<!--/.test(prose)) {
      const include = canonicalIncludes.get(file);
      if (include && line === include.directive) {
        links.push({ line: lineNumber, raw: include.target,
          includeRegion: include.region, includeStartLine: include.startLine });
      } else failures.push(diagnostic(file, lineNumber, 'HTML comments are prohibited'));
    }
    if (strict && /^\s*0[.)]\s+/.test(prose)) {
      failures.push(diagnostic(file, lineNumber, 'zero-based ordered lists are prohibited'));
    }

    const container = /^ {0,3}(:{3,})\s*(.*)$/.exec(prose);
    if (strict && container) {
      const markerWidth = container[1].length;
      const declaration = container[2].trim();
      if (!declaration) {
        const open = containers.at(-1);
        if (!open || markerWidth < open.markerWidth) {
          failures.push(diagnostic(file, lineNumber, 'container close has no matching open'));
        } else {
          containers.pop();
        }
      } else {
        const type = declaration.split(/\s+/, 1)[0];
        const parent = containers.at(-1);
        if (parent && markerWidth >= parent.markerWidth) {
          failures.push(diagnostic(
            file,
            lineNumber,
            'nested container marker must be shorter than its outer marker',
          ));
        }
        if (!allowedContainers.has(type)) {
          failures.push(diagnostic(file, lineNumber, `container type "${type}" is not allowed`));
        }
        containers.push({ line: lineNumber, markerWidth, type });
      }
      continue;
    }

    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const custom = /\s+\{#([^}]+)\}\s*$/.exec(heading[1]);
      let anchor = custom?.[1] ?? headingSlug(heading[1]);
      if (strict && custom && !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(anchor)) {
        failures.push(diagnostic(
          file,
          lineNumber,
          `custom heading anchor "${anchor}" must be unique and lowercase`,
        ));
      }
      if (strict && custom && anchors.has(anchor)) {
        failures.push(diagnostic(
          file,
          lineNumber,
          `heading anchor "${anchor}" duplicates line ${anchors.get(anchor)}`,
        ));
      } else if (custom) {
        anchors.set(anchor, lineNumber);
      } else {
        const base = anchor;
        let suffix = 0;
        while (anchors.has(anchor)) anchor = `${base}-${++suffix}`;
        anchors.set(anchor, lineNumber);
      }
    }

    for (const raw of inlineLinkDestinations(prose)) {
      links.push({ line: lineNumber, raw });
    }
  }

  for (const open of containers) {
    failures.push(diagnostic(file, open.line, `container type "${open.type}" is not closed`));
  }
  return { anchors, failures, links };
}

export function validateMarkdownSources(sources, {
  existingPaths = new Set(sources.keys()),
} = {}) {
  const analyses = new Map();
  const failures = [];
  for (const [file, source] of sources) {
    const result = analyze(file, source, file.startsWith('docs/'));
    analyses.set(file, result);
    failures.push(...result.failures);
  }

  for (const [file, result] of analyses) {
    for (const link of result.links) {
      const destination = markdownUnescape(link.raw);
      const { path: encodedPath, fragment: encodedFragment } = targetParts(destination);
      if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(encodedPath)
          || encodedPath.startsWith('//')) continue;
      let linkPath;
      let fragment;
      try {
        linkPath = decodeURIComponent(encodedPath);
        fragment = decodeURIComponent(encodedFragment);
      } catch {
        failures.push(diagnostic(file, link.line, `link is not valid URL encoding: ${link.raw}`));
        continue;
      }
      const strict = file.startsWith('docs/');
      if (strict && linkPath.startsWith('/')) {
        failures.push(diagnostic(file, link.line, `root-absolute link is prohibited: ${link.raw}`));
        continue;
      }

      const target = linkPath
        ? posix.normalize(posix.join(posix.dirname(file), linkPath.split('?', 1)[0]))
        : file;
      if (target === '..' || target.startsWith('../')) {
        failures.push(diagnostic(file, link.line, `link escapes the repository: ${link.raw}`));
        continue;
      }
      const targetExists = existingPaths.has(target)
        || [...existingPaths].some((path) => path.startsWith(`${target.replace(/\/$/, '')}/`));
      if (linkPath && !targetExists) {
        if (strict && !posix.extname(target) && existingPaths.has(`${target}.md`)) {
          failures.push(diagnostic(file, link.line, `Markdown link must retain .md: ${link.raw}`));
        } else {
          failures.push(diagnostic(file, link.line, `link target does not exist: ${link.raw}`));
        }
        continue;
      }
      if (link.includeStartLine && (sources.get(target)?.split(/\r?\n/).length ?? 0) < link.includeStartLine) {
        failures.push(diagnostic(file, link.line, `include range does not exist: ${link.raw}`));
      }
      if (link.includeRegion) {
        const owner = sources.get(target) ?? '';
        const start = owner.indexOf(`<!-- #region ${link.includeRegion} -->`);
        const end = owner.indexOf(`<!-- #endregion ${link.includeRegion} -->`);
        if (start < 0 || end <= start) failures.push(diagnostic(file, link.line, `include region does not exist: ${link.includeRegion}`));
      }
      if (strict && fragment && target !== file && target.endsWith('.md')) {
        const targetAnalysis = analyses.get(target);
        if (!targetAnalysis?.anchors.has(fragment)) {
          failures.push(diagnostic(file, link.line, `cross-file anchor does not exist: ${link.raw}`));
        }
      }
    }
  }
  return failures.sort();
}

export function listRepositoryPaths(root, spawn = spawnSync) {
  // Include authored but unstaged files so links can be verified before a
  // commit. Git's standard excludes still keep generated local state out.
  const listed = spawn('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    // Versioned experimental corpora can exceed the default 1 MiB inventory.
    maxBuffer: 16 * 1024 * 1024,
  });
  if (listed.error) throw listed.error;
  if (listed.status !== 0) throw new Error(listed.stderr);
  return new Set(listed.stdout.trim().split('\n').filter(Boolean));
}

export async function validateRepository(root = repositoryRoot,
  existingPaths = listRepositoryPaths(root)) {
  const markdown = [...existingPaths]
    .filter((path) => path.endsWith('.md') && !path.startsWith('dev/archive/'));
  const sources = new Map(await Promise.all(markdown.map(async (path) => [
    path,
    await readFile(resolve(root, path), 'utf8'),
  ])));
  return validateMarkdownSources(sources, { existingPaths });
}

async function main() {
  const failures = await validateRepository();
  if (failures.length) {
    console.error(['Markdown corpus validation failed:', ...failures].join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log('Current Markdown corpus links, anchors, containers, and prohibitions pass.');
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
