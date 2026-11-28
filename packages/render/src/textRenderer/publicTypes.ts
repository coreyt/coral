export type TextProfile = 'document' | 'comment';
export type TextCharset = 'ascii' | 'utf8-box' | 'monotrue-v1';
export type TextPagePreset = 'letter' | 'a4';
export type TextDensity = 'compact' | 'standard';
export type TextCommentStyle = 'none' | 'slash' | 'hash' | 'dash' | 'block-c' | 'html';
export interface MonoTrueCapability {
  profile: 'monotrue-v1';
  selected: true;
  face: 'Regular' | 'Bold' | 'Italic' | 'BoldItalic';
  fontSha256: string;
  validatedRoles: readonly string[];
}

export interface RenderTextOptions {
  profile?: TextProfile;
  charset?: TextCharset;
  page?: TextPagePreset;
  columns?: number;
  pageWidth?: number;
  pageHeight?: number;
  density?: TextDensity;
  commentStyle?: TextCommentStyle;
  commentPrefix?: string;
  header?: boolean;
  legend?: 'auto' | 'always' | 'none';
  eol?: 'lf' | 'crlf';
  strict?: boolean;
  monoTrue?: MonoTrueCapability;
}

export interface TextDiagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  path?: string;
}

export interface ContinuationLink {
  key: string;
  fromPage: number;
  toPage: number;
  edgeId: string;
}

export interface RenderTextResult {
  text: string;
  pages: readonly string[];
  profile: TextProfile;
  charset: TextCharset;
  /** Maximum occupied columns (including wrapper) and rows on any page. */
  width: number;
  height: number;
  pageCount: number;
  continuationLinks: readonly ContinuationLink[];
  diagnostics: readonly TextDiagnostic[];
}
