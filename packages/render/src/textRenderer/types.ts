export type * from './publicTypes.js';
import type { TextDiagnostic } from './publicTypes.js';

export class TextRenderError extends Error {
  readonly diagnostics: TextDiagnostic[];
  constructor(readonly code: string, message: string, readonly path?: string,
    readonly minimumColumns?: number) {
    super(message);
    this.name = 'TextRenderError';
    this.diagnostics = [{ code, severity: 'error', message, ...(path ? { path } : {}) }];
  }
}

export function unfit(path: string, minimumColumns: number, detail: string): never {
  throw new TextRenderError('text.width.unfit',
    `${path}: ${detail} (minimum ${minimumColumns} columns).`, path, minimumColumns);
}

export interface Frame { id: string; title: string }
export interface Band {
  id: string;
  rows: string[];
  frames: Frame[];
  notes: string[];
}
export interface TextEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  marker: string;
  reverse?: boolean;
}
export interface TextScene {
  title: string;
  bands: Band[];
  edges: TextEdge[];
  repeated: string[];
}
