export type EditorRevisionToken = Readonly<{
  request: number;
  edit: number;
  layout: number;
}>;

export type LayoutOwner = 'loading' | 'reflow';

export interface InvalidateOptions {
  abortGeneration?: boolean;
}

export type PublicationStatus = 'pending' | 'current' | 'blocked';

export type PublicationEnvelope = Readonly<{
  sourceRevision: number;
  displayRevision: number;
  status: PublicationStatus;
  diagnostic?: string;
}>;

/** Monotonic authority for parse/layout/LLM work owned by the editor shell. */
export class EditorRevision {
  private edit = 0;
  private llm = 0;
  private layout = 0;
  private request = 0;
  private owners: Record<LayoutOwner, number> = { loading: 0, reflow: 0 };
  private publication: PublicationEnvelope = {
    sourceRevision: 0,
    displayRevision: 0,
    status: 'current',
  };
  // Highest source revision ever issued. Restoring an earlier envelope must
  // not let a later claim re-issue a revision a late owner may still hold.
  private issuedSource = 0;

  constructor(private readonly abortGeneration: () => void) {}

  invalidateEdit(options: InvalidateOptions = {}): number {
    if (options.abortGeneration !== false) this.abortGeneration();
    this.edit += 1;
    this.llm += 1;
    this.layout += 1;
    this.owners.loading = 0;
    this.owners.reflow = 0;
    return this.edit;
  }

  invalidateLlm(options: InvalidateOptions = {}): number {
    if (options.abortGeneration !== false) this.abortGeneration();
    this.llm += 1;
    return this.llm;
  }

  currentLlm(): number {
    return this.llm;
  }

  /** Bumped by every edit intent, including every geometry edit, Undo and Redo. */
  currentEdit(): number {
    return this.edit;
  }

  beginSource(): PublicationEnvelope {
    this.issuedSource = Math.max(this.issuedSource, this.publication.sourceRevision) + 1;
    this.publication = {
      sourceRevision: this.issuedSource,
      displayRevision: this.publication.displayRevision,
      status: 'pending',
    };
    return this.publication;
  }

  currentSourceRevision(): number {
    return this.publication.sourceRevision;
  }

  publishSource(sourceRevision: number): boolean {
    if (sourceRevision !== this.publication.sourceRevision) return false;
    this.publication = {
      sourceRevision,
      displayRevision: sourceRevision,
      status: 'current',
    };
    return true;
  }

  blockSource(sourceRevision: number, diagnostic: string): boolean {
    if (sourceRevision !== this.publication.sourceRevision) return false;
    this.publication = {
      ...this.publication,
      status: 'blocked',
      diagnostic,
    };
    return true;
  }

  publicationEnvelope(): PublicationEnvelope {
    return { ...this.publication };
  }

  restorePublication(envelope: PublicationEnvelope): void {
    this.publication = { ...envelope };
  }

  currentExportDiagnostic(): string | null {
    if (this.publication.status === 'current'
      && this.publication.sourceRevision === this.publication.displayRevision) return null;
    return this.publication.diagnostic
      ?? 'Export is unavailable until the current source has rendered successfully.';
  }

  beginLayout(owner: LayoutOwner): EditorRevisionToken {
    const token = { request: ++this.request, edit: this.edit, layout: ++this.layout };
    this.owners[owner] = token.request;
    return token;
  }

  /** Retire all layout tokens without changing edit or generation ownership. */
  invalidateLayouts(): void {
    this.layout += 1;
    this.owners.loading = 0;
    this.owners.reflow = 0;
  }

  isCurrent(token: EditorRevisionToken): boolean {
    return token.edit === this.edit && token.layout === this.layout;
  }

  finish(owner: LayoutOwner, token: EditorRevisionToken): boolean {
    if (this.owners[owner] !== token.request) return false;
    this.owners[owner] = 0;
    return true;
  }
}
