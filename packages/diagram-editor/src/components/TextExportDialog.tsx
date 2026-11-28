import { useEffect, useMemo, useState } from 'react';
import { renderText, type RenderTextOptions, type RenderTextResult, type TextCommentStyle,
  type TextPagePreset, type TextProfile } from '@coral-viz/render';
import { CoralDialog } from '../ui/CoralDialog';

interface Props {
  source: string;
  profile: TextProfile;
  themeName: 'light' | 'dark';
  onClose: () => void;
  onDownload: (blob: Blob, extension: string) => void;
}

export function TextExportDialog({ source, profile, themeName, onClose, onDownload }: Props) {
  const comment = profile === 'comment';
  const [page, setPage] = useState<TextPagePreset>('letter');
  const [columns, setColumns] = useState(80);
  const [commentStyle, setStyle] = useState<TextCommentStyle>('slash');
  const [charset, setCharset] = useState<'ascii' | 'utf8-box'>('utf8-box');
  const [copyStatus, setCopyStatus] = useState('');
  const request = useMemo(() => ({ source, options: (comment
    ? { profile, columns, commentStyle, charset } : { profile, page }) satisfies RenderTextOptions }),
    [source, profile, comment, columns, commentStyle, charset, page]);
  const [preview, setPreview] = useState<{ request: typeof request; result?: RenderTextResult; error?: string }>();
  useEffect(() => {
    let current = true;
    setCopyStatus('');
    void renderText(request.source, request.options).then(
      result => { if (current) setPreview({ request, result }); },
      error => { if (current) setPreview({ request, error: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { current = false; };
  }, [request]);
  const active = preview?.request === request ? preview : undefined;
  const result = active?.result;
  async function deliver() {
    if (!result) return;
    if (!comment) { onDownload(new Blob([result.text], { type: 'text/plain;charset=utf-8' }), 'txt'); return; }
    try { await navigator.clipboard.writeText(result.text); setCopyStatus('Copied'); }
    catch { setCopyStatus('Clipboard unavailable. Select and copy the preview.'); }
  }
  return <CoralDialog open title={comment ? 'Copy as Code Comment' : 'Export Plain Text (.txt)'}
    closeLabel="Close text preview" initialFocus="first" themeName={themeName} onClose={onClose}>
    {comment ? <>
      <label>Comment syntax <select value={commentStyle} onChange={e => setStyle(e.target.value as TextCommentStyle)}>
        {['none', 'slash', 'hash', 'dash', 'block-c', 'html'].map(s => <option key={s}>{s}</option>)}
      </select></label>{' '}
      <label>Columns <select value={columns} onChange={e => setColumns(Number(e.target.value))}>
        {[72, 80, 100].map(n => <option key={n}>{n}</option>)}
      </select></label>{' '}
      <label>Character set <select value={charset} onChange={e => setCharset(e.target.value as typeof charset)}>
        <option>utf8-box</option><option>ascii</option>
      </select></label>
    </> : <label>Page size <select value={page} onChange={e => setPage(e.target.value as TextPagePreset)}>
      <option value="letter">US Letter</option><option value="a4">A4</option>
    </select></label>}
    <p role="status">{active?.error ?? (result ? comment ? `${result.width} columns · ${result.height} lines` :
      `${result.pageCount} page${result.pageCount === 1 ? '' : 's'}` : 'Rendering…')}</p>
    {result?.pages.map((body, i) => <pre key={i} aria-label={`Page ${i + 1}`} style={{ overflowX: 'auto' }}>{body}</pre>)}
    {result?.diagnostics.map((d, i) => <p key={i}>{d.message}</p>)}
    <button type="button" className="coral-button" disabled={!result} onClick={() => void deliver()}>
      {comment ? 'Copy comment' : 'Download .txt'}
    </button>
    <span role="status">{copyStatus}</span>
  </CoralDialog>;
}
