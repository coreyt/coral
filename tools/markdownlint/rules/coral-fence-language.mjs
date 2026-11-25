/** @type {import("markdownlint").Rule} */
export default {
  names: ['coral-fence-language'],
  description: 'VitePress fences must use an approved language',
  tags: ['code', 'language'],
  parser: 'none',
  function: (params, onError) => {
    if (!Array.isArray(params.config.allowed_languages)
        || params.config.allowed_languages.length === 0
        || params.config.allowed_languages.some(value => typeof value !== 'string' || !value)) {
      throw new Error('coral-fence-language requires allowed_languages configuration');
    }
    const allowed = new Set(params.config.allowed_languages);
    let fence;
    for (const [index, line] of params.lines.entries()) {
      const match = /^ {0,3}(`{3,})(.*)$/.exec(line);
      if (!match) continue;
      if (fence) {
        if (match[1].length >= fence && match[2].trim() === '') fence = undefined;
        continue;
      }
      fence = match[1].length;
      const info = match[2].trim();
      const language = info.split(/[\s{:]/, 1)[0];
      if (info && (!language || !allowed.has(language))) {
        onError({
          lineNumber: index + 1,
          detail: language
            ? `Fence language "${language}" is not allowed`
            : 'Fence metadata requires an approved language',
          context: line,
        });
      }
    }
  },
};
